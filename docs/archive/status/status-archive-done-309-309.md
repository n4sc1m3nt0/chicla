# Status file archive — «Done» lines of the Snapshot, rounds 309-309

Moved out of `CHICLA_PROJECT_STATUS-323.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/archive/status/status-archive-done-*.md`.

- Done: round 309 (2026-11-02; Rodrigo: «avança»; D156 Claude's label). C27.5 (M27): `.github/workflows/ci.yml`: the five jobs' `actions/checkout` and `actions/setup-node` from v4.4.0 to v6.0.0, pinned by commit (the commits confirmed in other repositories' workflows, not at GitHub: the sandbox has no network there). `test/ci-actions-node24.test.mjs` first (4; the two version tests red). The 1810 vs 1822 of macOS: 11 tests skip there by the tests' own conditions (`/dev/full`, case and normalisation folding, `holdsBoth`), not confirmed against the logs. `actions/upload-artifact` v4.6.2 is left (ROADMAP C27.6). The round archived «Previous» 303, «Done» 299 and rolling 306. The pin did not move. NOT run: the CI, macOS, Windows, Node 18 and 20, the whole `mutants`.
