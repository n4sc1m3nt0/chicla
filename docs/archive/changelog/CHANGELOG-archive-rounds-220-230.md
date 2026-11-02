# Changelog archive — rounds 220-230

Moved out of `CHANGELOG.md` verbatim by `scripts/archive-changelog.mjs`. Nothing was edited or deleted;
this file has no fingerprint and is not part of the fingerprint triple. Find an entry with
`grep -n "^## Round 12" CHANGELOG-archive-*.md`.

## Round 230 — the release recorded (v0.0.233)

- Task (Rodrigo published both 0.1.0 packages and closed G-C6, then pasted `npm view`, sha256, tag and release output for Claude to check). Docs and one test only. Test first (3 red).
- Seen by Claude: `npm view` 0.1.0 for both; sha256 of `npm pack chicla-kit@0.1.0` = the checked file; tags `chicla-zip-v0.1.0` and `chicla-kit-v0.1.0` on origin; both releases listed. NOT seen: the same sha256 comparison for `chicla-zip`.
- `README.md`, `packages/chicla-zip/README.md`, `packages/chicla-kit/README.md` (status line and the C13.5 sentence) and `SECURITY.md` (supported versions) no longer say pre-release or not published; `docs/release.md`: `npm publish ./dist/x.tgz` (npm reads `dist/x.tgz` as a GitHub shorthand, `EALLOWGIT`) and a «Published (round 230)» paragraph. `test/release-docs.test.mjs`: the kit README test now expects «`0.1.0`, published on npm», the runbook pin has `./`, and a new test fails if any of the four documents says the release is pending.
- Found and fixed: after round 229 the root README still said the kit was `0.0.0` and not releasable.
- Files: those, the status file, this CHANGELOG, `package.json` version. No source, nothing pinned touched.
- NOT run by Claude: Node 18 and 20, `npm run smoke`, `npm run mutants`, CI; `npm publish`, tags and releases were Rodrigo's.

## Round 229 — `chicla-kit` 0.1.0 (v0.0.232)

- Task (Rodrigo: «está pronto para o kit»; the CI of the round 228 tree was 12 of 12 green once the old status file was removed with `git rm`, and his `npm test`, `npm run smoke` and mutants were green). The release round of D130: the number and the README line, nothing else.
- `packages/chicla-kit/package.json` `0.0.0` → `0.1.0`; `packages/chicla-kit/README.md` status line «pre-release `0.1.0`, ready to release, not published yet»; `docs/release.md` (item 4 and kit «Before you start» 3) says both packages are `0.1.0`. Tests first (2 red): `test/layout.test.mjs` and `packages/chicla-kit/test/cli-check-manifest.test.mjs` now pin `0.1.0`.
- Noticed, not changed: the last sentence of the kit README still says it «cannot be installed alone yet (card C13.5)», although round 166 made it reach `chicla-zip` by name; Rodrigo decides whether it goes before the publish.
- Files: those five, the status file, this CHANGELOG, root `package.json` version. No source, nothing pinned touched.
- NOT run by Claude: Node 18 and 20, `npm run smoke`, `npm run mutants`, CI (Rodrigo ran them on the round 228 tree), `npm publish` (never by Claude).

## Round 228 — the Decisions page of the panel, laid out (v0.0.231)

- Task (Rodrigo, again: the text in the CLI, especially the Decisions section, should be prettier and easier to read). The page showed the whole «Next up» paragraph as one 40-line block. Round 227 had read the request as the layout of Claude's replies (kept); this round does the panel. Tests first (3 red).
- `packages/chicla-kit/src/panel.mjs`: the page has the heading «Open decisions», one block per entry `(round N: …)` (an `(Earlier …)` group, even one that never closes, counts too), the newest in full, older ones as one dim line cut with «…», the text between entries as «Note», and «Rodrigo's to do» as a labelled bullet list split at «; » outside brackets. Read by shape, not by wording; nothing is dropped except the tails of older entries. Other pages, plain text, `--json`, pipes and NO_COLOR unchanged.
- `test/panel-decisions.test.mjs` (5 tests). 4 hand mutants (split ignores brackets, older entries shown whole, trailing «;» kept, unclosed group not an entry): all red, source restored byte for byte.
- Files: `panel.mjs`, one new test, the status file, this CHANGELOG, `package.json` version.
- NOT run: whole `npm test` (see the round close below if it was), Node 18 and 20, `npm run smoke`, CI, macOS, `npm run mutants`, a real terminal (colours and height unseen).

## Round 227 — reply format for open decisions (v0.0.230)

- Task (Rodrigo: the text of the replies, especially the «Open decisions» part, should look better and be easier to read; the rest was fine). Docs only.
- Status file: new item 21 «Reply format: open decisions» (heading, one block per decision with `Suggestion:`, `Why:` and `Quick answer:`, one sentence when none is open, Rodrigo's own to-dos under `## What is left for you`, `---` to close). `CLAUDE.md` rule 6 points to it.
- Files: `CLAUDE.md`, the status file, this CHANGELOG, `package.json` version. No source, no test, nothing pinned touched.
- NOT run: `npm test` (whole), Node 18 and 20, `npm run smoke`, CI, macOS, `npm run mutants`; only `bump-round`, `check-build` and the delivery guards below.


## Round 226 — panel highlights corrected: blue and white LETTERS, not backgrounds (v0.0.229)

- Task (Rodrigo: round 225 was wrong; he wanted blue letters and white letters for the action keys at the bottom, not a blue background and a white background). Cause: Claude read «highlights» as background colours. Tests first (2 red: `panel.test.mjs`, `ui.test.mjs`), then the code.
- `ui.mjs`: `blueBg` and `whiteBg` removed; `blue` (`1;94`, bold bright blue) and `white` (`1;97`, bold bright white) added, both letter colours. `panel.mjs`: the active tab is `blue`, the footer keys (`←/→`, `Tab`, `r`, `q`) are `white`, labels stay dim, other tabs stay dim. The tests now also fail on any background code (40 to 47, 100 to 107) in the panel. Text unchanged; plain text, `--json`, pipes, CI and NO_COLOR unchanged.
- 4 hand mutants (blue to a background code, white to a background code, active tab dim, footer keys dim): all red, sources restored byte for byte.
- Files: `ui.mjs`, `panel.mjs`, `panel.test.mjs`, `ui.test.mjs`, this CHANGELOG, the status file, `package.json` version. Neither source is one of the five pinned files, so the pin did not move.
- NOT run: Claude never ran the panel on a real terminal (injected streams only: the blue and the white are Rodrigo's to see; if `94` is too light or `97` shows wrong, `34` and `37` are the fallbacks), whole `npm test`, `npm run smoke`, Node 18 and 20, macOS, Windows, CI.

## Round 225 — panel highlights: blue active tab, white footer keys (v0.0.228)

- Task (Rodrigo ran the round 224 panel on a real terminal: «the blue highlights do not show, nor the white highlights of the actions at the bottom»). Cause: the panel painted only bold and dim; no background colour existed in `ui.mjs`, so there was nothing for the terminal to show (not a terminal fault). Tests first (2 red: `panel.test.mjs`, `ui.test.mjs`), then the code.
- `ui.mjs`: two styles, `blueBg` (bold bright white on blue, `1;97;44`) and `whiteBg` (black on white, `30;47`). `panel.mjs`: the active tab is `blueBg`, the other tabs stay dim; in the footer each key (`←/→`, `Tab`, `r`, `q`) is `whiteBg` and its label stays dim. The text is the same with or without colour; plain text, `--json`, pipes, CI and NO_COLOR unchanged.
- 6 hand mutants (active tab back to bold, footer keys dim, code 44 to 46, code 47 to 43, every tab blue, footer wording): 1 survived the first test (wording compared only with itself) and was killed by asserting the exact footer text; all red now, sources restored byte for byte.
- Files: `ui.mjs`, `panel.mjs`, `panel.test.mjs` (+1), `ui.test.mjs` (+1), this CHANGELOG, the status file, `package.json` version. Neither source is one of the five pinned files, so the pin did not move.
- NOT run: Claude never ran the panel on a real terminal (injected streams only: the blue and the white are Rodrigo's to see; if `97` shows wrong on his terminal, `37` is the fallback), `npm run smoke`, Node 18 and 20, macOS, Windows, CI.

## Round 224 — panel polish: alternate screen, coloured gates, labelled Status page (v0.0.227)

- Task (Rodrigo: «let's polish the panel now»; two complaints: the colours cannot be checked without the kit installed, and every page switch stays in the terminal's scrollback, even after `q`). Tests first (5 red: 4 in `panel.test.mjs`, 1 in `ui.test.mjs`), then the code.
- `panel.mjs`: runs in the alternate screen (`ESC[?1049h` before the first draw, `ESC[?1049l` with the cursor back on `q`, Ctrl-C and end of input), so pages never reach the scrollback and the old screen returns. Gate states are painted by their first word (CLOSED/done green, open/proposed/waiting yellow, red/failed/blocked red; other wording stays plain). Status page: labelled fields (File, Version, Round, Updated, Gates count, Latest) with long text wrapped under the text, raw fallback when a line does not match; Delivery page has a «Zip» label.
- `ui.mjs`: `box` cuts a too-long painted line on its visible text (it counted escape codes before, which would have broken colour rows near the edge); a line that fits keeps its codes.
- 7 hand mutants (alternate screen in and out, gate paint, tone, label wrap, `box` fit and cut), 2 survived the first tests and were killed by tightening them; all red now, sources restored byte for byte.
- Files: `panel.mjs`, `ui.mjs`, `panel.test.mjs` (+4), `ui.test.mjs` (+1), this CHANGELOG, the status file, `package.json` version. Plain text, `--json`, pipes, CI and NO_COLOR unchanged; neither source is one of the five pinned files, so the pin did not move.
- NOT run: Claude never ran the panel on a real terminal (only injected streams: colours and the alternate screen are Rodrigo's to see), `npm test` whole, `npm run smoke`, Node 18 and 20, macOS, Windows, CI.

## Round 223 — G-C12 closed by Rodrigo, panel polish scheduled, docs only (v0.0.226)

- Task (Rodrigo ran the panel on a real terminal and said it works). His notes: no colour, and the Status page is plain text that looks like an eyesore. Claude read `panel.mjs` and `ui.mjs`: the panel paints only bold and dim; `ui.mjs` has red, green, yellow and cyan but only `styleSummary` (command summaries such as `bump-round --verify`) uses them. So both notes describe the code as written, not a regression. The checklist Claude gave in the reply wrongly said the panel's marks would be coloured.
- Decision (Rodrigo, 2026-10-21, «close G-C12 now, polish later»): G-C12 is CLOSED; the polish (labelled Status fields, coloured gate states, shorter text; `panel.mjs` and `ui.mjs`, tests first) is a later round, before the kit `0.1.0` version round or after the release, his choice. `panel.mjs` is not one of the five pinned files, so the pin would not move.
- Files: this CHANGELOG, the status file, `ROADMAP.md` (G-C12 row), `package.json` version. No source or test changed.
- NOT run: `npm test`, `npm run smoke`, the mutants, Node 18 and 20, macOS, Windows, CI (Rodrigo reported the round 222 tree green, tests and CI). The coloured marks of the command summaries on a terminal were not part of his check.

## Round 222 — recovered from emergency dump (rehearsal); G-C11 repeated and closed by Rodrigo, docs only (v0.0.225)

- Task (Rodrigo ran `/dump` on the round 221 tree with a simulated task in progress, sent the dump with «recovery mode», then the round 221 zip). Item 17 start line: the shell digest of `RECOVER/` matched the pin (`1afe9e3e…`) before anything ran; `recovery-report` ran with NO baseline zip (the baseline travelled in the dump); 228 files matched the dump's sha256; `check-manifest` and `check-build` passed in the recovered root. The dump had no top-level dot entry under `work/` (round 221 fix confirmed).
- Recovered from emergency dump: the only differences from the round 221 zip were the rehearsal leftovers, `docs/SIMULATION-dump-rehearsal.md` (new) and an unfinished «Release notes template (DRAFT, simulation)» tail of `docs/release.md`. Both are dropped: `release.md` is byte-identical to round 221, the simulation file is not carried (it was never in a delivery, so no `--allow-removed`). Nothing real was lost or half-finished.
- G-C11 repeated on the round 221 tree; Rodrigo said «close g-c11» (2026-10-21), recorded in the gate row. Not verified by Claude beyond the checks above.
- Files: this CHANGELOG, the status file, `package.json` version. No source or test changed, the pin did not move.
- NOT run: whole `npm test` (Rodrigo: no reason for it to catch anything new on an unchanged tree), `npm run smoke`, mutants, Node 18 and 20, macOS, Windows, CI.

## Round 221 — the dump no longer carries the home folder's credentials (v0.0.224)

- Task (Rodrigo ran `/dump` and recovery mode on the round 220 tree and found `work/.claude/remote/.oauth_token`, `.session_ingress_token`, `work/.pki/nssdb/*` and `work/.gitconfig` inside the zip, with «Held back: 0»; «temos que corrigir esta fuga antes do 0.1»). Cause: the skip list `HOME_NOISE` had four names (`.local`, `.config`, `.npmrc`, `.wget-hsts`) and the content detector does not know those token formats. Claude read neither the tokens nor any other secret file.
- Fix (a call made on delegation, to confirm): when `work/` is NOT the project root, every top-level entry of `work/` whose name starts with a dot stays out, in the three write paths (chicla-zip writer, external `zip`, `tar`), and is named in the report and `marker.homeSkipped`. Unchanged: only the top level, never when `work/` is the project root, a dot folder inside the project (`chicla/.claude`, `chicla/.github`) and `recovered*` stay in.
- Files: `packages/chicla-kit/src/emergency-dump.mjs` (`isHomeDot` replaces `HOME_NOISE`; the external paths list the dot names of `work/`). `test/emergency-home-dotfiles.test.mjs` (5, 3 red first, 3 hand mutants red: the predicate, the `zip` exclusions, the `tar` exclusions). `test/emergency-home-noise.test.mjs` unchanged and green (4). Status file item 17: the hand-run fallback `zip` command gets `-x '.*'`. The pin did not move (`emergency-dump.mjs` is not one of the 5 pinned files).
- The round 220 dump zip holds those tokens: treat them as exposed.
- NOT run here: Node 18 and 20, macOS, Windows, CI, the mutants, and `/dump` plus recovery on this tree (G-C11 must be done again, the dump changed). Whole `npm test` and `check-build` are reported in the reply.

## Round 220 — the CI of the round 219 tree read, all 12 jobs green, docs only (v0.0.223)

- Task (Rodrigo sent `logs_107247410567.zip`: «já veio tudo verde»; Claude read the logs, not only his word). 12 of 12 jobs with no `##[error]`: Ubuntu Node 18, 20, 22 each 1378 tests, 1376 pass, 0 fail, 2 skipped; macOS Node 18, 20, 22 each 1378, 1364 pass, 0 fail, 14 skipped; Windows Node 18, 20, 22 `chicla-zip` each 816 tests, 777 pass, 0 fail, 39 skipped, and `chicla-kit` 231 of 231; `bench` ratio 1.5x; `pack` and `pack-kit` built. So the Windows reds of rounds 217 to 219 are gone on all three Nodes, and Node 18 and 20 on Ubuntu and macOS are seen green for the first time since the round 210 hunk.
- Files: this CHANGELOG, the status file (G-C13 evidence), `docs/release.md` item 3 (CI part done). No source or test changed, the pin did not move. Gates stay Rodrigo's to mark.
- NOT run: `npm run smoke` is part of the Ubuntu and macOS jobs (not read in detail here), the mutants, `/dump` and recovery, the checks outside CI. Whole `npm test` is reported in the reply.

