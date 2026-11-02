# Status file archive — «Done» lines of the Snapshot, rounds 292-292

Moved out of `CHICLA_PROJECT_STATUS-306.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 292 (2026-10-30; Rodrigo: «avança»). C25.1 (D150, M25, AUDIT-9 F-1 and F-5): `smoke-test-tarball.mjs` on Windows built npm and `.bin\\*.cmd` calls as an argument array with `shell: true`, which Node does not quote, so a folder with a space split the paths (read, not run on Windows); now `scripts/win-quote.mjs` (`quoteWin`, `winLine`, pure; refuses a double quote or a line break) builds ONE quoted command line, other systems unchanged. `test/smoke-tarball-win-quote.test.mjs` (6, red first); one existing test copies the new module into its fake tree; two scripts, no pinned file, the pin did not move. Not run: Windows, Node 18 and 20, macOS, the CI, `npm run smoke`, the mutant lists.
