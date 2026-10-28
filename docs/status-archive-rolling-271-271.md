# Status file archive — rolling paragraphs, rounds 271-271

Moved out of `CHICLA_PROJECT_STATUS-278.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/status-archive-rolling-*.md`.

## Current version clauses

- round 271: C21.1, `test/pinned-edit-follow-ups.test.mjs` (6, 4 red first) edits each of the five pinned files by one comment line on a copy, refreshes the pin and runs the tests that read them, and the four `pinned-*-move` tests no longer freeze bytes; tests only, the pin did not move

## Open decisions entries

- (round 271: **D144 and D-270a to D-270d CONFIRMED** (Rodrigo, 2026-10-28: «sim a tudo»); C21.1 done. **Next task: C21.2** (the cost written once in `docs/pinned-files-design.md`, the digest held to one home, D138 and AUDIT-4 A-2 closed; docs and one test). Claude's suggestion: C21.2 now; if Rodrigo only says «avança», Claude does C21.2. C20.4 stays his (`npm run mutants`, or «depois»). **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-275.md` (and the older ones if not done).)
