# Status file archive — «Done» lines of the Snapshot, rounds 328-328

Moved out of `CHICLA_PROJECT_STATUS-342.md` verbatim by `chicla archive --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/archive/status/status-archive-done-*.md`.

- Done: round 328 (2026-11-14; Rodrigo «avança»). C30.2b: `check-manifest.mjs`, `archive-changelog.mjs` and `bump-round.mjs` say `chicla ...`; D-Q (in-process manifest step) tried and reverted, blocked by rule C17.1: the fallback stays and is the one entry of the guard list of `no-scripts-in-messages.test.mjs`; D163 (the first line of every delivery's commands removes every old status file but the newest) and card C30.5 changed. Version 0.0.332. Not run: see the CHANGELOG.
