# Status file archive — «Previous» blocks of rounds 318-318

Moved out of `CHICLA_PROJECT_STATUS-328.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/archive/status/status-archive-previous-*.md`.

**Previous (round 318):** 2026-11-06. Rodrigo ran the cleanup of AUDIT-11 F-1 in his repository (the zsh error was the empty glob; the 25 tracked `.sha256` and `__MACOSX` files of `dist*` were the rest) and asked to fix the findings BEFORE the push; Claude agreed for what protects the push and did C29.2. **Claude published nothing.** **Rodrigo's part:** paste this zip, `git rm -q -- CHICLA_PROJECT_STATUS-322.md` only if it is tracked (the previous status file; `git status` says), and do NOT push yet: the rounds C29.1 and C29.3 and the correction of AUDIT-11 (the `main` is at round 304, not 308) come first, then the push and the CI; **D-317a is his to answer**; **G-C18 (publish 0.3.0) is open and is his**, and so are G-C11 and G-C8.

