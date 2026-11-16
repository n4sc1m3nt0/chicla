<!-- CHANGELOG_FINGERPRINT: seq=352 file=CHICLA_PROJECT_STATUS-352.md app_sha256_12=065d37032ef1 changelog_sha256_12=43c1f8df92b1 (bump-round.mjs: app hash unchanged, changelog hash recomputed) -->
# Changelog

Archived rounds (nothing deleted): `docs/archive/changelog/CHANGELOG-archive-rounds-0-219.md`. References to older rounds elsewhere in the docs ("see CHANGELOG.md's Round N") live there now (moved from the root to `docs/archive/changelog/` in round 305)., `docs/archive/changelog/CHANGELOG-archive-rounds-220-230.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-231-241.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-242-253.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-254-263.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-264-275.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-276-286.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-287-297.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-298-309.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-310-321.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-322-333.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-334-334.md`

## Round 347 — C31.3: `chicla` 0.4.0 and its runbook (v0.0.351)

- Task (Rodrigo: «ajuda a fazer a release»): C31.3, the open card after M32. Source: none; `packages/chicla/package.json` (version) and docs.
- Change: `packages/chicla/package.json` 0.3.0 → 0.4.0; `docs/release.md` «Releasing chicla 0.4.0» under the `chicla release` section: what is new since 0.3.0 (`archive`, `doctor`, `git-plan`, `release`, the pin `15e4ef5d0602` → `375b6901b72d`), 36 files (32 before), the five steps with the differences; G-C19 opened in ROADMAP and the status file (Rodrigo's); G-C11 stays open and his.
- Local rebuild (`build-chicla`, `pack-release`, Linux, nothing published): 36 files, 166265 bytes, sha256 `939079907bbe…e708`; it is not the CI tarball.
- Tests: `test/release-040-docs.test.mjs` (5), red first; `chicla-single-package`, `retire-packages` and `release-030-docs` (4 red after the bump) now say 0.4.0.
- Rotations: `archive-changelog --status`, `--snapshot`, `--rolling` (keep 4, 9, 2).
- NOT run: `git`, `gh` or `npm` against anything real (no `release check`, `prepare` or `publish`; Rodrigo's); CI; Node 18 and 20; macOS and Windows.

## Round 346 — C32.4: the runbook and the READMEs for `chicla release` (v0.0.350)

- Task (Rodrigo: «ok», D173 CONFIRMED; Claude continued with C32.4): the last card of M32 (D167). Docs only; no source file changed.
- Change: `docs/release.md` opens with «Releasing with `chicla release`»: check, prepare, look (dry run), publish (in a terminal, by hand, never through `tee`), after, and the manual finish if `publish` stops; the three commands in `README.md`, `packages/chicla-kit/README.md` and `packages/chicla/README.md` (the page npm shows). The help already named them.
- Tests: `test/release-commands-docs.test.mjs` (3): 2 red first (the help test was already green); names and flags only.
- Run: `npm run smoke`: all green. The whole `npm test`: 2078 tests, 2076 pass, 0 fail, 2 skipped (844 s). Not run: the three commands against anything real (Rodrigo's).

## Round 345 — C32.3: `chicla release publish` (v0.0.349)

- Task (Rodrigo: «sim às três», D172 CONFIRMED; Claude continued with C32.3 as announced): C32.3 of M32 (D167). Two source files: `packages/chicla-kit/src/release.mjs` (`releasePublish`, `renderReleasePublish`, `runTool` takes `interactive`) and `cli.mjs` (`--from`, `--confirm`, the question, the terminal).
- Change: `chicla release publish --from <folder> [--confirm] [--json] [--root <dir>]`. Without `--confirm` a dry run: `files`, `sha256`, `release-check`, `notes-commit` and the plan, nothing that writes. With `--confirm`: a terminal on stdin and stdout, the version typed back exactly (both before any call), then `npm whoami`, `git tag -a`, `git push origin <tag>`, `gh release create`, `npm publish <absolute tarball> --access public` (interactive: npm asks for the two-factor code), `npm view`; it stops at the first failure and says which steps are `done`. D173.
- Tests: `packages/chicla-kit/test/release-publish.test.mjs` (20), red first (18 of 19 failed before the code; the usage-errors test was already green because `publish` was a usage error; the 20th, `runTool`, came after). A fake `run` and a fake terminal: NO real `git`, `gh`, `npm` or `chicla release publish` ran, nothing was tagged, released or published (rule 4 of `CLAUDE.md`).
- Mutants: `K-REL-35` to `55`, each run alone (`--only`, `--timeout 60`); the anchors of `K-REL-14`, `15`, `32` moved with the new subcommand and were updated.
- Docs: usage line and a row in the kit README; the runbook and the npm page are C32.4's.
- Rotation with `chicla archive`: «Previous» 339, «Done» 335, rolling 342 (nothing deleted).
- Run: `npm run smoke` all green; whole `npm test` after `bump-round`: 2075 tests, 2073 pass, 0 fail, 2 skipped, 820 s. `check-build` runs inside `make-delivery-zip`.
- NOT run: CI of this round, any real `git`, `gh`, `npm publish` or `chicla release publish`; Node 18, 20 and macOS locally; the whole `npm run mutants:kit`.

## Round 344 — C32.5: the manifest files that git does not know (v0.0.348)

- Task (Rodrigo: «ok», C32.5 first): C32.5 of M32 (D170). One source file: `packages/chicla-kit/src/check-manifest.mjs`.
- Change: in check mode, with a `.git` and a git that answers, `checkManifest` also runs `git ls-files -z --others --exclude-standard` and reports `notInGit`, `notInGitCommand` (ONE `git add -- …` line, cut at about 3000 characters) and `notInGitComplete`, and prints one note before the final ✓ line. A NOTE, never a failure; a file that is only modified is left to `git status` and `release check`. D172.
- Tests: `packages/chicla-kit/test/manifest-not-in-git.test.mjs` (10), red first (10 of 10 failed); each uses a real temporary git repository, never the project's. `K-CMN-35` to `41`, each run alone: 7 RED (the first whole `npm test` had 1 red test: my loop repeated the anchor of `K-CMN-30`; rephrased, and `41` covers my line).
- Docs: a sentence in the row of `chicla check-manifest` in the kit README; D172 and C32.5 done in the ROADMAP.
- Rotation with `chicla archive`: «Previous» 338, «Done» 334, rolling 341, CHANGELOG round 334 (the plain archive, not needed: 11 headings, the limit is 21).
- Whole `npm test` after the fix: see the reply (the number is not written here, to keep this entry true).
- NOT run: CI of this round, any real `git` on the project, `gh` or `npm publish`; Node 18, 20 and macOS locally; the whole `npm run mutants:kit`.

## Round 343 — D171: `npm run smoke` in every closing kit (v0.0.347)

- Task (Rodrigo: «tudo verde. aceito a sugestão»): the CI of the round 342 commit is green on every job; the suggestion of round 342 is accepted. Docs only.
- Change: item 13 of the status file now says «ALWAYS run `npm run smoke` too» (it said «if a script changed»); D171 in the ROADMAP.
- Rotation with `chicla archive`: «Previous» 337, «Done» 333, rolling 340, CHANGELOG rounds 322-333 (22 headings were over the limit of 21; the first whole `npm test` had 7 red tests for that).
- Run: `npm run smoke` all green; whole `npm test` after the archive and `bump-round`: 2045 tests, 2043 pass, 0 fail, 2 skipped, 711 s. `check-build` runs inside `make-delivery-zip`.
- NOT run: CI of this round, any real `git`, `gh` or `npm publish`; Node 18, 20 and macOS locally.

## Round 342 — the archive smoke fixed, CI logs of `257af74` (v0.0.346)

- Task (Rodrigo sent the CI logs): the 6 `test` jobs (Ubuntu, macOS) had 0 failing tests out of 2045 and one red step, `npm run smoke`: `scripts/smoke-test-archive-changelog.mjs`, check «the two paragraphs keep 9 and 8 plus one pointer each». The README problem of round 340 is gone.
- Cause: the smoke expected the old pointer `...rolling-6-7.md` in «Open decisions»; since C30.6 (D-P) the code writes ONE pointer to the glob `rolling-*.md` (code and `test/archive-rolling.test.mjs` agree). The smoke was red already in the round 339 zip: `npm run smoke` had not been run since then.
- Change: one line in the smoke (the expected pointer). No source file changed.
- Run: `npm run smoke` all green (6 smokes); whole `npm test` after `bump-round`: 2045 tests, 2043 pass, 0 fail, 2 skipped, 787 s. `check-build` runs inside `make-delivery-zip`.
- Mistake caught and undone: while reproducing, I ran `archive-changelog.mjs` twice without a copy (it takes the folder of the script as the root, not the current folder) and changed the working tree; both times I restored it from the round 341 zip and compared, byte for byte.
- Rotation with `chicla archive`: «Previous» 336, «Done» 332, rolling 339.
- NOT run: CI, any real `git`, `gh` or `npm publish`; Node 18, 20 and macOS locally.

## Round 341 — docs only: CI logs of `16a27b9`, D169 confirmed, D170 and C32.5 (v0.0.345)

- Task (Rodrigo: «ok avança» after reading the CI logs with Claude): record the answers; no code and no test changed.
- CI (logs zip, 14 jobs read with `chicla ci-report`): every test job red with the same 22 tests (Windows 20); `tarball`, `bench` and `pack-chicla` showed no failure. One cause: `4 LOST file(s) vs FILES.manifest` (`docs/archive/status/status-archive-done-327-327.md`, `...-previous-331-331.md`, `...-rolling-334-334.md`, `test/readme-commands.test.mjs`): in the zips, not in git (inferred from the logs; Claude did not see the repository).
- Recorded: D169 CONFIRMED («ok»); D170 (the guard as card C32.5; C32.3 after a green CI) CONFIRMED («ok avança»); C32.5 added to M32.
- Rotation with `chicla archive`: «Previous» 335, «Done» 331, rolling 338. The first whole `npm test` was red (7 tests: 6 «Previous» blocks and 11 «Done» lines, the rotation was forgotten); fixed, then the whole run below.
- Whole `npm test` after the fix and `bump-round`: 2045 tests, 2043 pass, 0 fail, 2 skipped, 806 s. `check-build` runs inside `make-delivery-zip`.
- NOT run: CI, any real `git`, `gh` or `npm` command; the C32.5 guard is not built.

## Round 340 — C32.2: `chicla release prepare` (v0.0.344)

- Task (Rodrigo: «avança»; no decision open = the task under «Next up»): C32.2 of M32 (D167). Two source files: `packages/chicla-kit/src/release.mjs` (`releasePrepare`, `renderReleasePrepare`) and `cli.mjs` (`--run`, `--out`, the dispatch).
- Change: `chicla release prepare --run <id> [--out <dir>] [--json] [--root <dir>]` takes the CI tarball of a run into a NEW folder (default `dist-<version>`), then five checks in order, stopping at the first failure: `run-is-head`, `download`, `sha256`, `tarball-smoke` (`node scripts/smoke-test-tarball.mjs --tarball <file> --json`), `notes` (written only when the four before passed). It publishes and tags nothing; `git`, `gh` and `node` run through the same replaceable `run` as C32.1 (`runTool` now takes a `timeout`; the smoke gets 600 s).
- Tests: `packages/chicla-kit/test/release-prepare.test.mjs` (16), red first (15 failed, the module had no `releasePrepare`; the 16th, the usage errors, was already green because `prepare` was a usage error). Every test uses a fake: NO real `git`, `gh`, `npm` or smoke command ran for this round, and no real tarball was downloaded.
- Mutants: `K-REL-16` to `34`, each run alone (`--only`, `--timeout 60`): 19 RED. The two entries of C32.1 whose anchors moved (`14`, `15`) were updated to the new lines.
- D169: five calls made on delegation (digits-only run id, new folder, run of HEAD, the smoke as the install step, stop at the first failure), PROPOSED, waiting for Rodrigo.
- Docs: usage line and a row in the kit README; the runbook text and the page of the npm package stay C32.4's.
- Rotation with `chicla archive`: «Previous» 334, «Done» 330, rolling 337.
- Whole `npm test` after `bump-round` (1 run, 2 cores): 2045 tests, 2043 pass, 0 fail, 2 skipped, 796 s. `check-build` passed (290 files).
- NOT run: CI, `npm test` on Node 18 and 20, macOS, Windows, the whole `npm run mutants:kit`, `npm run smoke` (no script changed), and any real `gh run download`, `gh run view` or `smoke-test-tarball.mjs --tarball` on a real CI tarball: the first real `prepare` is Rodrigo's.

## Round 339 — C32.1: `chicla release check` (v0.0.343)

- Task (Rodrigo: «avança»; no decision open = the task under «Next up»): C32.1 of M32 (D167). Two source files: `packages/chicla-kit/src/release.mjs` (new) and `cli.mjs`.
- Change: `chicla release check [--json] [--root <dir>]` READS ONLY and always runs four checks: `npm-version-free` (`npm view <name>@<version> version`: E404 free, the version published, anything else cannot tell and fails), `tree-clean` (`git status --porcelain`), `tag-absent` (`git tag --list <name>-v<version>`, local tags only) and `ci-green` (`git rev-parse HEAD`, then `gh run list --commit <sha>`: at least one run, all `completed` with `success`). Name and version come from `packages/chicla/package.json` and must be plain before any call. Exit 0 or 1; `prepare`, `publish` and any other word are usage errors (exit 2) until C32.2 and C32.3.
- One function: `git`, `gh` and `npm` run only through `runTool` (the one `spawnSync`); `releaseCheck` takes `run`, the CLI takes `io.run`. Every test uses a fake: NO real `git`, `gh` or `npm` command ran for this round, and nothing was written.
- Tests: `packages/chicla-kit/test/release-check.test.mjs` (13), red first (module missing). Two of my own assertions were wrong at first (a regex that forbade `tag --list`, then `--commit`); fixed in the test, not in the code. The page `packages/chicla/README.md` names `release` (the test of C31.1 requires every command of `--help`).
- Mutants: `K-REL-01` to `15`, each run alone (`--only`, `--timeout 60`): 15 RED; `01` SURVIVED first («published» and «cannot tell» both fail), so the check got a `published` field (true, false, null) that the test reads; then RED.
- D168: five calls made on delegation (package, local tag only, CI rule, E404, all checks run); Rodrigo said «ok» after the delivery reply: all five CONFIRMED (recorded in the ROADMAP and the status file in the same round).
- Rotation with `chicla archive`: «Previous» 333, «Done» 329, rolling 336.
- First whole run after `bump-round` (2029 tests, 3 fail, 787 s): three guards of the docs: `K-REL-` was not in `docs/README.md` nor in the list of prefixes of `test/mutants-kit-figures.test.mjs`, and the kit README did not document `chicla release`. Fixed (a usage line and a row in the kit README, the prefix in the two places); the full documentation of the command stays C32.4's.
- Whole `npm test` after that fix and after `bump-round`: 2029 tests, 2027 pass, 0 fail, 2 skipped, 764 s (Node 22, Linux, 1 core), read from the run's own summary. `check-build`: passed.
- NOT run: the whole mutant list; `npm run smoke`; the CI; Node 18 and 20; macOS and Windows; `chicla release check` against the real repository, GitHub or npm (the first real run is Rodrigo's); G-C11 (his).

## Round 338 — C31.2: the NEXT line of `chicla recovery` says `chicla make-delivery`; the pin moves; rule 4 (v0.0.342)

- Task (Rodrigo: «sim. ok»: «sim» = D-3 of D167, a rule, answered apart; «ok» = the task under «Next up»): C31.2, AUDIT-12 F-1. One source line in the PINNED `packages/chicla-kit/src/pinned/recovery-report.mjs` and the tests.
- Change: the NEXT line of `chicla recovery` (and of the copy a dump carries in `RECOVER/`) said `node scripts/make-delivery-zip.mjs <out.zip> --against <last delivery zip>`; it says `chicla make-delivery <out.zip> --against <last delivery zip>`. The pin moved with `bump-round`: `toolchain-digest` `15e4ef5d0602` → `375b6901b72d` (`CLAUDE.md` line 7). **G-C11 is open again and is Rodrigo's** (repeat `/dump` and «recovery mode» in a clean session); Claude did not do it and does not mark it.
- Rule (D167 D-3, Rodrigo «sim»): product rule 4 of `CLAUDE.md` now says the AI never runs `npm publish` or `chicla release publish`. D167 row: D-3 CONFIRMED.
- Tests: `packages/chicla-kit/test/no-scripts-in-pinned.test.mjs` (3): the guard of `no-scripts-in-messages` skips `pinned/`; this one reads it, and the NEXT line is asserted. 2 of 3 red before the line (the first of mine failed for a wrong floor, 5 pinned `.mjs` when the folder holds 4: `zipkit.mjs` joins it only in the built package; fixed). Mutant `K-REC-51` (the old text back) RED.
- Rotation with `chicla archive`: «Previous» 332, «Done» 328, rolling 335.
- First whole run after `bump-round` (2016 tests, 1 fail, 834 s): `test/c32-docs.test.mjs` still asserted D-3 OPEN; it now asserts D-3 CONFIRMED and the sentence in `CLAUDE.md`. Fixed.
- Whole `npm test` after that fix and after `bump-round`: 2016 tests, 2014 pass, 0 fail, 2 skipped, 748 s (Node 22, Linux, 1 core), read from the run's own summary. `check-build`: passed.
- NOT run: the recovery rehearsal (G-C11, his); the kit mutants outside `K-REC-51`; `npm run smoke`; the CI; Node 18 and 20; macOS and Windows.

## Round 337 — C31.1: `chicla archive` in the three READMEs, and a test that the README names every command (v0.0.341)

- Task (Rodrigo: «ok» = the task under «Next up»; the one decision of his still open, D-3 of D167, is a rule and `ok` does not cover it): C31.1, AUDIT-12 F-2. Docs and a test: no source, the pin does not move.
- Change: a usage line for `chicla archive` in the root `README.md` and in `packages/chicla-kit/README.md`, a row in the table of the kit README (the default `--keep` is 10: my first draft said 12, caught against the source before the run), and `archive` in the sentence of `packages/chicla/README.md`, the page npm shows.
- Tests: `test/readme-commands.test.mjs` (3): the commands are parsed from `chicla --help`, every one must be named in `packages/chicla/README.md`, and `archive` must be in the other two; 2 of 3 red before the docs.
- Whole `npm test` after `bump-round`: 2013 tests, 2011 pass, 0 fail, 2 skipped, 819 s (Node 22, Linux, 1 core), read from the run's own summary. `check-build`: passed. Rotation with `chicla archive`: «Previous» 331, «Done» 327, rolling 334.
- NOT run: anything outside the docs tests; no source changed. D-3 of D167 is still open: `CLAUDE.md` was not touched.

## Round 336 — D166 confirmed, D167 and M32: the release inside `chicla`, built before 0.4.0 (v0.0.340)

- Task (Rodrigo asked whether the publication could be automated inside `chicla`; answer «ok, 1: construir primeiro»): docs only, no source, the pin does not move. Claude published nothing.
- Recorded: D166 CONFIRMED (D-A, D-B, D-C) with one change of order; D167: **D-1** M32 is built first and 0.4.0 goes out with it; **D-2** `chicla release check` (reads only), `prepare` (the CI tarball into a new folder, sha256, installed alone, the smoke checks, notes with the CI's numbers) and `publish` (`git tag`, `gh release create`, `npm publish`: interactive terminal only, the version typed back, dry run unless confirmed); `git`, `gh` and `npm` go through one replaceable function so no test can publish. M32 has C32.1 to C32.4; C31.3 moves after C32.4.
- Left OPEN, not recorded as done: **D-3**, the sentence «the AI never runs `chicla release publish`» in `CLAUDE.md` rule 4: it changes a rule, which `ok` never covers (CLAUDE.md, «How the owner answers»). `CLAUDE.md` was not touched.
- Tests: `test/c32-docs.test.mjs` (3), red first (3 failing before the ROADMAP edit).
- Whole `npm test` after `bump-round`: 2010 tests, 2008 pass, 0 fail, 2 skipped, 811 s (Node 22, Linux, 1 core), read from the run's own summary. `check-build`: passed. Rotation with `chicla archive`: «Previous» 330, «Done» 326, rolling 333.
- NOT run: anything outside the docs tests; no release command exists yet.

## Round 335 — AUDIT-12: the audit after M30, before publishing the next `chicla` (v0.0.339)

- Task (Rodrigo: «fazemos o audit e depois a publicação da atualização»): the `audit` of item 2, `docs/audits/AUDIT-12.md`. Docs only: no source, the pin does not move. Only Rodrigo publishes: Claude ran no `npm publish`, `git tag` or `gh release create`.
- Measured: `npm run smoke:tarball` 13 of 13 ok; the package of the tree built, packed (35 files, 157875 bytes) and installed alone: `archive`, `doctor`, `git-plan` listed and run, `init --name`, `doctor`, `bump-round --verify` exit 0 in a project with no `scripts/`; `npm view chicla version` = 0.3.0.
- Findings: F-1 (medium) the pinned `recovery-report.mjs` line 253 prints `node scripts/make-delivery-zip.mjs` (the guard skips `pinned/`); F-2 (low) `archive` is in no README; F-3 (blocks the release) the package is still 0.3.0, the number npm has; F-4 (record) the pin is the same in 0.3.0 and the tree. Not fixed here (rule 6).
- Plan: D166 (D-A fix F-1 before the release, D-B 0.4.0, D-C the order), M31 with C31.1 to C31.3 in the ROADMAP, the index of `docs/README.md`.
- Tests: `test/audit12-docs.test.mjs` (4). Honest: written in the same step as the docs, NOT seen red first.
- Whole `npm test` after `bump-round`: 2007 tests, 2005 pass, 0 fail, 2 skipped, 766 s (Node 22, Linux, 1 core), read from the run's own summary. `check-build`: passed. Rotation with `chicla archive`: «Previous» 329, «Done» 325, rolling 332.
- NOT run: the CI on GitHub; Node 18 and 20 (Node 22 only here); macOS and Windows; a real logs zip; any publish.

