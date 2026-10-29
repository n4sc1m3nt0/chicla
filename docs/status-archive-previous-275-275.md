# Status file archive — «Previous» blocks of rounds 275-275

Moved out of `CHICLA_PROJECT_STATUS-285.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/status-archive-previous-*.md`.

**Previous (round 275):** 2026-10-28. Rodrigo sent the CI of the round 274 tree: 11 of 12 jobs green and `test (ubuntu-latest, 18)` red once on test 1319 (`ENOENT … copyfile '/tmp/chicla-EMERGENCY-…tar.gz'`), green on his re-run; Claude found the cause (two dumps in the same second shared one name in `tmpdir()` and removed each other's archive; `node --test` runs files in parallel), reproduced it 3 of 3 with `test/emergency-dump-concurrent.test.mjs` and fixed it in `packages/chicla-kit/src/emergency-dump.mjs` (the archive lives in the run's own `mkdtemp` stage). One kit source and one test, the pin did not move; next: none named.

