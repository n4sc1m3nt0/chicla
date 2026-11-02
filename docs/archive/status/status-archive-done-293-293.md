# Status file archive — «Done» lines of the Snapshot, rounds 293-293

Moved out of `CHICLA_PROJECT_STATUS-307.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 293 (2026-10-31; Rodrigo: «avança»). C25.2 (D150, M25, AUDIT-9 F-2, F-3, F-6, F-7; D-290a and D-290b): README «Emergency» says the digest pin is this repository's and a project made by `chicla init` has none; the generated `CLAUDE.md` says `package.json` only marks the project root and `APP_VERSION` is the app version; `docs/release.md` 0.2.1 step 3 compares the sha256 too; the M24 heading says confirmed and done. `test/audit9-docs-c252.test.mjs` (4, red first). Docs only, no source, the pin did not move. Not run: the CI, Windows, Node 18 and 20, macOS, `npm run smoke`, the mutant lists.
