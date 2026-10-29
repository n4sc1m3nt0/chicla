# Status file archive — «Previous» blocks of rounds 274-274

Moved out of `CHICLA_PROJECT_STATUS-284.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/status-archive-previous-*.md`.

**Previous (round 274):** 2026-10-28. Rodrigo said «avança» and C20.7 is done (D145, D-272a): `scripts/mutants.mjs` copies `packages/chicla-zip` to the same relative place below its private folder and gives that folder `docs/`, so the four docs tests find `docs/zip-handling.md` and `npm run mutants` passes its baseline with no `TMPDIR` trick, held by `test/mutants-docs-layout.test.mjs` (2, 1 red first, with an empty `TMPDIR`). One script and one test, the pin did not move; M20 is complete and next: none named.

