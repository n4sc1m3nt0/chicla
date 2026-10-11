# docs/

Reference material that came with the project. Nothing here is wired into the build.

| File | What it is |
| --- | --- |
| `zipkit-plan-ronda-1s.md` | The original zipkit plan (Cedar, round 1s), verbatim. Superseded by `ROADMAP.md` (see its §8); kept for the reasoning behind the `chicla-zip` guarantees (§3), the test list (§4, step 1a to 1c) and the NFC/NFD collision decision (§7). |
| `zipkit-RASCUNHO.mjs` | The zipkit draft, verbatim. Passes `node --check`; has no tests. Known bugs are listed in `ROADMAP.md` §13 (B1 to B7). It is the untouched original: C1.1 took it into `packages/chicla-zip/src/zipkit.mjs` with one change (`Readable.from([])` instead of `Transform.from([])`, see B7), so do not edit this copy. |
| `zip-handling.md` | How `chicla-zip` handles zips: why (bit 11, locales, `unzip -UU` vs `ditto`), what the reader, extractor and writers promise, options with a catch, `collisions`, known limits and what was not checked. Written in round 35 (C4.3). |

New docs (`fingerprint.md`, `fingerprint.md`, `state-file.md`, audits) go here as their cards land.
