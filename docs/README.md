# docs/

Reference material that came with the project. Nothing here is wired into the build.

| File | What it is |
| --- | --- |
| `zipkit-plan-ronda-1s.md` | The original zipkit plan (Cedar, round 1s), verbatim. Superseded by `ROADMAP.md` (see its §8); kept for the reasoning behind the `cairn-zip` guarantees (§3), the test list (§4, step 1a to 1c) and the NFC/NFD collision decision (§7). |
| `zipkit-RASCUNHO.mjs` | The zipkit draft, verbatim. Passes `node --check`; has no tests. Known bugs are listed in `ROADMAP.md` §13 (B1 to B7). It is the untouched original: C1.1 took it into `packages/cairn-zip/src/zipkit.mjs` with one change (`Readable.from([])` instead of `Transform.from([])`, see B7), so do not edit this copy. |

New docs (`zip-handling.md`, `fingerprint.md`, `state-file.md`, audits) go here as their cards land.
