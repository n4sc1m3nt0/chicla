# docs/

Reference material that came with the project. Nothing here is wired into the build.

| File | What it is |
| --- | --- |
| `zipkit-plan-ronda-1s.md` | The original zipkit plan (round 1s), verbatim. Superseded by `ROADMAP.md`; kept for the reasoning behind the `chicla-zip` guarantees (§3), the test list (§4, step 1a to 1c) and the NFC/NFD collision decision (§7). |
| `zipkit-RASCUNHO.mjs` | The zipkit draft, verbatim. Passes `node --check`; has no tests. Known bugs are listed in `ROADMAP.md` §13 (B1 to B7). It is the untouched original: C1.1 took it into `packages/chicla-zip/src/zipkit.mjs` with one change (`Readable.from([])` instead of `Transform.from([])`, see B7), so do not edit this copy. |
| `zip-handling.md` | How `chicla-zip` handles zips: why (bit 11, locales, `unzip -UU` vs `ditto`), what the reader, extractor and writers promise, options with a catch, `collisions`, known limits and what was not checked. Written in round 35 (C4.3). |
| `manifest.md` | `FILES.manifest` formats v1 and v2: fields, who writes and reads it, what `check-manifest` and `verify-delivery-zip` check (crc32 and size against the zip's central directory), the exempt baseline, the `EMANIFEST_*` codes and the limits. Written in round 72 (C7.1 slice c). |
| `pinned-files-design.md` | Design note (round 127, C11.1 slice 5g): how the four pinned recovery files (`baseline`, `manifest`, `policy`, `recovery-report`) can move into the kit package without moving the digest of `RECOVER/`, the options, the slices and the new gate G-C11. A plan, not wired in. |
| `release.md` | The runbook of gate G-C6 for `chicla-zip` 0.1.0: check the CI tarball, tag, GitHub release, `npm publish` by the owner, and the check of what npm serves. Written in round 163. |
| `fingerprint.md` | The fingerprint specified: the triple (`seq`, app hash, changelog hash), the three legs and exactly which bytes each hash covers, the shape of the two comment lines, the checks `--verify` prints in order, bump / refresh / dry-run, the toolchain pin and the `EBUMP_*` codes. Written in round 180 (C10.4); `test/fingerprint-docs.test.mjs` fails when it drifts from the code. |
| `state-file.md` | The status file specified: name and number, the seven required parts and who writes each, the order from the fingerprint on, what the next session reads first, and what `bump-round` refuses (`EBUMP_STATUS`; bump and refresh only, not `--verify`). Written in round 181 (C10.5); `test/state-file-docs.test.mjs` fails when it drifts from the code. |

New docs (audits) go here as their cards land.
