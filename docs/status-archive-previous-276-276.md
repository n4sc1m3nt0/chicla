# Status file archive — «Previous» blocks of rounds 276-276

Moved out of `CHICLA_PROJECT_STATUS-286.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/status-archive-previous-*.md`.

**Previous (round 276):** 2026-10-28. Rodrigo asked for the release of both packages («faz o passo 1. quero os dois»); measured against the published 0.1.0 tarballs, `chicla-zip` `zipkit.mjs` is byte-identical (only its README changed) and `chicla-kit` has 9 changed sources, so both go to `0.1.1`: versions, READMEs, the runbook section «Releasing 0.1.1» and D146 are in, tests first (12 red, then green). No source file, the pin did not move; Rodrigo publishes (push, CI, tarballs, tags, `npm publish`); next: none named.

