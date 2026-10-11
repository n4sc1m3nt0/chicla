<!-- CHANGELOG_FINGERPRINT: seq=67 file=CHICLA_PROJECT_STATUS-67.md app_sha256_12=065d37032ef1 changelog_sha256_12=a48c8af84127 (bump-round.mjs: app hash unchanged, changelog hash recomputed) -->
# Changelog

## Round 63 — C5.4: the small-files benchmark runs in CI with its budget (v0.0.66)

- Task: C5.4 (Rodrigo: "avança", Claude's suggestion). `.github/workflows/ci.yml` gains a separate `bench` job: Linux, Node 22, `TMPDIR=/dev/shm`, `node packages/chicla-zip/bench/small-files.mjs --runs 5 --budget 3` (D15: `extractZip` of 20 000 small files within 3x `unzip`). Separate so a slow runner never hides a test failure. Measured here (tmpfs, best of 3): 2.0x.
- Found and fixed in the bench: `--budget abc` (or a missing value) became `NaN`, which is falsy, so the gate turned itself off and exited 0. A flag with a missing, non-numeric or non-positive value now exits 2 with the usage line.
- Tests first (5 red before the code): `packages/chicla-zip/test/bench-small.test.mjs` (3: output line, exit 0 and 1 on budget, exit 2 on 8 bad arguments) and `test/ci.test.mjs` (4: the job, the budget, Linux and tmpfs only, one Node version). Hand mutants, all red: budget check off, positivity check off, budget 3 changed to 30 in the workflow.
- Files: `packages/chicla-zip/bench/small-files.mjs` and `ci.yml`; tests, docs.
- Not run: the new job on GitHub (nobody has pushed it; the first CI run is the real test, and the margin is thin: measured 2.0x here, 2.7 to 2.9x in round 10, budget 3x), Node 18 and 20, macOS, Windows, non-root. Run: `check-build`, `npm test`, `npm run smoke`.

## Round 62 — C5.3b, slice 7: the C5.1 reader mutants in the list; C5.3b closed (v0.0.65)

- Task: C5.3b, last slice (Rodrigo: "avança", Claude's suggestion). `mutants/list.mjs` gains 9 entries `C5.1-*`, the reader mutants broken by hand in round 41: no zlib wrap on a streamed entry, raw `readAt` error, raw inflate error in `read`, entry count, local signature, central entry bounds (all RED), and three explained survivors (data past end of file, central directory past end of file, local offset past end of file: `readAt` raises the same `ZipError`, so each check is a second line of defence).
- `C5.1-entry-count` needed `test/zip64.test.mjs` as well (the fuzz alone does not kill it: without the check `parseEntries` still refuses the zip, with another message).
- Whole list run as ONE run: 229 entries, all as listed (about 25 minutes). No source change of `zipkit.mjs`, no test change.
- Files: `packages/chicla-zip/mutants/list.mjs`, docs.
- Run: `check-build`, `npm test`, `npm run smoke`, the whole mutant list. Not run: Node 18 and 20, macOS, Windows, CI, non-root.

## Round 61 — C9.7: `verify-delivery-zip` re-checks the baseline (v0.0.64)

- Task: C9.7 (confirmed by Rodrigo, 2026-10-10; the gap found in round 60). `verify-delivery-zip` now requires `FILES.baseline.json` in the zip, parses it and checks it against the zip's own files (same list; size and sha256 of each, read as bytes from `unzip -p`, apart from the code that wrote it). Codes in the message: `EBASELINE_MISSING`, `_PARSE`, `_FORMAT`, `_SEAL`, `_MISMATCH`; the zip is refused (exit 1), and `make-delivery-zip` deletes it as for any failed check.
- Tests first (5 red before the code): `scripts/smoke-test-delivery-guards.mjs` section 0c (a file edited after the baseline, an extra file, a cut baseline, an edited seal, no baseline); hand mutant: content comparison off (1 red).
- Files: `scripts/verify-delivery-zip.mjs` (one source file); smoke test, docs.
- Decision recorded: dropping «and the last delivery zip» from the `/dump` sentence waits for the G-C7 rehearsal (Rodrigo: confirmed, 2026-10-10).
- Run: `check-build`, `npm test`, `npm run smoke`. Not run: Node 18 and 20, macOS, Windows, CI, non-root.

## Round 60 — C9.6: the delivery carries its own baseline (v0.0.63)

- Task: C9.6 (confirmed by Rodrigo). `make-delivery-zip` now writes `FILES.baseline.json` (path, size, sha256 of every file of the tree, manifest included, itself excluded; a sha256 seal over the list) and ships it in the zip; so every later dump carries the last delivery, and `recovery-report` compares against it with NO previous zip. Order of precedence: `--baseline <zip>` (unchanged), then the embedded baseline, then `FILES.manifest`. A baseline that is cut (`EBASELINE_PARSE`), has another format (`EBASELINE_FORMAT`) or was edited (`EBASELINE_SEAL`) is refused with exit 1; the seal catches accidents, it is not a signature. D43 (format, confirmed by Rodrigo: a new file, `FILES.manifest` untouched, C7.1 not built).
- Tests first (red before the code): `test/baseline.test.mjs` (4: build, refusals, delivery to dump to recovery with no zip, read back by `unzip` + sha256 apart from the writer); mutants by hand: seal check off (2 red), baseline file counted as its own change (1 red). `test/layout.test.mjs` lists the new script.
- Files: `scripts/baseline.mjs` (new), `scripts/make-delivery-zip.mjs`, `scripts/recovery-report.mjs`; the dump itself needed no change (the file is in the tree it zips). No product code touched.
- Found, not fixed: `verify-delivery-zip` does not re-check the baseline against the zip (the test does). The `/dump` sentence still says «and the last delivery zip».
- Also: `scripts/smoke-test-delivery-guards.mjs` copies `baseline.mjs` into its fixtures (it broke without it). Run: `check-build`, `npm test`, `npm run smoke`. Not run: Node 18 and 20, macOS, Windows, CI, non-root; a real session recovering a real dump with no zip (G-C7).

## Round 59 — C4.5: `ls --json` with a zero DOS date (v0.0.62)

- Task: C4.5 (D40, confirmed by Rodrigo). `ls --json` on a zip whose DOS date is zero exited 3 (`EINTERNAL`, `null.toISOString()`); it now lists the entry with `mtime: null`, exit 0. One line in `runCli` (`zipkit.mjs`); text `ls` and `test` were never affected.
- Tests first (red before the fix): `test/cli-m4-gaps.test.mjs` +3 (all entries zero, a mix of valid and zero dates, text `ls` and `test` on such a zip).
- Mutants: `M4-ls-json-mtime-null` (red) and `M4-ls-json-mtime-nan` (explained survivor: an invalid Date cannot come out of `dosDate`); the list has 220 entries.
- Files: `packages/chicla-zip/src/zipkit.mjs`, `mutants/list.mjs`, the test, docs.
- Not run: the whole mutant list as one run (only the two new entries and the M4 test files), `npm run smoke`, Node 18 and 20, macOS, Windows, CI, non-root. Run: `check-build`, `npm test`.

## Round 58 — decisions D3 (reasons), D40, D41, D42, cards C9.6 and C11.5 recorded (v0.0.61)

- Docs only. ROADMAP: D3 now says WHY (hostile input, same result on every machine, fresh chats with nothing installed, no supply chain; cost accepted); D40 confirmed (`ls --json` gives `mtime: null`, built as C4.5); new D41 (also npm from 0.1, only Rodrigo publishes, licence first; replaces the «no npm» part of D12, G-C6 and the risk line) and D42 (audience: chicla-zip for anyone, chicla-kit for agent work); new cards C9.6 (the dump carries its own baseline) and C11.5 (terminal look, no dependencies, after C11.1).
- `CLAUDE.md` rule 4 changed to match D41 (it said «never publish to npm»): the AI still never runs `npm publish`.
- Files: `ROADMAP.md`, `CLAUDE.md`, status file, this entry; no code touched.
- Not run: `npm run smoke`, Node 18 and 20, macOS, Windows, CI, non-root. Run: `check-build`, `npm test`.

## Round 57 — C5.3b slice 6: the M4 mutants (command line) in the list (v0.0.60)

- Task: C5.3b, sixth slice. `mutants/list.mjs` gains 56 entries `M4-*` for `runCli` (rounds 33 to 40, AUDIT-3): exit codes 1/2/3, argument parsing (`--`, unknown options, missing values, counts), `--json` and `--help`, escaping of hostile names, the text of `ls`, `test`, `cat`, `mark`, `create` (glob rules, `--exclude`, `--stream`, `--deterministic`, EEXIST) and `extract`; 218 in all.
- First run: 57 drafted, 11 survivors. Nine were real gaps and got tests first: `test/cli-m4-gaps.test.mjs` (9: stack of an internal error, a dead stdout in `--json`, a raw system error is exit 1, size column, `\x01` escape, folders are not unsafe names, five of six unsafe names named, `mark` counts, NFC/NFD report on `extract`). Three are explained survivors (inherited command names still end as EUSAGE, four-digit escapes never need padding, `unsafeNameReason` ignores a trailing slash).
- Found, NOT fixed (outside the task, no source change): `ls --json` on a zip whose DOS date is 0 exits 3 (`EINTERNAL`, `null.toISOString()`). Its mutant is left out of the list until it is fixed; opened as C4.5 and D40 (proposed).
- Result: 218 entries as ONE run (about 28 min): 189 red, 29 explained, all as listed. `zipkit.mjs` byte-identical to round 56.
- Not run: `npm run smoke`, Node 18 and 20 (this machine is Node 22), macOS, Windows, CI, non-root. Run: `check-build`, `npm test`, `npm run mutants`.

## Round 56 — C5.3b slice 5: the missing M2 mutants in the list (v0.0.59)

- Task: C5.3b, fifth slice. `mutants/list.mjs` gains 31 entries `M2-*` that were only prose in the CHANGELOG: each name check of `unsafeNameReason` (round 11), the collision rules (round 12), merge, `dirs`, `filter`, modes, dates, umask and parents of rounds 7 to 9; 162 in all.
- First run: 18 red, 2 explained, 11 survivors. Five were real gaps and got tests first: `test/extract-m2-gaps.test.mjs` (5: empty name is EUNSAFE, `dirs` count, `filter`, 0644 for a large file with no mode bits, a folder's date). Five more are explained survivors (2 unreachable after pre-validation, NFC fold redundant, ECOLLISION needs a folding file system, umask only visible as non-root).
- Result: 24 red + 7 explained in this slice. Whole list as ONE run (162 entries, about 28 min, progress lines on stderr): 136 red, 26 explained, all as listed. `zipkit.mjs` byte-identical to round 55.
- Left out: P3, P4, P5 (file system or root), A7 (covered by A12, A13, S1), the round-11 fuzz (a seed, not a mutant), M4 (command line). Not run: `npm run smoke`, Node 18 and 20 (this machine is Node 22), macOS, Windows, CI, extraction as non-root.
- Run: `check-build`, `npm test`.

## Round 55 — C5.3c: the mutant runner reports progress (v0.0.58)

- Task: `scripts/mutants.mjs` writes one line per event to STDERR as it runs: the baseline, then `[i/n] STATE id seconds` for each mutant (a full run of 131 takes about 25 min and printed nothing until the end, which looked like a hang). STDOUT is unchanged (the table and the count at the end), so nothing that reads it changes.
- Smoke test first (`scripts/smoke-test-mutants.mjs`, 2 new checks, red before the change): the progress lines exist, stdout has none, and the first one arrives while the run is still going (a slow second mutant).
- Files: `scripts/mutants.mjs`, `scripts/smoke-test-mutants.mjs`. `zipkit.mjs` and `mutants/list.mjs` untouched.
- Run: `npm run smoke` (exit 0), `check-build`, `npm test`, and one real mutant with `--only`. Not run: the whole list again, Node 18 and 20 (this machine is Node 22), macOS, Windows, CI.

## Round 54 — C5.3b slice 4: the `writeZipStream` and `createZip` mutants in the list (v0.0.57)

- Task: C5.3b, fourth slice. `mutants/list.mjs` gains 61 entries (`M3s-*` for `writeZipStream`, `M3c-*` for `createZip`, `readNoFollow`, `sliceFile`, `sameFile`); 131 in all. D39 confirmed by Rodrigo.
- First run showed 4 paths no test reached; `test/stream-limits.test.mjs` (4 tests, written before the entries were fixed) covers them: each zip64 end-record trigger alone in `writeZipStream`, the UT block past 2038 in the stream writer, `ERECURSE` when the output IS the folder, a FIFO skipped as `special` with `stream: true`.
- Result: 50 red, 11 explained survivors (redundant with the end-of-archive check: 2; `root` type and unsafe name caught by the next layer: 2; the four single fields of `sameFile` and the two slice-read checks: redundant or unreachable without a hook).
- `zipkit.mjs` byte-identical to round 53. Whole list run as ONE run (131 entries, about 25 min): all as listed. `check-build` and `npm test` (582 pass, 1 skipped, 0 fail) run.
- Not run: `npm run smoke`, Node 18 and 20 (this machine is Node 22), macOS, Windows, CI, the list on a second machine or as a normal user. Left out of the list: M4 (command line), round 11 (C2.4) and the other M2 mutants not described.

## Round 53 — C5.3b slice 3: the `writeZip` mutants in the list (v0.0.56) — recovered from emergency dump

- Recovered from emergency dump `chicla-EMERGENCY-afterRound52-2026-10-10-110147.zip` (session cut mid-round), checked against the round 52 zip: only `packages/chicla-zip/mutants/list.mjs` differs from it; no file lost, nothing new; `zipkit.mjs` byte-identical to round 52.
- Task: C5.3b, third slice. `mutants/list.mjs` gains 23 entries `M3-*` (the writer `writeZip`, rounds 20 to 34: CRC and method in the local header, EDUP, `.` segments, folder with data, `.partial` removed, deflate only if smaller, modes, DOS dates, zip64 end records and markers, version needed, `sha256`, `epoch`, UT extra); 70 in all.
- Slice 4 (not done): the same lines of `writeZipStream` and `createZip`. D39 (the split into slices 3 and 4) was lost with the session; re-recorded in ROADMAP as PROPOSED, for Rodrigo to confirm.
- Whole list run in two parts (47 entries, 170 s; 23 entries, 528 s), all as listed: 21 of the new 23 red, 2 explained survivors (`M3-entries-limit`: the same EZIP64 comes first from the end-of-archive check; `M3-level-0-stored`: zlib level 0 stores anyway).
- Run: `check-build`, `npm test` (578 pass, 1 skipped, 0 fail), `npm run smoke` (all green), `check-build`. Not run: Node 18 and 20 (this machine is Node 22), macOS, Windows, CI, the list as a normal user or on a second machine, the list as ONE run (it takes about 12 min here).

## Round 52 — C5.3b slice 2: the rest of `extractZip` in the mutant list (v0.0.55)

- Task: C5.3b, second slice. `packages/chicla-zip/mutants/list.mjs` gains 22 entries (47 in all, 115 s, all as listed): the merge into an existing destination (S1, A12, A13), the header check before the output file (A15), collisions (C1, C2), the temp folder on a mount (X1), `legacyEncoding` (R14), the EXDEV retry (round 42, 2 entries), the merge undo (round 43, 6 killed) and 7 explained survivors (A4, A5, A6, S3, A14 of AUDIT-1; the reverse-order undo and the link-only backup of round 43). `zipkit.mjs` byte-identical to round 51.
- Runner: `replace` may be empty (a deletion, needed for A5). Smoke check written first (red), then the one-line change; 13 checks.
- Method as in round 51: each mutant measured against 8 test files one at a time, the entry names the files that kill it (for survivors, the files that do not). Seen: S1, X1, R42 and R43 are caught only by the merge and rollback tests, A15 only by `extract-fast`, C1 and C2 only by `collisions`; A4, A5, A6, S3, A14 and the two round-43 survivors were not killed by any of the 8 files.
- Left out on purpose: P3, P4 (they die on a file system that normalises names) and P5 (dies when not root). `survives` must hold wherever the list runs, or the run fails with `DIED`. The machine here is Linux as root; on a Mac or as a normal user the list is untested.
- Not in the list yet (still C5.3b): round 11 (C2.4), M3 (writer), M4 (command line), C5.1 (fuzz) and the AUDIT-1 mutants whose wording was never recorded (A7).
- Run: `check-build`, `npm test`, `npm run smoke`, `npm run mutants`. Not run: Node 18 and 20, macOS, Windows, CI, the list as a normal user, the list on a second machine.

## Round 51 — C5.3b slice 1: the AUDIT-1 mutants of `extractZip` in the list (v0.0.54)

- Task: C5.3b, first slice. `packages/chicla-zip/mutants/list.mjs` gains 17 entries, the mutants of AUDIT-1 (M2) that were killed when it was written: V1 to V6, A1 to A3, A8 to A10, S2, P1, P6, R1, R2 (same letters). `scripts/mutants.mjs` and its smoke test: one change (below). `zipkit.mjs` byte-identical to round 50.
- Method: each mutant is one exact replacement; for each I measured which test file kills it alone (4 files, one run per file) and the entry names the smallest sufficient set, two files where both catch it. The whole list (25 entries) runs in about 95 s, all red.
- Found by running it: the A1 mutant (temp folder never removed), run against `extract-audit1.test.mjs`, left `.chicla-tmp-*` in `/dev/shm` (a path that test hard-codes), and that leftover turned the NEXT baseline red (the mounted-volume test counts temp folders in the mount). Fix: the runner gives the tests a private `TMPDIR` that is removed at the end (smoke check written first, red, then green), and A1 names `extract.test.mjs` only. A path hard-coded outside `TMPDIR` is still not covered; the header of `mutants.mjs` says so.
- Not in the list yet (still C5.3b): the explained survivors and A7, A12 to A15, C1, C2, X1 of AUDIT-1; the mutants of rounds 11, 14, 42, 43; M3, M4, C5.1. D38 confirmed by Rodrigo.
- Run: `check-build`, `npm test`, `npm run smoke`, `npm run mutants`. Not run: Node 18 and 20, macOS, Windows, CI, the list on a second machine.

## Round 50 — C5.3: the mutants that must stay red, as a script (v0.0.53)

- Task: C5.3. New: `scripts/mutants.mjs` (runner), `packages/chicla-zip/mutants/list.mjs` (the list) and `scripts/smoke-test-mutants.mjs`; `npm run mutants`. `zipkit.mjs` byte-identical to round 49.
- How it works: each entry is `{ id, file, find, replace, tests, why, survives? }`. The runner copies the package to a tmpdir, checks the tests are green unmutated (baseline; red or hung = exit 2, nothing judged), then for each entry applies ONE replacement, runs only its `tests`, and requires them to fail. `STALE` (text not found exactly once), `INVALID` (mutated file does not parse: a syntax error would be a fake red), `SURVIVED` (no test failed) and `DIED` (an explained survivor that now dies) all exit 1. The real tree is never touched.
- List: the 8 mutants of round 49, rewritten as exact texts; all red (about 65 s). The first run found one survivor: the data-descriptor CRC of `writeZipStream` is invisible to the differential test (unzip and Python read the central CRC), so that entry also names `test/write-stream.test.mjs`, which catches it. Round 49's "8 of 8 red" was true for the whole suite, not for that file alone.
- Break on purpose: 6 mutants of `mutants.mjs` (`find` may repeat, survivor not counted, no parse check, stale explanation accepted, no baseline gate, mutation not restored), each turns the smoke test red; 12 checks in all. `smoke` now has 6 scripts; D38 (on demand, not in `npm test` or CI) proposed; D37 confirmed by Rodrigo.
- Run: `check-build`, `npm test`, `npm run smoke`, `npm run mutants`. Not run: Node 18 and 20, macOS, Windows, CI, the mutants of rounds before 49 (not in the list yet: C5.3b), a run of the list on a second machine.

## Round 49 — C5.2: differential test against Python's `zipfile` on random trees (v0.0.52)

- Task: C5.2. One new test file, `packages/chicla-zip/test/differential-python.test.mjs` (31 tests); no source file changed (`zipkit.mjs` byte-identical to round 48).
- What it does: each seed builds a random tree (nested and empty folders, empty files, odd and non-ASCII names with NFC and NFD, compressible, incompressible and zero data, up to 1.5 MB) and runs it both ways. A: `createZip` with random options (level, zip64, stream, deterministic, extendedTime, sha256), read by unzip, zipinfo, Python and the Chicla reader, and the Chicla listing compared entry by entry with Python's `infolist` (name, size, CRC, method, bit 11). B: Python writes the same tree (stored or deflate, random level, forced zip64, seekable or stream with data descriptors); the Chicla reader and `extractZip` must give the same folder as Python's `extractall` and as the generator's tree (the oracle). Plus one test that the generator is deterministic and covers empty folders, empty files, non-ASCII, deep, big and NFD names.
- Reproduce: `CHICLA_DIFF_SEED=<seed> CHICLA_DIFF_N=1` (tree i uses SEED+i; failures print seed, options, mode). Default N=30 (about 10 s); proposed as D37.
- Found: no divergence in 430 trees (seeds 1 to 400 and the default 30). The only red was `unzip` 6.00 in a non-UTF-8 locale on non-ASCII names with an extra field (the known quirk of C3.8); the test runs the external tools with `LC_ALL=C.UTF-8`.
- Break on purpose: 8 mutants of `zipkit.mjs`, all red (central CRC in `writeZip` and in `writeZipStream`, data-descriptor CRC, bit 11, reader NFC-normalising names, reader ignoring the local extra length, `createZip` without folder entries, `extractZip` not creating empty files); source restored and diffed.
- Run: `check-build`, `npm test`, `npm run smoke`. Not run: Node 18 and 20, macOS, Windows, CI, Python other than 3.12.3, 7z, a soak above 400 trees.

## Round 48 — C0.4e: `emergency-dump` and `recovery-report` in English, C0.4 closed (v0.0.51)

- Task: C0.4, slice e (the last): `scripts/emergency-dump.mjs`, `scripts/recovery-report.mjs` and `scripts/smoke-test-emergency.mjs`. Nothing else reads their output (searched; `test/layout.test.mjs` only checks the file names).
- Change: header comments, inline comments, every message, the `RECOVERY_REPORT.md` and `RECOVERY_DIFF.md` headings and the closing lines, to English ("Modified / New / MISSING vs the base", "files match the dump's sha256", "possibly TRUNCATED", "differ only in NFC/NFD"). No logic changed. The accented fixture names of T1 to T4 stay on purpose: they are the NFC/NFD test data.
- Tests first: the smoke test was translated first and went red (12 of 35 checks); green after the scripts. T4 now asserts the English collision warning of `recovery-report` too (before it matched on "NFC/NFD" alone). Heading lookups of the test use the new English titles.
- Run: `npm run smoke` (all five green), `check-build`, `npm test` (after `bump-round`). Not run: Node 18 and 20, macOS, Windows, CI, mutants (text only), a real `/dump` on `/home/claude` with outputs included.
- C0.4 is done: all 12 scripts and 5 smoke tests of `scripts/` are in English.

## Round 47 — C0.4d: the delivery guards in English (v0.0.50)

- Task: C0.4, slice d (D36, 4 files allowed): `scripts/make-delivery-zip.mjs`, `scripts/check-manifest.mjs`, `scripts/verify-delivery-zip.mjs` and `scripts/smoke-test-delivery-guards.mjs`. Nothing else reads their output (`recovery-report` only embeds it; searched).
- Change: comments, usage lines, every error and progress message ("LOST file(s) vs FILES.manifest", "ZIP IS NOT READY", "delivery created and verified", the private-file reasons...), and the labels, regexes and fixture words of the smoke test; fixture names `partido.mjs`, `sem-unicode.zip`, `realmente-perdido.md` became `broken.mjs`, `no-unicode.zip`, `really-lost.md`. Non-ASCII fixture names (`relatório – ação 日本語.pdf`) stay: they are what the test covers. No logic changed.
- Tests first: the smoke test was translated first and went red (about 20 of 43 checks); green after the scripts. One slip caught by it: a message with backticks that the test regex did not expect, fixed in the script.
- Run: `npm run smoke` (all five green), `check-build`, `npm test`; this round was closed and zipped with the translated scripts. Not run: Node 18 and 20, macOS (the `unzip` that shows `?` is only simulated), Windows, CI, mutants (text only), the other 4 scripts (still Portuguese).

## Round 46 — C0.4c: `bump-round` messages and comments in English (v0.0.49)

- Task: C0.4, slice c (D36): `scripts/bump-round.mjs` and `scripts/smoke-test-bump-round.mjs`. No other script reads its output (searched).
- Change: comments, error messages, the `--verify` report lines ("app hash … = app, CHANGELOG and status file", etc.), the bump summary and the closing line, and the labels, regexes and Portuguese fixture words of the smoke test, to English. No logic changed; the fingerprint paragraph and tag text were already English. The non-ASCII fixture characters stay.
- Tests first: the smoke test was translated first and went red (stopped at its first regex); green after the script (12 checks). 36 + 9 string replacements, each matched once.
- Run: `npm run smoke` (all five green), `check-build`, `npm test`, and the script itself closed this round. Not run: Node 18 and 20, macOS, Windows, CI, mutants (text only), the other 7 scripts (still Portuguese).

## Round 45 — C0.4b: `check-build` messages and comments in English (v0.0.48)

- Task: C0.4, slice b (D36, confirmed by Rodrigo): `scripts/check-build.mjs` and `scripts/smoke-test-check-build.mjs`, plus one regex in `scripts/smoke-test-delivery-guards.mjs` (it reads `✓ node --check passed`; its labels stay Portuguese until slice d).
- Change: comments and the three output lines of the script ("node --check on N .mjs files", "✓ node --check passed", "✗ node --check failed on N file(s). Delivery aborted.") and the labels and regexes of its smoke test, from Portuguese to English. No logic changed. Fixture names with accents (`também-ok.mjs`) stay: they test non-ASCII paths.
- Tests first: the smoke test was translated first and went red (2 of 5 checks); green after the script. Searched the tree for the old strings: no other reader.
- Run: `npm run smoke` (all five green), `check-build`, `npm test`. Not run: Node 18 and 20, macOS, Windows, CI, mutants (text only), the other 9 scripts (still Portuguese).

## Round 44 — C0.4a: `archive-changelog` messages and comments in English (v0.0.47)

- Task: C0.4, first slice (a) of five (D36, proposed): `scripts/archive-changelog.mjs` and `scripts/smoke-test-archive-changelog.mjs`, plus 2 regexes in `scripts/smoke-test-delivery-guards.mjs` (it also reads the output of `archive-changelog`; found because `npm run smoke` went red there after the script change; its labels stay Portuguese until slice d). 13 files with Portuguese do not fit rule 16 (3 files), so the card goes in slices, each a script plus the smoke test that asserts its messages.
- Change: comments, `--keep`, error, progress and final messages of the script, and the labels, fixtures and regexes of its smoke test, from Portuguese to English. No logic changed (19 + 14 string replacements, each checked to match once).
- Tests first: the smoke test was translated first and went red (2 of 7 checks: the two that match the script's output); green after the script was translated. No Portuguese left in the two files.
- Docs: ROADMAP C0.4 split in slices a to e; D36 (proposal) added to §2.
- Run: `npm run smoke` (all five green before; after the change red in the delivery-guards test, 2 checks, fixed; all five green again), `node --check`, `check-build`, `npm test` (548: 547 pass, 1 skipped). Not run: Node 18 and 20, macOS, Windows, CI, the other 11 scripts (still Portuguese), mutants (a text-only change).

## Round 43 — C2.7: a failed merge is undone (v0.0.46)

- Task: C2.7 (AUDIT-1, A-4), Rodrigo's roadmap order; proposal (undo, honest report if the undo fails) confirmed by his "avança". Source: `zipkit.mjs` only (new `mergeMove`, about 28 lines; the merge loop of `extractZip` calls it).
- Bug: merging into an existing folder is a series of renames; one failing midway left the folder half-merged while the error said "nothing was kept". Now the renames already done are undone (new items go back to the temp folder; with `overwrite`, each replaced file is first saved as a hard link, or a copy where links fail, and restored). If the undo fails too: `EPARTIAL`, with `leftBehind` (paths still holding new content) and `backupDir` (kept, with the originals). The original error stays as `cause`. The C2.8 retry is unchanged (it happens before anything moved). No `.chicla-tmp-*` or `.chicla-bak-*` remains on success or after a clean undo. `_rename` now covers the undo too.
- Tests first: new `test/extract-rollback.test.mjs` (9; 4 red before the code); `extract-exdev.test.mjs` updated (the partial-merge case now expects the undo: 3 calls, folder as before). 16 mutants: 14 red (3 of them after strengthening the tests: stop at the first undo failure, backup of the failed move left, original error not kept as `cause`); 2 explained survivors: undo in forward order (equivalent: items are independent paths) and link-only backup (the copy fallback needs a file system without hard links, not testable here).
- Docs: `docs/zip-handling.md` guarantee 7; AUDIT-1 A-4 and ROADMAP C2.7 marked; ROADMAP §9 G-C3 now also asks for the copy fallback on an exFAT/FAT drive.
- Suite 547 green and 1 skipped as root (548 tests), `check-build` ok.
- Run: `npm test`, `check-build`. Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed), `bench/*-real.mjs`, the copy fallback of the backup (exFAT/FAT), a mount point nested inside the destination.

## Round 42 — C2.8: `extractZip` into a bind mount (v0.0.45)

- Task: C2.8 (AUDIT-1, A-6), done before M5 at Rodrigo's request to follow the roadmap order. Source: `zipkit.mjs` only (about 15 changed lines in `extractZip`).
- Bug: a destination that is a bind mount has the same `dev` as its parent, so the A-1 check kept the temp folder next to it and the final `rename` failed with `EXDEV` (extraction impossible). Now each temp-folder place is an attempt: if the first rename of the merge reports `EXDEV` (nothing moved yet) the extraction is redone with the temp folder inside the destination. A later `EXDEV` (partial merge, C2.7) and any other error are not retried; every outcome leaves no `.chicla-tmp-*`. Test-only option `_rename`.
- Tests first: new `test/extract-exdev.test.mjs` (6): 5 red before the code; hook cases (retry, partial merge, every place fails, other error, new destination) and one real `mount --bind` case (skipped where there is no mount permission). 8 mutants: 7 red (3 after strengthening two tests the first run showed too weak); 1 survivor, not testable as root: a failing `mkdtemp` next to the destination falling back to inside it (existing behaviour, needs a non-root user).
- Docs: AUDIT-1 A-6 and ROADMAP C2.8 marked. Not fixed: a nested mount inside the destination, or an `EXDEV` after some renames (C2.7).
- Suite 538 green and 1 skipped as root (539 tests), `check-build` ok.
- Run: `npm test`, `check-build`, the real bind mount on Linux as root. Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed), `bench/*-real.mjs`, the bind-mount test as a normal user.

## Round 41 — C5.1: read fuzz, one bug found and fixed (v0.0.44)

- Task: C5.1 (Rodrigo: "avança", Claude's suggestion from "Next up"). Source: `zipkit.mjs` only (3 changed lines in `streamEntry`).
- New `test/fuzz-read.test.mjs` (9 tests): a seeded fuzz (`CHICLA_FUZZ_READ_SEED`, `CHICLA_FUZZ_READ_N`, default 1500) applies 1 to 4 mutations (bit flip, byte, edge value in a header field, truncate, cut, insert, duplicate, zero) to 5 valid zips (plain, tree, odd names, zip64, special) and runs `openZip`, `read`, `testZip` and `extractZip` in a child process with a time limit. Only success or `ZipError` is accepted; no case over 3 s; nothing outside the destination changes; a refused extraction leaves the destination as it was. Plus 8 must-refuse cases (single patched fields where success would be wrong).
- **Bug found by the fuzz (seed 20261009, i=278):** `testZip` (and the streaming path of `extractZip`) let a raw zlib error ("invalid stored block lengths") through on a corrupt deflate stream; now a `ZipError`. After the fix: 24 000 further mutations on 3 other seeds, clean.
- Break on purpose (copy of the tree): 9 mutants of the reader. Red: no zlib wrap (fuzz), raw `readAt` error (fuzz), raw inflate error in `read` (suite), entry-count check (suite), local signature unchecked and central entry bounds unchecked (both were survivors of the whole suite; the must-refuse cases now kill them). Survivors, explained: data past end of file, central directory past end of file and local offset past end of file; `readAt` raises the same `ZipError` on truncation, so the check is a second line of defence.
- Suite 532 green and 1 skipped as root (533 tests), `check-build` ok.
- Run: `npm test`, `check-build`, the fuzz with 4 other seeds. Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed), `bench/*-real.mjs`, the fuzz on a real large corpus.

## Round 40 — C4.4: `create` refuses an existing output, `--help` (v0.0.43)

- Task: C4.4 (D35, confirmed by Rodrigo). Source: `zipkit.mjs` only (about 6 changed lines in the command-line section).
- `create` now refuses an existing output (file, folder, or a link even when dangling; `lstat`) with `EEXIST`, exit 1, nothing touched, no `.partial`, unless `--overwrite` (then replaced atomically; a link is replaced, never written through). `--help` before `--`, or `-h` as the first argument, prints the usage on stdout and exits 0 (`--json`: one line `{ ok, command: "help", usage }`); `-h` elsewhere stays a name. The usage line lists `--overwrite` for `create` and `--help`.
- Tests first: new `test/cli-c44.test.mjs` (9, real processes); 6 red before the code; the round-38 usage matrix no longer lists `create --overwrite` as an error. 10 mutants (no refusal, always refuse, `existsSync` instead of `lstat`, wrong code, `--help` after `--`, `-h` anywhere, only first position, no json help, exit code, flag not accepted): all red.
- Docs: ROADMAP D35 confirmed and C4.4 recorded; `docs/zip-handling.md` §8; AUDIT-3 §3 marked resolved.
- Suite 523 green and 1 skipped as root, `check-build` ok.
- Run: `npm test`, `check-build`. Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed), `bench/*-real.mjs`.

## Round 39 — `audit` of M4: four command-line bugs fixed (v0.0.42)

- Task: `audit` after M4 (status file, item 2). New `docs/audits/AUDIT-3.md`. Source: `zipkit.mjs` only (about 25 changed lines in the command-line section; the library is untouched).
- Found by running the CLI by hand: **A-1** `ls | head` died with an unhandled `EPIPE` stack trace (now a quiet exit 1); **A-2** no way to name an entry or zip starting with `--` (`--` now ends the options); **A-3** names from a zip reached the terminal raw, so an entry with escape sequences could retitle or clear it or fake a line (text output now shows control, C1, U+2028/2029 and bidi characters as `\xNN`/`\uNNNN`; `cat` stays raw, `--json` keeps real names); **A-4** `--max-bytes` took `0x10`, `1e3`, empty and negatives (digits only now, else usage error).
- Tests first: new `test/audit3.test.mjs` (10, real processes; 6 red before the code). 17 mutants: all red after four more cases (C1 range, U+2028/2029, isolates, the `test` no-flag line) were added.
- Scheduled, not done: D35 (proposal: `create` refuses an existing output without `--overwrite`) and `--help` exit 0, as C4.4. Rodrigo decides D35 first.
- Docs: `docs/zip-handling.md` §8, ROADMAP D35 and C4.4.
- Suite 514 green and 1 skipped as root, `check-build` ok.
- Run: `npm test`, `check-build`. Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed), `bench/*-real.mjs`, a real terminal emulator (checked on the bytes), line coverage.

## Round 38 — C4.2b: `create` and `--json` on every command (v0.0.41)

- Task: C4.2b, the second slice of C4.2. D34 confirmed by Rodrigo (round 37). Source: `zipkit.mjs` only (the command-line section, about 30 lines; the library is untouched).
- `create <out.zip> <folder> [--exclude GLOB]... [--stream] [--deterministic]`: calls `createZip`, prints entries, bytes, `skipped` and `collisions` (report only). `--exclude` (repeatable): a pattern without `/` matches a name at any depth, with `/` the whole path; `*` and `?` never cross `/`, the rest is literal; an excluded folder is pruned. `--json` now on `create`, `extract` (files, dirs, bytes, skipped, collisions) and `mark` (patched, total); only `cat` has none. Usage line updated.
- Tests first: new `test/cli-create.test.mjs` (18, real child processes); zips made by `create` are read back by `unzip`, `zipinfo` and Python through `checkZip`; the round-36 test «mark/extract --json: not yet» became «they take it». 17 of the new tests were red before the code. 17 mutants (glob scope, `*`, `?`, escaping, each option not passed, each JSON field, repeated `--exclude`, `cat` with `--json`): all red after one test was added for `?` crossing `/`.
- Not done on purpose: no `--symlinks`, `--level` or `--epoch` option (not in the card); `create` onto an existing output follows `createZip` (replaces it) and has no test of its own.
- Docs: ROADMAP D34 confirmed and C4.2b recorded; `docs/zip-handling.md` §8.
- Suite 504 green and 1 skipped as root, `check-build` ok.
- Run: `npm test`, `check-build`. Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed), `bench/*-real.mjs`.

## Round 37 — `openZip` throws a `ZipError` for system errors on the zip (v0.0.40)

- Task: the small fix noticed in round 36. Source: `zipkit.mjs` only (about 5 lines in `openZip`; the CLI is untouched).
- A missing zip, a folder, or an unreadable file used to throw the raw system error (`ENOENT`, `EISDIR`, `EACCES`; a folder was only found at the first read). Now `openZip` (and so `listZip`, `readZipFile`) throws a `ZipError` with the same `code` and the original error in `cause`. `ENOENT` for a missing name inside the zip is unchanged. The descriptor is still closed on every failure.
- Tests first: in `test/open.test.mjs` the round-2 test that asserted the raw error was replaced by 4 (missing file with `cause`, folder through all three entry points, `EACCES` skipped as root, missing name unchanged); 2 were red before the code. 4 mutants (no wrapping at open, none after open, no `cause`, fixed code): 4 red. `cli.test.mjs` unchanged and green (the CLI mapping of system errors stays as a safety net for other functions).
- Suite 486 green and 1 skipped as root (`EACCES`), `check-build` ok.
- Run: `npm test`, `check-build`. Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed), `bench/*-real.mjs`, the `EACCES` test (needs a non-root user).

## Round 36 — C4.2a: command line contract, `--json` and exit codes (v0.0.39)

- Task: C4.2a, the first slice of C4.2 (size M, split at the seam: read-only commands and the contract first; `create` and `--json` for `extract`/`mark` are C4.2b). Source: `zipkit.mjs` only (the command-line section rewritten, about 75 lines; the library is untouched).
- `runCli(argv, { out, err })` is exported and returns the code, never ends the process (the entry point sets `process.exitCode`, so a big `cat` is flushed). Exit codes 0 ok, 1 failed (`ZipError` or a system error), 2 usage, 3 internal. `--json` on `ls` and `test`: one JSON line, `ok`/`error.code`, stderr empty; the lists in `test --json` are complete (the text output still cuts at five). `cat` is raw. Unknown options and a wrong number of arguments are now usage errors (before they were ignored or crashed). `--max-bytes` must be a number. Output of `ls`, `test`, `extract` and `mark` in text mode is unchanged. D34 records the contract (proposed by Claude).
- Found by running it: `ls` on a file that does not exist threw a raw `ENOENT` (not a `ZipError`) from `openZip`, so the old CLI printed a stack; the CLI now classifies system errors as exit 1. The reader itself still throws the raw error (not changed: outside the task, reported).
- Tests: new `test/cli.test.mjs` (28, real child processes: exit codes, stdout bytes, stderr, one-line JSON, all 256 byte values and 3 MiB through `cat`, usage matrix, extract and mark kept, `runCli` in process incl. exit 3). Written first; nothing ran before the code existed. 26 mutants: 25 red; survivors: 1 equivalent (`Object.hasOwn` guard: `constructor` is a usage error either way). Three first survivors (extra arguments, CRC padding, `--max-bytes abc`) led to more tests.
- Suite 484 green as root.
- Docs: ROADMAP D34, C4.2 split into C4.2a (done) and C4.2b; `docs/zip-handling.md` §8.
- Run: `npm test`, `check-build`. Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed), `bench/*-real.mjs`.

## Round 35 — C4.3: `docs/zip-handling.md` (v0.0.38)

- Docs only; no source file changed. New `docs/zip-handling.md`: why (bit 11, non-UTF-8 locales and `unzip` 6.00, `-UU` vs `ditto`), what the reader, extraction and the writers promise, the options with a catch (`extendedTime`, `deterministic`, `zip64`), `collisions` (extractor and writers, report only), known limits (AUDIT-2 B-2 backslash names, B-3 Windows-reserved names, no encryption, streamed zips unverified on macOS and 7z) and where it was run. `docs/README.md` lists it.
- Claims were taken from the code, the tests, the CHANGELOG and the ROADMAP risks; nothing new was measured. The `-UU` statement on macOS comes from the project's earlier notes and was not re-checked here (the doc says so).
- Run: `npm test`, `check-build`. Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed), `bench/*-real.mjs`.

## Round 34 — C3.9: the writer reports equivalent names (D32) (v0.0.37)

- Task: C3.9. Source: `zipkit.mjs` only (about 14 lines: `collisionsOf` plus a `collisions` field in the results of `writeZip` and `writeZipStream`; `createZip` passes it through). D33 confirmed by Rodrigo first; he chose C3.9 as the task.
- `collisions`: groups of paths (files, explicit folders, folders implied by a file's path; folders spelled with a trailing «/») that differ only in NFC/NFD or case, a group needing one real entry; same fold and same shape as `extractZip` (C2.5, `noteName` shared). Report only: nothing is refused and the zip is written as given; always an array (empty when none).
- Tests: new `test/write-collisions.test.mjs` (31; 30 red before the code, 1 guards the existing EDUP/EUNSAFE refusals). The same cases through `writeZip` and `writeZipStream` (NFC/NFD, case, file against folder both orders, two explicit folders, implied-only folders not reported, whole-path fold, Greek sigma, three spellings), `createZip` buffered, `stream: true` and Writable, the written zip unchanged and accepted by `unzip`, `zipinfo`, Python and the Chicla reader. The streamed-zip interop test uses ASCII names (Info-ZIP in a C locale mangles non-ASCII zip64 names, known).
- Mutants: 11, 11 red.
- Suite 456 green as root.
- Run: `npm test`, `check-build`. Not run: Node 18 and 20, macOS (tests that need both names in a tree skip there), Windows, CI, `npm run smoke` (no script changed), `bench/*-real.mjs`.

## Round 33  C4.1 `markUtf8Names` fixed (ROADMAP B1) (v0.0.36)

- Task: C4.1. Source: `zipkit.mjs` only (about 12 lines). D31 and D32 confirmed by Rodrigo first; he chose C4.1 as the next task.
- Bug (B1, still in the tree): the central-entry flag was written at `cdPos + 8`, an offset relative to the central directory, so the file position was wrong whenever the directory is not at byte 0 (always); it OR-ed 0x0800 into the wrong bytes of the first local header. Now `cdOff + cdPos + 8`.
- Also: every entry is checked (local signature, bounds) BEFORE the first byte is written, so a bad entry leaves the file as it was (D33, proposed by Claude).
- Tests: new `test/mark-utf8.test.mjs` (14; 7 red before the fix). Byte-level diff (only the flag fields change, only bit 11), idempotent, Python `zipfile`, `unzip -t` and the Chicla reader as independent readers (Python reads CP437 names before, UTF-8 after), zip64 records, zip64 local offset, bad header, offset outside the file or too close to the end, not a zip. 10 mutants: 10 red (one survivor, the bounds check, killed by an added test).
- Suite 425 green as root. `unzip` 6.00 in a C locale mangles non-ASCII names of zip64 entries (known, ROADMAP risks): that one test sets `LC_ALL=C.UTF-8`.
- Docs: D33 in ROADMAP 2, C4.1 done, D31 and D32 recorded as confirmed.
- Run: `npm test`, `check-build`. Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed), `bench/*-real.mjs`.

## Round 32 — `audit` of M3 (AUDIT-2): three fixes in the writer (v0.0.35)

- Task: `docs/audits/AUDIT-2.md` (promised vs. exists, bugs, mutants, untested paths). Source: `zipkit.mjs` only (about 20 lines). Rodrigo confirmed D3, D4, D5, D6, D10, D11 first (ROADMAP §2).
- A-1: `<out>.partial` followed a symlink (probe: `writeZip` overwrote the link's target). Now removed first, then created `O_EXCL|O_NOFOLLOW`. A-2: `createZip({ stream: true })` did not sync the folder after the rename and gave `EZIP` where `writeZip` gives `ENOENT` for a missing folder; both fixed. A-3: the writer accepted `./x`, `a//b`, `a/./b`, `a//` (a zip Chicla's own extractor refuses); now `EUNSAFE` before writing (D31, proposed). Reader and extractor unchanged.
- Tests: new `test/audit2.test.mjs` (21; 19 red before the fixes, 2 guard what stays accepted). 11 mutants: 9 red, 2 explained survivors (a race-only flag, folder `fsync`). Suite 411 green as root; as `ubuntu` 410 green and 1 skipped. Writer lines all covered; uncovered lines are in `extractZip`, `markUtf8Names` (C4.1) and the CLI (C4.2).
- Docs: ROADMAP §5 (writer bullets made true), D31 and D32 (proposed), C3.9 scheduled (report equivalent names, B-1).
- Run: `npm test`, `check-build`. Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed), `bench/*-real.mjs`.

## Round 31 — D29 and D30 confirmed, rule on open decisions (v0.0.34)

- Docs only. Rodrigo confirmed D29 (`writeZipStream`) and D30 (`createZip` streaming), 2026-10-09; next task chosen: the `audit` of M3 (AUDIT-2). New rule in `CLAUDE.md` (his wording): before starting work, check whether decisions are open and ask him to confirm them; at the end, if new ones came up, ask him to confirm those too. No code changed.
- Run: `check-build`, `npm test`. Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed).

## Round 30 — C3.7b: `createZip` in streaming mode (v0.0.33)

- Source: `zipkit.mjs` only (about 55 lines added). `createZip(out, root, { stream: true })` lists the tree with lstat only, then writes it with `writeZipStream` to `<out>.partial` (fsync, atomic rename; `.partial` removed on failure, an existing output untouched); `createZip(<Writable>, root)` streams to the sink (ended on success, destroyed on any failure, also on early refusals). Each file is opened when the writer reaches it and read in slices of at most 1 MiB; the C3.6 checks run after EACH slice. A file that vanished, became a symlink or stopped being a regular file after the listing is `ECHANGED` (not skipped). Without `stream` nothing changes. D30 records it (proposed by Claude, waiting for Rodrigo; it builds on D29, also still unanswered).
- Tests: new `test/create-stream.test.mjs` (18; 9 red before the code, 9 passed because `stream: true` was ignored and they guard the shared contract). 400 MiB sparse file: resident memory grows well under 200 MiB; one descriptor open at a time; `unzip`, Python and the Chicla reader accept the output (`zipinfo` left out for non-ASCII names, as in round 29).
- Real bug found by running it: a `FileHandle` write stream with `autoClose: false` leaves `fh.close()` pending forever on Node 22 (the test run ended with "promise still pending"); the stream now owns its descriptor and the fsync uses a second read-only descriptor.
- Mutants: 27, 20 red. Survivors: isFile check and `O_NOFOLLOW` at the open (equivalent: the inode comparison already refuses a swapped file), growth check, final stat, final byte count and the spare byte (redundant with the stat after each slice), no fsync (not testable here: it only matters after a crash). Two first survivors (`skipped` with a Writable, an invalid `out`) led to stronger tests.
- Run (node 22.22.2, root): `npm test` all green; `check-build` ok. M3 is closed: an `audit` is due.
- Not run: Node 18 and 20, macOS, Windows, CI, non-root, `npm run smoke` (no script changed), a real run above RAM size through `createZip` (only the 400 MiB test).

## Round 29 — C3.7: `writeZipStream`, a zip written to a Writable (v0.0.32)

- Source: `zipkit.mjs` only (about 90 lines added). `writeZipStream(sink, sources, opts) -> { entries, bytes }`: sources `{ name, data }`, `{ name, stream }` (async or sync iterable, Readable, or a function returning one) and folders; every file is streamed with bit 3, deflate always (level 0 and already-compressed names use stored blocks) and a 24-byte descriptor with 8-byte sizes, so files are zip64 and `zip64: false` is `EZIP64`; sink ended on success, destroyed on failure; backpressure; `ESOURCE` and `EZIP`. Three helpers (`checkOpts`, `vetName`, `attrOf`) moved out of `writeZip` so both writers share them (no behaviour change: the 354 old tests are green). D29 records the API (proposed by Claude).
- Tests: new `test/write-stream.test.mjs` (18; written first, all red because the export did not exist). Raw parse of local header, descriptor and central entry independent of the Chicla reader; `unzip`, `zipinfo`, Python and the reader agree; 400 MiB through a counting sink with flat memory; backpressure; a failing sink and a failing source close each other. Three tests of mine were wrong at first and were fixed in the tests (Info-ZIP shows `caf#U00e9` for non-ASCII names in zip64 entries in a C locale; `unzip -t` exits 1 on an empty zip; the sink failed before the source had started).
- Mutants: 33, 31 red. Survivors: `level === 0 ||` (equivalent: the level is already 0) and the first closed-sink check (redundant: the check after the write catches the same case). Four first survivors (backpressure, waiting for the source to close, deterministic dates, version needed in the central entry) led to stronger tests.
- Real run, by hand (`bench/stream-real.mjs`, new): 4.1 GiB streamed, deflate: 19 MB zip, peak RSS 61 MiB; `--stored`: 4.4 GB zip, peak RSS 66 MiB, second entry above 4 GiB; `unzip -t`, Python `zipfile` and `testZip` accept both.
- Run (node 22.22.2, root): `npm test` all green, 0 `todo`; `check-build` ok.
- Not run: Node 18 and 20, macOS, Windows, CI, non-root, `npm run smoke` (no script changed). Not done on purpose: `createZip` still reads files whole (opened as C3.7b).

## Round 28 — D28 confirmed (v0.0.31)

- Docs only. Rodrigo confirmed D28 (UT extra opt-in, `extendedTime`), 2026-10-09; next task chosen: C3.7. No code changed.
- Run: `check-build`, `npm test`. Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed).

## Round 27 — C3.8: the UT extra in the writer, opt-in (v0.0.30)

- Source: `zipkit.mjs` only (about 15 lines). `writeZip(out, sources, { extendedTime: false })`: `true` writes the UT extra (0x5455: flags 1 + mtime as signed 32-bit seconds, 9 bytes) in every local header and central entry, from the same time as the DOS stamp, cut to whole seconds, not clamped to 1980..2107; a time after 2038-01-19 gets none; not a boolean is `EARG`; `createZip` passes it through. Design is D28, PROPOSED by Claude.
- Why opt-in: my first version wrote it always and broke 5 existing tests. Measured cause (not a test problem): with any extra present, Info-ZIP `unzip` 6.00 in a C locale extracts `café.txt` as `caf#U00e9.txt` (without an extra: `café.txt`). So default bytes stay exactly as before; D28 records the alternative (on by default).
- Tests: new `test/write-ut.test.mjs` (13; written first, all red; raw parse of both headers independent of the Chicla reader; `unzip` extraction in 3 zones and the reader in 4 zones give the exact odd-second mtime; pre-1970, 2038 boundary, zip64 together, byte counts, default unchanged). Mutants: 17, 16 red; survivor equivalent (`writeUInt32LE(t >>> 0)` writes the same bytes as `writeInt32LE`).
- Run (node 22.22.0, root): `npm test` 354 green, 0 `todo`; `check-build` ok.
- Not run: Node 18 and 20, macOS, Windows, CI, non-root, `npm run smoke` (no script changed).

## Round 26 — decisions recorded (v0.0.29)

- Docs only. Rodrigo confirmed D26 and D27 (proposed by Claude), and D16 and D17 (made on delegation), 2026-10-09; ROADMAP states updated. D27 stays without a `changed: "skip"` policy until the dump (C9) needs one. Next task chosen: C3.8. CLAUDE.md gets the working rule "Open decisions, always" (every round-closing reply lists open decisions with Claude's suggestion). No code changed.
- Run: `check-build`, `npm test`. Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed).

## Round 25 — C3.6: sha256 in the same pass, and `ECHANGED` (v0.0.28)

- Source: `zipkit.mjs` only (about 25 lines changed). `writeZip(out, sources, { sha256: false })`: `true` adds `sha256` (hex) to each file entry returned (not folders), computed in the same blocks as the crc32 (`digest` replaces `crcChunks`); not a boolean is `EARG`; off by default. `createZip` passes it through and refuses with `ECHANGED`, writing nothing, when a file is not the one that was listed or moves while it is read (size, mtime, ctime and inode compared at the listing, at the open and after the read; bytes read must equal the size). Design is D27, PROPOSED by Claude; no `changed: "skip"` policy built.
- Tests: new `test/digest-changed.test.mjs` (15; written first, 11 red before the code, 3 guards of unchanged behaviour). `exclude` runs between the listing and the read, so it is the hook for the listing gap; `_afterRead` (tests only, like `_limits`) is the hook for the read itself. One wrong test of mine (`latin1` re-encoded by the helper) fixed in the test, not the code.
- Mutants: 18, 12 red. Survivors, all redundant checks: size, mtime, ctime and inode inside the comparison (any real change moves several at once; each is kept as defence against coarse clocks), device (cannot be built in a test) and the `data.length !== a.size` check (the final `fstat` also catches it; it is for files whose size lies, such as `/proc`).
- Run (node 22.22.0, root): `npm test` 341 green, 0 `todo`; `check-build` ok.
- Not run: Node 18 and 20, macOS, Windows, CI, non-root, `npm run smoke` (no script changed).

## Round 24 — C3.5: `createZip`, the tree walk (v0.0.27)

- Source: `zipkit.mjs` only (about 40 lines added). `createZip(out, root, { exclude, symlinks, ...writeZipOptions }) -> { entries, bytes, skipped }`: depth-first walk with siblings sorted by name bytes (folders before their contents, empty folders kept, the root not an entry); `exclude(rel, { isDir })` (an excluded folder is not entered); symlinks never followed (`skip` reports, `error` refuses with `ESYMLINK`; `O_NOFOLLOW` catches a file swapped for a symlink after listing; `O_NONBLOCK` + `fstat` so a swapped-in FIFO cannot block); sockets, FIFOs and devices skipped as `special`; output inside the tree is `ERECURSE` (symlinks resolved, nearest existing ancestor); unsafe or non-UTF-8 names on disk are `EUNSAFE`. Design choices are D26, PROPOSED by Claude.
- Tests: new `test/create.test.mjs` (18; written first, the file could not even import before the code). Independent readers through `checkZip`. Mutants: 29, 26 red; 3 equivalent survivors: explicit sort (libuv's `readdir` already sorts by bytes on Unix; kept so the contract does not depend on the platform), the early `unsafeNameReason` check (`writeZip` refuses the same `EUNSAFE` later), and the `special` branch for lstat'd FIFOs (`readNoFollow` catches it anyway).
- Docs: ROADMAP D26, C3.5 closed; also fixed D25's text (still said "not yet confirmed" after round 23).
- Run (node 22.22.2, root): `npm test` 326 green, 0 `todo`; `check-build` ok.
- Not run: Node 18 and 20, macOS (FIFO, symlink and invalid-UTF-8 tests are Unix-specific; the last returns early where the filesystem refuses such names), Windows, CI, non-root, `npm run smoke` (no script changed).

## Round 23 — D25 confirmed (v0.0.26)

- Docs only. Rodrigo confirmed writing dates in UTC in deterministic mode (D25, 2026-10-09); ROADMAP D25 now says so. No code changed.
- Run: `check-build`, `npm test`. Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed).

## Round 22 — C3.4: determinism and dates in the writer (v0.0.25)

- Source: `zipkit.mjs` only (about 25 lines changed). `writeZip(out, sources, { deterministic, epoch })`: with `deterministic: true` the same sources give the same bytes on any machine, day and time zone. Dates come from `epoch`, else `SOURCE_DATE_EPOCH`, else each source's `mtime`, else 1980-01-01 00:00; written in UTC and clamped to 1980-01-01 00:00:00 .. 2107-12-31 23:59:58; modes become 0644 (0755 for folders and files with the owner execute bit); the order of the sources is kept. An invalid epoch (option or environment) and `epoch` without `deterministic` are refused with `EARG`; without the option nothing changes (local-time dates, "now", modes as given). Design choices are recorded as D25, PROPOSED by Claude, for Rodrigo to confirm or overturn.
- Tests: new `test/write-determinism.test.mjs` (15; written first, 11 red before the code, the other 4 are guards of unchanged behaviour). Independent reader: Python `zipfile` raw DOS fields and modes; time zones checked in child processes (UTC, Los Angeles, Kolkata, Auckland) with a check that the zones really differ; `unzip`, `zipinfo`, Python and the Chicla reader accept deterministic output. 3 expected values in my first draft were wrong (0-based months in `Date.UTC`), fixed in the tests, not in the code.
- Mutants: 21, 20 red; survivor: removing the `epoch > 8.64e12` bound (an absurd epoch is still refused with the same `EARG` through the invalid date; only the message changes, and tests assert codes).
- Opened C3.8 (write the UT extra so `mtime` round-trips exactly; today a deterministic zip read outside UTC shows a shifted time) and a risk line in ROADMAP §10.
- Run (node 22.22.0, root): `npm test` 308 green, 0 `todo`; `check-build` ok.
- Not run: Node 18 and 20, macOS, Windows, CI, non-root, `npm run smoke` (no script changed).

## Round 21 — C3.3: zip64 in the writer (v0.0.24)

- Source: `zipkit.mjs` only. `writeZip` writes zip64 records only where a value does not fit (65 535+ entries, a size or offset of 4 GiB-1 or more: 0xFFFF and 0xFFFFFFFF are the markers), for everything with `zip64: true`, and refuses with `EZIP64` with `zip64: false`; layout is computed before opening the file, so a refusal writes nothing. EZIP64 is no longer the default answer (round 20 refused all of it).
- Bug found by running a real 4.4 GB entry: Node's one-shot `deflateRawSync` wraps the input length modulo 2^32 (105 MB kept, no error) and `unzip -t` and Python still said OK; only the Chicla reader noticed. Fixed: data over 1 GiB is deflated and checksummed in blocks, writes go in 1 GiB slices (`fs.writeSync` limit). `deflateChunks` stops as soon as the output cannot be smaller.
- Tests: `test/write.test.mjs` (18, was 12): automatic switch at 65 535 entries, `zip64: false`, each trigger alone (count, directory offset, directory size), local and central extra layout, forced zip64, block path with a tiny block size. `bench/zip64-real.mjs` (new, by hand, about 5 GiB of memory): 4.4 GB deflated and stored, checked with `unzip -t`, Python, an independent CRC and the Chicla reader; both pass. 23 mutants, 21 red, survivors explained in the status file.
- Run (node 22.22.0, root): `npm test` 293 green, 0 `todo`; `check-build` ok; `bench/zip64-real.mjs` both modes green.
- Known, not fixed (not the writer's): Info-ZIP unzip 6.00 in a non-UTF-8 locale warns about UTF-8 names in zip64 entries (ROADMAP risks).
- Not run: Node 18 and 20, macOS, Windows, CI, non-root, `npm run smoke` (no script changed).

## Round 20 — C3.2: writer core, `writeZip` (v0.0.23)

- Source: `zipkit.mjs` only (about 75 lines added): `writeZip(out, sources, { level })`. Stored or deflate (deflate only where it shrinks the data; empty files and already-compressed extensions stored), bit 11 on non-ASCII names, names as given, CRC and sizes in the local header, `<out>.partial` + fsync + atomic rename, refuses unsafe names (EUNSAFE), repeated names (EDUP), bad arguments (EARG) and anything over the plain zip limits (EZIP64) before writing; modes keep permission bits only; dates clamped to 1980-2107.
- Tests: new `test/write.test.mjs` (12); the 7 `write-interop` tests ran for real for the first time (unzip, zipinfo, Python, Chicla reader). 16 mutants: 13 red; survivors explained in the status file. Bug found by a test of mine: 65 535 entries is the zip64 marker, so the limit is 65 534 (same for 0xFFFFFFFF); ROADMAP C3.3 and §5 corrected.
- Run (node 22.22.0, root): `npm test` 287 green, 0 `todo`; 65 534 entries also checked with `unzip -t` and Python. Smoke not needed (no script changed) and not run.
- Not run: Node 18 and 20, macOS, Windows, CI, non-root, files over 4 GiB.

## Round 19 — npm placeholders confirmed, repo URL recorded (D24) (v0.0.22)

- Docs only. D23 now says the placeholders are published (registry read: all three exist, created 2026-10-08T23:46Z, version `0.0.0-stage` instead of the `0.0.0` in the package files; cause unknown, harmless). New D24: repo `https://github.com/n4sc1m3nt0/chicla`. Status file and G-C1 updated.
- Run: the repo checks below; the registry read for the three names.
- Not run: whether the repo is public (GitHub is not reachable from the session), the `chicla` command check on a clean system, Node 18 and 20, macOS, Windows, CI, non-root.

## Round 18 — D23: npm names reserved by placeholder (v0.0.21)

- Docs only. ROADMAP gets D23 (placeholders `0.0.0` for `chicla`, `chicla-zip`, `chicla-kit`, published by Rodrigo; amends D12 only on the name; Homebrew: personal tap at the first release, no reservation exists). Status file and G-C1 updated.
- Outside the tree: `chicla-npm-reserve.zip` (three folders with `package.json` and README, plus a step-by-step in Portuguese). `UNLICENSED`, no `bin`, so G-C2 is not pre-empted.
- Run: `npm pack --dry-run` on the three placeholders (2 files each); the repo checks below.
- Not run: `npm publish` (needs Rodrigo's login and 2FA; so the names are NOT reserved yet), Node 18 and 20, macOS, Windows, CI, non-root.

## Round 17 — Rename Cairn to Chicla (D22) (v0.0.20)

- Rename only, no behaviour change. Folders `packages/chicla-zip` and `packages/chicla-kit`; package names; status file `CHICLA_PROJECT_STATUS-N.md` (regexes in `bump-round`, `check-manifest`, `verify-delivery-zip`, `emergency-dump`, `recovery-report`, `test/layout.test.mjs`); delivery zip name `chicla-roundN-…`; env vars `CHICLA_ZIP_JS_CRC`, `CHICLA_FUZZ_SEED`, `CHICLA_FUZZ_N`; temp folders `.chicla-tmp-*` in `zipkit.mjs`; recovery marker format `chicla-recovery-v1`; prose in CLAUDE.md, ROADMAP, status, docs.
- ROADMAP: new D22, D1 struck through, §0 name note and §14 q3 rewritten. Test payload `'chicla '` is 7 bytes, so `len / 6` became `len / 7` in the two helpers.
- Kept verbatim: older CHANGELOG entries and `docs/audits/AUDIT-1.md` (history, they still say Cairn and `cairn-zip`). Dumps made before this round carry `cairn-recovery-v1` and `cairn-EMERGENCY-` names; `recovery-report` now only warns about the old marker format (none are pending).
- Run (node 22.22.0, root): `npm test` 268 green, 7 `todo` (writer contract), `check-build` ok, `npm run smoke` all five green. Before `bump-round` two tests were red, as designed (fingerprint, manifest).
- Not run: Node 18 and 20, macOS, Windows, CI, non-root.

## Round 16 — Rodrigo's answers recorded (D18 to D21), empty deflate refused, Windows milestone M14 (v0.0.19)

- Source: `zipkit.mjs`, 2 edits: `unsupportedReason` refuses a deflate entry with 0 data bytes (D20, as `unzip`), so read, `testZip` and `extractZip` refuse it before writing; the special case that returned an empty file is gone. `zipfab.mjs` now writes the real 2-byte empty deflate stream instead of 0 bytes. New `test/deflate-empty.test.mjs` (3 tests; the refusal test was red first).
- ROADMAP/CLAUDE.md (docs): D18 English only (D8 cancelled, CLAUDE.md rule 6, C13.3 cancelled, new C0.4 for the scripts' Portuguese messages), D19 Windows milestone M14 with C14.1 to C14.5 and gate G-C8, D20, D21 (Cedar: separate project, origin and first user; §8 rewritten), D13 confirmed, §14 rewritten. Name: Chicla checked, NOT decided (§14 q3). New text is in English; the rest of ROADMAP.md is still Portuguese.
- Run (node 22.22.2, root): `npm test` 268 green, 7 `todo` (writer contract), `check-build` ok.
- Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed), non-root.

## Round 15 — C3.1: interoperability harness and writer contract, written first (v0.0.18)

- New tests only, `zipkit.mjs` unchanged. `test/interop.mjs`: `checkZip(path, expected)` runs `unzip -t`, `zipinfo`, Python `zipfile` and the Cairn reader (7z if installed) and returns what each said; a missing tool is `ran: false`, never a pass.
- `interop.test.mjs` (6 tests) tests the harness: accepts zips made by Python, Info-ZIP `zip` and the fabricator; each reader fails on its own on a flipped byte and on a truncated zip; missing, extra and different content are reported.
- `write-interop.test.mjs` (7 tests): provisional `writeZip(out, sources)` contract, `todo` until C3.2 exports it. Red against a deliberately bad writer (7 of 7); green against a Python-based reference writer (7 of 7); both stubs removed.
- Found, not fixed (outside the card): the reader accepts a deflate entry with 0 data bytes; `unzip` rejects it, Python accepts it (ROADMAP §14, question 10). The writer must store empty files (noted in C3.2).
- Run (node 22.22.2, root): `npm test` (numbers in the reply); `check-build` ok.
- Not run: 7z (not installed here), Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed).

## Round 14 — C2.6: `legacyEncoding` in `extractZip`; D16 and D17 recorded (v0.0.17)

- Source: `zipkit.mjs` only, 1 line: `extractZip` takes `legacyEncoding` and passes it to `listZip`. Default stays cp437; a bad label is `EBADARG` before anything is created.
- New `test/extract-legacy.test.mjs` (3 tests, all red before the code; the mutant "not passed on" turns them red again).
- Decisions taken by Claude on Rodrigo's delegation ("apply what you think best"), open to reversal: D16 (keep `ECOLLISION`, fix the ROADMAP §5 text), D17 (never sweep `.cairn-tmp-*`). §14 questions 8 and 9 closed; AUDIT-1 open items updated.
- Run (node 22.22.2, root): `npm test` and `check-build` (numbers in the reply); bench unchanged path.
- Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed), non-root for the new tests.

## Round 13 — AUDIT-1 of M2: two real bugs fixed, tests for unprotected guarantees, four cards scheduled (v0.0.16)

- `docs/audits/AUDIT-1.md`: promised vs. exists, 34 mutants, non-root run, open items. ROADMAP: cards C2.6 to C2.8 and questions 8 and 9 (§14).
- Source: `zipkit.mjs` only, 5 lines. A-1: extraction into the root of a mounted volume failed with `EXDEV` (temp folder is now inside the destination when its parent is on another device). A-2: temp folder made unusable by a restrictive umask for non-root (`chmod 0o700` after `mkdtemp`).
- Tests: new `extract-audit1.test.mjs` (setuid/setgid/sticky stripped, empty entry declaring bytes, mount-point destination); `extract-fast.test.mjs` umask test fixed (it only passed as root). Mutants P1, P2, P6, R1, X1 were green before and are red now.
- Survivors accepted as equivalent or unreachable on Linux: A4, A5, A6, A14, S3, P3, P4 (reasons in the audit).
- Run (node 22.22.2, root): `npm test` 255 green; `check-build` ok; bench 2.9x (budget 3x). Non-root (uid 65534): M2 suites 242 green, 1 skipped (mount test needs root).
- Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed). The mount test is skipped where no writable mount pair exists (CI as non-root).

## Round 12 — C2.5: collisions reported per path, with a wider case fold; last card of M2 (v0.0.15)

- Source: `zipkit.mjs` only (about 12 lines): helpers `foldName` and `noteName`; `extractZip` now groups PATHS (files, explicit folder entries and the folders implied by a file's path; folders spelled with a trailing «/») instead of raw entry names. Result shape unchanged (`collisions`: array of arrays of spellings); a member is now the normalised path (`./a` gives `a`), not the raw entry name.
- Fixed: a file and a folder that differ only in case or NFC/NFD (`a` + `A/b.txt`) were not reported (the folder had no entry of its own); Greek final sigma (`ΑΣ`, `ας`, `ασ`) escaped `toLowerCase`. Fold = NFC, upper, lower, NFC; plain ASCII skips the normalisation.
- Policy chosen here, not fixed by the roadmap: a group is reported when it has 2+ spellings and at least one is a file or an explicit folder entry; a group made only of implied parent folders merges without loss and is not reported. Known over-report: `ß` vs `ss` (upper-casing turns `ß` into `SS`); advisory only, not checked against APFS or NTFS.
- New `packages/cairn-zip/test/collisions.test.mjs` (8 tests; 4 red before the code, 4 pin existing behaviour). Break-on-purpose, 4 mutants (no `real` condition, `toLowerCase` only, implied folders not noted, no NFC), each turned its tests red.
- Run (node 22.22.2): `npm test` 252 green; `check-build` ok; `TMPDIR=/dev/shm node packages/cairn-zip/bench/small-files.mjs --budget 3`: 2.7x.
- Not run: `npm test` on Node 18 and 20; macOS and Windows (what the OS itself does with these names is unverified; the new tests accept a `ZipError` from a case-insensitive file system); CI; `npm run smoke` (no script changed); extraction as a non-root user. No file deleted.

## Round 11 — C2.4: escape oracle and extraction fuzz; the fuzz found one bug, fixed (v0.0.14)

- New `packages/cairn-zip/test/extract-escape.test.mjs` (84 tests). The oracle builds a world (destination, parent, sibling, an `outside` folder with a secret and a symlink to it) and compares a snapshot of everything outside the destination before and after; it has a self-check that must see a planted leak. Cases: 20 hostile names x 3 destination states, 16 odd-but-contained names, symlink entries, symlinks already inside the destination, failure halfway. Seeded fuzz (`CAIRN_FUZZ_SEED`, default 20261008; `CAIRN_FUZZ_N`, default 400).
- BUG found by the fuzz (seed 20261008, case 64): a folder name over 255 bytes made `mkdirSync` throw a raw `ENAMETOOLONG` through `extractZip` (breaks product rule 2). No leak (the temp folder was removed). Fix in `zipkit.mjs`: one `catch` in `extractZip` turns any non-`ZipError` into `ZipError` (`EZIP`, original kept in `cause`); `ZipError` now accepts `cause`. Test written first and seen red.
- Break-on-purpose, 9 mutants, each turned the suite red: no `..` check, no absolute-path, backslash, NUL or drive-letter check, merge ignoring a symlink in the destination, temp folder never removed, fs errors not wrapped, symlink entries not skipped. NOT mutated: the symlink check inside `ensureDir` (the temp tree is fresh, so it can only be reached by a race).
- Also run: fuzz with seeds 1, 2, 3, 7, 42, 99 x 1500 cases, all green; `small-files.mjs --budget 3` x3 after the change: 2.8x, 2.9x, 2.7x.
- Not run: `npm test` on Node 18 and 20 (only 22.22.2 here); macOS; CI; `npm run smoke` (no script changed); extraction as a non-root user (this sandbox may run as root, so permission-denied paths are untested).

## Round 10 — C2.3 closed: budget for 20 000 small files set to 3x (D15; no source change)

- Decision by Rodrigo: the 20 000-small-files budget goes from 2x to 3x `unzip` (tmpfs). New decision D15 in `ROADMAP.md`; §5 budget line, card C2.3 and finding B4 updated; B4 is now closed.
- No code change: `zipkit.mjs` is byte-identical to rounds 8 and 9. `packages/cairn-zip/bench/small-files.mjs` only had its comment changed (budget 3).
- Check run: `TMPDIR=/dev/shm node packages/cairn-zip/bench/small-files.mjs --budget 3`, three times, node v22.22.2: ratio 2.7x, 2.9x, 2.7x (unzip 0.27-0.28 s, extractZip 0.72-0.81 s), exit 0 each time. The margin is small (2.9x against 3x), and `unzip` timing is noisy on this machine; if it goes red on another machine, report it, do not loosen the budget silently.
- Next: C2.4 (escape oracle and extraction fuzz), then C2.5.
- Not run: `npm test` on Node 18 and 20 (only 22.22.2 here); macOS; CI for this round; `npm run smoke` (no script changed); the bench on a quiet disk or on a Mac.

## Round 9 — C2.3 measured again: syscall cuts give no gain (2x budget still NOT met; no source change)

- Tried two cuts to the ~8 syscalls per small file: one read for the local header plus data (with fallback to `dataStart`), and `fchmod` only when `fstat` shows the mode is not already right. Tests stayed green.
- Measured A/B, old against new and `unzip` interleaved in one process (20 000 files, tmpfs, 8 runs): old min 0.87 s, new min 0.95 s, `unzip` 0.39 s. No gain beyond noise, so both cuts were reverted: `zipkit.mjs` is byte-identical to round 8.
- Profile (`--cpu-prof`, 6 extractions): GC 12%, `open` 11%, `writeBuffer` 7%, zlib handle 5%; nothing dominant is left to remove without leaving this slice (for example worker threads). Ratio on this machine 2.2–2.6x, moved by `unzip` timing noise.
- Tests added (they pass on the round-8 code and protect any future change): local extra field longer, shorter or absent against the central one (`extract-fast.test.mjs`, uses the new `localExtra` option of `test/zipfab.mjs`); final mode of small files for 5 umasks x 8 modes. Mutants: fchmod removed (killed by 2 tests), local extra ignored in `dataStart` (killed by 1).
- Decision for Rodrigo, not taken here: keep the 2x budget (needs a bigger design) or set it to 3x. C2.3 stays open.
- Round 8 CI was reported green by Rodrigo; not checked by me.
- Not run: Node 18 and 20 (only 22.22.2 here); macOS; CI for these tests; `npm run smoke` (no script changed); permission cases (root).

## Round 8 — C2.3 fast path for small entries and folder cache (2x budget NOT met yet)

- Measured first (B4, 20 000 small files, Node 22.22.2): `unzip` 0.26 s, `extractZip` 3.8–4.6 s on tmpfs (~15x) and 24.3x on this disk. Profile: per-file stream pipeline (idle waits, open/close, stream teardown) and one `lstat` per folder segment, not CRC.
- Tests first: `test/extract-fast.test.mjs` (43; sizes 0 B to 1 MiB, stored and deflate, against Python `zipfile`; modes and dates; 7 kinds of bad entry at 5 sizes; shared folders; file/folder clash; NFC/NFD collision). All green on the old code too: they guard what the fast path must keep. Speed is `packages/cairn-zip/bench/small-files.mjs` (red before: 24.3x against 2x).
- `zipkit.mjs` (about 35 changed lines): entries with compressed and declared size <= 256 KiB are read, inflated (bounded by the declared size) and checked (size, CRC) in memory, then written with one exclusive open, mode and date set through the descriptor; EEXIST falls through to the old diagnosis. `ensureDir` keeps a cache of folders already checked. `readAt` no longer zero-fills. Bigger entries use the old streams.
- Result: tmpfs 2.1–2.8x `unzip` (was ~15x); on this disk 6.4 s against 11 s for the old code, while the disk made `unzip` itself take 2–6 s. The 2x budget is NOT reliably met, so C2.3 stays open (remaining cost: the zlib handle per entry, GC, about 8 syscalls per file).
- Mutants: 12 run (base green first), 5 killed, 7 survive: no `maxOutputLength` and threshold on/off (they only change memory and speed; the bench sees speed), `made` not recorded and the EEXIST fall-through (reachable only on case/NFC-insensitive file systems: the Mac re-run), partial file after a write error (needs a write fault), cache remembered before the check (equivalent: the error aborts the run).
- Not run: Node 18 and 20 (only 22.22.2 here); macOS for this code (G-C3 was closed by Rodrigo on round-7 code); CI; `npm run smoke` (no script changed); permission-based cases (root); the bench on a quiet disk.

## Round 7 — C2.1 atomic extraction and C2.2 pre-validation

- Tests first: `packages/cairn-zip/test/extract.test.mjs` (32 tests; there were none for extraction). Oracle: snapshots of the parent folder before and after, plus Python `zipfile` extracting the same zip for a tree comparison. 17 were red on the old code (halfway failures left files behind, file/folder conflicts only failed midway, an entry `.` was dropped silently, a destination that is a file threw a raw error); the others guard behaviour that already held.
- `zipkit.mjs` (about 60 changed lines): `extractZip` now extracts into a fresh `.cairn-tmp-*` folder next to the destination, and only after every file is written and verified does it either rename it into place (new destination, missing parents created) or merge it into an existing folder. The merge plans every conflict first (existing file without `overwrite`, file/folder mismatch, symlink in the destination) and then renames, so a bad zip or a conflict writes nothing. Pre-validation adds file-vs-folder conflicts (any order, implied parents included), duplicates by normalised path (`a/b` vs `./a//b`) and reports an entry `.` in `skipped`. Fixes B2, B3 and B6 of the roadmap audit.
- Found while testing, fixed: when the data of an entry lay outside the file, `extractZip` had already created the write stream, which opened its file after the cleanup and raised an unhandled error. The data is now checked before the stream exists.
- Behaviour changes to know about: a destination that exists and is not a folder is refused (`EEXIST`); an entry `.` no longer sets the destination's mode or mtime; an existing destination keeps its own mode; `dirs` in the result counts folders created in the temp tree (it can include ones that already existed in a merge); the extracted tree is only complete in the destination at the end, not file by file.
- Mutants: 20 run on the new guarantees (base checked green first), 0 survivors after two fixes: a test for symlinks inside the destination, and the dead `unlink` before a replace removed (rename already replaces atomically on POSIX).
- Not run: the session runs as root (uid 0), so nothing that depends on file permissions was tested, including the fallback that puts the temp folder inside the destination when its parent is not writable; Node 18 and 20; macOS (rename over case/NFC-insensitive volumes); a destination on a different volume than its parent (rename across devices); CI (the repo is not on GitHub yet); `npm run smoke` (no script changed). `extractZip` still reads names as cp437 (`legacyEncoding` is not wired into it yet).

## Round 6 — windows-1252 decoded by Cairn, not by TextDecoder

- Found in round 5: `legacy-encoding.test.mjs` "windows-1252 decodes the same bytes differently from cp437" was red on Node 22.22.0 (here `TextDecoder("windows-1252")` decodes 0x80-0x9F as latin1 C1 controls, so 0x82 stayed 0x82 instead of ‚). The test was right; the code depended on the runtime.
- Tests first: 2 added (the whole 0x80-0x9F block for `windows-1252`, `cp1252`, `latin1`, `iso-8859-1`, expectation generated with Python's cp1252; and `iso-8859-2` unaffected). Seen failing with the old code, together with the existing red test.
- `zipkit.mjs` (about 6 lines): when the label resolves to `windows-1252`, names go through an own table (`decodeCp1252`, WHATWG mapping); every other label still uses `TextDecoder`. The suite is 72 of 72 green here.
- Mutants: 7 run on the table, the range and the branch (base checked green first), 0 survivors.
- Not run: Node 18 and 20 and macOS (other `TextDecoder` builds are exactly why the table is now our own); CI (the repo is not on GitHub yet); `npm run smoke` (no script changed). Still open from round 5: a plain zip with exactly 65535 entries and no zip64 record is refused.

## Round 5 — C1.5 zip64 reading and clear refusals

- Tests first: `packages/cairn-zip/test/zip64.test.mjs` (17 tests) and a zip64 mode in `test/zipfab.mjs` (EOCD64 record and locator, 0x0001 extra with any subset of fields, raw or missing extra, lying values). Seen failing before the code: 5 red (short extra, sentinel without extra, locator disk counts, record size, impossible entry count); the rest are regression guards on code the draft already had. The fabricator is checked by Python `zipfile` (test 1).
- `zipkit.mjs` (about 12 lines): a short or missing 0x0001 extra is a `ZipError` (it was a raw `RangeError` or a silent 0xffffffff size); the locator's disk fields refuse multi-part; the zip64 record must declare at least 44 bytes; an entry count that cannot fit in the central directory is refused before parsing (also on plain zips). M1 is closed.
- Mutants: 18 run, 1 survivor (equivalent: the central-directory-outside-file check is also caught by `readAt` as a truncated zip). A first run claimed 0 survivors but was invalid: one of my new tests was red on the unmutated code (the locator disk check used `> 1`; fixed to `> 0`), so every mutant looked killed. The script now refuses to run on a red baseline. The re-run found one real hole (a file that is only an end record asking for zip64), now covered.
- Outside the task, not touched: `legacy-encoding.test.mjs` "windows-1252 decodes the same bytes differently from cp437" FAILS on Node 22.22.0 here (`TextDecoder("windows-1252")` returns 0x82 unchanged, as latin1); it passed in round 3. Also not handled: a plain zip with exactly 65535 entries and no zip64 record is refused ("zip64 without locator").
- Not run: real zip64 data above 4 GiB (only declared sizes and offsets were fabricated); `unzip`/Python on zips with >4 GiB; Node 18 and 20; macOS; CI (the repo is not on GitHub yet); `npm run smoke` (no script changed).

## Round 4 — C1.4 CRC-32 via zlib.crc32

- Tests first: `packages/cairn-zip/test/crc.test.mjs` (8 tests), failing on the missing exports. Known vectors, random data of 17 sizes, incremental splits, typed-array views with an offset, a 3 MB buffer, selection logic with a fake native function, and a child process that runs the read, open and legacy suites with `CAIRN_ZIP_JS_CRC=1`.
- `zipkit.mjs`: `crc32Js` (the old table version), `makeCrc32(native)` and `crc32` / `crc32Source` chosen at load: `zlib.crc32` if it is a function, else JS. `CAIRN_ZIP_JS_CRC=1` forces JS. Same contract as before (`crc32(buf, prev = 0)`).
- Confirmed from the Node release notes: `zlib.crc32` exists from 22.2.0 and 20.15.0, not on 18 (ROADMAP C1.4 row updated). One run here (Node 22, 100 MB): native 52 ms, JS 317 ms, same value; a single measurement, not a benchmark.
- Mutants: 11 run, 0 survivors. One of them (view offset) is broader than the guarantee it names, so that test is a regression guard, not proven.
- Not run: Node 18 and 20, where the JS fallback and the 20.15+ native path really matter (the forced-JS child run covers the fallback only on Node 22); macOS; CI (the repo is not on GitHub yet); `npm run smoke` was run, no script changed.

## Round 3 — C1.3 legacyEncoding

- Tests first: `packages/cairn-zip/test/legacy-encoding.test.mjs` (9 tests); 5 failed before the code, the 4 that passed are regression guards (cp437 default, the other name steps untouched, `flagMissing`, `maxBytes`).
- `zipkit.mjs`: `openZip(path, { legacyEncoding })`, also accepted by `listZip` and `readZipFile` (which now destructures `{ maxBytes, legacyEncoding }`). Default `cp437` (own table, aliases `ibm437`, case and spaces ignored); any other label goes through `TextDecoder` (`nameSource: "legacy"`); unknown labels, non-strings and Unicode encodings fail with `EBADARG` before a descriptor is opened. Only the last step of the name precedence changes.
- Mutants: 14 run, 13 killed. The survivor is the `parseEntries` default parameter, only used by `markUtf8Names`, which never reaches the legacy step (equivalent).
- Not wired yet: `testZip`, `extractZip` and the CLI still read names as cp437 (they call `listZip` without options); that belongs with M2 / C4.2.
- Not run: the descriptor tests check nothing outside Linux (`/proc/self/fd`). `npm test` and `npm run smoke` on Node 18 and 20 and on macOS; CI (the repo is not on GitHub yet). `TextDecoder` label support was only seen on Node 22.

## Round 2 — C1.2 openZip handle

- Tests first: `packages/cairn-zip/test/open.test.mjs` (9 tests), seen failing (no `openZip` export). One of them wipes the on-disk central directory behind an open handle and checks that `read()` still works, which proves the directory is not read again (B4 cause); two count open descriptors via `/proc/self/fd`.
- `zipkit.mjs`: `readCentral` returns `cdOff`; new `openZip(path)` → `{ path, size, cdOff, entries, read(name, {maxBytes}), close() }` (sync, `ECLOSED` after close, close idempotent); `listZip` and `readZipFile` are now thin wrappers over it. The 27 read tests pass unchanged.
- Mutants: 27 run (8 on the handle, 19 on the C1.1 guarantees re-run on the moved code). First run left 2 survivors (wrappers leaking the descriptor): a real hole in my tests, closed with a wrapper leak test; now 0 survivors. The 4 equivalent survivors of round 1 are unchanged.
- Not run: the descriptor-leak tests only check anything where `/proc/self/fd` exists (Linux); on macOS they pass without checking. `npm test` and `npm run smoke` on Node 18 and 20 and on macOS; CI (the repo is not on GitHub yet). No benchmark of B4 (20 000 files) was run.

## Round 1a — English comments and messages in zipkit.mjs

- `packages/cairn-zip/src/zipkit.mjs`: every comment, error message and CLI string translated from Portuguese to English (decision by Rodrigo; code is English). No identifier, logic or error code changed.
- Checked: `node --check`; the 27 read tests still pass (they assert classes and codes, not message text); a comment/string-stripped comparison with the previous file differs only in comment and message text (4 lines flagged by that crude check, all inspected by hand); no Portuguese words left outside the cp437 table.
- Messages are still inline strings. D8 (keys, pt and en) and C13.3 are unchanged.
- Outside the task, not touched: `scripts/*.mjs` and their tests still carry Portuguese messages (inherited from the original project).
- Not run: `npm test` and `npm run smoke` on Node 18 and 20 and on macOS; CI (the repo is not on GitHub yet).

## Round 1 — C1.1 read tests and the zipkit draft

- Tests first: `packages/cairn-zip/test/read.test.mjs` (27 tests: name precedence incl. 0x7075 with CRC, `listZip`, `readZipFile`, `testZip`, refusals) and `test/zipfab.mjs` (fabricates zips byte by byte, own CRC-32, no `zip` needed). Seen failing first (module missing).
- Code: the draft entered verbatim as `packages/cairn-zip/src/zipkit.mjs`; the only change is `Transform.from([])` → `Readable.from([])` (2 lines). The original stays untouched in `docs/`.
- B7 could NOT be reproduced: on Node 22 `Transform.from` exists (inherited from `Duplex.from`) and the empty-entry test passes before and after the fix. The replacement is kept as hardening; no test goes red because of it.
- All 27 tests passed against the unfixed draft, so they were red only for the missing module. Mutants run on 23 read guarantees: 19 killed, 4 survived, all redundant guards with the same observable outcome (inflate output cap, data-past-EOF, central-directory bounds, stream oversize guard).
- Known gaps: zip64 reading untested (C1.5), no `legacyEncoding` (C1.3). The draft's messages and comments are in Portuguese (D8 / C13.3 moves messages to keys).
- Not run: `npm test` and `npm run smoke` on Node 18 and 20 and on macOS; CI (the repo is not on GitHub yet).

## Round 0a — reference docs

- `docs/zipkit-plan-ronda-1s.md` and `docs/zipkit-RASCUNHO.mjs` added verbatim (copies checked with `cmp`), plus `docs/README.md` saying what they are. Docs only; no code, no script, no test changed.
- The draft is not wired in. C1.1 (R1) still has to take it into `packages/cairn-zip/` and fix B7 (`Transform.from([])`).
- Not run: `npm test` and `npm run smoke` on Node 18 and 20 and on macOS; CI (the repo is not on GitHub yet).

## Round 0 — foundation (C0.1 to C0.3)

- C0.1: monorepo (`cairn-zip`, `cairn-kit`), Node 18+, ESM, zero dependencies; CI on Node 18/20/22, Linux and macOS, running `npm test`, `check-manifest`, `bump-round --verify` and `npm run smoke`.
- C0.2: 8 workflow scripts and 5 smoke tests adapted from the original project: names, `package.json` as root marker, `version.mjs` as app leg (D13), `check-build` is now `node --check`, Cargo `target/` rule removed. The `corpus/real-world` and `corpus/huge` rules stay until C6.1.
- C0.3: `CLAUDE.md`, status file with the 19-item instructions block, `CHANGELOG.md` and `ROADMAP.md` in the root (D14).
- Tests: `test/layout.test.mjs` (11), written first and seen failing; smoke tests pass (43 checks in delivery-guards). Mutants run on each new guarantee; one survivor (zip wrapped in a folder) found and covered.
- Over the usual size cap: a mechanical rename across 13 scripts. Authored logic is only `check-build.mjs`, `version.mjs` and test fixtures.
- Not run: `npm test` and `npm run smoke` on Node 18 and 20 and on macOS; CI (the repo is not on GitHub yet).
