# Status file archive — «Done» lines of the Snapshot, rounds 318-318

Moved out of `CHICLA_PROJECT_STATUS-332.md` verbatim by `chicla archive --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/archive/status/status-archive-done-*.md`.

- Done: round 318 (2026-11-06; Rodrigo: «não queres corrigir os erros todos antes de fazer push?»; D-317b confirmed). C29.2 (M29; AUDIT-11 F-2): `test/gitignore-builds.test.mjs` first (4: two red; the third guards that no path of `FILES.manifest` is hidden, the first controls its own small matcher, which had to be rewritten once). `.gitignore`: `/dist2/ /dist3/ /distci/ /distkit/ /dist-*/ /ci/ /notes.md /notes-*.md *.tgz.sha256 __MACOSX/`, anchored to the root so nothing else is hidden; the two last were found by Rodrigo's own cleanup (25 tracked files). Measured: 4 tests pass; six hand mutants (a line dropped, `docs/` hidden, a too broad `test`) all killed. The whole `npm test` after `bump-round`: 1911 tests, 1909 pass, 0 fail, 2 skipped, 695 s. No source file; the pin did not move. The round archived «Previous» 312, «Done» 308 and rolling 315. NOT run: the CI.
