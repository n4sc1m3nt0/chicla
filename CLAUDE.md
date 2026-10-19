# CLAUDE.md — Chicla operating rules

## Emergency and recovery (override everything below)
- **`/dump`** (also "dump", "emergência", "emergencia"): exactly three steps and nothing else. (1) `node scripts/emergency-dump.mjs "one-line note: what is in progress and what is missing"`; (2) `present_files` the printed path; (3) one sentence: "Dump created: <n>. Send it to the next session with «recovery mode»." No guards, no manifest, no docs, no explanation. **`/dump project`** (also "dump project", "dump projeto"): the same three steps with `--project-only` (C6.2): (1) `node scripts/emergency-dump.mjs --project-only "one-line note"`; (2) `present_files` the printed path; (3) one sentence: "Dump created (project only): <n>. Send it to the next session with «recovery mode»." It takes only the project root, so scratch files beside it are NOT in it. If it refuses (exit 1: no project root found), say that in one sentence and offer a plain `/dump`; do not run it unasked.
- **Toolchain pin** (C9.4): `toolchain-digest: ad621e95fb4457d1f2c276d96b4fbd87b6cb24696d6aeeeb429e0dac61f3b68d` is the digest of the 5 files a dump carries in `RECOVER/`; `bump-round` writes it, `--verify` checks it, and the start line of item 17 refuses a dump whose `RECOVER/` differs (`EHASH_TOOLCHAIN`, `--trust-toolchain` only if Rodrigo says so).
- **Recovery mode** (a zip with `RECOVERY_MARKER.json`, or "recovery mode"): follow item 17 of the status file instructions. Priority is to DELIVER, not to start a new task.

## Start of every session
Read this file, then the **highest-numbered** `CHICLA_PROJECT_STATUS-<N>.md`: the Instructions block, the Fingerprint paragraph and the newest "Last updated" entry only (the one command is item 1). Run `node scripts/bump-round.mjs --verify`; if it fails, stop and tell Rodrigo.

**Open decisions come first (Rodrigo, 2026-10-09).** Before starting any work, list the decisions still open (ROADMAP §2 rows that are proposed or waiting, and those named in "Next up"), each with Claude's suggestion, and ASK Rodrigo to confirm them; do not start the task until he answers. At the end of the round, if new decisions came up, list them the same way and ask him to confirm them too (rule 6 below). **That Instructions block is the single source of the process rules** (fingerprints, closing kit, delivery, honesty, task size). This file holds the product, architecture and working rules; if the two ever disagree on process, the status block wins. Read `ROADMAP.md` only for the card the task points to.

## Delivery rules (summary; full text in the status file, items 8 to 15)
1. One zip of the WHOLE tree, built only with `node scripts/make-delivery-zip.mjs <out.zip> --against <each upload zip>`; never hand-rolled, never presented unless `verify-delivery-zip` passed. Name: `chicla-roundN-YYYY-MM-DD.zip`.
2. Exactly one `CHICLA_PROJECT_STATUS-N.md` in the root; `bump-round` renames it. Bump `"version"` in the root `package.json` on every output and confirm it with `grep` (D13).
3. `node_modules/` and `.env*` never leave the machine. A deliberate deletion needs `--allow-removed <path>` and is named in the reply.
4. Files before explanation: write the files and `present_files` first, prose after.
5. Say what was NOT run (`npm test` on Node 18/20, `npm run smoke`, `check-build`, CI, macOS). Never claim a check you did not run.

## Product rules (never violate)
1. **Zero dependencies** (D3). Node 18+, ESM (`.mjs`), types by JSDoc.
2. A zip is hostile input: never extract outside the destination, never trust names, sizes or counts from the archive. Return errors, never throw through the CLI.
3. Whatever Chicla writes must be accepted by `unzip -t` and Python's `zipfile` (independent readers).
4. Distribution is GitHub first and also npm from 0.1 (D41). Only Rodrigo publishes (login and 2FA): the AI never runs `npm publish`, and nothing is published before the licence (G-C2) is decided.
5. Licence is Apache-2.0 (D46, Rodrigo, 2026-10-11): `LICENSE` in the root and `"license": "Apache-2.0"` in every `package.json`. Add no copyright line or NOTICE with a holder's name until Rodrigo gives it.
6. User-facing messages are English only, plain strings (D18, replaces D8). Tests assert error `code`s, never message text.

## Long commands: never get stuck (Rodrigo, 2026-10-13, round 124)
`npm test` takes about 4 minutes (900+ tests) and `npm run mutants` about 30 minutes or more (229 mutants): both are longer than a foreground shell call may last (default 2 minutes, hard limit 10), and a call that hits the limit leaves the session waiting on nothing. So:
1. **Never run `npm test`, `npm run mutants`, `npm run smoke` or `check-build` in the foreground.** Start them in the background with the output in a file, e.g. `npm test > /tmp/test.log 2>&1 &`, then poll the file (`tail -n 5`) every 30 to 60 seconds with short calls; read `exit` from a line you append (`; echo "EXIT $?" >> /tmp/test.log`). Never `sleep` more than 60 seconds in one call.
2. **While writing code, run only the test file you are working on** (`node --test packages/<pkg>/test/<file>.test.mjs`, always with a `timeout 120`). The whole `npm test` runs ONCE per round, after `bump-round` (closing kit, item 13), not after each edit.
3. **Mutants: only this round's.** Run `node scripts/mutants.mjs --only <id> --timeout 60` for each mutant the round adds or touches, one at a time, in the background (rule 1). The full `npm run mutants` runs only when Rodrigo asks for it in that session; otherwise report it as NOT run (item 18 of the status file) and leave it as a gate. Do not turn a milestone's «break each guarantee» into a full list run.
4. **One retry, then stop.** If a command prints nothing for 3 minutes, or its log has not grown for 3 polls, kill it (`pkill -f 'node --test'`, `pkill -f mutants.mjs`), look at the last 25 lines of the log and run the single file that was last active. Do not start the same whole command a second time. If that file also hangs, STOP, report the file and the last log lines to Rodrigo and deliver what builds (item 15 of the status file).
5. **A hang is a finding, not a retry loop.** A test or mutant that hangs gets `--test-timeout=60000` (tests) or a lower `--timeout` (mutants) for the diagnosis, is named in the reply and in the CHANGELOG, and is never «fixed» by raising a timeout, skipping the test or removing the mutant without Rodrigo's word.
6. **Say it early.** If the plan needs the whole `npm test` or a mutant run, say so in the first reply and give the expected time (4 min, 30+ min), so Rodrigo can say «skip» or «go».

## Working rules (ROADMAP §3)
1. **One round = one small, verifiable slice.** At most 3 source files and about 200 changed lines (tests, the manifest and docs do not count). If it grows, stop at the nearest seam.
2. **Tests first.** Every card starts with tests that fail; if they pass before the code, they protect nothing.
3. **Break it on purpose.** At the end of each milestone, break each guarantee and watch its test go red.
4. **Independent reader.** Dangerous behaviour (writing, extraction, recovery) is verified by something other than the code that produced it.
5. No fabricated results: what you cannot run is reported as not run and becomes a **gate** for Rodrigo. Never mark a gate done.
6. Keep changes inside the task. Report anything noticed outside it; do not fix it silently.
7. Nothing half-wired: every round leaves the tree building, tested and consistent.

## Every round, in this order
1. Read the status slice and run `bump-round --verify` → state the plan in 3–6 lines.
2. Write the tests (see them fail), then the code.
3. Run `npm test`, `node scripts/check-build.mjs`, and `npm run smoke` if a script changed. Report whatever you could not run.
4. Close with the **closing kit** (status file, item 13): CHANGELOG entry at the top, version bump, `bump-round`, zip, `present_files`.
5. List the gates Rodrigo must complete (ROADMAP §9).
6. **Open decisions, always (before and after).** Before starting: ask Rodrigo to confirm the open ones (see "Start of every session"). At the end: Every reply that ends a round (and any reply where one is pending) lists the open decisions (proposals waiting for Rodrigo, calls made on delegation, next-task choices), each with Claude's suggestion, in a form Rodrigo can answer in one line (use AskUserQuestion when available), so the answer is recorded in the ROADMAP and the status file at once.
