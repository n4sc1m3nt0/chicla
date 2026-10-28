# Status file archive — «Done» lines of the Snapshot, rounds 262-262

Moved out of `CHICLA_PROJECT_STATUS-276.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 262 (2026-10-27; Rodrigo: «sim a tudo. avança»). C19.6 (D-261a): `packages/chicla-kit/test/core-check-manifest-gaps.test.mjs` (4, green on the code, red against each mutant): two status files with the listed one gone are a lost file (`K-CMN-14`), an NFD name on disk equals its NFC spelling in the manifest (`-15`), the warning names 15 of the new files (`-18`), `renderCheckManifest` returns the exact text per stream (`-20`); the four `survives` removed from the list; the five `K-CMN` entries involved run once: 4 red, `-10` explained. Tests and data only, the pin did not move. Not run by Claude: the CI, Node 18/20, `npm run smoke`, the whole `npm run mutants:kit` in one pass, the 348 mutants of the zip list, macOS, Windows.
