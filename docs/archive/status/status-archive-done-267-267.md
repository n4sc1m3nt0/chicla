# Status file archive — «Done» lines of the Snapshot, rounds 267-267

Moved out of `CHICLA_PROJECT_STATUS-281.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 267 (2026-10-28; Rodrigo: «avança»). C20.2 (D-265b, AUDIT-7 F-3): `packages/chicla-kit/test/core-bump-round-limits.test.mjs` computes the filler from the counts it reads (`addPrevious` pads to exactly 5 «Previous» blocks as `addDone` pads to 10 lines; `padLine` replaces the line instead of growing it, so a paragraph already over 4096 bytes cannot make `repeat` throw); `test/limits-archived-copy.test.mjs` (1, red first: 3 red in the copy) copies the tree, archives it with `--keep 3`, `--status --keep-previous 1`, `--snapshot --keep-done 2`, `--rolling --keep-clauses 1`, refreshes the fingerprints and runs the limits file there (the child runs without `NODE_TEST_CONTEXT`, else it exits 0 whatever it saw). Tests only, the pin did not move. Not run by Claude: the CI, Node 18 and 20, the 348 mutants of the zip list, macOS, Windows.
