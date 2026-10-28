# Status file archive — «Previous» blocks of rounds 269-269

Moved out of `CHICLA_PROJECT_STATUS-279.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/status-archive-previous-*.md`.

**Previous (round 269):** 2026-10-28. Rodrigo said «avança» and C20.5 is done (D-265e, AUDIT-7 F-6): the outer `catch` of `makeDelivery` is now reached by a test (an `allowRemoved` that is not a list makes `verifyDelivery` throw after the zip is written) and `K-DEL-04` and `-05` go red; tests and data only, no source, the pin did not move. M20 has only C20.4 left (Rodrigo's run of `npm run mutants`, or «depois»).

