# Status file archive — rolling paragraphs, rounds 273-273

Moved out of `CHICLA_PROJECT_STATUS-280.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/status-archive-rolling-*.md`.

## Open decisions entries

- (round 273: **D-272a and D-272b CONFIRMED** (Rodrigo, 2026-10-28: «sim a tudo»); C20.4 is done by Rodrigo (see G-C14) and C20.6 is done. **Next task: C20.7** (`scripts/mutants.mjs` makes the `docs/` that four tests read available in its copy, so `npm run mutants` needs no `TMPDIR`; test first; one script and one test). Claude's suggestion: C20.7 now; if Rodrigo only says «avança», Claude does C20.7. After that an audit (AUDIT-8) only if he asks; G-C14 is Rodrigo's to mark again, G-C8 stays open. **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-277.md` (and the older ones if not done).)
