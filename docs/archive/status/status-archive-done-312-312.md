# Status file archive — «Done» lines of the Snapshot, rounds 312-312

Moved out of `CHICLA_PROJECT_STATUS-326.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/archive/status/status-archive-done-*.md`.

- Done: round 312 (2026-11-02; Rodrigo: «confirmo tudo. guarda o audit no sítio certo e avança»; D158 CONFIRMED, D-310a to D-310c as suggested). C28.1 (M28; AUDIT-10 F-4, F-5): `test/tidy-c281.test.mjs` first (2, both red): the only script in the root is `version.mjs`, and no test or script names the old folder of the status archives. `t.mjs` removed with `--allow-removed t.mjs` (D-310a); five lines (four comments and one test title in `plan-a2-docs`, `init-package-json-docs`, `dump-limit-docs`, `plan-a1-docs`, `docs-accuracy`) now say `docs/archive/status/`. AUDIT-10 §5 says CONFIRMED. The whole `npm test` on this tree after `bump-round`: 1879 tests, 1877 pass, 0 fail, 2 skipped, 674 s. No source file; the pin did not move. The round archived «Previous» 306, «Done» 302 and rolling 309. NOT run: the CI, macOS, Windows, Node 18 and 20, the whole `mutants`.
