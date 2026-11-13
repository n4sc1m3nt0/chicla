# Status file archive — «Previous» blocks of rounds 317-317

Moved out of `CHICLA_PROJECT_STATUS-327.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/archive/status/status-archive-previous-*.md`.

**Previous (round 317):** 2026-11-05 (the sandbox clock; the dates of rounds 311 to 316 say 2026-11-02 and are wrong, AUDIT-11 F-5). Rodrigo said «faz o audit antes de eu publicar» and «Continuar»; Claude did AUDIT-11 (seven findings, M29 with C29.1 to C29.4 proposed, D159). **Claude published nothing.** **Rodrigo's part, BEFORE the first push:** the `main` on GitHub is at round 304 (corrected in round 319; it said 308) and its CI would be red on 188 tracked files that the manifest does not list (AUDIT-11 F-1). After pasting the zip over the repository, from its root: the two `git rm` lines of AUDIT-11 F-1 (round 319: the first version failed in zsh) (validated in a clone: `check-manifest` 513/513 and `test:fast` green), then push and read the CI (1810 vs 1822 is still open); D-317a and D-317b are his; **G-C18 (publish 0.3.0) is open and is his**, and so are G-C11 and G-C8.

