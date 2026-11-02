# Status file archive — rolling paragraphs, rounds 304-304

Moved out of `CHICLA_PROJECT_STATUS-311.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/status-archive-rolling-*.md`.

## Current version clauses

- round 304: C24.7: the CI of round 303 was red; `scripts/run-tests.mjs` ends with `process.exitCode` (the `--list` was cut on macOS, Node 18 and 20); `.gitignore` names `stage/`, `stage2/`, `dist/`, `ci/package/`; `test/test-sets.test.mjs` (1 new, red first); the pin did not move

## Open decisions entries

- (round 304: **none open.** D-304a (`process.exitCode`, a hypothesis that only the CI on macOS can confirm), D-304b (the four build folders in `.gitignore`, `dist/` included) and D-304c (no gate added; the CI run is Rodrigo's push) are Claude's labels, taken on delegation and accepted by «faz a ronda 304». **Rodrigo: `git rm -r --cached ci/package stage2`, push, read the CI; G-C11 and G-C8 are his.**)
