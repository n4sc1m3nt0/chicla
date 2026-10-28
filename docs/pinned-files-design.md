# Moving the four pinned files into the kit package

Design note, round 127 (C11.1 slice 5g; D90 confirmed, D91 proposed). No code was changed to write it. Everything below was read from the tree of round 126 (v0.0.129).

## 1. What is pinned, and what depends on it

The recovery path has to run when everything else is broken (D7). So an emergency dump carries its own copy of five files in a flat, ASCII-named `RECOVER/` folder, and `CLAUDE.md` pins one digest over them:

| In `RECOVER/` | Source today | Lines | Imports (besides `node:`) |
| --- | --- | --- | --- |
| `baseline.mjs` | `scripts/baseline.mjs` | 44 | none |
| `manifest.mjs` | `scripts/manifest.mjs` | 58 | none |
| `policy.mjs` | `scripts/policy.mjs` | 133 | none |
| `recovery-report.mjs` | `scripts/recovery-report.mjs` | 252 | `./baseline.mjs`, `./manifest.mjs`, `./policy.mjs`; zipkit from `./zipkit.mjs` if present, else `../packages/chicla-zip/src/zipkit.mjs` |
| `zipkit.mjs` | `packages/chicla-zip/src/zipkit.mjs` | (zip package) | none |

The digest is `sha256` of the lines `sha256sum RECOVER/*.mjs` prints (sorted by name). It is computed in three places that must agree: the shell start line of item 17, `recovery-report` (`--toolchain-digest`) and `bump-round` (writes the pin, `--verify` checks it). Two copies of the name-to-source map exist on purpose: `TOOLCHAIN` in `emergency-dump` (what the dump copies) and in `bump-round` (what the pin hashes).

Who names these files by path today: the four cores in `packages/chicla-kit/src/` that import them (`check-manifest`, `verify-delivery`, `make-delivery`, `emergency-dump`: `../../../scripts/<name>.mjs`), the two `TOOLCHAIN` maps, `cli.mjs` (`SCRIPTS`), the `scripts/` wrappers, 3 smoke scripts and about 40 test files whose fake projects copy them (42 files in all).

## 2. What must not change

1. `RECOVER/` stays flat, with the same five ASCII names. The start line of item 17 and the definition of the digest do not change, so nothing in the shell or in a dump from an older round breaks.
2. The pinned files import each other with `./` and nothing else from the tree, so they work unchanged from `RECOVER/`. The only exception stays zipkit, with its fallback.
3. `emergency-dump` keeps importing no sibling of `src/` (D89).
4. The shell still checks the digest BEFORE running anything from the zip (C9.4).

## 3. Options

- **A. Close C11.1 here, the four stay in `scripts/`.** Cheapest and risk-free for recovery. Against it: the kit package keeps reaching two folders up into `scripts/`, so `chicla-kit` cannot be installed from npm on its own (D41), and D50, D60 and D84 say everything in the roadmap is built before 0.1. D84 dropped this once; revisiting it is Rodrigo's call.
- **B. Move all four together into one folder of the kit, keeping their names (recommended).** The `./` imports stay byte for byte, so only one pinned line changes (the zipkit fallback of `recovery-report`).
- **C. Move the three libraries, leave `recovery-report` in `scripts/`.** It would then need two ways to find its siblings (`./` in `RECOVER/`, a long path in the tree), the same trick zipkit already needs, now for three files, in the file that must be most trustworthy. Rejected.

## 4. Recommended design (B)

- **Where:** `packages/chicla-kit/src/pinned/` (flat). One folder means "this is the recovery toolchain" is visible in the tree, and a test can assert that the folder, the two `TOOLCHAIN` maps and `RECOVER/` list the same names. The folder name is open to change.
- **The pin:** the three libraries move byte-identical, so the digest does NOT change in that slice (`bump-round --verify` passes and the pin line in `CLAUDE.md` is untouched: a free proof that nothing else moved). It moves exactly once, when `recovery-report` moves: its zipkit fallback becomes `../../../chicla-zip/src/zipkit.mjs`.
- **`scripts/`:** `recovery-report.mjs` becomes a wrapper like the other cores. The three libraries get one-line re-export files only while the move is in flight.
- **Paths to update:** the two `TOOLCHAIN` maps (source side only), the four cores' imports (`../../../scripts/x.mjs` to `./pinned/x.mjs`), `cli.mjs`, and the comment in `cli.mjs` that says the kit cannot be published alone.
- **Tests:** about 40 fake projects copy these files. Today each test keeps its own copy list, which is why rounds 120 to 126 each touched 4 to 12 tests. A single helper (`test/toolchain-files.mjs`, the list of files a fake project needs) makes this the last time.

## 5. Slices

| Slice | What | Pin | Source files touched |
| --- | --- | --- | --- |
| 6a | `baseline`, `manifest`, `policy` move to `src/pinned/`; re-export shims stay in `scripts/`; the two `TOOLCHAIN` maps point at the new files; the shared test helper | unchanged (checked by `--verify`) | 3 moved + 3 shims + 2 maps; every edit is a rename or one line |
| 6b | `recovery-report` moves, the zipkit fallback line changes, `scripts/recovery-report.mjs` becomes a wrapper | moves once | 1 moved + 1 wrapper + 2 maps |
| 6c | shims deleted; the four cores, `cli.mjs` and the wrappers import `./pinned/…`; comment fixed; README | unchanged | 4 cores + `cli.mjs` + the scripts; one line each |

6a and 6c exceed rule 16 (3 source files) in file count, not in size; they would need the same kind of one-time exception D36 gave. The alternative is one library per slice (three rounds instead of one for 6a, each with 4 files).

## 6. Risks and checks

- **Recovery is the thing that cannot fail.** A moved file is checked mechanically (same digest in 6a), but a real dump taken from the new layout, extracted by the start line in a clean session, is what G-C7 rehearsed. Proposed new gate G-C11 (Rodrigo only): repeat `/dump` and «recovery mode» once after 6b.
- **Stale paths:** the two `TOOLCHAIN` maps are the dangerous place (a wrong source path makes a dump with a hole in `RECOVER/`). The existing dump tests read `RECOVER/` back; 6a adds an assertion that all five entries exist and hash to the pin.
- **Not covered by this note:** moving `check-build`'s smoke tests, `archive-changelog`, `mutants` (they stay in `scripts/`; they are not part of the recovery path).

## 7. Noticed, not fixed

After 6c the kit still needs `packages/chicla-zip` (the zip writer is loaded by relative path in `make-delivery` and in the dump). Publishing `chicla-kit` alone would need it as a dependency of the kit (an own package, not a third-party one, so D3 may not even apply) or a copy. That is a separate decision for when C11.1 closes; it is not proposed here.

## 8. What an edit of a pinned file costs

Added in round 272 (C21.2; plan `docs/plan-a2-pins.md`, D138 part 2, D144). Sections 1 to 7 are the design of the moves of rounds 127 to 133; this one says what it costs to change a pinned file today, measured in round 270 on a copy of the tree: one comment line in a pinned file plus `bump-round --refresh` turned one test red of 1632 (the `pinned-*-move` test of that file, which froze its bytes), and `zipkit.mjs` turned none. Those four tests no longer freeze bytes (C21.1, round 271), so the steps are these and no others:

1. **Edit** the file: `baseline`, `manifest`, `policy` or `recovery-report` in `packages/chicla-kit/src/pinned/`, or `zipkit.mjs` in `packages/chicla-zip/src/`.
2. **`node scripts/bump-round.mjs`** (the closing kit, item 13): it writes the new digest into `CLAUDE.md` and regenerates `FILES.manifest`. The digest lives in `CLAUDE.md` and nowhere else (`test/pinned-cost-docs.test.mjs` holds it, history in the CHANGELOG files and the status archives excepted), so there is no second copy to update.
3. **`node scripts/bump-round.mjs --verify`**: green. It recomputes the digest from the five files and compares it with `CLAUDE.md`; the shell start line of item 17 does the same before it runs anything from a dump.
4. **The whole `npm test`**, once, as in every round. The `pinned-*-move` tests keep only what is structural (the helper path, the shim is gone, the exports, the two `TOOLCHAIN` maps, the cores import the pinned file) and `test/pinned-edit-follow-ups.test.mjs` proves, on a copy and for each of the five files, that one edit followed by `bump-round --refresh` leaves the tests that read the pinned files green.
5. **The gate, Rodrigo's:** after a round that moved the pin, repeat `/dump` and «recovery mode» once on a real dump (G-C11 did it after the move of round 133). The AI never marks it done and it is not automated: it is the one check that the recovery path still works when everything else is broken (D7).

What an edit does NOT cost any more: a frozen sha256 or a chain of reverse patches to edit by hand. What it never costs: a change to the five names of `RECOVER/`, to the start line of item 17 or to the definition of the digest. Fewer pinned modules was considered and rejected (plan §3): the kit cores import the three libraries on their own, and the five names are what every old dump carries.
