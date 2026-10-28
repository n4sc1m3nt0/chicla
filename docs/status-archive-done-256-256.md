# Status file archive — «Done» lines of the Snapshot, rounds 256-256

Moved out of `CHICLA_PROJECT_STATUS-270.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 256 (2026-10-27; Rodrigo: «d-255a sim. avança»). AUDIT-6 (D142): `docs/audits/AUDIT-6.md` after M18, six measured findings (F-1 archive limits by hand; F-2 `archive-changelog.mjs --help` archives for real; F-3 tests that read text the archives move; F-4 `mutants:kit` undocumented; F-5 the kit list covers six files, none of four tools; F-6 a paragraph past 4 KB), no security finding; ROADMAP D142 and milestone M19 (C19.1 to C19.5, proposed); the whole `npm run mutants:kit` once: 60 mutants, 58 red, 2 explained, none survived, 210 s of runs; `test/audit6-docs.test.mjs` (7, 2 red first). Housekeeping of item 6 run (`--rolling`, `--status`, `--snapshot`). Docs and one test, no source, the pin did not move, nothing fixed. Not run by Claude: the CI, Node 18/20, `npm run smoke`, the 348 mutants of the zip list, macOS, Windows, a new coverage run.
