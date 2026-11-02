# Status file archive — «Done» lines of the Snapshot, rounds 296-296

Moved out of `CHICLA_PROJECT_STATUS-310.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 296 (2026-10-31; Rodrigo: «avança», after the CI logs of round 295: 1770 tests 0 fail on Ubuntu and macOS, Windows `chicla-zip` 777 of 816 and `chicla-kit` 341, `tarball` 9 of 9 on Ubuntu and macOS, Windows `EINSTALL … proj\\node_modules\\npm\\bin\\npm-prefix.js`). C25.5 (D150, M25): `scripts/win-quote.mjs` `winLine` leaves a bare command name (`npm`) bare, quotes a command with a path or a space and every argument (the quoted `"npm"` of C25.1 probably left `%~dp0` at the current folder: INFERRED from the path, not confirmed on Windows); `smoke-test-tarball.mjs` stops with `EINIT` if `npm init` fails; `K-PKG-08`; `test/win-quote-bare-command.test.mjs` (5, 3 red first). Two scripts, no pinned file, the pin did not move. Not run: Windows, the whole kit list, `npm run smoke`.
