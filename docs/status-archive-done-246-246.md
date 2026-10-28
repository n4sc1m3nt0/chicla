# Status file archive — «Done» lines of the Snapshot, rounds 246-246

Moved out of `CHICLA_PROJECT_STATUS-260.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 246 (2026-10-26; Rodrigo: «sim» to D-245a). `check-manifest` (the walk) and `verify-delivery` (`JUNK`) treat every `*.tsbuildinfo` as junk, as `isJunkName` does; `KNOWN_DIFF` of `name-rules-differential.test.mjs` is empty (2 tests red first). Two source files, the pin did not move. Not run by Claude: the CI, Node 18/20, mutants (package list), macOS, Windows.
