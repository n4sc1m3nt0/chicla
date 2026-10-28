# Status file archive — «Done» lines of the Snapshot, rounds 255-255

Moved out of `CHICLA_PROJECT_STATUS-269.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 255 (2026-10-27; Rodrigo: «avança»). C18.7: `emergency-fallback.test.mjs` (8) sees `EDUMP_FAILED` through the core (`K-DMP-06` red); `panel.test.mjs` (17) for an unknown key (line 123) and for `r` (`K-PNL-02` found a gap, closed); kit list `K-PNL-01`, `-02` red. Tests only, the pin did not move; M18 is complete. Not run by Claude: the CI, Node 18/20, the whole kit list in one pass, the 348 mutants of the zip list, macOS, Windows.
