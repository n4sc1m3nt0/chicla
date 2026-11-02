# Project status

Created by `chicla init`. This file is the memory of the project between sessions: the state, the decisions, the gates and the next task. Keep it true; the agent reads it first, every session.

## Instructions

1. **Cold start.** Read `CLAUDE.md`, then only the Instructions block, the Fingerprint paragraph and the newest «Last updated» entry of this file. One command prints exactly these:
   ```
   f=$(ls CHICLA_PROJECT_STATUS-*.md | sort -t- -k2 -n | tail -1); n=$(grep -n '^\*\*Current version:\*\*' $f | head -1 | cut -d: -f1); sed -n "1,$((n-1))p" $f; sed -n '/^\*\*Fingerprint:\*\*/,/^\*\*Last updated (round/p' $f
   ```
   Open everything else on demand: search for a term, do not re-read everything.
2. **Short commands.** `next` means the task under «Next up».
3. **Roadmap.** If the project has a `ROADMAP.md`, read only the part for the task at hand.
4. **Map.** `CLAUDE.md` holds the rules; this file holds the process and the state; `CHANGELOG.md` holds what each round did.
5. **Keep the docs true.** New work goes into the plan in its place, never done silently. Record what is finished.
6. **History is never deleted.** Move old entries to an archive; do not erase them.
7. **Round consistency.** The round in the changelog and in this file, the version in `version.mjs` and the newest files must agree.
8. **Status file number.** `CHICLA_PROJECT_STATUS-N.md`, one running integer, raised by `chicla bump-round` each time the file is delivered.
9. **App version.** Edit `APP_VERSION` in `version.mjs` in every output that changes the project.
10. **Session-start check.** After item 1 run `chicla bump-round --verify`. If it fails, STOP and tell the owner; do not work on top of files that disagree.
11. **Fingerprint.** The paragraph below, the third line of `version.mjs` and the first line of `CHANGELOG.md` carry the same numbers. `chicla bump-round` writes them; never edit them by hand. If they do not match, stop and tell the owner.

**Current version:** v0.0.1 (round 1: the project was started with `chicla init`)

**Fingerprint:** seq=1 · app=version.mjs ·
app_sha256_12=000000000000 (of everything below the app file's own
fingerprint comment; unchanged at this seq — rewritten by `scripts/bump-round.mjs`) ·
changelog=CHANGELOG.md ·
changelog_sha256_12=000000000000 (hash of `CHANGELOG.md` below its own
fingerprint line; recomputed by `scripts/bump-round.mjs` at seq 1) · matches the
`STATUS_FILE_FINGERPRINT` comment on line 2–3 of the app file and the
`CHANGELOG_FINGERPRINT` comment on line 1 of `CHANGELOG.md`. If any of
these three don't match what you're looking at, stop and see
instructions item 11 above before doing anything else.

**Last updated (round 1):** the project was started. Nothing else has been done.

## Snapshot

- Done: round 1: `chicla init` wrote the instruction files and the state files.

## Next up

**Open decisions:** none. **Task:** the owner names it.

## Gates

A gate is a step only the owner can do (a review, a release, a run on another machine). The agent never marks one done.

| Gate | What | State |
| --- | --- | --- |
