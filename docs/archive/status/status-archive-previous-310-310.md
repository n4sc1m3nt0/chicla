# Status file archive — «Previous» blocks of rounds 310-310

Moved out of `CHICLA_PROJECT_STATUS-320.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/archive/status/status-archive-previous-*.md`.

**Previous (round 310):** 2026-11-02. Rodrigo said «avança» with the round 309 zip; Claude did C27.6 (`actions/upload-artifact` v4.6.2 → v6.0.0 in `ci.yml`; D157 is Claude's label) and, because `git ls-remote` reaches GitHub from this sandbox, confirmed the round 309 commits of `checkout` and `setup-node` against the tags. **Rodrigo's part:** push and read the CI (the `pack-chicla` job uploads with the new action; the `# skipped` line of the macOS and Ubuntu logs still answers 1810 vs 1822); **G-C11 is open and is Rodrigo's**, and so is G-C8.

