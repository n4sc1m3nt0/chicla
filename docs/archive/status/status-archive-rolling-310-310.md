# Status file archive — rolling paragraphs, rounds 310-310

Moved out of `CHICLA_PROJECT_STATUS-317.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/archive/status/status-archive-rolling-*.md`.

## Current version clauses

- round 310: C27.6: `ci.yml` runs `actions/upload-artifact` at v6.0.0 (`b7c566a7…`, the first with `runs.using: node24`, read in its `action.yml`); the same test file covers it; the pin did not move

## Open decisions entries

- (round 310: **none open of Rodrigo's; D157 is Claude's label** (ROADMAP D157): v6.0.0 and not v7.0.2 for `upload-artifact`, to keep the three actions on one major. **M27 is closed: Next up: `audit` of M27 (AUDIT-10, instructions item 2), or the task Rodrigo names after he has read the CI of rounds 309 and 310. G-C11 and G-C8 are his.**)
