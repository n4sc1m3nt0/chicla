# Status file archive — rolling paragraphs, rounds 269-269

Moved out of `CHICLA_PROJECT_STATUS-276.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/status-archive-rolling-*.md`.

## Current version clauses

- round 269: C20.5, `packages/chicla-kit/test/core-make-delivery-catch.test.mjs` (3) reaches the outer `catch` of `makeDelivery` with an `allowRemoved` that is not a list (a core throws after the zip is written) and holds `EDELIVERY_ERROR`, no zip left and no throw; `K-DEL-04` and `-05` red; tests and data only, no source, the pin did not move

## Open decisions entries

- (round 269: **D-265e done**; D143 and D-265a to D-265d stay CONFIRMED; M20 has only C20.4 left. **Next task: none named.** Claude's suggestion: C20.4 when Rodrigo has half an hour for `npm run mutants` on his machine (or «depois»); otherwise a new audit only after the next milestone. If he only says «avança», Claude asks which. A-2 stays «depois». **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-273.md` (and the older ones if not done).)
