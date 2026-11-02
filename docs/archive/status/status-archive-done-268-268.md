# Status file archive — «Done» lines of the Snapshot, rounds 268-268

Moved out of `CHICLA_PROJECT_STATUS-282.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 268 (2026-10-28; Rodrigo: «avança»). C20.3 (D-265c, AUDIT-7 F-2, F-4): `test/mutants-kit-figures.test.mjs` (4, 3 red first) derives the prefixes of `packages/chicla-kit/mutants/list.mjs` and holds `docs/README.md` to all ten (`K-CMN-` and `K-VER-` were missing), holds item 20 (c) and the list header to «about half an hour» and to no entry count that is not the list's (they said «100 entries, minutes» and «about 100 mutants»; the list has 126 and the whole pass took about 34 minutes), and holds the M19 rows of the ROADMAP to a done state (the heading said proposed, C19.5 in progress, C19.7 PROPOSED). Docs and one test, the pin did not move. Not run by Claude: the CI, Node 18 and 20, the 348 mutants of the zip list, macOS, Windows.
