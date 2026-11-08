<!-- CHANGELOG_FINGERPRINT: seq=327 file=CHICLA_PROJECT_STATUS-327.md app_sha256_12=065d37032ef1 changelog_sha256_12=92d1a42f2f0a (bump-round.mjs: app hash unchanged, changelog hash recomputed) -->
# Changelog

Archived rounds (nothing deleted): `docs/archive/changelog/CHANGELOG-archive-rounds-0-219.md`. References to older rounds elsewhere in the docs ("see CHANGELOG.md's Round N") live there now (moved from the root to `docs/archive/changelog/` in round 305)., `docs/archive/changelog/CHANGELOG-archive-rounds-220-230.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-231-241.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-242-253.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-254-263.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-264-275.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-276-286.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-287-297.md`, `docs/archive/changelog/CHANGELOG-archive-rounds-298-309.md`

## Round 322 — the records of the green CI, the mutants and G-C11; the release values (v0.0.326)

- Task (Rodrigo: «podes fechar o g-c11, já o fiz noutra conta. fecha tudo o resto que foi feito (mutants e ci e tudo o resto) e vamos avançar para a release»): docs only. G-C11 closed on his word (another account, not seen by Claude).
- Test first: `test/close-round322-docs.test.mjs` (6, red). Read: the logs zip of the green CI run of `c03e1767` with `ci-report` (14 jobs, none failed or unjudged; Ubuntu 1926 pass and 2 skipped, macOS 1914 pass and 14 skipped: the 12 more explain 1810 against 1822; no warning, no error), the three actions at their v6.0.0 commits, the tarball jobs on three systems, and the tarball of `pack-chicla` (146190 bytes, sha256 `9fc63878…`) reproduced by a local rebuild.
- Change: the status file (G-C11 closed, G-C18 with the values), ROADMAP (G-C11, G-C18, C27.5 closed, C29.4 open with its reason), AUDIT-11 §6, the 0.3.0 runbook (the values, G-C11 closed, the real logs zip read, the rebuild identical). Rodrigo's `npm run mutants`: 348, all as listed, 9 not run on darwin. No source file; the pin did not move. Rotation: «Previous» 316, «Done» 312, rolling 319.
- Then the whole `npm test` after `bump-round`: 1934 tests, 1932 pass, 0 fail, 2 skipped, 715 s (Node 22, Linux, 1 core), read from the run's own summary. The tarball built from the tree of this round (its docs included) has the same 146190 bytes and sha256 `9fc63878…` as the CI's, so pushing this round does not change what is to be released.
- NOT run: the release itself, `npm view` after it, the 62 kit mutants (C29.4).

## Round 321 — C29.3: `ci-report` does not call a run green when something was not judged (v0.0.325)

- Task (Rodrigo: «sim, avança», D-317a confirmed; the task is C29.3, AUDIT-11 F-3 and F-4): a log above 64 MiB gave «✓ no failing job» and exit 0, and a red job past the 5000th entry was invisible.
- Test first: 7 new and 1 updated in `packages/chicla-kit/test/ci-report.test.mjs` (red; one drives a real 65 MiB log through the CLI) and 2 in `test/c293-docs.test.mjs` (red).
- Change: `ci-report.mjs`: ECIREPORT_UNJUDGED (exit 1, no «✓» line) for an unreadable job and for entries beyond `maxLogs`; `--allow` covers a job, not the cap; a failed job keeps ECIREPORT_FAILED; fields `unjudgedJobs` and `unjudgedEntries`; the help of `cli.mjs`; three docs; K-CIR-15 to 24. The pin did not move. Rotation: «Previous» 315, «Done» 311, rolling 318.
- Run: the 29 tests of the file; ten hand mutants (one survived, then killed by a new assertion); K-CIR-01 to 24 RED with the real runner.
- Then the whole `npm test` after `bump-round`: 1928 tests, 1926 pass, 0 fail, 2 skipped, 650 s (Node 22, Linux, 1 core), read from the run's own summary.
- NOT run: the CI, a real logs zip.

## Round 320 — C29.1: the guard prints the `git rm` line (v0.0.324)

- Task (Rodrigo: «avança»; the task is C29.1, AUDIT-11 F-1): the message of EMANIFEST_TRACKED named 15 files; Rodrigo's repository had 188, and the command he was given first failed in zsh.
- Test first: 5 in `packages/chicla-kit/test/git-hygiene.test.mjs` (red; two run the printed line for real) and 2 in `test/c291-docs.test.mjs` (red).
- Change: `check-manifest.mjs` groups the files (folder, `*` pattern, file) and prints ONE ready `git rm -r -q --cached --ignore-unmatch -- …` line, quoted, cut at about 3000 characters; three result fields; two docs; K-CMN-26 to 34 in the kit list. The pin did not move. Rotation: «Previous» 314, «Done» 310, rolling 317.
- Run: the 15 tests of the file; nine hand mutants killed, one equivalent; the nine new K-CMN RED with the real runner; a fresh clone of the repository `main` with this tree over it: 188 files, 16 groups, the line made the check pass.
- Then the whole `npm test` after `bump-round`: 1920 tests, 1918 pass, 0 fail, 2 skipped, 614 s (Node 22, Linux, 1 core), read from the run's own summary.
- NOT run: the CI.

## Round 319 — AUDIT-11 F-8: the `main` is at round 304, not 308 (v0.0.323)

- Task (Rodrigo: «avança»; the next step of the order he chose, a correction of a record of mine): the audit, the status file, the CHANGELOG, the ROADMAP and the index of `docs/` said round 308 for the repository `main`; the CHANGELOG pairs round 304 with v0.0.308, the status number is the round plus five, and the `main` has 0.0.308 and seq 309.
- Test first: `test/audit11-docs.test.mjs` (4 red: no F-8, the old round, the old command, the old folder name written in a test).
- Change: docs only. F-8 added to AUDIT-11, the five places corrected, a test that none says it again, and the cleanup command of F-1 replaced by the two-step one that works in zsh (quoted globs, `--ignore-unmatch`, `--cached`). The pin did not move. Rotation: «Previous» 313, «Done» 309, rolling 316, and the CHANGELOG itself (rounds 298 to 309 into `docs/archive/changelog/`, 10 left).
- The first whole `npm test` was red (8 tests): I had forgotten the rotation of the CHANGELOG (22 round headings, the limit is 21, which also made the six limit tests of `bump-round` print a line they do not expect), and `test/audit10-docs.test.mjs` read the Snapshot line of round 310, which this round rotated into the archives (it now looks in the archives too). Both fixed. Then the whole `npm test` after `bump-round`: 1913 tests, 1911 pass, 0 fail, 2 skipped, 621 s (Node 22, Linux, 1 core), read from the run's own summary.
- NOT run: the CI.

## Round 318 — C29.2: the `.gitignore` names what a release leaves in the repository (v0.0.322)

- Task (Rodrigo: «não queres corrigir os erros todos antes de fazer push? eu acho que é melhor»; D-317b confirmed; the task is C29.2, AUDIT-11 F-2): `dist2`, `dist3`, `distci`, `distkit`, `dist-0.2.0`, the `notes*.md` and their `.sha256` had been tracked and the guard failed on them.
- Test first: `test/gitignore-builds.test.mjs` (4; two red).
- Change: `.gitignore` only, ten lines, anchored to the root (`*.tgz.sha256` and `__MACOSX/` came from Rodrigo's own cleanup). No source file; the pin did not move. Rotation: «Previous» 312, «Done» 308, rolling 315.
- Run: the 4 tests; six hand mutants, all killed.
- Run after `bump-round` on this tree: the whole `npm test`, 1911 tests, 1909 pass, 0 fail, 2 skipped, 695 s (Node 22, Linux, 1 core), read from the run's own summary.
- NOT run: the CI.

## Round 317 — AUDIT-11: the audit after M28, before publishing (v0.0.321)

- Task (Rodrigo: «faz o audit antes de eu publicar», «Continuar»; D159 is Claude's label): `docs/audits/AUDIT-11.md`, per item 2 of the status file, against the registry, GitHub and the installed tarball.
- Test first: `test/audit11-docs.test.mjs` (8; all red before the docs).
- Measured: the repository `main` is at round 304 (corrected in round 319) and the round 316 zip over it fails `check-manifest` on 188 tracked files (the cleanup command validated; `test:fast` green after it); runbook step 2 to the letter; a real 0.2.1 project under 0.3.0; the whole `npm test` on Node 18.20.8 and 20.20.2 (1897 pass, 0 fail each); `ci-report` bounded but green for an unjudged job.
- Seven findings (none of security), M29 with four cards proposed (D159); D-317a and D-317b wait for Rodrigo. Claude published nothing. The dates of rounds 311 to 316 are wrong (F-5), not edited.
- Docs only; no source file; the pin did not move. Rotation: «Previous» 311, «Done» 307, rolling 314.
- Run after `bump-round` on this tree: the whole `npm test` was red once (1907 tests, 1904 pass, 1 fail: the C28.1 guard caught the new test naming the old status-archive folder; fixed by writing it in two pieces), then 1907 tests, 1905 pass, 0 fail, 2 skipped, 715 s (Node 22, Linux, 1 core).
- NOT run: the CI, a real logs zip, Windows, macOS, the 62 kit mutants.

## Round 316 — C28.5: `chicla` 0.3.0 prepared, not published (v0.0.320)

- Task (Rodrigo: «avança»; the task is «Next up», C28.5; AUDIT-10 F-6, D-310c confirmed): the tree's `chicla` was 0.2.1 with other bytes than the published 0.2.1, and had three commands more.
- Test first: `test/release-030-docs.test.mjs` (7, all red).
- Change: `packages/chicla/package.json` 0.3.0 (and the tests that pinned 0.2.1); `docs/release.md` «Releasing chicla 0.3.0»; the package README and the root README; gate G-C18 in the status file and ROADMAP §9. No source file; the pin did not move. M28 is closed. Rotation: «Previous» 310, «Done» 306, rolling 313.
- Run: the new test file and the six older ones touched (37 pass); `build-chicla` + `pack-release`: `chicla-0.3.0.tgz`, 32 files, 144008 bytes; `chicla-single-package` 9 pass.
- The first whole `npm test` after `bump-round` was red once (1899 tests, 1896 pass, 1 fail): the guard that every root test picking the newest status file uses `test/status-text.mjs`; the new test did not. Fixed (it uses the helper); the whole `npm test` again: 1899 tests, 1897 pass, 0 fail, 2 skipped, 688 s (Node 22, Linux, 1 core).
- NOT run: the CI, `npm view`, a real logs zip, the other 62 kit mutants. **Claude published nothing**; G-C18 is Rodrigo's.

## Round 315 — C28.4: hostile entry names, a killed job, and the kit mutants (v0.0.319)

- Task (Rodrigo: «avança», then «Continuar»; the task is «Next up», C28.4; AUDIT-10 F-3, F-9): the survivor C2 and the label `..`.
- Test first: 4 in `packages/chicla-kit/test/ci-report.test.mjs` (the hostile-entry one red; the others controls and guards, one of them the `not ok`-without-summary case).
- Change: `ci-report.mjs` does not read an entry with a `.` or `..` segment; `mutants/list.mjs` has K-CIR-06 to 14 (C2, the hostile label, the seven `--allow` mutants). The pin did not move. Rotation: «Previous» 309, «Done» 305, rolling 312.
- Run: the 23 tests of the file; the 14 K-CIR mutants RED; `mutants:kit` on a frozen copy: 127 of 189 judged, all RED, 0 survivors (the first try: baseline over the 300 s default; the second cut at 108; the rest by `--only`).
- Run after `bump-round` on this tree: the whole `npm test`, 1892 tests, 1890 pass, 0 fail, 2 skipped, 775 s (Node 22, Linux, 1 core).
- NOT run: the other 62 kit mutants (files this round did not touch), a real logs zip, the CI.

## Round 314 — C28.3: `chicla ci-report --allow` (v0.0.318)

- Task (Rodrigo: «avança»; the task is «Next up», C28.3; AUDIT-10 F-2, D-310b confirmed): `ci-report` counted the Windows leg of `tarball` (`continue-on-error`) as a failed job.
- Test first: 8 in `packages/chicla-kit/test/ci-report.test.mjs` (7 red; the usage test already passed as a guard).
- Change: `ci-report.mjs` and `cli.mjs`: `--allow <text>`, repeatable, a case-sensitive part of the job name; the job is printed with its first error and not counted; `failed` keeps the raw verdict, `allowed` is new; `ECIREPORT_ALLOW` for a bad list; an empty or missing text is a usage error. The help and two READMEs. The pin did not move. Rotation: «Previous» 308, «Done» 304, rolling 311.
- Run: the 19 tests of the file; seven hand mutants in a copy, all killed.
- Run after `bump-round` on this tree: the whole `npm test`, 1888 tests, 1886 pass, 0 fail, 2 skipped, 706 s (Node 22, Linux, 1 core).
- NOT run: a real logs zip, the CI, the whole `mutants`.

## Round 313 — C28.2: the tarball smoke drives the new commands (v0.0.317)

- Task (Rodrigo: «avança»; the task is «Next up», C28.2; AUDIT-10 F-7): `scripts/smoke-test-tarball.mjs` had nine steps and none for `init --name`, `rename-status` or `ci-report`.
- Test first: `test/smoke-tarball.test.mjs`: STEPS 9 → 12 (red), and a break-it test (a tarball without `ci-report.mjs` and `rename-status.mjs` fails exactly those two steps).
- Change: the script, three steps at the end, from the package installed alone; the nine before are unchanged. No other source file; the pin did not move. Rotation: «Previous» 307, «Done» 303, rolling 310.
- Run: the script (12 steps ok), `smoke-tarball` and `smoke-tarball-win-quote` tests (15 pass), a hand mutant in a copy (`ci-report` never fails: only its step red).
- Run after `bump-round` on this tree: the whole `npm test`, 1880 tests, 1878 pass, 0 fail, 2 skipped, 635 s (Node 22, Linux, 1 core).
- NOT run: the CI (the `tarball` job on macOS and Windows now has the three steps), the whole `mutants`.

## Round 312 — C28.1: the root and the test words tidied (v0.0.316)

- Task (Rodrigo: «confirmo tudo. guarda o audit no sítio certo e avança»; D158 confirmed; the task is «Next up», C28.1): AUDIT-10 F-4 and F-5. The audit stays at `docs/audits/AUDIT-10.md`; a loose copy that the presentation card left in the outputs folder was deleted.
- Test first: `test/tidy-c281.test.mjs` (2; both red; the first run also showed that the test itself named the old folder in its title, fixed).
- Change: `t.mjs` deleted (named deletion, `--allow-removed t.mjs`, D-310a); five lines of tests say `docs/archive/status/`. No source file; the pin did not move. Rotation: «Previous» 306, «Done» 302, rolling 309.
- Run after `bump-round` on this tree: the whole `npm test`, 1879 tests, 1877 pass, 0 fail, 2 skipped, 674 s (Node 22, Linux, 1 core).
- NOT run: the CI, macOS, Windows, Node 18 and 20, the whole `mutants`.

## Round 311 — AUDIT-10: the audit after M27 (v0.0.315)

- Task (Rodrigo: «confirmo tudo, avança»: D157 confirmed and the audit of M27 as suggested; D158 is Claude's label): `docs/audits/AUDIT-10.md`, per item 2 of the status file.
- Test first: `test/audit10-docs.test.mjs` (8; all red before the docs).
- Measured: `npm test` 1869 tests, 1867 pass, 0 fail, 2 skipped, 668 s; smoke all green (80 steps); the git guard on a real repository; `ci-report` on synthetic zips; the tarball (143047 bytes) installed alone; the three actions on `node24` at GitHub; six hand mutants (C2 and B2 not caught).
- Ten findings (none of security), M28 with five cards proposed in the ROADMAP (D158); D-310a to D-310c wait for Rodrigo. Fixed: round 310 wrote `pack` for the job `pack-chicla` (the entry above, the Snapshot and «Last updated» of that round).
- Run after `bump-round` on the round 311 tree: the whole `npm test`, 1877 tests, 1875 pass, 0 fail, 2 skipped, 655 s (Node 22, Linux, 1 core).
- Docs only; no source file; the pin did not move. Rotation: «Previous» 305, «Done» 301, rolling 308.
- NOT run: the CI, a real logs zip, macOS, Windows, Node 18 and 20, the whole `mutants` and `mutants:kit`.

## Round 310 — C27.6: `actions/upload-artifact` at v6 in the CI (v0.0.314)

- Task (Rodrigo: «avança»; the task is «Next up», C27.6; D157 is Claude's label): the last action of the CI on Node 20, `upload-artifact` v4.6.2 in the `pack-chicla` job.
- Checked at GitHub (`git ls-remote --tags`, `action.yml` of each commit): v4.6.2 and v5.0.0 `node20`; v6.0.0 (`b7c566a7…`) and v7.0.2 `node24`. Chose v6.0.0, one major with the other two (D157). The same `ls-remote` confirmed the round 309 commits (`checkout` and `setup-node` v6.0.0).
- Test first: `test/ci-actions-node24.test.mjs` loops over `checkout`, `setup-node`, `upload-artifact` (6 tests; the new version test red, the rest true or guards).
- Change: `.github/workflows/ci.yml`, one line. No source file; the pin did not move. Rotation: «Previous» 304, «Done» 300, rolling 307. M27 is closed.
- Run: the test file and `ci.test.mjs` (27 pass), `check-build`, `npm run test:fast` (1815 pass, 0 fail, 2 skipped, 366 s), and the whole `npm test` after `bump-round` (1869 tests, 1867 pass, 0 fail, 2 skipped, 668 s; Node 22, Ubuntu sandbox).
- NOT run: the CI (it is the proof that the new action works), macOS, Windows, Node 18 and 20, the whole `mutants`, `npm run smoke` (no script changed).

