# Status file archive — «Done» lines of the Snapshot, rounds 291-291

Moved out of `CHICLA_PROJECT_STATUS-305.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 291 (2026-10-30; Rodrigo: «faz a próxima auditoria», then «confirmo tudo»). The `audit` after M24 (`docs/audits/AUDIT-9.md`, D150, M25): the whole `npm test` 1745 tests, 1743 pass, 0 fail, 2 skipped, 744 s; the tarball of the tree byte-identical to the CI one (`fd85ea57…cd0e8`, 134509 bytes, 30 files); `smoke-test-tarball` 9 of 9; five hand mutants all killed; ten findings (the smoke script does not quote its arguments on Windows, two versions in a generated project, a README pin promise, no mutant in the lists for M24 code, smaller ones); plan C25.1 (quote the smoke script on Windows), C25.2 (docs), C25.3 (mutants into the kit list); D-290a and D-290b confirmed. `test/audit9-docs.test.mjs` (7, 4 red first). Docs only, no source, the pin did not move. Not run: the CI, Windows, Node 18 and 20, macOS, `npm run smoke`, the mutant lists.
