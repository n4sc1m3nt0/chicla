# Status file archive — rolling paragraphs, rounds 267-267

Moved out of `CHICLA_PROJECT_STATUS-274.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/status-archive-rolling-*.md`.

## Current version clauses

- round 267: C20.2, `core-bump-round-limits.test.mjs` pads its «Previous» blocks to exactly 5 like its «Done» lines and replaces a paragraph line instead of growing it, and `test/limits-archived-copy.test.mjs` runs that file on a copy archived to the depth of item 6 (red first: 3 red); tests only, the pin did not move

## Open decisions entries

- (round 267: **D-265b done**; D143 and D-265a, -c, -d, -e stay CONFIRMED. **Next task: C20.3** (the kit list's figures and prefixes held by a test, the M19 rows of the ROADMAP corrected; docs and one test). Claude's suggestion: C20.3, then C20.5, and C20.4 when Rodrigo has half an hour for `npm run mutants`; if he only says «avança», Claude does C20.3. A-2 stays «depois». **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-271.md` (and the older ones if not done).)
