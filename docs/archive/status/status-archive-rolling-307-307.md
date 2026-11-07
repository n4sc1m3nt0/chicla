# Status file archive — rolling paragraphs, rounds 307-307

Moved out of `CHICLA_PROJECT_STATUS-314.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/archive/status/status-archive-rolling-*.md`.

## Current version clauses

- round 307: C27.3: `chicla ci-report <logs.zip>` (core `ci-report.mjs`, `cli.mjs`; K-CIR-01 to 05); the pin did not move

## Open decisions entries

- (round 307: **one open, D-307a (ROADMAP D154)**: `ci-report` exits 1 for a failed job or an unreadable zip, a log over 64 MiB is only a warning, and a job fails on a `not ok` line, a `# fail` above 0 or an `##[error]` line; Claude's suggestion: keep it; D153 is confirmed by Rodrigo (2026-11-02). **Next up: C27.4 (the 150 `docs/status-archive-*` files to `docs/archive/status/`), then C27.5 (CI action versions, the macOS 1810 vs 1822 count). G-C11 and G-C8 are his.**)
