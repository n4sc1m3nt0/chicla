# Status file archive — «Done» lines of the Snapshot, rounds 257-257

Moved out of `CHICLA_PROJECT_STATUS-271.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 257 (2026-10-27; Rodrigo: «d142 sim. avança»). C19.1 (D-256a, AUDIT-6 F-2): `scripts/archive-changelog.mjs` checks its arguments first: an unknown option or a stray word exits 2 with a usage text and changes nothing, `--help`/`-h` print it and exit 0 (the card said 2), the valued options take their word; `test/archive-options.test.mjs` (5, 2 red first), a smoke case, kit list `K-ARC-01` to `-07` red. One source file, the pin did not move. Not run by Claude: the CI, Node 18/20, the 348 mutants of the zip list, macOS, Windows.
