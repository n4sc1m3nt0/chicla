# Status file archive — «Done» lines of the Snapshot, rounds 249-249

Moved out of `CHICLA_PROJECT_STATUS-263.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 249 (2026-10-26; Rodrigo: «sim a todas»). C18.1 (D-248a, AUDIT-5 F-1 and F-5): `archive-changelog.mjs --status --keep-previous 4`, `--snapshot --keep-done 9` and `--keep 19` run for real after dry runs (blocks 235 to 243 to `docs/status-archive-previous-235-243.md`, lines 229 to 238 to `docs/status-archive-done-229-238.md`, rounds 220 to 230 to `CHANGELOG-archive-rounds-220-230.md`); status file 63 936 to 56 284 bytes, CHANGELOG 45 919 to 30 788; nothing lost (checked byte for byte apart from the scripts); item 20 says 213 s for 1472 tests and 477 s for 1530; `test/audit5-archive.test.mjs` (4, 3 red first). No source, the pin did not move. Not run by Claude: the CI, Node 18/20, `npm run smoke`, mutants (package list), macOS, Windows.
