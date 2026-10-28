# Status file archive — «Done» lines of the Snapshot, rounds 242-242

Moved out of `CHICLA_PROJECT_STATUS-256.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 242 (2026-10-26; Rodrigo: «avança para uma ronda só de plano do A-1, o A-2 fica para depois»). The A-1 plan, docs only: `docs/plan-a1-integrity.md` (§2 the rules against the three tools, with an experiment on a copy of the round 241 tree: CRLF in `CLAUDE.md`, a pin off by one digit and a CHANGELOG edited after the bump are all caught by `bump-round --verify` and all pass `make-delivery-zip`; §3 one pure, unpinned `integrity.mjs`, each tool with its own reader; §5 cards C17.1 to C17.4; §6 D-242a to D-242d), ROADMAP D140, M17 and D138 updated (A-2 «depois»), `test/plan-a1-docs.test.mjs` (8, red first). No source, no pin. Not run by Claude: the CI, Node 18/20, the whole `npm run smoke`, mutants, macOS, Windows.
