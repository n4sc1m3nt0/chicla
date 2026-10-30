# Status file archive — rolling paragraphs, rounds 286-286

Moved out of `CHICLA_PROJECT_STATUS-293.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/status-archive-rolling-*.md`.

## Open decisions entries

- (round 286: **none open.** **Next task: C24.3** (`scripts/smoke-test-tarball.mjs` and a CI job that installs the packed tarball alone and drives `init`, `bump-round --verify`, `make-delivery`, `dump`, `recovery` and `chicla-zip` on Ubuntu, macOS and Windows; Windows is reported, not promised), then C24.4 (stale words about the old packages). **Gate G-C17 is Rodrigo's** (publish `chicla` 0.2.1 with both fixes).)
