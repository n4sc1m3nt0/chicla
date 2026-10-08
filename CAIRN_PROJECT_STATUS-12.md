# Cairn — Project Status

## Instructions (read this slice first; it is the single source of the process rules)

Owner: Rodrigo, who moves between Claude accounts. Nothing is remembered between sessions: the repo carries the memory (this file, `CHANGELOG.md`, the fingerprints). Product and working rules are in `CLAUDE.md`. On process, this block wins. **`/dump` and recovery mode (item 17) override everything below.**

1. **Cold start.** Read only this block, the `**Fingerprint:**` paragraph and the newest `**Last updated (round N):**` entry. One command:
   ```
   f=$(ls CAIRN_PROJECT_STATUS-*.md | sort -t- -k2 -n | tail -1); n=$(grep -n '^\*\*Current version:\*\*' $f | head -1 | cut -d: -f1); sed -n "1,$((n-1))p" $f; sed -n '/^\*\*Fingerprint:\*\*/,/^\*\*Last updated (round/p' $f
   ```
   Everything else on demand: `grep -n` a term, card ID or round and read that range. Do not open or re-read files the task does not touch.
2. **Short commands.** `next` = the task under "Next up". `r<N>` = that card or round from `ROADMAP.md`. `audit` = a gap audit, after each milestone (not each round): write `docs/audits/AUDIT-<n>.md` listing what was promised vs. what exists, real bugs, missing behaviour and untested paths; fix or schedule every item. `/dump`, `recovery mode` = item 17.
3. **Roadmap.** Read `ROADMAP.md` only for the task at hand: `grep -n` the card ID and read that range.
4. **Map.** `CLAUDE.md` rules · this file (process, state, gates) · `CHANGELOG.md` (recent rounds; fingerprint on line 1) · `CHANGELOG-archive-rounds-*.md` (older, verbatim) · `ROADMAP.md` · `FILES.manifest` (every project file) · `version.mjs` (app leg of the fingerprint) · `scripts/` (the workflow) · `docs/` (reference material; see `docs/README.md`) · `packages/cairn-zip`, `packages/cairn-kit`.
5. **Keep the docs true.** New work goes into the roadmap in its place, never done silently. Record finished items with a dated one-liner; never delete them. Keep "Current version" and "Last updated" current. Remind Rodrigo to keep the status file for the next account.
6. **History is never deleted.** When `CHANGELOG.md` passes ~20 rounds: `node scripts/archive-changelog.mjs --dry-run`, then for real, then `node scripts/bump-round.mjs --refresh`. Find old entries with `grep -n "^## Round 1b" CHANGELOG-archive-*.md`. Round labels are text (`1b`, `12`) and their order is the file's order, never numeric.
7. **Round consistency.** The round in the CHANGELOG and this file, the app version and the newest files must agree. If the docs describe code that is not in the tree: STOP, tell Rodrigo, and do not claim that round as shipped.
8. **Status file number.** `CAIRN_PROJECT_STATUS-N.md`, one running integer, bumped by 1 each time it is output; never reuse or skip a number, never output under the old one (an upload named `-7-2` becomes `-8`). It is independent of the app version. Exactly ONE lives in the root; `bump-round` renames N to N+1.
9. **App version (D13).** The single source is `"version"` in the root `package.json`. Bump it on EVERY output, even a one-line fix, and confirm with `grep -n '"version"' package.json`. A header comment or a filename proves nothing. The versions of `cairn-zip` and `cairn-kit` change only at their releases.
10. **Session-start check.** After item 1 run `node scripts/bump-round.mjs --verify`. If it fails, STOP and tell Rodrigo before anything else.
11. **Fingerprints, three-way.** `version.mjs` line 3, `CHANGELOG.md` line 1 and the `**Fingerprint:**` paragraph carry one triple: `seq`, `app_sha256_12` (SHA-256 of `version.mjs` from line 4) and `changelog_sha256_12` (SHA-256 of `CHANGELOG.md` from line 2). `--verify` runs all of these:
    - a. the app's `seq=` equals the status file number. If not, stop, give Rodrigo both numbers, never pick one silently;
    - b. the app hash matches the file (a mismatch means it was edited elsewhere: flag it);
    - c. the changelog hash matches in all three places (if the CHANGELOG was not provided, go on but do not assume it is unchanged);
    - d. only when a to c pass is the rest of this file current.
12. **Writing fingerprints.** Rewrite all three together, in the same turn, before presenting anything, even when the app leg did not change (a docs-only round still carries the new `seq` and changelog hash). `node scripts/bump-round.mjs` does it; never by hand.
13. **Closing kit**, at the end of every task, in this order: (1) `CHANGELOG.md` entry at the top, at most 12 lines: task, files, what was NOT run; (2) record the card as done in this file's Snapshot (`ROADMAP.md` is the plan, not a log); (3) "Last updated" gets at most two sentences; refresh Snapshot, "Next up" and Gates; (4) bump `"version"` in `package.json` and grep it; (5) `node scripts/bump-round.mjs` LAST: it renames the status file, rewrites the 3 fingerprints, regenerates `FILES.manifest` and verifies (`--dry-run` shows, `--refresh` keeps the number, `--note "x"` annotates; it refuses if the `seq=` values disagree or there is not exactly one status file); (6) the zip (item 14); (7) `present_files`; (8) one short paragraph. Run `node scripts/check-build.mjs` before (5), and `npm test` AFTER it (the fingerprint test is red between editing the CHANGELOG and running `bump-round`, by design); if a script changed, run `npm run smoke` too.
14. **Delivery.** One zip of the WHOLE tree, built ONLY by `node scripts/make-delivery-zip.mjs /mnt/user-data/outputs/cairn-roundN-YYYY-MM-DD.zip --against <each upload zip>` (N = the CHANGELOG round label, e.g. `1j`). In order, stopping at the first failure, it checks the manifest against the previous one (a lost file is caught before regeneration could hide it), runs `check-build`, regenerates `FILES.manifest`, zips exactly what the manifest lists and verifies the finished zip; a rejected zip is deleted. Never hand-roll a zip, never present one that did not pass, never ship a partial folder. `node_modules/` and `.env*` never enter (the exclusions live in `check-manifest.mjs`, mirrored in `verify-delivery-zip.mjs`; they still carry the `corpus/real-world` and `corpus/huge` rules inherited from the original project until C6.1). A deliberate deletion needs `--allow-removed <path>` and is named in the reply. Every delivery reply says: "copy the zip's contents over the project root; do not delete or replace any folder first." After zipping, `unzip -l` it against the upload.
15. **Files before explanation.** As soon as files are ready, write them and `present_files`; prose comes after. If a usage or context limit may cut the session (warnings, a long expensive session), do not wait: ship what exists now as a safety checkpoint and say so.
16. **One task per session**: the one Rodrigo names, else "Next up". One concern only; at most 3 source files created or edited and ~200 changed lines (tests, the manifest and docs do not count). If it grows, STOP at the nearest seam, deliver what builds with nothing half-wired and open the rest as the next task. Never start a second task unless Rodrigo asks and the first is delivered.
17. **`/dump` and recovery mode.** `/dump` (also "dump", "emergência", "emergencia") is exactly three steps and nothing else: (1) `node scripts/emergency-dump.mjs "one-line note: task in progress and what is missing"` (zips the whole working directory with no guards; secrets, `.zip` and `node_modules/` stay out); (2) `present_files` the printed path; (3) one sentence: "Dump created: <n>. Send it to the next session with «recovery mode» and the last delivery zip." No guards, manifest, docs or explanation. If the script is missing: `cd /home/claude && zip -qr /mnt/user-data/outputs/cairn-EMERGENCY-$(date +%Y%m%d-%H%M%S).zip . -x '*/node_modules/*' '*/.git/*' '*.zip'`, then `present_files`. A dump is not a delivery: `verify-delivery-zip` rejects it.
    **Recovery mode** (a zip with `RECOVERY_MARKER.json`, or Rodrigo says so): read only `CLAUDE.md` and this block. `D=<dump.zip>; B=<last delivery zip>; R=$(unzip -Z1 "$D" | grep -m1 'scripts/recovery-report.mjs$'); unzip -p "$D" "$R" > /tmp/rr.mjs && node /tmp/rr.mjs "$D" --baseline "$B"` (omit `--baseline` if none). Read the note and `RECOVERY_DIFF.md`; work only in the recovered root it prints; finish only what the note says was in progress. Priority is to DELIVER (item 14, `--against` the baseline) with a CHANGELOG entry "recovered from emergency dump". Never use `--allow-removed` for files merely missing from the dump; do not start a new task; if the docs describe incomplete code, say so.
18. **Honesty.** Every reply and every CHANGELOG entry says what was NOT run: `npm test` on Node 18 and 20, `npm run smoke`, `check-build`, CI, macOS. Never claim a check you did not run; an unrun check becomes a gate. Never claim a round as shipped when its code is not in the tree. Never silently choose between two conflicting copies of a file: report both and ask. Name every deliberate deletion. Report what you notice outside the task; do not fix it silently.
19. **Gates** (`G-C<n> · …`, listed in `ROADMAP.md` §9) are human-only. The AI never marks one done; Rodrigo does, in the next status file.

**Current version:** v0.0.11 (round 8: C2.3 fast path and folder cache in; 2x budget still open).

**Fingerprint:** seq=12 · app=version.mjs ·
app_sha256_12=065d37032ef1 (of everything below the app file's own
fingerprint comment; unchanged at this seq — rewritten by `scripts/bump-round.mjs`) ·
changelog=CHANGELOG.md ·
changelog_sha256_12=c71dacc368b4 (hash of `CHANGELOG.md` below its own
fingerprint line; recomputed by `scripts/bump-round.mjs` at seq 12) · matches the
`STATUS_FILE_FINGERPRINT` comment on line 2–3 of the app file and the
`CHANGELOG_FINGERPRINT` comment on line 1 of `CHANGELOG.md`. If any of
these three don't match what you're looking at, stop and see
instructions item 11 above before doing anything else.

**Last updated (round 8):** 2026-10-08. C2.3 part 1: `extractZip` has a fast path for entries up to 256 KiB and a folder cache (`extract-fast.test.mjs`, `bench/small-files.mjs`); on tmpfs it is 2.1–2.8x `unzip` instead of ~15x, so the 2x budget is still open. Not run: Node 18 and 20, macOS for this code, CI.

## Snapshot

- Done: C0.1, C0.2, C0.3 (round 0, 2026-10-08). 8 workflow scripts and 5 smoke tests in `scripts/`; workflow files in the root (D14).
- Done: C1.1 (round 1, 2026-10-08). `packages/cairn-zip/src/zipkit.mjs` is the draft (single file for now; C1.2 onwards split it) with `test/read.test.mjs` and `test/zipfab.mjs`. Round 1a (2026-10-08): its comments and messages are now English; the scripts in `scripts/` still carry Portuguese messages (inherited, untouched).
- Done (part): C2.3 (round 8, 2026-10-08). Fast path (<= 256 KiB) and folder cache in `extractZip`; `test/extract-fast.test.mjs`; `packages/cairn-zip/bench/small-files.mjs`. B4 profiled: 2.1–2.8x `unzip` on tmpfs (was ~15x); the 2x budget is NOT met, so the card stays open.
- Done: C2.1, C2.2 (round 7, 2026-10-08). Atomic extraction and pre-validation in `extractZip`; `test/extract.test.mjs`. B2, B3, B6 closed.
- Done: windows-1252 own table (round 6, 2026-10-08), `decodeCp1252` in `zipkit.mjs`; fixes the red test found in round 5.
- Done: C1.5 (round 5, 2026-10-08). zip64 reading in `zipkit.mjs`, `test/zip64.test.mjs`, zip64 mode in `test/zipfab.mjs`. M1 closed.
- Done: C1.4 (round 4, 2026-10-08). `crc32` / `crc32Js` / `makeCrc32` / `crc32Source`, tests in `test/crc.test.mjs`.
- Done: C1.3 (round 3, 2026-10-08). `legacyEncoding` in `test/legacy-encoding.test.mjs`.
- Done: C1.2 (round 2, 2026-10-08). `openZip` handle with `entries`, `cdOff`, `read`, `close`; tests in `test/open.test.mjs`.
- Round 0a (2026-10-08): `docs/zipkit-plan-ronda-1s.md` and `docs/zipkit-RASCUNHO.mjs` added verbatim as reference; the draft is not wired in.
- `packages/cairn-zip` and `packages/cairn-kit` exist but have no code yet (`src/` and `test/` hold only `.gitkeep`).

## Next up

**C2.3 (rest):** reach the 2x budget. Check: `TMPDIR=/dev/shm node packages/cairn-zip/bench/small-files.mjs --budget 2` (tmpfs, because this machine's disk made `unzip` itself vary from 0.3 s to 6 s). What is left per file: the zlib handle `inflateRawSync` creates, GC, and about 8 syscalls (two reads, open, write, fstat, fchmod, futimes, close). Then C2.4 (escape oracle and extraction fuzz) and C2.5 (NFC/NFD and case collisions). Also pending: a plain zip with exactly 65535 entries and no zip64 record (now refused), `extractZip` not yet using `legacyEncoding`, and permission-based cases as a non-root user.

## Gates

| Gate | What | State |
| --- | --- | --- |
| G-C1 | Name; create the public GitHub repo; check the `cairn` command | open |
| G-C2 | Licence | open |
| G-C3 | Run on a real Mac | done (Rodrigo, 2026-10-08: macOS on Node 26, Linux on Node 18, 20 and 22, no problems; run on round-7 code, so round 8 has not been on a Mac yet) |
| G-C4 | Windows: warning only or its own milestone | open |
| G-C5, G-C6, G-C7 | See ROADMAP §9 | open |
