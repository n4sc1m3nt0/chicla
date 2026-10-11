# AUDIT-1 — end of M2 (rounds 7 to 12, cards C2.1 to C2.5)

Date: 2026-10-08 · Code audited: v0.0.15 (round 12) · Node 22.22.2, Linux, root unless stated.
Method (status file, item 2): promised (ROADMAP §5 "Extração") against what exists; probes by hand; a mutation pass ("break each guarantee on purpose"); the M2 suites again as a non-root user.

## 1. Promised vs. what exists

| Promise (§5) | State |
| --- | --- |
| Validates everything before writing: unsafe names, duplicates, file/folder, byte and entry limits | Done; every check has a test that goes red without it (V1 to V6). |
| Temp folder on the same volume, `rename` at the end, destination untouched on failure | Done for a new destination. For an existing one the merge is a plan (all conflicts found first) and then renames: only an OS error DURING those renames can leave it half-done (finding A-4). **Bug found and fixed: A-1.** |
| Never creates or crosses symlinks | Done (S1, S2 red). The `ensureDir` check (S3) is reachable only by a race. |
| Files created exclusively | Written (`wx`), but not observable on Linux (P3, P4 survive): the temp tree is fresh and duplicates are refused earlier. Only a normalising file system exercises it. |
| setuid/setgid removed | Done in code, **was not tested** (P1, P2 survived). Tests added. |
| Does not trust declared sizes | Done (A2, A3, A9 red). Empty-entry check in `extractZip` was untested (R1): test added. |
| Collisions reported, not blocking | **Differs** (finding A-3): on a case-insensitive or normalising file system a file/file collision is refused (`ECOLLISION`, nothing written); on Linux it is reported. |
| `legacyEncoding` | Reader only; `extractZip` does not accept it (finding A-5). |

## 2. Real bugs

- **A-1 (fixed). Extraction into the root of a mounted volume failed with `EXDEV`.** The temp folder was made in the destination's parent first; when the destination is a mount point (USB drive, Docker volume) the parent is on another device and `rename` fails. Nothing was left behind, but extraction was impossible. Found with `/dev/shm` inside `/dev` (root). Fix: use the parent only when `stat.dev` matches, else the destination. Test: `extract-audit1.test.mjs`, mutant X1 red. Residual: a bind mount of the same file system keeps the same `dev` and still fails (A-6).
- **A-2 (fixed). Extraction failed under a umask that removes the owner's permissions** (e.g. `0o277`) for a non-root user: `mkdtemp` honours the umask, so the temp folder was unusable. Fix: `chmod 0o700` right after creating it. Found because `extract-fast.test.mjs` failed as non-root; the test itself also made its parent folder under that umask and only passed as root (test fixed). Verified: the test is red as non-root without the fix.

## 3. Mutation pass (34 mutants, details in §6)

Killed first time: V1 to V6, A1 to A3, A7, A8, A9, A10, A12, A13, A15, S1, S2, R2, C1, C2. Survived and now dealt with:

| Mutant | Why it survived | Action |
| --- | --- | --- |
| P1, P2, P6 (special bits kept) | no test | tests added, red now |
| R1 (empty entry declaring bytes accepted) | check in `extractZip` not exercised | test added, red now |
| X1 (EXDEV fix reverted) | new | red (only where a writable mount pair exists, see gaps) |
| P5 (folder mode left owner-unwritable) | root bypasses permissions | not a root-visible behaviour; non-root run in §4 |
| P3, P4 (not exclusive) | unreachable on Linux (see §1) | gate: G-C3 re-run on a Mac |
| S3 (`ensureDir` symlink) | race only | accepted; keep as defence in depth |
| A4 (small inflate unbounded) | outcome identical: the size check afterwards refuses it. Only memory differs (at most ~1000x of 256 KiB) | accepted; no robust test (memory is not measurable here) |
| A5 (stream overrun check) | outcome identical: `flush` refuses the same entry. Only the bytes written before refusing differ | accepted; same reason |
| A6, A14 (cleanup of a bad file; overwrite check in the temp tree) | equivalent: the temp folder is removed anyway / the file cannot pre-exist there | accepted; redundant code kept deliberately |

## 4. Non-root

All M2 suites run as uid 65534: 242 pass, 1 skipped (the mount test needs root), 0 fail, after A-2. Before: 1 fail. Still not covered as non-root: a read-only destination parent, an unwritable existing destination (the fuzz does not vary permissions).

## 5. Open items (scheduled in ROADMAP)

- A-3 · ECOLLISION vs "not blocking": resolved in round 14 as D16 (behaviour kept, §5 text corrected).
- A-4 · (resolved in round 43, C2.7: the renames already done are undone, `EPARTIAL` if the undo fails) Mid-merge rename failure leaves a partial result in an existing destination: card C2.7 (rollback of the renames already done, or an honest report of which moved).
- A-5 · `extractZip` ignored `legacyEncoding`: fixed in round 14 (C2.6).
- A-6 · (bind-mount half resolved in round 42, C2.8: the first EXDEV retries inside the destination; the stale-folder half stays decided against, D17) Bind mounts (same `dev`, still EXDEV) and a crash or `SIGKILL` leaving `.cairn-tmp-*` behind: card C2.8 (fall back to a temp folder inside the destination when the first rename reports EXDEV; sweeping stale temp folders was decided against, D17).
- A-7 · `ß` against `ss` is over-reported by `collisions`; unchecked on APFS/NTFS: needs the Mac (G-C3).
- A-8 · Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke`.

## 6. Mutants

Each is one exact string replacement in `zipkit.mjs`, then the whole `cairn-zip` suite; the runner lives outside the tree. A4 appears with the corrected target (the first pattern matched two places and was not applied). Last result per mutant:

| Mutant | Result |
| --- | --- |
| V1 unsafe names not refused | killed |
| V2 duplicates not refused | killed |
| V3 file-and-folder not refused | killed |
| V4 total byte limit ignored | killed |
| V5 entry limit ignored | killed |
| V6 unsupported method/encryption not refused | killed |
| A1 temp folder never removed | killed |
| A2 small file CRC unchecked | killed |
| A3 stream CRC unchecked | killed |
| A4 small inflate not bounded | SURVIVED |
| A5 stream size overrun unchecked | SURVIVED |
| A6 bad file not removed after failure (slow path) | SURVIVED |
| A7 existing destination merged without conflict plan | killed |
| A8 overwrite default true | killed |
| S1 symlink in destination followed (mergePlan) | killed |
| S2 symlink entry written as file | killed |
| S3 symlink in temp path not refused (ensureDir) | SURVIVED |
| P1 setuid/setgid/sticky kept (fast path) | killed |
| P2 setuid kept (slow path) | killed |
| P3 fast path not exclusive | SURVIVED |
| P4 slow path not exclusive | SURVIVED |
| P5 folder mode keeps owner-unwritable | SURVIVED |
| R1 declared-empty entry with data accepted (slow) | killed |
| R2 fs errors reach caller raw | killed |
| C1 collisions: fold only toLowerCase | killed |
| C2 collisions: parents not noted | killed |
| X1 EXDEV fix reverted (always next to the destination) | killed |
| P6 special bits kept on folders | killed |
| A9 small size mismatch unchecked | killed |
| A10 destination that is a file accepted | killed |
| A12 merge: file/folder clash unchecked | killed |
| A13 merge: existing file replaced without overwrite | killed |
| A14 slow path: existing file replaced without overwrite | SURVIVED |
| A15 stream: unsupported-before-dataStart check dropped | killed |
