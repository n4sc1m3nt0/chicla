# Status file archive — «Done» lines of the Snapshot, rounds 269-269

Moved out of `CHICLA_PROJECT_STATUS-283.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 269 (2026-10-28; Rodrigo: «avança»). C20.5 (D-265e, AUDIT-7 F-6): `packages/chicla-kit/test/core-make-delivery-catch.test.mjs` (3, green on the code): `makeDelivery` with an `allowRemoved` that is a number or a plain object (so `verifyDelivery` throws after the zip was written) does not reject, returns `EDELIVERY_ERROR` with `step` and `cause` null, leaves no zip at `out`, prints no stack, and the same project delivers afterwards; the other broken roots tried (a folder in place of the manifest, the CHANGELOG, the baseline or the status file, a missing root, a bad `against`) are answered by the cores as `EDELIVERY_STEP`, so only this one reaches the catch; `K-DEL-04` and `K-DEL-05` added to the kit list, each run alone: red. No source file, the pin did not move. Not run by Claude: the CI, Node 18 and 20, `npm run smoke`, the whole `npm run mutants:kit`, the 348 mutants of the zip list, macOS, Windows.
