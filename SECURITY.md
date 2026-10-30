# Security policy

Chicla is one npm package, `chicla`, with two security surfaces: its zip module (the `chicla-zip` command and `chicla/zip`) reads zips that anyone may have crafted, and its workflow commands (the `chicla` command) move project files into delivery zips and dumps and can run a recovery toolchain from a dump.

## Supported versions

| Package | Supported |
| --- | --- |
| `chicla` | the latest `0.2.x` |

`chicla-zip` and `chicla-kit` (`0.1.x`) are the old names: they are deprecated on npm, private in the repository, and receive no fixes. Install `chicla`.

Only the latest release of `chicla` is fixed. This is a side project run by one person: reports are read and answered on a best-effort basis, with no fixed deadline.

## How to report a vulnerability

Do **not** open a public issue for a vulnerability. Use GitHub's private vulnerability reporting for this repository: open the **Security** tab, then **Report a vulnerability**. Include the version or commit, a minimal reproduction (for a zip problem, the smallest zip that triggers it, or the script that builds it) and what you expected to happen.

If that button is not there, private vulnerability reporting is not switched on yet; open a public issue that says only «security contact needed», with no details, and the owner will answer there.

## What counts as a vulnerability

For the zip module (a zip is **hostile input**):

- a crafted zip that makes `extractZip` or the CLI write outside the destination, follow or create a symlink, or leave a half-written destination after an error (with nobody else writing to the destination: a concurrent writer is one of the known limits listed below);
- a crafted zip that makes the reader or extractor throw something other than a `ZipError`, hang, or use unbounded memory with the documented limits in place;
- a zip written by `writeZip`, `writeZipStream` or `createZip` that a standard reader (`unzip -t`, Python `zipfile`) rejects or reads with different names or contents;
- a name that Windows cannot hold being written without the `windowsNames` refusal where it applies.

For the workflow commands:

- a secret (`.env*`, credential files, keys) that enters a delivery zip or a dump despite the «never leaves» policy;
- `recovery` running code from a dump whose `RECOVER/` digest does not match the pin in `CLAUDE.md`;
- a delivery zip that passes `verify-delivery` while a file of the tree is missing, changed or extra.

## What is not a vulnerability (known limits)

- **Integrity, not authenticity.** Fingerprints, CRC32, manifest hashes and the toolchain digest detect accidental damage and stale or mixed copies. They do not prove who wrote a file: whoever can edit a file and the pin that checks it can change both. The trust anchor is the repository you control.
- **Not safe against a concurrent writer (ZIP-003, ZIP-004).** `createZip` (the walk of the tree) and the merge mode of `extractZip` (extracting into a folder that already exists) check a path and use it a moment later. If another process writes to the tree or to the destination in between, two things can happen, both reproduced with test hooks (`packages/chicla-zip/test/concurrent-writer.test.mjs`): (1) a folder swapped for a symlink makes `createZip` put files from outside the tree into the zip, and makes the merge write a file outside the destination; (2) a file that appears in the destination during a merge with `overwrite: false` is replaced, with no backup of it. This is **not a guarantee**, and the tests pin it as a known limit. Use these two on a tree or a destination that nothing else is writing to (a private folder, or one only you can write to). Since C15.14 the merge looks at the target again right before each move and refuses an item that appeared meanwhile (`EEXIST`, the moves already done are undone and the other writer's item is left alone); that narrows the window of (2) and does not close it (a writer that wins the gap between that look and the rename still gets replaced), and (1) is not touched. Closing both is descriptor pinning (C15.15, Linux only), planned after 0.1.
- **A failed extraction into a new destination can leave the parent folders it created (ZIP-017).** The destination itself and the temporary folder are gone, but folders made on the way to it (`mkdir -p` of its parents) stay, empty, because they cannot be told apart from folders another process made at the same time. They hold no data from the zip. Pinned by `packages/chicla-zip/test/extract-parent-leftover.test.mjs`.
- **A folder entry with the symlink mode is not created (ZIP-023).** An entry such as `a/` whose Unix mode says symlink is listed as a folder (`isDir` and `isSymlink` are both true) and `extractZip` skips it as a symlink, so no folder appears; Python and `unzip` would create it. Chicla writes less than they do, never more, so nothing leaves the destination.
- **Three names Chicla refuses or reads differently from other tools (ZIP-025, ZIP-026, sixth review).** (1) A symlink `X` stored together with `X/` or `X/child` is refused whole (`EUNSAFE`, «file and a folder at the same time»; ZIP-025, since round 210). Info-ZIP can make such a zip with an unusual command line (`zip -y -r z.zip d dirlink d/ dirlink/`); plain `zip -ry`, `zip -r`, `7z -snl` and `bsdtar` do not. This costs availability, not safety. (2) A name that two entries share only through the Unicode Path extra field (0x7075) is refused; Python 3.12 and 3.13 and `unzip` apply that field like Chicla, Python 3.11 does not, so with 3.11 a repeated name can be invisible to Chicla (ZIP-026; the same holds for file + file). (3) Outside the duplicate check, three shapes were seen in review 6 and are left as they are, all safe because Chicla writes less than the other tools: a non-folder name ending in `/.` (Chicla and Python write a file, `unzip` a folder), an entry with symlink bits and host OS 2, 5 or 30 (Chicla writes a regular file, `unzip` a symlink), and the ZIP-023 shapes in the second order (`[a/ with symlink mode, file a]`: Chicla writes the file, Python and `unzip` create a folder and fail). The `filter` option of `extractZip` runs the duplicate check only on the entries it lets through (read, not tested). Run the same tool to check and to extract when the zip is hostile.
- **Limits are defaults, not a sandbox.** Extraction limits (total declared size, number of entries) have defaults and can be changed by the caller. Pass your own limits when the input is untrusted and large.
- **Not verified:** a real Windows machine, a real FAT or exFAT drive, macOS Finder or Archive Utility, and 7-Zip for streamed zips (the third reviewer used 7-Zip 25.01 on Linux only). CI runs the `chicla-zip` suite on Windows, macOS and Linux (Node 18, 20, 22); that is not the same as a manual check.
- **A dump made by `chicla` 0.2.0 has no `RECOVER/` (AUDIT-8 F-2), fixed in 0.2.1.** `chicla dump` read the five pinned toolchain files from a path that only the Chicla repository has, so a dump made by the installed `chicla` 0.2.0 carries no `RECOVER/` and its report lists five warnings (`chicla recovery` of such a dump runs the installed code, never code from the dump, and does not apply the digest pin). From 0.2.1 the files are read from the package itself and the dump carries `RECOVER/` with the pinned bytes.
- **`chicla-kit` is not supported on Windows.** It passes its suite in CI there, but its dump and recovery never ran on a real Windows machine.
- Paths over 260 characters on Windows, encryption, methods other than stored and deflate, and multi-part archives are not supported.

## Checking a release

Each release of `chicla` comes with a `.tgz` and its `.sha256` on the GitHub release page. Check the file with `sha256sum -c` (or `shasum -a 256 -c` on macOS) before installing it from a downloaded copy. The steps are in [`docs/release.md`](docs/release.md).
