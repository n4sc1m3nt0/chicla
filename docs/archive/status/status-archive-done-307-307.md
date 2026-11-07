# Status file archive — «Done» lines of the Snapshot, rounds 307-307

Moved out of `CHICLA_PROJECT_STATUS-321.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/archive/status/status-archive-done-*.md`.

- Done: round 307 (2026-11-02; Rodrigo: «confirmo, avança»; D153 confirmed, D154 Claude's label). C27.3 (M27): `chicla ci-report <logs.zip>`. New core `packages/chicla-kit/src/ci-report.mjs` and the command in `cli.mjs`: the zip of a GitHub run is read in memory with the kit's zip reader (never extracted; a log over 64 MiB is `unreadable`, a warning), and per job it gives the `not ok` tests, the counts added over the suites, the first error; exit 0 / 1 (`ECIREPORT_FAILED`, `ECIREPORT_ZIP`, `ECIREPORT_EMPTY`) / 2; `--json`. `ci-report.test.mjs` (11; red with the module missing); kit mutants K-CIR-01 to 05 (new prefix; K-CIR-02 survived first, the test was strengthened); READMEs. Two sources, the pin did not move. NOT run: the CI, macOS, Windows, Node 18 and 20, `npm run smoke`, the whole `mutants:kit`; NOT tried on a real logs zip.
