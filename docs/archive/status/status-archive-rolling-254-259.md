# Status file archive — rolling paragraphs, rounds 254-259

Moved out of `CHICLA_PROJECT_STATUS-266.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/status-archive-rolling-*.md`.

## Current version clauses

- round 259: C19.3, root tests look for names in the status file and its archives through one helper, tests only, the pin did not move
- round 258: C19.2, `bump-round` reports the archive limits it sees and never runs the archiving, one source file, the pin did not move
- round 257: C19.1, `archive-changelog.mjs` exits 2 on an argument it does not know, one source file, the pin did not move
- round 256: AUDIT-6, `docs/audits/AUDIT-6.md`, D142 and milestone M19 proposed, docs and one test, no source, the pin did not move
- round 255: C18.7, a core test for `EDUMP_FAILED` and two panel tests, tests only, M18 complete, the pin did not move
- round 254: C18.6, `make-delivery.mjs` returns `EDELIVERY_ERROR` for a folder as `out` instead of throwing, one source file, the pin did not move

## Open decisions entries

- (round 259: none open; D142 and D-256a to D-256e stay CONFIRMED. **Next task: C19.4** (`npm run mutants:kit` named in `README.md`, `CONTRIBUTING.md`, `docs/README.md` and item 20 (c) of the status file, held by a test; docs and one test), then C19.5. Claude's suggestion: C19.4 next. A-2 stays «depois». **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-262.md` (and the older ones if not done).)
- (round 258: none open; D142 and D-256a to D-256e stay CONFIRMED. **Next task: C19.3** (a test helper that returns the newest status file plus its verbatim archives; `audit4-docs`, `audit5-docs`, `plan-a1-docs` use it; tests only), then C19.4 and C19.5. Claude's suggestion: C19.3 next. A-2 stays «depois». **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-261.md` (and the older ones if not done).)
- (round 257: none open; D142 and D-256a to D-256e CONFIRMED (Rodrigo, 2026-10-27: «d142 sim»). One call made on delegation: `--help` exits 0, not 2 as the card said (nothing is archived either way); Claude suggests keeping it. **Next task: C19.2** (`bump-round` reports the archive limits it sees; one source file, the pin does not move), then C19.3 to C19.5. A-2 stays «depois». **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-260.md` (and the older ones if not done).)
- (round 256: **D142 PROPOSED**, five cards of M19 (AUDIT-6): **D-256a** C19.1 `archive-changelog.mjs` refuses an unknown option (one source file); **D-256b** C19.2 `bump-round` reports the archive limits it sees (one source file); **D-256c** C19.3 tests stop reading text the archives move (tests only); **D-256d** C19.4 document `npm run mutants:kit` (docs and one test); **D-256e** C19.5 more slices of the kit list (data and tests). Claude's suggestion: yes to all five, in that order, C19.1 next. **No next task is scheduled until Rodrigo answers.** A-2 stays «depois». **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-259.md` (and the older ones if not done).)
- (round 255: **D-255a PROPOSED**: M18 is complete; run the `audit` after it (item 2: `docs/audits/AUDIT-6.md`, promised vs. what exists), or stop and go back to `next` of the product (C18.x are all done). Claude's suggestion: the audit, one round, docs and one test, and in it one whole pass of `npm run mutants:kit` (60 entries, about 15 minutes, detached). A-2 stays «depois». **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-258.md` (and the older ones if not done).)
- (round 254: none open; D-253a CONFIRMED (Rodrigo, 2026-10-26: «confirmo a decisão em aberto»). **Next task: C18.7** (a core test for `EDUMP_FAILED` with an empty PATH and a broken writer, and `panel.mjs` line 123; tests only), the last card of M18. A-2 stays «depois». **Rodrigo's to do:** push and read the CI; `git rm -- CHICLA_PROJECT_STATUS-257.md` (and the older ones if not done).)
