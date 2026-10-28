# Status file archive — «Done» lines of the Snapshot, rounds 260-260

Moved out of `CHICLA_PROJECT_STATUS-274.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 260 (2026-10-27; Rodrigo: «avança»). C19.4 (D-256d, AUDIT-6 F-4): `npm run mutants:kit` named with what it needs (`--pkg .`, the whole tree, detached) in `README.md`, `CONTRIBUTING.md` (when to run it and to add an entry) and item 20 (c) of this file; `docs/README.md` lists `packages/chicla-kit/mutants/list.mjs`; `test/mutants-kit-docs.test.mjs` (4, 3 red first; the kit README must not name it). Docs and one test, no source, the pin did not move. Not run by Claude: the CI, Node 18/20, `npm run smoke`, the 348 mutants of the zip list, macOS, Windows.
