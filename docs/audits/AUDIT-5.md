# AUDIT-5 — after M16 and M17 (whole project, v0.0.251)

Date: 2026-10-26 (round 248) · Code audited: the round 247 tree (`chicla-zip` and `chicla-kit` 0.1.0, root v0.0.251) · Node 22.22.2, Linux, 1 core (`nproc` = 1).
Method (status file, item 2): measured, not guessed. Byte sizes of what a session reads and of the files that grow; the heading counts the archive rules talk about; `npm run test:fast` run once (1472 tests); line and branch coverage of the `chicla-kit` suite (`node --test --experimental-test-coverage`, 296 tests); a read of `ci.yml`, `dependabot.yml`, the recovery and policy code for the AUDIT-4 fixes. Nothing was fixed in this round; the plan in §5 is the fix, one card per round.

## 1. Promised against what exists

- **AUDIT-4 S-1 to S-5, P-1 to P-3, T-1 to T-5 (M16):** each fix is in the tree. Read: `ERECOVERY_FORMAT` and `mkdtemp` in `pinned/recovery-report.mjs`; `permissions: contents: read`, three actions pinned to commit SHAs and `.github/dependabot.yml` in the CI; Slack, Stripe, Google, Anthropic and OpenAI patterns in `policy.mjs`; `test:fast` and `test:slow` in `package.json`; `big-cm.log` gone from the root. S-6 (spawn arguments) was a read, not a fuzz, and stays so.
- **D138 A-1 (M17):** `integrity.mjs` exists and the three tools call it (C17.1 to C17.4 done); `docs/integrity.md` is held to the code by `test/integrity-docs.test.mjs`. **A-2** (fewer pinned modules, or a pin generated at build time) is «depois» by Rodrigo's word and nothing about it is planned.
- **Gates:** G-C8 (a real Windows machine) and the exFAT/FAT part of G-C3 are open and are Rodrigo's; no card of M16 or M17 depended on them.
- **Stale claims:** none found in the README files or `SECURITY.md` (a grep for the old test counts and timings finds none outside the history files). `docs/zipkit-RASCUNHO.mjs` and `docs/zipkit-plan-ronda-1s.md` are old drafts, but `docs/README.md` says so and says not to edit them: not a finding.

## 2. What is good

- The process rules caught real drift: the integrity module closed the gap where CRLF, a wrong pin and a stale fingerprint passed a delivery (`docs/plan-a1-integrity.md` §2).
- The whole `chicla-kit` suite passes (296 of 296) and `test:fast` passes (1470 of 1472, 2 skipped, 0 fail).
- `integrity.mjs` has 100 % line, branch and function coverage in the kit suite; `cli.mjs`, `ui.mjs` and `panel.mjs` are at or above 98 % lines.
- A cold start still costs about 21 KB (`CLAUDE.md` 6.6 KB plus the Instructions block 14.1 KB and the Fingerprint paragraph 1 KB), roughly 6 000 tokens: the AUDIT-4 gain held.

## 3. Findings

- **F-1. The archive rules are overdue again.** Counted: this file is 62 150 bytes (item 6 says to archive at about 60 KB), has 11 «Previous» blocks (keep 5) and 15 «Done» lines in the Snapshot (keep 10); `CHANGELOG.md` has 29 round headings (keep about 20). The scripts exist (`archive-changelog.mjs`, with `--status` and `--snapshot`); nobody ran them since round 241. Cost: any `grep` that lands in those blocks prints them.
- **F-2. Two paragraphs of this file grow by hand every round and nothing archives them.** Measured: the `**Current version:**` paragraph is 10 518 bytes in one line (a clause per round since round 135), and the «Open decisions» paragraph of «Next up» is 10 847 bytes (a clause per round back to round 209). Each round adds about 400 bytes to both. The cold start does not read them, but `bump-round` and every status edit do, and the `old_str` of an edit there must be unique inside a 10 KB line. This is AUDIT-4 T-3 again, one level down: `--status` archives the «Previous» blocks only.
- **F-3. The hand mutants of rounds 238 to 247 are not repeatable.** Counted in the Snapshot lines: about 110 hand mutants (12, 27, 22, 16, 10, 16 and 6 in rounds 238 to 245) for the archive scripts, `check-manifest`, `integrity.mjs` and the differential test. They exist only as CHANGELOG prose. `packages/chicla-zip/mutants/list.mjs` has 348 entries, none for a kit module (a grep for `integrity`, `archive-changelog`, `bump-round` and `check-manifest` in it finds 0), although `scripts/mutants.mjs` takes `--pkg` and `--list`. A refactor of the kit can drop one of those guarantees without any run noticing.
- **F-4. The kit's own coverage is uneven where the code is most dangerous.** Measured in the kit suite alone (a floor: the root `test/` files also run these modules, and that was not measured): `emergency-dump.mjs` 86.1 % lines (uncovered 181-201 and 336-367), `pinned/policy.mjs` 86.4 % (65-68, 80-83, 130-140), `pinned/recovery-report.mjs` 92.5 % lines and 69.2 % branches (105-112, 167-169, 190-193, 233-236), `pinned/manifest.mjs` 96.7 %, `make-delivery.mjs` 96.9 % (88-90), `verify-delivery.mjs` 98.5 % (50-53), `check-manifest.mjs` 84.5 % branches. Dump, recovery and the secret policy are the pinned files whose failure costs a session.
  **Measured again in round 253 (C18.4), the whole `npm test` with `--experimental-test-coverage` over `packages/chicla-kit/src/**`, root `test/` included (one run, `EXIT 0`):** `pinned/policy.mjs` 100 % lines, 97.5 % branches; `emergency-dump.mjs` 90.3 % lines, 90.7 % branches (uncovered 191-195 and 336-367); `pinned/recovery-report.mjs` 97.0 % lines, 87.3 % branches (105-112); `pinned/manifest.mjs` 96.7 % (59-60); `make-delivery.mjs` 96.9 % lines, 82.2 % branches (88-90); `panel.mjs` 99.2 % (123); every other file 100 % of lines. The kit-only floor above was too low for `policy.mjs`, `emergency-dump.mjs` 181-201 and `recovery-report.mjs` 167-236: the root tests run them. Why the rest is uncovered, line by line, is in the CHANGELOG of round 253: 191-195, 336-367 and 105-112 ARE reached (hand mutants `K-DMP-01` to `K-DMP-09` and `K-REC-01` to `K-REC-03` of `packages/chicla-kit/mutants/list.mjs` go red) but their tests start the tool with a clean `env`, which drops NODE_V8_COVERAGE; 59-60 are reached by the new `test/manifest-crc-fallback.test.mjs`; 88-90 hid a real defect (new card C18.6); `panel.mjs` 123 is outside the three files and only reported.
- **F-5. The item 20 timing is stale again.** Measured: `test:fast` took 213 s for 1472 tests in this sandbox (1 core); item 20 says 160 s for 1406 tests (round 240). The rule is to trust the measurement of the day, so the cure is one line, not a process.
- **F-6 (no defect).** No new security finding: this round re-read only the AUDIT-4 fixes and the CI, not `zipkit.mjs`; five reviews and the sixth narrow pass closed G-C5 and nothing in M16 or M17 touches the reader or the extractor.

## 4. Not measured

Not run by Claude in this round: the whole `npm test` (run at the close of the round), the CI on GitHub, Node 18 and 20, `npm run smoke`, the 348 mutants and the 8 `R170-*` ones, macOS, Windows, line coverage of the root `test/` files, any fuzzing. Findings F-3 and F-4 are therefore a lower bound on what is untested, not a verdict.

## 5. Plan, one round per card

One concern per round, tests first (red before the change), at most 3 source files and about 200 changed lines (CLAUDE.md working rules). Order below; C18.1 is next.

### C18.1 Archive and refresh the numbers (F-1, F-5)

Source files: none (`scripts/archive-changelog.mjs` is run, not edited). 0.
Tests first: a docs test that the status file has at most 5 «Previous» blocks, at most 11 Snapshot lines and the CHANGELOG at most 21 round headings (red now: 11, 16, 29); item 20 names the 213 s and 1472 tests.
Pin: does not move.
Done when: `archive-changelog.mjs --dry-run` is read, then run for the CHANGELOG, `--status` and `--snapshot` (keeping one less than the limit, as item 6 says), `bump-round --refresh` is green, the archives rebuild the originals byte for byte, and the CHANGELOG says what was not run.

### C18.2 Stop two paragraphs from growing by hand (F-2)

Source files: `scripts/archive-changelog.mjs`. 1.
Tests first: a new option (for example `--rolling`) keeps the newest 3 clauses of the `Current version` paragraph and of the «Open decisions» paragraph and moves the older ones verbatim to `docs/status-archive-rolling-<lo>-<hi>.md`, leaving one «Archived» pointer; a test that the archive plus the file rebuild the original; a test that a paragraph with fewer than 3 clauses is untouched.
Pin: does not move (`archive-changelog.mjs` is not pinned).
Done when: the two paragraphs drop to about 2 KB each, `bump-round --verify` is green, the smoke test of the script has the new case, and one hand mutant per guarantee is red.

### C18.3 A repeatable mutant list for the kit (F-3)

Source files: none (`packages/chicla-kit/mutants/list.mjs`, new; `package.json` script `mutants:kit`). 0.
Tests first: a test that every entry of the new list has `find` occurring exactly once in its `file` and names an existing test file; a test that the ids are unique and every entry has `id`, `file`, `find`, `replace`, `tests` and `why`, the shape `scripts/mutants.mjs` reads.
Pin: does not move, unless a mutant targets a pinned file; those are read from the working tree and the pin is not touched.
Done when: the first slice covers `integrity.mjs` (the 26 hand mutants of rounds 243 and 244 that were red), each entry is run once with `--only <id> --timeout 60`, detached, and the survivors are named. Other kit modules are later slices.

### C18.4 Name the untested lines of the dangerous paths (F-4)

Source files: none (tests only; a bug found would be a new card). 0.
Tests first: coverage of the whole root `test/` plus the kit suite (detached, about 8 minutes on one core) is read first; for each uncovered line in `emergency-dump.mjs`, `policy.mjs` and `recovery-report.mjs`, a test that reaches it, or a written reason that it cannot be reached.
Pin: does not move; a pinned file is not edited.
Done when: each of those three files has no uncovered line without a reason in the CHANGELOG, the new tests are red against a hand mutant, and the figures are recorded in `docs/audits/AUDIT-5.md` §3 F-4 as measured.
