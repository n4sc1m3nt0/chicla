# Releasing `chicla-zip` (gate G-C6)

Only Rodrigo publishes (login and two-factor authentication): the AI never runs `npm publish`, `git tag` or `gh release create`. This is the runbook for `chicla-zip` 0.1.0. `chicla-kit` is not releasable yet (see the last section).

The tag name is proposed in D116: one tag per package, `chicla-zip-v0.1.0` and later `chicla-kit-v0.1.0`, because the two packages are versioned apart (D4). If D116 is changed, change the tag in steps 5 and 6 only.

## Before you start

1. G-C5 (security review) is done and every finding is fixed or scheduled. A fix that touches `packages/chicla-zip/src/zipkit.mjs` needs a new round first; do not release code that was reviewed before the fix.
2. The last pushed commit is green on every CI job: `test` (Ubuntu and macOS, Node 18, 20, 22), `windows` (Node 18, 20, 22), `bench` and `pack`.
3. `packages/chicla-zip/package.json` says `"version": "0.1.0"`.

## Steps

1. **Push.** Copy the delivery over your clone (do not delete folders first), run `git rm` for any old `CHICLA_PROJECT_STATUS-*.md` the delivery check lists, commit and push to `main`. Wait for CI to finish green.
2. **Download the tarball.** In the GitHub run, open **Artifacts** and download `chicla-zip-tarball`; unzip it into a folder called `dist`. It holds `chicla-zip-0.1.0.tgz` and `chicla-zip-0.1.0.tgz.sha256`.
3. **Check it (independent reader).**
   ```
   cd dist
   sha256sum -c chicla-zip-0.1.0.tgz.sha256        # macOS: shasum -a 256 -c chicla-zip-0.1.0.tgz.sha256
   tar -tzf chicla-zip-0.1.0.tgz                    # package/LICENSE, package/README.md, package/package.json, package/src/zipkit.mjs only
   ```
4. **Try it in an empty folder.**
   ```
   mkdir /tmp/try && cd /tmp/try && npm init -y
   npm install /path/to/dist/chicla-zip-0.1.0.tgz
   node --input-type=module -e "import('chicla-zip').then(m => console.log(Object.keys(m).sort().join(' ')))"
   ```
   It must list `createZip`, `extractZip`, `listZip`, `markUtf8Names`, `openZip`, `readZipFile`, `runCli`, `testZip`, `writeZip`, `writeZipStream` (and `ZipError`).
5. **Switch on private vulnerability reporting** (`SECURITY.md` points to it): repository **Settings**, **Code security**, **Private vulnerability reporting**, Enable.
6. **Tag.**
   ```
   git tag -a chicla-zip-v0.1.0 -m "chicla-zip 0.1.0"
   git push origin chicla-zip-v0.1.0
   ```
7. **GitHub release** with the tarball and its checksum, and the sha256 in the notes:
   ```
   node scripts/pack-release.mjs packages/chicla-zip --out dist2 > notes.md
   gh release create chicla-zip-v0.1.0 dist/chicla-zip-0.1.0.tgz dist/chicla-zip-0.1.0.tgz.sha256 --title "chicla-zip 0.1.0" --notes-file notes.md
   ```
   `dist2` must hold the same sha256 as `dist` (the pack is deterministic); if it differs, stop and tell Claude. Without `gh`, do the same in the web page **Releases**, **Draft a new release**.
8. **Publish to npm.** The file you checked is the file you publish.
   ```
   npm login            # browser or one-time password; the account that owns the placeholder
   npm whoami           # must be the owner of chicla-zip
   npm publish dist/chicla-zip-0.1.0.tgz --access public     # npm asks for the two-factor code (or add --otp=<code>)
   ```
   A published version cannot be published again, so do this last, and only when steps 3 and 4 passed.
9. **Check what npm serves.**
   ```
   npm view chicla-zip version                      # 0.1.0
   mkdir /tmp/fromnpm && cd /tmp/fromnpm && npm pack chicla-zip --pack-destination .
   sha256sum chicla-zip-0.1.0.tgz                   # equal to the line in chicla-zip-0.1.0.tgz.sha256
   ```
   If the hashes differ, tell Claude before using the package anywhere.
10. **Record it.** Tell Claude in the next session: «G-C6 chicla-zip done» with the tag and the npm version. You mark the gate; the AI never does.

Your other projects can then depend on `chicla-zip` with `npm install chicla-zip`.

## `chicla-kit`

Not releasable yet. Missing before a `0.1.0`: `chicla init --agent` (C12.6; plain `chicla init` exists since round 164), `chicla update` (C11.3), the fingerprint and state-file specs (C10.4, C10.5), and the packaging (C13.5): `LICENSE`, `files`, `repository`, a `pack` job, and the kit reaching `chicla-zip` by package name instead of a relative path (the pack script refuses a tarball with no `LICENSE`). Only when both packages are ready does Rodrigo publish (decided 2026-10-16: the two go out together). When those land, the same steps apply with `packages/chicla-kit`.
