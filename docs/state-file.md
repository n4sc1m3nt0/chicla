# The status file

The status file, `CHICLA_PROJECT_STATUS-N.md` in the project root, is the memory of the project between sessions. Nothing is remembered by the agent; the next session reads this file first and finds out where the project stands, which rules apply, what is waiting for the owner and what to do next. This page is the specification of its format (C10.5); `test/state-file-docs.test.mjs` fails when the doc and `bump-round` disagree. How the fingerprint inside it works is in `fingerprint.md`.

What the format gives: a file the next session can cut and read in pieces, and a check that refuses to close a round on a file that lost one of those pieces. What it does **not** give: any judgement on what the pieces say. A section that is present but empty, or out of date, passes. Keeping the text true is the job of the owner and the agent (instruction 5 of the file).

## Name and number

Exactly one file in the root is called `CHICLA_PROJECT_STATUS-N.md`, where `N` is one running integer. `chicla bump-round` raises it by 1 when a round is closed and renames the file; it is never reused and never skipped. The file must be valid UTF-8 (the tool refuses to rewrite one that is not). The number is also the `seq` of the fingerprint. The first part, `CHICLA` here, is the project's prefix: one line of `CLAUDE.md`, `status-prefix: <NAME>` at the start of a line (capital letters, digits and `_`, starting with a letter), says which; a project without the line keeps `CHICLA`. `bump-round` keeps the prefix when it renames the file, and refuses a `CLAUDE.md` whose line is invalid or whose status file has another prefix (`EBUMP_STATE`). Changing the prefix of an existing project is a rename by hand of the file and of the `file=` of the two fingerprint lines, plus the line; the manifest sees one rename, not a lost file (C26.1). The panel, `chicla update` and `chicla verify-delivery` read the same line (C26.2): the panel opens the status file of the prefix; `update` leaves the line out of its comparison and keeps it when it replaces `CLAUDE.md`; `verify-delivery` takes the prefix from the `CLAUDE.md` inside the zip and does not count an older status file of any prefix as lost. The dump (its own copy of the reader), the recovery (an older status file of any prefix is not a lost file) and `archive-changelog` follow it too (C26.3); `chicla init` names it (C26.4): `--name <NAME>`, else the folder in capitals (every character outside A-Z and 0-9 becomes `_`); a name that does not start with a letter is refused and `init` asks for `--name`. The templates say the project's own name, and `chicla update` reads them the same way. `chicla rename-status <NAME>` renames the status file of an existing project (C26.5): the file, the `file=` of the two fingerprint lines, the `status-prefix:` line, the old name in the text of the instruction files and in the process block of the status file (everything above its `**Current version:**` line: the session-start command and the name of the file are live instructions), and the manifest; never the history (from that line down, the CHANGELOG body, the archives), all or nothing.

## The parts

Seven parts are required. Each heading or label counts only when it starts a line, and a line inside a fenced code block (` ``` ` or `~~~`) does not count.

| Part | What it holds | Who writes it |
| --- | --- | --- |
| `## Instructions` | The process rules: how to cold-start, the short commands, the closing kit, delivery, honesty, task size. It is the single source of the process; `CLAUDE.md` holds the product and working rules. The text after the words `## Instructions` is free (this project adds a note there). | The owner and the agent, by hand. |
| `**Current version:**` | One paragraph: the app version and, in brackets, the rounds that led to it. | By hand, every round (the version is also in the app file). |
| `**Fingerprint:**` | The paragraph with the triple (`seq` and two hashes), ending `before doing anything else.` Exactly one. | `bump-round`, never by hand. See `fingerprint.md`. |
| `**Last updated (round N):**` | The newest entry: the date and at most two sentences on what the round did. Older entries may follow as `**Previous (round M):**` (the oldest are moved verbatim to `docs/archive/status/status-archive-previous-<lo>-<hi>.md` by `archive-changelog.mjs --status`); they are history and are never deleted. | By hand, every round. |
| `## Snapshot` | What is done, as dated one-liners. The plan is the roadmap; this is the record. The older lines are moved verbatim to `docs/archive/status/status-archive-done-<lo>-<hi>.md` by `archive-changelog.mjs --snapshot`, leaving one «Archived» line last. | By hand. |
| `## Next up` | The open decisions (each with a suggestion) and the next task. | By hand. |
| `## Gates` | A table of the steps only the owner can do (a review, a release, a run on another machine): what, and its state. The agent never marks one done. | By hand; the owner closes them. |

The paragraph `**Fingerprint:**` was already required before this card (`EBUMP_STATE`); the other six are the new check.

## The order

From the fingerprint on, the parts must come in this order:

1. `**Fingerprint:**`
2. `**Last updated (round N):**`
3. `## Snapshot`
4. `## Next up`
5. `## Gates`

The order matters because the cold-start command of the instructions cuts the file at these lines: it prints everything before `**Current version:**` (the Instructions block), then everything from `**Fingerprint:**` up to the first `**Last updated (round`. `## Instructions` and `**Current version:**` only have to exist. The command needs the Instructions block to come first, so it does in this project and in the template of `chicla init`; a status file that puts `**Current version:**` above `## Instructions` still passes the check, but the command would cut it wrongly.

## What the next session reads first

In this order, and nothing else until the task asks for it:

1. `CLAUDE.md`.
2. The Instructions block of the highest-numbered status file, the Fingerprint paragraph and the newest `**Last updated (round N):**` entry (the one command of instruction 1 prints exactly these).
3. The result of `chicla bump-round --verify`. If it fails, stop and tell the owner.
4. The open decisions: the proposals still waiting in `## Next up`, each to be confirmed by the owner before any work starts.

`## Snapshot`, `## Gates` and the older `**Previous (round M):**` entries are read on demand (search for a term, a card ID or a round).

## What the check refuses

`bump-round` runs the check when it is about to write: a bump, a `--refresh`, and either of them with `--dry-run`. It runs after the state has been read (`EBUMP_STATE` still comes first for a damaged fingerprint paragraph) and after the three `seq` values have been paired (`EBUMP_UNPAIRED` comes first), and before anything is written, renamed or regenerated.

| Result | When |
| --- | --- |
| `EBUMP_STATUS`, parts missing | One or more of `## Instructions`, `**Current version:**`, `**Last updated (round N):**`, `## Snapshot`, `## Next up`, `## Gates` is not at the start of a line outside a fenced block. All the missing parts are named in one message. |
| `EBUMP_STATUS`, out of order | Last updated, Snapshot, Next up and Gates are not in that order after the fingerprint paragraph. |

When it refuses, nothing is written: the status file keeps its number and its text, and so do the app file, the CHANGELOG, `CLAUDE.md` and `FILES.manifest`. `--verify` does not run this check: it only reads, and an old file that lacks a part can still be verified. The fix is always by hand: restore the part, then run `bump-round` again.

## The template

`chicla init` writes a status file from `packages/chicla-kit/templates/CHICLA_PROJECT_STATUS-1.md`. It has every part above, in the order above, and passes the check. Its item 1 gives the same cold-start command as this project, and `test/template-cold-start.test.mjs` runs that command on the template (round 182, C10.6: until then the template had `**Current version:**` first and no command).
