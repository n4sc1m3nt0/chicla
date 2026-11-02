# Status file archive — «Done» lines of the Snapshot, rounds 253-253

Moved out of `CHICLA_PROJECT_STATUS-267.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 253 (2026-10-26; Rodrigo: «avança»). C18.4 (D-248d, AUDIT-5 F-4): the whole `npm test` run with coverage (figures in AUDIT-5 F-4); the lines of `emergency-dump.mjs` and `recovery-report.mjs` that the report misses (clean `env` in their tests) proven reached by 12 hand mutants (`K-DMP-*`, `K-REC-*`), 3 new tests in `emergency-fallback.test.mjs` for fallback gaps (`.env.example`, `--project-only`, stale hashes), `test/manifest-crc-fallback.test.mjs` (2) for the JS crc32 with 2 mutants; `K-DMP-06` explained. Found a real defect, `make-delivery` throws when `out` is a folder (C18.6), and a test gap (C18.7). Tests only, the pin did not move. Not run by Claude: the CI, Node 18/20, the 348 mutants of the zip list, macOS, Windows.
