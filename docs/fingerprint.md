# The fingerprint

The fingerprint is how a new session knows that the files it was handed belong together. It is one triple, `seq` and two hashes, written in three places. `chicla bump-round` (and `scripts/bump-round.mjs`, the same code) is the only thing that writes it, and `--verify` is the only thing that reads it back. This page is the specification; `test/fingerprint-docs.test.mjs` builds small projects from the definitions below and fails when the code stops doing what is written here (C10.4).

What it proves: the status file, the CHANGELOG and the app file were closed in the same round, and the two hashed files were not edited since. What it does **not** prove: anything about the rest of the tree (that is `FILES.manifest`, see `manifest.md`), the text of the status file, or who wrote the files. It is a consistency check, not a signature.

## The triple

| Field | Meaning |
| --- | --- |
| `seq` | The status file number `N` of `CHICLA_PROJECT_STATUS-N.md`: one running integer, bumped by 1 each time the file is output; never reused, never skipped. Independent of the app version. |
| `app_sha256_12` | The first 12 hex digits of the SHA-256 of the **app file** from line 4 to the end. |
| `changelog_sha256_12` | The first 12 hex digits of the SHA-256 of `CHANGELOG.md` from line 2 to the end. |

Both hashes are taken over the bytes of the file, as `tail -n +4 version.mjs | sha256sum | cut -c1-12` and `tail -n +2 CHANGELOG.md | sha256sum | cut -c1-12` would print them. A file with fewer lines than the leg starts at hashes as the empty input, `e3b0c44298fc`.

## The three legs

| Leg | Where the triple sits | What its hash covers |
| --- | --- | --- |
| The app file | Line 3: a comment starting `STATUS_FILE_FINGERPRINT:` | Everything from line 4. Lines 1 to 3 are not hashed, so the fingerprint line cannot hash itself. |
| The CHANGELOG | Line 1: a comment starting `CHANGELOG_FINGERPRINT:` | Everything from line 2. |
| The status file | One paragraph that starts `**Fingerprint:**` and ends `before doing anything else.` | Nothing: the status file is never hashed. It only carries the triple, so it must agree with the other two. |

The app file is a small file that changes every round (the version). Which file it is, is one constant at the top of the core, `APP_FILE`, and is `version.mjs` in this project. Its comment style follows the extension: `<!-- … -->` for `.html` and `.md`, `//` for anything else.

The two comment lines have this shape (`<N>` is the status number, `<hex12>` twelve lowercase hex digits; the part in square brackets is only there when `--note` was given):

```
// STATUS_FILE_FINGERPRINT: seq=<N> file=CHICLA_PROJECT_STATUS-<N>.md app_sha256_12=<hex12> changelog_sha256_12=<hex12> (bump-round.mjs: app hash <CHANGED|unchanged>, changelog hash recomputed[; <note>])
<!-- CHANGELOG_FINGERPRINT: seq=<N> file=CHICLA_PROJECT_STATUS-<N>.md app_sha256_12=<hex12> changelog_sha256_12=<hex12> (bump-round.mjs: app hash <CHANGED|unchanged>, changelog hash recomputed[; <note>]) -->
```

`CHANGED` or `unchanged` says whether the app hash moved against the one the line held before; the changelog hash is always recomputed. The status file paragraph carries the same `seq`, the same two hashes, and `app=<APP_FILE>`; it is rewritten whole by the tool and a status file must hold exactly one such paragraph.

## What `--verify` checks

One line per check, in this order. The first column is how the printed label starts. The first row appears only when `CLAUDE.md` pins a toolchain (see below), so a project without a pin prints the other seven.

| Check | Passes when |
| --- | --- |
| `toolchain digest` | The digest computed from the five recovery files equals the `toolchain-digest:` pinned in `CLAUDE.md`. |
| `app: seq=` | The `seq` on line 3 of the app file equals the status file number. |
| `CHANGELOG: seq=` | The `seq` on line 1 of the CHANGELOG equals the status file number. |
| `status file: seq=` | The `seq` in the status file paragraph equals the status file number. |
| `file= points to` | The `file=` field of the app comment and of the CHANGELOG comment is the status file's name. |
| `app=` | The `app=` field of the paragraph names `APP_FILE`. |
| `app hash` | The app hash in all three places equals the hash of the app file as it is on disk. |
| `CHANGELOG hash` | The changelog hash in all three places equals the hash of the CHANGELOG as it is on disk. |
| `CLAUDE.md has LF` | `CLAUDE.md` has no CRLF line ending. It is in no hash and the pin only reads one line of it, so CRLF there would pass every other row; it is the last row, and only when `CLAUDE.md` exists. The status file, the CHANGELOG and `version.mjs` are hashed, so CRLF in them already fails the hash rows. Since round 243 (C17.1) the rule is the shared one in `packages/chicla-kit/src/integrity.mjs`, which holds one list of the files that must be LF (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`, the status file, `CHANGELOG.md`, `version.mjs`, `FILES.manifest`, `FILES.baseline.json`): the `CLAUDE.md` row is always printed, and any other file of the list prints a row only when it fails. |

Since round 244 (C17.2) every row above comes from `packages/chicla-kit/src/integrity.mjs` (`checkIntegrity`: the pin, the state and fingerprint rows, the LF rows, in this order; the `TOOLCHAIN` map lives there too), with the disk as the reader. `verify-delivery` calls the same rules on the zip with its own reader, so a delivery with CRLF, a pin that does not match, a stale fingerprint or two status files is refused (`EINTEGRITY_*`, see `docs/manifest.md`); a zip without `version.mjs` skips the fingerprint rows. The whole module is described in `docs/integrity.md`.

A failed check prints `✗` and the result is `EBUMP_VERIFY`. A hash that no longer matches means the file was edited after the round was closed: say so, never pick one side silently. A `seq` that differs from the status file name means the three files come from different rounds (see `EBUMP_UNPAIRED`).

## Writing it

| Mode | What it does |
| --- | --- |
| `bump` (default) | `N` becomes `N+1`: renames the status file, rewrites the three places with the new `seq` and freshly computed hashes, rewrites the toolchain pin in `CLAUDE.md` when there is one, regenerates `FILES.manifest`, then runs the checks above on what is on disk. It is the last step of a round. |
| `--refresh` | The same, but the number stays: for a late edit of the CHANGELOG or the app file. |
| `--dry-run` | With either of the above: prints what would change and writes nothing. |
| `--verify` | Only reads and checks; writes nothing. |
| `--note <text>` | Adds `; <text>` to the comment lines. |

Before it writes anything, `bump` and `--refresh` insist that all three places already agree with the status file name; if not, nothing is written (`EBUMP_UNPAIRED`). It then checks that the status file has all its required parts, in order (`EBUMP_STATUS`, see `state-file.md`). Never edit the triple by hand.

## The toolchain pin

`CLAUDE.md` holds a line `toolchain-digest: <64 hex>`. It is the digest of the five files a dump carries in `RECOVER/`: `baseline.mjs`, `manifest.mjs`, `policy.mjs`, `recovery-report.mjs` and `zipkit.mjs`. It is the SHA-256 of the text made of one line per file, sorted by name, each line being the SHA-256 of that file, two spaces, `RECOVER/` and the name, and a newline: what `LC_ALL=C sha256sum RECOVER/*.mjs | sha256sum` prints in a dump. `bump` rewrites it; `--verify` checks it; a recovery refuses a dump whose `RECOVER/` differs. When no pin is in `CLAUDE.md`, the check does not run.

## Codes

| Code | When |
| --- | --- |
| `EBUMP_STATE` | The project cannot be read as a fingerprinted project: not exactly one `CHICLA_PROJECT_STATUS-N.md` in the root, no app file, no `CHANGELOG.md`, line 3 of the app file or line 1 of the CHANGELOG is not a valid fingerprint comment, the status file is not valid UTF-8, or it does not hold exactly one `**Fingerprint:**` paragraph. |
| `EBUMP_UNPAIRED` | A bump or refresh was asked, but a `seq` in the three places differs from the status file number. Nothing is written. |
| `EBUMP_STATUS` | A bump or refresh (or a dry-run of either) was asked, but the status file lacks a required part or has them out of order (C10.5, see `state-file.md`). Nothing is written. `--verify` does not run this check. |
| `EBUMP_VERIFY` | `--verify` ran and at least one check failed. |
| `EBUMP_MANIFEST` | The manifest step of a bump failed. |
| `EBUMP_FINAL` | The checks after a bump failed: the tool wrote something inconsistent. Do not deliver; run `--verify`. |
| `EBUMP_USAGE` | The core was asked for a mode it does not have. |
| `EBUMP_ERROR` | Anything unexpected. |

The core returns these codes and never throws them. The `chicla` command prints the text, exits 1 for a code above and 2 for a usage error of its own (`EUSAGE`); with `--json` it prints one object.
