# Status file archive — «Previous» blocks of rounds 244-244

Moved out of `CHICLA_PROJECT_STATUS-254.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/status-archive-previous-*.md`.

**Previous (round 244):** 2026-10-26. Rodrigo said «avança» (no decision waiting): C17.2 done (D140), `integrity.mjs` now holds the `TOOLCHAIN` map and the pin, state and fingerprint rules, `bump-round --verify` prints the same rows from it, and `verify-delivery` refuses a zip with CRLF, a wrong pin, a stale fingerprint or two status files (`EINTEGRITY_*`); no pin move. Next: C17.3 (tests that tie the name rules of `check-manifest` and `verify-delivery` to `policy.mjs`).

