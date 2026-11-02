# Status file archive — rolling paragraphs, rounds 298-298

Moved out of `CHICLA_PROJECT_STATUS-305.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/status-archive-rolling-*.md`.

## Open decisions entries

- (round 298: **D-298a, Claude's call on delegation, open for Rodrigo to change:** the prefix lives in one line of `CLAUDE.md`, `status-prefix: <NAME>`, beside the toolchain pin (read like it, in no hash); suggestion: keep. D-A, D-B and D-C are confirmed (2026-11-01). **Next task: C26.2** (`panel.mjs`, `update.mjs`, `verify-delivery.mjs` read the prefix), then C26.3 (`emergency-dump.mjs`, `recovery-report.mjs`, the pin moves, and `archive-changelog.mjs`; **G-C11 is due again after it**), then C26.4 (`init`, `--name`, the templates). The `chicla` already installed in his other project keeps working: no line = CHICLA; the fix reaches it with the next release, which is his gate.)
