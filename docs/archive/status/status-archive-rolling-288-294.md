# Status file archive — rolling paragraphs, rounds 288-294

Moved out of `CHICLA_PROJECT_STATUS-301.md` verbatim by `scripts/archive-changelog.mjs --rolling`. Nothing was edited or deleted.
Each line is one clause or entry, newest first; put them after the ones kept in the file, joined with «; » («Current version») or one space («Open decisions»), and the paragraph is rebuilt.
Find a round with `grep -n "round 12" docs/status-archive-rolling-*.md`.

## Open decisions entries

- (round 294: **one open: D-294a** — the whole `npm run mutants:kit` ends `ETIMEDOUT` in its baseline at the 300 s default (the 32 files it used before this round take 328 s on the 2-core sandbox); Claude suggests running it once with `-- --timeout 900`, detached (about half an hour), but item 20 (e) says that raising a timeout needs Rodrigo's word. **M25 has no card left.** Next: nothing named; Claude suggests the `audit` only after Rodrigo has read the Windows leg of the next `tarball` run and decided G-C17. **Gate G-C17 is Rodrigo's.**)
- (round 293: **none open.** **Next task: C25.3** (the five hand mutants of AUDIT-9 §2 into `packages/chicla-kit/mutants/list.mjs`; `npm run mutants:kit` once, detached). **Gate G-C17 is Rodrigo's.**)
- (round 292: **none open.** **Next task: C25.2** (docs: README pin sentence, runbook sha256 step, D-283c closed, template note on `package.json`), then C25.3. **Gate G-C17 is Rodrigo's;** read the Windows leg of the next `tarball` run.)
- (round 291: **none open** (D-290a and D-290b confirmed by Rodrigo, 2026-10-30). **Next task: C25.1** (quote the arguments of `smoke-test-tarball.mjs` on Windows), then C25.2 and C25.3. **Gate G-C17 is Rodrigo's.**)
- (round 290: **none open.** Next: nothing named; Claude suggests the `audit` of M24 (item 2) after Rodrigo has read the next `tarball` run and decided G-C17. **Gate G-C17 is Rodrigo's.**)
- (round 289: **none open.** **M24 has no card left.** Next: nothing named; Claude suggests the `audit` of the milestone (instructions item 2) after Rodrigo has read the first `tarball` run and decided G-C17. **Gate G-C17 is Rodrigo's** (publish `chicla` 0.2.1 with three fixes, then `npm deprecate chicla@0.2.0`).)
- (round 288: **none open.** **Next task: C24.4** (docs and two messages say once that `chicla-zip` and `chicla-kit` are gone: `SECURITY.md`, `README.md`, `docs/README.md`, the two old READMEs, the header and `--help` of `cli.mjs`, the `EZIP_WRITE` text). **Gate G-C17 is Rodrigo's** (publish `chicla` 0.2.1 with three fixes); after the push, read the first run of the `tarball` job (the Windows leg is reported only).)
