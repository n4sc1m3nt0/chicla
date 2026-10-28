# Status file archive — «Done» lines of the Snapshot, rounds 245-245

Moved out of `CHICLA_PROJECT_STATUS-259.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 245 (2026-10-26; Rodrigo: «avança»). C17.3 (D140): `packages/chicla-kit/test/name-rules-differential.test.mjs` (5): a corpus of 46 names, an oracle from the `policy.mjs` exports, `check-manifest --write` on one project and `verify-delivery` on one zip per name; both tools follow the policy except `*.tsbuildinfo` other than `tsconfig.tsbuildinfo` (shipped by both, junk for `isJunkName`), named in `KNOWN_DIFF` and proposed as D-245a. 5 of 6 hand mutants red, the sixth explained. Tests only, no source, the pin did not move. Run: see the CHANGELOG. Not run by Claude: the CI, Node 18/20, mutants (package list), macOS, Windows.
