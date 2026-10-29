# Chicla

Project memory for coding agents that survives sessions, accounts and usage limits. Plain Node, **zero dependencies**, Node 18+, ESM.

An agent forgets everything between sessions. Chicla makes the repository itself the memory: a status file, fingerprints that prove the files belong together, a verified delivery zip, and an emergency dump that can restore the work when a session is cut off.

> **Status: released.** `chicla-zip` and `chicla-kit` are published on npm at `0.1.0` (tags `chicla-zip-v0.1.0` and `chicla-kit-v0.1.0`, each with a GitHub release; the owner published them on 2026-10-22). The tree is at `0.1.1` for both (round 276: `chicla-zip` changes its README only, `chicla-kit` carries the fixes of rounds 231 to 275); the runbook is in [`docs/release.md`](docs/release.md) and only the owner publishes it. The root package is private. Use everything from this repository. Security: [`SECURITY.md`](SECURITY.md). Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md). Only the owner publishes; the licence is decided (Apache-2.0).

## What is in here

Chicla has two pieces, in `packages/`:

| Package | What it is | State |
| --- | --- | --- |
| [`chicla`](packages/chicla/README.md) | **The package to install** (D148): `npm install chicla` gives the `chicla` command (the workflow), the `chicla-zip` command and the zip library at `chicla/zip`, with no dependencies. Assembled when it is published from the two source folders below (`scripts/build-chicla.mjs`). | Built and tested (round 280); `0.2.0` waits for the owner to publish it (G-C16) |
| [`chicla-zip`](packages/chicla-zip/README.md) | Read, verify, safely extract, **write** and repair zips, with correct UTF-8 names in every reader. | Source of the zip module of `chicla`; the name on npm (`0.1.0`, `0.1.1`) is to be deprecated in favour of `chicla` (D148) |
| `chicla-kit` | The workflow: state file, fingerprints, "never leaves" policy, manifest, verified delivery, `/dump` and recovery. Ships the `chicla` command. | Six subcommands built; the cores are being moved from `scripts/` into the package, one slice at a time (`check-build` and `check-manifest` are done); source of the kit part of `chicla`, its name on npm (`0.1.1`) is to be deprecated (D148) |

The kit depends on `chicla-zip` only through its public API. The package `chicla` has no dependencies: it ships the kit and the zip module together (D148); `chicla-zip` and `chicla-kit` are the two source folders it is assembled from, `private` since round 281 (npm refuses to publish them, and `pack-release` refuses to pack them), and are not published any more.

## chicla-zip in one minute

A zip is hostile input. The extractor validates the whole archive before writing, extracts into a temporary folder and renames at the end (a failure leaves the destination untouched), never follows or creates symlinks, and never trusts names, sizes or counts from the archive. What the writer produces is accepted by `unzip -t` and by Python's `zipfile`.

```js
import { openZip, testZip, extractZip, writeZip, createZip } from "chicla-zip";

const z = openZip("in.zip");                       // z.entries, z.read(name), z.close()
await testZip("in.zip");                           // every CRC and size, streaming
await extractZip("in.zip", "out/", { maxTotalBytes: 2 ** 30 }); // atomic; errors are ZipError with a `code`

await writeZip("a.zip", [{ name: "café.txt", data: Buffer.from("hi") }], { deterministic: true });
await createZip("b.zip", "folder/", { exclude: (rel) => rel.endsWith(".log"), stream: true });
```

```
chicla-zip ls|test|mark <zip> [--json]
chicla-zip cat <zip> <name>
chicla-zip extract <zip> <folder> [--overwrite] [--max-bytes N] [--json]
chicla-zip create <out.zip> <folder> [--exclude GLOB]... [--stream] [--deterministic] [--overwrite] [--json]
```

Full details, options and known limits: [`packages/chicla-zip/README.md`](packages/chicla-zip/README.md) and [`docs/zip-handling.md`](docs/zip-handling.md). Not supported: encryption, methods other than stored and deflate, multi-part archives. Windows: `chicla-zip` is supported on Node 18, 20 and 22 (the whole suite runs on `windows-latest` in CI; see `packages/chicla-zip/README.md`); `chicla-kit` is not declared supported yet.

## chicla-kit: the `chicla` command

```
chicla init [--json] [--root <dir>]
chicla check-manifest [--write] [--json] [--root <dir>]
chicla bump-round [--verify | [--refresh] [--dry-run] [--note <text>]] [--json] [--root <dir>]
chicla verify-delivery <zip> [--against <zip>]... [--allow-removed <path>]... [--json] [--root <dir>]
chicla make-delivery <out.zip> [--against <zip>]... [--allow-removed <path>]... [--json] [--root <dir>]
chicla dump [note...] [--note <text>] [--project-only] [--outdir <dir>] [--json] [--root <dir>]
chicla recovery <dump.zip> [--baseline <zip>] [--out <dir>] [--toolchain-digest <hex>] [--trust-toolchain] [--json]
```

| Command | What it does |
| --- | --- |
| `init` | Starts a project: writes `CLAUDE.md` and `AGENTS.md` (the rules for state, policy, dump and delivery) and the state files `CHICLA_PROJECT_STATUS-1.md`, `CHANGELOG.md`, `version.mjs` and `FILES.manifest`, with the fingerprint already consistent (`bump-round --verify` passes at once). It never overwrites: if any of them, or any status file, exists, nothing is written and it exits 1. |
| `check-manifest` | Checks `FILES.manifest` (every project file, with crc32 and size) against the disk; `--write` regenerates it. A listed file that vanished is a lost file and fails. |
| `bump-round` | Closes a round: renames `CHICLA_PROJECT_STATUS-N.md` to `N+1`, rewrites the three-way fingerprint, regenerates the manifest and verifies. `--verify` only checks; `--refresh` keeps the number; `--dry-run` writes nothing. |
| `make-delivery` | Builds the delivery zip of the **whole** tree: manifest check against the previous zips, build check, manifest, baseline, zip, verification. A rejected zip is deleted. |
| `verify-delivery` | The independent check of a finished zip: whole tree, manifest, crc32 and size against the central directory, baseline, no junk, no secrets. |
| `dump` | Emergency zip of the working directory with no guards, for when a session is about to end. It always tries to produce a zip; secrets and `node_modules/` stay out. |
| `recovery` | Restores an emergency dump: extracts, verifies, compares with a baseline and writes `RECOVERY_DIFF.md`. |

Exit codes: `0` ok · `1` the check failed (for `dump`: no dump was made; for `recovery`: nothing recovered) · `2` usage error · `3` toolchain digest mismatch (`recovery`). With `--json`, stdout is exactly one JSON object and the human text goes to stderr. The workflow scripts in `scripts/` run the same code and remain the entry points the process documents use today.

## How the workflow works

- **State lives in the repo.** `CLAUDE.md` holds the product and working rules; `CHICLA_PROJECT_STATUS-N.md` holds the process rules, the snapshot, "Next up" and the gates; `CHANGELOG.md` holds recent rounds; `ROADMAP.md` is the plan. Exactly one status file exists, and its number rises by one on every output.
- **Fingerprints.** `version.mjs`, `CHANGELOG.md` and the status file carry one triple (`seq`, app hash, changelog hash). `chicla bump-round --verify` fails when they disagree, which catches a file edited elsewhere or a stale copy.
- **One small slice per round.** At most three source files and about 200 changed lines; tests first and seen failing; at the end, each guarantee is broken on purpose and its test must go red (`npm run mutants`, 348 hand-made mutants).
- **What never leaves.** One rule set (`packages/chicla-kit/src/pinned/policy.mjs`, optionally extended by a `chicla.policy.json` at the project root) keeps `node_modules/`, `.env` files, credential files (`.npmrc`, `.netrc`, `*.pem`, `id_rsa*`, `.ssh/`, `.aws/`) and files whose content looks like a private key or token out of the manifest, the delivery and the dump.
- **Delivery.** One zip of the whole tree, named `chicla-roundN-YYYY-MM-DD.zip`, built only by `make-delivery` and shown only if `verify-delivery` passed. Copy its contents over the project root; do not delete or replace any folder first.
- **Emergency.** `/dump` creates a dump, and «recovery mode» restores it in the next session. The dump carries a pinned copy of the recovery toolchain (`RECOVER/`), and its digest in `CLAUDE.md` is checked before anything from the zip runs.
- **Honesty.** Every round says what was **not** run (Node 18/20, smoke tests, CI, macOS). Anything unrun becomes a gate that only the owner closes.

## Working on the project

Requirements: Node 18 or later. `unzip`, `zip` and Python 3 are used only by tests as independent readers.

```
npm test                          # the whole suite (node --test)
npm run smoke                     # the six script smoke tests
npm run mutants                   # break each guarantee on purpose; fails on a survivor (slow)
npm run mutants:kit               # the same for the kit (packages/chicla-kit/mutants/list.mjs); --pkg . copies the whole tree, minutes: run it detached
node scripts/bump-round.mjs --verify   # fingerprints agree?
node scripts/check-manifest.mjs        # FILES.manifest matches the disk?
node scripts/check-build.mjs           # every .mjs passes `node --check`
```

CI (`.github/workflows/ci.yml`) runs the suite, the manifest check, `bump-round --verify` and the smoke tests on Ubuntu and macOS with Node 18, 20 and 22; a `bench` job keeps extracting 20 000 small files within 3× `unzip`; a `pack` job builds the `chicla-zip` tarball with its sha256. Starting a session: read `CLAUDE.md`, then the highest-numbered `CHICLA_PROJECT_STATUS-N.md` and run `bump-round --verify`.

## Repository map

```
packages/chicla-zip/   src/zipkit.mjs · test/ · bench/ · mutants/list.mjs (the mutant list)
packages/chicla-kit/   src/cli.mjs (the `chicla` dispatcher) · src/check-build.mjs · src/check-manifest.mjs (cores
                       moved here; the scripts of the same name are wrappers) · test/
scripts/               the workflow cores and their smoke tests (check-manifest, bump-round,
                       make-delivery-zip, verify-delivery-zip, emergency-dump, recovery-report,
                       policy, manifest, baseline, mutants, pack-release, …)
test/                  workflow tests
docs/                  zip-handling.md · manifest.md · audits/ · the original plan and draft
CLAUDE.md · CHICLA_PROJECT_STATUS-N.md · CHANGELOG.md · ROADMAP.md
FILES.manifest · FILES.baseline.json · version.mjs
```

## Design rules

1. Zero dependencies; Node 18+, ESM (`.mjs`), types by JSDoc.
2. A zip is hostile input: never extract outside the destination, never trust the archive, return errors instead of throwing through the CLI.
3. Whatever Chicla writes must be accepted by independent readers (`unzip -t`, Python `zipfile`).
4. User-facing messages are English plain strings; tests assert error `code`s, never message text.
5. Nothing half-wired: every round leaves the tree building, tested and consistent.

## Roadmap

Built: the reader, safe extraction, the writer (zip64, streaming, deterministic output), repair and the `chicla-zip` CLI, hardening (fuzzing, differential tests against Python, mutants, CI, benchmark), the single policy, the v2 manifest, verified delivery with a baseline, emergency dump and recovery, and the six `chicla` subcommands.

Next: moving the kit cores from `scripts/` into `packages/chicla-kit/src/` in slices (the pinned recovery files last), then a dependency-free terminal UI (C11.5), `chicla update`, `chicla init` for each supported agent, the kit on Windows (M14), the open gates (security review, release) and the 0.1 release. The plan, with every card and decision, is in [`ROADMAP.md`](ROADMAP.md).

## Licence

Apache-2.0. See [`LICENSE`](LICENSE).
