# Status file archive — rolling paragraphs, rounds 306-306

Moved out of `CHICLA_PROJECT_STATUS-313.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/archive/status/status-archive-rolling-*.md`.

## Current version clauses

- round 306: C27.2: `check-manifest` fails with `EMANIFEST_TRACKED` for a file git tracks and the manifest lacks (`.git` only); `git-hygiene.test.mjs` (10); K-CMN-22 to 25; the pin did not move

## Open decisions entries

- (round 306: **one open, D-306a (ROADMAP D153)** — the guard FAILS (`EMANIFEST_TRACKED`, exit 1) instead of warning; Claude's suggestion: keep it failing, because the warning already existed and did not stop round 303; the alternative is a warning that only the CI turns into a failure (when C27.5 touches the CI). **Next up: C27.3 (`chicla ci-report`), then C27.4 and C27.5. G-C11 and G-C8 are his.**)
