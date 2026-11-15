# AUDIT-12 — after M30, before publishing the next `chicla` (tree v0.0.338; npm has `chicla` 0.3.0)

Date: 2026-11-15 · Node 22.23.4, Linux, 1 core. Rodrigo asked for it: «fazemos o audit e depois a publicação da atualização». Only Rodrigo publishes (login and two-factor): this audit and the cards below prepare the release, Claude runs no `npm publish`, `git tag` or `gh release create`.
Method (status file, item 2): measured, not guessed, against what a user will really get: the package was built from the tree (`build-chicla`, `pack-release`), installed ALONE in an empty folder and driven as a user would. `bump-round --verify` first (green). `npm view chicla version` says 0.3.0 (the registry answered from the sandbox).

## 1. Promised against what exists

- **M30 (C30.1 to C30.7) is in the tree and recorded as done.** Read in the installed package: `chicla --help` lists `archive`, `doctor` and `git-plan`; `init --name ACME`, `doctor` (4 checks, none failed), `bump-round --verify` and `git-plan --against <FILES.manifest>` ran and exited 0 in a project that has no `scripts/` folder; `git-plan` without `--against` is exit 2, `EUSAGE`. `archive --dry-run` runs from the installed package.
- **D160 (the published package must not tell the user to run `scripts/...`) holds for every message the guard test reads** (`no-scripts-in-messages.test.mjs`, list empty), and for the whole `init`, `archive`, `bump-round`, `check-manifest` path: step `no-scripts-in-output` of the tarball smoke. One message outside that guard still says it: F-1.
- **D161, D163 (the commands of a delivery):** `git-plan` printed, for this tree against the round 333 zip, the `git rm` of the older status files first, then `git add` and the one-line commit; the reply of round 334 pasted it as printed.
- **D162 (one pointer to the rolling archives):** done in round 334; the status file lost 3.5 KB.

## 2. What is good

- **The tarball smoke has 13 steps and all pass** (`npm run smoke:tarball`, run in this audit): `init`, `bump-round-verify`, `make-delivery`, `verify-delivery`, `dump`, `dump-has-recover`, `recovery`, `chicla-zip`, `chicla-zip-library`, `init-name`, `rename-status`, `ci-report`, `no-scripts-in-output`.
- **The whole `npm test` of the tree: 2003 tests, 2001 pass, 0 fail, 2 skipped (709 s)**, read from the run's own summary after round 334; `check-build` passed.
- **The package of the tree** is 35 files, 157875 bytes (`chicla-0.3.0.tgz` built in a scratch folder, sha256 `355cc6ea…0589`; not the file to publish: the CI builds that one, as in 0.3.0). It installs offline in 240 ms.
- The mutants of M30 (K-ARC-52, K-BMP-19, K-DOC-01 to 08, K-GPL-01 to 12) are all RED in their own rounds.

## 3. Findings

- **F-1 (medium; the bug of D160 again, in a pinned file). `chicla recovery` prints `cd "<root>" && node scripts/make-delivery-zip.mjs <out.zip> --against <last delivery zip>` as its NEXT line.** Found by grep over `src/` and `templates/` without the exclusion of the guard (the guard skips `pinned/` on purpose): `src/pinned/recovery-report.mjs` line 253. A user of the published package has no `scripts/` folder, so the line sends them to a file that is not there; the same text is in the copy of `RECOVER/` that every dump carries. Changing it moves the `toolchain-digest` pin and needs a repeat of G-C11 (`/dump` and «recovery mode» in a clean session): that is why it was not fixed in this audit (rule 6: report, do not fix silently). The release does not have to wait for it: it is a wrong hint, nothing breaks; Rodrigo decides (D-A below).
- **F-2 (low; docs). `chicla archive` has no entry in any README.** Read: `chicla --help` lists it, the root `README.md` block, the table of `packages/chicla-kit/README.md` and the sentence of `packages/chicla/README.md` (the page npm shows) do not. `doctor` and `git-plan` do. A user reading the npm page would not learn that `archive` exists.
- **F-3 (blocks the release; process). The package of the tree is still version 0.3.0, the one npm has.** Read: `packages/chicla/package.json` says `0.3.0`, `npm view chicla version` says `0.3.0`, and the tarball made here is `chicla-0.3.0.tgz`: npm refuses to publish a version twice. The tree has the new commands `archive`, `doctor` and `git-plan`, the messages that say `chicla ...`, and the commands that took over `scripts/`, so the next number is a minor one in a 0.x line: 0.4.0 (D-B below). `docs/release.md` has no «Releasing chicla 0.4.0» yet.
- **F-4 (record; my reading). One thing the dump and recovery of 0.4.0 share with 0.3.0:** the pin is `15e4ef5d0602` in both (CLAUDE.md and the tree agree: `bump-round --verify`), so a 0.3.0 dump is accepted by 0.4.0 and the reverse, as long as F-1 is not fixed; once it is fixed the pin moves and the runbook must say so, as it did for 0.3.0.

## 4. Not measured

Not run by Claude in this audit: the CI on GitHub (nothing after what Rodrigo pastes is visible from here; the rounds 332 to 335 are not pushed until he runs the commands), Node 18 and Node 20 (the sandbox has Node 22 only; the last whole runs on them were in AUDIT-11, tree 0.0.320), macOS and Windows, a REAL logs zip, the GitHub release page, and any publish. `git-plan` was run on files and zips, never against a real git repository (it only prints). The three Dependabot pull requests were merged in round 324.

## 5. Plan, one round per card (D166: proposed by Claude, to be confirmed by Rodrigo; the order is Claude's suggestion)

Small, as D148 says: tests first, at most 3 source files and about 200 lines per card.

- **C31.1** (F-2, S): `archive` in the three READMEs, with a test that every command of `chicla --help` is named in `packages/chicla/README.md`.
- **C31.2** (F-1, M, only if D-A says yes): the NEXT line of `recovery-report.mjs` says `chicla make-delivery <out.zip> --against <last delivery zip>`; a test over `pinned/` too; the pin moves (`bump-round` writes it) and G-C11 is open again for Rodrigo.
- **C31.3** (F-3, S): `packages/chicla/package.json` to the number of D-B, and «Releasing chicla 0.4.0» in `docs/release.md` (the path of 0.3.0, with its lessons: a new folder, the real run id without brackets, `$PWD`, the CI's numbers in the notes), with a gate G-C19 for Rodrigo. Then the release itself is Rodrigo's: push, CI green, download `chicla-tarball`, try it in an empty folder, tag, release, `npm publish`; he pastes the output and Claude records «Published».
