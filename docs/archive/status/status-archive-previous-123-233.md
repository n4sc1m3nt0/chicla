# Status file archive — «Previous» blocks of rounds 123-233

Moved out of `CHICLA_PROJECT_STATUS-242.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/status-archive-previous-*.md`.

**Previous (round 233):** 2026-10-22. Rodrigo asked for three fixes: `check-manifest --root <missing>` is now `EMANIFEST_ROOT` instead of ENOENT; `recovery` without `--out` uses `/home/claude/recovered` only where `/home/claude` exists, else `<temp>/chicla-recovered` (`defaultRecoveryOut`); `bump-round --verify` fails on CRLF in `CLAUDE.md`. `robustness-r233.test.mjs` (8, 7 red first); a pinned file changed, so the pin moved. Windows not seen on a real machine.

**Previous (round 232):** 2026-10-22. Rodrigo confirmed D-231a («sim») after Claude listed the open gates (only G-C8 and the exFAT/FAT part of G-C3 are open) and five stale spots in ROADMAP §9: G-C13 titled closed but `open`, G-C6 still future, G-C3 with no state, G-C9 with no row, cards C5.5 and C13.4 still plain «gate». All five corrected, no gate changed state; `test/roadmap-gates.test.mjs` (4, red first, 5 hand mutants red) keeps §9 and this table in step. Docs and one test, the pin did not move.

**Previous (round 231):** 2026-10-22. Rodrigo closed G-C4, G-C9, G-C10 (he compared the `chicla-zip` sums), G-C13 and G-C15 by his word; for G-C15 Claude read the vendors' own pages (Claude Code, Codex, Gemini CLI, Copilot: the four entries are right; Cursor and Windsurf read `AGENTS.md`, so no entry; Cline and Antigravity not checked). Docs, comments and one test only (`agents.mjs` header, kit README, `ROADMAP.md`, `test/release-docs.test.mjs`); no logic, the pin did not move. Open gates: G-C8 (a real Windows machine) and G-C3's exFAT part, both optional for what is published.

**Previous (round 230):** 2026-10-22. Rodrigo published `chicla-zip` 0.1.0 and `chicla-kit` 0.1.0 (tags, GitHub releases, npm) and closed G-C6; Claude checked his pasted `npm view`, sha256, tag and release output (the `chicla-zip` sha256 comparison was not seen). Docs and one test only: the root, `chicla-zip` and `chicla-kit` READMEs and `SECURITY.md` no longer say «pre-release» or «not published», `docs/release.md` says `npm publish ./dist/x.tgz` (npm refused `dist/x.tgz` with `EALLOWGIT`) and records the publication; the root README still said the kit was `0.0.0` after round 229 (found and fixed). No source, the pin did not move.

**Previous (round 229):** 2026-10-21. Rodrigo said the kit is ready (CI 12 of 12 green on the round 228 tree after `git rm` of the old status file, and his own `npm test`, `npm run smoke` and the mutants green): `packages/chicla-kit/package.json` is `0.1.0`, the kit README says «pre-release `0.1.0`, ready to release, not published yet», `docs/release.md` says so, and two tests that pinned `0.0.0` (`test/layout.test.mjs`, `cli-check-manifest.test.mjs`) now pin `0.1.0` (red first); no source, the pin did not move. Left to Rodrigo: the publish steps of `docs/release.md` (zip first, then the kit) and G-C6.

**Previous (round 228):** 2026-10-21. The Decisions page of the panel (`node packages/chicla-kit/src/cli.mjs`) was one 40-line paragraph; it now has a heading, the newest round in full, older rounds cut to one line each and «Rodrigo's to do» as a bulleted list (`panel.mjs`, `test/panel-decisions.test.mjs`; tests first, 4 hand mutants red). Claude read Rodrigo's repeated request as the panel and not the reply layout of round 227 (which stays); not seen on a real terminal, he checks the look himself.

**Previous (round 227):** 2026-10-21. Docs only (Rodrigo: the «Open decisions» part of the replies should be prettier and easier to read, the rest was fine): new item 21 in the Instructions and a pointer in `CLAUDE.md` rule 6 fix the layout (one block per decision, Suggestion, Why, Quick answer; Rodrigo's own to-dos under their own heading). No code, no test, no gate changed; Claude has not seen how it reads in a real reply beyond the example shown in chat.

**Previous (round 226):** 2026-10-21. Panel highlights corrected (Rodrigo: round 225 painted backgrounds, he wanted letters): the active tab is bold blue letters and each footer key bold white letters (`ui.mjs` `blue` and `white`, `panel.mjs`); tests first, 4 hand mutants, the pin did not move. Not seen by Claude on a real terminal: Rodrigo checks the colours himself.

**Previous (round 225):** 2026-10-21. Panel highlights (Rodrigo ran the round 224 panel: no blue highlight, no white highlight on the footer actions): the active tab is now white on blue and each footer key black on white (`ui.mjs` `blueBg` and `whiteBg`, `panel.mjs`); tests first, 6 hand mutants, the pin did not move. Not seen by Claude on a real terminal: Rodrigo checks the colours himself.

**Previous (round 224):** 2026-10-21. Panel polish (Rodrigo: «let's polish the panel now»): the panel runs in the alternate screen (no scrollback), gate states are coloured and the Status page has labelled fields; tests first, 7 hand mutants, the pin did not move. Not seen by Claude on a real terminal: Rodrigo looks at the colours and the scrollback himself.

**Previous (round 223):** 2026-10-21. Docs only: Rodrigo ran the panel on a real terminal (works; no colour, plain Status page) and closed G-C12; the polish is scheduled as a later round, his choice. Left to the tag: the `0.1.0` publish steps, the kit version round when he says so.

**Previous (round 222):** 2026-10-21. Docs only: Rodrigo's second `/dump` and «recovery mode» (a rehearsal) recovered cleanly from the dump alone, with no baseline zip, and the dump has no dot entries of `work/`; G-C11 is closed by Rodrigo's word. Left to the tag: his local checks, the kit version round when he says so.

**Previous (round 221):** 2026-10-21. Rodrigo's `/dump` showed the session tokens, `.pki` and `.gitconfig` inside the zip; the dump now skips every top-level dot entry of `work/` (three write paths, `test/emergency-home-dotfiles.test.mjs`, 3 hand mutants red), the pin did not move. Left to the tag: G-C11 again (the dump changed), his local checks, the kit version round when he says so.

**Previous (round 220):** 2026-10-21. Rodrigo sent the CI of the round 219 tree and Claude read it: 12 of 12 jobs green (Windows 0 red on Node 18, 20 and 22; Ubuntu and macOS 0 red on all three); docs only, the pin did not move. Left to the tag: his local checks, `/dump` and recovery, the kit version round when he says so.

**Previous (round 219):** 2026-10-21. `zip64-locator-fit.test.mjs` closes its `openZip` handle (the last Windows red); test only, the pin did not move.

**Previous (round 218):** 2026-10-21. 98 cleanups in 80 test files now retry and `cli-stdout-error.test.mjs` uses `fileURLToPath`; tests only, the pin did not move.

**Previous (round 217):** 2026-10-21. The two Windows reds of the round 216 CI (`read-duplicate` path, `zip64-locator-fit` cleanup) fixed in the tests; the pin did not move.

**Previous (round 216):** 2026-10-21. Rodrigo said «fecha o g-c5»: recorded as CLOSED by Rodrigo; docs only, the pin did not move.

**Previous (round 215):** 2026-10-21. `docs/release.md` and the `chicla-zip` README list ZIP-025 and ZIP-026 with the other known limits; docs only, the pin did not move.

**Previous (round 214):** 2026-10-21. Two mutants (`AUDIT-1-V2`, `M2-coll-files`) had anchors stale since ZIP-022; `mutants/list.mjs` only, both RED one at a time, whole `npm test` green; the pin did not move.

**Previous (round 213):** 2026-10-21. The sixth review verified: no bypass of ZIP-022; ZIP-024 test updated, ZIP-025 and ZIP-026 documented; docs and one test, the pin did not move.

**Previous (round 212):** 2026-10-20. Preparing the package for the sixth review, Claude found that its own round 211 text was wrong about the `chicla-zip` version; `docs/release.md` is corrected, docs only, the pin did not move.

**Previous (round 208):** 2026-10-20. Rodrigo said «avança»: C15.25 done, ZIP-019 closed. `readCentral` refuses a zip64 record that does not end where its locator starts; tests first (5 red), mutants `R208-*` 5 RED; the pin moved. G-C5 stays open (C15.26, then the narrow review C15.27).

**Previous (round 207):** 2026-10-20. Rodrigo said «avança»: C15.24 done, ZIP-020 closed. A folder is decided by the name only; a folder-mode entry without a slash is a file for `read` (EAMBIGUOUS on a duplicate) and extraction refuses it; tests first (3 red), mutants `R207-*` 3 RED; the pin moved. G-C5 stays open (C15.25, C15.26, then the narrow review C15.27).

**Previous (round 206):** 2026-10-20. Rodrigo sent `chicla-zip-security-review-4.md` (round 205 tree): ZIP-020 reproduced by Claude, ZIP-019 and ZIP-021 read; D136 confirmed (fix ZIP-020 and ZIP-019, docs for ZIP-021, a fifth narrow review); docs only, the pin did not move. G-C5 stays open.

**Previous (round 205):** 2026-10-20. Rodrigo said «avança»: C15.22 done, ZIP-018 closed. `C5.3b-A13` and `C5.1-central-bounds` survive with a reason, the mutant count is read by a test, docs say twelve CI jobs and 7-Zip 25.01 on Linux; the pin did not move. Next: the narrow review C15.23, then `/dump` (G-C11).

**Previous (round 204):** 2026-10-20. Rodrigo said «avança»: C15.21 done, ZIP-017 documented in `docs/zip-handling.md` §3.2 and `SECURITY.md` and pinned by one test; docs and tests only, so the pin did not move. G-C5 stays open (C15.22, then the narrow review C15.23).

**Previous (round 203):** 2026-10-20. Rodrigo said «avança»: C15.20 done, ZIP-016 closed. The CLI ends any stdout error other than a closed pipe with exit 1 and one short line, not a stack trace; tests first (4 red), mutants `R203-*` 4 RED and 1 explained; the pin moved. G-C5 stays open (C15.21, C15.22, then the narrow review C15.23).

**Previous (round 202):** 2026-10-20. Rodrigo said «avança»: C15.19 done, ZIP-014 closed. `read` (so `readZipFile` and `cat`) refuses a name that matches more than one file entry (`EAMBIGUOUS`); tests first (3 red), mutants `R202-*` all RED; the pin moved. G-C5 stays open (C15.20 to C15.22, then the narrow review C15.23).

**Previous (round 201):** 2026-10-20. Rodrigo said «avança» (D135 confirmed): C15.18 done, ZIP-015 closed. `readCentral` refuses any end record after the chosen one (`EAMBIGUOUS`, no exception); tests first (10 red), mutants `R200-*` all RED; the pin moved. G-C5 stays open (C15.19 to C15.22, then the narrow review C15.23).

**Previous (round 200):** 2026-10-20. Rodrigo sent the third security report (`chicla-zip-security-review-3.md`); Claude reproduced ZIP-014, ZIP-015 (both PoCs) and ZIP-016 on the round 199 tree: ZIP-015 (a trailing end record that Python and `unzip` take and Chicla ignores) is blocking, so G-C5 stays open; D135 and the cards C15.18 to C15.23 are in the ROADMAP; Rodrigo confirmed D135 as suggested the same day. Docs only, the pin did not move.

**Previous (round 199):** 2026-10-19. Rodrigo sent the CI logs of the round 198 tree (`logs_106470803225.zip`, 12 jobs) and said «tudo verde. avança»: 0 fail on every job, so the 5 test fixes of round 198 are confirmed on macOS and Windows; this round only records it (docs only, no source, the pin did not move). The next step, C15.16, is the third review on the final tree, which Rodrigo gives to the reviewer.

**Previous (round 198):** 2026-10-19. Rodrigo sent the CI logs of the round 197 tree and said «confirmo. avança»: the 5 red tests (4 macOS: `/var` vs `/private/var`; 1 Windows: `\r\n` from Python) were test bugs and are fixed in 3 test files, no source changed, the pin did not move. The fixes are unseen on macOS and Windows until the next push (CI logs).

**Previous (round 197):** 2026-10-19. Rodrigo said «avança» (the «Next up» slice c of C15.14, no open decision): `SECURITY.md` and `docs/zip-handling.md` (§3 and §7) now say the merge looks at the target again before each move (`EEXIST`, undone), that this narrows the window and does not close it, with `concurrency-docs.test.mjs` +2 (red first); no source changed, the pin did not move, C15.14 is closed.

**Previous (round 196):** 2026-10-19. Rodrigo said «avança» (the «Next up» slice b of C15.14, no open decision): 6 mutants `R195-*` of the re-check in `mergeMove` were added to `mutants/list.mjs` and all 6 are RED one at a time; no source and no test changed, the pin did not move. Slice c (docs sentence) is open.

**Previous (round 195):** 2026-10-19. Rodrigo said «avança» and asked for the «Next up» card to be cut into slices (earlier accounts hit their limits): C15.14 slice a was built, `mergeMove` looks at the target again before each move (`EEXIST`, undo), `merge-recheck.test.mjs` (5, 3 red first). Slices b (mutants) and c (docs) are open; THE PIN MOVED, so G-C11 is due again.

**Previous (round 194):** 2026-10-19. Rodrigo said «avança» (the «Next up» card, no open decision) and C15.13 was done, docs and tests only: `SECURITY.md` and `docs/zip-handling.md` say `createZip` and the merge of `extractZip` are not safe against a concurrent writer, and `concurrent-writer.test.mjs` (8) pins ZIP-003 and ZIP-004 through the hooks as a known limit; `concurrency-docs.test.mjs` (4, red first) guards the texts. No source changed, the pin did not move.

**Previous (round 193):** 2026-10-19. Rodrigo said «avança» (the «Next up» card, no open decision) and C15.11 was built: `extractZip` keeps the temp folder `0700` through the rename and applies `0777 & ~umask` to a new destination afterwards; `extract-tmp-mode.test.mjs` (5, 3 red first), mutants `R193-*` (4) red. THE PIN MOVED (`zipkit.mjs`), so G-C11 is due again.

**Previous (round 192):** 2026-10-19. Rodrigo said «avança» (the «Next up» card, no open decision) and C15.9 was built: `checkLayout` reads each entry's local name and extra lengths (one 30-byte read) so an entry hidden in another's local extra field is `EOVERLAP`; `overlap-local-extra.test.mjs` (9, 5 red first), mutants `R192-*` (6) red. THE PIN MOVED (`zipkit.mjs`), so G-C11 is due again.

**Previous (round 191):** 2026-10-19. Rodrigo said «avança» (the «Next up» card, no open decision) and C15.10 was built: `writeZip` and `writeZipStream` refuse (`EUNSAFE`, nothing written) a path that is a file and also a folder or the parent of another path; `write-path-conflict.test.mjs` (20, 16 red first), mutants `R191-*` (5) red. THE PIN MOVED (`zipkit.mjs`), so G-C11 is due again.

**Previous (round 190):** 2026-10-19. Rodrigo said «avança» (the «Next up» card, no open decision) and C15.12 was built, tests and `mutants/list.mjs` only: a `touch -r` test (exact mtime, only the ctime differs) makes `M3c-same-ctime` RED and its wrong `survives` is gone; `M3c-same-ino`, U11 and U14 are measured or traced and kept as `survives` with the reason. No source changed, the pin did not move.

**Previous (round 189):** 2026-10-19. Rodrigo said «avança» (the «Next up» card, no open decision) and C15.17 was built: a record after the chosen one whose size leads to a central header is `EAMBIGUOUS`, one before it (a stored zip in an entry) is still ignored; `trailing-size-fake.test.mjs` (6, 2 red first), 4 mutants `R189-*` red. THE PIN MOVED (`zipkit.mjs`), so G-C11 is due again.

**Previous (round 188):** 2026-10-19. Rodrigo said «avança» (the «Next up» suggestion, no open decision) and C15.8 was built: the central directory must end exactly where its end record starts (ZIP-008, `EZIP`) and the counted entries must use all of it (ZIP-007, `EZIP`); `layout-report2.test.mjs` (13, 8 red first), 8 mutants `R188-*` red. THE PIN MOVED (`zipkit.mjs`), so G-C11 is due again.

**Previous (round 187):** 2026-10-19. Rodrigo confirmed D133 and D134 («confirmo tudo. avança») and C15.7 was built: `readCentral` refuses a trailing fake end record (ZIP-005), a zip64 locator with disagreeing plain fields (ZIP-006) and reads 65 535 entries (ZIP-009); `eocd-report2.test.mjs` (11, 4 red first), 9 mutants `R187-*` red; C15.17 added (a trailing fake found by size, not in the report). THE PIN MOVED (`zipkit.mjs`), so G-C11 is due again.

**Previous (round 186):** 2026-10-19. Rodrigo asked to verify the second security report and add the fixes needed to close the project to the roadmap: Claude reran the deterministic PoCs (ZIP-005 to ZIP-012, the hook PoCs of ZIP-003 and ZIP-004, ZIP-013) on the round 185 tree and all behave as reported, then added D133, D134 and cards C15.7 to C15.16 to M15; no source changed, the pin did not move. Open for Rodrigo: D133 and D134.

**Previous (round 185):** 2026-10-18. The kit's `src/.gitkeep` and `templates/.gitkeep` were deleted on purpose (named with `--allow-removed`), and `packaging.test.mjs` +1 proves the tarball carries no placeholder file. Rodrigo asked Claude not to run `npm test` or `npm run smoke`: both are his to run on this tree.

**Previous (round 184):** 2026-10-18. Docs only: `docs/release.md` has the runbook for `chicla-kit` 0.1.0 (zip first, tag, tarball, checks, npm by Rodrigo), rehearsed on a scratch folder, with `release-docs.test.mjs` +2 and 8 hand mutants red. Rodrigo asked Claude not to run `npm test` or `npm run smoke`: both are his to run on this tree.

**Previous (round 183):** 2026-10-18. C11.3 done (D132, calls on delegation): `chicla update` compares the instruction files with the kit's templates, shows a diff and replaces a file only when `--apply <file>` names it, refreshing the manifest and fingerprint and rolling back on failure; `update.test.mjs` (16, 11 hand mutants red). Rodrigo asked Claude not to run `npm test` or `npm run smoke`: both are his to run on this tree.

**Previous (round 182):** 2026-10-18. C10.6 done (D131 confirmed): the `chicla init` status template orders `## Instructions` before `**Current version:**` and its item 1 holds the cold-start command, which `test/template-cold-start.test.mjs` (4, 7 hand mutants red) runs on the template. Rodrigo asked Claude not to run `npm test` or `npm run smoke`: both are his to run on this tree.

**Previous (round 181):** 2026-10-18. C10.5 done: `docs/state-file.md` specifies the status file and `bump-round` now refuses a bump or refresh of one that lacks a required part or has them out of order (`EBUMP_STATUS`, one source file, 17 tests, 17 hand mutants red). The template of `chicla init` orders its parts differently from this project (found, not fixed): D131 proposes C10.6.

**Previous (round 180):** 2026-10-18. C10.4 done: `docs/fingerprint.md` specifies the fingerprint and `test/fingerprint-docs.test.mjs` (10 tests, 13 hand mutants red) fails when the doc and `bump-round` disagree; D130 records the order of work to the npm release; Rodrigo's own `npm test` on his Mac for the round 179 tree (pasted, not run by Claude) was 1189 tests, 1180 pass, 0 fail, 9 skipped.

**Previous (round 179):** 2026-10-18. D129: the tar fallback of the dump runs `tar` with `COPYFILE_DISABLE=1` (no macOS AppleDouble members); 2 tests and 3 hand mutants red; the pin did not move (`54bb5cb14b80`); the Mac proof is his next `npm test`.

**Previous (round 178):** 2026-10-18. Tests only: the last 4 Mac reds (time-zone child painted by `FORCE_COLOR`, AppleDouble `._` names in the tar dump) fixed in the tests; his next full `npm test` is the proof.

**Previous (round 177):** 2026-10-18. Tests only: the 3 tar-path reds on his Mac were AppleDouble `._RECOVERY_MARKER.json` members picked by an `endswith` lookup, fixed in the two tests; the time-zone red is not reproduced (green alone on the Mac).

**Previous (round 176):** 2026-10-18. Tests only: the 4 Mac-only reds now print the stderr of the Python reader and of the time-zone child; the cause is still unknown and waits for his run on the Mac.

**Previous (round 175):** 2026-10-17. The Mac `npm test` of round 174 (Node 26.10, 13 red): 9 red were npm 12 printing `pack --json` as an object, fixed in `pack-release.mjs` and 3 tests; 4 red (time-zone test, three tar dumps) are Mac-only and open, waiting for stderr from Rodrigo.

**Previous (round 174):** 2026-10-17. C15.6 done: `MAX_CENTRAL` is 64 MiB with its own code `ECENTRAL`, boundary test and 6 mutants red; D128 taken as confirmed by «avança». THE PIN MOVED (502a8b55a37e → 54bb5cb14b80: `zipkit.mjs` is one of the 5 files in `RECOVER/`), so G-C11 (`/dump` and «recovery mode» on the new pin) is due again; G-C5 stays open for Rodrigo.

**Previous (round 173):** 2026-10-17. C15.4 done: the central directory memory is measured and documented, no source changed; D127 confirmed, D128 proposed. The pin did not move.

**Previous (round 169):** 2026-10-17. CI log (round 168 code): only `windows (18)` red, one fuzz cleanup `ENOTEMPTY` in the test itself, now retried; the five macOS-only mutant survivors are marked `onlyOn: ["linux"]` and the INVALID `M4-max-bytes-passed` is fixed; the Windows fix and the macOS run are Rodrigo's to confirm. The pin did not move.

**Previous (round 168):** 2026-10-17. Docs only: the whole `npm test` (1150 tests, 1149 pass, 0 fail, 1 skipped) and `npm run smoke` (all green) were run on the round 167 tree, Node 22, so the new tests of rounds 166 and 167 are seen green; mutants, CI, Node 18 and 20, macOS and Windows are still Rodrigo's. No source changed, the pin did not move.

**Previous (round 167):** 2026-10-17. C12.5 and C12.6 built («avança» = the «Next up» suggestion): `chicla init --agent gemini|copilot` adds `GEMINI.md` or `.github/copilot-instructions.md` (templates share the body of `AGENTS.md`), `agents.mjs` is the matrix; the new tests were seen red once and NEVER green, because Rodrigo asked for no test runs, so everything is untested here. The pin did not move.

**Previous (round 166):** 2026-10-17. C13.5 built on the «Next up» suggestion (Rodrigo confirmed every decision in advance): the kit loads `chicla-zip` by package name through `zipkit-loader.mjs`, falls back to the monorepo path, has `dependencies`, `files`, `repository`, `LICENSE` and a `pack-kit` CI job; the pin did not move. The whole `npm test` is Rodrigo's to run.

**Previous (round 165):** 2026-10-16. C12.7 built (the loose end Rodrigo asked to tie): `chicla init` now also generates `CHICLA_PROJECT_STATUS-1.md`, `CHANGELOG.md`, `version.mjs` and `FILES.manifest`, with the fingerprint consistent from the start: a fresh project passes `bump-round --verify` and `check-manifest` and closes a round. Two source files changed (`init.mjs`, `cli.mjs` help text); the pin did not move.

**Previous (round 164):** 2026-10-16. C12.1 built: `chicla init` writes `CLAUDE.md` and `AGENTS.md` and never overwrites. D116 (one tag per package) and D118 (`C5.3b-A15` accepted as equivalent) are confirmed by Rodrigo; the stale `zip-handling.md` §7 and the old project name in the tests are fixed; a test now fails if a mutant anchor goes stale. Rodrigo decided that nothing is published until both packages are ready, and that he runs the mutants himself. Two source files changed (`init.mjs` new, `cli.mjs`), the pin did not move.

**Previous (round 163):** 2026-10-16. Eighteenth CI log read: all green (round 162 code, Windows 0 red on Node 18, 20, 22). Release prep on Rodrigo's word: `chicla-zip` is `0.1.0` in the tree (not published), SECURITY.md, CONTRIBUTING.md, the `chicla-kit` README and the G-C6 runbook `docs/release.md` are written, Cedar is out of the ROADMAP (D117), G-C7 and G-C11 are recorded as closed by Rodrigo; no source file changed, the pin did not move.

**Previous (round 162):** 2026-10-16. Seventeenth CI log read: all green (round 161 code, the `windows` job blocking, Windows 0 red on Node 18, 20, 22). D102 built: `verify-delivery` prints one `git rm` line for the files that left the zip compared with the previous one (`gitRmLine` in `verify-delivery.mjs` only), 10 new tests, 11 hand mutants red; the pin did not move.

**Previous (round 161):** 2026-10-16. Sixteenth CI log read: all green again (Windows 0 red on Node 18, 20, 22; `chicla-zip` 630 pass, `chicla-kit` 169 pass), so the condition of D115 is met; D115 built: `continue-on-error` removed from the `windows` job in `ci.yml` (a red on Windows now turns the run red), 7 hand mutants red; no source, the pin did not move.

**Previous (round 160):** 2026-10-16. Docs only: D114 and D115 confirmed by Rodrigo («d114 sim, d115 sim») and recorded in the ROADMAP; no source, no test, the pin did not move.

**Previous (round 159):** 2026-10-16. Fifteenth CI log read: everything green, Windows 0 red on Node 18, 20, 22 (`chicla-zip` 630 pass, `chicla-kit` 169 of 169), so C14.7 is closed; C14.5 slice (b) written (the support statement for `chicla-zip` only, both READMEs and ROADMAP, C11.4 closed as never built), docs only, the pin did not move; D114 on delegation, D115 proposed.

**Previous (round 158):** 2026-10-16. Fourteenth CI log read: `chicla-zip` 0 red on Windows (all Nodes), `chicla-kit` 4 red of 165 (was 27); the 4 are one cause (`split("/").pop()` on a path), fixed with `leaf` in `pinned/manifest.mjs` at five places, one of them the RECOVER toolchain-digest check that Windows skipped; 7 hand mutants red; THE PIN MOVED.

**Previous (round 157):** 2026-10-16. Thirteenth CI log read: `chicla-kit` on Windows 27 red of 157 (was 34 of 145; D112 fixed 14); C14.7 slice 1: `relPosix` in the dump core and `findPython` for four kit tests (9 hand mutants red, kit 165/165 on Linux); `chicla-zip` Node 18 Windows had one `EPERM` flake in `fuzz-read` (observation, no change).

**Previous (round 156):** 2026-10-15. Twelfth CI log read (round 155 code): `chicla-zip` 0 red on Windows, `chicla-kit` 34 red of 145 (15 CRLF, 19 dump and recovery); D112 done (`.gitattributes`, tested with real git), D113 confirmed, card C14.7 opened; no source changed, the pin did not move.

**Previous (round 155):** 2026-10-15. C14.6: the `windows` job runs the `chicla-kit` suite as a second step (`ci.yml` only, informative, 3 guard tests, 5 YAML mutants red); D111 confirmed; no source changed, the pin did not move; not yet seen running on GitHub.

**Previous (round 154):** 2026-10-15. C14.5 slice (a): `--windows-names` on `extract` and `create`, `warnings.windowsNames` and a text line in `test` (`zipkit.mjs` only, 12 new tests, 13 mutants red; D111 proposed); the pin moved. Eleventh CI log read: same as round 153, nothing new.

**Previous (round 153):** 2026-10-15. Tenth CI log read: everything green, Windows at 0 on Node 18, 20 and 22 (620 pass, 18 skipped); C14.3 closed (D106), the skip of test 128 explained and written (D107), C14.5 split in two and C14.6 opened (D108, D109), G-C11 at the end of C14.5 (D110). No source changed, the pin did not move.

**Previous (round 152):** 2026-10-15. Ninth CI log read: Ubuntu and macOS green, Windows Node 22 at 0, Node 20 at 1, Node 18 at 2; C14.3 slice d done (`EOF` handled like `EPIPE` in the CLI, test 156 skipped on Windows with a reason); the pin moved (G-C11 due).

**Previous (round 151):** 2026-10-15. Eighth CI log read: Ubuntu and macOS green, Windows Node 22 at 0, Node 20 at 11, Node 18 at 13; C14.3 slice b done (`rmBounded`, `rmQuiet`, `closedStream`: handles closed before the remove, bounded retries, the real error wins); D103 to D105 confirmed; the pin moved (G-C11 due).

**Previous (round 150):** 2026-10-15. Seventh CI log read: Ubuntu and macOS green, Windows 13/12/1; C14.3 slice a done (`openZip` of a directory gives EISDIR, the only Node 22 red); D100, D101, D102 confirmed; the pin moved (G-C11 due once more).

**Previous (round 149):** 2026-10-15. Sixth CI log read: Ubuntu and macOS green, Windows 27/38/41; the round 148 probe message showed the cause (the probe name did not fit the OEM code page) and that `unzip -t` exit 1 ends with «warning-error», both fixed blind. After pushing this round Rodrigo removes `CHICLA_PROJECT_STATUS-152.md` (the new file is `-153`).

**Previous (round 148):** 2026-10-15. Fifth CI log read: Ubuntu and macOS green, Windows 44/43/32; the `lossyNames` probe is still false on Windows for an unknown reason, so the probe now describes itself in failure messages and Windows counts as lossy by rule. After pushing this round Rodrigo removes `CHICLA_PROJECT_STATUS-151.md` (the new file is `-152`).

**Previous (round 147):** 2026-10-14. Fourth CI log read: no hang, Ubuntu and macOS red only from the stale `CHICLA_PROJECT_STATUS-149.md` on `main` (Rodrigo's `git rm`, and the same again for `-150` after this push); two Windows test causes fixed blind (`zipinfo` exit 1, second bin call).

**Previous (round 146):** 2026-10-14. The macOS Node 18 job stood still for 45 minutes (first test of `interop.test.mjs`, cause NOT found, not reproduced): every CI job now has `timeout-minutes`, readers have a timeout, and `pyZip` uses a file instead of stdin. Windows interop and package fixes written blind.

**Previous (round 145):** 2026-10-14. Second Windows log read (Ubuntu and macOS green, Windows 79/75/66 red) and the test-side causes fixed or skipped with a reason in 18 test files, no source change. What stays red is real: cleanup with open handles on Node 18/20 and `openZip` of a directory (C14.3).

**Previous (round 144):** 2026-10-14. `.idea/` added to `.gitignore` (Rodrigo's request); nothing else changed, the pin did not move.

**Previous (round 143):** 2026-10-14. First Windows CI logs read (G-C13 input): `createZip` `stream: true` called `fsync` on a read-only handle (EPERM on Windows), fixed with `"r+"`, plus two CI-only test fixes; D99 and the task confirmed by Rodrigo; the pin moved (G-C11 due again). `main` still holds the 3 shims and `.idea/` (Rodrigo's `git rm`), the POSIX-only Windows tests go to C14.3.

**Previous (round 142):** 2026-10-14. M14 C14.4: job `windows` in `ci.yml` (windows-latest, Node 18/20/22, the whole chicla-zip suite, readers checked first), informative (D99); never seen running, gate G-C13 proposed; D98 confirmed. No source changed, the pin did not move.

**Previous (round 141):** 2026-10-14. M14 C14.2: `windowsNames` on `extractZip`, `writeZip`, `writeZipStream` and `createZip` (default on only on win32); the functions moved into `zipkit.mjs`, `winnames.mjs` deleted (D97); D96 (3)-(6) and D97 confirmed, D98 proposed; the toolchain pin MOVED (zipkit.mjs is in `RECOVER/`), so G-C11 is due again.

**Previous (round 140):** 2026-10-14. M14 C14.1: `windowsNameProblems` in `packages/chicla-zip/src/winnames.mjs` (pure, not wired); D95 confirmed, D96 and D97 proposed; Windows line added to ROADMAP §12 and G-C4 (D62). G-C11 and G-C12 are still Rodrigo's.

**Previous (round 139):** 2026-10-14. C11.5 slice c: `panel.mjs` and `chicla` with no arguments on a terminal opens a read-only panel (status, gates, decisions, delivery); D95 and gate G-C12 proposed; G-C11 is still Rodrigo's.

**Previous (round 138):** 2026-10-14. C11.5 slice b: `styleSummary` in `ui.mjs` and the CLI uses it on an interactive terminal (marks only, plain everywhere else); D94 proposed, G-C11 is still Rodrigo's.

**Previous (round 137):** 2026-10-14. Docs only: the duplicated, truncated copy of the Instructions block and the stale «Current version v0.0.130» line are removed from this file; D93 recorded as confirmed. No code changed; G-C11 is still Rodrigo's.

**Previous (round 136):** 2026-10-14. C11.5 slice a: `ui.mjs` (pure drawing functions, tested, nothing calls it yet); D93 sets the three slices. G-C11 is still Rodrigo's.

**Previous (round 135):** 2026-10-14. C11.1 slice 7 (D92 (a)): `cli.mjs` imports every core from `packages/chicla-kit/src/` (recovery from `src/pinned/`); a copy of the kit with no `scripts/` runs. The pin did not move; G-C11 is still Rodrigo's; C11.1 has nothing left but D92 (b).

**Previous (round 134):** 2026-10-14. C11.1 slice 6c: the three re-export shims in `scripts/` are deleted (`--allow-removed` each) and the docs and comments name `packages/chicla-kit/src/pinned/`; the pin did not move. Gate G-C11 is still Rodrigo's; the kit still loads its cores through `scripts/` wrappers (new card proposed, D92).

**Previous (round 133):** 2026-10-13. C11.1 slice 6b: `recovery-report` moved into `packages/chicla-kit/src/pinned/` (only its zipkit fallback path changed) and `scripts/recovery-report.mjs` is a wrapper with its own entry point; the toolchain digest in `CLAUDE.md` moved once (`bump-round` wrote it). Gate G-C11 is now due (Rodrigo repeats `/dump` and recovery on the new layout); left: 6c.

**Previous (round 132):** 2026-10-13. C11.1 slice 6a-3: `policy` moved, byte-identical, to `packages/chicla-kit/src/pinned/policy.mjs` with a re-export shim in `scripts/policy.mjs`; the two `TOOLCHAIN` maps, the helper and the three cores that import it point at the new file, and the pin did not move. Slice 6a is done; left: 6b (`recovery-report`, the pin moves once), 6c.

**Previous (round 131):** 2026-10-13. C11.1 slice 6a-2: `manifest` moved, byte-identical, to `packages/chicla-kit/src/pinned/manifest.mjs` with a re-export shim in `scripts/manifest.mjs`; the two `TOOLCHAIN` maps, the helper and the four cores that import it point at the new file, and the pin did not move. Left: 6a-3 `policy`, 6b, 6c.

**Previous (round 130):** 2026-10-13. C11.1 slice 6a-1: `baseline` moved, byte-identical, to `packages/chicla-kit/src/pinned/baseline.mjs` with a re-export shim in `scripts/baseline.mjs`; the two `TOOLCHAIN` maps, the helper and the two cores that import it point at the new file, and the pin in `CLAUDE.md` did not move. Left: 6a-2 `manifest`, 6a-3 `policy`, 6b, 6c.

**Previous (round 129):** 2026-10-13. C11.1 slice 6a-0b: tests and smoke scripts only; 34 test files and 3 smoke scripts no longer name the path of a pinned file, a guard test keeps it so, no source and no pin change. Left: 6a-1 `baseline`, 6a-2 `manifest`, 6a-3 `policy`, 6b, 6c.

**Previous (round 128):** 2026-10-13. C11.1 slice 6a-0 part 1 (D91 confirmed: B, thin slices, G-C11 yes): tests only, `test/toolchain-files.mjs` is the one list of the recovery toolchain and 11 tests use it; no source, no pin change.

**Previous (round 127):** 2026-10-13. Docs only (D90 confirmed with «avança»): `docs/pinned-files-design.md` is the design note for moving `baseline`, `manifest`, `policy` and `recovery-report` into `packages/chicla-kit/src/pinned/` without moving the digest of `RECOVER/` until the last slice; no code. D91 and gate G-C11 proposed.

**Previous (round 126):** 2026-10-13. C11.1 slice 5f (D89 confirmed): the `emergency-dump` core is in `packages/chicla-kit/src/emergency-dump.mjs` and `scripts/emergency-dump.mjs` is a wrapper; 6 new tests, 9 hand mutants red (one survived first, the test was tightened); long commands ran in the background (item 20). D90 proposed.

**Previous (round 125):** 2026-10-13. C11.1 slice 5e: the `make-delivery` core moved into `src/`; 7 tests, 8 mutants red.

**Previous (round 124):** 2026-10-13. Docs only: item 20 «Long commands: never get stuck» (also in `CLAUDE.md`); `npm test` measured at ~4 min.

**Previous (round 123):** 2026-10-13. C11.1 slice 5d (D87 confirmed, both parts): the `verify-delivery` core is in `packages/chicla-kit/src/verify-delivery.mjs` and `scripts/verify-delivery-zip.mjs` is a wrapper; 7 new tests, 19 mutants red (one was green first, fixed); `npm test` 936 pass, 1 skipped, 0 fail, smoke ok; D88 proposed. Not run: Node 18/20, CI, macOS, `npm run mutants`.

