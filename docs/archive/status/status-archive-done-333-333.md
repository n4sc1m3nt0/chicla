# Status file archive — «Done» lines of the Snapshot, rounds 333-333

Moved out of `CHICLA_PROJECT_STATUS-347.md` verbatim by `chicla archive --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/archive/status/status-archive-done-*.md`.

- Done: round 333 (2026-11-14; Rodrigo «avança»). C30.5: `chicla git-plan --against <zip|FILES.manifest> [--json] [--root <dir>]`: `packages/chicla-kit/src/git-plan.mjs` (new), `cli.mjs`; prints `git rm` of the old status files (D163), `git rm` of what left, `git add` of what entered or changed, one `git commit -m 'round N: title'`; no comment, no `chicla` command, no push; `packages/chicla-kit/test/git-plan.test.mjs` (17, red first); K-GPL-01 to 12 RED; `FILES.manifest` always added; item 14 and the status template (item 12) carry it. Version 0.0.337. Not run: see the CHANGELOG.
