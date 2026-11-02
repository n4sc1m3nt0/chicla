# Status file archive — «Previous» blocks of rounds 287-287

Moved out of `CHICLA_PROJECT_STATUS-297.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/status-archive-previous-*.md`.

**Previous (round 287):** 2026-10-30. Rodrigo asked why the installed package makes no `RECOVER/`, Claude explained and admitted its reason for documenting instead of fixing («could move the pin») was overstated; Rodrigo said «reverte a decisão e faz a correção». Done: `emergency-dump.mjs` looks beside its own module first; the dump from the installed package has `RECOVER/`; the limit documentation is removed. Next: C24.3, then C24.4.

