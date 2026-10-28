# AUDIT-7 — after M19 (whole project, v0.0.269)

Date: 2026-10-27 (round 265) · Code audited: the round 264 tree (`chicla-zip` and `chicla-kit` 0.1.0, root v0.0.268 as delivered, 0.0.269 with this round's docs) · Node 22.23.4, Linux, 2 cores (`nproc` = 2).
Method (status file, item 2): measured, not guessed. The whole `npm test` once; the whole `npm run mutants:kit` once (detached, per-entry times kept); every script of `scripts/` run with an option it does not know, on a COPY of the tree; the copy archived to the limits of item 6 (`--keep 3`, `--status --keep-previous 1`, `--snapshot --keep-done 2`, `--rolling --keep-clauses 1`) and the whole `npm test` run on it; the sizes and counts the archive rules talk about; the coverage of `packages/chicla-kit/src/**` and `scripts/**` (F-6). Nothing was fixed in this round except the housekeeping that item 6 orders (`--status --keep-previous 4` and `--snapshot --keep-done 9`, verbatim); the plan in §5 is the fix, one card per round.

## 1. Promised against what exists

- **M19 (D142, AUDIT-6 F-1 to F-6), C19.1 to C19.7:** each card is in the tree and recorded as done. Read and run: the usage text and exit codes of `archive-changelog.mjs` (probe below), the `  ! …` limit lines of `bump-round`, `test/status-text.mjs` and the grep test of `status-reads`, `npm run mutants:kit` in `README.md` and `CONTRIBUTING.md`, and the four slices of the kit list (`K-ARC-` 7, `K-BMP-` 13, `K-CMN-` 20, `K-VER-` 26 entries).
- **AUDIT-6 F-1 (limits by hand):** closed in the closing path: at exactly 5 «Previous», 10 «Done» and 11 rounds `bump-round --dry-run` prints no `  !` line (measured on the delivered tree; the test of C19.2 holds it); the archive limits are now said by `bump-round`, not first by a red test. **F-2 (unknown option archives):** closed for `archive-changelog.mjs`: `--help`, `-h` exit 0 with the usage, `--bogus`, `--status2` and a stray word exit 2, and the file hashes of the whole tree are unchanged after each (measured). **But see F-1 below: the same class is open in `bump-round.mjs`.** **F-3:** closed for the five tests that read the status file for a name; a sixth kind of fragility (tests that read a COUNT from the live file) is open (F-3 below). **F-4 (mutants:kit undocumented):** closed (the command is in `README.md`, `CONTRIBUTING.md`, `docs/README.md`, item 20 (c)); the figures next to it are stale (F-2 below). **F-5 (four files without mutants):** closed: each has a slice, 122 of 126 entries are red and the four others are explained (§6).
- **Gates:** G-C8 (a real Windows machine) and the exFAT/FAT part of G-C3 are open and are Rodrigo's; no card of M19 depended on them. A-2 is «depois» by Rodrigo's word.
- **ROADMAP wording:** the M19 header still says «D-256a to D-256e proposed», the C19.5 row still says «in progress» (and in the same sentence «the card's slices are done») and the C19.7 row still says «PROPOSED» although D142 and D-263a are CONFIRMED and M19 is complete (F-4).

## 2. What is good

- The whole `npm test` passes on the round 264 tree: **1613 tests, 1611 pass, 0 fail, 2 skipped, 473 s** (Node 22, Linux, 2 cores; round 264 reported 368 s on the same tree, the difference is the machine).
- The whole kit mutant list passes (§6): 126 entries, none survived unexplained, none stale or invalid.
- The cold start is unchanged: `CLAUDE.md` 6 578 bytes; the status file 42 646 bytes (limit about 60 KB) with 5 «Previous» blocks and 10 «Done» lines (both at their limit, nothing over); the two paragraphs that grow by hand are 1 114 and 2 835 bytes (limit 4 096); the CHANGELOG holds 11 rounds (limit 21).
- The probe of `archive-changelog.mjs` with five odd arguments changed nothing; `make-delivery-zip.mjs --help` exits 2 with a usage text and creates no file named `--help`; `chicla bump-round --bogus` exits 2 (`EUSAGE`) and leaves the status file alone. Those are the behaviours the product rules ask of the others.
- No new security finding: this round did not touch `zipkit.mjs`, the extractor or the recovery code (G-C5 is closed by Rodrigo after the sixth narrow pass), and M19 changed no file of `packages/chicla-zip/src/`.

## 3. Findings

- **F-1. `scripts/bump-round.mjs` treats an option it does not know as «do a real bump».** Measured on a copy of the tree: `node scripts/bump-round.mjs --help` printed `bump-round bump: seq 269 → 270`, renamed `CHICLA_PROJECT_STATUS-269.md` to `-270.md`, rewrote the three fingerprints, regenerated `FILES.manifest` and ended `exit 0`; so does `--verfy` (a typo of `--verify`), and `--verify --refresh` silently picks `--verify`. Item 8 of the status file says a number is never skipped or reused: a typo at the closing step burns one. The wrapper reads its flags with `args.includes`; the kit CLI (`chicla bump-round --bogus`) refuses with `EUSAGE`, exit 2. This is AUDIT-6 F-2 again for the one script where the default is a write that cannot be undone from inside the tree; the other scripts were run with unknown options too: `make-delivery-zip` exits 2 with its usage and creates no file named `--help`, `verify-delivery-zip` prints its usage; `check-manifest` ignores a misspelt `--write` and only checks (harmless); `check-build` ignores arguments (harmless); `emergency-dump` and `recovery-report` take any word as the note or the dump on purpose (`/dump` has no guards, rule 17).
- **F-2. The figures about the kit mutant list are stale in four places.** Counted: the list has **126** entries (`K-INT-` 41, `K-VER-` 26, `K-CMN-` 20, `K-BMP-` 13, `K-DMP-` 9, `K-ARC-` 7, `K-DEL-` 3, `K-REC-` 3, `K-MAN-` 2, `K-PNL-` 2). Item 20 (c) of the status file says «100 entries, minutes, 210 s for 60 in round 256, about 18 s per entry»; the header of `packages/chicla-kit/mutants/list.mjs` says «about 100 mutants, minutes»; `docs/README.md` names eight prefixes and lacks `K-CMN-` and `K-VER-`. Measured now: baseline 217 s, the 126 entries 1 853 s, **about 34 minutes** in all; the 26 `K-VER-` entries alone take 1 370 s (74 %), 2 to 142 s each, because they run the three test files that build zips. A newcomer who reads «minutes» starts a 34-minute job in the foreground.
- **F-3. A test still reads a COUNT from the live files, and goes red when the archives are run to their limits.** Measured: the copy archived to the limits (above) and the whole `npm test` on it: **1613 tests, 1608 pass, 3 fail** (463 s). The three are in `packages/chicla-kit/test/core-bump-round-limits.test.mjs` (C19.2's own tests): `assert.equal(base, 5)` and `addPrevious(1)` assume that the live status file has exactly 5 «Previous» blocks (and 10 «Done» lines), so «6 blocks print one line» is off by the difference whenever the files hold fewer: in the window between `--status --keep-previous 4` (or `--snapshot --keep-done 9`) and the round's own rotation, and after any deeper archive. Round 263 hit the same kind of thing for the CHANGELOG count (one red, fixed for the rounds only: `22 - the live count`); the status counts were left as they were. The five name tests of AUDIT-6 F-3 stayed green on that copy (the helper works).
- **F-4. The ROADMAP rows of M19 carry states that the status file and the CHANGELOG contradict.** Read: see §1. No code depends on it; the status file says that «the docs must be true» (item 5) and a session that greps the card gets «in progress» for a finished one.
- **F-5. The 348 mutants of the zip list were last run whole on 2026-10-17 (G-C14, by Rodrigo, output not shown), 8 `R170-*` never.** Read: the gate text. Since then no entry of the CHANGELOG, live or archived, from round 220 to 264 names `zipkit.mjs` or `chicla-zip/src` (grep), so the old result probably still describes the source; whether the tests as they are today still kill all 348 is what the run tells. Not measured here (30+ minutes, item 20 (f): only when Rodrigo asks).
- **F-6. Coverage, measured again (the whole `npm test` with `--experimental-test-coverage` over `packages/chicla-kit/src/**` and `scripts/**`, one run, 1613 tests, EXIT 0): all files 97.88 % lines, 92.11 % branches, 94.70 % functions.** The files M19 changed are covered: `bump-round.mjs` 100 % lines, 94.2 % branches; `archive-changelog.mjs` is outside the include. Every kit source has 100 % of its lines except three already explained in AUDIT-5 F-4 or the CHANGELOG of round 253: `emergency-dump.mjs` 90.3 % (191-195 and 336-367: reached, but their tests start the tool with a clean `env`, which drops the coverage variable; hand mutants `K-DMP-` go red), `recovery-report.mjs` 97.0 % (105-112, same cause, `K-REC-`) and **`make-delivery.mjs` 97.0 % lines, 81.3 % branches, lines 90-92: the outer `catch` of `makeDelivery`, the only place that returns `EDELIVERY_ERROR` for an exception** (it is the lines 88-90 where C18.6 found a defect; the fix is tested through the early refusal, the catch body itself still has no test; `K-DEL-02` is explained as equivalent for the same reason). One probe: an `out` whose parent is a file (ENOTDIR) does not reach it, it returns `EZIP_WRITE` from the narrower catch inside. Lowest branch figures: `make-delivery.mjs` 81.3 %, `check-build.mjs` 85.7 %, `recovery-report.mjs` 87.3 %, `update.mjs` 87.6 %, `emergency-dump.mjs` 90.7 %. The wrappers in `scripts/` read lower (`make-delivery-zip.mjs` 76.5 %, lines 27-34, the entry point; `bump-round.mjs` 50 % of branches) because their tests run them as child processes with a clean `env`: those figures are not a verdict.
- **F-7 (no defect).** Read, see §2: no security finding; the pin (`toolchain-digest 24014f88…`) did not move in M19 and `bump-round --verify` is green on the delivered tree.

## 4. Not measured

Not run by Claude in this round: the CI on GitHub, Node 18 and 20 (the whole suite ran on Node 22 only), `npm run smoke`, the 348 mutants of the zip list and the 8 `R170-*` ones, macOS, Windows, any fuzzing, a second run of the whole suite on the same machine (so the 368 s against 473 s difference is not explained beyond «the machine»). The probes of F-1 ran on a copy; nothing in the delivered tree was changed by them. F-6 is a measure of lines and branches, not of what a test asserts.

## 5. Plan, one round per card

One concern per round, tests first (red before the change), at most 3 source files and about 200 changed lines (CLAUDE.md working rules). Order below; C20.1 is next. The cards are PROPOSED (D143): Rodrigo confirms them.

### C20.1 `scripts/bump-round.mjs` refuses an option it does not know (F-1)

Source files: `scripts/bump-round.mjs`. 1.
Tests first: `--help` and `-h` print a usage and exit 0; `--verfy`, `--dry-runn`, a stray word, `--note` with no text, and `--verify` together with `--refresh`, `--dry-run` or `--note` each exit 2 with a usage text and leave the status file name, the three fingerprints and `FILES.manifest` as they were (compared by hash, as the probe did); `--verify`, `--refresh`, `--dry-run`, `--note <text>` and no argument still do what they did; one case in `scripts/smoke-test-bump-round.mjs`.
Pin: does not move (`scripts/bump-round.mjs` is a wrapper outside `RECOVER/`).
Done when: the probe of F-1 prints the usage, exits 2 and renames nothing, and a hand mutant per guarantee is red (`K-BMP-14` and up).

### C20.2 The limit tests stop assuming the live counts (F-3)

Source files: none (tests only). 0.
Tests first: `core-bump-round-limits.test.mjs` computes the filler it adds from the count it reads (`5 - base`, `10 - done`, `22 - rounds`) instead of asserting `base === 5`; a probe test copies the tree to a temp folder, archives it to `--keep-previous 1`, `--snapshot --keep-done 2`, `--keep 3` and runs that file: green (red first against the old test).
Pin: does not move.
Done when: the experiment of F-3 gives 0 red in the whole suite.

### C20.3 The kit list's figures and prefixes are true, and a test holds them (F-2, F-4)

Source files: none (docs and one test). 0.
Tests first: a test that derives the prefixes and the count from `packages/chicla-kit/mutants/list.mjs` and fails when `docs/README.md` lacks a prefix, when item 20 (c) or the header of the list carry a count that is not the list's (or no count at all), and that the time it names is the measured whole pass (about 34 minutes, 2 cores); the ROADMAP rows of M19 are brought to their real states by hand in the same round.
Pin: does not move.
Done when: `docs/README.md` names ten prefixes, item 20 (c) says the whole pass is about half an hour and to run it detached, and the M19 rows say done.

### C20.4 The zip list again, on Rodrigo's machine (F-5)

Source files: none (a run). 0.
Tests first: n/a. Rodrigo runs `npm run mutants` (348, 30+ minutes) and the 8 `R170-*` entries and sends the last lines; Claude records the count in the gate G-C14 line and files each survivor as a card.
Pin: does not move.
Done when: the run is recorded with its date and tree, or Rodrigo says «depois».

### C20.5 The outer `catch` of `makeDelivery` gets a test (F-6)

Source files: none expected; at most `packages/chicla-kit/src/make-delivery.mjs` (1) if a test cannot make a core throw from outside. 0 or 1.
Tests first: find a root in which a core called by `makeDelivery` throws instead of returning (for example `FILES.manifest` or `CHANGELOG.md` replaced by a folder, or a status file that is not a file), and assert `code: "EDELIVERY_ERROR"`, no zip left at `out`, and no exception out of `makeDelivery` (product rule 2); if no such root exists, say so in the card, keep the catch as a documented safety net and give it a hand mutant that returns `ok` (`K-DEL-04`) whose test calls the catch through a stub.
Pin: does not move (`make-delivery.mjs` is not pinned).
Done when: lines 90-92 are covered in the whole-suite coverage run, or the card says why they cannot be.

## 6. The whole kit mutant pass

`npm run mutants:kit`, run once on the round 264 tree, detached, on Node 22 (2 cores): baseline ok in 216.6 s, **126 mutants: 122 RED, 4 survive with a written reason** (`K-INT-19`, the map is already sorted; `K-DEL-02`, equivalent while the early refusal holds; `K-CMN-10`, the Windows backslash, equivalent on POSIX, a gate for a Windows run; `K-VER-25`, a zip64 entry count gives `EZIP_UNREADABLE` with or without the check), **none survived unexplained, none stale or invalid**; the mutant runs took 1 853 s in all (about 34.5 minutes with the baseline); `K-INT-` 219 s for 41, `K-CMN-` 179 s for 20, `K-BMP-` 27 s for 13, `K-DMP-` 15 s for 9, `K-DEL-` 31 s for 3, `K-ARC-` 6 s for 7, `K-VER-` 1 370 s for 26. Exit 0.

The pass proves the shape and the anchors of the list and that each guarantee still turns a test red on this tree; it does not prove that the list covers every guarantee, and the four survivors are the ones a reader may want to look at once: three are equivalent mutants, one (`K-CMN-10`) can only be settled on Windows.
