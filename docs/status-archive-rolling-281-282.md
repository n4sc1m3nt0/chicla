# Status file archive — rolling paragraphs, rounds 281-282

Moved out of `CHICLA_PROJECT_STATUS-290.md` verbatim (by hand in round 286: the clauses of the «Current version» paragraph are written «(round N: …)», which `scripts/archive-changelog.mjs --rolling` does not cut). Nothing was edited or deleted.
Each line is one clause, newest first; put them back after the ones kept in the file.
Find a round with `grep -n "round 28" docs/status-archive-rolling-*.md`.

## Current version clauses

- round 282: docs only, no source: Rodrigo published `chicla` 0.2.0 and deprecated `chicla-zip` and `chicla-kit` and closed G-C16; `docs/release.md` «Published: chicla 0.2.0» (what he pasted, the EOTP through `tee`, why the rebuilt tarball differs in bytes by npm version), runbook steps 5 and 6 corrected, ROADMAP C23.4, D148 and G-C16, READMEs; the pin did not move
- round 281: C23.3, the two old packages are retired: `packages/chicla-zip` and `packages/chicla-kit` are `private` (`pack-release` refuses them, EPRIVATE), the CI jobs `pack` and `pack-kit` are gone, `docs/release.md` «Releasing chicla 0.2.0» (publish, then `npm deprecate` on both names) replaces the thin runbook, READMEs and SECURITY say it moved; no source file of the kit or the zip module, the pin did not move
