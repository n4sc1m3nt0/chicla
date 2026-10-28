# Status file archive — «Done» lines of the Snapshot, rounds 254-254

Moved out of `CHICLA_PROJECT_STATUS-268.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 254 (2026-10-26; Rodrigo: «confirmo a decisão em aberto. avança»). C18.6 (D-253a): `makeDelivery` with `out` = an existing folder threw `ERR_FS_EISDIR` (stack trace in the CLI); now it is refused before any step and returned as `EDELIVERY_ERROR`, and the catch never calls `rmSync` on a folder; `packages/chicla-kit/test/core-make-delivery-outdir.test.mjs` (3, 2 red first); kit list `K-DEL-01` to `-03` (2 red, 1 equivalent explained). One source file, the pin did not move. Not run by Claude: the CI, Node 18/20, the 348 mutants of the zip list, macOS, Windows.
