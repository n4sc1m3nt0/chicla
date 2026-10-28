# Status file archive — rolling paragraphs, rounds 260-263

Moved out of `CHICLA_PROJECT_STATUS-271.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/status-archive-rolling-*.md`.

## Current version clauses

- round 263: C19.5 slice 2, 26 kit mutants for `verify-delivery.mjs` (`K-VER-01` to `-26`), 14 red, 12 real survivors named for C19.7 and marked `survives`, data and tests, the pin did not move
- round 262: C19.6, the four survivors of the `check-manifest` slice closed by `core-check-manifest-gaps.test.mjs` (4 tests), `K-CMN-14`, `-15`, `-18`, `-20` red, tests and data only, the pin did not move
- round 261: C19.5 slice 1, 20 kit mutants for `check-manifest.mjs` (`K-CMN-01` to `-20`), 15 red, 1 explained, 4 real survivors named for C19.6, data and tests, the pin did not move
- round 260: C19.4, `npm run mutants:kit` documented where a newcomer looks, docs and one test, the pin did not move

## Open decisions entries

- (round 263: **D-263a PROPOSED**: C19.7 closes the 12 survivors of `verify-delivery.mjs` (`K-VER-02`, `-04`, `-05`, `-06`, `-11` to `-14`, `-20`, `-21`, `-24`, `-25`) with tests, builds the zips by hand as `verify-nounzip.test.mjs` does, then removes their `survives` (tests only, size M; it may split into two rounds, the zip-reading rules first, if the 3-file limit or the time asks). Claude's suggestion: yes, C19.7 next; it closes M19. If Rodrigo only says «avança», Claude does C19.7. D-261a and D-261b stay CONFIRMED; A-2 stays «depois». **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-267.md` (and the older ones if not done).)
- (round 262: **D-261a and D-261b CONFIRMED** (Rodrigo, 2026-10-27: «sim a tudo»). **Next task: the `verify-delivery` slice of C19.5** (`K-VER-`, about 15 entries, survivors named; data and tests, size M). Claude's suggestion: do it next; the card C19.5 ends there. A-2 stays «depois». **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-265.md` (and the older ones if not done).)
- (round 261: **D-261a and D-261b PROPOSED**: **D-261a** C19.6 closes the four survivors of `check-manifest.mjs` (`K-CMN-14`, `-15`, `-18`, `-20`) with tests, then removes their `survives` (tests only, size S); **D-261b** the last slice of C19.5, `verify-delivery.mjs`, comes after it, as its own round. Claude's suggestion: yes to both, C19.6 next. D142 and D-256a to D-256e stay CONFIRMED. **Next task: C19.6** once Rodrigo answers; if he only says «avança», Claude does C19.6. A-2 stays «depois». **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-264.md` (and the older ones if not done).)
- (round 260: none open; D142 and D-256a to D-256e stay CONFIRMED. **Next task: C19.5** (slices of the kit list for `archive-changelog` (done in C19.1 and `bump-round` (C19.2): remaining `check-manifest` and `verify-delivery`), one slice per round, survivors named; data and tests, size M). Claude's suggestion: `check-manifest.mjs` first, then `verify-delivery.mjs`, each its own round. A-2 stays «depois». **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-263.md` (and the older ones if not done).)
