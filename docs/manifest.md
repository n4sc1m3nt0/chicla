# FILES.manifest (formats v1 and v2)

`FILES.manifest` lists every file of the project tree. A delivery zip is built from exactly this list, so the manifest is what keeps a file from silently going missing. This page says what is in it, who writes it, who reads it, and what each check does and does not prove. Every claim here has a test (`test/manifest.test.mjs`, `test/manifest-readers.test.mjs`, `test/manifest-v2.test.mjs`); `test/manifest-docs.test.mjs` keeps this page in step with the code.

## 1. The two formats

**v1** (every delivery up to round 70): one path per line, nothing else.

**v2** (written since round 71): the first line is exactly

```
# chicla-manifest v2
```

then one line per file, fields separated by a TAB:

```
<path><TAB><crc32><TAB><size>
```

- `crc32`: 8 lowercase hex digits, the CRC-32 of the file's bytes (the same value a zip stores).
- `size`: the length in bytes, a whole number.
- An optional fourth field, `sha256` (64 lowercase hex digits), is accepted by the reader but **not written**: the sha256 of every file lives in `FILES.baseline.json`.

A file is v2 only if its first line is exactly the header, so a v1 path that happens to start with `#` is still a path.

Rules for both formats: paths use `/`, are relative to the project root, and are written as they are on the disk; entries are sorted; a path is listed once. `FILES.manifest` does not list itself. `FILES.baseline.json` is listed. Never listed: the private corpus (`corpus/real-world`, `corpus/huge`, except `.gitkeep`), `.env` files with secrets, Python artefacts, `node_modules`, `.git`, `.next`.

The manifest is input like any other file: a path that is absolute, leaves the root, has an empty, `.` or `..` segment, or contains a backslash or NUL is refused. A path with a TAB or a newline in its name cannot be listed, so `--write` stops instead of writing a line that would read back wrong.

## 2. Who writes it, who reads it

- **Writer:** `node scripts/check-manifest.mjs --write`, which `bump-round` and `make-delivery-zip` run for you. It reads every file and records its crc32 and size at that moment.
- **Readers:** every script and core goes through `packages/chicla-kit/src/pinned/manifest.mjs` (`parseManifest`), which reads v1 and v2. A test scans the scripts and fails if one splits the manifest by lines by hand.
- **crc32:** `zlib.crc32` when the Node in use has it (22.2 and later), otherwise a table in JavaScript. Both give the same value.

## 3. What each check does

- **`check-manifest` (no flag):** fails if a listed file is gone from the disk (a lost file); only warns about a file on the disk that is not listed. It does **not** compare crc32 or size with the disk: a file edited after the last `--write` is normal while you work.
- **`make-delivery-zip`:** regenerates the manifest after every other step, writes `FILES.baseline.json`, zips exactly the listed files, then runs `verify-delivery-zip`.
- **`verify-delivery-zip`:** besides the path checks (nothing listed is missing from the zip, nothing in the zip is unlisted), it compares the crc32 and size of every listed file with the zip's **central directory**. It reads the directory; it does **not decompress** anything. A difference is refused, size first.
- **`--against <previous zip>`:** compares names only, for a v1 or a v2 previous zip. A changed file with the same path is normal, so crc32 is not compared between two zips.

A v1 manifest (an old zip) is still accepted: with no crc32 or size to check, only paths are compared.

### The baseline is exempt

`FILES.baseline.json` is listed, but `verify-delivery-zip` exempts it from the crc32 and size check. It is circular: the baseline holds the sha256 of the manifest, so the manifest cannot hold the crc32 of the baseline. The crc32 and size written for the baseline entry are whatever was on the disk when `--write` ran, and mean nothing. The baseline is covered by its own seal and the `EBASELINE_*` checks, which compare it with every file in the zip.

## 4. Error codes

| Code | Raised when |
| --- | --- |
| `EMANIFEST_FORMAT` | A v2 line has the wrong number of fields, or a crc32, size or sha256 that is not well formed; or entries given to the writer are half v2 (a crc32 without a size, or v1 and v2 mixed). |
| `EMANIFEST_DUPLICATE` | A path is listed twice. |
| `EMANIFEST_UNSAFE` | A path is absolute, leaves the root, has an empty, `.` or `..` segment, a backslash or NUL; or the writer is given a name with a TAB or a newline. |
| `EMANIFEST_COLLISION` | Two different paths are the same name in NFC (for example «café» composed and decomposed). Also raised by `check-manifest` (check and `--write`) when two files on disk collide, and by the writer. A delivery zip with such names fails `verify-delivery-zip` with `EZIP_COLLISION`. Comparison stays in NFC; collisions are errors, never warnings (D56). |
| `EMANIFEST_LOST` | `check-manifest` (also `chicla check-manifest`, C11.1): a file listed in the manifest is gone from the disk (a lost file). The one exemption is the status file, renamed every round, as long as exactly one exists. Printed as «LOST file(s)»; this is the result `code`, the exit status is 1. |
| `EMANIFEST_SIZE` | `verify-delivery-zip`: a listed file's size in the zip's central directory differs from the manifest (a truncated or an emptied file). Checked first; a file reported here is not also reported as a crc32 difference. |
| `EMANIFEST_CRC32` | `verify-delivery-zip`: same size, but the crc32 differs (other bytes, or an older version of the file). |

An unreadable manifest fails the check; it never passes it. `emergency-dump` is the one exception: it never stops for a bad manifest and records the code in the report instead.

## 5. Limits and what was not checked

- The crc32 in a central directory is what the zip **claims**. Nothing is decompressed, so a damaged compressed stream is not found here (`unzip -t` does that).
- crc32 finds accidents (a truncated file, an older copy), not tampering. For that there is the sha256 in `FILES.baseline.json`.
- The verifier does not read zip64 archives: if the end-of-central-directory record carries the zip64 markers, it stops and says so. A single file of 4 GiB or more was not tried, so what it would report is not known.
- Only an older copy that the manifest has never seen is caught. If the manifest was regenerated after the file was replaced, the manifest agrees with the old file and nothing is wrong as far as this check can tell.
- Run only on Node 22 on Linux, as root. Not run: macOS, Node 18 and 20 (the CI does), Windows.
