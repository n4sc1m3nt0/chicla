<!-- CHANGELOG_FINGERPRINT: seq=165 file=CHICLA_PROJECT_STATUS-165.md app_sha256_12=065d37032ef1 changelog_sha256_12=70358d4ced48 (bump-round.mjs: app hash unchanged, changelog hash recomputed) -->
# Changelog

## Round 161 — M14 D115: the `windows` CI job blocks (v0.0.164)

- Task: D115 (confirmed «d115 sim», condition: two green `windows` logs in a row). Sixteenth CI log read (round 160 code): Ubuntu and macOS green (1093 tests, 0 fail), `bench` and `pack` ok; Windows 0 red on Node 18, 20, 22 (`chicla-zip` 630 pass, 20 skipped; `chicla-kit` 169 pass); the `fuzz-read` `EPERM` flake did not come back.
- `.github/workflows/ci.yml`: `continue-on-error` removed from the `windows` job; the kit step is now «chicla-kit suite (C14.6)» (still `if: always()`). `test/ci.test.mjs`: 2 tests changed, 2 new (3 red first). 7 hand mutants of the YAML, all red.
- No source changed, the pin did not move. A red on Windows now turns the run red; `chicla-kit` is still NOT declared supported there (D114).
- NOT run: the first CI run with the job blocking, anything on a real Windows or macOS machine, `npm test` on Node 18 and 20 here, `npm run smoke`, `npm run mutants`.

## Round 160 — docs only: D114 and D115 confirmed (v0.0.163)

- Task: record Rodrigo's answer «d114 sim, d115 sim» (CLAUDE.md rule 6). `ROADMAP.md`: D114 is CONFIRMED; D115 is CONFIRMED as suggested (the `windows` job flips to blocking after the NEXT log is also green, a round of its own, not built). Status file: Snapshot, Last updated, Next up.
- No source, no test changed, the pin did not move.
- NOT run: CI of this round, anything on a real Windows or macOS machine, `npm test` on Node 18 and 20 here, `npm run smoke`, `npm run mutants`.

## Round 159 — M14 C14.5 slice (b): the Windows support statement for `chicla-zip` (v0.0.162)

- Task: C14.5 (b) (D108) and the close of C14.7. Fifteenth CI log read (round 158 code): Ubuntu and macOS green (1093 tests, 0 fail), `bench` and `pack` ok; Windows 0 red on Node 18, 20 and 22: `chicla-zip` 630 pass, 20 skipped, `chicla-kit` 169 pass, 0 skipped (it was 4 red of 165).
- Docs only: `README.md`, `packages/chicla-zip/README.md` (new «Windows» section: Node 18, 20, 22, CI only, names refused before writing, `--windows-names`, not covered: paths over 260 characters and FAT/exFAT), `ROADMAP.md` (§11, §12, risk line, C11.4 closed as never built, C14.5 and C14.7 rows, D114 on delegation, D115 proposed). `chicla-kit` is NOT declared supported (D108, D114).
- No source and no test changed, the pin did not move. G-C11 is due now (Rodrigo\'s, D110).
- NOT run: anything on a real Windows or macOS machine, `npm test` of the root on Node 18 and 20 here, `npm run smoke`, `npm run mutants`, CI of this round.

## Round 158 — M14 C14.7 slice 2: `leaf`, the last part of a path on Windows (v0.0.161)

- Task: C14.7 (D113). Fourteenth CI log read (round 157 code): Ubuntu and macOS green (1089 tests, 0 fail), `bench` and `pack` ok; `chicla-zip` on Windows 630 pass, 0 fail on Node 18, 20 and 22 (the `fuzz-read` `EPERM` of the last log did not come back); `chicla-kit` on Windows 161 pass, 4 fail of 165 on all three Nodes (it was 27 of 157: slice 1 fixed 23).
- The 4 left are ONE cause: five places took the last part of a PATH with `p.split("/").pop()`, wrong on win32. Two tests of `verify-delivery --against` print «nothing lost vs C:\…\prev.zip» instead of the file name; one of `recovery-report --baseline` prints «baseline C:\…\base.zip»; and one is a SAFETY gap, not a message: `HERE.split("/").pop() === "RECOVER"` was never true on Windows, so a recovery run from a `RECOVER/` folder SKIPPED the toolchain digest check (`EHASH_TOOLCHAIN`, exit 3) and ran (exit 0). Found by reading the log against the code.
- Fix: `leaf(p, pm = path)` exported from `packages/chicla-kit/src/pinned/manifest.mjs` (both modules already import it) and used at the five places: `verify-delivery.mjs` (2), `pinned/recovery-report.mjs` (3, among them the RECOVER check). It is `basename` of the platform, never a split on a literal backslash (a backslash in a POSIX name stays).
- Tests first (red, `SyntaxError` for the missing export): `core-leaf.test.mjs` (4: `path.win32` and `path.posix` on Linux, plus a shape guard that the two sources no longer split a path by hand and that RECOVER is recognised through `leaf`). 7 hand mutants (helper splits by hand, helper ignores `pm`, each of the five call sites reverted): all red. Kit suite on Linux 169 tests: the only red was the pin test, as it must be before `bump-round`.
- The first full `npm test` after the edit had 3 red, all in the historical move tests `test/pinned-manifest-move.test.mjs` and `test/pinned-recovery-report-move.test.mjs` (they fix the sha256 of the pinned files as they were when moved, and the export list of `manifest`): reworked, not loosened: each now reverses exactly the C14.7 edit and must still give the old sha256, so any OTHER change to those two files stays red (checked with an extra line in each); `leaf` added to the export list. Full run after that: see below.
- THE PIN MOVED (two RECOVER files: `pinned/manifest.mjs`, `pinned/recovery-report.mjs`): `bump-round` wrote the new digest. G-C11 (Rodrigo\'s, at the end of C14.5, D110) now has a new pin to check.
- NOT run: anything on Windows or macOS (the Windows effect is proven only by the next CI log, G-C13; the shape guard cannot prove it), `npm test` of the root on Node 18 and 20, `npm run smoke`, `npm run mutants`.

## Round 157 — M14 C14.7 slice 1: the dump on Windows and the python probe of the kit tests (v0.0.160)

- Task: C14.7 (D113). Thirteenth CI log read (round 156 code: `.gitattributes`): Ubuntu and macOS green (1080 tests, 0 fail), `bench` and `pack` ok; `chicla-zip` on Windows 630 pass, 0 fail on Node 20 and 22, and ONE fail on Node 18 (`fuzz-read`, case i=267: `EPERM` on `lstat` of a `f.zip` written a moment before, not seen on 20, 22 or in the earlier logs: logged as an observation, no change; if it comes back it gets its own look). `chicla-kit` on Windows: 130 pass, 27 fail of 157 (it was 34 of 145): D112 fixed 14 and made 12 more tests visible (the whole `cli-verify-delivery` file used to fail as ONE test), 7 of them red.
- Two causes of the 27, found by reading the log against the code. (1) Code: the dump core made `rel` with `path.relative` (backslashes on win32) and compared and split it with «/» (project root = `FILES.manifest` + `package.json`, `dir.split("/")`, `projRel`): on Windows no project root, zip named `afterRoundunknown`, «no project root found». (2) Tests: four `cli-*` kit tests found python with `sh -c 'command -v python3'`, which on the runner prints a POSIX path Node cannot spawn: `null !== 0` in 20 tests (the tests did not skip because the string was not empty).
- Fix 1: `relPosix(root, p, pm = path)` exported from `packages/chicla-kit/src/emergency-dump.mjs`, used at the two places the scan makes a `rel` (the `.split(sep).join("/")` of the held list and the zip entry name, now redundant, are gone). It splits on the platform's `sep`, never on a literal backslash: a backslash in a POSIX file name stays. Fix 2: `test/python-probe.mjs` (`findPython`: `python3`, then `python`, first that can `import zipfile`, no shell) in `cli-dump`, `cli-recovery`, `cli-verify-delivery`, `cli-make-delivery`.
- Tests first: `core-dump-winpaths.test.mjs` (4, with `path.win32` on Linux, plus a shape guard that the core calls `relative(` once) and `python-probe.test.mjs` (4, with a fake runner, and a guard that no `cli-*` test uses `command -v` again): both files red before. 9 hand mutants (no conversion, literal-backslash split, `pm` ignored, each of the two call sites bare, no `python` fallback, any result accepted, no `zipfile` check, a test back on `sh`): all red. Kit suite on Linux 165/165.
- Source changed: `packages/chicla-kit/src/emergency-dump.mjs` only; the pin: see the status file.
- NOT run: anything on Windows or macOS (the Windows effect is proven only by the next CI log, G-C13; the shape guard cannot prove it), `npm test` of the root on Node 18 and 20, `npm run smoke`, `npm run mutants`. NOT touched: `pinned/recovery-report.mjs` (it also builds a path with `relative(root, p)`; whether that matters is read from the next log), the root `test/*.test.mjs` that still use `sh` for python (they do not run on the Windows job).

## Round 156 — M14 D112: `.gitattributes`, every checkout is LF (v0.0.159)

- Task: D112 (confirmed by Rodrigo, «d112 sim»; D113 confirmed too, «d113 sim»), from the round 155 CI log (the eleventh/twelfth runs): `chicla-zip` green on Windows (630 pass, 20 skipped, 0 fail on Node 18, 20, 22); `chicla-kit` on the new Windows step: 111 pass, 34 fail on all three Nodes. 15 of the 34 are CRLF (no `.gitattributes`, the runner's `core.autocrlf=true`: `FILES.manifest` lines ended in `\r`, the shebang test, `make-delivery`, `verify-delivery`, `bump-round`, `check-manifest`), reproduced on Linux on a CRLF copy of the tree before any change. The other 19 are `emergency-dump` and `recovery-report` (C14.7, D113).
- Tests first: `test/gitattributes.test.mjs` (4; 3 red first; the control shows that without the file `core.autocrlf=true` gives CRLF, with real `git`). New file: `.gitattributes` (`* text=auto eol=lf`, `*.zip`, `*.tgz`, `*.png` binary). 6 hand mutants of it, all red.
- Source: none; the pin did not move. ROADMAP: D112, D113 and card C14.7.
- NOT run: the fix on Windows (the next push shows how many of the 15 go away), the 19 dump/recovery failures (not diagnosed), `npm test` on Node 18 and 20, `npm run smoke`, `npm run mutants`, macOS.

## Round 155 — M14 C14.6: the `chicla-kit` suite in the `windows` CI job (v0.0.158)

- Task: C14.6 (D109). D111 confirmed by Rodrigo («d111 sim»). The `windows` job gets a second step, `node --test packages/chicla-kit/test/*.test.mjs`, named after chicla-kit, `if: always()` (a red chicla-zip step never hides it) and `timeout-minutes: 8`; the job stays `continue-on-error` (D99). `chicla-kit` has never run on Windows: this round only makes the CI show what fails.
- Tests first (2 red, 1 guard): `test/ci.test.mjs` +3. Source: none (`.github/workflows/ci.yml` only), the pin did not move. 5 hand mutants of the YAML (no `if`, wrong glob, no step timeout, no name, no `continue-on-error`) all red.
- NOT run: the job itself (it needs GitHub: next push, then Rodrigo sends the log; G-C13), anything on Windows or macOS, `npm test` on Node 18 and 20, `npm run smoke`, `npm run mutants`.

## Round 154 — M14 C14.5 slice (a): `--windows-names` and the Windows warning in `test` (v0.0.157)

- Task: C14.5 slice (a) (D98, D108): `extract` and `create` take `--windows-names` (= `windowsNames: true` on any platform; without it the default stays «on only on win32»); `chicla-zip test` reports names not valid on Windows as a warning (text line and `warnings.windowsNames` in `--json`, every platform, exit code unchanged). The eleventh CI log (`logs_105045336148-2`) was read: same counts as round 153 (Ubuntu 1059, macOS 1052 pass, 0 fail; Windows 620 pass, 18 skipped, 0 fail on Node 18, 20, 22), nothing new.
- Tests first (11 red): `cli-windows-names.test.mjs` (12); `cli.test.mjs` two deep-equal checks of the `test --json` warnings now include `windowsNames: []` (D111).
- Source: `packages/chicla-zip/src/zipkit.mjs` only (usage line, `CMDS`, the `test` command, one option each on `extract` and `create`). The pin MOVED (G-C11 due, at the end of C14.5 by D110).
- 13 hand mutants `C14.5-*` in `mutants/list.mjs`, each run alone: 12 red at once, 1 survived (`test-text-escape`: the test put the control-character name past the five shown), test tightened, then red. Not run: the full `npm run mutants`.
- NOT run: anything on Windows or macOS, `npm test` on Node 18 and 20, `npm run smoke` (no script changed), CI. Gates G-C11, G-C12, G-C13, G-C4 are Rodrigo's.

## Round 153 — M14: C14.3 closed, test 128 explained, C14.5 split, C14.6 opened (v0.0.156)

- Task: read the tenth CI log (round 152 code) and close C14.3. D106 to D110 confirmed by Rodrigo («106 sim, 107 sim, 108 sim, 109 sim, 110 no fim»). Ubuntu and macOS green on every Node (1059 and 1052 pass, 0 fail), `bench` (1.3x) and `pack` green; Windows 0 fail on Node 18, 20 and 22 (620 pass, 18 skipped).
- Test 128 (`create-stream.test.mjs`) was skipped on Windows with no reason: it counts descriptors through `/proc/self/fd`, which exists only on Linux, so it is skipped on macOS and Windows by design. The skip now carries that reason (one line, no logic change).
- ROADMAP: D106 to D110; C14.3 closed (slice c only if a test or a CI log asks); C14.5 split into (a) the `--windows-names` flag and the `test` warning, (b) the support statement for `chicla-zip` only; new card C14.6 (the `chicla-kit` suite on the `windows` job). C11.4 was never built, so there is no refusal to remove.
- Source: none changed; the pin did not move. `chicla-kit` has never run on Windows (the `windows` job runs only `chicla-zip`).
- NOT run: anything on Windows or macOS, `npm test` on Node 18 and 20, `npm run mutants`, `npm run smoke` (no script changed). Gates G-C11, G-C12, G-C13, G-C4 are Rodrigo's.

## Round 152 — M14 C14.3 slice d: a closed pipe is also «EOF» on Windows Node 18/20 (v0.0.155)

- Task: C14.3 slice d, from the ninth CI log (round 151 code): Ubuntu and macOS green on every Node (1057 tests, 0 fail), `bench` and `pack` green; Windows Node 22 at 0 fail (619 pass), Node 20 at 1, Node 18 at 2 (was 0/11/13).
- Test first (red): `audit3.test.mjs` +2 (`EPIPE` control green, `EOF` red): a `--require` preload makes the first stdout write fail with that code; the CLI must print nothing on stderr and exit 1. Test 22 (`A-1`, real pipe) on Windows showed `Error: EOF` with a stack trace: libuv says EOF, not EPIPE, there.
- Source: `packages/chicla-zip/src/zipkit.mjs`, one condition: the stdout/stderr error handler also exits quietly on `EOF`. The pin in `CLAUDE.md` MOVED (G-C11 due).
- Test side: `create.test.mjs` test 156 (non-UTF-8 name on disk, Node 18 only) is SKIPPED on Windows with a reason: NTFS names are UTF-16, Node 18 turns the byte path into a valid name, so no such name exists there. Skipped by me, not asked: tell me if you want it back.
- Mutants: `M14-eof-pipe` added, RED; `M4-epipe` updated to the new line, RED.
- NOT run: anything on Windows or macOS, `npm test` on Node 18 and 20, `npm run mutants` (full), `npm run smoke` (no script changed). Gates G-C11, G-C12, G-C13, G-C4 are Rodrigo's.

## Round 151 — M14 C14.3 slice b: cleanup that survives an open handle on Windows (v0.0.154)

- Task: C14.3 slice b (D103, D104, D105 confirmed by Rodrigo: «103 sim, 104 sim, 105 sim»). Eighth CI log (round 150 code): Ubuntu and macOS green on every Node (1054 tests, 0 fail), `bench` and `pack` green; Windows Node 22 at 0 fail (614 pass), Node 20 at 11, Node 18 at 13. Most of the rest: a failed write or extraction left `.partial` / `.chicla-tmp-*` behind, or the cleanup `rmSync` threw a raw `EPERM` over the real ZipError.
- Test first (red, 3 of 3): `packages/chicla-zip/test/cleanup-retry.test.mjs` (5) on a Windows-like fake (a descriptor stays open for a while, `rmSync` refuses a path with an open descriptor or the first N calls). Two weak tests were thrown away before the code (one passed before the fix, one asserted nothing).
- Source: `packages/chicla-zip/src/zipkit.mjs` only: `rmBounded` (8 tries, 20 ms longer each), `rmQuiet` (never throws; the real error wins), `closedStream` (waits for the stream to close); `createZip` `stream: true` and the extractor close their streams before removing; the stale `.partial` is removed with `rmBounded` and is not swallowed. The pin in `CLAUDE.md` MOVED: G-C11 is due again.
- Hand mutants: 9, 8 red (3 of them only after tests were added); 1 survives and is explained: the extractor does not wait for the sink before removing the target. On Linux with Node 22 `pipeline` already waits for `close`; the difference can only show on Node 18/20 on Windows (G-C13). Not added to `mutants/list.mjs`.
- NOT run: anything on Windows or macOS, `npm test` on Node 18 and 20, `npm run mutants`, `npm run smoke` (no script changed). Left red on Windows, causes not read (slice d): tests 22, 130, 151, 133/127 may be gone. Gates G-C11, G-C12, G-C13, G-C4 are Rodrigo's.

## Round 150 — M14 C14.3 slice a: `openZip` of a directory is EISDIR everywhere (v0.0.153)

- Task: C14.3 slice a (D100, D101, D102 confirmed by Rodrigo: «100 sim, 101 sim, 102 sim»). Seventh CI log (round 149 code): Ubuntu and macOS green on every Node (1051 tests, 0 fail), `bench` and `pack` green; Windows 13, 12 and 1 red (was 27, 38, 41). The one red of Node 22 is `openZip` of a directory (ENOTZIP-like, not EISDIR).
- Test first (red): `packages/chicla-zip/test/open-directory.test.mjs` (3): `fs.readSync` returns 0 bytes (what Windows does on a directory), then `openZip`, `listZip` and `readZipFile` must give EISDIR; a control for a plain non-zip file (ENOTZIP); the refused descriptor is closed. 2 red before the fix, 3 green after.
- Source: `packages/chicla-zip/src/zipkit.mjs`, one line in `openZip`: right after `open`, `fstat` says directory, so EISDIR is raised before any read. The pin in `CLAUDE.md` MOVED (zipkit.mjs is in `RECOVER/`; `bump-round` wrote it): G-C11 is due once more (D101).
- Left red on Windows, causes NOT read yet (slices b to d): cleanup with an open handle on Node 18/20 (EPERM on `.partial` and temp dirs, the «bad entry» slow path), `ECHANGED` tests, fuzz, `refusals before writing`; only Node 18: tests 22, 117, 151 and the `windows-names` file hook; only Node 20: test 131.
- NOT run: anything on Windows or macOS, `npm test` on Node 18 and 20, `npm run mutants` (the new test was red before the fix, which is its mutant). Gates G-C11, G-C12, G-C13, G-C4 are Rodrigo's.

## Round 149 — Windows: the real meaning of `unzip -t` exit 1, and a probe name that fits the OEM code page (v0.0.152)

- Task: Rodrigo's «autorizo» after the sixth CI log (`logs_104879145849`). Ubuntu and macOS green on every Node (1050 ok, 0 fail), no hang, `main` holds only `-152`. Windows 27, 38 and 41 (was 32, 43 and 44): `interop` is green, `package` is green. The probe message of round 148 showed `zipinfo` printing the probe name «é-日.txt» correctly while «é-ß.txt» came out as «+�-+�.txt»: Info-ZIP converts names that FIT the OEM code page (é, ß, ü, ñ) and lets the UTF-8 through when they do not (日). The probe name was the wrong one.
- My round 147 reading of `unzip -t` exit 1 was wrong: on warnings Info-ZIP ends with «At least one warning-error was detected», not «No errors detected»; that line is the one in the 26 red `differential-python` tests of Node 22. Test first (red): `unzipVerdict(result, lossy)` (exported from `interop.mjs`): exit 0 needs «No errors detected»; exit 1 passes only where names are lossy and the text says warning-error; «bad CRC» and «At least one error was detected» never pass. The Python and Chicla readers check every CRC of the same zip anyway. Probe name `PROBE_NAME = 'é-ß.txt'`; the `win32` rule of round 148 stays as a second guard.
- Test files only (`interop.mjs`, `fsprobe.mjs` and their tests). No source file changed, the pin did not move. Left red on purpose (C14.3, real findings): `openZip` of a directory (ENOTZIP, not EISDIR) and, on Node 18/20, a failed extraction giving a raw `EPERM` and a `.partial` left behind.
- NOT run: anything on Windows or macOS (the unzip warning text is taken from the log line, not seen in full), `npm test` on Node 18 and 20, `npm run mutants`. Gates G-C11, G-C12, G-C13, G-C4 are Rodrigo's.

## Round 148 — Windows: the lossy-names probe says what it saw, and Windows counts as lossy (v0.0.151)

- Task: Rodrigo's «autorizo» after the fifth CI log (`logs_104869731004`). Ubuntu and macOS green on every Node (1049 ok, 0 fail), no hang (macOS 18 in 5.5 minutes), `main` holds only `-151`. Windows 44, 43 and 32 (was 45, 44 and 33): the `package` fix of round 147 worked, the `lossyNames` probe did not (readers still compared raw names: `missing «é-ß.txt»` next to `unexpected «+�-+�.txt»`), although the pushed code was right and `zipinfo` exits 0 in the readers. THE CAUSE OF THE PROBE'S `false` IS NOT KNOWN.
- Test first (red): `fsprobe.test.mjs`. `decideLossy(result, platform)` = the probe OR `win32` (the OEM code page rendering «+» and U+FFFD appears in five CI logs); `describeProbe(result)` and `lossyDiag` say what the probe saw (status, error code, first bytes of stdout and stderr); the `unzip` and `zipinfo` readers add `(lossyNames=…; probe …)` to their failure messages; the probe no longer lets a failing `rmSync` escape. Test files only (`fsprobe.mjs`, `interop.mjs`, `fsprobe.test.mjs`).
- Left red on purpose (C14.3, real findings): `openZip` of a directory (ENOTZIP, not EISDIR) and, on Node 18/20, a failed extraction giving a raw `EPERM` instead of a `ZipError` and a `.partial` left behind (cleanup with an open handle).
- NOT run: anything on Windows or macOS (this is the third blind attempt at the same probe: if it fails again the message in the log says why), `npm test` on Node 18 and 20, `npm run mutants`. No source file changed, the pin did not move. Gates G-C11, G-C12, G-C13, G-C4 are Rodrigo's.

## Round 147 — Windows: the zipinfo probe and the second bin call (v0.0.150)

- Task: Rodrigo's «autorizo» after the fourth CI log (`logs_104733593410`). No hang this time (every job under 5 minutes; one clean run proves nothing about the macOS Node 18 stall of round 146). The 3 red tests on Ubuntu and macOS were `main` holding `CHICLA_PROJECT_STATUS-149.md` next to `-150` (the copy-over push does not delete): Rodrigo's `git rm`, no code. Windows 45, 44 and 33: the round 146 fixes did not take effect.
- Cause 1: `lossyNames` required `zipinfo` to exit 0; on Windows it exits 1 (a warning), so the probe stayed false and 31 tests compared raw names. Now `lossyFromZipinfo` (exported, tested first: red, then green) accepts exit 0 or 1 with non-empty output that is not the name itself. Cause 2: the second call to the installed bin (`ls a.zip --json`) in `package.test.mjs` also needs the shell on Windows (`EINVAL`).
- Written blind from the log, no source file changed, the pin did not move. Left red on purpose (C14.3): `openZip` of a directory (ENOTZIP, not EISDIR) and, on Node 18/20, cleanup with an open handle.
- NOT run: anything on Windows or macOS (the next Windows log decides), `npm test` on Node 18 and 20, `npm run mutants`. Gates G-C11, G-C12, G-C13, G-C4 are Rodrigo's.

## Round 146 — a stuck CI job costs minutes: job timeouts, readers with a timeout (v0.0.149)

- Task: Rodrigo's «autorizo» after the third CI log (`logs_104699766122`). The macOS Node 18 job stood still for 45 minutes until he cancelled it (the workflow had no `timeout-minutes`: GitHub's default is 360). It stopped before the first test of `interop.test.mjs` finished (test 561; macOS 20 and 22 and Ubuntu 18, 20 and 22 passed it). THE CAUSE IS NOT FOUND and was not reproduced (Node 18.20.8 on Linux, 30 runs of a 93 kB stdin to `python3`, and the file itself: no hang). Suspect, unproven: `pyZip` sent its spec (93 000 characters, round 145) through stdin.
- Test first: `test/ci.test.mjs` requires `timeout-minutes` (5 to 30) on every job; red, then `ci.yml` got 20 (test), 15 (windows), 10 (bench), 10 (pack). `interop.mjs`: every reader has a 120 s `timeout` and a timeout is a PROBLEM that names the tool, not a skip. `pyZip` writes its spec to a file (also under the 32 767 characters of a Windows command line).
- Windows, from the same log (written blind): `lossy()` also folds `+` on win32 (the OEM code page turns «é» into `+` and U+FFFD), the `unzip` reader accepts exit 1 when it says «No errors detected» and names are lossy (this also loosens it on macOS, where `lossyNames` is true), its failure message now carries the last output line, and the `package` test calls `chicla-zip.cmd` through a shell. No source file changed, the pin did not move.
- NOT run: the timeout of a reader that really stands still (only the `ETIMEDOUT` shape was checked), anything on macOS or Windows, `npm test` on Node 18 and 20, `npm run mutants`. If the macOS Node 18 job stops again, the job timeout and the reader timeout will say where. Left red on purpose (C14.3): `openZip` of a directory, cleanup with an open handle on Node 18/20.

## Round 145 — Windows test portability, second Windows run (v0.0.148)

- Task: Rodrigo's «sim 145». Phase 1 (read only): the second Windows log (`logs_104473389310`): Ubuntu and macOS green (1047 ok each), `bench` and `pack` green, Windows 79/75/66 red on Node 18/20/22 (was ~90); no `fsync` EPERM left. Phase 2: tests only, 18 files in `packages/chicla-zip/test/`, NO source file, the pin did not move.
- Fixed in the tests: Python is spawned with `PYTHONUTF8=1` (names and stdin went through the Windows code page: ~30 `differential-python` failures; the 120-`n` name is 20 on win32, paths over 260 characters are C14.3); `interop` sends its spec by stdin (93 000 characters in argv, limit 32 767 on Windows); `crc` imports a file URL; `create-stream` and `fuzz-read` compare paths with both separators; `windows-names` and `audit2` build fixtures with `windowsNames: false`; `write-collisions` skips case-only names on Windows; `package` runs `npm` through a shell; `bench-small` skips when there is no `zip`.
- Skipped on win32, each with its reason in the test: POSIX mode bits read from disk (create, cli-create, extract ×6, extract-fast, audit1; the deterministic modes still run), FIFOs (3 tests: the runner's `mkfifo` makes a `.lnk`), the symlink swap, backslash names (2), `chmod 000`.
- Left RED on purpose (real findings, C14.3, see ROADMAP): on Node 18/20 only, cleanup fails with EPERM/ENOTEMPTY while a handle is open (7 «bad entry» extract tests, `.partial` left behind in 3 tests, temp dirs of `open` and `windows-names`); `openZip` of a directory gives ENOTZIP, not EISDIR, on Windows (test 440); on Node 18/20 also the pipe-closed-early test, on 18 the non-UTF-8 name.
- NOT run: any of this on Windows (written from the log; the next run decides), `npm test` on Node 18 and 20, `npm run mutants`, macOS. Gates G-C11, G-C12, G-C13, G-C4 are Rodrigo's.

## Round 144 — `.idea/` in `.gitignore` (v0.0.147)

- Task: Rodrigo's one-line request. `.gitignore` gets `.idea/` (5 IDE files were committed by mistake to `main`; the ignore rule alone does not remove them: `git rm -r --cached .idea` is still Rodrigo's). No source file, no test and no pin changed.
- NOT run: CI, macOS, `npm test` on Node 18 and 20, `npm run mutants`. Gates G-C11, G-C12, G-C13, G-C4 are Rodrigo's.

## Round 143 — G-C13 findings: `fsync` on a handle that can write (v0.0.146)

- Task: the first Windows CI run (logs sent by Rodrigo, round 142 on `main`; he confirmed D99 and the task). `createZip(path, root, { stream: true })` opened `<out>.partial` with `"r"` and called `fh.sync()`: on Windows that is `EPERM: operation not permitted, fsync` (~32 tests of the `windows` job, plus their cascades). Fix: `"r+"` (1 line in `packages/chicla-zip/src/zipkit.mjs`). THE PIN MOVED (`zipkit.mjs` is in `RECOVER/`): `bump-round` wrote the new digest, G-C11 is due again.
- Tests: `packages/chicla-zip/test/fsync-writable.test.mjs` (red first, with the exact Windows message: a child process makes `sync()` throw EPERM on a handle opened with `"r"`). Two CI-only test fixes found in the same logs: `toolchain-pin` item-17 test now passes `--out` (the start line defaults to `/home/claude/recovered`, EACCES on a runner); `dump-allow-held` NFC/policy test drops the second spelling of `A/b.txt` and `case/file.txt` on a case-insensitive disk (macOS; the case rows stay on Linux).
- Found, NOT fixed (outside the task): (1) `main` on GitHub still holds `scripts/baseline.mjs`, `manifest.mjs`, `policy.mjs` (deleted in 6c) and 5 `.idea/` files: tests 932, 937, 942, 951 go red on Ubuntu and macOS until Rodrigo runs `git rm` (the copy-over push does not delete); (2) Windows tests that assume POSIX (modes 438, `nul.txt` and `x..` names, `spawnSync npm`, `import()` of a `D:\` path, `python3`/surrogates, FIFOs, symlinks): input of C14.3.
- NOT run: THE FIX ON WINDOWS (emulated only), the macOS branch of the 812 fix (written, never run on a case-insensitive disk), `npm test` on Node 18 and 20, `npm run mutants`, CI, macOS. Gates G-C11, G-C12, G-C13, G-C4 are Rodrigo's.

## Round 142 — M14, C14.4: CI job on windows-latest (v0.0.145)

- Task: M14, card C14.4 only (named by Rodrigo; D98 confirmed in the same message). New job `windows` in `.github/workflows/ci.yml`: `windows-latest`, Node 18, 20 and 22 (`fail-fast: false`), `shell: bash`, runs `node --test packages/chicla-zip/test/*.test.mjs` (the whole chicla-zip suite). Before it: 7-Zip is put on PATH, a `python3` copy of `python.exe` is made (the tests call `python3`), and the readers are CHECKED (`7z --help`, `python3 -c "import zipfile"`; `unzip` is reported, never required).
- D99 (proposed): the job is `continue-on-error: true` because Windows is not supported yet; it becomes blocking when it is green on all three Node versions. No source file changed; the pin did not move.
- Tests: 6 new guards in `test/ci.test.mjs` (red first: no `windows` job); 7 hand mutants of the YAML (runner, fail-fast, matrix, reader check, continue-on-error, shell, glob), all red. The `test` job is unchanged.
- NOT run, and it cannot be from here: THE JOB ITSELF. Nobody has seen the suite on Windows: it will probably show real failures (paths, `rename`, permissions: C14.3). The `python3.exe` copy and the 7-Zip path are assumptions about the runner. Also NOT run: `npm test` on Node 18 and 20, `npm run smoke`, `npm run mutants`, macOS; gates G-C11, G-C12, G-C4 are Rodrigo's.

## Round 141 — M14, C14.2: the extractor and the writers apply the Windows name checks (v0.0.144)

- Task: M14, card C14.2 only (Rodrigo confirmed D96 (3)-(6), D97 «inline» and the task through the questions at the start). `windowsNameProblems` and `WIN_CODES` moved INTO `packages/chicla-zip/src/zipkit.mjs` (exported) and `winnames.mjs` is DELETED (D97; `--allow-removed`). New option `windowsNames` (true, false, or undefined = true only on win32; anything else is `EARG`) on `extractZip`, `writeZip`, `writeZipStream` and `createZip` (through the writer): a hit is `EUNSAFE` and nothing is written; nothing is renamed.
- Files (source, 1): `zipkit.mjs` (+~40 lines net of the moved block). Tests: `windows-names.test.mjs` (13, red first: the export was missing) and `winnames.test.mjs` repointed to `zipkit.mjs` (its «no imports» test became «winnames.mjs is gone, `files` unchanged»). 7 mutants of the wiring added to `mutants/list.mjs` (`win14`), run one at a time, all red.
- THE PIN MOVED: D97 said it would not, «to be proved then»; it is disproved: the pin hashes the CONTENT of the five files of `RECOVER/` and `zipkit.mjs` is one of them, so any edit of it moves it (two files would have moved it too). `bump-round` wrote the new digest into `CLAUDE.md`; G-C11 (repeat `/dump` and «recovery mode») is due again on this code.
- Not done on purpose: no CLI flag for `windowsNames` and no Windows warning in `chicla-zip test` (proposed as D98); `skipped` is unchanged (a Windows-bad name is a refusal like the other unsafe names, not a skip).
- Run: see the end of the round reply. NOT run: `npm test` on Node 18 and 20, `npm run smoke` (no script changed), `npm run mutants` (full list), CI, macOS, Windows (C14.4); gates G-C11, G-C12 and G-C4 are Rodrigo's.

## Round 140 — M14, C14.1: Windows name safety as pure functions (v0.0.143)

- Task: M14, card C14.1 only (Rodrigo confirmed the task and the design with «Sim, só C14.1» and «Sim»; D95 and G-C12 were confirmed with «avança» just before). New `packages/chicla-zip/src/winnames.mjs`: `windowsNameProblems(path)` returns the codes `EWIN_BACKSLASH`, `EWIN_DRIVE`, `EWIN_UNC`, `EWIN_RESERVED`, `EWIN_CHAR`, `EWIN_TRAILING`, `EWIN_STREAM` (new array, no duplicates, the order of `WIN_CODES`); it only detects and reports, never renames; pure, no imports, no platform check. NOTHING calls it yet: the extractor and the writer are C14.2, long paths C14.3.
- Files (source, 1): `winnames.mjs`. Tests: `packages/chicla-zip/test/winnames.test.mjs` (13, red first: module missing; one expectation of mine was wrong, «a:b:c» starts with a drive letter, and the test was fixed, not the code). 18 hand mutants of the module, 16 red at first, the 2 survivors (order, type check) got tests and are red now.
- Docs: D96 (calls on delegation) and D97 (where C14.2 puts the code) proposed; D95 recorded as confirmed; D62 done: a Windows line in ROADMAP §12 and in G-C4. `package.json` of `chicla-zip` NOT changed (`files` still lists only `zipkit.mjs`: the module is not shipped until C14.2 decides D97). The pin did not move.
- Run: see the end of the round reply. NOT run: `npm test` on Node 18 and 20, `npm run smoke` (no script changed), `npm run mutants`, CI, macOS, Windows (nothing runs there yet, C14.4); gates G-C11 and G-C12 are Rodrigo's.

## Round 139 — C11.5 slice c: the read-only panel, `chicla` with no arguments (v0.0.142)

- Task: C11.5, slice c (named by Rodrigo with «avança»; D94 (1) to (4) confirmed by the same word). New `packages/chicla-kit/src/panel.mjs`: `readPanelData(root)` (the highest-numbered status file, the newest «Last updated» entry, «Next up», the gates table, the newest `chicla-round*.zip` BESIDE the project), `renderPanel` (four pages: Status, Gates, Decisions, Delivery) and `runPanel` (→ / Tab / l next, ← / h previous, `r` re-read, `q` or Ctrl-C or end of input leave; raw mode and the cursor are always restored). `cli.mjs` opens it only when there are NO arguments and stdout AND stdin are TTYs under the `shouldStyle` rules; everything else keeps the usage error (exit 2).
- Files (source, 2): `panel.mjs` (new, ~70 lines), `cli.mjs` (+5). Tests: `packages/chicla-kit/test/panel.test.mjs` (10, red first: module missing; injected streams, a fake stdin; a test that fails instead of hanging when the panel never closes). It writes nothing (a snapshot of the project and its parent is compared after a session). The pin did not move.
- 10 hand mutants of the new lines: 7 red at first, 3 survived because a hung panel was not a failure; the tests were tightened (`settled`) and all 10 are red now.
- D95 proposed and gate G-C12 proposed (a real terminal). Run: see the end of the round reply. NOT run: `npm test` on Node 18 and 20, `npm run smoke` (no script changed), `npm run mutants`, CI, macOS, any REAL terminal (G-C12); gate G-C11 is Rodrigo's.

## Round 138 — C11.5 slice b: the human output of the CLI is styled on a terminal (v0.0.141)

- Task: C11.5, slice b (named by Rodrigo with «avança para a c11.5 slice b»; D93 (1) to (4), (a), (b) confirmed at the start of round 137). New `styleSummary(text, on)` in `ui.mjs` paints ONLY the mark (✓ green, ✗ red, ⚠ yellow) that opens a summary line; `cli.mjs` applies it to the human text of the six commands when `shouldStyle` says so, judging stdout and stderr on their own, with the environment from `io.env` (tests) or `process.env`.
- Files (source, 2): `ui.mjs`, `cli.mjs`. Tests: `packages/chicla-kit/test/cli-style.test.mjs` (7, injected streams, five red first), `ui.test.mjs` +4 (red first: the import failed), `cli-recovery.test.mjs` (its copy of the kit also gets `ui.mjs`).
- Plain text is byte for byte today's on a pipe, `--json`, CI, NO_COLOR, TERM=dumb; usage errors and `--help` are never styled; exit codes and `--json` unchanged. The pin did not move. 8 hand mutants of the new lines: 7 red, 1 equivalent (`\s*` for ` *` in the mark regex differs only for a tab).
- D94 proposed (calls made on delegation). Left in C11.5: slice c, the panel.
- Run: see the end of the round reply. NOT run: `npm test` on Node 18 and 20, `npm run smoke` (no script changed), `npm run mutants`, CI, macOS, any REAL terminal (all tests use injected streams); gate G-C11 is Rodrigo's.

## Round 137 — docs only: the status file is cleaned (v0.0.140)

- Task: Rodrigo asked for the corrupted status file to be cleaned (2026-10-14). `CHICLA_PROJECT_STATUS-140.md` carried a second, truncated copy of the Instructions block (it began in the middle of a sentence) and an old «Current version: v0.0.130» line between the real «Current version» and the Fingerprint paragraph; those 32 lines (39 to 70 of the upload) are removed, nothing else in the Instructions block changed (the removed items 2 to 20 were checked identical to the kept ones with `diff`).
- D93 (1) to (4), (a) and (b) recorded as CONFIRMED by Rodrigo (2026-10-14) in `ROADMAP.md` and «Next up».
- No source, test, script or pin changed. Files: the status file, `ROADMAP.md`, `CHANGELOG.md`, `package.json`.
- Run: see the end of the round reply. NOT run: `npm test` on Node 18 and 20, `npm run smoke` (no script changed), `npm run mutants`, CI, macOS; gate G-C11 is Rodrigo's.

## Round 136 — C11.5 slice a: `ui.mjs`, the drawing functions of the kit CLI (v0.0.139)

- Task: C11.5, slice a (Rodrigo chose it with «1»; D93 proposed, calls made on delegation). New `packages/chicla-kit/src/ui.mjs`: pure functions, no imports, no I/O (`shouldStyle`, `paint`, `stripAnsi`, `width`, `pad`, `truncate`, `box`, `table`, `bar`, `SPINNER`, `spinnerFrame`). NOTHING calls it yet: no command output changed; slice b wires it, slice c adds the panel.
- Files (source, 1): `ui.mjs`. Tests: `packages/chicla-kit/test/ui.test.mjs` (9, red first: module missing), including one that `ui.mjs` imports nothing and never names `process`.
- The pin did not move. No exit code, `--json` output or plain text changed.
- Run: see the end of the round reply. NOT run: `npm test` on Node 18 and 20, `npm run smoke` (no script changed), `npm run mutants`, CI, macOS, any real terminal (nothing is wired to one yet); gate G-C11 is Rodrigo's.

## Round 135 — C11.1 slice 7: the kit CLI imports every core from `src/` (v0.0.138)

- Task: C11.1, slice 7 (D92 (a), confirmed with «d92 confirmo tudo. avança»). `packages/chicla-kit/src/cli.mjs` loads each core from the kit itself (`./check-manifest.mjs`, `./bump-round.mjs`, `./verify-delivery.mjs`, `./make-delivery.mjs`, `./emergency-dump.mjs`, `./pinned/recovery-report.mjs`) instead of the wrappers in `scripts/`; the `SCRIPTS` base url is gone and the ECOMMAND_LOAD message names the file without `scripts/`. The wrappers in `scripts/` stay as entry points of the workflow.
- Files (source, 1): `cli.mjs`. Tests: `packages/chicla-kit/test/cli-loads-src.test.mjs` (3, red first: a copy of kit + chicla-zip with NO `scripts/` runs `check-manifest`), `cli-recovery.test.mjs` (its stand-in core now sits at the pinned path, as the CLI loads it).
- The pin did not move (nothing pinned was touched). D92 (b), the old comment on line 39 of `src/pinned/recovery-report.mjs`, is left for the next slice that moves the pin.
- Run: see the end of the round reply. NOT run: `npm test` on Node 18 and 20, `npm run mutants` (no logic changed), CI, macOS, gate G-C11 (Rodrigo's).

## Round 134 — C11.1 slice 6c: the three re-export shims of `scripts/` are deleted (v0.0.137)

- Task: C11.1, slice 6c (named with «avança»; no decision waiting). Deleted on purpose: `scripts/baseline.mjs`, `scripts/manifest.mjs`, `scripts/policy.mjs` (one-line re-exports since 6a; no source file imported them any more, every core already used `./pinned/…`). `scripts/recovery-report.mjs` is NOT a shim (wrapper with its own entry point, the kit CLI loads it) and stays.
- Files (source, 1 edited + 3 deleted): the comment of `packages/chicla-kit/src/cli.mjs` now says what is true (the kit still loads its cores through `scripts/` wrappers and needs `chicla-zip`, so it cannot be published alone yet). Docs: `README.md`, `docs/manifest.md`, one comment in `scripts/verify-delivery-zip.mjs`, comments of 14 tests. Tests: `test/pinned-shims-gone.test.mjs` (5, red first), the three `pinned-*-move` tests (shim tests replaced by «is gone»), `test/toolchain-files.mjs` (`SHIMS` out, `REMOVED_SHIMS` in), `test/layout.test.mjs` (two names out of its list).
- The pin in `CLAUDE.md` did NOT move (`bump-round --verify` green before and after). Left as is on purpose: the comment on line 39 of `src/pinned/recovery-report.mjs` still says `scripts/policy.mjs`; editing it would move the pin.
- Run (Node 22, Linux): after `bump-round`, the whole `npm test` in the background: 981 tests, 978 pass, 1 skipped, 2 red, both in `test/layout.test.mjs` (its `SCRIPTS` list still named `baseline` and `manifest`; my search had looked for import paths, not for a list). Fixed; that file re-run green (11 pass); the whole suite was NOT run a second time. `check-build` ok. NOT run: `npm test` on Node 18 and 20, `npm run mutants` (no logic changed), CI, macOS, gate G-C11 (Rodrigo's).

## Round 133 — C11.1 slice 6b: `recovery-report` moves into the kit's pinned folder; the pin moves once (v0.0.136)

- Task: C11.1, slice 6b (named with «avança»; no decision waiting). `recovery-report.mjs` moves to `packages/chicla-kit/src/pinned/recovery-report.mjs`. The only change in it is the zipkit fallback path (`../../../chicla-zip/src/zipkit.mjs`); it keeps its `./` imports and its own entry point, so the copy in `RECOVER/` runs alone as before. `scripts/recovery-report.mjs` is a wrapper (re-export + entry point), like the other cores.
- Files (source, 4): the moved file, the wrapper, the `TOOLCHAIN` maps in `bump-round.mjs` and `emergency-dump.mjs`. Tests: `test/toolchain-files.mjs` (`PINNED['recovery-report']`, new `WRAPPERS` in `DUMP_COPY`), `test/pinned-recovery-report-move.test.mjs` (5, red first: it rebuilds the old sha256 by swapping the one line back).
- The pin in `CLAUDE.md` MOVED once (`bump-round` rewrote it; before it, `--verify` was red on the digest, as designed). The start line of item 17 and the five RECOVER names are unchanged.
- Run (Node 22, Linux): after `bump-round`, the whole `npm test` in the background: 976 tests, 973 pass, 1 skipped, 2 red, both in tests: `cli-recovery.test.mjs` put its stand-in core at the pinned path while the CLI loads the wrapper, and the helper guard caught the path of the wrapper in my new test. Fixed; both files re-run green (the whole suite was NOT run a second time). Before that, by hand: a rehearsal in a sandbox of the start line of item 17 on a dump of the new layout (digest ok, `RECOVER/recovery-report.mjs` extracted and compared). `npm run smoke` all green (12, 52 checks); `check-build` ok. NOT run: `npm test` on Node 18 and 20, `npm run mutants` (no logic changed), CI, macOS, and the real rehearsal of `/dump` plus «recovery mode» on the new layout (gate G-C11, Rodrigo's).

## Round 132 — C11.1 slice 6a-3: `policy` moves into the kit's pinned folder; slice 6a done (v0.0.135)

- Task: C11.1, slice 6a-3 (named with «avança»; no decision waiting). `policy.mjs` moves byte-identical (sha256 ecd47337…) to `packages/chicla-kit/src/pinned/policy.mjs`; `scripts/policy.mjs` is a one-line re-export shim (`scripts/recovery-report.mjs` still imports `./policy.mjs`; the shim goes in 6c).
- Files (source, 6; the same one-time exception to rule 16, every edit a rename or one line): the moved file, the shim, the `TOOLCHAIN` maps in `bump-round.mjs` and `emergency-dump.mjs`, the policy import of `verify-delivery` and `check-manifest`, and the guarded dynamic import in `emergency-dump`. Tests: `test/toolchain-files.mjs` (`PINNED.policy`, `SHIMS`), `test/pinned-policy-move.test.mjs` (5, red first).
- The pin in `CLAUDE.md` did not move: same bytes, `bump-round --verify` ok before and after.
- Run (Node 22, Linux): a subset of 287 tests before `bump-round` had 3 red, all tests: my new test counted the TOOLCHAIN-map strings of `emergency-dump`, `policy.test.mjs` looked for the old import path, and `toolchain-pin` was red because the fingerprint was not refreshed yet (by design); fixed. After `bump-round`, the whole `npm test` in the background: 971 tests, 970 pass, 1 skipped, 0 fail (about 6.5 min); `npm run smoke` all green (12, 52 checks); `check-build` ok. NOT run: `npm test` on Node 18 and 20, `npm run mutants` (no logic changed), CI, macOS.

## Round 131 — C11.1 slice 6a-2: `manifest` moves into the kit's pinned folder (v0.0.134)

- Task: C11.1, slice 6a-2 (named with «avança»; no decision waiting). `manifest.mjs` moves byte-identical (sha256 7a39869c…) to `packages/chicla-kit/src/pinned/manifest.mjs`; `scripts/manifest.mjs` is a one-line re-export shim (`scripts/recovery-report.mjs` still imports `./manifest.mjs`; the shim goes in 6c).
- Files (source, 8; the same one-time exception to rule 16, every edit a rename or one line): the moved file, the shim, the `TOOLCHAIN` maps in `bump-round.mjs` and `emergency-dump.mjs`, and the manifest import of `make-delivery`, `verify-delivery`, `emergency-dump` and `check-manifest` (brought forward from 6c). Tests: `test/toolchain-files.mjs` (`PINNED.manifest`, `SHIMS`), `test/pinned-manifest-move.test.mjs` (5, red first), `test/pinned-baseline-move.test.mjs` (finds its shim by name). `FILES.manifest` regenerated early: the fake projects of two core tests copy the files it lists.
- The pin in `CLAUDE.md` did not move: same bytes, `bump-round --verify` ok before and after.
- Run (Node 22, Linux): after `bump-round`, the whole `npm test` in the background: 966 tests, 960 pass, 1 skipped, 5 red, all in tests, none in code: the manifest-list filter of `policy-file`, `secret-content` and `secret-names` did not know `src/pinned/` (the same fix `secret-allow` got in round 130). Fixed; the three files re-run green, then the whole `npm test` once more (result in the status file); `npm run smoke` all green (12, 52 checks); `check-build` ok. NOT run: `npm test` on Node 18 and 20, `npm run mutants` (no logic changed), CI, macOS.

## Round 130 — C11.1 slice 6a-1: `baseline` moves into the kit's pinned folder (v0.0.133)

- Task: C11.1, slice 6a-1 (named with «avança»; no decision waiting). `baseline.mjs` moves byte-identical (sha256 7ee14e70…) to `packages/chicla-kit/src/pinned/baseline.mjs`; `scripts/baseline.mjs` is a one-line re-export shim (`scripts/recovery-report.mjs` still imports `./baseline.mjs`; the shim goes in 6c).
- Files (source, 6; one-time exception to rule 16, every edit a rename or one line): `packages/chicla-kit/src/pinned/baseline.mjs` (moved), `scripts/baseline.mjs` (shim), the `TOOLCHAIN` maps in `bump-round.mjs` and `emergency-dump.mjs`, and the baseline import of `make-delivery.mjs` and `verify-delivery.mjs` (brought forward from 6c so the core import checks keep using `pinnedSpec`). Tests: `test/toolchain-files.mjs` (`PINNED.baseline`, new `SHIMS` in `DUMP_COPY`), `test/pinned-baseline-move.test.mjs` (5, red first).
- The pin in `CLAUDE.md` did not move: same bytes, `bump-round --verify` ok before and after.
- Run (Node 22, Linux): after `bump-round`, the whole `npm test` in the background: 961 tests, 957 pass, 1 skipped, 3 red, all in tests, none in code: `secret-allow.test.mjs` (2; its manifest filter did not know the folder `src/pinned/`) and the helper guard (my new test named the shim path). Fixed in the tests; the three files re-run green, then the whole `npm test` was run once more (result in the status file); `npm run smoke` all green (12, 52 checks); `check-build` ok. NOT run: `npm test` on Node 18 and 20, `npm run mutants` (no logic changed), CI, macOS.

## Round 129 — C11.1 slice 6a-0b: the rest of the tests ask the helper (v0.0.132)

- Task: C11.1, slice 6a-0b (named with «avança»; no decision waiting). Tests and smoke scripts only: no source file, no pinned file changed; the pin in `CLAUDE.md` did not move.
- Files: `test/toolchain-files.mjs` (adds `ROOT`, `pinnedPath`, `pinnedFile`, `importPinned`, `specFrom`, `pinnedSpec` and the copy sets `CHECK_BUILD_COPY`, `CHECK_MANIFEST_COPY`, `VERIFY_DELIVERY_COPY`), `test/toolchain-files.test.mjs` (+2; the new guard was red first, 36 files named). 34 test files and 3 smoke scripts (`smoke-test-bump-round`, `smoke-test-delivery-guards`, `smoke-test-emergency`) no longer write the path of a pinned file: imports, spawns of `recovery-report`, fake-project copy lists and the import-specifier checks of the five cores go through the helper.
- Guard: no test or smoke script names `scripts/<pinned>.mjs`, or two pinned names in one list, or one next to `'scripts'` (comments and RECOVER/ names are not paths). So the moves of 6a-1 to 6a-3 touch the helper, not the tests.
- Run (Node 22, Linux): every touched test file one at a time, all green (34 files); the three smoke scripts ok (12, 52 checks, all passed). After `bump-round`, the whole `npm test` in the background: 956 tests, 955 pass, 1 skipped, 0 fail (about 4.5 min; the first launch was lost when its shell ended and was started again once, nothing hung); `check-build` ok. NOT run: `npm test` on Node 18 and 20, `npm run mutants` (no source changed), CI, macOS.

## Round 128 — C11.1 slice 6a-0: shared test helper for the recovery toolchain (v0.0.131)

- Task: C11.1, slice 6a-0, part 1 (D91 confirmed by Rodrigo: B, thin slices, G-C11 yes). Tests only: no source file, no script, no pinned file changed; the pin in `CLAUDE.md` did not move.
- Files: `test/toolchain-files.mjs` (new; `PINNED`, `ZIPKIT`, `TOOLCHAIN_SOURCES`, `DUMP_COPY`, `copyFiles`), `test/toolchain-files.test.mjs` (3; the drift guard was red first), 11 tests now import the lists instead of keeping their own: `dump-allow-held`, `dump-policy-file`, `dump-policy`, `dump-project-only`, `dump-secret-content`, `emergency-fallback`, `emergency-home-noise`, `secret-marker-chain`, `secret-names` (COPY), `emergency-recover-folder`, `toolchain-pin` (RECOVER name maps).
- Left for 6a-0b: tests that import a pinned file directly or spawn `scripts/recovery-report.mjs`, and fake projects that copy pinned files with `copyFileSync` (about 25 files, the smoke scripts); then 6a-1 `baseline`, 6a-2 `manifest`, 6a-3 `policy`.
- Run (Node 22, Linux): `bump-round --verify` ok at the start; the 12 touched test files 81 pass, 0 fail (first as a group). After `bump-round`, the whole `npm test`: 953 pass, 1 skipped, 0 fail (271 s); `check-build` ok. NOT run: `npm test` on Node 18 and 20, `npm run smoke`, `npm run mutants` (no source changed), CI, macOS.

## Round 127 — C11.1 slice 5g: design note for the four pinned files (v0.0.130)

- Task: C11.1, slice 5g (D90 (1) confirmed by Rodrigo with «avança»). Docs only: no source file, no test, no script changed.
- Files: `docs/pinned-files-design.md` (new; what the recovery toolchain is, who names it by path, 42 test and smoke files that copy it, what must not change, options A/B/C, the folder `packages/chicla-kit/src/pinned/`, slices 6a/6b/6c, risks, one thing noticed), `docs/README.md` (row), `ROADMAP.md` (D90 (1) confirmed; D91 proposed; gate G-C11; pointer on C11.1).
- Result of the design: the three libraries can move byte-identical, so the digest in `CLAUDE.md` stays the same until `recovery-report` moves (one line, the zipkit fallback); `RECOVER/`, its names and the start line of item 17 never change.
- Noticed, not fixed: after the move the kit still needs `packages/chicla-zip` by relative path, so `chicla-kit` alone cannot be installed from npm; separate decision, not proposed yet.
- Run (Node 22, Linux): `bump-round --verify` ok at the start; `check-build` ok; `npm test` 949 pass, 1 skipped, 0 fail (unchanged: no test added, none needed for a note); the pin in `CLAUDE.md` did not move. `npm run smoke` not needed (no script changed). NOT run: Node 18 and 20, CI, macOS, `npm run mutants`.

## Round 126 — C11.1 slice 5f: `emergency-dump` core into the kit package (v0.0.129)

- Task: C11.1, slice 5f (D89 confirmed by Rodrigo: «next»). The `emergency-dump` core moves from `scripts/emergency-dump.mjs` into `packages/chicla-kit/src/emergency-dump.mjs` (`emergencyDump`, `renderEmergencyDump`); the script is a wrapper that re-exports them and, as the entry point, parses the flags, prints and exits.
- Files (source, 3): `packages/chicla-kit/src/emergency-dump.mjs` (new), `scripts/emergency-dump.mjs` (wrapper), `packages/chicla-kit/src/cli.mjs` (a comment). The core imports `node:` and only pinned files (`scripts/manifest.mjs` statically, `scripts/policy.mjs` guarded and `packages/chicla-zip/src/zipkit.mjs` dynamically) and none of its siblings in `src/`; the project root, where the five RECOVER files are read, is three folders up. The pin in `CLAUDE.md` did not move (the dump is not one of the five).
- Tests: `packages/chicla-kit/test/core-emergency-dump.test.mjs` (6; 4 red first). The copy lists of 9 dump tests now carry the core, and `policy.test.mjs` and `dump-secret-content.test.mjs` read the dump source from the core. 9 hand mutants (manifest import, root, policy path, zip-writer path, `--project-only`, the note join, exit code, renderer re-export, exit code in the core): the note join SURVIVED first (the test passed the note as one argument); the test now passes separate words and the mutant is red; all 9 red.
- Run (Node 22, Linux): `npm test` 949 pass, 1 skipped, 0 fail (943 before, 6 new; the first run of the 22 dump files had 39 red until the manifest listed the core and the copy lists carried it); `npm run smoke` all green; `check-build` ok. NOT run: Node 18 and 20, CI, macOS, `npm run mutants`.

## Round 125 — C11.1 slice 5e: `make-delivery` core into the kit package (v0.0.128)

- Task: C11.1, slice 5e (D88 confirmed by Rodrigo: «Sim, confirmo»). The `make-delivery` core moves from `scripts/make-delivery-zip.mjs` into `packages/chicla-kit/src/make-delivery.mjs` (`makeDelivery`, `renderMakeDelivery`); the script is a wrapper that re-exports them and, as the entry point, parses `--against` and `--allow-removed`, prints and exits.
- Files (source, 3): `packages/chicla-kit/src/make-delivery.mjs` (new), `scripts/make-delivery-zip.mjs` (wrapper, 34 lines with comments), `packages/chicla-kit/src/cli.mjs` (a comment). The core imports `node:`, the two pinned files (`baseline.mjs`, `manifest.mjs`) and its three siblings in `src/` directly; the zip writer is loaded from `packages/chicla-zip` two folders up. The pin in `CLAUDE.md` did not move.
- Tests: `packages/chicla-kit/test/core-make-delivery.test.mjs` (7; 5 red first, 2 already green because older tests pin the behaviour). Fake projects in `test/manifest-v2.test.mjs` and `scripts/smoke-test-delivery-guards.mjs` now copy the core too. 8 hand mutants (core imports the script wrapper, wrong zip-writer path, wrapper drops `--allow-removed` or `--against`, wrong root, usage exit 1, no re-export of the renderer, core sets an exit code): all 8 red.
- Order kept this time: tests first and seen red, then code. Long commands ran in the background with a log (item 20).
- Run (Node 22, Linux): `npm test` 943 pass, 1 skipped, 0 fail (936 before, 7 new; the first run of the 12 files that build fake projects had 26 red until the manifest listed the core and two fake-project builders copied it); `npm run smoke` all green; `check-build` ok. NOT run: Node 18 and 20, CI, macOS, `npm run mutants`.

## Round 124 — Process rules: never get stuck on `npm test` or the mutant run (v0.0.127)

- Task: not a card; Rodrigo asked for rules because sessions kept hanging on the mutant round and on `npm test`. Docs only, no source file touched.
- Cause found by measuring: `npm test` takes about 4 min (Node 22, Linux; 936 tests) and the full `npm run mutants` (229 entries) is far longer, both above the default 2-minute limit of a foreground shell call (hard limit 10 min).
- Files: `CLAUDE.md` (new section «Long commands: never get stuck», 6 rules) and item 20 of the status file Instructions (the summary, same rules; item 18 stays the honesty rule it points to). The pin in `CLAUDE.md` did not move.
- Rules in short: background plus log file and short polls; only the file at hand while coding, the whole `npm test` once per round after `bump-round`; only the round's own mutants with `--only <id> --timeout 60`, the full list only when Rodrigo asks; silent for 3 minutes means kill, read the log, one retry of the active file, then STOP and deliver; a hang is a finding, never a raised timeout, skipped test or dropped mutant; say the expected time in the first reply.
- Run: `npm test` once in the foreground only to time it (exit 0). NOT run: `npm run mutants`, Node 18 and 20, CI, macOS. The rules themselves are text and have no test; whether they stop the hangs shows only in the next sessions.

## Round 123 — C11.1 slice 5d: `verify-delivery` core into the kit package (v0.0.126)

- Task: C11.1, slice 5d (D87 (1) and (2) confirmed by Rodrigo: «confirmo tudo. avança»). The `verify-delivery` core moves from `scripts/verify-delivery-zip.mjs` into `packages/chicla-kit/src/verify-delivery.mjs` (`verifyDelivery`, `renderVerifyDelivery`; imports only `node:` modules and the three pinned files `scripts/baseline.mjs`, `manifest.mjs` and `policy.mjs` by relative path; no entry point, no `import.meta`); the script is a thin wrapper (re-exports the core; as the entry point it parses `--against` and `--allow-removed`, prints and exits 0, 1 or 2; root = the project the file sits in). Behaviour unchanged. D87 (2): the import checks of `core-check-build` and `core-check-manifest` now also see a bare `import "x"` and `import(`.
- Files (source, 3): `packages/chicla-kit/src/verify-delivery.mjs` (new), `scripts/verify-delivery-zip.mjs` (wrapper, 16 lines of code), `packages/chicla-kit/src/cli.mjs` (a comment). The pin in `CLAUDE.md` did not move (not one of the five RECOVER files).
- Tests: `packages/chicla-kit/test/core-verify-delivery.test.mjs` (7). Order slip, said plainly: I moved the code BEFORE writing them (CLAUDE.md working rule 2); afterwards I put the old script back and two of the seven went red (the wrapper tests), then restored the new one. The location tests (core exports, imports, no entry point) were never red first. Fake projects now also get the core: `manifest-v2`, `manifest`, `secret-allow` tests and `smoke-test-delivery-guards`; `policy.test.mjs` and `manifest-docs.test.mjs` read the core.
- 15 hand mutants in the first run: 14 red; M5 (wrong root in the wrapper) was GREEN because no test had a `chicla.policy.json`; a test that bans a path by policy was added and M5 is red. 4 more mutants on the two hardened tests (bare import, `import(` in each core): all red.
- Run (Node 22, Linux): `npm test` 936 pass, 1 skipped, 0 fail (929 before, 7 new); `npm run smoke` all green; `check-build` ok; `bump-round` run through the new wrappers of rounds 122 and 123. NOT run: Node 18 and 20, CI, macOS, `npm run mutants` (chicla-zip only; untouched).

## Round 122 — C11.1 slice 5c: `bump-round` core into the kit package (v0.0.125)

- Task: C11.1, slice 5c (named by Rodrigo with «avança»; no decision was waiting). The `bump-round` core moves from `scripts/` into `packages/chicla-kit/src/bump-round.mjs` (`bumpRound`, `renderBumpRound`; only `node:` imports, no entry point, no `import.meta`); `scripts/bump-round.mjs` is a thin wrapper (re-exports the core; as the entry point it parses the flags, prints and exits, root = the project the file sits in). Behaviour unchanged. The default manifest step still spawns `<root>/scripts/check-manifest.mjs --write`; the kit CLI still passes `checkManifest` in-process.
- Files (source, 3): `packages/chicla-kit/src/bump-round.mjs` (new), `scripts/bump-round.mjs` (wrapper, 16 lines of code), `packages/chicla-kit/src/cli.mjs` (a comment). The pin in `CLAUDE.md` did not move (`bump-round` is not one of the five RECOVER files). `FILES.manifest` lists the new core.
- Tests: `packages/chicla-kit/test/core-bump-round.test.mjs` (6; 5 red first; the sixth pins the flags and already passed, so it was proved by mutants). Fake projects now also get the core: `cli-bump-round.test.mjs` and `smoke-test-bump-round.mjs`; `policy.test.mjs` reads the pin map in the core.
- 13 hand mutants (core importing a pinned script, core exiting, wrapper dropping `--note`, `--dry-run` or `--refresh`, wrong root, exit code always 0, no stderr, no re-export, a wrapper that wraps instead of re-exporting, wrong manifest path, logic in the wrapper, `import.meta` in the core): all red, after the import check was fixed to see a bare `import "x"` (M1 was green first).
- Noticed, not fixed (rule 6): `core-check-build.test.mjs` and `core-check-manifest.test.mjs` have the same hole as M1 had (their import regex needs `from`); proposed as D87 (2).
- Run (Node 22, Linux): see the "Last updated" entry of the status file. NOT run: Node 18 and 20, CI, macOS, `npm run mutants` (chicla-zip only; untouched).

## Round 121 — C11.1 slice 5b: `check-manifest` core into the kit package (v0.0.124)

- Task: C11.1, slice 5b (D85 and D86 confirmed by Rodrigo: «d85 d86 sim. avança»). The `check-manifest` core moves from `scripts/` into `packages/chicla-kit/src/check-manifest.mjs`; `scripts/check-manifest.mjs` is a thin wrapper (re-exports the core; as the entry point it prints and exits, root = the project the file sits in). Behaviour unchanged. The core still reads the two pinned files, `scripts/manifest.mjs` and `scripts/policy.mjs`, by relative path (`../../../scripts/`).
- Files (source, 3): `packages/chicla-kit/src/check-manifest.mjs` (new), `scripts/check-manifest.mjs` (wrapper, 8 lines of code), `packages/chicla-kit/src/cli.mjs` (a comment). The pin in `CLAUDE.md` did not move.
- Tests: `packages/chicla-kit/test/core-check-manifest.test.mjs` (5, red first). Fake projects now also get the core: 8 tests and 2 smokes changed. Three source-reading tests now read the core too (`policy.test.mjs`, `manifest-docs.test.mjs`, `manifest-readers.test.mjs`), so the rules they pin still cover the code.
- 10 hand mutants (root one level up, exit code always 0, `--write` ignored, no re-export, logic back in the wrapper, no entry guard, the core printing, the core importing another script, the old `./` path, a lost file no longer failing): all red.
- Run (Node 22, Linux): `npm test` 923 pass, 1 skipped, 0 fail; `npm run smoke` ok; `check-build` ok. NOT run: Node 18 and 20, CI, macOS, `npm run mutants` (chicla-zip only; untouched).

## Round 120 — C11.1 slice 5a: `check-build` core into the kit package (v0.0.123)

- Task: C11.1, slice 5a (D84 (1) confirmed by Rodrigo: «d84 confirmo tudo. avança»). The `check-build` core moves from `scripts/` into `packages/chicla-kit/src/check-build.mjs`; `scripts/check-build.mjs` is now a thin wrapper (re-exports the core; as the entry point it prints and exits, with the project root as `root`). Behaviour unchanged. D86 (why `check-build` first) proposed.
- Files (source, 3): `packages/chicla-kit/src/check-build.mjs` (new; only `node:` imports, no entry point), `scripts/check-build.mjs` (wrapper, 5 lines of code), `packages/chicla-kit/src/cli.mjs` (a comment only). The CLI, `make-delivery-zip.mjs` and `recovery-report.mjs` are untouched; the pin in `CLAUDE.md` did not move (`check-build` is not one of the five RECOVER files).
- Tests: `packages/chicla-kit/test/core-check-build.test.mjs` (5, red first). Changed so a fake project also gets the core: `test/manifest-v2.test.mjs`, `packages/chicla-kit/test/cli-make-delivery.test.mjs`, `scripts/smoke-test-check-build.mjs` (count 3 -> 4), `scripts/smoke-test-delivery-guards.mjs`.
- 8 hand mutants (root one level up, exit code always 0, no re-export, logic back in the wrapper, no entry guard, the core printing, the core importing from `scripts/`, `node_modules` no longer skipped): all red.
- Run (Node 22, Linux): `npm test` 918 pass, 1 skipped, 0 fail; `npm run smoke` ok; `check-build` ok. NOT run: Node 18 and 20, CI, macOS, `npm run mutants` (chicla-zip only; untouched).

## Round 119 — new root README.md (v0.0.122)

- Task: docs only, asked by Rodrigo: «faz um novo readme completo primeiro». The project had no root README (only `docs/README.md` and the one in `packages/chicla-zip/`). D84 (1) recorded as confirmed («d84 confirmo tudo. avança»).
- Files: `README.md` (new): what Chicla is, the two packages and their state, `chicla-zip` (library and CLI), the six `chicla` commands with exit codes, how the workflow works (state, fingerprints, rounds, policy, delivery, dump, honesty), how to work on it, repository map, design rules, roadmap, licence. `ROADMAP.md` (D84 confirmed, D85 proposed), status file, `package.json` version.
- Checked against: `packages/chicla-kit/src/cli.mjs`, both `package.json`, `ci.yml`, `scripts/`, `policy.mjs`, `docs/`; the mutant count (229) from the list file. No code changed.
- NOT run: `npm test` on Node 18 and 20, `npm run smoke`, `npm run mutants`, CI, macOS. Run before the round (Node 22, Linux): `bump-round --verify` ok, `npm test` 913 pass, 1 skipped, 0 fail. The README's claims are not tied to the code by any test (D85 (2)).

## Round 118 — C11.1 slice 4b: `recovery-report` as a core, `chicla recovery` (v0.0.121)

- Task: C11.1, slice 4b (D82; D83 confirmed by Rodrigo: «d83 confirmo tudo. avança»). `chicla recovery <dump.zip> [--baseline <zip>] [--out <dir>] [--toolchain-digest <hex>] [--trust-toolchain] [--json]`. Exit 0 ok, 1 nothing recovered, 2 usage, 3 EHASH_TOOLCHAIN. No `--root` (EUSAGE): a recovery has `--out`.
- Files: `scripts/recovery-report.mjs` (core `recoveryReport({dump, baseline, out, toolchainDigest, trustToolchain})` + `renderRecoveryReport`; never prints, exits or throws; codes EUSAGE, EHASH_TOOLCHAIN, ERECOVERY_EXTRACT, ENOT_DUMP, ENO_PROJECT, EBASELINE, EBASELINE_EXTRACT, ERECOVERY_ERROR; runs only as the entry point; imports only the other pinned files), `packages/chicla-kit/src/cli.mjs` (`recovery` built; the «pending» mechanism and ECOMMAND_PENDING are gone, nothing is pending). The `toolchain-digest` pin in `CLAUDE.md` MOVED (this file is one of the five): `bump-round` rewrote it. `/dump` and recovery instructions still call the scripts, unchanged.
- The toolchain check still only applies when the script runs from a folder named `RECOVER/`; the kit's own copy is never checked, so the real `chicla recovery` cannot return exit 3 today (the CLI mapping is tested with a stand-in core). The core's result also carries `guards` (check-manifest/check-build: passed, failed or absent in the recovered root).
- Tests: `packages/chicla-kit/test/cli-recovery.test.mjs` (11), red first; dumps from the 4a core, zips rewritten with Python. 11 hand mutants, all red. My own bug, fixed: a test I rewrote ran `chicla dump` for real in the current folder (it wrote a dump of the tree into `outputs/`); it now uses invocations that cannot run anything.
- Size: 2 source files, about 150 changed lines (diff ignoring whitespace; the body of the script moved into a function).
- Run (Node 22 only): `npm test` (914 tests, 913 pass, 1 skipped), `check-build`, `npm run smoke` (all green). Not run: Node 18/20, CI, macOS, `npm run mutants`.

## Round 117 — C11.1 slice 4a: `emergency-dump` as a core, `chicla dump` (v0.0.120)

- Task: C11.1, slice 4a (D82, confirmed by Rodrigo with «avança»; Claude read it as accepting both suggestions, as for D80). `chicla dump [note...] [--note <text>] [--project-only] [--outdir <dir>] [--json] [--root <dir>]`: `--root` is the working directory that is dumped (default: the current folder). Exit 0 when a dump was created (warnings never change that), 1 when none was, 2 usage.
- Files: `scripts/emergency-dump.mjs` (core `emergencyDump({work, outdir, note, projectOnly, noOutputs, hashLimit})` + `renderEmergencyDump`; never prints, exits or throws; codes EDUMP_NO_PROJECT, EDUMP_FAILED, EDUMP_ERROR; runs only as the entry point), `packages/chicla-kit/src/cli.mjs` (`dump` no longer pending; only `recovery` is). `/dump` in `CLAUDE.md` and item 17 still call the script, unchanged.
- Behaviour changes: importing the script no longer dumps anything or creates the output folder; the stderr of the external `zip`/`tar` fallback is captured and shown at the end instead of inherited; `--hash-limit` takes a number too. The `toolchain-digest` pin did NOT move: `emergency-dump.mjs` is not one of the five pinned RECOVER files (D82 said both cores were).
- Found and fixed while doing it: re-indenting the body also changed the lines inside the report's template literal (headings lost their start of line); `manifest-readers` and the smoke caught it.
- Tests: `packages/chicla-kit/test/cli-dump.test.mjs` (11), red first (9 then); zips read with Python's zipfile; the old «dump is pending» assertion now covers `recovery` only. 8 hand mutants, all red (one survived at first, the EDUMP_ERROR branch, and got its test).
- Size: 2 source files, about 137 changed lines (diff ignoring whitespace; the body of the script moved into a function).
- Run (Node 22 only): `npm test` (903 tests, 902 pass, 1 skipped), `check-build`, `npm run smoke` (all green). Not run: Node 18/20, CI, macOS, `npm run mutants`.

## Round 116 — C11.1 slice 3b: `check-build` and `make-delivery` as cores, `chicla make-delivery` (v0.0.119)

- Task: C11.1, slice 3b (D81, confirmed by Rodrigo: «d81 sim»). `chicla make-delivery <out.zip> [--against <zip>]... [--allow-removed <path>]... [--json] [--root <dir>]` runs every step IN-PROCESS (manifest check, build check, manifest write, baseline, zip, verify), so a project in `--root` needs no `scripts/` folder; the zip writer is the kit's own.
- Files: `scripts/check-build.mjs` (core `checkBuild({root})`, codes EBUILD_FAILED, EBUILD_ERROR), `scripts/make-delivery-zip.mjs` (core `makeDelivery({out, against, allowRemoved, root})`, async; codes EDELIVERY_USAGE, EDELIVERY_STEP with `step` and `cause`, EBASELINE_WRITE, EZIP_WRITE, EDELIVERY_ERROR), `packages/chicla-kit/src/cli.mjs`. Both scripts run only as the entry point; importing them runs nothing; output is the same as before (parity tests, smoke untouched).
- Behaviour change: a relative `--against` path used to be resolved from the project root (the child process ran there) while the output path was resolved from the current folder; both now come from the current folder (no change when run from the project root, which is the normal case).
- Tests: `packages/chicla-kit/test/cli-make-delivery.test.mjs` (16), red first (the old scripts exit at import); 5 hand mutants (rejected zip kept, build check ignored, first manifest check also writes, `--against` ignored in the CLI, verify result ignored), all red then restored. Fixed in the test helper: the tree copy lacked `FILES.manifest`, which made the first parity run see a different state.
- Size: 3 source files, about 160 changed lines (diff ignoring whitespace).
- Run (Node 22 only): `npm test` (892 tests, 891 pass, 1 skipped), `check-build`, `npm run smoke` (all green). Not run: Node 18/20, CI, macOS, `npm run mutants`.

## Round 115 — C11.1 slice 3a: `verify-delivery` as a core and `chicla verify-delivery` (v0.0.118)

- Task: C11.1, slice 3 split in two by Claude (task size, rule 16): 3a = `verify-delivery` (this round), 3b = `make-delivery` (it runs the verifier and other scripts, so it comes after).
- Files: `scripts/verify-delivery-zip.mjs` (core `verifyDelivery({zip, against, allowRemoved, root})` + `renderVerifyDelivery`, no print/exit/throw; runs only as the entry point; the zip cache is now per call; codes EVERIFY_FAILED, EVERIFY_USAGE, EZIP_UNREADABLE, EPOLICY*), `packages/chicla-kit/src/cli.mjs` (`verify-delivery <zip> [--against]... [--allow-removed]... [--json] [--root]`; `--root` = the project whose policy applies).
- Behaviour change: a zip that cannot be read (missing, not a zip, broken central directory) used to crash with a stack trace; it is now `✗ EZIP_UNREADABLE` (exit 1). Everything else prints byte for byte as before (parity tests; all 11 existing verify tests and the smoke scripts untouched and green).
- Tests: `packages/chicla-kit/test/cli-verify-delivery.test.mjs` (13), red first (the old script exits at import); 4 hand mutants (problems not reported, `--allow-removed` ignored, zip not resolved against the CLI cwd, zip cache shared between calls), all red then restored; the first cache test was too weak (M4 survived) and was replaced by a corrupted-entry test.
- Size: 2 source files; the diff ignoring whitespace is about 90 lines (the body of the script moved into a function, so a plain diff counts ~200).
- Run (Node 22 only): `npm test`, `check-build`, `npm run smoke` (all green). Not run: Node 18/20, CI, macOS, `npm run mutants`.

## Round 114 — C11.1 slice 2b: the write modes of `chicla bump-round` (v0.0.117)

- Task: C11.1, slice 2b of 5 (D80). `chicla bump-round` now does the bump (no flag), `--refresh`, `--dry-run`, `--note <text>` and `--verify`; `--verify` with any of the others is `EUSAGE` (the script silently ignored them; the CLI refuses). `EOPTION_PENDING` is gone.
- Files: `scripts/bump-round.mjs` (the manifest step is injectable: `regenerateManifest(root) -> {ok, out, err}`; default still spawns `<root>/scripts/check-manifest.mjs`, so the script behaves as before), `packages/chicla-kit/src/cli.mjs` (passes `checkManifest` in-process: a bump works on a project with no `scripts/`).
- Tests: `packages/chicla-kit/test/cli-bump-round.test.mjs` now 21 (5 new for the CLI write modes, 1 for the injection; the old «pending» test replaced), red first (8 red); 4 hand mutants (refresh ignored, dry-run ignored, manifest step not in-process, `--verify` conflicts not refused), all red, then restored. Parity: the CLI and the script print the same on twin projects.
- Decisions: D80 (call on delegation) and the in-process manifest step were Claude's suggestions, accepted by Rodrigo with «avança» (2026-10-12).
- Run (Node 22 only): `npm test`, `check-build`, `npm run smoke` (all green, numbers in the reply). Not run: Node 18/20, CI, macOS, `npm run mutants`.

## Round 113 — C11.1 slice 2a: `bump-round` as a core and `chicla bump-round --verify` (v0.0.116)

- Task: C11.1, slice 2 split in two at Rodrigo's request (2026-10-12): 2a = the core of `bump-round` + `chicla bump-round --verify` (read only); 2b = the write modes through the CLI (bump, `--refresh`, `--dry-run`, `--note`).
- Files: `scripts/bump-round.mjs` (core `bumpRound({root, mode, dry, note})` + `renderBumpRound`, no print/exit/throw; runs only as the entry point; importing it runs nothing; codes EBUMP_USAGE, _STATE, _UNPAIRED, _VERIFY, _MANIFEST, _FINAL, _ERROR), `packages/chicla-kit/src/cli.mjs` (`bump-round --verify`; the other modes are refused with the new `EOPTION_PENDING`, exit 2).
- Tests: `packages/chicla-kit/test/cli-bump-round.test.mjs` (16), written first (all red; the old script ran when imported). One existing test changed on purpose: `bump-round` leaves the `ECOMMAND_PENDING` list in `cli-check-manifest.test.mjs`. Script output is byte-identical to before (parity tests, and `smoke-test-bump-round`, 12 checks, untouched).
- Mistake this round: that first red run imported the OLD script, which bumped the working copy twice (-116 to -118); I restored the tree from the upload and kept only the test file.
- Not done on purpose: the manifest step of a bump through the CLI (2b must run `checkManifest` in-process, because it still spawns `<root>/scripts/check-manifest.mjs`). Hand mutants: not run.
- Run (Node 22 only): `npm test` (858 tests, 857 pass, 1 skipped), `check-build`, `npm run smoke` (all green). Not run: Node 18/20, CI, macOS, `npm run mutants`.

## Round 112 — C11.1 slice 1: the `chicla` CLI dispatcher and `check-manifest` (v0.0.115)

- Task: C11.1, slice 1 of 5 (D80). `chicla check-manifest [--write] [--json] [--root <dir>]` runs the same code as the script (no child process). `--json` = one object on stdout, human text on stderr; exit 0 ok, 1 failed, 2 usage; `bump-round`, `make-delivery`, `verify-delivery`, `dump`, `recovery` are refused with `ECOMMAND_PENDING`.
- Files: `scripts/check-manifest.mjs` (core `checkManifest({root, write})`, no print/exit/throw; runs only as the entry point; same output as before, byte for byte in the parity test), `packages/chicla-kit/src/cli.mjs` (new), `packages/chicla-kit/package.json` (`bin`). New result code `EMANIFEST_LOST`, documented in `docs/manifest.md`.
- Tests: `packages/chicla-kit/test/cli-check-manifest.test.mjs` (16), red first (the CLI did not exist); 4 hand mutants (lost passes, runs on import, `--json` pollutes stdout, pending not refused), all red, then restored.
- Call on delegation (D80): the core stays in `scripts/` for now, because ten tests and two smoke scripts copy exactly three scripts into fake projects.
- Run (Node 22 only): `node --test` (842 tests; 1 red found and fixed, the doc test), `check-build`, `npm run smoke` (all green).
- Not run: Node 18/20, CI, macOS, `npm run mutants`.

## Round 111 — C6.4: the secret-marker test extended to the C6.3 cases (v0.0.114)

- Task: C6.4, test only (no product code). A marker string is planted in every kind of file that must never leave the machine (`.ssh/`, `.aws/`, `.npmrc`, `.netrc`, `.git-credentials`, `*.pem`, `id_rsa*` in any case and depth, `.env*`; in the project, in scratch space of work/ and in `outputs/`). The dump is made on the stream, `zip` and `tar.gz` paths and with `--project-only`; the marker must be in no member, marker JSON, report or console, nor in anything `recovery-report` extracts or writes. 14 look-alike controls must stay in the dump (an over-excluding rule fails too).
- Files: `test/secret-marker-chain.test.mjs` (5). No source and no `RECOVER/` file changed: the toolchain pin is unchanged. Delivery side (check-manifest, verify-delivery-zip): already in `secret-names` and `secret-content`, not repeated.
- Mutants, by hand, on the dump's rules (the tests protect behaviour that already worked, so «red first» is by mutation): 19, all red (folders, each name rule, lower case, `.env`, and each external-path pattern, `ci`).
- Noticed, not a bug: in the `tar.gz` fallback `.env.example`/`.env.sample` are not put back (documented limit in the dump's header); the test exempts those two controls there.
- Not run: Node 18/20, CI, macOS, `npm run mutants`.

## Round 110 — D79 confirmed; the dump report no longer calls a held file «lost» (v0.0.113)

- Task: Rodrigo answered «d79 sim tudo»: D79 (1) to (3) confirmed and (4) wanted now, so it is done in this round. `emergency-dump`: a held file that `FILES.manifest` lists is «held back» (own section), no longer «NOT on disk» in the report nor counted in «missing vs manifest» on the console; a file that is really gone stays listed. `recovery-report` already said «held back» (round 109).
- Files (1 source): `scripts/emergency-dump.mjs` (not in `RECOVER/`: the toolchain pin is unchanged). Docs: `ROADMAP.md` (D79 confirmed), the status file.
- Tests, first (1 red): `test/dump-allow-held.test.mjs` +2 (the manifest case with an NFD name; a dump with no project root). 4 hand mutants: 3 red, 1 survives (`normalize` on the held path before the prefix test: the fixture's project folder is ASCII, so it is untested for a non-ASCII project folder).
- Not run: Node 18/20, CI, macOS, `npm run mutants`.

## Round 109 — C6.3 slice c2: the dump releases `allow`, `recovery-report` says «held back» (v0.0.112)

- Task: C6.3 slice c2 (D77 (5), D78), which closes C6.3. `emergency-dump`: its OWN copy of the `allow` rule (D7; exact project path, NFC): a file the project's policy releases goes into the dump like any file, silently (not in `secretsHeld`, the report or the console); a policy that cannot be used releases nothing. `recovery-report`: reads `marker.secretsHeld`, lists those files under «Held back by the dump» (name and kind only) and takes them out of «MISSING»; a file the recovered policy allows stays MISSING (an older dump held it anyway).
- Files (2 sources): `scripts/emergency-dump.mjs`, `scripts/recovery-report.mjs`. `recovery-report.mjs` is in `RECOVER/`: the toolchain digest in `CLAUDE.md` changed.
- Tests, first (9 red; 2 controls already green): `test/dump-allow-held.test.mjs` (12: stream, zip and tar paths; NFC both ways; tie to `policyAllows()` by behaviour; broken policy or missing `policy.mjs`; policy listing wins; `--project-only`; `outputs/` and scratch files; the four marker shapes). 12 hand mutants, all red (3 survived at first and the tests were strengthened).
- Decisions to confirm: D79 (see ROADMAP). Noticed, not fixed: the dump's own report still lists a held manifest file under «NOT on disk».
- Not run: Node 18/20, CI, macOS, `npm run mutants`.

## Round 108 — docs only: D78 confirmed (v0.0.111)

- Task: record Rodrigo's answer «Confirmo tudo» (the five calls made on delegation in C6.3 slice c, D78) in `ROADMAP.md` and in the status file. Next task: C6.3 slice c2 (the dump and `recovery-report`).
- Files: `ROADMAP.md`, the status file. No source, no test, no script changed, so nothing in `RECOVER/` and no change of the toolchain pin.
- Not run: `npm test` on Node 18/20, CI, macOS (the full `npm test` was run on this tree).

## Round 107 — C6.3 slice c1: the `allow` key, manifest and verifier (v0.0.110)

- Task: C6.3 slice c cut at the seam of rule 16 (D78): c1 = `policy.mjs`, `check-manifest`, `verify-delivery-zip`; c2 = the dump and `recovery-report` (next). `chicla.policy.json` gets `"allow": [exact files from the project root]` (NFC): a file the CONTENT detector wrongly catches is released, silently, in the manifest and in the delivery verifier. It is the only key that loosens anything, and only the content rule: a path a name rule, a credentials folder, `.env`, a Python artefact or a skipped folder (`node_modules`, `.git`…) refuses is `EPOLICY_PATH` (an error, not a silent no-op); folders, globs, names and the policy file itself are refused; a listed name or path still wins. New `policyAllows(rel, policy)`.
- Files (3 sources): `scripts/policy.mjs`, `scripts/check-manifest.mjs`, `scripts/verify-delivery-zip.mjs`. `policy.mjs` is in `RECOVER/`: the toolchain digest in `CLAUDE.md` changed. Until c2 the dump still holds a released file back (the safe side) and `recovery-report` still calls it missing.
- Tests, first (9 red): `test/secret-allow.test.mjs` (11: parse, bad values, name rules refused, NFC, check-manifest write and check modes, bad allow stops both, verifier in both directions). Changed on purpose: `policy-file.test.mjs` (2) and `secret-names.test.mjs` / `secret-content.test.mjs` (`allow` is no longer an unknown key; for a name rule it is `EPOLICY_PATH`). 13 hand mutants, all red.
- Decisions to confirm: D78 (see ROADMAP).
- Not run: Node 18/20, CI, macOS, `npm run mutants`.

## Round 106 — docs only: D77 confirmed (v0.0.109)

- Task: record Rodrigo's answer «Confirmo tudo» (the five calls made on delegation in C6.3 slice b2, D77) in `ROADMAP.md` and in the status file. Next task: C6.3 slice c; the `recovery-report` «held back» wording (D77 (5)) goes with it.
- Files: `ROADMAP.md`, the status file. No source, no test, no script changed, so nothing in `RECOVER/` and no change of the toolchain pin.
- Not run: `npm test` on Node 18/20, CI, macOS (the full `npm test` was run on this tree).

## Round 105 — C6.3 slice b2: the dump holds back files whose content looks like a secret (v0.0.108)

- Task: C6.3 slice b2 (D73, D76). `scripts/emergency-dump.mjs` gets its OWN copy of the content detector (D7: no import of `policy.mjs` for it): a file with a private-key header, an AWS `AKIA`, a GitHub `ghp_` / `github_pat_` or an npm `npm_` token stays out of the stream, the external zip and the tar path (also in `outputs/`). The marker has `secretsHeld` (path + kind), the report a «Held back» section and the console lists them (first 10); never the match. Not scanned: over 1 MiB, empty, NUL byte, unreadable (never a reason to stop the dump). With `--project-only` only the project's held files are listed.
- Files (1 source): `scripts/emergency-dump.mjs`. Not in `RECOVER/`, so the toolchain pin is unchanged. The `allow` key (slice c) is NOT done.
- Tests, first (9 red): `test/dump-secret-content.test.mjs` (10: the three write paths, glob characters in a name, the match printed nowhere, `outputs/`, `--project-only`, an empty list, a table of 40 files that ties the copy to `policy.detectSecret` by behaviour, no static import, an unreadable file run as `nobody`). 22 hand mutants: 20 red, 2 survive on purpose (m14 marker order comes from `readdir` and cannot be forced; m19 is equivalent: `b.length === 0` also catches it).
- Noticed, not fixed: a held file that is in the manifest shows as «missing vs manifest» in the dump report and as MISSING in `recovery-report` (the held list explains it); to fix in slice c (D77).
- Decisions to confirm: D77 (five calls made on delegation, see ROADMAP).
- Not run: Node 18/20, CI, macOS, `npm run mutants`. The unreadable-file test needs the user `nobody`. No real token was tested; the samples have the right shape only.

## Round 104 — docs only: D76 confirmed (v0.0.107)

- Task: record Rodrigo's answer «d76 sim» (the six calls made on delegation in C6.3 slice b1) in `ROADMAP.md` and in the status file. He asked only to record it and not to start slice b2.
- Files: `ROADMAP.md`, the status file. No source, no test, no script changed, so nothing in `RECOVER/` and no change of the toolchain pin.
- Not run: `npm test` on Node 18/20, CI, macOS, non-root (the full `npm test` and `npm run smoke` were run on this tree).

## Round 103 — C6.3 slice b1: the content detector, manifest and verifier (v0.0.106)

- Task: C6.3 slice b1 (D73; D74 and D75 confirmed by Rodrigo, «d74 sim, d75 sim»). `scripts/policy.mjs` gets `detectSecret(buf)` and `scanFile(path)`: private-key headers, AWS `AKIA`, GitHub `ghp_` / `github_pat_`, npm `npm_`; files over 1 MiB (`SCAN_LIMIT`) or with a NUL byte are not scanned. It returns the kind only. `check-manifest` leaves such a file out of `FILES.manifest` (so out of a delivery) and prints its name and kind, never the match; a LISTED file that now holds a secret is a lost file with a «held back» note. `verify-delivery-zip` refuses a zip whose member holds one (`ESECRET_CONTENT`), delivery only, never `--against`. Built-in: the policy file has no key to switch it off.
- Files (3 sources): `scripts/policy.mjs`, `scripts/check-manifest.mjs`, `scripts/verify-delivery-zip.mjs`. `policy.mjs` is one of the 5 files of `RECOVER/`: the toolchain digest in `CLAUDE.md` changed. The dump (slice b2, its own copy, D7) and the `allow` key (slice c) are NOT done.
- Tests, first (8 red; 3 guards already green by design): `test/secret-content.test.mjs` (11: every shape and header, non-secrets by length, boundary and prose, the 1 MiB and NUL limits, `scanFile`, no policy key, `check-manifest` write and check modes, a skipped folder never opened, the verifier, `--against` not scanned, the whole chain through `make-delivery-zip`). Samples are built by concatenation so the project does not catch itself. 31 hand mutants: 28 red; 3 survive and are explained (empty buffer check is equivalent; the size check in `scanFile` only guards memory, `detectSecret` repeats the limit; one extra policy check is equivalent). The real tree has no detection.
- Decisions to confirm: D76 (six calls made on delegation, see ROADMAP).
- Not run: Node 18/20, CI, macOS, non-root, `npm run mutants`. No real token was tested; the samples have the right shape only.

## Round 102 — C6.3 slice a: the wider list of credential names (v0.0.105)

- Task: C6.3 slice a (D73, confirmed by Rodrigo). `scripts/policy.mjs` gets the built-in, never-removable name rules: the folders `.ssh` and `.aws` (`SECRET_DIRS`, also in `SKIP_NAMES`, so never walked at any depth) and the file names `.npmrc`, `.netrc`, `.git-credentials`, `*.pem`, `id_rsa*` (`isSecretFileName`, compared in lower case). `neverShipReason` gives a reason for both (the verifier refuses a zip that carries them); `isJunkName` takes the file names (the recovery); `check-manifest` skips them; `emergency-dump` keeps its OWN copy (D7) in the stream, external zip and tar paths. The policy file still only adds; there is no key to release a name rule (the `allow` key of slice c will not reach them).
- Files (3 sources): `scripts/policy.mjs`, `scripts/check-manifest.mjs`, `scripts/emergency-dump.mjs`. `policy.mjs` is one of the 5 files of `RECOVER/`, so the toolchain digest in `CLAUDE.md` changed (`bump-round` rewrote it).
- Tests, first (12 red, then green): `test/secret-names.test.mjs` (12: the predicate, the walk rules, reasons, `isJunkName`, a policy file cannot release, `check-manifest --write` with controls, the dump in 3 paths x project nested/at the root of `work/`). 22 hand mutants (each name, case, each folder, each rule, each dump list): all red. Existing tests changed: `policy.test.mjs` (the `SKIP_NAMES` list), `policy-file.test.mjs` (fixture `k.pem` became `k.key`), `emergency-home-noise.test.mjs` (see D74).
- Behaviour change to confirm (D74): with `work/` as the project root, its own `.npmrc` used to stay in a dump (C9.8); it is now out. D75 holds the calls made on delegation (case, `id_rsa.pub`, `SKIP_NAMES`, the dump's copy).
- Not run: Node 18/20, CI, macOS, non-root, `npm run mutants`. `verify-delivery-zip` was not run on a zip that carries a secret name (its rule is `neverShipReason`, tested directly).

## Round 101 — D72: the /dump project chat command (v0.0.104)

- Task: D72 (confirmed by Rodrigo, «confirmo tudo, avança»). `/dump project` (also «dump project», «dump projeto») is added to `CLAUDE.md` and to item 17 of the status file: the same three steps as `/dump`, with `--project-only` in step 1 (C6.2), and its own sentence «Dump created (project only): <n>. Send it to the next session with «recovery mode».». If the script refuses (no project root, exit 1) the AI says so in one sentence and offers a plain `/dump`; it does not run it unasked. The plain `/dump` text is untouched.
- Files: `CLAUDE.md`, the status file (item 17), `test/dump-sentence.test.mjs` +3 (red first: both files define it, the flag, the sentence with recovery mode and without the delivery zip, the refusal case, the two files carry the same sentence, the plain sentence unchanged). 5 hand mutants of the wording (flag missing in each file, sentence differing, refusal wording, plain sentence changed): all red. No script changed, so nothing in `RECOVER/` and no change of the toolchain pin.
- Also recorded: D71 and D73 confirmed. D73 includes the suggested answer: the `allow` key may release a false positive of the content detector only, never a name rule.
- Not run: Node 18/20, CI, macOS, non-root. The chat command itself was not rehearsed in a clean chat; G-C7 covered the plain `/dump` only.

## Round 100 — C6.2: emergency-dump --project-only (v0.0.103)

- Task: C6.2 (D70 confirmed by Rodrigo: the whole `work/` stays the default; the option is `--project-only`). `emergency-dump.mjs --project-only` takes ONLY the project root (the folder with `package.json` + `FILES.manifest`), the marker, the report and `RECOVER/`; the rest of `work/` and `outputs/` stay out. Works in all three write paths (the external zip and tar stage only the project folder at the same place inside `work/`, so `projectRootRel` stays right, also for a nested project). The marker has `projectOnly` and the report a «Scope» line. With no project root it refuses (exit 1, no dump) instead of silently widening; a plain `/dump` is untouched and still never fails for lack of a project.
- Files (1 source): `scripts/emergency-dump.mjs`. Not wired into the chat command: `/dump` is still the three steps of item 17 (D72 asks whether to add `/dump project`).
- Tests, first (9 red, then green): `test/dump-project-only.test.mjs` (10: three paths x project at the top and nested, no content from outside the project, the whole directory without the option, project at the root of `work/`, refusal with no project and a plain dump with none still working, a project-only dump read by `recovery-report`). 8 hand mutants (filter removed, flag ignored, marker field, no refusal, fallback staging the whole `work/`, nested staging, outputs scanned, outputs included): 6 red; the last two survive ALONE because `outputs/` is left out in two places (the scan and `includeOutputs`; kept on purpose, defence in depth) and are red together.
- Not run: Node 18/20, CI, macOS, non-root, `npm run mutants`.

## Round 99 — C6.1 slice d3: presets; C6.1 complete (v0.0.102)

- Task: C6.1 slice d3 (D68 and D69 confirmed by Rodrigo, «confirmo, avança»). `chicla.policy.json` takes `"presets": ["cargo", "node", "python"]`: ready-made lists of names (cargo `target`; node `dist`, `build`, `coverage`, `.turbo`; python `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, `.tox`, `.eggs`, `build`, `dist`). They are expanded into `names` inside `parsePolicy`, so `check-manifest`, `verify-delivery-zip`, `emergency-dump` and `recovery-report` get them with no change of their own. A preset only adds; an unknown, wrongly cased, non-list or prototype-key (`__proto__`, `constructor`) preset is `EPOLICY_FORMAT`. `parsePolicy` now also reports the chosen `presets` (`NO_POLICY.presets` is empty).
- Files (1 source): `scripts/policy.mjs`. It is one of the 5 files of `RECOVER/`, so the toolchain digest in `CLAUDE.md` changed (`bump-round` rewrote it).
- Heads-up, by design: `build` and `dist` skip any file or folder of that name at any depth, source folders included. A preset is opt-in; a project that has a real `src/build/` folder should list names or paths itself instead.
- Tests, first (3 red, then green): `test/policy-file.test.mjs` +4 (the three lists, expansion, refusals, any depth with whole-segment controls, built-in rules unchanged, `check-manifest` end to end), `test/dump-policy-file.test.mjs` +1 (a preset keeps its names out of the dump). 9 hand mutants (not expanded, unknown accepted, prototype keys via `in`, a renamed cargo name, a dropped `.turbo`, a dropped python `dist`, duplicate presets listed twice, the key refused, the field missing): all red. C6.1 is done (rounds 93 to 99).
- Not run: Node 18/20, CI, macOS, non-root, `npm run mutants`.

## Round 98 — C6.1 slice d2b: the dump and the recovery apply chicla.policy.json (v0.0.101)

- Task: C6.1 slice d2b (D66 and D67 confirmed by Rodrigo; D68 holds the calls made on delegation, to confirm). `emergency-dump.mjs` drops what the project's `chicla.policy.json` lists in all three write paths (stream: from the file list; external zip and tar: as patterns, glob characters in a listed name turned into `?` so they still match, which can only over-exclude). It reads `policy.mjs` through a guarded import and never stops because of the policy: a missing or broken module is `EPOLICY_IMPORT`, an unusable file keeps its `EPOLICY_*` code; the dump is then made with the built-in rules only and the marker (`policy: { applied, dropped, error }`), the report and the summary say so. `recovery-report.mjs` applies the recovered project's policy to the recovered tree, the baseline tree and the marker hashes; an unusable file is a warning.
- Files (2 sources): `scripts/emergency-dump.mjs`, `scripts/recovery-report.mjs`. `policy.mjs` is unchanged; `recovery-report.mjs` is one of the 5 files of `RECOVER/`, so the toolchain digest in `CLAUDE.md` changed (`bump-round` rewrote it).
- Tests, first (9 red, then green): `test/dump-policy-file.test.mjs` (7: the three paths with a name, a path, a path with `[1]*`, a file with a listed name, anchoring and whole-segment controls, no listed content in any member, marker, no file, bad file, missing module), `test/recovery-policy.test.mjs` +2, `test/policy.test.mjs` +1 (the dump names the same file as the policy). 12 hand mutants (no filter, patterns missing, no glob escape, no project dir, name over-match, no precheck, no marker, bad policy fatal in the dump and in the recovery, tree, integrity and baseline ignoring it): all red.
- Not run: Node 18/20, CI, macOS, non-root, `npm run mutants`. The glob handling was tested with Info-ZIP `zip` and GNU `tar` on this Linux only.

## Round 97 — C6.1 slice d2a: chicla.policy.json (v0.0.100)

- Task: C6.1 slice d2a (D65 confirmed by Rodrigo; D66 and D67 are calls made on delegation, to confirm). An optional `chicla.policy.json` at the project root ADDS «never leaves» rules: `{ "version": 1, "names": [...], "paths": [...] }` (names at any depth; paths from the root with everything below; NFC). It never removes a rule. Without the file nothing changes. A file that cannot be read, parsed or used stops the work with `EPOLICY_READ`/`EPOLICY_PARSE`/`EPOLICY_FORMAT`/`EPOLICY_PATH` (ignoring it would leak).
- Files (3 sources): `scripts/policy.mjs` (`POLICY_FILE`, `NO_POLICY`, `parsePolicy`, `loadPolicy`, `policySkips`, `neverShipReason(rel, policy)`), `scripts/check-manifest.mjs` (the walk skips what the policy lists), `scripts/verify-delivery-zip.mjs` (refuses a zip that carries it, also in the `--against` check). The policy file is a project file: listed and shipped.
- NOT done, on purpose (rule 16 and D67): `recovery-report.mjs` and `emergency-dump.mjs` do not read the policy yet (d2b). Until then a name or path listed in the policy stays out of the manifest and the delivery but NOT out of a `/dump`.
- Tests, first (9 red, then green): `test/policy-file.test.mjs` (parser codes, names and paths, NFC, only-adds, `loadPolicy`, `check-manifest` in a copy of the scripts); `smoke-test-delivery-guards.mjs` section 2b (4 checks: manifest, delivery, verifier, bad file). 13 hand mutants (names/paths ignored, prefix by text, fail-open, unknown key, no NFC, no version, `..` accepted, manifest and verifier ignoring it, a bad file ignored): all red; one needed a second try because its first edit also broke the syntax.
- Not run: Node 18/20, CI, macOS, non-root, `npm run mutants`.

## Round 96 — C6.1 slice d1: the Cedar corpus rules removed (v0.0.99)

- Task: C6.1 slice d1 (D64, D65 confirmed by Rodrigo). `corpus/real-world` and `corpus/huge` are no rule of Chicla any more: removed from `scripts/policy.mjs` (`PRIVATE_DIRS`, `isPrivateFile`, the `private corpus` reason), `check-manifest.mjs`, `recovery-report.mjs` and `emergency-dump.mjs` (the regex, the report line, the external-zip excludes and the put-back). A `corpus/` folder is an ordinary folder. Comments in `verify-delivery-zip.mjs` and `make-delivery-zip.mjs` follow. No Cedar preset (Cedar migrates after Chicla is finished).
- Behaviour change on purpose: files under `corpus/real-world/` and `corpus/huge/` now enter the manifest, the delivery and the dump. Slice d is split in d1 (this), d2 (`chicla.policy.json`), d3 (presets) (D65). Gates G-C1 and G-C2 closed by Rodrigo (recorded, not by the AI); D9 marked decided.
- Rule 16 deviation, reported: 4 source scripts changed (each a deletion of a few lines) plus two comments, because the removal cannot be split without leaving a script and its test out of step; the two smoke tests changed too.
- Tests, first (red, then green): `test/policy.test.mjs` (corpus paths now null, no `PRIVATE_DIRS`/`isPrivateFile`, +1 test: no script names a corpus rule in code), `test/dump-policy.test.mjs` (corpus files must be KEPT in the stream, zip and tar paths), `test/recovery-policy.test.mjs`, `test/emergency-dump-nozip.test.mjs`, `smoke-test-delivery-guards.mjs`, `smoke-test-emergency.mjs`. 6 hand mutants (a corpus rule put back in each script): all red; two survived at first (the external-zip exclude and a no-op) and the dump test was strengthened.
- Not run: Node 18/20, CI, macOS, non-root.

## Round 95 — C6.1 slice c: emergency-dump tied to the policy (v0.0.98)

- Task: C6.1 slice c. `emergency-dump.mjs` keeps its own copy of the rules (D7: it must not depend on an import that can break); a test now ties that copy to `scripts/policy.mjs`. The candidates are built from the policy's own lists, so a rule added to the policy is covered at once.
- Found and fixed: in the `tar.gz` last resort the dump let `*.tsbuildinfo` through (the policy excludes it; not a secret). One `--exclude` added to `emergency-dump.mjs`. Known and left: the tar path does not put back the private corpus `.gitkeep` or `.env.example`/`.sample` (documented in its header); the test only requires those controls in the stream and zip paths.
- Files: `scripts/emergency-dump.mjs` (one argument), `scripts/policy.mjs` (a comment). `test/dump-policy.test.mjs` (4; the tar case was red first, the other cases pass because the dump already obeyed the policy and are protected by 12 hand mutants of `emergency-dump.mjs`: 11 red, 1 equivalent: `--exclude=.env.*` in the tar path is repeated by the generated list). `policy.mjs` is one of the 5 `RECOVER/` files, so its comment changed the toolchain digest (`bump-round` rewrote the pin in `CLAUDE.md`: `6413e2121ffa…`). ROADMAP: C6.1.
- Not run: Node 18/20, CI, macOS, non-root.

## Round 94 — C6.1 slice b: recovery-report reads the policy (v0.0.97)

- Task: C6.1 slice b (D63 confirmed by Rodrigo). `recovery-report.mjs` no longer keeps its own junk/private rules: it reads `scripts/policy.mjs` (new `isJunkName`). The policy travels in `RECOVER/` (5 files now) and is covered by the toolchain pin: `emergency-dump.mjs` (one line of its `RECOVER/` list) and `bump-round.mjs` (its pin list) follow; `CLAUDE.md` pin rewritten by `bump-round`. A dump made before this round has 4 files in `RECOVER/` and is refused by the new pin (`EHASH_TOOLCHAIN`), as the pin is meant to do.
- One deliberate difference: the private-corpus rule in recovery is now anchored at the project root, like in the manifest and the baseline (it matched at any depth before).
- Files: `scripts/recovery-report.mjs`, `scripts/policy.mjs`, plus the one-line lists in `emergency-dump.mjs`, `bump-round.mjs`. Tests: `test/policy.test.mjs` +2 (red first); `test/recovery-policy.test.mjs` (1, written after the code, a dump made by Python: junk, secrets and private corpus not «New», nested `docs/corpus/...` is a normal file; 5 hand mutants of `recovery-report` red; the first 4 had been red only through the pin digest, which is why it was added); `emergency-recover-folder`, `toolchain-pin`, `emergency-fallback`, `emergency-home-noise` lists gained `policy.mjs`. ROADMAP: C6.1, D63.
- Not run: Node 18/20, CI, macOS, non-root. `emergency-dump` still holds its own rules (slice c).

## Round 93 — C6.1 slice a: the «never leaves» rules in one place (v0.0.96)

- Task: C6.1 (D60, confirmed by Rodrigo). Slice a: new `scripts/policy.mjs` (pure rules: names skipped, Python artefacts, `.env` secrets, private corpus); `check-manifest.mjs` and `verify-delivery-zip.mjs` read it and no longer keep their own copies. Behaviour kept (same reasons, same strings). D60 to D62 confirmed, D63 (the slices) proposed.
- Files: `scripts/policy.mjs` (new), `scripts/check-manifest.mjs`, `scripts/verify-delivery-zip.mjs`. `test/policy.test.mjs` (4, red first), 10 hand mutants of `policy.mjs` red (a first survivor killed by an added test). Test and smoke copy lists gained `policy.mjs` (`smoke-test-delivery-guards`, `smoke-test-bump-round`, `collisions-nfc`, `manifest`, `manifest-v2`). ROADMAP: C6.1, D60 to D63.
- Not run: `npm test` on Node 18/20, CI, macOS, non-root. `recovery-report` and `emergency-dump` still hold their own copy (slices b, c).

## Round 92 — D50 reworded: everything in the roadmap is built before 0.1 (v0.0.95)

- Task: Rodrigo: D50 means no capability that is not already in the roadmap; every card in the roadmap is built BEFORE 0.1. Docs only.
- Files: `ROADMAP.md` (D50 reworded; D19, D58, the M14 heading and a note in §11 follow; C6.1 to C6.4, C11.1, C11.5 and M14 are no longer «after 0.1»), status file (Snapshot, Next up). No source, script or test change.
- Not run: `npm test` on Node 18/20, `npm run smoke` (no script changed), CI, macOS, non-root.

## Round 91 — C9.10: round 87 tidied (v0.0.94)

- Task: second of the three tasks Rodrigo allowed in a row. Round 87 (ChatGPT) left a second `# Changelog` heading between two entries and reformatted `package.json`.
- Files: `CHANGELOG.md` (the second heading removed), `package.json` (`workspaces` and `engines` on one line again; only `"version"` differs from round 86). `test/changelog-heading.test.mjs` (1, red first). No source or script change. ROADMAP: C9.10.
- Not run: `npm run smoke` (no script changed), Node 18/20, CI, macOS, non-root.

## Round 90 — C9.9: the report inside a dump no longer asks for the last delivery zip (v0.0.93)

- Task: Rodrigo allowed three tasks in a row, exceptionally; this is the first (the string found in round 89).
- Files: `scripts/emergency-dump.mjs` (one line of the report: the baseline travels inside the dump, nothing else has to come with it). `test/emergency-report-text.test.mjs` (1, red first), 1 hand mutant red. ROADMAP: C9.9. `RECOVER/` files untouched (digest unchanged).
- Not run: Node 18/20, CI, macOS, non-root.

## Round 89 — D44: the /dump sentence no longer asks for the last delivery zip (v0.0.92)

- Task: Rodrigo confirmed D59 («sim d59») and asked for D44, now unblocked by the G-C7 closure. Docs only.
- Files: `CLAUDE.md` and item 17 of the status file: the sentence after a `/dump` is now «Dump created: <n>. Send it to the next session with «recovery mode».» (the baseline travels inside the dump, C9.6). `test/dump-sentence.test.mjs` (4, red first: the sentence in both files asks for «recovery mode», not for the zip, and the two files agree). ROADMAP: D59 confirmed, D44 applied. No source, script or toolchain file changed (the `RECOVER/` digest is unchanged).
- Found, not fixed: the report inside a dump (`scripts/emergency-dump.mjs`) still says «ideally together with the LAST good delivery zip»; it is a script string, outside D44.
- Not run: Node 18/20, CI, macOS, non-root; `npm run smoke` (no script changed).

## Round 88 — C9.8: the dump leaves out home-directory noise at the top of work/ (v0.0.91)

- Task: Rodrigo chose option A and closed G-C7 (clean chat on Claude and on ChatGPT; ChatGPT recovered with no zip and delivered round 87, which I checked: only metadata differs from round 86, `verify-delivery-zip --against` passes, `npm test` 703/704 with 1 skip). From that rehearsal: the dump carried a 60 MB `uv` binary, `.config`, `.npmrc` (can hold a registry token) and `.wget-hsts`.
- Files: `scripts/emergency-dump.mjs` (top-level `.local`, `.config`, `.npmrc`, `.wget-hsts` skipped unless `work/` is the project root; named in the report and in `marker.homeSkipped`; the external `zip`/`tar` path skips the same names). `test/emergency-home-noise.test.mjs` (4, red first), 7 hand mutants, all red. ROADMAP: C9.8, D59 (proposed), D58 lifted, D44 unblocked, not applied.
- Decision by Claude: `recovered*` is NOT skipped (option A listed it): recovery mode works inside `recovered/work/<project>`, so skipping it would drop a recovery session's work (D59).
- Found, not fixed: round 87 left a second `# Changelog` heading (line 11) and reformatted `package.json` (`workspaces`, `engines`); the `tar.gz` path was checked by hand, not by a test.
- Not run: `npm run smoke`, Node 18/20, CI, macOS, non-root.

## Round 87 — recovery delivery: recovered from emergency dump (v0.0.90)

- Task: recovery-only delivery; no task was in progress. The emergency dump matches the round 86 baseline exactly (111 files); no project files were lost, added or modified.
- Files: `CHANGELOG.md`, `package.json`, `CHICLA_PROJECT_STATUS-91.md`, generated fingerprints and `FILES.manifest`. No product code changed.
- Checks: recovery report, baseline comparison, `check-manifest`, `check-build` and `bump-round --verify` passed. `npm test` was attempted but exceeded the 300-second execution limit; the run did not finish.
- Not run: `npm run smoke`, Node 18/20, CI, macOS.

## Round 86 — docs only: D58 recorded, wait for the G-C7 rehearsal (v0.0.89)

- Task: Rodrigo answered «esperar pelo G-C7» to the next-task question. ROADMAP gets D58 (confirmed); the status file's «Next up» says no card is waiting. No source, script or test change.
- Not run: macOS and Node 18/20 locally (CI), non-root.

## Round 85 — C7.3: NFC/NFD collisions are errors in the manifest, on disk and in the delivery zip (v0.0.88)

- Task: Rodrigo chose C7.3 and confirmed D56 (a collision is an ERROR everywhere, «erro em todos»), D57 (`EMANIFEST_COLLISION` for manifest and disk, `EZIP_COLLISION` for the zip) and one slice. Before: the NFC comparison (round 1r) put look-alike names under one key, so a lost file could hide behind its look-alike and a zip's crc32/size check only saw one of two.
- Files: `scripts/manifest.mjs` (`parseManifest` and `serializeManifest` refuse two different paths with one NFC name; the same path twice stays `EMANIFEST_DUPLICATE`), `scripts/check-manifest.mjs` (two files on disk that collide stop the check and `--write`; the manifest is left as it was), `scripts/verify-delivery-zip.mjs` (`EZIP_COLLISION`, read before names are folded). `docs/manifest.md` explains the new code (its test requires it). `test/collisions-nfc.test.mjs` (6, red first, except the regression guard «manifest NFD, disk NFC, nothing lost», which pins the existing comparison). 8 hand mutants, all red. `emergency-dump` is untouched (D7; C9.3 already lists collisions).
- Not run: macOS and Node 18/20 locally (CI), non-root; the disk test skips where the file system folds the two names (APFS), so on the Mac CI only the manifest and zip tests run.

## Round 84 — C9.5: tests that break chicla-zip on purpose and check the dump still comes out (v0.0.87)

- Task: Rodrigo confirmed D54 («sim, sem fallback») and D55 («sim, manter») and approved C9.5. The external path of `emergency-dump` (D7: `zip`, then `tar`) already existed but nothing forced it. No source change.
- Files: `test/emergency-fallback.test.mjs` (4, run on a copy of the tool tree with a broken `zipkit.mjs`: the writer throws; the module does not parse; no `zip` → `.tar.gz`; neither `zip` nor `tar` → exit 1, no dump). The dump is read by Python; the secret `.env` stays out; the marker keeps the hashes; the report says «used zip/tar». The first three passed at once (existing behaviour), so protection was proved by 6 hand mutants, all red (no catch, tar path skipped, `.env` not excluded, hashes not reset, no note in the report, exit 0 with no dump). ROADMAP: D54 and D55 recorded as confirmed; C9.5 closed.
- Found, not fixed: the `tar -czhf` fallback needs `gzip` on the PATH (a PATH without it gives «dump NOT created»; real machines have it, the test gives it to `tar`).
- Not run: macOS and Node 18/20 locally (CI), non-root, full `npm run smoke` (no script changed).

## Round 83 — C9.4 slice b: `recovery-report` extracts the dump and the baseline with chicla-zip, no external unzip (v0.0.86)

- Task: Rodrigo «avança» (no open decisions; next = C9.4 slice b). `recovery-report` imports `extractZip` from `./zipkit.mjs` (beside it in `RECOVER/`) or from `packages/chicla-zip/src/` (in the tree); the dump and the `--baseline` zip go through it. A refusal (`EUNSAFE`, `ECOLLISION`…) prints the code and exits 1 with nothing written outside the destination; there is no fallback to `unzip` (D54 proposed). `.tar.gz` dumps (the old emergency path) still use `tar`. **C9.4 is closed.**
- Files: `scripts/recovery-report.mjs` (source, 1), `test/recovery-nounzip.test.mjs` (5, red first; PATH with node only, `LC_ALL=C`, Python writes the hostile zips; tests 3 and 4 were tightened to need `EUNSAFE` because they passed for the wrong reason). 4 hand mutants, all red (no-op extract, swallowed baseline error, hidden error code, always the tree path: the last one reddens `emergency-recover-folder`). The toolchain pin in `CLAUDE.md` changed with the script (`bump-round`).
- Found, not fixed: the start line of item 17 still uses `unzip` to take `RECOVER/` out of the dump, because the digest must be checked BEFORE any code from the zip runs (D55 proposed). Slip: I ran `bump-round --help` (no such flag) and it bumped seq 86 → 87 early; harmless, it is this round's number.
- Not run: macOS and Node 18/20 locally (CI), non-root, `npm run smoke` beyond `smoke-test-emergency` (the only script that reads `recovery-report`; passed), a real dump with a non-UTF-8 locale on macOS.

## Round 82 — C9.4 slice a: the recovery toolchain is pinned in CLAUDE.md and checked before it runs (v0.0.85)

- Task: Rodrigo «avança»; he confirmed both open questions (this round, via AskUserQuestion): `bump-round` writes the digest into `CLAUDE.md` and `--verify` checks it; on a mismatch recovery STOPS (`EHASH_TOOLCHAIN`, exit 3) unless he says `--trust-toolchain`. Digest = sha256 of `sha256sum RECOVER/*.mjs` (a shell reproduces it). The start line of item 17 now compares it in the shell BEFORE running anything from the zip; `recovery-report` run from a `RECOVER/` folder checks it again (second look; a hostile script could skip it, the shell check is the real guard). Run from `scripts/` nothing is checked.
- Files: `scripts/bump-round.mjs`, `scripts/recovery-report.mjs` (source), `CLAUDE.md` (the pin line), status item 17, `test/toolchain-pin.test.mjs` (5, red first; includes the start line run for real against a good and a swapped toolchain). 6 hand mutants: 5 red, 1 equivalent (the explicit `sort`: the names are already alphabetical). Note: mutating `recovery-report.mjs` also reddens the pin test (its digest changes), so M1 to M3 are red for two reasons.
- Slice b (extract with `chicla-zip`, no `unzip` in `recovery-report`) is the next round: this one already touches 2 source files plus the pin.
- Not run: macOS and Node 18/20 locally (CI), non-root; recovery with `--baseline` through the new start line; `sha256sum` on macOS (it has `shasum -a 256`; the start line is untested there, G-C7 rehearsal).

## Round 81 — C9.3: NFC/NFD name collisions at the top of the dump report, on the console and in the marker (v0.0.84)

- Task: Rodrigo «avança» (no open decisions; M9 next). `emergency-dump.mjs` groups the project's true names that fold to the same NFC; the groups go in a section at the TOP of `RECOVERY_REPORT.md`, on the console (names printed) and in `marker.collisions`. They are no longer an «error» line at the end of the report. The dump still comes out (exit 0, zip) with both files in it.
- Files: `scripts/emergency-dump.mjs` (source), `test/emergency-collisions.test.mjs` (2, red first; skipped where the file system folds the names). 4 hand mutants, all red (marker empty, no console line, wrong threshold, section moved after the regular ones). `smoke-test-emergency` T4 (report and recovery-report warn) still passes.
- Not run: macOS and Node 18/20 locally (CI), non-root, a case-only collision (the card says NFC/NFD; `recovery-report` and `collisionsOf` already own the wider rules).

## Round 80 — C9.2: the dump carries RECOVER/ (the recovery toolchain, ASCII names) with its sha256 in the marker (v0.0.83)

- Task: Rodrigo «avança» (no open decisions; M9 next). `emergency-dump.mjs` adds `RECOVER/recovery-report.mjs`, `baseline.mjs`, `manifest.mjs`, `zipkit.mjs` (read from the tree that ran, so they match it) and `marker.toolchain` = sha256 of each. The start line in item 17 is now `unzip -q dump.zip 'RECOVER/*' -d $R && node $R/RECOVER/recovery-report.mjs …`; checked on a dump of the real tree (exit 0).
- Found: the old start line (copy ONE file to /tmp and run it) has been broken since `recovery-report` imports `./baseline.mjs` and `./manifest.mjs` (`ERR_MODULE_NOT_FOUND`, reproduced). No smoke test covered that line; the new test does.
- Files: `scripts/emergency-dump.mjs` (source), `test/emergency-recover-folder.test.mjs` (2, red first; Python reads the zip), status item 17. 3 hand mutants, all red (hash of less, a missing file, a non-ASCII name).
- Not run: macOS and Node 18/20 locally (CI), non-root; the zip/tar fallback also gets RECOVER/ but is untested (C9.5); the marker's toolchain hash is not yet CHECKED by anyone (C9.4).

## Round 79 — C9.1: the /dump writes with chicla-zip's writeZipStream, no external `zip` (v0.0.82)

- Task: Rodrigo «avança» (no open decisions; "Next up" = M9). `emergency-dump.mjs` streams every file into the zip with `writeZipStream`; each project file is hashed (sha256) in that same pass; `RECOVERY_MARKER.json` and `RECOVERY_REPORT.md` are written LAST (they need the hashes and the read errors). Past the hash limit (default 300 MB, test option `--hash-limit`) files still go in, unhashed, and the marker says so (`hashLimit`, `hashLimitReached`, `unhashed`). A file that fails mid-read is cut, recorded in `reportErrors`, and the dump goes on.
- D7 kept: if the writer fails for any reason, the old `zip` / `tar` path runs (hashes redone, the failure recorded). Not tested yet: that is C9.5.
- Found by the smoke test: a dump with bit 11 on non-ASCII names is extracted by Info-ZIP `unzip` 6.00 as `caf#U00e9` in a C locale, so `recovery-report.mjs` (and the smoke test) now run `unzip` with `LC_ALL=C.UTF-8`. The next session's start line (item 17) only unzips ASCII names, so it is unaffected; C9.2/C9.4 remove the dependency.
- Files: `scripts/emergency-dump.mjs` (source), `scripts/recovery-report.mjs` (one line), `scripts/smoke-test-emergency.mjs` (one line), `test/emergency-dump-nozip.test.mjs` (4, red first; PATH with node only; Python and `unzip` as readers). 4 hand mutants, all red (no hash update, limit off, limit flag hidden, report name). Empty folders are no longer in the dump (files only).
- Not run: macOS and Node 18/20 locally (CI), non-root, the fallback path (C9.5), `recovery-report` without `unzip` (C9.4).

## Round 78 — C8.3: --against and --allow-removed pinned on a PATH with node only; M8 closed (v0.0.81)

- Task: Rodrigo «d52 sim. avança» (D52 confirmed). C8.3 asked for `--against` and `--allow-removed` to be ported. They already work without `zip`/`unzip` since rounds 76 and 77, so this round adds no product code: `test/verify-against.test.mjs` (5) pins them on a PATH with node only. Previous zips are made by Python.
- The tests passed before any change (nothing was left to port): they protect by the mutants. 5 hand mutants of `verify-delivery-zip.mjs`, all red: NFC of `--allow-removed` (survived until a test passed the path in NFD), unwrapping of an upload folder, junk/private exemption, status-file exemption, `--allow-removed` itself. Also pinned: `make-delivery-zip` passes both options on, and a refused delivery leaves no zip.
- Files: tests and docs only; no source file. M8 (C8.1 to C8.3) is closed. `emergency-dump` and `recovery-report` still use `zip`/`unzip` (M9, next).
- Not run: macOS and Node 18/20 locally (CI), Windows, non-root; only Node 22. `npm run smoke` not re-run (no script changed).

## Round 77 — C8.2: verify-delivery-zip reads the zip itself, no `unzip`; bit 11 required in the delivery (v0.0.80)

- Task: Rodrigo «avança» (C8.2 of D50). `scripts/verify-delivery-zip.mjs` reads entry bytes with its own reader (local header, stored or deflate) and checks size and crc32 against the central directory: `EZIP_DATA`. Non-ASCII names without the UTF-8 flag (bit 11): `EUTF8_FLAG`, in the delivery only; `--against` uploads are never held to either rule. D52 (proposed, call on delegation): the reader is the script's own, not `chicla-zip`, so the verifier stays independent of the writer.
- Tests first (5 red): `test/verify-nounzip.test.mjs` (7): the whole chain (make + verify) on a PATH with node only; all-stored and all-deflated zips verify; same-size swap, a flipped byte (deflated and stored), a lying size, a missing bit 11, and the `--against` exemption. 7 hand mutants: all red once two tests were added for the crc and size checks; one explained survivor, the bounds check (the size check catches the same case). `test/manifest-v2.test.mjs`: its re-zip helper now sets bit 11 itself (Info-ZIP does not in every locale).
- Files: 1 script; tests, docs. Not done: `emergency-dump` and `recovery-report` still use `zip`/`unzip` (M9); C8.3 next.
- Not run: macOS and Node 18/20 locally (CI), Windows, non-root; only Node 22. `npm run smoke` passed here.

## Round 76 — C8.1: make-delivery-zip writes the zip with chicla-zip, no external `zip` (v0.0.79)

- Task: Rodrigo «d51 sim. avança» (D51 confirmed; next task of D50). `scripts/make-delivery-zip.mjs` writes the delivery with `writeZip` (imported from `packages/chicla-zip/src/zipkit.mjs`): the files of the manifest in manifest order, mode and mtime kept, a non-regular file refused; any failure deletes the partial zip and exits 1. `writeZip`, not `createZip`: the list comes from the manifest, not from walking the tree.
- Tests first (2 red): `test/make-delivery-nozip.test.mjs` (3): a PATH with node and `unzip` but no `zip`; the zip passes `unzip -tq` and Python `testzip`, lists exactly the manifest; execute bit and mtime survive (Python reads them); module missing: exit 1, no zip. 3 hand mutants: 2 red (mode, mtime), 1 explained survivor (the regular-file check: the manifest lists only files). Fixtures of `smoke-test-delivery-guards.mjs` and `manifest-v2.test.mjs` now copy `zipkit.mjs`; smoke section 4b now fakes a failing writer instead of a failing `zip`.
- Files: 1 script + the smoke test; tests, docs. Not done: `verify-delivery-zip` still reads with `unzip` (C8.2, next); `emergency-dump` and `recovery-report` still use `zip`/`unzip` (M9).
- Not run: macOS and Node 18/20 locally (CI), Windows, non-root; only Node 22. `npm run smoke` passed here.

## Round 75 — C5.5 slice b: pack-release script and a CI `pack` job (v0.0.78)

- Task: Rodrigo «avança» (next task of D50). New `scripts/pack-release.mjs <package-dir> --out <dir> [--json]`: `npm pack` in a scratch folder, refuses a private package (`EPRIVATE`) or a tarball without LICENSE (`ELICENSE`), then writes the `.tgz`, `<file>.sha256` and prints release notes (file, size, sha256, contents). Same tree, same sha256. CI job `pack` (Linux, Node 22) runs it on `chicla-zip` and keeps `dist/` as an artifact. Nothing is published.
- Tests first (9 red): `test/pack-release.test.mjs` (7; `sha256sum -c` and `tar -tzf` as independent readers) and `test/ci.test.mjs` +2. 4 hand mutants: 2 red (private check, LICENSE check); 2 survivors explained: one space instead of two in the `.sha256` line (GNU `sha256sum -c` accepts it), and `--ignore-scripts` removed (the package has no scripts).
- Files: 1 script, the CI file; tests, docs. D51 is still PROPOSED (not answered).
- Not run: the new CI job on GitHub (gate G-C10), macOS and Node 18/20 locally, `npm run smoke`, non-root; only Node 22.

## Round 74 — D50 recorded; C5.5 slice a: chicla-zip is packable (v0.0.77)

- Task: Rodrigo discussed the direction and confirmed D50 («d50 sim e avança»): no new capability before 0.1. Next task = C5.5 slice a. `packages/chicla-zip/package.json` (`main`, `exports`, `bin` `chicla-zip`, `files` allowlist, repository), `README.md`, `LICENSE` (copy of the root one). D51 proposed.
- Tests first (5 red): `packages/chicla-zip/test/package.test.mjs`: `npm pack --dry-run` lists exactly 4 files; the tarball is installed in a clean folder, imported, the bin runs, a zip written by it passes `unzip -tq`. 2 hand mutants red (allowlist widened; main check without realpath).
- Bug found by the install test: an installed bin (a symlink in `node_modules/.bin`) never ran the CLI. One line in `zipkit.mjs` (`isMain` with `realpathSync`).
- Not run: macOS and Node 18/20 locally (CI), Windows, `npm run smoke`, non-root; only Node 22. Nothing published (rule 4). The mutant list (`npm run mutants`) was not extended or run.

## Round 73 — the stray folder o/ is removed (v0.0.76)

- Task: remove `o/` (Rodrigo: «remove», D49). It held `o/hello.txt` and `o/dir/b.txt`, the files of the `good()` fixture in `packages/chicla-zip/test/cli.test.mjs`: the leftover of an extraction to a relative `o` in the project root. Nothing referenced it (searched scripts, tests, packages, docs and the roadmap). It had been in the manifest, so in every delivery.
- Files: the two files deleted; docs. No code, no test changed. The zip is built with `--allow-removed o/hello.txt --allow-removed o/dir/b.txt`.
- Not known: who created it and when (mtime 2026-10-10 19:37). Not added: a guard against stray files in the root; nothing asked for it.
- Not run: macOS and Node 18/20 locally (CI), Windows, non-root; only Node 22.

## Round 72 — C7.1 slice c: docs/manifest.md, and a test that keeps it in step with the code (v0.0.75)

- Task: C7.1 slice c (Rodrigo: «a sim, b sim, c sim, c-tarefa sim»; D48 a to c confirmed). New `docs/manifest.md`: the v1 and v2 formats, who writes and reads the manifest, what `check-manifest`, `make-delivery-zip` and `verify-delivery-zip` each check, the exempt baseline and why, the five `EMANIFEST_*` codes, and the limits. Indexed in `docs/README.md`. **C7.1 is closed.**
- Tests first (4 red before the doc): `test/manifest-docs.test.mjs` (the doc exists and is indexed; shows the exact v2 header; every `EMANIFEST_*` code in the scripts is in the doc and none is in the doc only; says the baseline is exempt and that nothing is decompressed). No script changed.
- Files: docs and one test; no source file, no product code. Two sentences of the first draft claimed more than was checked (zip64, `unzip -t`) and were cut back.
- Not run: macOS and Node 18/20 locally (CI), Windows, non-root; only Node 22.

## Round 71 — C7.1 slice b + C7.2: the manifest is written as v2 and checked against the zip (v0.0.74)

- Task: C7.1 slice b (Rodrigo: "avança", then «1 sim, 2 sim, 3 sim, 4 sim» to the four decisions, D48). `check-manifest --write` writes FILES.manifest as v2 (path, crc32, size; no sha256). `verify-delivery-zip` compares crc32 and size of every listed file with the zip's central directory, without decompressing: `EMANIFEST_SIZE` (first) and `EMANIFEST_CRC32`; a v1 manifest is still accepted (paths only). `FILES.baseline.json` is listed but exempt from that check (it hashes the manifest: circular; D48a). `manifest.mjs` gains `crc32` (`zlib.crc32` when present, else a table).
- Tests first (5 red before the code): `test/manifest-v2.test.mjs` (10; crc32 from Python zlib, bytes from `unzip`; tampered zips: same size, truncated, emptied, older bytes, size only; v1 and `--against` v1 still pass). 6 hand mutants, all red. Old readers moved to the parser: `baseline`, `license` and `manifest` tests, smoke `bump-round` and `delivery-guards`.
- Files: 3 scripts (`manifest`, `check-manifest`, `verify-delivery-zip`); tests, smoke, docs. Also fixed: the status file's "Current version" line (was v0.0.62).
- Not built: crc32 comparison between this zip and the previous one (D48c). Open: D48 a to c.
- Not run: macOS and Node 18/20 locally (CI), Windows, non-root; only Node 22.

## Round 70 — C7.1 slice a2: dump, recovery and delivery read the manifest through the parser (v0.0.73)

- Task: C7.1 slice a2 (Rodrigo: "avança"). `make-delivery-zip.mjs`, `recovery-report.mjs` and `emergency-dump.mjs` read FILES.manifest through `parseManifest` (v1 and v2), so every reader in `scripts/` now does; nothing writes v2 yet. Behaviour on a bad manifest: `make-delivery-zip` aborts with the code (no zip); `emergency-dump` NEVER fails for it (records `EMANIFEST_*` in the report's errors and still makes the zip: its safe() now prints the error code); `recovery-report` without a baseline says «NO USABLE BASE» with the code and lists nothing as new or missing (it used to crash or call everything new), exit 0.
- Tests first (5 red before the code): `test/manifest-readers.test.mjs` (a scan that no script splits FILES.manifest by hand; dump and recovery with a v2 manifest; dump and recovery with a corrupt one). Hand mutants, red: the recovery guard removed, the code dropped from the dump's error line.
- Files: the 3 scripts; test, docs. No product code.
- Next: slice b (`check-manifest --write` writes v2; `verify-delivery-zip` checks crc32 and size against the zip's central directory, C7.2), then c (docs).
- Run: `check-build`, `npm test`, `npm run smoke`. Not run: macOS and Node 18/20 locally (CI), Windows, non-root.

## Round 69 — C7.1 slice a1: one parser for FILES.manifest v1 and v2 (v0.0.72)

- Task: C7.1 (Rodrigo chose 3 slices, 2026-10-11; a is itself split in a1 and a2 so each round keeps to 3 source files). New `scripts/manifest.mjs`: `parseManifest` reads v1 (one path per line) and v2 (header `# chicla-manifest v2`, then `path<TAB>crc32<TAB>size[<TAB>sha256]`), `serializeManifest` writes either. Errors have codes `EMANIFEST_FORMAT`, `EMANIFEST_DUPLICATE`, `EMANIFEST_UNSAFE` (the manifest is input: `..`, absolute and empty-segment paths are refused). `check-manifest.mjs` and `verify-delivery-zip.mjs` read through it; a corrupt manifest now FAILS them instead of being half-read. Nothing writes v2 yet, so the delivery is unchanged.
- Tests first (red before the code): `test/manifest.test.mjs` (9: v1, v2, the «#» path, round trip, 12 refusals, serialize refusals, `check-manifest` and `verify-delivery-zip` on a v2 manifest, corrupt manifest). Hand mutants, all red: unsafe check off, duplicate check off, header test loosened to any «#» line.
- Files: `scripts/manifest.mjs` (new), `scripts/check-manifest.mjs`, `scripts/verify-delivery-zip.mjs`; `smoke-test-delivery-guards`, `smoke-test-bump-round` (it copies the scripts it needs; it broke without `manifest.mjs`) and `layout.test` list the new script.
- Next: a2 = `make-delivery-zip`, `recovery-report`, `emergency-dump` read through the parser (they still split lines, which is fine until something writes v2); then b = `check-manifest --write` writes v2 and `verify-delivery-zip` checks crc32 and size against the zip's central directory (C7.2); then c = docs.
- Run: `check-build`, `npm test`, `npm run smoke`. Not run: macOS and Node 18/20 locally (CI will), Windows, non-root.

## Round 68 — D47 confirmed, macOS green (v0.0.71)

- Docs only. D47 (tests skip by a MEASURED probe, never by platform name) confirmed by Rodrigo, 2026-10-11. He also reports that every CI job, macOS included, came back green on the round-66 code (the 41 failures were test assumptions); G-C3 now has fresh evidence on the current code (Node 18, 20, 22 on macOS-latest and Ubuntu), and Rodrigo closes it. Still not checked on a Mac: the exFAT/FAT copy fallback of C2.7, and what macOS does with equivalent names in the 5 skipped tests.
- Files: `ROADMAP.md`, status file, this entry. No code. Run: `npm test`, `npm run smoke`. Not run: macOS locally, Node 18 and 20 locally, non-root.

## Round 67 — G-C1 evidence recorded (v0.0.70)

- Docs only. Rodrigo's `npm view chicla` (2026-10-11): `chicla@0.0.0`, 2 versions, our placeholder, maintainer `n4sc1m3nt0`, published 2 days earlier. With `which chicla` finding nothing and the repo public, the checks of G-C1 are all in; Rodrigo closes the gate. D47 is still PROPOSED (no answer yet).
- Files: status file, this entry. No code. Run: `npm test`, `npm run smoke`. Not run: macOS, Node 18 and 20 locally, CI, non-root.

## Round 66 — the macOS CI jobs: 41 test failures, all in the tests (v0.0.69)

- Task: the red macOS jobs of the first CI run (Rodrigo sent the logs, 2026-10-11). Same 41 failures on Node 18, 20 and 22; Ubuntu all green; `bench` green (ratio 1.3x on the runner). No product bug: the product behaves correctly on APFS (it refuses equivalent names with `ECOLLISION`); the TESTS assumed Linux. Causes: (1) Apple's `zipinfo` prints every non-ASCII byte as «?» (30 random-tree tests of `differential-python`, plus `interop` x2 and `write-interop`); (2) APFS is case- and NFC/NFD-insensitive, so a tree holding `a.txt` + `A.txt` or `café` in two forms cannot be built (`cli-create` x2, `cli-m4-gaps`, `write-interop` round trip); (3) `/var/folders` is a link to `/private/var/folders` while the extractor reports real paths (`extract-exdev`, `extract-rollback` x2); (4) APFS refuses a name with U+FFFF (`EILSEQ`, `create` ordering test).
- Reproduced on Linux before the fix (red): a symlinked `TMPDIR` (the 3 realpath tests) and a `zipinfo` shim that turns non-ASCII bytes into «?» (the 3 reader tests and the random trees).
- Fix, tests only: new `test/fsprobe.mjs` (probes that MEASURE the machine: case-insensitive, normalising, refuses noncharacters, lossy `zipinfo`, link-free temp base); the zipinfo reader compares names with runs of non-ASCII collapsed to «?» only where that probe says it is lossy; the 5 tests that need an impossible tree are skipped there with a reason, the others use `realTmp()` and drop `U+FFFF` where refused; `fsprobe.test.mjs` (3). Linux: 76 tests of the touched files green, also with the shims.
- Files: 8 test files (`fsprobe.mjs` new), no source. Run: `check-build`, `npm test`, `npm run smoke`.
- Not run: macOS itself: these fixes are NOT confirmed on a Mac until the next CI run; if more fails, a failure hidden behind these 41 may show. The skipped tests do not check what macOS does with those names (it should refuse with `ECOLLISION`): a follow-up once a Mac log exists. Node 18/20 locally, Windows, non-root.

## Round 65 — D46: Apache-2.0 (v0.0.68)

- Task: G-C2 decided by Rodrigo (2026-10-11): Apache-2.0. `LICENSE` (the Apache License 2.0 text, terms only, no copyright line: Claude does not invent a holder) in the root; `"license": "Apache-2.0"` in the root and both `package.json`; `CLAUDE.md` rule 5 rewritten (it said to leave `UNLICENSED`). Rodrigo closes G-C2; nothing is published (rule 4).
- Tests first (4 red before): `test/license.test.mjs` (the text and its main clauses, SPDX id in 3 files, `CLAUDE.md`, `LICENSE` in the manifest).
- Reported, not fixed: CI is RED on the macOS jobs (`npm test`, exit 1) since round 63's push, bench green; the session cannot read the GitHub logs, so the failing tests are not known yet (needs the `not ok` lines from the log). The macOS suites had last run on round-7 code (G-C3), so this is probably a new macOS-only difference.
- Files: `LICENSE` (new), three `package.json`, `CLAUDE.md`; test, docs. No source code touched.
- Run: `check-build`, `npm test`, `npm run smoke`. Not run: Node 18 and 20, macOS, Windows, CI, non-root.

## Round 64 — D45 confirmed (v0.0.67)

- Docs only. D45 (the CI `bench` job fails the CI above 3x) confirmed by Rodrigo, 2026-10-11, who then moved to the gates; no card closed, no gate changed.
- Files: `ROADMAP.md`, status file, this entry; no code touched. Run: `check-build`, `npm test`, `npm run smoke`. Not run: Node 18 and 20, macOS, Windows, CI, non-root.

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
