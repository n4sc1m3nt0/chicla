# CLAUDE.md — Chicla operating rules

## Emergency and recovery (override everything below)
- **`/dump`** (also "dump", "emergência", "emergencia"): exactly three steps and nothing else. (1) `node scripts/emergency-dump.mjs "one-line note: what is in progress and what is missing"`; (2) `present_files` the printed path; (3) one sentence: "Dump created: <n>. Send it to the next session with «recovery mode» and the last delivery zip." No guards, no manifest, no docs, no explanation.
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
