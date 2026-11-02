# Status file archive — «Done» lines of the Snapshot, rounds 294-294

Moved out of `CHICLA_PROJECT_STATUS-308.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 294 (2026-10-31; Rodrigo: «avança»). C25.3 (D150, M25, AUDIT-9 F-9): eight entries in `packages/chicla-kit/mutants/list.mjs` (K-PKG-01 to 06 and K-LDR-01, 02: the pinned copy in `build-chicla`, the dump's toolchain lookup, `init` private and version, `pack-release` shell, the Windows quoting, the loader); each alone RED with `mutants:kit --only`; `test/mutants-kit-m25.test.mjs` (2, red first); the shape test allows three more script files. No source edited, the pin did not move. Not run: the CI, Windows, Node 18 and 20, macOS, `npm run smoke`, the zip list.
