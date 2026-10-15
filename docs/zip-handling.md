# Zip handling in Chicla (`chicla-zip`)

What `chicla-zip` does with zip files, why it exists, what it promises and what it does not. Every promise here has a test in `packages/chicla-zip/test/`; what has not been checked is said so. Error codes, never message texts, are the stable part of the API.

## 1. Why a zip kit at all

The same zip is read differently by different tools, and the difference is mostly about **file names**.

- **Bit 11 (the UTF-8 flag).** A zip entry's name has no declared encoding unless general-purpose bit 11 is set. Without it, a reader falls back to the legacy code page (cp437): Python's `zipfile`, Java and Windows then show non-ASCII names as garbage. With it, a reader that ignores the flag shows the UTF-8 bytes as cp437.
- **Locales.** Info-ZIP `unzip` 6.00 (the one on most Linux distributions, and the one Apple ships) in a non-UTF-8 locale (`C`, `POSIX`) extracts or lists a UTF-8 name as `caf#U00e9.txt`, and `unzip -t` may exit 1 with a «mismatching local filename» warning. Measured here: it happens for entries that carry a zip64 extra, and in every entry once any extra field is present (see the UT extra, §5). The data is right; only the name is shown wrongly. Setting `LC_ALL=C.UTF-8` makes it go away.
- **`unzip -UU` and `ditto`.** Info-ZIP has options to force or ignore UTF-8 handling (`-UU`), but they are not the same on every system, and macOS has its own extractor (`ditto`, Finder, Archive Utility) that behaves differently again. The project's earlier notes record that `-UU` does not exist on macOS; this was not re-checked from the Linux workspace where `chicla-zip` is developed.

A reader written in Node, with zero dependencies, gives the same answer on every machine that runs Node 18 or later, and its tests run everywhere. That is the reason for `chicla-zip`: not to replace `zip` and `unzip`, but to read and write zips deterministically and to be checked against them.

## 2. What the reader does

- **Windows names (C14.5 a).** `extract` and `create` take `--windows-names` (API: `windowsNames: true`): a name that is not valid on Windows (backslash, drive, UNC, reserved device, forbidden character, trailing dot or space, stream colon) is refused with `EUNSAFE` and nothing is written. Without the flag the default stays «on only on win32». `test` always reports such names as a warning (`warnings.windowsNames`) and never changes the exit code. Names are never renamed.
- **Names.** In order: Unicode Path extra field (0x7075, only when its CRC matches the name), bit 11, valid UTF-8, cp437. The `legacyEncoding` option chooses another code page for names that have no flag (for example `windows-1252`, using Chicla's own table). The name returned is the real one; nothing is normalised or rewritten.
- **Integrity.** CRC-32 and size of every file are checked on read and on `testZip`.
- **Formats.** Stored and deflate, zip64 (reading and writing), extra fields, Unix modes, dates (the UT extra is preferred over the DOS date, which has no time zone and is read as local time).
- **Refused, with a code:** encrypted entries, other compression methods, multi-part zips, truncated zips, a damaged central directory, a deflate entry that has zero data bytes (D20).
- **Memory.** Only the central directory is read whole. `readZipFile` loads one file and takes `maxBytes`.

## 3. What extraction promises

`extractZip(zip, dest, options)` treats the zip as hostile input.

1. **Everything is validated before anything is written:** unsafe names (empty, NUL, backslash, absolute path, drive letter, `..`), duplicate names, a file and a folder with the same path, total declared size (default limit 8 GiB) and number of entries (default 1 000 000). One bad entry means nothing is written (`EUNSAFE`).
2. **The destination is atomic.** Files go to a temporary folder next to the destination (same volume) and are moved in only when all of them were written and checked. A failure leaves the destination as it was. A leftover `.chicla-tmp-*` folder from a killed process is never swept automatically (D17).
3. **No symlinks.** Symlinks and special files in the zip are skipped and reported in `skipped`, never created; an existing symlink in the destination is never written through.
4. **No overwrite by surprise.** Files are created in exclusive mode; an existing target is `EEXIST` unless `overwrite: true`. Setuid and setgid bits are dropped.
5. **Sizes in the zip are not trusted.** A stream that goes past its declared size aborts the extraction.
6. **Equivalent names are reported.** Names that differ only in NFC/NFD or case are listed in `collisions` (§6). If the file system itself merges them, the extraction fails with `ECOLLISION` and writes nothing (D16); it never writes over a file extracted earlier from the same zip.
7. **A failed merge is undone.** Extracting into a folder that already exists moves the finished files in by renames after a full conflict check. If one rename fails midway, the ones already done are undone (new items go back, a replaced file is restored from a backup made just before; `overwrite` only), so the folder ends as it was. If the undo fails too, the error is `EPARTIAL`: `leftBehind` lists what is still in the folder and `backupDir` keeps the originals, so nothing is lost silently (C2.7). A destination that is a bind mount (same device number, still `EXDEV`) is retried with the temporary folder inside it (C2.8). Not covered: a mount point nested inside the destination; the backup falls back to a copy where hard links are impossible (FAT, exFAT), not run here.

## 4. What the writer promises

`writeZip(out, sources, options)`, `writeZipStream(sink, sources, options)` and `createZip(out, root, options)`.

- **Names exactly as given**, bit 11 on every non-ASCII name, no normalisation. Unsafe names, empty or `.` path segments (`./x`, `a//b`, D31), duplicates and names over 65 535 bytes are refused (`EUNSAFE`, `EDUP`, `EARG`) before the first byte is written.
- **Compression.** Deflate where it makes the data smaller, stored otherwise; names of formats that are already compressed (`.zip`, `.png`, `.jpg`, `.mp4`, `.pdf`, `.docx`, …) are stored. `level` 0 to 9 (default 6). Streamed output always uses deflate entries (stored blocks at level 0 or for those names), because a stored entry with a data descriptor cannot be streamed (D29).
- **zip64 only where needed:** 65 535 or more entries, or a size or offset of 4 GiB − 1 or more; `zip64: true` writes it everywhere; `zip64: false` refuses with `EZIP64`. Streamed files are always zip64 (their size is unknown up front), so `zip64: false` is `EZIP64` there.
- **Atomic file output.** Written to `<out>.partial` (what was there is removed first; created exclusively and never through a symlink), then `fsync`, `rename`, and `fsync` of the folder. A failure removes the `.partial` and leaves an existing output as it was.
- **Deterministic mode** (`deterministic: true`): the same sources give the same bytes on any machine, day and time zone. Dates come from `epoch`, then `SOURCE_DATE_EPOCH`, then each source's `mtime` (none: 1980-01-01 00:00), in UTC, clamped to 1980..2107; modes become 0644 (0755 for folders and files with the owner execute bit); the order of the sources is kept (`createZip` walks in a fixed order: names by bytes, a folder before its contents).
- **`createZip` walks a folder safely.** `exclude(rel, { isDir })` decides what stays out; symlinks are never followed (`symlinks: "skip"` reports them, `"error"` refuses with `ESYMLINK`); FIFOs, sockets and devices are skipped as `special`; an output inside the tree is `ERECURSE`; a name that is not valid UTF-8 is `EUNSAFE`.
- **Digests and change detection.** `sha256: true` returns a SHA-256 per file, computed in the same pass as the CRC-32. `createZip` refuses with `ECHANGED` (nothing is written) when a file is not the one listed or changes while it is read (size, mtime, ctime or inode).
- **Streaming.** `writeZipStream` and `createZip(out, root, { stream: true })` never hold a whole file in memory (files are read in slices of at most 1 MiB). A Writable passed as output is ended on success and destroyed on any failure, so a half zip never looks finished.
- **Independent readers.** What Chicla writes is checked against `unzip -t`, `zipinfo`, Python's `zipfile` and Chicla's own reader (7z when present), not only against the code that produced it.

## 5. Options with a catch

| Option | What to know |
| --- | --- |
| `extendedTime: true` | Writes the UT extra (0x5455) so the `mtime` comes back exact. It is **opt-in** because, measured here, with any extra field present `unzip` 6.00 in a non-UTF-8 locale mangles non-ASCII names (§1). Times after 2038-01-19 03:14:07 UTC get no UT extra (DOS date only). |
| `deterministic: true` without `extendedTime` | Dates are written in UTC but readers show a DOS date as local time, so outside UTC the shown hour is shifted. The bytes do not depend on the machine. |
| `zip64: "auto"` | Fine for every reader that supports zip64; use `false` if a reader that does not must open the result (then big or streamed input is refused, not written). |

## 6. Equivalent names (`collisions`)

On Linux, `é` as one character (NFC) and as `e` plus a combining accent (NFD), or `Readme` and `README`, are different files. On macOS (normalising, usually case-insensitive) and Windows they are the same name, so extracting both loses one.

- **`extractZip` reports** them in `collisions`: groups of paths, files and folder entries and the folders implied by a file's path (written with a trailing `/`), that differ only in NFC/NFD or case. A group needs at least one real entry; folders that exist only because files sit inside them merge without loss and are not reported on their own. The fold is NFC, upper case, lower case, NFC, so the Greek final sigma (`ΑΣ`, `ας`, `ασ`) counts as one name.
- **The writers report the same thing** (C3.9, D32): `writeZip`, `writeZipStream` and `createZip` return `collisions` with the same shape. It is always an array. **Nothing is refused**: the zip is written as given, because on Linux it is a legal tree and the caller decides what to do (rename, `exclude`, or ship the warning).
- **What it does not do.** It does not rename anything and it does not look at names outside the zip (an existing file in the destination is `EEXIST`, a different check).

## 7. Known limits and what was not checked

- **A backslash in a name.** A file called `a\b` is valid on Linux. The writer and extractor refuse it (`EUNSAFE`) because the name would split into folders on Windows; `createZip` refuses the whole tree, so use `exclude` to leave such files out (AUDIT-2, B-2).
- **Windows-reserved names** (`CON`, trailing dot or space) are written. Windows is its own milestone (M14, D19), not the 0.1 line (AUDIT-2, B-3).
- **No encryption, no other compression methods, no multi-part zips**, for reading or writing.
- **Streamed zips** (every file zip64 with a data descriptor): verified with `unzip` 6.00, Python `zipfile` and the Chicla reader, including 4.1 GiB; **not verified** on macOS (Finder, Archive Utility, `ditto`) or with 7z.
- **Where it was run.** Linux with Node 22 for every round. Node 18, 20 and macOS (Node 26) were last run by the project owner at round 7 (gate G-C3), so the later code (writers, streaming, `collisions`) has not been on a Mac; Windows has not been run at all. Those runs are gates for the project owner.
- **Messages** are English plain strings (D18). Tests assert error codes: `EARG`, `EUNSAFE`, `EDUP`, `EZIP64`, `ECHANGED`, `ERECURSE`, `ESYMLINK`, `ESOURCE`, `EEXIST`, `ECOLLISION`, `ENOENT`, `EZIP`.
- **Performance budget:** large files at most 1.5 times `unzip`; 20 000 small files at most 3 times `unzip` on tmpfs (D15).

## 8. The command line

`node packages/chicla-zip/src/zipkit.mjs <command>` (D34, confirmed; C4.2a and C4.2b): `ls <zip>`, `test <zip>`, `cat <zip> <name>`, `extract <zip> <folder> [--overwrite] [--max-bytes N]`, `mark <zip>`, `create <out.zip> <folder> [--exclude GLOB]... [--stream] [--deterministic] [--overwrite]`, `--help`.

- **Exit codes:** 0 ok, 1 the command ran and failed (a `ZipError`, or a system error such as a missing file), 2 usage (unknown command or option, wrong number of arguments), 3 internal error. Warnings from `test` (unsafe names, missing UTF-8 flag) never change the code.
- **`--json` on every command but `cat`:** one line on stdout, `{ "ok": true, "command": ... }` or `{ "ok": false, "error": { "code", "message" } }`, nothing on stderr. Without it, failures go to stderr as `✗ message` and stdout stays empty.
- **`cat`** writes the raw bytes and nothing else, so it has no `--json`.
- **`--` ends the options** (after the command): a zip or an entry whose name starts with `--` can be named. `--max-bytes` takes digits only.
- **Names are escaped in text output** (AUDIT-3 A-3): control, escape, C1 and bidi characters from a zip are shown as `\xNN` or `\uNNNN`, so a hostile name cannot retitle the terminal or fake a line. `--json` keeps the real names; `cat` writes the file as it is.
- **A closed pipe** (`ls | head`) ends the command quietly with exit 1.
- **`create` refuses an existing output** (a file, a folder or a link, even a dangling one) with `EEXIST` unless `--overwrite`, as `extract` does (D35); with `--overwrite` the output is replaced atomically and a link at that path is replaced, never written through. **`--help`** (anywhere before `--`) or `-h` (first argument only) prints the usage on stdout, exit 0.
- **`create`** calls `createZip` and prints the entries, the bytes, what was `skipped` and the `collisions` (report only). `--exclude GLOB` can be repeated: a pattern without `/` matches a file or folder name at any depth, one with `/` matches the whole path from the folder; `*` and `?` never cross `/`, everything else is literal; an excluded folder is pruned with its contents. `--stream` uses the streaming writer, `--deterministic` the reproducible one. Symlinks are always skipped (no `--symlinks` option yet).

