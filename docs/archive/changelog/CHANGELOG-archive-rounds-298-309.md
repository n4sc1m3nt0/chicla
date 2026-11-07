# Changelog archive — rounds 298-309

Moved out of `CHANGELOG.md` verbatim by `scripts/archive-changelog.mjs`. Nothing was edited or deleted;
this file has no fingerprint and is not part of the fingerprint triple. Find an entry with
`grep -n "^## Round 12" docs/archive/changelog/CHANGELOG-archive-*.md`.

## Round 309 — C27.5: `actions/checkout` and `actions/setup-node` at v6 in the CI (v0.0.313)

- Task (Rodrigo: «avança» after the git commands of round 308 ran; the task is «Next up», C27.5; D156 is Claude's label): the CI logs warned that the two actions at v4 run on Node 20 and are forced to Node 24; and why macOS on Node 22 ran 1810 passing tests against 1822 on Ubuntu.
- Test first: `test/ci-actions-node24.test.mjs` (4; the two version tests were red, the two «one commit» tests were already true). It reads the `# vX.Y.Z` comment after each 40-hex pin.
- Change: `.github/workflows/ci.yml` only, 10 lines: `checkout` v4.4.0 → v6.0.0 (`1af3b93b…`), `setup-node` v4.4.0 → v6.0.0 (`2028fbc5…`). The sandbox has no network to GitHub: the commits come from other repositories' workflows (checkout in many, setup-node in two). No `packageManager` field, so the auto-cache of setup-node v6 does not apply.
- 1810 vs 1822: from the skip conditions in the tests, 11 skip on macOS (`/dev/full`, case and normalisation folding, `holdsBoth`); one more is not found. NOT confirmed: the answer is the `# skipped` line of the two logs.
- Found, not changed: `actions/upload-artifact` v4.6.2 (the `pack` job), probably the same Node 20 warning; ROADMAP C27.6.
- The pin did not move. Rotation: «Previous» 303, «Done» 299, rolling 306.
- NOT run: the CI (it is the proof that the two commits are right), macOS, Windows, Node 18 and 20, the whole `mutants`.

## Round 308 — C27.4: the archives of the status file go to `docs/archive/status/` (v0.0.312)

- Task (Rodrigo: «avança», then «Confirmo, e avança com C27.4»: D154 confirmed; D155 is Claude's label): the 158 `docs/status-archive-*` files (the card said 148) sat in `docs/` beside the reference docs; the CHANGELOG ones already had a folder (C27.1).
- Test first: `test/archive-status-folder.test.mjs` (12 = 3 modes x 4; 9 red first, the 3 `--dry-run` ones are guards that cannot fail before the change).
- Change: `scripts/archive-changelog.mjs` (the one source) writes the `--status`, `--snapshot` and `--rolling` archives to `docs/archive/status/` (one constant, `STATUS_ARCH`); the index lines, the pointers and the grep hints name the path. The 158 files moved with `mv`, names kept.
- Followed: `test/status-text.mjs` (the helper every root test reads the archives through), the archive tests, `audit5-archive`, `status-prefix-c263`, `status-reads`, `docs-accuracy`, `pinned-cost-docs`, the kit test `core-bump-round-limits`; the live status file, `docs/state-file.md`, `docs/README.md`, the smoke script, ROADMAP. The old path stays in the «Done» lines, this CHANGELOG and the audits, as written (history).
- Rotation, run with the new code: «Previous» 302, «Done» 298, rolling 305, CHANGELOG rounds 287-297.
- The pin did not move; no kit source was touched.
- NOT run: the CI, macOS, Windows, Node 18 and 20, the whole `mutants`. The `git mv` of the 158 files is Rodrigo's (the sandbox has no `.git`).

## Round 307 — C27.3: `chicla ci-report <logs.zip>` (v0.0.311)

- Task (Rodrigo: «confirmo, avança»: D153 confirmed; the task is «Next up», C27.3; D154 is Claude's label): the CI logs Rodrigo sends were read by hand every time.
- Test first: `packages/chicla-kit/test/ci-report.test.mjs` (11; the file was red with the module missing, seen after the code was written, not before). K-CIR-02 survived at first (the two-suite test could not tell «added» from «last wins»); the test was strengthened and the mutant is RED.
- Change: new `packages/chicla-kit/src/ci-report.mjs` and the command in `cli.mjs` (two sources). It reads the logs zip in memory with the kit's zip reader (never extracted, a log over 64 MiB is `unreadable`, a warning), per job: the `not ok` tests, the counts added over the suites, the first error (`error:` block of the first failing test, else the first `##[error]`). Exit 0 / 1 (a job failed, or `ECIREPORT_ZIP`, `ECIREPORT_EMPTY`) / 2 usage. READMEs and the help text.
- Mutants: K-CIR-01 to 05 (new prefix, in `docs/README.md` and the figures test), each RED alone. No pinned file, the pin did not move.
- NOT run: the CI, macOS, Windows, Node 18 and 20, `npm run smoke`, the whole `mutants:kit`. NOT tried on a real GitHub logs zip: the sandbox has none; the first real run is Rodrigo's.

## Round 306 — C27.2: the git hygiene guard of `check-manifest`, EMANIFEST_TRACKED (v0.0.310)

- Task (Rodrigo: «avança»; the task is «Next up», C27.2; D153 is Claude's label): the CI of round 303 was red because `ci/package/` and `stage2/` were committed; `check-manifest` only WARNED about a file outside the manifest, so nothing stopped it.
- Test first: `packages/chicla-kit/test/git-hygiene.test.mjs` (10; 8 red first with the code of round 305, 2 guards already green: `--write` untouched, a LOST file still first). A first green run showed a false alarm the test had caught: `FILES.manifest` is tracked and never lists itself.
- Change: `packages/chicla-kit/src/check-manifest.mjs` (one source): when the project has a `.git` and the mode is check, `git ls-files -z` is compared with the manifest; a tracked file that exists on the disk and is not listed fails with `EMANIFEST_TRACKED` and is named (`trackedOutside`, `git.state`). No `.git`, a missing git or a failing one (`unavailable`, `error`) = skipped, never a failure; a tracked file gone from the disk is not flagged; an untracked one stays a warning. `docs/manifest.md` (the code); the header comment.
- Found on the way (a first full `npm test`: 9 red): the «Current version» line of the status file was over its 4096 bytes and `--rolling` could not archive it, because every old clause closed the parenthesis before its «; round» (the script saw one clause). Done as item 6 asks: the stray `)` before each «; round» (10) and the one before «; older rounds archived» were removed on that line, then `--rolling --keep-clauses 3` moved 8 clauses verbatim to `docs/status-archive-rolling-296-303.md`. The same run showed that my code repeated the text anchor of K-CMN-15: the new filter says `inManifest(f)`.
- Mutants: K-CMN-22 to 25 (the check never made; the manifest counted as tracked outside; a deleted tracked file flagged; a failing git read as an empty list), each RED alone. No pinned file, the pin did not move.
- NOT run: the CI, macOS, Windows, Node 18 and 20, `npm run smoke`, the whole `mutants:kit`. Not tried on the real repository (the zip has no `.git`): its first run on Rodrigo's machine may name files that are tracked and not listed; that is the point of the guard.

## Round 305 — C27.1: the archives of the CHANGELOG have a folder of their own, `docs/archive/changelog/` (v0.0.309)

- Task (the person in this session asked for the archived rounds to leave the root, «para ficar mais organizado», and said «confirmo tudo» to D-305a to D-305d): `CHANGELOG-archive-rounds-*.md` (7 files) were in the root of the project, which has 24 entries.
- Test first: `test/archive-options.test.mjs` (4 new, the default-command test changed; 3 red first with the script of round 304: folder, index line with the path, an archive already there is never overwritten; the dry run creates nothing, a guard that was already green), `test/archive-status.test.mjs` and `test/audit5-archive.test.mjs` (they look in the new folder; the root must hold none).
- Change: `scripts/archive-changelog.mjs` (writes `docs/archive/changelog/CHANGELOG-archive-rounds-<lo>-<hi>.md`, creates the folder only for real; the index line and the archive header name the path), `scripts/smoke-test-archive-changelog.mjs` and `scripts/smoke-test-delivery-guards.mjs` (the same paths). The 7 files moved byte for byte (names kept, so every `grep` by name still works); the index line of `CHANGELOG.md` and items 4 and 6 of the status file name the folder. The old archives and `docs/status-archive-*` keep their words (history). No pinned file; the pin did not move.
- Rodrigo's part (a zip cannot move files of his repo): `git mv` of the 7 files, see the reply. D-305c: the script reads only the new folder.
- Housekeeping (item 6): `--status --keep-previous 4`, `--snapshot --keep-done 9`, `--rolling --keep-clauses 2`.
- NOT run: the CI, macOS, Windows, Node 18 and 20, the whole `npm run mutants` and `mutants:kit` (no mutant of this round). The results of `npm test`, `check-build` and `npm run smoke` are in the reply.

## Round 304 — C24.7: the CI of round 303 was red: `run-tests --list` cut on macOS; two build folders had been committed (v0.0.308)

- Task (the person in this session, after sending the CI logs of round 303 and answering «sim» and «faz a ronda 304»; D-304a to D-304c, Claude's labels, taken on delegation): the run of 2 Nov 2026 was red on Ubuntu and macOS (Node 18, 20, 22; Windows, `tarball`, `pack-chicla` and `bench` green). Two causes, none in the code of round 303.
- Cause 1 (macOS, Node 18 and 20 only): test 1790 got the `--list` of `scripts/run-tests.mjs` cut at about 8 KB (the list is 8232 bytes; it ended at `win-quote-bare-command.t`), because the script ended with `process.exit(main(...))` and exit can drop what is still queued on a pipe. Hypothesis from the log and the code, not reproduced here (this sandbox is Linux).
- Cause 2 (every Ubuntu and macOS job): test 1749 found `two packages` in `ci/package/README.md` and `stage2/chicla/README.md`. Neither is in the delivery zip nor in `FILES.manifest`; they are in the GitHub checkout, so they were committed (outputs of `build-chicla.mjs --out …`; `.gitignore` had no build folder). The test is right and is not touched.
- Test first: `test/test-sets.test.mjs` (one new test: `run-tests.mjs` has no `process.exit(` and ends with `process.exitCode = main(`; red with the script of round 303, green after).
- Change: `scripts/run-tests.mjs` (one line: `process.exitCode = main(...)`, same exit codes: bad set 1, `--list` 0); `.gitignore` (`stage/`, `stage2/`, `dist/`, `ci/package/`). No pinned file, the pin did not move.
- Rodrigo's part (a zip cannot delete files of his repo): `git rm -r --cached ci/package stage2`, push, and look at the CI (steps in the reply).
- Housekeeping (item 6): `--status --keep-previous 4`, `--snapshot --keep-done 9`, `--rolling --keep-clauses 2`.
- NOT run: the CI (macOS, Node 18 and 20: the only place where the cut shows), the whole `npm run mutants` and `mutants:kit` (no mutant of this round). The results of `npm test`, `check-build` and `npm run smoke` are in the reply.

## Round 303 — D-C265a amended: `rename-status` also rewrites the process block of the status file (v0.0.307)

- Task (the person in this session, after a review of M26: «I'd go with option 1», then «yes go ahead»; D-C265c, a label of Claude's, amends D-C265a): the status file is not all history. Its process block, everything above the `**Current version:**` line, has the session-start command (`ls <NAME>_PROJECT_STATUS-*.md`) and the name of the file; after a rename they still said the old name and found nothing.
- Test first: `packages/chicla-kit/test/rename-status.test.mjs` (the first test changed, red: «the process block still says the old name»; the file is split at `**Current version:**`; above it only the old name becomes the new one, from it down the bytes are the same, history line included).
- Change: `src/rename-status.mjs` (the process block of the status file, as a whole name like the instruction files; the status file is written under its old name and then renamed, so the list of changed files maps it to the new name; a status file with no such line gets no rewrite), `src/cli.mjs` (help text only). Two kit mutants K-REN-08 (the block keeps the old name) and K-REN-09 (the history is rewritten too), each RED alone. `README.md` of the kit, `docs/state-file.md`, ROADMAP C26.5 row. Two sources; the pin did not move.
- Housekeeping (item 6): `--status --keep-previous 4`, `--snapshot --keep-done 9`, `--rolling --keep-clauses 2`.
- NOT run: the CI, macOS, Windows, Node 18 and 20, `npm run smoke`, the whole `npm run mutants` and `mutants:kit` (only K-REN-08 and 09, alone); no use in a real project of another name. The result of the whole `npm test` is in the reply.

## Round 302 — C26.5: `chicla rename-status <NAME>`; M26 is closed (v0.0.306)

- Task (Rodrigo: «avança»; D-C265a «Confirmo a sugestão»: the old name is rewritten only in the instruction files that exist, never in the status file, the CHANGELOG or the archives; D-C265b «Confirmo a sugestão»: the same name is «already» (exit 0), an invalid name is ENAME).
- Test first: `packages/chicla-kit/test/rename-status.test.mjs` (7, red because the module did not exist).
- Change: new core `src/rename-status.mjs` (the status file keeps its bytes; the `file=` of CHANGELOG.md line 1 and version.mjs; the `status-prefix:` line, none for CHICLA; the old name, as a whole name, in the instruction files; `bump-round --refresh` regenerates the manifest and must pass; ENAME, ESTATE, ENOROOT, EWRITE with every file put back), `cli.mjs` (the command, one positional name, usage error 2). Seven kit mutants K-REN-01 to 07 (each RED alone; new prefix `K-REN-` in `docs/README.md` and the figures test); `README.md`, `packages/chicla-kit/README.md`, `docs/state-file.md`. The pin did not move.
- M26 (D151) is closed: C26.1 to C26.5. No card is left «por fazer» in the ROADMAP.
- Housekeeping (item 6): `--status --keep-previous 4`, `--snapshot --keep-done 9`, `--rolling --keep-clauses 2`.
- NOT run: the CI, macOS, Windows, Node 18 and 20, `npm run smoke`, the whole `npm run mutants` and `mutants:kit`; no use in a real project of another name. The result of the whole `npm test` is in the reply.

## Round 301 — C26.4: `chicla init` names the status file; the templates say it (v0.0.305)

- Task (Rodrigo: «avança»; D-C264a «Separa: C26.4 = init + templates; C26.5 = rename-status» and D-C264b «Confirmo: recusa e pede --name»).
- Test first: `packages/chicla-kit/test/init-name.test.mjs` (7; 5 red first; 2 guards: a project named CHICLA is byte for byte the template, and `update` of a fresh project).
- Change: `init.mjs` (`--name`, else the folder in capitals; ENAME for a name that is not capitals, digits and `_` starting with a letter; the line `status-prefix:` after the first line of CLAUDE.md, none for CHICLA; `forName` writes the templates as `<NAME>_PROJECT_STATUS`; a status file of any prefix is EEXIST), `update.mjs` (the templates are read through the project's name), `cli.mjs` (`--name`, usage error without a value). No template file was edited. Six kit mutants (K-INI-01 to 05, K-UPD-04, each RED alone; new prefix `K-INI-` in `docs/README.md` and the figures test); `docs/state-file.md`. Legacy tests that expect the Chicla name from `init` now ask for it (`name: 'CHICLA'` / `--name CHICLA`; the `moved()` helper of `status-prefix-readers.test.mjs` uses `init --name`). Three sources; the pin did not move.
- ROADMAP: C26.5 is a new card (`chicla rename-status`), it closes M26.
- Housekeeping (item 6): `--status --keep-previous 4`, `--snapshot --keep-done 9`, `--rolling --keep-clauses 2`.
- NOT run: the CI, macOS, Windows, Node 18 and 20, `npm run smoke` (the tarball tests call `init`), the whole `npm run mutants` and `mutants:kit`. The result of the whole `npm test` is in the reply.

## Round 300 — C26.3: the dump, the recovery and `archive-changelog` read the status-file prefix; the pin moves (v0.0.304)

- Task (Rodrigo: «avança»; D-C, touch the pinned `recovery-report` and repeat G-C11, was confirmed in round 298; no decision was open).
- Test first: `test/status-prefix-c263.test.mjs` (8; 6 red first; 2 guards: the legacy name in the dump and in the recovery).
- Change: `emergency-dump.mjs` (own reader; the marker's `statusFile` is the one of the prefix, «(not found)» for an invalid or conflicting line or a file of another prefix; CLAUDE.md read only if present), `pinned/recovery-report.mjs` (an older status file of any prefix is not «removed»), `scripts/archive-changelog.mjs` (reads the line itself; all three modes). Five kit mutants (K-DMP-50, K-DMP-51, K-REC-50, K-ARC-50, K-ARC-51, each RED alone); `docs/state-file.md`. Three sources. THE PIN MOVED: `toolchain-digest` 24014f880e9e → 15e4ef5d0602; `RECOVER/` of a new dump differs from the old one. **G-C11 is open again (Rodrigo's).**
- Housekeeping (item 6): `--status --keep-previous 4`, `--snapshot --keep-done 9`, `--rolling --keep-clauses 2`. The rolling archive moved the round 297 «Open decisions» entry, so one assertion of `test/published-chicla-021-docs.test.mjs` (a historical fact) now reads the live file plus its archives, like its neighbours.
- NOT run: the CI, macOS, Windows, Node 18 and 20, `npm run smoke`, the whole `npm run mutants` and `mutants:kit`; no dump or recovery by hand. The whole `npm test` ran once (1811 tests: 1 red, the test above, fixed and that file rerun alone: 8 pass); it was not rerun whole.

## Round 299 — C26.2: the panel, `update` and `verify-delivery` read the status-file prefix (v0.0.303)

- Task (Rodrigo: «avança», after confirming D-298a): the second slice of M26 (D151). Claude read the verify (seq 303, passed), asked D-298a and the next task first (CLAUDE.md), then worked.
- Test first: `packages/chicla-kit/test/status-prefix-readers.test.mjs` (7; 6 red first; the green one guards that a project with no line gets the template as it is through `update --apply`).
- Change: `panel.mjs` (the status file of the `status-prefix:` line; an invalid line finds none), `update.mjs` (any status file makes a project; the line is left out of the comparison and the diff and kept when CLAUDE.md is replaced), `verify-delivery.mjs` (prefix from the zip's own CLAUDE.md; an old status file of any prefix is not lost: a second delivery of an `ACME` project failed before). Mutants K-PNL-30, K-UPD-01 to 03 (all RED alone), K-VER-16 anchor moved; new prefix `K-UPD-` in `docs/README.md` and the figures test; `docs/state-file.md`. Three sources; the pin did not move.
- Found, not fixed: the `seq` cross-check of `verify-delivery` (its prefix-aware filter) has no mutant that goes red (the integrity fingerprint rule fails first), so the entry was dropped; `STATUS_FILE_RE` is now used only by tests; `update` with no CLAUDE.md in a project of another prefix would recreate it without the line (the refresh then refuses, all or nothing).
- Housekeeping (item 6): `--status --keep-previous 4`, `--snapshot --keep-done 9`, `--rolling --keep-clauses 2`.
- NOT run: the CI, macOS, Windows, Node 18 and 20, `npm run smoke`, the whole `npm run mutants` and `mutants:kit`. The result of the whole `npm test` is in the reply.

## Round 298 — C26.1: the status file carries the project's prefix (v0.0.302)

- Task (Rodrigo: he installed `chicla` in another project and saw `CHICLA_PROJECT_STATUS-N.md` there, not `<PROJECT>_PROJECT_STATUS-N.md`). Claude found the name fixed in `init`, the templates and every reader (nine kit files and `archive-changelog.mjs`), so the fix is four slices (M26, D151): C26.1 the shared rule, `bump-round` and `check-manifest` (this round); C26.2 `panel`, `update`, `verify-delivery`; C26.3 `emergency-dump`, `recovery-report` (the pin moves, G-C11 again) and `archive-changelog`; C26.4 `init` (folder name in capitals, `--name`) and the templates, LAST, so no round writes a name that another tool refuses. D-A, D-B, D-C confirmed by Rodrigo (2026-11-01); D-298a (the line lives in `CLAUDE.md`, beside the pin) is Claude's call on delegation.
- Test first: `packages/chicla-kit/test/status-prefix.test.mjs` (13; 10 red first, 3 green before the code: the purity of `integrity.mjs`, the bump of the real project and the two-files guard of the manifest).
- Change: `integrity.mjs` (`statusPrefix`, `statusFileRe`, `statusFileAny`, `DEFAULT_STATUS_PREFIX`; no `status-prefix:` line = CHICLA, so every project that exists keeps working), `bump-round.mjs` (renames to the project's prefix; an invalid or conflicting line, or a status file of another prefix: `EBUMP_STATE`, nothing written), `check-manifest.mjs` (a change of prefix is one rename, not a lost file), `CLAUDE.md` (`status-prefix: CHICLA`), `docs/integrity.md`, `docs/state-file.md`, five kit mutants (K-INT-42 to 44, K-BMP-18, K-CMN-21) and two stale anchors fixed (K-INT-09, K-INT-10, K-CMN-14). Three source files; the pin did not move. Until C26.4 `chicla init` still writes the Chicla name.
- Housekeeping (item 6): `--status`, `--snapshot`, `--rolling`; and by hand, verbatim, the clauses of rounds 286 to 295 of the «Current version» line (`docs/status-archive-rolling-286-295.md`): that line was 4438 bytes and `--rolling` archives 0 clauses of it (its parenthesis closes after the first clause, so the script sees one; not fixed, a finding). The first whole `npm test` after the bump showed it: 8 red, all the limit tests (the real tree must be within every limit).
- Run before the bump: the new test file; the 83 kit mutants of `integrity`, `bump-round` and `check-manifest` (81 red, 2 survivors already explained); `npm run test:fast` (5 red caused by this round: the docs of the exports, the mutant list anchors and ids; fixed, those files green again). The whole `npm test` after the bump: 1796 tests, 8 red (the limit above), fixed; it is run again and its result is in the reply. NOT run: the CI, macOS, Windows, Node 18 and 20, `npm run smoke`, the whole `npm run mutants`.

