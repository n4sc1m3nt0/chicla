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
- **Size of the central directory (G-C5 §5.4, D126, measured in round 173).** `MAX_CENTRAL` is 64 MiB of central directory (D128, round 174; it was 1 GiB until then), checked before it is read, and a larger one is `ECENTRAL`. That bound is on BYTES; the memory is per ENTRY: `packages/chicla-zip/bench/central-memory.mjs` (N empty files with 2 to 8 character names, ~53 bytes each in the directory; Node 22, Linux, one fresh process per size) gave peak RSS 297 MiB for 500 000 entries, 505 MiB for 1 million, 927 MiB for 2 million, 2.6 GiB for 6 million and 5.2 GiB for 12 million (V8 heap 4.2 GiB), about 450 to 500 bytes per entry and 1.4 s per million entries, linear. At the OLD 1 GiB limit that was about 20 million entries and about 9 GiB, so on an ordinary machine the process ran out of memory long before the limit refused anything; at 64 MiB it is about 1.2 million entries and about 0.6 GiB. The effect that motivated the change: with `--max-old-space-size=2048` a 308 MiB directory (6 million entries) kills Node with `FATAL ERROR: JavaScript heap out of memory` (SIGABRT), which is NOT a `ZipError` and cannot be caught. A real zip with more than about 1.2 million entries is now refused instead of risking the abort; `test/central-limit.test.mjs` pins the bound without making a 64 MiB file. Entries cannot be packed tighter than their local headers (overlaps are refused, `EOVERLAP`), so such a file is at least ~85 bytes per entry. Numbers are from one machine and one Node version; rerun the script before trusting them elsewhere.
- **Overlaps (G-C5 §5.2, D125).** When a zip is opened (`openZip`, so also `listZip`, `read`, `testZip`, `extractZip`) and before `markUtf8Names` writes, every entry gets a span from its local header of at least 30 + name + compressed size bytes (the local extra field and a data descriptor only lengthen it). Two spans that share a byte, or a span that reaches the central directory, are refused with `EOVERLAP` and nothing is read or written; spans that touch are fine and the order of the central directory does not matter. It uses the central directory only (no I/O) and is a lower bound, so an ordinary zip never hits it. Overlaps hidden in the local extra field or a data descriptor are not seen. `markUtf8Names` still checks only the local signature of the entries it patches, not the name agreement of ZIP-002 (it changes a flag, not data).
- **Local header against central directory (G-C5 ZIP-002, D124).** Before the data of an entry is read (`read`, `testZip`, `extractZip`), the local header has to agree with the central directory on the name BYTES (length and content, not decoded text), the compression method and the encryption bits (0x01 and 0x40); otherwise `ZipError` (`EZIP`) and nothing is written. Flags are NOT compared as a whole: the data descriptor bit (0x08) and the UTF-8 bit legitimately differ in real zips. Python's `zipfile` refuses a different name; `unzip` warns and exits 1. It costs no extra system call: the one read of the local header takes the central name length more. Not covered here: entries with no data (`csize` 0) and folders never read their local header; overlaps are C15.3.
- **Which end record (G-C5 ZIP-001, D123).** A zip comment can hold bytes that look like an end-of-central-directory record. With one candidate nothing changes. With several, the reader takes the one whose central directory ends exactly where the record starts (for zip64, where the zip64 record starts); if that is not exactly one, or there are more than 8 candidates, it refuses with `EAMBIGUOUS` and reads nothing. Bytes after the record are still tolerated when there is only one candidate. Python's `zipfile` takes the last candidate without this check and reads such a zip as empty.
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
- **Windows names.** By default the reserved and forbidden names (`CON`, trailing dot or space, a colon) are refused only on win32; `windowsNames: true` (`--windows-names`) refuses them on every system (C14.5 a, below). Paths over 260 characters get no special handling (C14.3 slice c, open).
- **No encryption, no other compression methods, no multi-part zips**, for reading or writing.
- **Streamed zips** (every file zip64 with a data descriptor): verified with `unzip` 6.00, Python `zipfile` and the Chicla reader, including 4.1 GiB; **not verified** on macOS (Finder, Archive Utility, `ditto`) or with 7z.
- **Where it was run.** CI runs the `chicla-zip` suite on Ubuntu, macOS and Windows with Node 18, 20 and 22; the Windows job is blocking (D115) and the last log read (round 162 code) was green on all nine. **Not run:** a real Windows machine, a FAT or exFAT drive, macOS Finder or Archive Utility, and 7-Zip on streamed zips. A green CI runner is not a person using those tools.
- **Messages** are English plain strings (D18). Tests assert error codes: `EARG`, `EUNSAFE`, `EDUP`, `EZIP64`, `ECHANGED`, `ERECURSE`, `ESYMLINK`, `ESOURCE`, `EEXIST`, `ECOLLISION`, `ENOENT`, `EAMBIGUOUS`, `EOVERLAP`, `ECENTRAL`, `EZIP`.
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

