# Status file archive — «Previous» blocks of rounds 266-266

Moved out of `CHICLA_PROJECT_STATUS-276.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/status-archive-previous-*.md`.

**Previous (round 266):** 2026-10-28. Rodrigo said «aceito tudo. avança» (D143, D-265a to D-265e CONFIRMED) and C20.1 is done: `scripts/bump-round.mjs` checks its arguments first, so `--help` or a typo like `--verfy` no longer bumps the status number (exit 2 with a usage text and nothing changed, `--help` exits 0), proved by `test/bump-round-options.test.mjs` and four hand mutants. Two source files, the pin did not move; next: C20.2.

