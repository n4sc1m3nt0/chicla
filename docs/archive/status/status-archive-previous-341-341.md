# Status file archive — «Previous» blocks of rounds 341-341

Moved out of `CHICLA_PROJECT_STATUS-351.md` verbatim by `chicla archive --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/archive/status/status-archive-previous-*.md`.

**Previous (round 341):** 2026-11-15. Rodrigo read the CI logs with Claude (every test job red, one cause: four files of `FILES.manifest` never `git add`ed) and said «ok avança»: D169 is CONFIRMED, D170 is recorded (card C32.5, the guard for files the manifest lists and git does not track; C32.3 waits for a green CI). **Docs only: no code changed, Claude published nothing and ran no real `git`, `gh` or `npm` command.** **Rodrigo's part, now:** `git add` the four files and push (the reply has the command), then say whether the CI is green; **G-C11 and G-C8 are open and are his.**

