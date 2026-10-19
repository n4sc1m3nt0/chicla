# Security policy

Chicla has two packages with different security surfaces: `chicla-zip` reads zips that anyone may have crafted, and `chicla-kit` moves project files into delivery zips and dumps and can run a recovery toolchain from a dump.

## Supported versions

| Package | Supported |
| --- | --- |
| `chicla-zip` | the latest `0.1.x` once it is published; before that, the code on `main` |
| `chicla-kit` | none yet: it is pre-release and has not been published |

Only the latest release of each package is fixed. This is a side project run by one person: reports are read and answered on a best-effort basis, with no fixed deadline.

## How to report a vulnerability

Do **not** open a public issue for a vulnerability. Use GitHub's private vulnerability reporting for this repository: open the **Security** tab, then **Report a vulnerability**. Include the version or commit, a minimal reproduction (for a zip problem, the smallest zip that triggers it, or the script that builds it) and what you expected to happen.

If that button is not there, private vulnerability reporting is not switched on yet; open a public issue that says only «security contact needed», with no details, and the owner will answer there.

## What counts as a vulnerability

For `chicla-zip` (a zip is **hostile input**):

- a crafted zip that makes `extractZip` or the CLI write outside the destination, follow or create a symlink, or leave a half-written destination after an error (with nobody else writing to the destination: a concurrent writer is one of the known limits listed below);
- a crafted zip that makes the reader or extractor throw something other than a `ZipError`, hang, or use unbounded memory with the documented limits in place;
- a zip written by `writeZip`, `writeZipStream` or `createZip` that a standard reader (`unzip -t`, Python `zipfile`) rejects or reads with different names or contents;
- a name that Windows cannot hold being written without the `windowsNames` refusal where it applies.

For `chicla-kit`:

- a secret (`.env*`, credential files, keys) that enters a delivery zip or a dump despite the «never leaves» policy;
- `recovery` running code from a dump whose `RECOVER/` digest does not match the pin in `CLAUDE.md`;
- a delivery zip that passes `verify-delivery` while a file of the tree is missing, changed or extra.

## What is not a vulnerability (known limits)

- **Integrity, not authenticity.** Fingerprints, CRC32, manifest hashes and the toolchain digest detect accidental damage and stale or mixed copies. They do not prove who wrote a file: whoever can edit a file and the pin that checks it can change both. The trust anchor is the repository you control.
- **Not safe against a concurrent writer (ZIP-003, ZIP-004).** `createZip` (the walk of the tree) and the merge mode of `extractZip` (extracting into a folder that already exists) check a path and use it a moment later. If another process writes to the tree or to the destination in between, two things can happen, both reproduced with test hooks (`packages/chicla-zip/test/concurrent-writer.test.mjs`): (1) a folder swapped for a symlink makes `createZip` put files from outside the tree into the zip, and makes the merge write a file outside the destination; (2) a file that appears in the destination during a merge with `overwrite: false` is replaced, with no backup of it. This is **not a guarantee**, and the tests pin it as a known limit. Use these two on a tree or a destination that nothing else is writing to (a private folder, or one only you can write to). Since C15.14 the merge looks at the target again right before each move and refuses an item that appeared meanwhile (`EEXIST`, the moves already done are undone and the other writer's item is left alone); that narrows the window of (2) and does not close it (a writer that wins the gap between that look and the rename still gets replaced), and (1) is not touched. Closing both is descriptor pinning (C15.15, Linux only), planned after 0.1.
- **Limits are defaults, not a sandbox.** Extraction limits (total declared size, number of entries) have defaults and can be changed by the caller. Pass your own limits when the input is untrusted and large.
- **Not verified:** a real Windows machine, a real FAT or exFAT drive, macOS Finder or Archive Utility, and 7-Zip for streamed zips. CI runs the `chicla-zip` suite on Windows, macOS and Linux (Node 18, 20, 22); that is not the same as a manual check.
- **`chicla-kit` is not supported on Windows.** It passes its suite in CI there, but its dump and recovery never ran on a real Windows machine.
- Paths over 260 characters on Windows, encryption, methods other than stored and deflate, and multi-part archives are not supported.

## Checking a release

Each release of `chicla-zip` comes with a `.tgz` and its `.sha256` on the GitHub release page. Check the file with `sha256sum -c` (or `shasum -a 256 -c` on macOS) before installing it from a downloaded copy. The steps are in [`docs/release.md`](docs/release.md).
