# AUDIT-6 — after M18 (whole project, v0.0.259)

Date: 2026-10-27 (round 256) · Code audited: the round 255 tree (`chicla-zip` and `chicla-kit` 0.1.0, root v0.0.259) · Node 22.23.4, Linux, 2 cores (`nproc` = 2).
Method (status file, item 2): measured, not guessed. Byte sizes and counts of the files the archive rules talk about; the whole `npm run mutants:kit` run once (60 entries, detached); the coverage of the whole suite measured in round 253 (`docs/audits/AUDIT-5.md` F-4) is quoted, not repeated; a read of the tests that depend on the newest status file; one probe of `archive-changelog.mjs` with an option it does not know. Nothing was fixed in this round except the housekeeping the rules of item 6 order (the rolling archive, see F-6); the plan in §5 is the fix, one card per round.

## 1. Promised against what exists

- **M18 (D141, AUDIT-5 F-1 to F-5), C18.1 to C18.7:** each card is in the tree and recorded as done in `ROADMAP.md`. Read: the three archives of C18.1; `--rolling` in `scripts/archive-changelog.mjs`; `packages/chicla-kit/mutants/list.mjs` with `npm run mutants:kit`; the coverage figures in AUDIT-5 F-4; `makeDelivery` refusing a folder as `out` (C18.6, a defect that C18.4 found); the four tests of C18.5 and the three of C18.7. The order of the cards in the ROADMAP table is not the order of the rounds (C18.5 and C18.7 come after C18.4 and C18.6 in the file): cosmetic.
- **AUDIT-5 F-3 (kit mutants not repeatable):** closed for `integrity.mjs`, `emergency-dump.mjs` (the `allow` release and the external fallback), `recovery-report.mjs` (the toolchain digest), `manifest.mjs` (the JS crc32), `make-delivery.mjs` (a folder as `out`) and `panel.mjs` (keys). **Not closed:** `archive-changelog.mjs`, `check-manifest.mjs`, `bump-round.mjs` and `verify-delivery.mjs` have no entry (F-5 below).
- **AUDIT-5 F-4 (coverage):** measured; every uncovered line of the three named files is reached, tested or explained in the CHANGELOG of round 253.
- **Gates:** G-C8 (a real Windows machine) and the exFAT/FAT part of G-C3 are open and are Rodrigo's; no card of M18 depended on them. A-2 is «depois» by Rodrigo's word.
- **Stale claims:** the README files and `SECURITY.md` carry no old test count or timing (a grep finds none); but see F-4: the kit mutant list is documented nowhere a newcomer reads.

## 2. What is good

- Every card of M18 started with a test seen red, and the one defect it found on the way (C18.6) went through the same path: reported, carded, fixed in its own round, with a mutant that goes red.
- The whole `npm test` passes (1563 tests, 0 fail, 2 skipped, round 255, Node 22 on Linux); `test:fast` and `test:slow` pass.
- The cold start is unchanged: `CLAUDE.md` is 6 578 bytes and the status file 40 610 bytes in all (the Instructions block is the part a session reads); the two paragraphs that grew by hand are 1 395 and 4 544 bytes, not 10 KB.
- The kit mutant list found four real test gaps in `integrity.mjs`, four in the dump fallback, one in the panel, in the rounds that built it: the list earns its place.

## 3. Findings

- **F-1. Every round hits the archive limits by hand.** Counted: in rounds 251 to 255 each round had to run `--status` and `--snapshot` (and once the CHANGELOG archive) after writing its own entries, because `test/audit5-archive.test.mjs` holds the file to 5 «Previous» blocks and 10 «Done» lines. Nothing warns before the test goes red; the first full `npm test` of round 251 failed on it (two tests, a 9-minute run). Cost: that run, and a manual step in every round since.
- **F-2. `archive-changelog.mjs` treats an option it does not know as «archive for real».** Measured: in round 251 `node scripts/archive-changelog.mjs --help` archived 12 rounds of the CHANGELOG (verbatim, nothing lost, but unasked). A destructive-looking default behind a typo is the opposite of the product rule that a tool returns errors; the other options of the script validate their values (`--keep-clauses`), the option names are not validated.
- **F-3. Tests read the newest status file for text that the archive rules move away.** Counted: 5 root tests sort the status files and read the newest (`audit4-docs`, `audit5-docs`, `plan-a1-docs`, `archive-rolling`, `audit5-archive`). Measured: `plan-a1-docs` failed in round 252 because `--snapshot` archived the only line that named `plan-a1-integrity` (fixed by naming it in the Map, item 4); `audit5-docs` needs `AUDIT-5` and `C18.1` in the file, which today appear in lines that `--rolling` and `--snapshot` will move in the next rounds. A grep-the-live-file test is a time bomb for the round that archives its line.
- **F-4. `npm run mutants:kit` is documented nowhere a reader looks.** Counted: the string occurs in `CHANGELOG.md`, `ROADMAP.md` and the status file, and not in `README.md`, `CONTRIBUTING.md`, `docs/`, the kit README or item 20 (c) of the status file, which still says «Mutants: only the round's own, `--only <id>`» about the zip list. A session that touches `integrity.mjs` does not know the list exists unless it reads the CHANGELOG.
- **F-5. The kit mutant list covers six files, not the ones with most hand mutants.** Counted: AUDIT-5 F-3 listed about 110 hand mutants for the archive scripts, `check-manifest`, `integrity.mjs` and the differential test; the list has 60 entries, 41 on `integrity.mjs`, and none for `archive-changelog.mjs`, `check-manifest.mjs`, `bump-round.mjs` or `verify-delivery.mjs`. The coverage of branches is also lower than that of lines in the files that guard a delivery: `make-delivery.mjs` 82.2 %, `check-build.mjs` 85.7 %, `recovery-report.mjs` 87.3 % (measured in round 253; not measured again).
- **F-6. The «Open decisions» paragraph passed the 4 KB of item 6.** Measured: 4 544 bytes before this round's own entry. The rule says to run `archive-changelog.mjs --rolling` then; round 256 ran it (housekeeping the rules order, listed in the CHANGELOG, nothing deleted).
- **F-7 (no defect).** No new security finding: this round re-read none of `zipkit.mjs`, the extractor or the recovery code (five reviews and the sixth narrow pass closed G-C5); C18.6 changed one line of the delivery path and its test is red against the old code.

## 4. Not measured

Not run by Claude in this round: the CI on GitHub, Node 18 and 20 (the JS crc32 test of round 253 ran on Node 22 only), `npm run smoke` (no script changed), the 348 mutants of the zip list and the 8 `R170-*` ones, macOS, Windows, a new measurement of coverage, any fuzzing. Findings F-5 is therefore a lower bound on what is untested, not a verdict. The result of the whole `npm run mutants:kit` pass is in §6.

## 5. Plan, one round per card

One concern per round, tests first (red before the change), at most 3 source files and about 200 changed lines (CLAUDE.md working rules). Order below; C19.1 is next. The cards are PROPOSED (D142): Rodrigo confirms them.

### C19.1 `archive-changelog.mjs` refuses an option it does not know (F-2)

Source files: `scripts/archive-changelog.mjs`. 1.
Tests first: `--help`, `--status2` and a stray word each exit 2 with a usage text and change nothing; `--dry-run`, `--status`, `--snapshot`, `--rolling`, `--keep`, `--keep-previous`, `--keep-done` and `--keep-clauses` still work; the smoke test of the script has one case.
Pin: does not move (`archive-changelog.mjs` is not pinned).
Done when: the probe of F-2 prints the usage and writes nothing, and one hand mutant per guarantee is red (a kit-list entry `K-ARC-nn`).

### C19.2 The archive limits are reported before the test goes red (F-1)

Source files: `packages/chicla-kit/src/bump-round.mjs`. 1.
Tests first: `bump-round` (the normal run and `--refresh`) prints one line per limit that the status file or the CHANGELOG passes (5 «Previous», 10 «Done», about 20 rounds, 4 KB per paragraph) and names the command to run; it never runs it and never changes its exit status; a file within the limits prints nothing.
Pin: does not move; `bump-round.mjs` is not in `RECOVER/`.
Done when: the first closing of a round that passes a limit says so before `npm test`, and `test/audit5-archive.test.mjs` is no longer the first to say it.

### C19.3 Tests stop depending on text the archives move (F-3)

Source files: none (tests only). 0.
Tests first: a helper in `test/` (like `toolchain-files.mjs`) that returns the newest status file PLUS the verbatim archives (`docs/status-archive-*.md`); `audit4-docs`, `audit5-docs`, `plan-a1-docs` use it for the strings they look for; a test that fails if a test reads the newest status file for a card or audit name without the helper (a grep over `test/`).
Pin: does not move.
Done when: archiving the line of round 248 (a dry experiment on a copy) leaves the five tests green.

### C19.4 Document the kit mutant list (F-4)

Source files: none (docs and one test). 0.
Tests first: a test that `README.md`, `CONTRIBUTING.md` and item 20 (c) of the newest status file name `npm run mutants:kit` and what it needs (`--pkg .`, the whole tree), and that the kit README does not (it is a development file, not shipped).
Pin: does not move.
Done when: a newcomer finds the command from the README, and `docs/README.md` lists the list.

### C19.5 More slices of the kit list: `archive-changelog`, `check-manifest`, `bump-round`, `verify-delivery` (F-5)

Source files: none (`packages/chicla-kit/mutants/list.mjs` and `scripts/` only: the list is data). 0.
Tests first: the shape test of `test/mutants-kit-list.test.mjs` already holds every new entry (anchor once, files exist, parses); each entry is run alone with `--only <id> --timeout 120` and its survivors are named, as in C18.3 and C18.4. One slice per round (about 15 entries); the branch coverage of `make-delivery.mjs` and `check-build.mjs` read first.
Pin: does not move unless a mutant targets a pinned file (read from the copy, never edited).
Done when: each of the four files has a slice and no survivor without a reason or a card.

## 6. The whole kit mutant pass

`npm run mutants:kit`, run once on the round 255 tree, detached, on Node 22 (2 cores): baseline ok in 15.5 s, **60 mutants: 58 RED, 2 survive with a written reason** (`K-INT-19`, the map is already sorted; `K-DEL-02`, equivalent while the early refusal holds), **none survived unexplained, none stale or invalid**; the mutant runs took 210 s in all, so the whole list is about 4 minutes of work, not the 15 that round 255 guessed (the figure to put in item 20 (c), C19.4). Exit 0.

The pass proves the shape and the anchors of the list and that each guarantee still turns a test red on this tree; it does not prove that the list covers every guarantee (F-5).
