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

New docs (`fingerprint.md`, `fingerprint.md`, `state-file.md`, audits) go here as their cards land.
