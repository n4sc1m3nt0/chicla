# Changelog archive — rounds 231-241

Moved out of `CHANGELOG.md` verbatim by `scripts/archive-changelog.mjs`. Nothing was edited or deleted;
this file has no fingerprint and is not part of the fingerprint triple. Find an entry with
`grep -n "^## Round 12" CHANGELOG-archive-*.md`.

## Round 241 — C16.7: the Snapshot archived, `archive-changelog.mjs --snapshot` (v0.0.245)

- Task (Rodrigo: «avança»; C16.7, D139 confirmed). Tests first: `test/archive-snapshot.test.mjs` (8, all red first: keep N and archive the rest verbatim, outside the Snapshot byte for byte, dry-run and the default 10, a second batch and an index that grows, refusals that change nothing, the name from the lowest and highest round even when the lines are out of order, the other modes untouched) and 2 docs tests.
- `scripts/archive-changelog.mjs` (one source file): `--snapshot [--keep-done N] [--dry-run]` moves the older bullets of `## Snapshot` (a «Done», a «Done (part)», a note, a two-line entry: any line starting `- `, continuation lines kept with it) to `docs/status-archive-done-<lo>-<hi>.md`, and leaves one `- Archived «Done» lines (nothing deleted): …` line, always the last. It refuses, changing nothing, on a loose paragraph or a blank line among the lines, an index that is not last, two status files, no Snapshot, a bad N, an existing archive, or no round number in the moved lines.
- Run for real: `--snapshot --keep-done 9` (+ this round's line = 10): the status file 147 088 → 49 656 bytes, 228 lines (rounds 0 to 228) in `docs/status-archive-done-0-228.md`; the Snapshot rebuilds byte for byte (checked); and `--status --keep-previous 4`: 2 more «Previous» blocks in `docs/status-archive-previous-233b-234.md`. The CHANGELOG (22 rounds) was NOT archived: a batch of 3 rounds would only make a small file, it waits for the next batch.
- 16 hand mutants: 14 red; S3 is equivalent (the internal check «kept + moved = original» refuses the same case), and S14 (name from the first and last line, not the lowest and highest) survived until a test with lines out of round order was added. Docs: status items 4 and 6, `docs/state-file.md`, `docs/README.md`, ROADMAP (C16.7 done, D138 due), AUDIT-4 §7. M16 (C16.1 to C16.7) is complete.
- NOT run by Claude: the CI, Node 18 and 20, the whole `npm run smoke`, mutants (the package list), macOS, Windows.

## Round 240 — C16.6: one read per file in `check-manifest`, `npm run test:fast` / `test:slow` (v0.0.244)

- Task (Rodrigo: «avança»; C16.6, AUDIT-4 P-1, P-2). Tests first: `test/check-manifest-one-read.test.mjs` (6; a hook on `fs` counts opens and reads per path: the manifest equals an independent oracle byte for byte, each file is opened and read once in `--write`, a file over 1 MiB is not read in check mode, an `allow`ed file is not read in check mode, no `statSync` per entry; the unreadable-file test needs a non-root user, so it was run as `nobody`) and `test/test-sets.test.mjs` (7), plus 2 docs tests. 3 of the first 4 were red.
- `check-manifest.mjs`: `inspect()` opens each file once, scans and (with `--write`) hashes the same bytes; `readdirSync` with file types, `statSync` only for a symlink; a read error is kept for `--write` and stops it with the same error as before. `scripts/run-tests.mjs` (new; so two source files, not one) with `npm run test:fast` and `test:slow`: the same files as `npm test` (checked: the list node itself discovers, with a reporter and a name filter that runs nothing, equals `discover()`), 7 slow integration files apart. `npm test` and the CI are unchanged.
- Measured here (1 core): `test:fast` 160 s, 1406 tests, 146 files (before: the whole suite 363 s); the 7 slow files about 220 s. The numbers are in item 20 of the status file, not in `CLAUDE.md` (as Rodrigo confirmed), which only names `test:fast`.
- 22 hand mutants: 10 on `check-manifest` (9 red; one, the not-a-regular-file guard, is equivalent for every device that can be read safely and was not tested on `/dev/zero`) and 12 on the runner (all red, one by a hang). Docs: item 20, `CLAUDE.md` «Long commands», ROADMAP (C16.6 done, C16.7 next), AUDIT-4 §7.
- NOT run by Claude: the CI, Node 18 and 20, the whole `npm run smoke`, mutants (the package list), macOS, Windows.

## Round 239 — C16.5: five more secret kinds, nine in all (v0.0.243)

- Task (Rodrigo: «avança», and «d139 sim», «confirmo a nota para o c16.6»; C16.5, AUDIT-4 S-5). Tests first: `test/secret-kinds.test.mjs` (6: a positive and a false-positive family per kind, only the kind is printed by `check-manifest --write`, the Anthropic key is not read as OpenAI, 1 MiB of hostile input in a child with a time limit), the dump tie test `test/dump-secret-content.test.mjs` +19 samples, two docs tests.
- `policy.mjs` (pinned, so THE PIN MOVED) and `emergency-dump.mjs` (its own copy, D7; the card said one file, it is two): Slack (`xox[baprs]-`), Stripe (`sk_live_`, `rk_live_`), Google API key (`AIza` + 35), Anthropic (`sk-ant-`), OpenAI (`sk-`). Each is anchored and sized; the ones that could look like prose or CSS need a digit (and a capital for `sk-`) among the first 60 characters, and those look-aheads are bounded.
- `test/pinned-policy-move.test.mjs` now reverses this edit before comparing the old sha256, as it did for earlier edits of pinned files. `docs/manifest.md` has a new §5 (the nine kinds, what is not caught on purpose, the limits: 1 MiB, binary, UTF-16, nine shapes), the old §5 is §6.
- 27 hand mutants: 25 red. Explained (2): the order of Anthropic and OpenAI and the `(?!ant-)` guard protect the same case, so each alone is equivalent; the unbounded OpenAI look-aheads are not slower (the look-behind already blocks every occurrence inside a run). Found: with Slack's look-ahead unbounded the perf test HUNG instead of failing (the scan was quadratic on `xoxb-xoxb-…`), so it now runs in a child with a 30 s limit.
- Docs: ROADMAP (C16.5 done, C16.6 next with the timings going to item 20, D139 confirmed, C16.7 planned), AUDIT-4 §7, the status file, `package.json` version.
- NOT run by Claude: the CI, Node 18 and 20, the whole `npm run smoke`, mutants (the package list), macOS, Windows, and a real `/dump` with the new pin.

## Round 238 — C16.4: the history archived, `archive-changelog.mjs --status` (v0.0.242)

- Task (Rodrigo: «avança»; C16.4, next task of M16). AUDIT-4 T-3, T-4. Tests first: `test/archive-status.test.mjs` (6, all red first; two passed empty and were strengthened) and `scripts/smoke-test-archive-changelog.mjs` +5.
- `scripts/archive-changelog.mjs` (the one source file): new mode `--status [--keep-previous N] [--dry-run]` moves the old `**Previous (round N):**` blocks of the status file, verbatim, to `docs/status-archive-previous-<lo>-<hi>.md` and leaves one index paragraph (appended on later runs); refuses, changing nothing, on a loose paragraph among the blocks, two status files, an existing archive or a bad N. It never touches `CHANGELOG.md`, and the plain run never touches the status file.
- Run for real: `--keep 19` (+ this entry = 20 rounds): `CHANGELOG.md` 326 642 → 27 308 bytes, 222 rounds in `CHANGELOG-archive-rounds-0-219.md`; `--status --keep-previous 4` (+1 by this round's rotation = 5): the status file 176 394 → 141 418 bytes, 105 blocks (rounds 123 to 233) in `docs/status-archive-previous-123-233.md`. Both rebuild the original byte for byte (checked), the cold-start command prints the same 13 517 bytes, `bump-round --refresh` and `--verify` green.
- 12 hand mutants of the new mode: all red; M9 (`--keep-previous 0`) survived the first test because the script crashed instead of refusing, the test now asks for the message. Docs: status items 4 and 6, `docs/state-file.md`, `docs/README.md`, ROADMAP (C16.4 done, C16.5 next, D139 and C16.7 PROPOSED), AUDIT-4 §7.
- Noticed, not fixed: the Snapshot is 100 KB (195 «Done» lines) of the 141 KB left (D139); the ROADMAP row of C16.6 says the timings go into `CLAUDE.md`, but C16.3 keeps them only in item 20 (noted in D139).
- NOT run by Claude: the CI, Node 18 and 20, the whole `npm run smoke` (only this script's), mutants (the package list), macOS, Windows.

## Round 237 — the chat reply layout of round 227 is reverted (v0.0.241)

- Task (Rodrigo: he asked for the CLI text to be fixed, and round 227 changed the layout of the chat replies instead; «essa correção foi um erro»). Test first (1 red): `test/docs-accuracy.test.mjs` +1 (no item 21 in the Instructions, no «Layout» sentence in `CLAUDE.md` rule 6, rule 6 itself stays).
- Removed: item 21 «Reply format: open decisions» of the status file and the «Layout» sentence of `CLAUDE.md` rule 6. Replies list the open decisions as before round 227 (a short paragraph, suggestions inline, his own to-dos in the same reply), not as `## Open decisions` blocks. History is kept: the round 227 entry and its «Previous» block stay as they were. The panel's Decisions page (round 228, the CLI) is NOT touched: it is what he asked for.
- Recorded: Rodrigo confirmed every suggestion of round 236 (D138 stays «depois», D-236a, D-236b, C16.4 next).
- Files: `CLAUDE.md`, the status file, this CHANGELOG, `package.json` version. No source, the pin did not move.
- NOT run by Claude: the CI, Node 18 and 20, `npm run smoke`, mutants, macOS, Windows.

## Round 236 — C16.3: one bounded wait for long commands, stale numbers fixed, `CLAUDE.md` points to the status block, `big-cm.log` moved (v0.0.240)

- Task (Rodrigo: «avança»; C16.3, next task of M16). AUDIT-4 T-1, T-2, T-5, P-3. Tests first (5 red): `test/docs-accuracy.test.mjs` +5 (no «900+» or «4 minutes» in `CLAUDE.md` and item 20; item 20 holds the `timeout 270` wait on `until grep -q '^EXIT'` and no short polling; the `CLAUDE.md` sections «Long commands» and «Delivery rules» are pointers (item 20; items 8 to 15), not copies; `big-cm.log` is not in the root and its moved copy has the header).
- Status file item 20 rewritten and now the single source: start in the background with a log ending in `EXIT`, then ONE bounded wait, `timeout 270 bash -c "until grep -q '^EXIT' …"`, repeated while the log grows (a 6 min suite is 2 waits instead of ~20 polls); `npm test` is «6 to 10 minutes» (measured this round: 6 min, 1429 tests) and the item says to read the last full run. CALL ON DELEGATION: rule (d) «silent for 3 minutes» became «exit 124 and the log did not grow during the whole wait»: one wait of 270 s is the unit now. FOUND in this round: the first draft said `timeout 580` (the old 10 min limit); a sandbox call is cut at 300 s and the cut also killed the undetached `npm test`, so item 20 now says `timeout 270` and `setsid nohup`.
- `CLAUDE.md`: «Long commands» and «Delivery rules» are short pointers (it keeps `(348 mutants)`, which docs-accuracy checks). `big-cm.log` moved from the root to `packages/chicla-zip/bench/big-cm.log` with a first line saying it was measured at `MAX_CENTRAL` 1 GiB, before C15.6; the measurement is kept verbatim. The old root path is a deliberate removal (`--allow-removed big-cm.log`).
- 11 hand mutants of the five guarantees, all red (control green). Files: the above, the status file, ROADMAP (C16.3 done, C16.4 next), `docs/audits/AUDIT-4.md` §7, this CHANGELOG, `package.json` version. No source, the pin did not move.
- NOT run by Claude: the CI, Node 18 and 20, `npm run smoke`, mutants (the package list), macOS, Windows.

## Round 235 — C16.2: CI read-only token and actions pinned to commits (v0.0.239)

- Task (Rodrigo: «avança»; C16.2, next task of M16). AUDIT-4 S-3 and S-4. Tests first (5 red): `test/ci.test.mjs` +3 (top-level `permissions: contents: read` and nothing widened; every `uses:` is `owner/name@<40 hex> # vX.Y.Z`; `.github/dependabot.yml` for `github-actions`), and the two `upload-artifact@v4` assertions now ask for a 40-hex SHA.
- `.github/workflows/ci.yml`: `permissions: contents: read` at the top; `actions/checkout` 11d5960 (v4.4.0), `actions/setup-node` 49933ea (v4.4.0), `actions/upload-artifact` ea165f8 (v4.6.2). These are the commits the moving `v4` tag points to today (read with `git ls-remote` on 2026-10-22; lightweight tags, so the SHA is the commit), so the jobs run the same code as before. New `.github/dependabot.yml`: `github-actions`, `/`, weekly.
- 8 hand mutants (no permissions, `write`, one action back to a tag, tag comment dropped, 39-char SHA, wrong ecosystem, wrong directory, no file): all red; the 7th survived the first regex and was tightened.
- Files: the above, the status file, ROADMAP (C16.2 done, C16.3 next), `docs/audits/AUDIT-4.md` §7, this CHANGELOG, `package.json` version. No source, the pin did not move.
- NOT run by Claude: the CI itself (the workflow is unseen on GitHub until pushed), Node 18 and 20, `npm run smoke`, mutants (the package list), macOS, Windows. Gate for Rodrigo: push and read one green CI run.

## Round 234 — C16.1: `recovery` refuses a tar archive, fresh folder by default (v0.0.238)

- Task (Rodrigo: «d138 depois. d-235a c16.1 avança»; D-234c). AUDIT-4 S-1 and S-2. Test first (7 red): `packages/chicla-kit/test/recovery-hardening.test.mjs` (6).
- `pinned/recovery-report.mjs` (PINNED, the pin moved, `bump-round` rewrote it): a `.tar.gz`, `.tgz`, `.tar` (any case) or any file that starts with the gzip magic is refused with `ERECOVERY_FORMAT` before anything is created; the system `tar` is no longer run. Without `--out`, `recoveryOutPlan()` returns `/home/claude/recovered` where `/home/claude` exists (POSIX), else a prefix and `recovery` makes a fresh `mkdtemp` folder (0700): no fixed name another user could plant. `cli.mjs`: help text only.
- Tests changed to follow: `robustness-r233.test.mjs` (the plan function), `secret-marker-chain.test.mjs` (the tar path now asserts the refusal and that nothing was extracted), `pinned-recovery-report-move.test.mjs` (reverses this edit too before comparing the old sha256). Status file item 17: a `.tar.gz` dump is extracted by hand. 8 hand mutants of the file, all red.
- Files: the above, the status file, ROADMAP (C16.1 done, C16.2 next), `docs/audits/AUDIT-4.md` §7, this CHANGELOG, `package.json` version. 2 source files.
- NOT run by Claude: Node 18 and 20, `npm run smoke`, `npm run mutants` (the package list; these are hand mutants of the kit), CI, macOS, Windows (the Windows default is tested with an injected platform). Gate for Rodrigo: repeat `/dump` and «recovery mode» once on a real dump, since the pin moved.

## Round 233b — audit of security, performance and tokens, recorded, and the plan (v0.0.237)

- Task (Rodrigo: «faz um audit», then «d-234a sim. d-234b faz primeiro uma ronda de docs para planear a abordagem. d-234c sim»). Docs and one test only. Test first (6 red).
- `docs/audits/AUDIT-4.md` (new): what is good; S-1 to S-6 (system `tar` in `recovery`, the predictable default folder of round 233, CI without `permissions`, actions pinned to tags, narrow secret scan); P-1 to P-3 (suite 565 s, not 4 minutes; double read in `check-manifest`; stale `big-cm.log`); T-1 to T-6 (polling is the biggest token cost, stale timings, 170 KB status file, never-archived CHANGELOG); the plan of six rounds with files, tests first, pin and «done when».
- `ROADMAP.md`: D137 (confirmed), D138 (proposed, not scheduled), milestone M16 with C16.1 to C16.6. `docs/README.md` lists the audits. `test/audit4-docs.test.mjs` (6).
- Files: the above, the status file, this CHANGELOG, `package.json` version. No source, nothing pinned touched, the pin did not move. Nothing of the audit is fixed yet.
- NOT run by Claude: Node 18 and 20, `npm run smoke`, `npm run mutants`, CI, macOS, Windows; S-1 was read, not tried with hostile tarballs.

## Round 233 — three robustness fixes: check-manifest root, recovery default folder, CRLF in CLAUDE.md (v0.0.236)

- Task (Rodrigo, 2026-10-22). Test first (7 red, the control green): `packages/chicla-kit/test/robustness-r233.test.mjs` (8).
- `chicla check-manifest --root <missing or not a folder>` died with ENOENT from the walk; now `EMANIFEST_ROOT` (exit 1, also with `--write`, nothing created). `check-manifest.mjs`.
- `chicla recovery` without `--out` used `/home/claude/recovered` (on Windows `C:\home\claude\recovered`); new exported `defaultRecoveryOut()`: that folder only on a POSIX system where `/home/claude` exists, else `<temp>/chicla-recovered`. `pinned/recovery-report.mjs` (PINNED: the toolchain pin moved, `bump-round` rewrote it) and the help comment of `cli.mjs`.
- `bump-round --verify` now checks that `CLAUDE.md` has no CRLF (it is in no hash and the pin regex ignores line endings, so CRLF passed). The status file, CHANGELOG and `version.mjs` are hashed, so CRLF there already failed. `bump-round.mjs`. `check-manifest` itself does not look at line endings (it only lists lost files): left as it was.
- Follow-ups the first full `npm test` showed (3 red, all consequences): `docs/fingerprint.md` and `test/fingerprint-docs.test.mjs` (new last row of the `--verify` table), `docs/manifest.md` (`EMANIFEST_ROOT`), `test/pinned-recovery-report-move.test.mjs` (reverses this round's edit of the pinned file before comparing the old sha256).
- NOT run by Claude: Node 18 and 20, `npm run smoke`, `npm run mutants` (no mutant added), `check-build`, CI, macOS, Windows (the Windows default is tested with an injected platform, not on a real machine).

## Round 232 — ROADMAP §9 aligned with the status file (v0.0.235)

- Task (Rodrigo: «d-231a sim», after the check of the open gates). Docs and one test only. Test first (4 red).
- `ROADMAP.md` §9: G-C13 state `open` to `closed`; G-C6 titled and stated CLOSED (round 230); G-C3 says macOS done and exFAT/FAT open; new row G-C9 (closed, round 231); cards C5.5 and C13.4 end `gate · CLOSED`. No gate changed state: G-C8 and the exFAT/FAT part of G-C3 stay open.
- `test/roadmap-gates.test.mjs` (4): every gate CLOSED in the status file has a closed row in §9; no closed title with state `open`; G-C3 and G-C8 wording; C5.5 and C13.4. 5 hand mutants, all red.
- Files: `ROADMAP.md`, `test/roadmap-gates.test.mjs` (new), the status file, this CHANGELOG, `package.json` version. No source, nothing pinned touched.
- NOT run by Claude: Node 18 and 20, `npm run smoke`, `npm run mutants`, CI, macOS, Windows.

## Round 231 — gates closed, the agent matrix read on the vendors' pages (v0.0.234)

- Task (Rodrigo: close G-C13, G-C4, G-C9 and G-C10 (he compared the `chicla-zip` sums), help with G-C15, then the Windows gates, then «fecha o g-c15»). Recorded as CLOSED by Rodrigo in the status table and ROADMAP §9. Test first (1 red).
- G-C15, read by Claude on 2026-10-22: Claude Code reads `./CLAUDE.md` or `./.claude/CLAUDE.md`, and `AGENTS.md` only when there is no `CLAUDE.md` (v2.1.277+); Codex `AGENTS.override.md` then `AGENTS.md` from the project root down; Gemini CLI `GEMINI.md` by default, `AGENTS.md` only through `context.fileName`; Copilot `.github/copilot-instructions.md` on every surface except Eclipse code review (agents also read `AGENTS.md`); Cursor reads `AGENTS.md` in the root and subfolders; Windsurf (now Devin Desktop) reads `AGENTS.md`, the root one always on. So the four entries are right, Cursor and Windsurf need no entry, no `0.1.1`. NOT checked: Cline and Antigravity.
- Sources: code.claude.com/docs/en/memory, learn.chatgpt.com/docs/agent-configuration/agents-md, geminicli.com/docs/cli/gemini-md/, docs.github.com/en/copilot/reference/custom-instructions-support, cursor.com/docs/rules, docs.devin.ai/desktop/cascade/agents-md.
- Files: `packages/chicla-kit/src/agents.mjs` (header comment only), kit README, `packages/chicla-kit/test/init-agent.test.mjs` (comment), `ROADMAP.md`, `test/release-docs.test.mjs` (+1), the status file, this CHANGELOG, `package.json` version. No logic, nothing pinned touched.
- NOT run by Claude: Node 18 and 20, `npm run smoke`, `npm run mutants`, CI.

