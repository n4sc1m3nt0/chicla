# chicla

Project memory and verified zip delivery for coding agents. One package, no dependencies, Node 18+.

```
npm install chicla          # or: npm install --save-dev chicla
npx chicla --help
mkdir myproject && cd myproject
npx chicla init             # CLAUDE.md, AGENTS.md, the status file, CHANGELOG.md, version.mjs, FILES.manifest
npx chicla bump-round --verify
```

**The `chicla` command** is the workflow: `init`, `update`, `check-manifest`, `bump-round`, `make-delivery`, `verify-delivery`, `dump` and `recovery`.
Every option and exit code is described in `chicla --help` and in the project's documentation.

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
