# Status file archive — «Previous» blocks of rounds 267-267

Moved out of `CHICLA_PROJECT_STATUS-277.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/status-archive-previous-*.md`.

**Previous (round 267):** 2026-10-28. Rodrigo said «avança» and C20.2 is done (D-265b, AUDIT-7 F-3): the limit tests of `bump-round` no longer assume that the live status file holds exactly 5 «Previous» blocks, and `test/limits-archived-copy.test.mjs` archives a copy of the tree to the depth of item 6 and runs them there (3 red before the fix, green after). Tests only, no source, the pin did not move; next: C20.3.

