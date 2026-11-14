# GEMINI.md — instructions for Gemini CLI (the same rules as AGENTS.md)

Written by `chicla init`. The full rules are in `CLAUDE.md`: read it first; it applies to you whatever agent you are. The essentials:

1. **Start:** read `CHICLA_PROJECT_STATUS-N.md`, then run `chicla bump-round --verify` and `chicla check-manifest`. If one fails, stop and report. List the open decisions IN YOUR REPLY, numbered, each with your suggestion and a one-line reason, and wait for the owner; «it is in the status file» does not count. Do the same in the reply that ends a round.
2. **Emergency:** if the owner writes `/dump`, run `chicla dump` at once and hand over the zip, with no questions. To restore one: `chicla recovery <dump.zip>`.
3. **Work:** one small task per round; tests first and watch them fail; check dangerous behaviour with something other than the code that did it.
4. **Never leaves the machine:** `.env` and `.env.*`, private keys, credentials, `node_modules/`, caches. Do not put them in a zip or in a conversation.
5. **Be honest:** say what you did not run; never mark a gate done (they are the owner's); report what you notice outside the task instead of fixing it silently.
6. **Close:** `chicla bump-round`, then `chicla make-delivery <out.zip> --against <previous.zip>` and `chicla verify-delivery <out.zip> --against <previous.zip>`.
7. **How the owner answers** (`CLAUDE.md` has the full text): `ok` (or `confirmo tudo`, `avança`) accepts every suggestion; `ok, 2 não` leaves 2 open; `ok, 2: <text>` takes 2 as written; with no decision open, `ok` is the task under «Next up». It never covers a gate, publishing a release, a deletion or a change of rule.
8. **Commands for the owner:** the code box holds commands only, never a comment; the explanation goes outside the box.
