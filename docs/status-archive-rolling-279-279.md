# Status file archive — rolling paragraphs, rounds 279-279

Moved out of `CHICLA_PROJECT_STATUS-286.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/status-archive-rolling-*.md`.

## Open decisions entries

- (round 279: **D148 opened;** D-A is confirmed; **D-B** (two commands `chicla` and `chicla-zip`, the library at `chicla/zip`), **D-C** (version `0.2.0`) and **D-D** (nothing more published under the two old names, both folders `private`, Rodrigo runs `npm deprecate` on both) are Claude's proposals, applied as default; Rodrigo confirms or changes them before C23.3. **Next task: C23.2** (`scripts/build-chicla.mjs` and the test that installs only that tarball). **Do not publish the thin `chicla` 0.1.1** (stop sign in `docs/release.md`).)
