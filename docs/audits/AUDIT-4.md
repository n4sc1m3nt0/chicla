# AUDIT-4 — security, performance and token efficiency (whole project, v0.0.236)

Date: 2026-10-22 (round 233b) · Code audited: the round 233 tree (`chicla-zip` and `chicla-kit` 0.1.0, root v0.0.236) · Node 22.22.0, Linux, as root, 2 cores.
Method (status file, item 2): measured, not guessed: byte sizes of what a session reads, the timing of the whole `npm test` (1409 tests, 565 s), a read of the extraction, secret-scan, spawn and CI paths. Nothing was fixed in this round; the plan in §6 is the fix, one card per round. Line coverage and the mutants were not re-run.

Decisions of Rodrigo (2026-10-22): **D-234a** yes, record the audit here; **D-234b** a docs round first, to plan the approach; **D-234c** yes, `recovery` refuses a `.tar.gz` (recorded in ROADMAP D137).

## 1. What is good

- Extraction never follows or creates symlinks, creates files in exclusive mode, uses `O_NOFOLLOW`, has limits against zip bombs and is atomic with rollback (five reviews, AUDIT-1 to 3, the four security reviews).
- Zero dependencies (D3): there is no supply chain to audit besides Node itself.
- The pin of the five recovery files and the three-way fingerprint catch drift between sessions and accounts.
- The secret scanner keeps names and kinds out of every output, and the manifest never lists a secret.
- A cold start costs about 22 KB (`CLAUDE.md` 8.6 KB plus the cold-start command, 13.4 KB), roughly 6 000 tokens. That is well designed.

## 2. Security

- **S-1. `recovery` extracts a `.tar.gz` with the system `tar`** (`pinned/recovery-report.mjs`, the `.tar.gz` branch). It contradicts product rule 2 (a zip is hostile input). GNU `tar` refuses `..` and absolute names by default, but what it does with symlink and hardlink chains was not tested. The archive is only trusted if Chicla made it: the dump writes `.tar.gz` as its third fallback (after the `chicla-zip` writer and `zip`). Fix: `recovery` refuses it (D-234c, D137); the tar stays an output format of the dump.
- **S-2. The new default of `recovery` is predictable** (round 233: `<temp>/chicla-recovered`, used where `/home/claude` does not exist or on Windows). On a shared Linux `/tmp`, another user can create that folder first and read the result, or plant a dangling symlink that makes `mkdir` fail. Introduced by round 233, found by this audit. Fix: `mkdtempSync(join(tmpdir(), "chicla-recovered-"))` for that fallback; an explicit `--out` and the `/home/claude` default keep the `-2`, `-3` suffixes.
- **S-3. The CI has no `permissions:` block**, so the token gets the repository default. Fix: `permissions: contents: read` at the top of `.github/workflows/ci.yml`, widened only on the job that needs it (the artifact upload does not).
- **S-4. Actions are pinned to tags** (`actions/checkout@v4`, `setup-node@v4`, `upload-artifact@v4`) and nothing updates them. Fix: pin each to a commit SHA with the tag in a comment, plus `.github/dependabot.yml` for `github-actions`.
- **S-5. The content scan is narrow, by design.** It looks for 4 kinds (private key header, AWS access key id, GitHub token, npm token), skips files over 1 MiB, binary files and UTF-16 (`policy.mjs`, `SCAN_LIMIT`). The limits are stated, which is honest. Cheap additions: Slack (`xox[baprs]-`), Stripe (`sk_live_`, `rk_live_`), Google API key (`AIza` + 35), and the `sk-ant-` and `sk-` keys of Anthropic and OpenAI, each with a test for the false positives of ordinary prose.
- **S-6 (checked, no finding).** Every `spawnSync` takes an argument array, never a shell string; the dump's `zip` and `tar` calls take names from a staging folder Chicla built. A name that starts with `-` is not passed as a bare argument in the paths read here, but this was read, not fuzzed.

## 3. Performance

- **P-1. The suite takes 565 s, not the «about 4 minutes» of `CLAUDE.md`** (1409 tests, not 900+). The ten slowest are `make-delivery` integration tests, 15 to 38 s each, about 190 s together. With 2 cores `node --test` cannot overlap much. Fix: `test:fast` (everything but the integration tests) for the rounds, the full `npm test` once per round.
- **P-2. `check-manifest` reads each file twice** (the secret scan, then the crc32 of `--write`) and calls `statSync` per entry instead of `readdirSync({ withFileTypes })`. At 229 files it costs nothing; it is the pattern that does not scale. Fix: one read per file, handed to both.
- **P-3 (stale, not a defect). `big-cm.log`** is a benchmark log in the root, listed in `FILES.manifest` and shipped in every delivery. It talks about a `MAX_CENTRAL` of 1 GiB; the code has 64 MiB since C15.6 (round 174), so the log is an old measurement, not a contradiction. Fix: move it to `bench/` with a header line saying which limit it was measured at, or delete it with `--allow-removed big-cm.log` (named in the reply).

## 4. Tokens

- **T-1. The biggest waste is polling.** One round of this audit's kind used about 25 calls only to wait for the suite, each one re-sending the whole context. The rule «`sleep` at most 60 s per call» exists so a call never hangs, but one call with `timeout 580` that waits on the log (`until grep -q '^EXIT' log; do sleep 5; done`) is bounded too, and costs 2 calls instead of 20. Fix: change rule 1 of «Long commands» in `CLAUDE.md` and item 20 of the status file.
- **T-2. The timing claims are stale** (`CLAUDE.md`: «about 4 minutes (900+ tests)»; real: about 9.5 minutes, 1409 tests). A stale number makes sessions poll on the wrong clock.
- **T-3. The status file is 170 KB** (about 48 000 tokens) with 104 «Previous» blocks; the `Current version` line alone is 8.3 KB. The cold start does not read them, but any `grep` that lands there prints them.
- **T-4. `CHANGELOG.md` has 236 rounds, 319 KB, and was never archived**, although item 6 says to archive at about 20 rounds and `scripts/archive-changelog.mjs` exists. Nobody pays for it unless the file is opened whole, but its hash covers all of it.
- **T-5. `CLAUDE.md` repeats the status file** (delivery rules, long commands). It already says the status block wins; every copy is one more place to go stale, as T-2 shows.
- **T-6. «Open decisions first»** costs one full turn before any work. It is already skipped when none is open; the gate table says only G-C8 and the exFAT part of G-C3 are, so the check should be a command, not a re-read.

## 5. Different approach (proposals, not scheduled)

- **A-1. One integrity check instead of three.** `check-manifest`, `verify-delivery` and `bump-round --verify` each know their own rules; that is how CRLF in `CLAUDE.md` passed all of them until round 233. One list of «files that must not have CRLF, must not look like a secret, must not be missing», called by the three, closes that kind of gap. Proposed as D138.
- **A-2. Fewer pinned modules, or a generated pin.** Every edit of a pinned file costs a whole round of follow-ups (the pin, the docs table, the test that holds the old sha256: all three happened in round 233). D138 also asks whether the pin should be generated at build time. Closed (round 272, D144, `docs/plan-a2-pins.md`): measured, the pin was already generated by `bump-round` and the cost was four tests that froze bytes (fixed in C21.1); the cost is written once in `docs/pinned-files-design.md` §8 (C21.2).

## 6. Plan, one round per card

One concern per round, tests first (red before the code), at most 3 source files and about 200 changed lines (CLAUDE.md working rules). Order below; C16.1 is next.

### C16.1 Recovery hardening (S-1, S-2, D-234c)

Source files: `packages/chicla-kit/src/pinned/recovery-report.mjs`, `packages/chicla-kit/src/cli.mjs` (help text only). 2.
Tests first: the fallback default is a fresh `mkdtemp` folder (two runs never share one, and a pre-created `chicla-recovered` is never used); a `.tar.gz` is refused with its own code (`ERECOVERY_FORMAT`) and nothing is extracted; the dump tests that feed a `.tar.gz` to `recovery` become tests of the refusal; `robustness-r233.test.mjs` is updated for the new default.
Pin: MOVES (a pinned file). `bump-round` rewrites it; the test that holds the old sha256 (`pinned-recovery-report-move.test.mjs`) reverses the new edit first, as in round 233.
Done when: the full `npm test` passes, one hand mutant per guarantee is red, `docs/zip-handling.md` and item 17 of the status file say that a `.tar.gz` dump is recovered by hand, and the CHANGELOG lists what was not run.

### C16.2 CI hardening (S-3, S-4)

Source files: none (`.github/workflows/ci.yml`, new `.github/dependabot.yml`). 0.
Tests first: `test/ci.test.mjs` asserts a top-level `permissions:` of `contents: read`, every `uses:` pinned to a 40-hex SHA, and a Dependabot entry for `github-actions`.
Pin: does not move.
Done when: the test passes and Rodrigo reads one green CI run on the pushed tree (a gate; Claude cannot run the CI).

### C16.3 Process docs: polling and stale numbers (T-1, T-2, T-5, P-3)

Source files: none (`CLAUDE.md`, the status file items 20 and 21, `docs/`). 0.
Tests first: `test/docs-accuracy.test.mjs` asserts that `CLAUDE.md` and item 20 agree on the long-command rule and carry no «900+» or «about 4 minutes»; `big-cm.log` is not in the root.
Pin: does not move (`CLAUDE.md` is not in the toolchain digest; the digest line is only rewritten).
Done when: the rule says one blocking wait with `timeout`, the duplicated paragraphs of `CLAUDE.md` become a pointer to the status block, and `big-cm.log` is moved or removed with `--allow-removed big-cm.log`, named in the reply.

### C16.4 Archive the history (T-3, T-4)

Source files: `scripts/archive-changelog.mjs` (a status-file mode for the «Previous» blocks, only if the script cannot already do it). 1.
Tests first: `scripts/smoke-test-archive-changelog.mjs` and a unit test: the archive keeps every byte of what it moved, the fingerprint hashes are recomputed with `bump-round --refresh`, and the cold-start command prints the same text as before.
Pin: does not move.
Done when: `CHANGELOG.md` keeps the last ~20 rounds, `CHANGELOG-archive-rounds-*.md` holds the rest verbatim (nothing deleted, item 6), the status file keeps the last 5 «Previous» blocks, and `--verify` is green.

### C16.5 More secret kinds (S-5)

Source files: `packages/chicla-kit/src/pinned/policy.mjs`. 1.
Tests first: one positive and one false-positive case per new kind (Slack, Stripe, Google, `sk-ant-`, `sk-`); the kind, never the match, is what is printed.
Pin: MOVES.
Done when: the full `npm test` passes, one mutant per new detector is red, `docs/manifest.md` lists the kinds, and the known limits (1 MiB, binary, UTF-16) stay stated.

### C16.6 Faster rounds (P-1, P-2)

Source files: `packages/chicla-kit/src/check-manifest.mjs` (one read per file, `withFileTypes`), `package.json` (`test:fast`, `test:slow`). 1 source file.
Tests first: the manifest written is byte-identical to the one before the change; a file read once is scanned and hashed from the same bytes; `test:fast` plus `test:slow` run the same set of test files as `npm test`.
Pin: does not move (`check-manifest.mjs` is not one of the five).
Done when: `test:fast` takes under 3 minutes here, the numbers are measured and written in `CLAUDE.md`, and the CI keeps running the full `npm test`.

## 7. State

- C16.1 done in round 234: S-1 and S-2 are fixed (`recovery` refuses a tar archive; the fallback default is a fresh `mkdtemp` folder). The pin moved.
- C16.2 done in round 235: S-3 and S-4 are fixed (`permissions: contents: read`; actions pinned to commit SHAs; `dependabot.yml`). No source, the pin did not move; the CI run on GitHub is Rodrigo's to read.
- C16.3 done in round 236: T-1, T-2, T-5 and P-3 are fixed (item 20 of the status file is the single source with one bounded wait; the stale numbers are corrected; `CLAUDE.md` points to the status block; `big-cm.log` moved to `packages/chicla-zip/bench/` with a header). Docs and one test, the pin did not move.
- C16.4 done in round 238: T-3 and T-4 are fixed (`archive-changelog.mjs --status`; `CHANGELOG.md` 326 KB to 27 KB, status file 176 KB to 141 KB, nothing deleted). One source file, the pin did not move. What is left of the status file is mostly the Snapshot (D139).
- C16.5 done in round 239: S-5 is fixed (five kinds, nine in all; `docs/manifest.md` §5). The card named one source file, but `emergency-dump.mjs` keeps its own copy of the detector (D7) and a test makes it agree, so two files changed. The pin moved.
- C16.6 done in round 240: P-1 and P-2 are fixed (`check-manifest` reads each file once; `npm run test:fast` takes 160 s here, `test:slow` the 7 integration files; the CI keeps the full `npm test`). The card named one source file, the runner script makes it two; the pin did not move.
- C16.7 done in round 241 (D139): the status file's Snapshot is archived the same way (`archive-changelog.mjs --snapshot`; 147 KB to 50 KB, nothing deleted). M16 is complete.

## 8. Not done, and why

- Nothing in §2 to §4 was fixed in round 233b (D-234b: docs first); §7 says what is fixed since.
- The mutants, `npm run smoke`, Node 18 and 20, macOS and Windows were not run; S-1 was not tested with hostile symlink and hardlink tarballs, only read (it is now moot: the code that ran `tar` is gone).
- A-1 and A-2 wait for Rodrigo (D138).
