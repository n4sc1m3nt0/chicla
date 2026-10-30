# Status file archive — rolling paragraphs, rounds 277-280

Moved out of `CHICLA_PROJECT_STATUS-287.md` verbatim (by hand in round 283: the clauses of this paragraph are written «(round N: …)», which `scripts/archive-changelog.mjs --rolling` does not cut). Nothing was edited or deleted.
Each line is one clause, newest first; put them back after the ones kept in the file.
Find a round with `grep -n "round 28" docs/status-archive-rolling-*.md`.

## Current version clauses

- round 280: C23.2, the single package is assembled: `scripts/build-chicla.mjs` (kit `src/` and `templates/` plus `zipkit.mjs` beside the loader, byte for byte), `packages/chicla` is only metadata (`0.2.0`, bins `chicla` and `chicla-zip`, `chicla/zip`, no dependencies), `pack-release` refuses an incomplete package, CI `pack-chicla` builds then packs; no pinned file touched, the pin did not move
- round 279: D148, the three npm packages become one, `chicla`; C23.1 done: `zipkit-loader.mjs` tries a `zipkit.mjs` beside itself first; docs: D148, M23, G-C16 reworded, a stop sign on the thin runbook; the pin did not move
- round 278: the npm name `chicla` becomes a real thin package, `packages/chicla` (`bin/chicla.mjs`, README, LICENSE, one dependency `chicla-kit ^0.1.1`), version 0.1.1, with the CI job `pack-chicla`, the runbook «Releasing chicla 0.1.1» and ROADMAP D147 (a call made on delegation), M22 and gate G-C16; no source of `chicla-zip` or `chicla-kit`, the pin did not move
- round 277: the publication of `chicla-zip` 0.1.1 and `chicla-kit` 0.1.1 by Rodrigo is recorded in `docs/release.md` «Published: 0.1.1», ROADMAP D146 and the G-C6 row; docs and one test, no source, the pin did not move
