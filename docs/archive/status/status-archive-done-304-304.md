# Status file archive — «Done» lines of the Snapshot, rounds 304-304

Moved out of `CHICLA_PROJECT_STATUS-318.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/archive/status/status-archive-done-*.md`.

- Done: round 304 (2026-11-02; the person in this session: «sim», «faz a ronda 304»; D-304a to D-304c, Claude's labels). C24.7 (found by the CI of round 303: Ubuntu and macOS red, Windows, `tarball`, `pack-chicla` and `bench` green): `scripts/run-tests.mjs` ends with `process.exitCode = main(...)` instead of `process.exit` (the `--list` of 8232 bytes was cut at about 8 KB on macOS with Node 18 and 20: test 1790); `.gitignore` has `stage/`, `stage2/`, `dist/`, `ci/package/` (test 1749 found `two packages` in `ci/package/README.md` and `stage2/chicla/README.md`, committed in the repo, not in the zip); `test/test-sets.test.mjs` (1 new, red first). No pinned file. NOT run: the CI, macOS, Node 18 and 20. Rodrigo takes the two folders out of git.
