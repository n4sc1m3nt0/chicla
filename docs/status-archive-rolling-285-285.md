# Status file archive — rolling paragraphs, rounds 285-285

Moved out of `CHICLA_PROJECT_STATUS-293.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/status-archive-rolling-*.md`.

## Open decisions entries

- (round 285: **none open** (D-283a and D-283b confirmed by Rodrigo, 2026-10-29). **Next task: C24.5** (document as a known limit that a dump made by the installed package has no `RECOVER/`; docs and a docs test, no source, the pin does not move), then C24.3 (the CI installs and drives the tarball) and C24.4 (stale words). **Gate G-C17 is Rodrigo's** and now covers both fixes (`recovery` and `init`): publish `chicla` 0.2.1 from `docs/release.md` «Releasing chicla 0.2.1», then `npm deprecate chicla@0.2.0`.)
