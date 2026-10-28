# Contributing

Chicla is a small project with strict rules. Read them before sending anything.

## Product rules

1. **Zero dependencies.** Node 18+, ESM (`.mjs`), types by JSDoc. A pull request that adds a dependency is closed.
2. A zip is hostile input: never extract outside the destination, never trust names, sizes or counts from the archive, return errors instead of throwing through the CLI.
3. Whatever Chicla writes must be accepted by `unzip -t` and by Python's `zipfile`.
4. User-facing messages are English plain strings; tests assert error `code`s, never message text.
5. The licence is Apache-2.0. By contributing you agree that your contribution is under it.

## How to work

- **One small, verifiable slice per change:** about three source files and 200 changed lines at most (tests, the manifest and docs do not count).
- **Tests first, and watch them fail.** A test that passes before the code protects nothing.
- Run the file you are working on with `node --test <file>`. The whole suite (`npm test`, about four minutes) runs once before you send the change; on Windows only the packages' own suites are run in CI.
- If you change a kit source (`packages/chicla-kit/src/`), also run `npm run mutants:kit` (or one entry: `npm run mutants:kit -- --only K-INT-05 --timeout 60`): each entry of `packages/chicla-kit/mutants/list.mjs` breaks one guarantee on purpose and its test must go red. It runs with `--pkg .` because the kit tests read the project root, so it copies the whole tree; it takes minutes, so start it detached. Add an entry for a guarantee you add.
- Dangerous behaviour (writing, extraction, recovery) must be checked by something other than the code that produced it: `unzip`, Python `zipfile`, `sha256sum`.
- Keep changes inside the task. Report what you notice outside it.
- Say what you did **not** run. Never claim a check you did not run.

## The workflow files

`CLAUDE.md` (rules), `CHICLA_PROJECT_STATUS-N.md` (process, state, gates), `CHANGELOG.md`, `ROADMAP.md` and `FILES.manifest` are maintained with `chicla bump-round` and `chicla check-manifest`; do not edit the fingerprints or the manifest by hand. If you are not the owner, leave them alone and describe your change in the pull request; the owner closes the round.

## Reporting a vulnerability

Not here: see [`SECURITY.md`](SECURITY.md).
