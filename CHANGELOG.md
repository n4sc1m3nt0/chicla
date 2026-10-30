<!-- CHANGELOG_FINGERPRINT: seq=294 file=CHICLA_PROJECT_STATUS-294.md app_sha256_12=065d37032ef1 changelog_sha256_12=d4f6b9e2b06d (bump-round.mjs: app hash unchanged, changelog hash recomputed) -->
# Changelog

Archived rounds (nothing deleted): `CHANGELOG-archive-rounds-0-219.md`. References to older rounds elsewhere in the docs ("see CHANGELOG.md's Round N") live there now., `CHANGELOG-archive-rounds-220-230.md`, `CHANGELOG-archive-rounds-231-241.md`, `CHANGELOG-archive-rounds-242-253.md`, `CHANGELOG-archive-rounds-254-263.md`, `CHANGELOG-archive-rounds-264-275.md`

## Round 289 — C24.4: the old package names said once (v0.0.293)

- Task (Rodrigo: «avança»; next card of M24). C24.4 (D149, AUDIT-8 F-5): eleven places still spoke of `chicla-zip` and `chicla-kit` as live packages.
- Test first: `test/stale-package-words-docs.test.mjs` (10, all red first): `SECURITY.md` (one package, a table with `chicla` only, «Checking a release» about `chicla`), the root README (Status, sample from `chicla/zip`, the CI sentence, the `NEXT:` limit of `recovery` written down), `docs/README.md`, the two old READMEs (Moved notice first, no install line), the header and first `--help` line of `cli.mjs`, the `EZIP_WRITE` text, a grep of the live docs for «two packages», ROADMAP.
- Change: two source files, `packages/chicla-kit/src/cli.mjs` (header comment and the first line of `HELP`: «chicla: the workflow CLI») and `packages/chicla-kit/src/make-delivery.mjs` (the `EZIP_WRITE` message only; the code stays), plus one line of `scripts/smoke-test-delivery-guards.mjs` that read that message. Neither source is pinned; the pin did not move. Docs as above; ROADMAP C24.4 done.
- Also: three older docs tests pinned the stale sentences and follow (`test/release-docs.test.mjs` twice, `test/retire-packages.test.mjs`: «`0.1.1` is the last release under this name» instead of «published on npm», and the old rows are gone from the SECURITY.md table); nothing else changed in them.
- Run on this machine: the new tests, `smoke-test-delivery-guards` (52 checks), the whole `npm test` after `bump-round` (1739 tests, 1737 pass, 0 fail, 2 skipped, 1142 s on 1 core), `check-build`. NOT run: the CI, Node 18 and 20, macOS, Windows, the rest of `npm run smoke`, the mutant lists.

## Round 288 — C24.3: the CI installs and drives the packed tarball (v0.0.292)

- Task (Rodrigo: «avança»; next card of M24). C24.3 (D149, AUDIT-8 F-4): until now the tarball installed alone was tried only by one unit test inside `npm test`, never on Windows and never as a CI job of its own.
- Test first: `test/smoke-tarball.test.mjs` (8, all red first): usage errors exit 2; a missing `--tarball` is `ETARBALL` (1, one JSON line); the real run, nine steps all ok and only `chicla` installed; break it on purpose: a tarball without `src/pinned/zipkit.mjs` (the 0.2.0 defect) goes red at `recovery` and exits 1; `smoke:tarball` in `package.json` and not in `smoke`; the CI job shape; ROADMAP.
- Change: one source file, `scripts/smoke-test-tarball.mjs` (builds and packs, or takes `--tarball`; installs offline in an empty folder; `init`, `bump-round --verify`, `make-delivery`, `verify-delivery`, `dump`, `RECOVER/` in the dump, `recovery`, `chicla-zip`, `import "chicla/zip"`; every step runs even after a red one; `--json`). CI: job `tarball` on Ubuntu, macOS and Windows, the Windows leg `continue-on-error` (reported, not promised, D114). `package.json`: `smoke:tarball`. ROADMAP C24.3 done. No pinned file touched, the pin did not move.
- Also: three docs tests followed the round (`init-package-json-docs` reads the archives for the round 285 clause; the CI comment of the new job avoids words another test forbids in the `pack-chicla` job); the «Current version» clauses of rounds 283 to 287 were joined with `; round ` (they were separate parentheses, which `--rolling` cannot cut) and the old ones archived verbatim to `docs/status-archive-rolling-273-285.md`; nothing deleted.
- Run on this machine: the script (9 of 9 ok, 3 s), the whole `npm test` after `bump-round` (1729 tests, 1727 pass, 0 fail, 2 skipped, 1091 s on 1 core), `check-build`. NOT run: the CI job on GitHub (first run is Rodrigo's push), Node 18 and 20, macOS, Windows, `npm run smoke`, the mutant lists (the script has no hand mutant; the broken-tarball test is its break-on-purpose).

## Round 287 — C24.5 reversed and fixed: the dump from the installed package carries `RECOVER/` (v0.0.291)

- Task (Rodrigo: «reverte a decisão e faz a correção»). D-283b is reverted. Claude had said the fix «could move the pin»; that was overstated (the pin hashes the five RECOVER files, `emergency-dump.mjs` is not one). C24.5 (D149, AUDIT-8 F-2) became the fix.
- Cause, read in the code: the five pinned files were read three folders up from `emergency-dump.mjs` (`packages/chicla-kit/src/pinned/…`), a layout only the repository has.
- Test first: `test/chicla-single-package.test.mjs` (the dump made by the tarball installed alone has the five `RECOVER/` files byte for byte the pinned ones, the marker hashes them the same, no warning; red) and `test/dump-limit-docs.test.mjs` (rewritten, 4, red first).
- Change: one source file, `packages/chicla-kit/src/emergency-dump.mjs` (`toolchainPaths`: the module's own `pinned/<name>`, then `<name>`, then the repository path). Docs: the round 286 limit text removed, `SECURITY.md` one line about 0.2.0, the 0.2.1 runbook, ROADMAP D149, C24.5, G-C17, AUDIT-8 update, the status file. The pin did not move (`bump-round --verify`: `24014f88…`).
- Run: the 42 dump tests of the repository layout; mutants K-INT-11 and K-INT-12 (still RED).
- Housekeeping (item 6): see the status file.
- NOT run by Claude: the CI, Node 18 and 20, `npm run smoke`, the rest of the mutant lists, macOS, Windows, `npm publish` (Rodrigo's gate G-C17).

## Round 286 — C24.5: the missing `RECOVER/` in a package dump is a documented limit (v0.0.290)

- Task (Rodrigo: «avança»). C24.5 (D149, AUDIT-8 F-2, D-283b confirmed): a dump made by the installed `chicla` has no `RECOVER/`. Docs only: no source, the pin did not move.
- Test first: `test/dump-limit-docs.test.mjs` (3, all red): the README section, the `SECURITY.md` bullet and the kit README row, ROADMAP and status.
- Read before writing: the digest check only runs from a folder named `RECOVER/` (`recovery-report.mjs` line 104) and `chicla recovery` runs the installed copy, so it never runs code from the dump; what is lost is the digest pin.
- Change: `packages/chicla/README.md` («Known limit: dumps made by the package»), `SECURITY.md`, `packages/chicla-kit/README.md`, ROADMAP C24.5, the status file. Not taken: reading the pinned files from the module's own folder (could move the pin).
- Housekeeping (item 6): `--status`, `--snapshot` and `--rolling` run; the «Current version» clauses of rounds 281 and 282 moved by hand to `docs/status-archive-rolling-281-282.md` (the script does not cut the `(round N: …)` form).
- NOT run by Claude: the CI, Node 18 and 20, `npm run smoke`, the mutant lists, macOS, Windows, `npm publish` (Rodrigo's gate G-C17).

## Round 285 — C24.2: `chicla init` writes `package.json` (v0.0.289)

- Task (Rodrigo: «confirmo tudo. avança»: D-283a and D-283b confirmed with Claude's suggestions). C24.2 (D149, AUDIT-8 F-3): a project made by `chicla init` was refused by `make-delivery`, `verify-delivery` and `recovery` for want of a `package.json`.
- Test first: `packages/chicla-kit/test/init.test.mjs` (six files became seven, 5 new: minimal private package, one version, an existing one kept byte for byte and said in `kept`, all or nothing, `init` then `make-delivery` and `verify-delivery` through the CLI; 7 red) and `test/init-package-json-docs.test.mjs` (3, red first). `test/chicla-single-package.test.mjs` drops its by-hand `package.json` and runs `init` then `make-delivery` from the installed tarball.
- Change: one source file, `packages/chicla-kit/src/init.mjs`. Docs: both READMEs, `docs/release.md` (the 0.2.1 runbook now has both fixes), ROADMAP D120, D149, C24.2, C24.5, gate G-C17, the status file. The pin did not move.
- Housekeeping (item 6): `--status`, `--snapshot` and the plain CHANGELOG archive (rounds 264 to 275) run; a first full `npm test` was red on the CHANGELOG limit (22 rounds) and on `init-agent.test.mjs` (six files) and both are fixed.
- NOT run by Claude: the CI, Node 18 and 20, `npm run smoke`, the mutant lists (no entry names `init.mjs`), macOS, Windows, `npm publish` (Rodrigo's gate G-C17).

## Round 284 — C24.1: `chicla recovery` starts from the installed package (v0.0.288)

- Task (Rodrigo: «temos que corrigir os defeitos encontrados»). C24.1 (D149, AUDIT-8 F-1): in `chicla` 0.2.0 `chicla recovery` ended `ECOMMAND_LOAD: ERR_MODULE_NOT_FOUND`. F-3 (`init` and `make-delivery`, C24.2) is NOT done: it waits for Rodrigo's answer to D-283a.
- Test first: `test/chicla-single-package.test.mjs` (the stage has `src/pinned/zipkit.mjs` byte for byte and the repository does not; the tarball installed alone runs `dump` then `recovery`; 2 red with `ERR_MODULE_NOT_FOUND`, then 9 of 9) and `test/release-021-docs.test.mjs` (4, red first).
- Change: one script, `scripts/build-chicla.mjs` (a second sha256-checked copy of `zipkit.mjs` beside the pinned `recovery-report.mjs`, in the built package only: 30 files). `packages/chicla` is `0.2.1`; the tests that hard-coded `0.2.0` follow. `docs/release.md` «Releasing chicla 0.2.1», ROADMAP C24.1 done and gate G-C17 open, the status file. No pinned file edited, the pin did not move.
- Housekeeping (item 6): `--status` and `--snapshot` run.
- NOT run by Claude: the CI, Node 18 and 20, `npm run smoke`, the mutant lists, macOS, Windows, `npm publish` (Rodrigo's gate G-C17).

## Round 283 — the audit after M23: the published package read and driven (v0.0.287)

- Task (Rodrigo: «faz o audit final»). The `audit` of M23: `docs/audits/AUDIT-8.md`, seven findings, plan M24 (C24.1 to C24.5, D149, proposed). Docs only: no source, no pinned file, the pin did not move; nothing was fixed in the package.
- Test first: `test/audit8-docs.test.mjs` (7, all red): the sections, one plan block per card, a measurement in every finding, the sha256 npm serves, the two defects recorded, ROADMAP D149 and M24, the docs index, the status file.
- Measured: registry (`latest` 0.2.0, both old names deprecated), the tarball from `npm pack` byte-identical to `build-chicla` and `pack-release` of this tree (`diff -r` empty), the installed package driven as a user: `chicla recovery` ends `ERR_MODULE_NOT_FOUND` (F-1), `chicla init` makes a project that `make-delivery` and `recovery` refuse (F-3), a package dump has no `RECOVER/` (F-2). The whole `npm test` on the round 282 tree: 1698 tests, 1696 pass, 0 fail, 2 skipped, 594 s.
- Change: `docs/audits/AUDIT-8.md`, `ROADMAP.md` (D149, M24), `docs/README.md`, the status file, the test. Housekeeping (item 6): `--status`, `--snapshot` and `--rolling` run; the «Current version» clauses of rounds 277 to 280 moved by hand to `docs/status-archive-rolling-277-280.md` (the script does not cut the `(round N: …)` form).
- NOT run by Claude: the CI, Node 18 and 20, `npm run smoke`, the mutant lists, macOS, Windows, `npx chicla` with a clean cache.

## Round 282 — one npm package, step 4: published and recorded (v0.0.286)

- Task (Rodrigo: «podes fechar e registar nos docs do projeto»). C23.4 and G-C16 (D148): Rodrigo published `chicla` 0.2.0, made the tag and the release and deprecated `chicla-zip` and `chicla-kit`; this round records it. Docs only: no source, no pinned file, the pin did not move.
- Test first: `test/published-chicla-docs.test.mjs` (8, all red): the «Published: chicla 0.2.0» section (who, when, the sha256 and the numbers, per-version deprecation, the surprises, what Claude did not see), ROADMAP C23.4 / D148 / G-C16, the status gate row, the READMEs. `retire-packages` and `single-package-docs` relaxed (they said «open»).
- Change: `docs/release.md` (new section; step 5 compares the content with `diff -r` because the bytes of a tarball depend on the npm version: npm 12 on his Mac gave another sha256, npm 10 on Linux gave the CI's; step 6 says to publish without `tee`: it stopped with `EOTP`), `ROADMAP.md`, the status file, README and the two old READMEs. Housekeeping (item 6): `--status`, `--snapshot`, `--rolling`, verbatim.
- NOT run by Claude: the CI of this tree, `npm run smoke`, the mutant lists. What happened on npm and GitHub is in his pasted output only.

## Round 281 — one npm package, step 3: the old packages retired (v0.0.285)

- Task (Rodrigo: «avança»; no decision open). C23.3 (D148): `packages/chicla-zip` and `packages/chicla-kit` are `private` (names and `0.1.1` unchanged); `pack-release` refuses them (EPRIVATE), so the CI jobs `pack` and `pack-kit` are removed; `pack-chicla` stays. `docs/release.md` «Releasing chicla 0.2.0» (publish, then `npm deprecate` on both names, never `npm unpublish`) replaces the thin 0.1.1 runbook; the 0.1.1 sections are marked history.
- Test first: `test/retire-packages.test.mjs` (10, all red): both folders private, `pack-release` exit 1 with EPRIVATE, the CI jobs, the runbook (order: publish, check, deprecate; every `chicla` command it runs exists), READMEs and SECURITY, ROADMAP rows. Old tests adjusted (the first full run had 11 red, all from `private`): `single-package-docs`, `ci` (the `pack` and `pack-kit` tests now check `pack-chicla`), the kit `packaging` and zip `package` tests (private), and `pack-release.test.mjs`, which packs a copy of `chicla-zip` without `private`.
- Change: the two `package.json`, `ci.yml` (3 source files); docs: `docs/release.md`, the two folder READMEs, SECURITY.md, README, ROADMAP C23.3. No source of the kit or the zip module, no pinned file, the pin did not move. Housekeeping (item 6): `--status`, `--snapshot`, `--rolling`, verbatim.
- NOT run by Claude: the CI, Node 18 and 20, macOS, Windows, `npm run smoke`, the mutant lists, C23.4 (Rodrigo publishes and deprecates; G-C16 stays open).

## Round 280 — one npm package, step 2: the assembly (v0.0.284)

- Task (Rodrigo: «avança»; D-B, D-C, D-D confirmed). C23.2: `scripts/build-chicla.mjs` assembles the package `chicla` 0.2.0 (kit `src/` and `templates/`, `zipkit.mjs` beside the loader, metadata of `packages/chicla`; two commands, `chicla/zip`, no dependencies). `packages/chicla` is now only metadata. The thin package of round 278 is replaced.
- Test first: `test/chicla-single-package.test.mjs` (9, all red; replaces `test/chicla-package.test.mjs`): fields, metadata-only folder, README, the build (exit codes, byte-for-byte stage, no tests), `pack-release` EINCOMPLETE, the tarball installed alone offline (both commands, `chicla/zip`, a blocked deep import, `dump`), the CI job, the ROADMAP rows.
- Change: `scripts/build-chicla.mjs`, `scripts/pack-release.mjs` (EINCOMPLETE), `packages/chicla/{package.json,README.md}`, `ci.yml` (`pack-chicla` builds, then packs), README rows, ROADMAP D148/C23.2. No pinned file, the pin did not move. The first full run had one red: `EINCOMPLETE` fired before `ELICENSE` for a fake package whose `files` lists a missing LICENSE; the guard now leaves LICENSE to `ELICENSE`. Housekeeping (item 6): `--status`, `--snapshot`, `--rolling`, verbatim.
- Seen, not changed: `chicla dump` outside a Chicla tree has no `RECOVER/` and 5 warnings (the same with the old kit installed alone).
- NOT run by Claude: the CI, Node 18 and 20, macOS, Windows, `npm run smoke`, the mutant lists, C23.3 and C23.4.

## Round 279 — one npm package, step 1: the loader (v0.0.283)

- Task (Rodrigo: one package; «ok vamos com a opção 1»). D148 / M23: `chicla` becomes the only package, assembled when it is published (D-A); the two folders stay as internal source and the pin does not move. D-B, D-C, D-D (commands, `0.2.0`, deprecating the two old names) are proposals applied as default.
- Test first: 4 loader tests in `packages/chicla-kit/test/packaging.test.mjs` (3 red): a sibling `zipkit.mjs` is tried first; none: the order is unchanged; a sibling that fails is not hidden; copied beside the loader into a folder with no chicla-zip it loads the writer. `test/single-package-docs.test.mjs` (5, all red).
- Change: `zipkit-loader.mjs` (sibling, then name, then monorepo path; `hasSibling` for the tests). Docs: ROADMAP D148, M23, G-C16 reworded, D147 marked superseded in part; `docs/release.md` stop sign on «Releasing chicla 0.1.1». Housekeeping (item 6): `--status`, `--snapshot`, `--rolling`, verbatim; the archived «Open decisions» clauses made `test/plan-a1-docs.test.mjs` and `test/plan-a2-docs.test.mjs` red (they read the live «Next up» block), so both now read the file plus its archives, like the others.
- NOT run by Claude: the CI, Node 18 and 20, macOS, Windows, `npm run smoke`, the mutant lists, C23.2 to C23.4.

## Round 278 — the npm name `chicla` becomes a real package (v0.0.282)

- Task (Rodrigo: his original intent was a package called `chicla`; «arranja uma solução»). The name held only the `0.0.0` placeholder, so `npx chicla` gave nothing. D147 (call made on delegation): a thin package `packages/chicla` (`bin/chicla.mjs` runs `main` of `chicla-kit/src/cli.mjs`; one dependency `chicla-kit ^0.1.1`; `0.1.1`). `chicla-zip` and `chicla-kit` unchanged.
- Test first: `test/chicla-package.test.mjs` (8, all red): fields, LICENSE and README, the wrapper, the tarball (four files), the three tarballs installed offline in an empty folder (`--help` 0, `init` writes the files, unknown command 2), the CI job, the runbook and ROADMAP rows, the README row.
- Change: `packages/chicla/` (package.json, bin/chicla.mjs, README.md, LICENSE), `pack-chicla` job in `ci.yml`, `docs/release.md` «Releasing chicla 0.1.1», ROADMAP D147, M22, G-C16, README row. No source of the two published packages, the pin did not move. Housekeeping (item 6): `--status`, `--snapshot`, `--rolling`, verbatim.
- NOT run by Claude: the CI (the new job included), Node 18 and 20, macOS, Windows, `npm run smoke`, the mutant lists, `npm publish` and the steps after it (Rodrigo's).

## Round 277 — 0.1.1 publication recorded in the docs (v0.0.281)

- Task (Rodrigo: «já fiz as tags as releases e verifiquei os sha256 dos tarball… só falta documentar»; D146). Both `0.1.1` packages are on npm; the tags, the GitHub releases and the sha256 check are his, in his word.
- Test first: `test/release-published-docs.test.mjs` (5; all red before the text, green after): the new section of `docs/release.md`, the D146 and G-C6 rows of the ROADMAP, the status file.
- Change: `docs/release.md` «Published: 0.1.1» (who, when, order), ROADMAP D146 (PUBLISHED) and the G-C6 row (a clause; the gate keeps its closing of round 230, none marked), the status file. No source file, the pin did not move. Housekeeping (item 6): `--status`, `--snapshot`, `--rolling`, verbatim.
- Seen by Claude (registry, 2026-10-28): `latest` = `0.1.1` for both, zip at 21:45 UTC and kit at 21:48 UTC; the served tarballs (sha256 `a20c2f20e31d…` and `f8ca89dd1e3e…`) are byte-identical to `pack-release` of the round 276 tree.
- NOT seen or run by Claude: the tags, the GitHub releases, his sha256 check, the CI of this tree, Node 18 and 20, macOS, Windows, `npm run smoke`, the mutant lists (no source changed).

## Round 276 — release 0.1.1 of chicla-zip and chicla-kit prepared (v0.0.280)

- Task (Rodrigo: «faz o passo 1. quero os dois»; D146). Compared with the published 0.1.0 tarballs (`npm pack`): `chicla-zip` `src/zipkit.mjs` is byte-identical, only its README differs; `chicla-kit` has 9 changed sources and a new README, templates identical.
- Test first: the version tests (`package.test`, `layout`, `pack-release`, `cli-check-manifest`, `release-docs`) expect `0.1.1`; two new tests in `test/release-docs.test.mjs` hold the section «Releasing 0.1.1» (both tags, both tarballs, zip published before the kit, the AI never publishes) and the root README. 12 red first, green after.
- Change: `"version": "0.1.1"` in both `package.json`, the status line of both READMEs, the root README (it also said `chicla-zip` was not yet published), `docs/release.md` section «Releasing 0.1.1», ROADMAP D146. The kit keeps `"chicla-zip": "^0.1.0"`. No source file, the pin did not move. Housekeeping (item 6): `--status`, `--snapshot`, `--rolling`, verbatim.
- NOT run by Claude: the CI, Node 18 and 20, macOS, Windows, `npm publish` and the steps after it (Rodrigo's); the mutant lists (no source changed).

