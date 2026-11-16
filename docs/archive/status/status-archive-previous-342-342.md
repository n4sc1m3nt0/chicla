# Status file archive — «Previous» blocks of rounds 342-342

Moved out of `CHICLA_PROJECT_STATUS-352.md` verbatim by `chicla archive --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/archive/status/status-archive-previous-*.md`.

**Previous (round 342):** 2026-11-15. Rodrigo sent the CI logs of commit `257af74`: every test job passes its 2045 tests, and the only red is the step `npm run smoke`: `scripts/smoke-test-archive-changelog.mjs` still expected the old «Open decisions» pointer (`rolling-6-7.md`) while the code and its tests use the glob `rolling-*.md` since C30.6 (D-P); the smoke is fixed (one line) and the whole `npm run smoke` passes. **`npm run smoke` had not been run since round 336: that was Claude's gap.** **Rodrigo's part, now:** push and say whether the CI is green; **G-C11 and G-C8 are open and are his.**

