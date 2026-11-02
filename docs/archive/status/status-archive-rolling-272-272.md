# Status file archive — rolling paragraphs, rounds 272-272

Moved out of `CHICLA_PROJECT_STATUS-279.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/status-archive-rolling-*.md`.

## Current version clauses

- round 272: C21.2, `docs/pinned-files-design.md` §8 says what an edit of a pinned file costs (five steps), `test/pinned-cost-docs.test.mjs` (4, 3 red first) holds the section and that the digest of `CLAUDE.md` has no other home, D138 and AUDIT-4 A-2 closed; docs and one test, the pin did not move

## Open decisions entries

- (round 272: **C21.2 done, M21 complete, D138 part 2 (A-2) closed**; D144 and D-270a to D-270d stay CONFIRMED. **Next task: none named.** Claude's suggestion: C20.4 when Rodrigo has half an hour for `npm run mutants` on his machine (or «depois»); after that the process asks for an audit at the end of the milestone (AUDIT-8), only if he asks. If he only says «avança», Claude asks which. Nothing else is open on A-1 or A-2. **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-276.md` (and the older ones if not done).)
