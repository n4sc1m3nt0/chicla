# Status file archive — «Done» lines of the Snapshot, rounds 250-250

Moved out of `CHICLA_PROJECT_STATUS-264.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 250 (2026-10-26; Rodrigo: «avança»). C18.2 (D-248b, AUDIT-5 F-2): `archive-changelog.mjs --rolling [--keep-clauses N] [--dry-run]` keeps the newest 3 clauses of «Current version» and entries of «Open decisions», moves the older ones verbatim, one per line, to `docs/status-archive-rolling-<lo>-<hi>.md` and leaves one pointer in each paragraph (the `Open decisions` pointer has the panel's «earlier rounds:» shape); `test/archive-rolling.test.mjs` (7, red first), a case in `scripts/smoke-test-archive-changelog.mjs`, seven hand mutants red; run for real: 113 clauses and 20 entries (rounds 135 to 246) to `docs/status-archive-rolling-135-246.md`, rebuilt byte for byte by an independent script; one source file, the pin did not move.
