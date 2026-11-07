# Status file archive — rolling paragraphs, rounds 309-309

Moved out of `CHICLA_PROJECT_STATUS-316.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/archive/status/status-archive-rolling-*.md`.

## Current version clauses

- round 309: C27.5: `ci.yml` runs `actions/checkout` and `actions/setup-node` at v6.0.0 (Node 24); `ci-actions-node24.test.mjs`; the pin did not move

## Open decisions entries

- (round 309: **none open of Rodrigo's; D156 is Claude's label** (ROADMAP D156): v6.0.0 for both actions, a test that reads the version comment, `upload-artifact` left to C27.6. **Next up: C27.6 (`actions/upload-artifact`, the last Node 20 action in the CI) after the CI of round 309 is green; M27 is otherwise done. G-C11 and G-C8 are his.**)
