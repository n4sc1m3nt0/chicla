# Changelog archive — rounds 334-334

Moved out of `CHANGELOG.md` verbatim by `chicla archive`. Nothing was edited or deleted;
this file has no fingerprint and is not part of the fingerprint triple. Find an entry with
`grep -n "^## Round 12" docs/archive/changelog/CHANGELOG-archive-*.md`.

## Round 334 — C30.6: one glob pointer to the rolling archives in «Open decisions» (v0.0.338)

- Task (Rodrigo: «ok»; none of his decisions open = the task under «Next up»): C30.6, D-P, D162. One source line in `packages/chicla-kit/src/archive-changelog.mjs` and the tests.
- Change: `chicla archive --rolling` leaves ONE pointer in «Open decisions», `(earlier rounds: archived verbatim, nothing deleted: `docs/archive/status/status-archive-rolling-*.md`)`, however many archives there are; an old pointer that lists every file is replaced by it (the files stay, nothing is deleted). Run on this project's status file (keep 2): «Open decisions» no longer lists 56 files, 54267 → 50757 bytes, the clause of round 331 moved to `status-archive-rolling-331-331.md`. «Current version» keeps its own pointer (D-P names only «Open decisions»).
- Tests: `test/archive-rolling.test.mjs`: the three tests that read the pointer expect the glob (red first), and one new test (the old list form is replaced, and the line is the same after a second batch): 3 red before the line. Mutant `K-ARC-52` (the list form back) RED.
- Rotation with `chicla archive`: «Previous» 328, «Done» 324, rolling 331.
- First whole run after `bump-round` (2003 tests, 1 fail, 704 s): `test/archive-rolling.test.mjs` «the real status file keeps both paragraphs short» still required every rolling archive to be named in the status file; it now requires the glob pointer and that each archive name fits the glob. Fixed.
- Whole `npm test` after that fix and after `bump-round`: 2003 tests, 2001 pass, 0 fail, 2 skipped, 709 s (Node 22, Linux, 1 core), read from the run's own summary. `check-build`: passed.
- NOT run: the kit mutants outside `K-ARC-52`; `npm run smoke` (no script changed); nothing on GitHub or npm; macOS and Windows runs; Node 18 and 20. The pointer of «Current version» was not changed.

