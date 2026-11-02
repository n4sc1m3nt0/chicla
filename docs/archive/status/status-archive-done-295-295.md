# Status file archive — «Done» lines of the Snapshot, rounds 295-295

Moved out of `CHICLA_PROJECT_STATUS-309.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 295 (2026-10-31; Rodrigo: «avança», after sending the CI logs of round 294: 1764 tests 0 fail on Ubuntu and macOS, Node 18, 20, 22; Windows `chicla-zip` 777 of 816, `chicla-kit` 341; `pack-chicla` `chicla-0.2.1.tgz` 134680 bytes, sha256 `554cbbc7…abf6`, byte-identical to a rebuild of the delivered tree; `tarball` 9 of 9 on Ubuntu and macOS; Windows: build and pack pass, `EINSTALL` shows `node:internal/modules/cjs/loader:1433`). C25.4 (D150, M25): `scripts/failure-reason.mjs` (pure: the line with `Error:`, an `ERR_` code, `MODULE_NOT_FOUND`, «Cannot find module» or `npm error`, else the first five lines, one line, 400 characters) used by `smoke-test-tarball.mjs` for the install and every step; `K-PKG-07` in the kit list, RED alone; `test/smoke-failure-reason.test.mjs` (6, red first). Two scripts, no pinned file, the pin did not move. Not run: Windows, the whole kit list, `npm run smoke`.
