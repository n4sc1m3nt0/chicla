# Plan A-2: what an edit of a pinned file really costs

Round 270 (2026-10-28). Rodrigo: «vamos avançar com o a-2» (he does not want things left open for «depois»). This is D138 part 2, from AUDIT-4 §5 (`docs/audits/AUDIT-4.md`), which asked for «fewer pinned modules, or a pin generated at build time, because each edit of a pinned file costs a round of follow-ups». Docs only: no source was changed, the pin did not move. Everything below was read from the tree of round 269 (v0.0.273, status file -274); the experiment in §2 was run on a copy of it.

## 1. What A-2 asks

AUDIT-4 A-2 rests on one claim: an edit of a pinned file costs a whole round of follow-ups (round 233 needed the pin, a docs table and a test that held an old sha256). It proposes two remedies: fewer pinned modules, or a pin generated at build time. Before choosing a remedy this plan measures the claim, because a remedy for a cost that is smaller than believed would only add risk to the recovery path (D7).

## 2. What an edit of a pinned file costs today (measured)

The five pinned files are `baseline.mjs`, `manifest.mjs`, `policy.mjs`, `recovery-report.mjs` (all in `packages/chicla-kit/src/pinned/`) and `packages/chicla-zip/src/zipkit.mjs`. Experiment, on a copy of the tree: append ONE comment line to a pinned file, run `node scripts/bump-round.mjs --refresh` (it rewrites the pin in `CLAUDE.md` and the manifest), run `bump-round --verify`, then `npm run test:fast` and `npm run test:slow`.

| Edit | `bump-round --verify` after `--refresh` | Fast suite (1580 tests) | Slow suite (52 tests) |
| --- | --- | --- | --- |
| `policy.mjs`, one comment line | green, new digest `ee0bda0542ce` | 1 test red of 1580: `pinned-policy-move.test.mjs`, «the file is byte-identical to the one that was pinned» (it compares the sha256 of the file with one frozen in round 130) | 52 of 52 green |
| the other four in one go (`baseline.mjs`, `manifest.mjs`, `recovery-report.mjs`, `zipkit.mjs`), run on the pin-related test files only | green, new digest `1ccd55b604e4` | 4 red of 60 in those files: one each in `pinned-baseline-move`, `pinned-manifest-move`, `pinned-recovery-report-move` (it reverses five patches by hand to get back to the pinned bytes) and the policy one again; `zipkit.mjs` turned nothing red | not run again |

What this says:

1. **The pin itself costs nothing by hand.** `bump-round` writes the digest, `--verify` checks it, the value lives in one file (`CLAUDE.md`; a search of the tree finds it nowhere else outside the history).
2. **The whole follow-up cost is four tests.** `pinned-baseline-move`, `pinned-manifest-move`, `pinned-policy-move` and `pinned-recovery-report-move` were written in rounds 128 to 133 to prove that a MOVE of a file (from `scripts/` into `src/pinned/`) changed no byte. That proof was useful then. It is now a frozen sha256 (three of them) and a chain of reverse patches (the fourth), so every legitimate edit of those four files turns exactly one test red, and the fix is to edit a constant or add another `.replace`. `zipkit.mjs` has no such test, so edits of it cost only the pin.
3. **How often it happens.** A search of the CHANGELOG wording finds 31 of 273 round entries that say the pin moved (a text search, not git history, so read it as an order of magnitude); 17 of them are rounds 170 to 210 titled G-C5, C15.x or ZIP-nnn, the security review of `zipkit.mjs`, which is finished (G-C5 closed). The last three are rounds 233, 234 and 239; none in the 30 rounds since (240 to 269).
4. **The one cost that is not a test** is the gate: after a pin move, Rodrigo repeats `/dump` and «recovery mode» once on a real dump (G-C11 did that after the move of round 133). That is deliberate and stays.

## 3. The two halves of A-2, read against the tree

**A generated pin: already true.** `bump-round` writes the pin into `CLAUDE.md` and `--verify` checks it; the start line of item 17 recomputes it in the shell. There is nothing left to generate, so this half is closed by saying so and by holding it with a test (C21.2): the digest literal appears in `CLAUDE.md` only.

**Fewer pinned modules: rejected.** Merging `baseline`, `manifest` and `policy` into `recovery-report` would make one file instead of four, but the kit cores import the three libraries on their own (`check-manifest`, `verify-delivery`, `make-delivery`, `emergency-dump`), so they would have to import a recovery tool to read a manifest, or the code would be copied. It would change the five names of `RECOVER/`, which the start line of item 17 and every old dump depend on, and it would touch the one path that must work when everything else is broken (D7), all to remove a cost that is four stale tests. A narrower zip reader for recovery instead of `zipkit.mjs` is the same trade (a second implementation to keep in step) and is not proposed.

**What fixes the real cost:** the four move tests keep what is still true (the helper points at the file, the old shim is gone, the exports, the two `TOOLCHAIN` maps, the cores import the pinned file directly) and drop what froze the bytes. The guard that the toolchain is the intended one is the pin itself (`--verify`, `toolchain-pin.test.mjs`), which moves with `bump-round` as it should. A new test then proves the claim of this plan and keeps it true: on a copy, a one-line edit of EACH of the five pinned files plus `bump-round --refresh` leaves the pin-related tests green (C21.1).

## 4. What stays out of A-2

- The pin value, its place in `CLAUDE.md` and the shell start line of item 17: unchanged, byte for byte.
- `RECOVER/` and its five names, flat: unchanged. `emergency-dump` keeps its own `TOOLCHAIN` map and imports no sibling of `src/` (D7, D89); `recovery-report` keeps importing its three siblings by `./`.
- `zipkit.mjs` stays in the pin and stays the one zip reader of recovery; no narrower reader.
- The gate after a pin move (a real `/dump` and «recovery mode», G-C11) stays Rodrigo's and is not automated.
- No source file changes in this milestone: both cards are tests and docs, and the pin does not move.

## 5. Plan, one round per card

### C21.1 The four move tests stop freezing bytes, and a test holds that an edit of any pinned file costs only `bump-round`

- **Source files:** none (tests only).
- **Tests first:** `test/pinned-edit-follow-ups.test.mjs`: copy the tree, append one comment line to each of the five pinned files in turn, run `bump-round --refresh`, then run the pin-related test files in the copy (the four move tests, `toolchain-pin`, `core-integrity-state`, `fingerprint-docs`) and assert they pass and that `--verify` is green. Red first: four of the five subtests are red on today's tree (all but `zipkit.mjs`). The fix is in the four move tests: remove the frozen sha256 and the reverse patches, keep the structural assertions (each keeps at least four tests).
- **Pin:** does not move (no pinned file is edited in the tree; the copies are thrown away).
- **Done when:** the five subtests are green, the four move tests keep their structural tests, and the whole `npm test` is green.

### C21.2 The cost is written down once, and a test holds that the digest has one home

- **Source files:** none (docs and one test).
- **Tests first:** `test/pinned-cost-docs.test.mjs`: `docs/pinned-files-design.md` (or `docs/integrity.md`) has a section «What an edit of a pinned file costs» that names the steps (edit, `bump-round`, `--verify`, the whole `npm test`, the gate for a real dump) and says that the move tests no longer freeze bytes; the 64-hex digest of the `toolchain-digest:` line of `CLAUDE.md` occurs in no other file of the manifest (history in the CHANGELOG and the status archives excepted); D138 and AUDIT-4 A-2 are marked closed. Red until the section and the marks exist.
- **Pin:** does not move.
- **Done when:** the section exists, the test is green, D138 says «A-2 closed (round N)», and `docs/README.md` points at the section.

## 6. Open decisions

- **D-270a. How A-2 is read.** The pin is already generated, merging pinned modules is rejected, and the fix is the four stale tests (§3). Claude suggests: yes.
- **D-270b. C21.1: drop the frozen sha256 and the reverse patches from the four move tests.** This gives up the proof that the files are byte-identical to what was pinned when they moved in rounds 128 to 133; the move is 140 rounds old, the pin guards the files from now on, and G-C11 repeated the real dump. Claude suggests: yes.
- **D-270c. C21.1: the executable test of the claim (an edit of any pinned file, then `bump-round --refresh`, leaves the pin-related tests green).** It runs the tree copy five times and takes about a minute. Claude suggests: yes; if it is too slow it can run the five edits in one copy.
- **D-270d. C21.2: the cost documented, the digest-has-one-home test, D138 closed.** Claude suggests: yes, and that Rodrigo says «avança» for both cards in one go (C21.1 then C21.2, one round each), since he does not want A-2 left open.
