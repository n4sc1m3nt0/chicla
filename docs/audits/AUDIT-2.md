# AUDIT-2 — end of M3 (rounds 15 to 30, cards C3.1 to C3.8, C3.7b)

Date: 2026-10-09 · Code audited: v0.0.34 (round 31); fixes in v0.0.35 (round 32) · Node 22.22.2, Linux; the suites as root and as the non-root user `ubuntu`.
Method (status file, item 2): promised (ROADMAP §5 "Escritor") against what exists; probes by hand with the independent readers (`unzip`, `zipinfo`, Python `zipfile`); line coverage of the writer; a mutation pass on what this round changed.

## 1. Promised vs. what exists

| Promise (§5, Escritor) | State |
| --- | --- |
| Bit 11 on every non-ASCII name; names are the real ones from the disk, not normalised | Done. Probe: an NFD and an NFC file name come out byte for byte as on disk (`63 61 66 65 cc 81`…), bit 11 set, ASCII names have none. |
| Stored or deflate (by extension and compression ratio); level configurable | Done, but the text was loose: the rule is "deflate unless the extension is in `NO_DEFLATE`, kept only when the result is smaller than the input"; there is no ratio threshold. In stream mode every file is deflate (stored blocks for level 0 and for `NO_DEFLATE` names), by D29. §5 corrected. |
| File output: `<out>.partial`, fix local headers, no data descriptor, `fsync`, atomic `rename` | Done for `writeZip`; the "fix the headers" step does not exist because the data is in memory and the headers are written once with the final values (§5 corrected). **Gaps found:** `.partial` was opened with flag `w` and followed a symlink (A-1); `createZip({ stream: true })` did not sync the folder after the rename (A-2). Both fixed. |
| Stream output with data descriptor | Done (`writeZipStream`, D29). Sink ended on success, destroyed on failure; backpressure honoured. |
| zip64 automatic from 4 GiB − 1 or 65 535 entries | Done (C3.3, `bench/zip64-real.mjs`, 4.4 GB file accepted by `unzip -t`, Python and `testZip`). Streaming writes every file as zip64 (D29); `zip64: false` is `EZIP64`. |
| Deterministic: same bytes on any machine, day and time zone | Done. Probe: the same tree with `deterministic: true, epoch` gives the same SHA-256 under `TZ=UTC`, `Asia/Tokyo` and `America/Los_Angeles`. |
| Source by list or by root with an exclusion predicate | Done (`writeZip` list, `createZip` root + `exclude`). |
| Never follows symlinks (`skip` by default, with a report); refuses unsafe names; refuses to write inside the source tree | Done for the sources (C3.5, `O_NOFOLLOW`, `ERECURSE`). **Gap found:** the writer's own temp file followed a symlink (A-1). **Gap found:** the writer accepted names the extractor refuses (A-3). |
| crc32 and sha256 in the same pass; detects files that changed during the read | Done (C3.6, C3.7b). `sha256` is opt-in (D27). Known limit, documented in the code: a rewrite of the same size inside the clock resolution of the mtime is not seen. |
| Everything it writes is read by Chicla's reader and by the independent tools | Done for every card (`checkZip`); the new tests add the same check for the accepted dotted names. |
| Performance budget | Not a writer promise (it is about extraction); not measured here. |

## 2. Real bugs (all three fixed in round 32)

- **A-1 (fixed). The writer followed a symlink at `<out>.partial`.** `writeZip` and `createZip({ stream: true })` opened it with flag `w`. Probe: with `a.zip.partial` a link to `victim.txt`, `writeZip("a.zip", …)` replaced the victim's bytes with zip data. In a shared folder (`/tmp`) that is a classic overwrite-any-file-you-can-write trick, and it breaks product rule 2 in spirit (hostile surroundings). Fix: whatever sits at `<out>.partial` is removed first (a link is removed, not its target), then the file is created with `O_CREAT|O_EXCL|O_NOFOLLOW`; a race that recreates it in between is `EEXIST`, never an overwrite. A stale regular `.partial` of an earlier crash is still replaced (the existing test keeps that). Side effect, accepted: two runs writing the same output at once now fail with an error instead of interleaving.
- **A-2 (fixed). `createZip({ stream: true })` to a path did not `fsync` the folder after the rename** (`writeZip` does), so the new name could be lost after a crash while the file was complete. Also, a missing output folder was `EZIP` there and `ENOENT` in `writeZip`/`createZip`; the streaming path now opens the file itself and every path gives `ENOENT`. One helper `syncDir` serves both writers.
- **A-3 (fixed, D31 proposed). The writer accepted names with an empty or `.` segment** (`./x`, `a//b`, `a/./b`, `a//`). Probe: a zip with both `x` and `./x` passes `unzip -t` and Python, Chicla's own extractor refuses it (`EUNSAFE`, duplicate), and `unzip` silently keeps the last one (`x` came out as the second file's bytes). So Chicla could write a zip that Chicla would not extract. Fix: the writer (`vetName`, shared by `writeZip` and `writeZipStream`) refuses such names with `EUNSAFE` before anything is written. The reader and the extractor are unchanged: a unique `./x` from another tool (tar-style) still extracts, and a test says so.

## 3. Mutation pass (11 mutants on this round's code; the M3 cards had their own passes)

Red: M1 (flag `w` again), M2 (no removal before the exclusive open), M4 (streaming path back to `createWriteStream(tmp, { flags: "w" })`), M5 (segment check removed), M6 and M7 (only the empty or only the dot segment refused), M8 (folders' trailing slash not cut: valid folders refused), M9 and M11 (`.partial` left after a failure).
Survivors, explained:

| Mutant | Why it survived | Action |
| --- | --- | --- |
| M3 (`O_EXCL`/`O_NOFOLLOW` replaced by `O_TRUNC`, removal kept) | equivalent in a single process: the removal already took the link away; the flags only matter in a race between removal and open | accepted; kept as defence in depth, not testable without a race |
| M10 (no `syncDir` after the rename in `createZip`) | `fsync` of a folder changes nothing visible until a crash | not testable here (like the file `fsync` in rounds 25 to 30) |

## 4. Untested paths (coverage of `zipkit.mjs`: 95.28 % lines, 95.67 % branches, measured with the round-31 code)

Uncovered: lines 345 to 349 (`extractZip`, an existing target: `ECOLLISION`/`EEXIST`/overwrite branch), 377 to 387 (`markUtf8Names`, no test at all) and 722 to 740 (the command line). **None is in the writer**: every line of `writeZip`, `writeZipStream` and `createZip` is covered. Outside M3, so not fixed here: the first is M2 (see AUDIT-1 A-4 and C2.7), the second is C4.1 (it already says "confirmed by an independent reader"), the third is C4.2.

## 5. Missing behaviour, scheduled

- **B-1. The writer does not report names that collide on a normalising or case-insensitive file system** (`é` NFC and NFD, `A` and `a`). Probe: four such entries are written without a word. On Linux that is a legal tree; extracted on a Mac the files merge, and Chicla's own extractor reports them. Proposal (D32): report, never refuse (as the extractor does), in a `collisions` list in the result of `writeZip`, `writeZipStream` and `createZip`. Scheduled as C3.9 (S). Not done now: it is a new feature and a new return field, which Rodrigo should confirm first.
- **B-2. A file whose name has a backslash** (valid on Linux) makes `createZip` refuse the whole tree with `EUNSAFE`; `exclude` is the way round. By design (the name would split on Windows); to be stated in `docs/zip-handling.md` (C4.3).
- **B-3. Windows-reserved names** (`CON`, a trailing dot or space) are written. Part of M14 (D19), not the 0.1 line.

## 6. Not run

`bench/zip64-real.mjs` and `bench/stream-real.mjs` (several GiB; last run in rounds 21 and 29, the changed lines do not touch the data path), Node 18 and 20, macOS, Windows, CI, `npm run smoke` (no script changed).
