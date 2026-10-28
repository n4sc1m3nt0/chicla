# Status file archive — «Done» lines of the Snapshot, rounds 259-259

Moved out of `CHICLA_PROJECT_STATUS-273.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 259 (2026-10-27; Rodrigo: «avança»). C19.3 (D-256c, AUDIT-6 F-3): `test/status-text.mjs` (`statusName`, `statusText`, `statusArchives`, `statusWithArchives`); `audit4-docs`, `audit5-docs`, `audit6-docs`, `plan-a1-docs` look for card, audit and decision names in the file plus its archives (the Next up block of the plan test stays on the live file); `test/status-reads.test.mjs` (4, 2 red first) holds the helper and a grep over `test/`: a root test that selects the status file itself imports the helper or is in a table with a reason (nine are). Checked on a copy archived to the limit (`--status --keep-previous 1`, `--snapshot --keep-done 2`, `--rolling --keep-clauses 1`): the tests stay green. Tests only, the pin did not move. Not run by Claude: the CI, Node 18/20, `npm run smoke`, the 348 mutants of the zip list, macOS, Windows.
