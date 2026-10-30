# AUDIT-8 — after M23 (one package, `chicla`; v0.0.287)

Date: 2026-10-29 (round 283) · Code audited: the round 282 tree (root v0.0.286 as delivered; `chicla` 0.2.0 as published; `chicla-zip` and `chicla-kit` 0.1.1, private) · Node 22.22.2, Linux, 1 core (`nproc` = 1).
Method (status file, item 2): measured, not guessed. `bump-round --verify` first (green). The whole `npm test` once, detached (item 20). The published package itself: `npm view` and `npm pack chicla@0.2.0` read from the registry, the tarball extracted and compared with a fresh `build-chicla` and `pack-release` of this tree, then installed alone in an empty folder and driven as a user would drive it (`init`, `bump-round --verify`, `check-manifest`, `make-delivery`, `verify-delivery`, `dump`, `recovery`, `update`, `chicla-zip`, `import "chicla/zip"`, a deep import, an unknown command). The two fixes below were tried on a COPY outside the repository, never in it.

## 1. Promised against what exists

- **M23 (D148), C23.1 to C23.4:** every card is in the tree and recorded as done. Read and ran: the loader tries `zipkit.mjs` beside itself first; `build-chicla.mjs` assembles 29 files with `src/zipkit.mjs` byte for byte; `packages/chicla` is metadata only (`0.2.0`, two bins, `exports` `./zip` and `./package.json`, no dependencies); both old folders are `private` and `pack-release` refuses them; the CI has `pack-chicla` and no `pack` or `pack-kit`.
- **What npm serves (read from the registry by Claude, which the round 282 record says it had not done):** `latest` is `0.2.0` and the only other versions are the two `0.0.0` placeholders; `chicla-zip@0.1.1` and `chicla-kit@0.1.1` carry «moved into chicla: npm install chicla»; the tarball downloaded with `npm pack chicla@0.2.0` is 102885 bytes with sha256 `bd13bc23ff0c2fdd6a97d722bf0a7f7e8b84f348cc978667903fbf7bb9def1b9`, the sum in `docs/release.md`; `pack-release` on this tree gives the same bytes and the same sha256, and `diff -r` of the two extracted folders is empty. The publication record is true.
- **D148's promise: «everything they did is in `chicla` 0.2.0, with the same commands»** (the package README says it too). Two of the commands do not do what they did: `recovery` does not start and `dump` carries no `RECOVER/` (F-1, F-2); and a project made by `chicla init` cannot be delivered (F-3).
- **Gates:** G-C16 is closed by Rodrigo and was not touched. G-C8 (a real Windows machine) and the exFAT/FAT part of G-C3 stay open and are his.

## 2. What is good

- The whole `npm test` passes on the round 282 tree: **1698 tests, 1696 pass, 0 fail, 2 skipped, 594 s** (Node 22, Linux, 1 core).
- The published package is exactly what the tree builds (§1): no stray file, 29 files, no `test/`, `packages/` or `node_modules/` in it.
- Measured on the installed package: `chicla --help` exit 0; an unknown command exit 2; `init`, `bump-round --verify`, `check-manifest`, `update` and `--json` work; the `chicla-zip` bin works through npm's symlink; `import "chicla/zip"` gives 19 exports; a deep import (`chicla/src/cli.mjs`) is refused with `ERR_PACKAGE_PATH_NOT_EXPORTED`; with a `package.json` in the project, `make-delivery` builds a zip that `verify-delivery` accepts.
- No new security finding: M23 touched no extractor or reader code (`zipkit.mjs` is a byte-for-byte copy) and the pin (`toolchain-digest 24014f88…`) did not move.

## 3. Findings

- **F-1 (real bug, published). `chicla recovery` does not start in `chicla` 0.2.0.** Ran on the tarball installed alone: `chicla recovery <dump.zip>` prints `✗ ECOMMAND_LOAD: cannot load pinned/recovery-report.mjs (ERR_MODULE_NOT_FOUND)`, exit 1. Cause, read and reproduced with a bare `import()`: `src/pinned/recovery-report.mjs` looks for `./zipkit.mjs` beside itself (the layout of `RECOVER/`) and otherwise for `../../../chicla-zip/src/zipkit.mjs` (the monorepo); in the package the zip module is at `src/zipkit.mjs`, one folder up, so it finds neither (`Cannot find module '/…/node_modules/chicla-zip/src/zipkit.mjs'`). Why no test caught it: `test/chicla-single-package.test.mjs` runs `chicla dump` from the tarball but for `recovery` it only checks that `src/pinned/recovery-report.mjs` is in the tarball (line 110). Tried on a copy: placing `zipkit.mjs` also at `src/pinned/zipkit.mjs` makes `recovery` load and recover (exit 0, `work/` restored) with no edit to any pinned file, because the pinned code already prefers a sibling. So the fix is in `scripts/build-chicla.mjs`, the pin does not move, and it needs a release (`0.2.1`, Rodrigo's gate).
- **F-2. A dump made by the installed `chicla` has no `RECOVER/`.** Ran: `chicla dump` in a project created by `chicla init` gives 5 warnings and a zip with `work/`, `outputs/`, the marker and the report, but no `RECOVER/`, because `emergency-dump` reads the five pinned files from `packages/chicla-kit/src/pinned/` of the working folder. D148 already lists this as «known and not changed»; what the audit adds is that it holds for EVERY user of the package (they never have that path), so the recovery start line of item 17 (shell compares the digest of `RECOVER/`) cannot be followed for a dump made by the package. It is a limit, not a crash; it needs a decision (D-283b): document it, or read the pinned files from the module's own folder.
- **F-3. `chicla init` makes a project that the kit's own `make-delivery` and `recovery` refuse.** Ran on the installed package: `init` writes six files and no `package.json`; `make-delivery` then ends `✗ ZIP IS NOT READY … package.json is not at the ROOT of the zip` and deletes the zip (exit 1); `recovery` of a dump of that project says «the dump found no project root (package.json + FILES.manifest)». Adding a three-line `package.json` makes both work (measured, exit 0). Read: `verify-delivery.mjs` line 156 requires `package.json`, the pinned `recovery-report.mjs` uses it as the project-root marker, and D120 chose that the generated `version.mjs` carries its own version «which a new project may not have a `package.json`». The two decisions contradict each other, and no test covers `init` then `make-delivery` (counted: `init.test.mjs` names `make-delivery` only in a text assertion on `CLAUDE.md`). Not caused by M23 (the old kit does the same), but the package README sends a new user down exactly this path.
- **F-4. The CI never runs the published package, and the one test that does is shallow.** Read `ci.yml`: `pack-chicla` builds and packs on Ubuntu and stops; the install-the-tarball test is inside `npm test`, so it runs on Ubuntu and macOS (Node 18, 20, 22) but not on Windows (the `windows` job runs only `packages/*/test`); and it drives `init`, `chicla-zip`, `chicla/zip` and `dump` but not `recovery` (F-1) or `make-delivery` (F-3). This is the first of the two things the status file already named; the second is F-2.
- **F-5. Stale words about the old packages, counted at 11 places (`SECURITY.md` as one).** Read: `SECURITY.md` (the opening sentence says «two packages»; the table calls `chicla-zip` and `chicla-kit` «supported, the latest 0.1.x» though both are deprecated and private; «Checking a release» speaks of `chicla-zip`); root `README.md` (line 7 «Status: released … tree at 0.1.1», line 26 the sample imports from `"chicla-zip"`, line 93 «a `pack` job builds the `chicla-zip` tarball», a job that no longer exists); `docs/README.md` (describes `release.md` as the runbook «for `chicla-zip` 0.1.0»); the READMEs of `packages/chicla-kit` and `packages/chicla-zip` (an «npm install chicla-kit» status line still stands above the «Moved» notice); `packages/chicla-kit/src/cli.mjs` (the header says the kit «cannot be published alone yet» and «Nothing is published before 0.1»; `chicla --help` starts «chicla: the kit CLI»); `make-delivery.mjs` (`EZIP_WRITE` says «could not write the zip with chicla-zip»); and the `NEXT:` hint of `recovery` (it prints `node scripts/make-delivery-zip.mjs`, a path a package user does not have; this one is in a pinned file, so it is only documented). No code depends on any of it.
- **F-6. The zip suite and the kit suite are still tested as two packages, and the 348 mutants of the zip list were last run whole on 2026-10-28, before M23.** Read the gate rows: nothing in M23 touched `zipkit.mjs` or a kit source except the loader (C23.1), so the old result still applies; the entries of rounds 279 to 282 all say the mutant lists were not run. Counted: no entry of the kit list or of the zip list names `zipkit-loader.mjs` (grep, 0 and 0), so the new first step of the loader (C23.1) has tests but no hand mutant.
- **F-7 (no defect).** Read, see §2: the publication record, the deprecations and the byte-level identity are true; the process kept to its rules (no `npm publish` or tag by the AI).

## 4. Not measured

Not run by Claude in this round: the CI on GitHub, Node 18 and 20 (the whole suite and every probe ran on Node 22 only), `npm run smoke`, `node scripts/check-build.mjs`, the mutant lists (the 348 of the zip list and the kit list), macOS, Windows, a real `npx chicla` from an empty folder on a machine with a clean npm cache (the installs above used the tarball, not `npx`), and the GitHub release page and the tag (only the registry was read). Nothing was run twice, so the 594 s has no second figure to compare.

## 5. Plan, one round per card

One concern per round, tests first (red before the change), at most 3 source files and about 200 changed lines (CLAUDE.md working rules). Order below; C24.1 is next. The cards are PROPOSED (D149): Rodrigo confirms them. D148 says this project is for him alone and he does not plan to keep updating it, so the plan is kept small: C24.1 is the only one that matters for correctness.

### C24.1 `recovery` runs from the packed package (F-1)

Source files: `scripts/build-chicla.mjs` (one line: also copy `zipkit.mjs` to `src/pinned/zipkit.mjs`, checked by sha256 like the first copy). No other source.
Tests first: in `test/chicla-single-package.test.mjs`, install the tarball alone offline, run `chicla dump` in a project that has a `package.json`, then `chicla recovery <dump> --out <dir>` and assert exit 0 and the recovered `work/`; red before the change (`ECOMMAND_LOAD`). A test that the build puts the same bytes in both places.
Pin: does not move (no pinned file is edited; the copy exists only in the built package, never in the repository).
Done when: the test is green on the round's tree, `npm test` green, and `docs/release.md` names the next release `0.2.1`; publishing it is a gate for Rodrigo (G-C17, opened with that card), and the old `0.2.0` stays on npm (a bad `0.2.0` can be deprecated with a pointer).

### C24.2 `chicla init` and `make-delivery` agree (F-3)

Source files: `packages/chicla-kit/src/init.mjs` (writes a minimal private `package.json` with the same version as `version.mjs`, never overwriting one that exists), `packages/chicla-kit/templates/package.json` (new, not a source file for the 3-file limit). Decision first (D-283a): the alternative is to stop requiring `package.json` in `verify-delivery`, which also needs the pinned `recovery-report.mjs` to change and so moves the pin; Claude suggests the `init` change.
Tests first: `init` then `bump-round --verify`, `make-delivery` and `verify-delivery` in a temp folder, red now; `init` in a folder that already has a `package.json` leaves it byte for byte; D120's test that `version.mjs` carries its own version stays green.
Pin: does not move (`init.mjs` and a template are not among the five pinned files).
Done when: the three commands pass on a fresh `init`, the README of `chicla` says so, and ROADMAP D120 carries a line saying `init` now writes `package.json`.

### C24.3 The CI installs and drives the published tarball (F-4)

Source files: `scripts/smoke-test-tarball.mjs` (new: install the tarball alone, run `init`, `bump-round --verify`, `make-delivery`, `dump` and `recovery`, `chicla-zip create` and `ls`), `.github/workflows/ci.yml` (a job `tarball` on ubuntu, macos and windows, Node 20 and 22, after `pack-chicla`). Windows is reported, not promised: D114 still says the kit is not declared for Windows.
Tests first: a test that the script exists, exits non-zero on a tarball without `src/pinned/zipkit.mjs` (a broken copy made by the test), and is named in `ci.yml` and in `npm run smoke`.
Pin: does not move.
Done when: the script passes on C24.1's tree on this machine and the job is in `ci.yml`; what the Windows run says is Rodrigo's to read (G-C8 stays his).

### C24.4 Say it once: the old packages are gone (F-5)

Source files: `packages/chicla-kit/src/cli.mjs` (the header comment and the `HELP` first line only), `packages/chicla-kit/src/make-delivery.mjs` (the `EZIP_WRITE` message only; tests assert codes, never text, rule 6). Docs: `SECURITY.md`, `README.md`, `docs/README.md`, the two old READMEs.
Tests first: a docs test that `SECURITY.md` has no «two packages» and its table does not call a deprecated name supported, that the root README does not say `0.1.1` or `pack` job, and that `docs/README.md` describes `release.md` as the runbook of `chicla`.
Pin: does not move (neither source is pinned); the `NEXT:` line of `recovery` stays as it is and is written down as a known limit in the root README.
Done when: the tests are green and a grep of the live docs for `two packages` finds nothing.

### C24.5 Decide what `dump` carries for a package user (F-2)

Source files: none until decided. Decision first (D-283b): (a) document it as a known limit of the package (a dump from the package has no `RECOVER/`; `recovery` still works from the package itself after C24.1); or (b) `emergency-dump.mjs` reads the five pinned files from its own module folder when the working folder has none. Claude suggests (a): it is the cheaper choice for a project that has one user, and (b) changes the code behind the toolchain pin and so the G-C11 rehearsal.
Tests first: for (a), a docs test; for (b), a test that a dump made by the installed package has `RECOVER/` with the digest that the pin would check.
Pin: (a) does not move; (b) may move it, and then G-C11 is repeated by Rodrigo.
Done when: the decision is recorded in ROADMAP and the chosen test is green.

Nothing was fixed in this round except the audit itself: this file, one docs test (`test/audit8-docs.test.mjs`, 7, all red first), the ROADMAP rows, the docs index and the closing kit. No source file and no pinned file was edited; the pin did not move. The experiments of F-1 and F-3 ran on copies under `/tmp`.

Update, round 287: C24.5 was first closed as «document the limit» (D-283b, round 286) and then reversed by Rodrigo. The reason given for not fixing it, that reading the pinned files from the module's own folder could move the toolchain pin, was overstated: the pin hashes the five RECOVER files and `emergency-dump.mjs` is not one of them. `emergency-dump.mjs` now looks beside its own module first; F-2 is fixed (C24.1, C24.2 and C24.5 are done).
