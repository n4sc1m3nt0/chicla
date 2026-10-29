# Status file archive — «Previous» blocks of rounds 273-273

Moved out of `CHICLA_PROJECT_STATUS-283.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/status-archive-previous-*.md`.

**Previous (round 273):** 2026-10-28. Rodrigo ran the whole `npm run mutants` on his Mac (348 entries, round 272 tree; the baseline needed `TMPDIR` with a copy of `docs/`, card C20.7): one entry was not as listed, `R202-folder-counts` SURVIVED, and 9 are Linux-only; his «sim a tudo» covered D-272a (C20.7) and D-272b (C20.6). C20.6 is done: the entry now runs `read.test.mjs` and `open.test.mjs` and goes RED alone, held by `test/mutants-zip-list-tests.test.mjs` (2, 1 red first); data and one test, no source, the pin did not move; next: C20.7.

