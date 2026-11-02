# Status file archive — «Previous» blocks of rounds 280-280

Moved out of `CHICLA_PROJECT_STATUS-290.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/status-archive-previous-*.md`.

**Previous (round 280):** 2026-10-29. Rodrigo said «avança» (D-B, D-C, D-D confirmed); Claude did C23.2: `scripts/build-chicla.mjs`, the metadata of `chicla` 0.2.0, the README, the `EINCOMPLETE` guard in `pack-release`, the CI job; 9 tests (all red first) include installing ONLY the packed tarball offline and running `chicla`, `chicla-zip`, `chicla/zip` and `chicla dump`. Replaces the thin package of round 278 (its test and `bin/chicla.mjs` are gone). Next: C23.3.

