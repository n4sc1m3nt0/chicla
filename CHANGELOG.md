<!-- CHANGELOG_FINGERPRINT: seq=12 file=CAIRN_PROJECT_STATUS-12.md app_sha256_12=065d37032ef1 changelog_sha256_12=c71dacc368b4 (bump-round.mjs: app hash unchanged, changelog hash recomputed) -->
# Changelog

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
