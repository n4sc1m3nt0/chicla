# chicla-kit

The workflow of Chicla for coding agents, as the `chicla` command: a status file and fingerprints that prove the project files belong together, one rule set for what never leaves the machine, a manifest, a verified delivery zip, and an emergency dump with recovery. Plain Node, **zero dependencies**, Node 18+, ESM.

> **Status: `0.1.0`, published on npm** (`npm install chicla-kit`, which pulls `chicla-zip` from npm; then `npx chicla <command>`). From a clone of the repository you can also run `node packages/chicla-kit/src/cli.mjs <command>`. It is not declared supported on Windows: its suite passes in CI there, but the dump and recovery never ran on a real Windows machine. `chicla init` starts a new project (instruction files, status file, changelog, version file and manifest, consistent from the first second); `chicla update` compares the instruction files with the templates of the installed kit and replaces a file only when you name it. A new project still copies `ROADMAP.md`-style planning files by hand if it wants them. The kit finds `chicla-zip` by its package name (an installed kit) and, only inside this repository, by the relative path (card C13.5, round 166).

The whole picture (the files, the rounds, the delivery and the emergency path) is in the [root README](../../README.md). Security limits: [`SECURITY.md`](../../SECURITY.md).

## Commands

```
chicla init [--agent <name>]... [--json] [--root <dir>]
chicla update [--agent <name>]... [--apply <file>]... [--json] [--root <dir>]
chicla check-manifest [--write] [--json] [--root <dir>]
chicla bump-round [--verify | [--refresh] [--dry-run] [--note <text>]] [--json] [--root <dir>]
chicla verify-delivery <zip> [--against <zip>]... [--allow-removed <path>]... [--json] [--root <dir>]
chicla make-delivery <out.zip> [--against <zip>]... [--allow-removed <path>]... [--json] [--root <dir>]
chicla dump [note...] [--note <text>] [--project-only] [--outdir <dir>] [--json] [--root <dir>]
chicla recovery <dump.zip> [--baseline <zip>] [--out <dir>] [--toolchain-digest <hex>] [--trust-toolchain] [--json]
```

| Command | What it does |
| --- | --- |
| `chicla init` | Starts a project: writes `CLAUDE.md` and `AGENTS.md` (the rules for state, policy, dump and delivery) and the state files `CHICLA_PROJECT_STATUS-1.md`, `CHANGELOG.md`, `version.mjs` and `FILES.manifest`, with the fingerprint already consistent (`bump-round --verify` passes at once). It never overwrites: if any of them, or any status file, exists, nothing is written and it exits 1. `--agent <name>` (repeatable) adds the instruction file of one more agent, see «Agents» below; an unknown name exits 2. |
| `chicla update` | Compares `CLAUDE.md`, `AGENTS.md` and the file of every other agent the project has (or `--agent` names) with the templates of the installed kit, and shows a diff (`-` yours, `+` the template). It writes nothing by itself. `--apply <file>` (repeatable) replaces exactly that file with the template, or creates it if it is missing; that is the confirmation, and it replaces the whole file, so local edits in it are lost. The state files (status file, `CHANGELOG.md`, `version.mjs`, `FILES.manifest`) are never compared or named. After an apply the manifest and the fingerprint are refreshed (`bump-round --refresh`); if that fails the files go back as they were. Line endings alone are not a difference. A bad name exits 1 and writes nothing. |
| `chicla check-manifest` | Checks `FILES.manifest` (every project file, with crc32 and size) against the disk; `--write` regenerates it. A listed file that vanished is a lost file and fails. |
| `chicla bump-round` | Closes a round: renames `CHICLA_PROJECT_STATUS-N.md` to `N+1`, rewrites the three-way fingerprint, regenerates the manifest and verifies. `--verify` only checks; `--refresh` keeps the number; `--dry-run` writes nothing. |
| `chicla make-delivery` | Builds the delivery zip of the whole tree: manifest check against the previous zips, build check, manifest, baseline, zip, verification. A rejected zip is deleted. |
| `chicla verify-delivery` | The independent check of a finished zip: whole tree, manifest, crc32 and size against the central directory, baseline, no junk, no secrets. |
| `chicla dump` | Emergency zip of the working directory with no guards. It always tries to produce a zip; secrets and `node_modules/` stay out. |
| `chicla recovery` | Restores an emergency dump: extracts, verifies, compares with a baseline and writes `RECOVERY_DIFF.md`. It first checks the digest of the `RECOVER/` toolchain against the pin in `CLAUDE.md`. |

## Exit codes and `--json`

Exit codes: `0` ok · `1` the check failed (for `dump`: no dump was made; for `recovery`: nothing recovered) · `2` usage error · `3` toolchain digest mismatch (`recovery`). With `--json`, stdout is exactly one JSON object and the human text goes to stderr. With no arguments on a terminal, `chicla` opens a read-only panel (status, gates, decisions, delivery); a pipe, `--json`, CI and `NO_COLOR` get plain text.

## What it does not do

It does not publish anything, does not merge your local edits into a template (`update` shows the diff and replaces whole files only), and does not support Windows. Fingerprints, CRC32 and the toolchain digest are integrity checks, not authenticity (the rules about the project's own state are in `docs/integrity.md` of the repository).

Licence: Apache-2.0.

## Agents

`chicla init --agent <name>` adds the file that agent reads to the default set (`CLAUDE.md`, `AGENTS.md`, the state files). The rules are written once, in `AGENTS.md`; the agent files carry the same body. It never overwrites and is all or nothing.

| `--agent` | File | Note |
| --- | --- | --- |
| `claude` | `CLAUDE.md` | in the default set |
| `codex` | `AGENTS.md` | in the default set |
| `gemini` | `GEMINI.md` | added by the flag |
| `copilot` | `.github/copilot-instructions.md` | added by the flag; the folder `.github/` is created if missing |

Only agents whose file was confirmed enter this table (first read in a survey on 2026-10-17, then re-read on the vendors' own pages on 2026-10-22: gate G-C15, closed by the owner). Cursor and Windsurf (now Devin Desktop) read `AGENTS.md` on their vendors' own pages, so they need no entry. Cline and Antigravity are said to read it too, but that was not checked on their pages; Continue is not confirmed and is not in the table.
