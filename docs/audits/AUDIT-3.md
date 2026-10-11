# AUDIT-3 — end of M4 (rounds 33 to 38, cards C4.1, C4.2a, C4.2b, C4.3, plus C3.9)

Date: 2026-10-09 · Code audited: v0.0.41 (round 38); fixes in v0.0.42 (round 39) · Node 22.22.0, Linux, as root.
Method (status file, item 2): promised (ROADMAP §5 and the M4 cards) against what exists; probes of the command line by hand (pipes, odd names, odd options, hostile names); a mutation pass on what this round changed. Line coverage was not measured.

## 1. Promised vs. what exists

| Promise | State |
| --- | --- |
| C4.1 `markUtf8Names`: absolute offset, idempotent, confirmed by an independent reader | Done (round 33, 14 tests). Not re-probed here beyond `mark --json` (patched, total; second run patches none). |
| C4.2 command line `ls`, `test`, `cat`, `extract`, `create`, `mark`, `--json`, exit codes | Done (D34 confirmed). **Gaps found:** A-1 to A-4 below, all fixed. |
| `create` shows `collisions`, takes `--exclude`, `--stream`, `--deterministic` | Done (round 38, read back by `unzip`, `zipinfo` and Python). |
| C4.3 `docs/zip-handling.md` | Done; §8 now describes `--`, the escaping and the `--json` coverage. |
| «Return errors, never throw through the CLI» (CLAUDE.md product rule 2) | Done for every ZipError and system error; **A-1** was the one exception (a closed pipe). |

## 2. Real bugs (all four fixed in round 39)

- **A-1 (fixed). A closed pipe crashed the CLI with a stack trace.** `zipkit.mjs ls big.zip | head -c1` ended with an unhandled `EPIPE` (Node's «Unhandled 'error' event», stack on stderr, exit 1). Same for `cat` and `--json`. Now the entry point stops quietly with exit 1 and nothing on stderr. `runCli` itself is unchanged (it never ends the process).
- **A-2 (fixed). No way to name something that starts with `--`.** `cat z --flag.txt` was «unknown option», and so was a zip called `--weird.zip` (for the zip, `./--weird.zip` worked; for an entry there was no way at all). `--` now ends the options, as in every Unix tool; the command still has to come before it.
- **A-3 (fixed). Names from the zip reached the terminal raw.** Probe: an entry named `evil␛]0;PWNED␇␛[2Jname.txt` retitled the window and cleared the screen on `ls`; `nl\nfake: line.txt` printed a fake line. A zip is hostile input (CLAUDE.md product rule 2). In text output control characters, DEL, C1 characters, U+2028/2029 and bidi controls (U+202A–202E, U+2066–2069) are now shown as `\xNN` or `\uNNNN`, in `ls`, `test`, `extract`, `create`, error lines and usage errors. `cat` stays raw (it is the file, not a name) and `--json` keeps the real names (it is data; JSON escapes C0 itself).
- **A-4 (fixed). `--max-bytes` took anything `Number()` accepts** (`0x10`, `1e3`, an empty string, `-5`). Only plain digits (at most 15) are a size now; anything else is a usage error (exit 2) before anything is extracted.

## 3. Missing behaviour, scheduled

- **D35 (proposal, Claude): `create` replaces an existing output without asking** (atomically, as `createZip` does), while `extract` refuses an existing target unless `--overwrite`. A typo such as `create src.zip src` replaces a zip the user may have wanted. Suggestion: refuse with `EEXIST` unless `--overwrite`, as `extract` does. Scheduled as C4.4 once Rodrigo decides.
- **Resolved in round 40:** D35 confirmed by Rodrigo and done with `--help` as C4.4.
- **C4.4 also holds `--help` / `-h`**: today `--help` is «no command» (exit 2, usage on stderr). Convention is exit 0 with the usage on stdout.
- **Known limit:** `create` always skips symlinks (no `--symlinks error`), and `--exclude` has no negation or `**`; both are options the library already has or could take, not asked for in the card.

## 4. Untested paths and survivors

- The `esc()` on paths the user typed themselves (the zip and folder in the `✓` lines of `mark`, `create`, `extract`) is not tested: those strings are not hostile input. Tidiness only.
- Equivalent mutant: dropping the `--`-awareness of the command search (`argv.find` instead of `argv.slice(0, dd).find`) is killed only by `run('--', 'ls')`; it is covered now.
- `EPIPE` on stderr is handled by the same handler as stdout; only stdout is tested.
- Not run: Node 18 and 20, macOS, Windows, CI, `npm run smoke`, `bench/*-real.mjs`; the terminal behaviour was checked with `od -c` on the bytes, not in a real terminal emulator.

## 5. Mutation pass (17 mutants on this round's code)

Red: `--` not honoured for the command, for positionals and for `--json`; each class of escaped characters removed (C0, DEL and C1, C1 only, U+2028/2029, bidi, isolates); the `EPIPE` handler removed; `--max-bytes` pattern loosened (two variants); the escape missing from `ls`, from the `test` warnings (both), from `extract`'s skipped and collision lines, from usage errors and from error lines. After four added tests every one is red; four first survived (C1 range, U+2028/2029, isolates, the `test` no-flag line) and drove the extra cases in `test/audit3.test.mjs`.
