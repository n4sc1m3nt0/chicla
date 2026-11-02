# Status file archive — «Done» lines of the Snapshot, rounds 258-258

Moved out of `CHICLA_PROJECT_STATUS-272.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 258 (2026-10-27; Rodrigo: «avança»). C19.2 (D-256b, AUDIT-6 F-1): `packages/chicla-kit/src/bump-round.mjs` reports the archive limits it sees: the bump and `--refresh` (dry or not) print one `  ! …` line per limit passed (more than 5 «Previous» blocks, 10 «Done» lines, 21 `## Round` headings, 4096 bytes in the «Current version» or «Open decisions» line) naming the command and the `--refresh` after it; the result carries `limits`; never run, never part of `ok`, `--verify` prints none; `packages/chicla-kit/test/core-bump-round-limits.test.mjs` (8, 7 red first), kit list `K-BMP-01` to `-13` red. One source file, the pin did not move. Not run by Claude: the CI, Node 18/20, the 348 mutants of the zip list, macOS, Windows.
