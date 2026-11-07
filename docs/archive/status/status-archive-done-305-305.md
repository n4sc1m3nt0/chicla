# Status file archive — «Done» lines of the Snapshot, rounds 305-305

Moved out of `CHICLA_PROJECT_STATUS-319.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/archive/status/status-archive-done-*.md`.

- Done: round 305 (2026-11-02; the person in this session: «confirmo tudo» to D-305a to D-305d; ROADMAP D152). C27.1 (M27): the archives of the CHANGELOG moved from the root to `docs/archive/changelog/` (names kept): `scripts/archive-changelog.mjs` writes there and creates the folder only for real, the index line of the live CHANGELOG and the archive header name the path, the two smoke scripts follow; `test/archive-options.test.mjs` (4 new, 3 red first), `archive-status` and `audit5-archive` look in the new folder. Old archives and `docs/status-archive-*` keep their words. No pinned file. NOT run: the CI, macOS, Node 18 and 20. Rodrigo does the `git mv` of the 7 files.
