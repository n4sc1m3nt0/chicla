# Plan A-1: one integrity check instead of three

Round 242 (2026-10-26). Rodrigo: «avança para uma ronda só de plano do A-1, o A-2 fica para depois». This is D138 part 1, from AUDIT-4 §5 (`docs/audits/AUDIT-4.md`). Docs only: no source was changed, the pin did not move. Everything below was read from the tree of round 241 (v0.0.245, status file -246); the one experiment in §2 was run on a copy of it.

## 1. What A-1 asks

AUDIT-4 A-1: `check-manifest`, `verify-delivery` and `bump-round --verify` each know their own rules, which is how CRLF in `CLAUDE.md` passed all of them until round 233. One list of rules about the project's own state, called by the three, closes that kind of gap. This plan says what the list holds, where it lives, who calls it, and in which rounds it is built.

## 2. Who checks what today

Read from `check-manifest.mjs`, `verify-delivery.mjs`, `bump-round.mjs` and `pinned/policy.mjs`. «tree» is the project folder, «zip» is the delivery.

| Rule | `check-manifest` (tree) | `verify-delivery` (zip) | `bump-round --verify` (tree) |
| --- | --- | --- | --- |
| Names that never leave (`.env`, keys, Python artefacts) | yes, by its own predicates in `walk` (not by `neverShipReason`) | yes, `neverShipReason` | no |
| Junk names (`node_modules`, `.DS_Store`…) | `SKIP_NAMES` + its own `SKIP_FILES` | its own `JUNK` regex | no |
| Secret content (nine kinds) | yes | yes, on the zip's bytes | no |
| NFC/NFD collisions | yes | yes | no |
| File lost against the manifest or a previous zip | yes (paths only) | yes (paths, crc32, size, `--against`) | no |
| Baseline sha256 | no | yes | no |
| Exactly one status file | no (only lets the rename pass) | yes | yes |
| Fingerprint: `seq` of the status file against the CHANGELOG | no | yes (only this one) | yes (all three legs) |
| Fingerprint: app hash and CHANGELOG hash | no | **no** | yes |
| Toolchain pin (digest of the five `RECOVER/` files) | no | **no** | yes |
| CRLF | **no** | **no** | `CLAUDE.md` only |

The three bold cells are the gap. Experiment, on a copy of the round 241 tree: `CLAUDE.md` rewritten with CRLF, one hex digit of the pin changed, a line added to `CHANGELOG.md` after the bump. `bump-round --verify` printed three ✗ (pin, CHANGELOG hash, CRLF). `check-manifest` printed «no file lost». `make-delivery-zip` printed «delivery created and verified» and built the zip. So today a delivery can leave with a stale fingerprint, a pin that does not match and CRLF in the instruction file, as long as nobody ran `--verify` last. The closing kit puts `bump-round` before the zip, but nothing makes the zip step prove it.

Also seen: the status-file name regex `^CHICLA_PROJECT_STATUS-\d+\.md$` is written out in nine files (`check-manifest`, `bump-round`, `verify-delivery` twice, `panel`, `init`, `update`, `emergency-dump`, `recovery-report`, and `scripts/archive-changelog.mjs` twice), and the `TOOLCHAIN` map (which files the pin covers) is in `bump-round` and again, on purpose, in `emergency-dump` (D7).

## 3. Design

One new file, `packages/chicla-kit/src/integrity.mjs`. Rules:

- **Pure, no I/O.** It exports the rule list and `checkIntegrity(view, { groups })`. A `view` is `{ names: string[], read(name) -> Buffer | null }` (NFC names, bytes on request). The module never opens a file or a zip.
- **Each tool brings its own reader.** `check-manifest` and `bump-round` hand it a view of the disk; `verify-delivery` hands it a view built on its own reader of the zip (`bytesOf`, C8.2). That keeps rule 4 of `CLAUDE.md` (an independent reader): the code that checks a zip does not trust the code that wrote it, and the rules are data plus pure functions that both sides can read.
- **Groups.** `lf` (the files that must have LF only), `state` (exactly one status file; the three-way fingerprint, instruction 11 a to c), `pin` (the digest of the five files), `required` (the root files a delivery needs). A tool asks for the groups that make sense for it; a rule whose file is absent is skipped, as the CRLF row of `bump-round` already does, so a throw-away project in a test keeps working.
- **Results keep their shape.** `bump-round --verify` prints the same rows with the same labels in the same order (`test/fingerprint-docs.test.mjs` holds the order); `verify-delivery` adds `problems` that start with a code (`EINTEGRITY_LF`, `EINTEGRITY_PIN`, `EINTEGRITY_FINGERPRINT`, `EINTEGRITY_STATE`) and still ends in `EVERIFY_FAILED`; `check-manifest` stops with `EINTEGRITY_LF` and only warns for a missing required file. Tests assert codes, never text (rule 6).
- **Not pinned, not in `RECOVER/`.** `recovery-report` does not import it, so the digest of the five files does not move. `emergency-dump` does not import it either (D7: the dump must not depend on an import that can break); its own copy of the `TOOLCHAIN` map stays and a test ties it to the one in `integrity.mjs`, as `test/pinned-*-move.test.mjs` tie it today.
- **The LF list** (one place, exported): `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md` (the four files `chicla init` writes), the status file, `CHANGELOG.md`, `version.mjs`, `FILES.manifest`, `FILES.baseline.json`. `.gitattributes` (D112) keeps git from converting; this catches the other routes (an upload, an editor, a zip made on Windows).
- **`--against` zips are not held to the new rules**, as they are not held to `EUTF8_FLAG`: they come from other tools and only their names are compared.

## 4. What stays out of A-1

- **A-2** (fewer pinned modules, or a pin generated at build time): waits («depois», Rodrigo, 2026-10-26). Nothing here edits `baseline.mjs`, `manifest.mjs`, `policy.mjs`, `recovery-report.mjs` or `zipkit.mjs`.
- The other copies of the status-file regex (`panel`, `init`, `update`, `archive-changelog`): they live in other concerns and are not rules of the three tools. `emergency-dump` and `recovery-report` keep theirs by design (D7, and the pin). Only the three tools' copies (`check-manifest`, `bump-round`, `verify-delivery`) are replaced by one exported constant.
- A check of the crc32 and size of the files on disk against `FILES.manifest` in `check-manifest`: `check-build` runs before `bump-round` regenerates the manifest, so it would be red at every closing by design, and the zip is built from the regenerated manifest anyway (`verify-delivery` already compares crc32 and size with the zip). Not proposed.
- `check-build`'s own skip list (`node_modules`, `.git`, `__MACOSX`): harmless, it only decides which `.mjs` files are syntax-checked.

## 5. Plan, one round per card

One concern per round, tests first (red before the code), at most 3 source files and about 200 changed lines (`CLAUDE.md` working rules). Order below; C17.1 is next once Rodrigo confirms §6.

### C17.1 The module, the LF rule, `bump-round` and `check-manifest` call it

- **Source files:** `packages/chicla-kit/src/integrity.mjs` (new), `bump-round.mjs`, `check-manifest.mjs`.
- **Tests first:** `core-integrity.test.mjs` (pure, fake views: LF list with and without CRLF in each file, an absent file is skipped, the status-file constant, the groups); `bump-round --verify` prints the same rows in the same order with the LF row from the module (the existing `fingerprint-docs` order test stays green); `check-manifest` stops with `EINTEGRITY_LF` on a CRLF `CLAUDE.md` and stays green on an absent one. All red before the code.
- **Pin:** does not move (`integrity.mjs` is outside `RECOVER/`; `bump-round --verify` proves it).
- **Done when:** the three tools above call one LF list and one status-file regex; `npm test` green; hand mutants (drop a file from the list, invert the test, skip the absent-file rule) each turn a test red.

### C17.2 State and pin rules in the module, and `verify-delivery` calls all of them

- **Source files:** `integrity.mjs`, `verify-delivery.mjs`, `bump-round.mjs`.
- **Tests first:** a delivery zip built by `zipfab` with (a) CRLF in `CLAUDE.md`, (b) a pin that differs from the five files in the zip, (c) a `CHANGELOG.md` whose hash is not the one in the fingerprint, (d) two status files: each must be `EVERIFY_FAILED` with its own `EINTEGRITY_*` code; the same zip without the fault passes; the experiment of §2 repeated as a test (red today). The `TOOLCHAIN` map moves from `bump-round` into `integrity.mjs`, so the tests that read it from `bump-round.mjs` (`test/pinned-*-move.test.mjs`, through `test/toolchain-files.mjs`) are updated first.
- **Pin:** does not move (same five files, same map content; `--verify` proves it).
- **Done when:** the experiment of §2 ends in a rejected zip; `bump-round --verify` still prints the same rows; no zip of the existing suites changes verdict (a zip without `version.mjs` skips the fingerprint rows, see D-242c); hand mutants red.

### C17.3 One list of names: tests that tie the two walkers

- **Source files:** none expected (tests only); if the tests find a divergence in `policy.mjs`, that fix is a new card, because the pin would move.
- **Tests first:** a differential test: for a corpus of names (`.env`, `.env.example`, `id_rsa`, `a/.ssh/x`, `x.pem`, `.npmrc`, `app.pyc`, `__pycache__/x`, `node_modules/x`, `.DS_Store`, `tsconfig.tsbuildinfo`, names in NFD, a policy `names` and `paths`), `check-manifest` leaves out exactly what `neverShipReason` or `policySkips` says, and `verify-delivery` rejects exactly what `neverShipReason` or its `JUNK` says; a new rule in `policy.mjs` that one tool does not follow turns it red.
- **Pin:** does not move (no pinned file edited).
- **Done when:** the corpus agrees in both tools, or each difference is named and decided by Rodrigo; hand mutants (add a name to one list only) red.

### C17.4 The rules documented, and the docs held to the code

- **Source files:** none (docs and tests); `integrity.mjs` only gets a comment header if one is missing.
- **Tests first:** `test/integrity-docs.test.mjs`: `docs/integrity.md` exists, lists every rule id the module exports, who calls it and the `EINTEGRITY_*` codes, and `docs/README.md` lists it (red until the doc exists, like `fingerprint-docs`).
- **Pin:** does not move.
- **Done when:** `docs/integrity.md`, a pointer in `docs/fingerprint.md` and `docs/manifest.md`, the kit README and the status file's Map say the same as the code; `npm test` green.

## 6. Open decisions

**CONFIRMED by Rodrigo, 2026-10-26: «sim» to all four** (he answered after the round 242 delivery; recorded in round 243). The text below is the proposal as he saw it.

- **D-242a (shape).** One new module, pure, not pinned, outside `RECOVER/`, each tool bringing its own reader (§3). Claude suggests yes: it is the only shape that keeps the verifier independent of the writer and does not move the pin.
- **D-242b (a stricter delivery).** `verify-delivery` rejects a zip with CRLF in an instruction or state file, a pin that does not match, or a stale fingerprint, which today pass (§2, the experiment). Claude suggests yes: it is the point of A-1. The cost is that a round closed by hand in the wrong order is refused by the zip step instead of by a later `--verify`.
- **D-242c (what «absent» means).** A rule whose file is absent is skipped (a project without `version.mjs`, or a fake project in a test, keeps working), and a missing required root file is only a warning in `check-manifest` (a failure in `verify-delivery` where it already is one). Claude suggests yes; the known limit is that deleting `version.mjs` from a delivery skips the fingerprint rows, which the lost-file check against the previous zip still catches.
- **D-242d (order).** C17.1 to C17.4 in that order, one round each; A-2 stays «depois». Claude suggests yes, and C17.1 as the next task.
