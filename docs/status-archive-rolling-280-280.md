# Status file archive — rolling paragraphs, rounds 280-280

Moved out of `CHICLA_PROJECT_STATUS-287.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/status-archive-rolling-*.md`.

## Open decisions entries

- (round 280: round 280: **none open;** D-B, D-C and D-D are confirmed («avança»). **Next task: C23.3** (retire the two packages in docs and CI: `private` on both folders, the runbook «Releasing chicla 0.2.0» replaces the thin one, the `npm deprecate` steps, README). **Do not publish the thin `chicla` 0.1.1** (stop sign in `docs/release.md`) until C23.3 replaces it. **Rodrigo's to do:** `git rm -- CHICLA_PROJECT_STATUS-283.md test/chicla-package.test.mjs packages/chicla/bin/chicla.mjs` if the delivery check lists them.)
