# integrity: the rules about the project's own state

One module, `packages/chicla-kit/src/integrity.mjs`, holds the rules that say whether the project's own files are consistent: the line endings of the instruction and state files, the toolchain pin, the status file and the three-way fingerprint. Before round 243 each of `check-manifest`, `verify-delivery` and `bump-round --verify` knew a different part of them, and a delivery could leave with CRLF in `CLAUDE.md`, a pin that did not match and a stale fingerprint (the experiment is in `docs/plan-a1-integrity.md` §2). The cards are C17.1 to C17.4 (D140; D-242a to D-242d, Rodrigo, 2026-10-26).

## Design

- The module is pure: no import, no I/O, no crypto. It works on a view, `{ names: string[], read(name) -> Buffer | null }`, and the caller passes `sha256(Buffer) -> hex`.
- Each caller brings its own reader: the disk for `bump-round` and `check-manifest`, its own reader of the zip for `verify-delivery` (C8.2). So the check of a zip never trusts the code that wrote it (`CLAUDE.md`, working rule 4).
- It is not pinned and not in `RECOVER/`: `recovery-report` and `emergency-dump` do not import it, so the toolchain digest does not move. `emergency-dump` keeps its own copy of the `TOOLCHAIN` map (D7: a dump must not depend on an import that can break); a test ties the two.
- A rule whose file is absent is skipped (D-242c): no `version.mjs` or no CHANGELOG, no fingerprint rows; no pin in `CLAUDE.md` or a missing toolchain file, no pin row. A file that is there but malformed is a failing row.

## Exports

| Export | What it is |
| --- | --- |
| `STATUS_FILE_RE` | The one status-file name, `CHICLA_PROJECT_STATUS-<N>.md` in the root. |
| `LF_FILES` | The files that must have LF line endings only (below), plus the status file. |
| `checkLf` | The LF rule over a view; `skip` leaves out files a `--write` is about to regenerate. |
| `TOOLCHAIN` | RECOVER/ name to source path of the five files the pin covers. |
| `PIN_RE` | The `toolchain-digest: <64 hex>` line of `CLAUDE.md`. |
| `toolchainDigest` | sha256 of the lines `sha256sum RECOVER/*.mjs` prints (sorted by name); null when a file cannot be read. |
| `checkPin` | The pin rule. |
| `FP`, `PARA` | The fingerprint line of `version.mjs` and `CHANGELOG.md`, and the «Fingerprint:» paragraph of the status file. |
| `tailFrom`, `lineOf` | `tail -n +n` in bytes, and line n as text (what the hashes cover). |
| `checkState` | Exactly one status file, then the seven fingerprint rows. |
| `checkIntegrity` | All the rules in the order `bump-round --verify` prints them: pin, state and fingerprint, lf; `groups` picks some. |

## Rules

A row is `{ id, file, label, ok }`. The code is what `verify-delivery` makes of a failing row: `EINTEGRITY_` plus the id in capitals.

| `id` | Rule | Code |
| --- | --- | --- |
| `lf` | No CRLF in `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `CHANGELOG.md`, `version.mjs`, `FILES.manifest`, `FILES.baseline.json` and the status file. A bare CR is not CRLF. | `EINTEGRITY_LF` |
| `pin` | The `toolchain-digest` in `CLAUDE.md` equals the digest of `baseline.mjs`, `manifest.mjs`, `policy.mjs`, `recovery-report.mjs` and `zipkit.mjs` (sources: `packages/chicla-kit/src/pinned/baseline.mjs`, `packages/chicla-kit/src/pinned/manifest.mjs`, `packages/chicla-kit/src/pinned/policy.mjs`, `packages/chicla-kit/src/pinned/recovery-report.mjs`, `packages/chicla-zip/src/zipkit.mjs`). | `EINTEGRITY_PIN` |
| `state` | There is exactly one status file in the root. With none or two, no fingerprint row is produced. | `EINTEGRITY_STATE` |
| `fingerprint` | The seven rows of `docs/fingerprint.md` (the `seq` of the app file, the CHANGELOG and the status paragraph equals the status file number; `file=`; `app=`; the app hash; the CHANGELOG hash), or one failing row when a leg cannot be read. | `EINTEGRITY_FINGERPRINT` |

## Who calls it

| Caller | Reader | What it does with the rows |
| --- | --- | --- |
| `bump-round` (`--verify` and the final check of a bump) | the disk | Prints each row; the `CLAUDE.md` LF row is always printed, last, and other LF rows only when they fail. Result `EBUMP_VERIFY`. |
| `verify-delivery` (also `make-delivery-zip`) | its own reader of the zip | Each failing row is a problem starting with its code; the result stays `EVERIFY_FAILED`. The `--against` zips are never held to the rules: they come from other tools and only their names are compared. |
| `check-manifest` | the disk | Only the LF rule: `EINTEGRITY_LF` in check and in `--write` (which skips the manifest and the baseline it is about to regenerate). |

## Held to the code

`test/integrity-docs.test.mjs` fails when this page misses an export, a rule id, an `EINTEGRITY_` code, a file of `LF_FILES` or `TOOLCHAIN`, or a caller that does not import the module. The rules themselves are tested in `packages/chicla-kit/test/core-integrity.test.mjs` and `core-integrity-state.test.mjs`; `docs/fingerprint.md` has the rows and `docs/manifest.md` the codes.
