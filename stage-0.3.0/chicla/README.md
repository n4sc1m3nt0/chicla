# chicla

Project memory and verified zip delivery for coding agents. One package, no dependencies, Node 18+.

```
npm install chicla          # or: npm install --save-dev chicla
npx chicla --help
mkdir myproject && cd myproject
npx chicla init             # CLAUDE.md, AGENTS.md, the status file, CHANGELOG.md, version.mjs, FILES.manifest and a minimal package.json (an existing one is kept)
npx chicla bump-round --verify
```

**The `chicla` command** is the workflow: `init`, `update`, `check-manifest`, `bump-round`, `make-delivery`, `verify-delivery`, `dump`, `recovery`, `rename-status` and `ci-report`.
Every option and exit code is described in `chicla --help` and in the project's documentation.

**Name the project.** The status file is `<NAME>_PROJECT_STATUS-N.md`: `npx chicla init --name ACME` chooses the name (otherwise the folder's, in capitals), and `npx chicla rename-status NEWNAME` changes it later. A project with no name set is called `CHICLA` and keeps working.

**Read a failed CI run.** `npx chicla ci-report logs.zip` reads the logs zip of a GitHub Actions run («Download log archive») and prints, per job, the failing tests and the first error; exit 1 if a job failed or anything was not judged (a log above 64 MiB, or more than 5000 log entries: `ECIREPORT_UNJUDGED`). `--allow <text>` (repeatable, a case-sensitive part of the job name) names a job that may fail or be unjudged, such as `--allow "tarball (windows"`: it is still shown, but it does not count.

**The `chicla-zip` command and the library** read, verify, extract and write zips in plain Node:

```
npx chicla-zip ls <zip> --json
npx chicla-zip extract <zip> <folder>
npx chicla-zip create <out.zip> <folder> --deterministic
```

```js
import { openZip, extractZip, writeZip } from "chicla/zip";
```

Only `chicla/zip` is public as a module; everything else in the package is internal and may change.

**Where the old packages went.** Until `0.1.1` this project was published as two packages, `chicla-zip` and `chicla-kit`. Both are deprecated:
everything they did is in `chicla` `0.2.0`, with the same commands. Replace `chicla-kit` by `chicla`, and `import … from "chicla-zip"` by `import … from "chicla/zip"`.

Source, issues and the roadmap: <https://github.com/n4sc1m3nt0/chicla>. Licence: Apache-2.0.
