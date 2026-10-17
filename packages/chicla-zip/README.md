# chicla-zip

Read, verify, safely extract, write and repair zip files in plain Node. **Zero dependencies**, Node 18+, ESM.

A zip is hostile input, so everything here is built around that: the extractor validates the whole archive before it writes anything, extracts into a temporary folder and renames at the end (a failure leaves the destination untouched), never follows or creates symlinks, and never trusts names, sizes or counts from the archive. What the writer produces is accepted by `unzip -t` and by Python's `zipfile`, with UTF-8 names marked correctly (bit 11).

> Status: `0.1.0`, **not published to npm yet** (the release steps are in [`docs/release.md`](../../docs/release.md)). The API below is what the test suite pins. Security limits and how to report a problem: [`SECURITY.md`](../../SECURITY.md).

## Library

```js
import { openZip, extractZip, writeZip, createZip, testZip } from "chicla-zip";

const z = openZip("in.zip");                 // z.entries, z.read(name), z.close()
await testZip("in.zip");                     // checks every CRC and size, streaming
await extractZip("in.zip", "out/", { maxTotalBytes: 2 ** 30 }); // atomic; errors are ZipError with a `code`

await writeZip("a.zip", [{ name: "café.txt", data: Buffer.from("hi") }], { deterministic: true });
await createZip("b.zip", "some-folder/", { exclude: (rel) => rel.endsWith(".log"), stream: true });
```

Also exported: `writeZipStream` (to any Writable, files larger than memory), `markUtf8Names` (repairs third-party zips), `listZip`, `readZipFile`, `runCli`. Writers report `collisions` (names that differ only by NFC/NFD or case) and can return `sha256` per file.

## Command line

```
chicla-zip ls|test|mark <zip> [--json]
chicla-zip cat <zip> <name>
chicla-zip extract <zip> <folder> [--overwrite] [--max-bytes N] [--json]
chicla-zip create <out.zip> <folder> [--exclude GLOB]... [--stream] [--deterministic] [--overwrite] [--json]
```

Exit codes: 0 ok, 1 the command ran and failed, 2 usage, 3 internal. With `--json` stdout is exactly one line.

## Windows

Supported on Node 18, 20 and 22. The whole test suite runs on `windows-latest` in CI with no failures (20 tests are skipped there, each with its reason in the test file). It is checked by CI only, not by hand on a real Windows machine. On Windows, `extract` and `create` refuse a name Windows cannot hold (reserved device names, `<>:"|?*`, a trailing dot or space, streams, drive and UNC paths, backslashes) with `EUNSAFE` before anything is written; on other systems `--windows-names` gives the same check. `chicla-zip test` also warns about such names on every system. Not covered: paths over 260 characters, and a real FAT or exFAT drive.

## Not supported

Encryption, methods other than stored and deflate, multi-part archives, paths over 260 characters on Windows.

Licence: Apache-2.0.
