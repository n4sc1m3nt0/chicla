# Status file archive — «Done» lines of the Snapshot, rounds 241-241

Moved out of `CHICLA_PROJECT_STATUS-256.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 241 (2026-10-22; Rodrigo: «avança»). C16.7 (D139): `scripts/archive-changelog.mjs --snapshot [--keep-done N]` archives the older Snapshot lines verbatim to `docs/status-archive-done-<lo>-<hi>.md` (one «Archived» line left, last); run for real: this file 147 KB to 50 KB (228 lines, rounds 0 to 228, in `docs/status-archive-done-0-228.md`; the Snapshot rebuilds byte for byte), and 2 more «Previous» blocks to `docs/status-archive-previous-233b-234.md`. `test/archive-snapshot.test.mjs` (8), 16 hand mutants (14 red, 2 explained), docs tests +2. One source file, no pin. M16 is complete (C16.1 to C16.7). Not run by Claude: the CI, Node 18/20, the whole `npm run smoke`, mutants (package list), macOS, Windows.
