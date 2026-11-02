# Status file archive — rolling paragraphs, rounds 264-266

Moved out of `CHICLA_PROJECT_STATUS-273.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/status-archive-rolling-*.md`.

## Current version clauses

- round 266: C20.1, `scripts/bump-round.mjs` refuses an unknown option, a stray word, `--note` with no text and `--verify` with another mode (exit 2, nothing changes), `--help` exits 0; `test/bump-round-options.test.mjs` (4, 2 red first), a smoke case, `K-BMP-14` to `-17` red; two source files (the core `parseBumpArgs` and the thin wrapper), the pin did not move
- round 265: AUDIT-7 after M19 (D143, M20), docs and one test (`test/audit7-docs.test.mjs`), no source, the pin did not move
- round 264: C19.7, the 12 survivors of the `verify-delivery` slice closed by `core-verify-delivery-gaps.test.mjs` (12 tests, 11 mutants red, `K-VER-25` explained as equivalent), tests and data only, the pin did not move

## Open decisions entries

- (round 266: **D143 and D-265a to D-265e CONFIRMED** (Rodrigo, «aceito tudo. avança»); C20.1 done. **Next task: C20.2** (the limit tests stop assuming the live counts, tests only). Claude's suggestion: C20.2, then C20.3, C20.4 (Rodrigo's run, or «depois»), C20.5; if he only says «avança», Claude does C20.2. A-2 stays «depois». **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-270.md` (and the older ones if not done); C20.4 when he has half an hour for `npm run mutants`.)
- (round 265: **D143 PROPOSED** (AUDIT-7, Rodrigo said «avança para o próximo audit» to the audit only) with five cards: **D-265a** C20.1 `scripts/bump-round.mjs` refuses an option it does not know (one source file; the only finding that can burn a status number); **D-265b** C20.2 the limit tests stop assuming the live counts (tests only); **D-265c** C20.3 the kit list's figures and prefixes held by a test and the M19 rows of the ROADMAP corrected (docs and one test); **D-265d** C20.4 the zip list run whole by Rodrigo on his machine (a run, no code), or «depois»; **D-265e** C20.5 a test for the outer `catch` of `makeDelivery` (tests, at most one source file). Claude's suggestion: yes to all five, in that order, C20.1 next; if Rodrigo only says «avança», Claude does C20.1. A-2 stays «depois». **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-269.md` (and the older ones if not done).)
- (round 264: **D-263a CONFIRMED** (Rodrigo, 2026-10-27: «avança»); C19.7 done, M19 complete. **Next task: none named.** Claude's suggestion: an audit (AUDIT-7) after M19, as the process asks after each milestone, or the `mutants:kit` whole run on his machine; he picks. A-2 stays «depois». **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-268.md` (and the older ones if not done).)
