# Status file archive — «Previous» blocks of rounds 235-243

Moved out of `CHICLA_PROJECT_STATUS-253.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/status-archive-previous-*.md`.

**Previous (round 243):** 2026-10-26. Rodrigo confirmed D-242a to D-242d («sim» ×4) and said «avança»: C17.1 done (D140), `packages/chicla-kit/src/integrity.mjs` (pure, not pinned) holds the LF list and the status-file regex, and `bump-round --verify` and `check-manifest` call it (`EINTEGRITY_LF`); no pin move. Next: C17.2 (state and pin rules, `verify-delivery` calls them).

**Previous (round 242):** 2026-10-26. Rodrigo said «avança para uma ronda só de plano do A-1, o A-2 fica para depois»: `docs/plan-a1-integrity.md` (who checks what today, an experiment where a delivery with CRLF in `CLAUDE.md`, a wrong pin and a stale CHANGELOG hash passes `make-delivery-zip`, the design, cards C17.1 to C17.4), D140 and M17 in the ROADMAP; docs and one test, no source, the pin did not move. D-242a to D-242d wait for Rodrigo, and A-2 stays «depois».

**Previous (round 241):** 2026-10-22. Rodrigo said «avança»: C16.7 done (D139), and with it M16 (C16.1 to C16.7). `archive-changelog.mjs` got `--snapshot`; this file went from 147 KB to about 51 KB (the older Snapshot lines are in `docs/status-archive-done-0-228.md`). No pin move. D138 («depois», after C16.6) is now due: see Next up.

**Previous (round 240):** 2026-10-22. Rodrigo said «avança»: C16.6 done (AUDIT-4 P-1, P-2). `check-manifest` reads each file once; `npm run test:fast` runs everything but 7 slow integration files in 160 s (item 20 has the numbers), `npm test` is unchanged and is what the CI runs. No pin move. Next: C16.7 (D139, the Snapshot).\n\n**Previous (round 239):** 2026-10-22. Rodrigo confirmed D139 («sim»: C16.7 archives the old «Done» lines) and the note for C16.6 (timings go to item 20), asked that replies go back to Claude's plain prose (no headings or blocks), and said «avança». C16.5 done (AUDIT-4 S-5): the content detector knows nine kinds; the pin moved. Next: C16.6.

**Previous (round 238):** 2026-10-22. Rodrigo said «avança»: C16.4 done (AUDIT-4 T-3, T-4). `archive-changelog.mjs` got `--status`; `CHANGELOG.md` keeps 20 rounds and this file 5 «Previous» blocks, the rest verbatim in `CHANGELOG-archive-rounds-0-219.md` and `docs/status-archive-previous-123-233.md`; the Snapshot (100 KB, 195 «Done» lines) is now the biggest part and is proposed as D139. Next: C16.5.

**Previous (round 237):** 2026-10-22. Rodrigo confirmed every suggestion of round 236 (D138 «depois», D-236a, D-236b, C16.4 next) and asked to undo the chat layout of round 227, which he had never meant (he wanted the CLI text): item 21 and the `CLAUDE.md` «Layout» sentence are removed, the panel stays. Docs and one test, no source, the pin did not move.

**Previous (round 236):** 2026-10-22. Rodrigo said «avança»: C16.3 done (AUDIT-4 T-1, T-2, T-5, P-3). Item 20 is the one place for the long-command rule (one bounded `timeout 270` wait instead of polling), the old numbers are corrected, `CLAUDE.md` points to the status block, and `big-cm.log` is in `packages/chicla-zip/bench/`; docs and one test, no source, the pin did not move. Next: C16.4 (archive the history).

**Previous (round 235):** 2026-10-22. Rodrigo said «avança»: C16.2 done (AUDIT-4 S-3, S-4). `ci.yml` has `permissions: contents: read` and `actions/checkout`, `setup-node` and `upload-artifact` pinned to the commits `v4` pointed to on 2026-10-22 (tag in a comment), new `.github/dependabot.yml` for `github-actions`; `test/ci.test.mjs` +3 (5 red first), 8 hand mutants red. No source, the pin did not move; the CI run on GitHub is unseen until Rodrigo pushes. Next: C16.3 (process docs).

