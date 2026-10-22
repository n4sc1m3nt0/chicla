# Releasing `chicla-zip` (gate G-C6)

Only Rodrigo publishes (login and two-factor authentication): the AI never runs `npm publish`, `git tag` or `gh release create`. This is the runbook for `chicla-zip` 0.1.0; the last section is the one for `chicla-kit` 0.1.0, which goes out second.

The tag name is proposed in D116: one tag per package, `chicla-zip-v0.1.0` and later `chicla-kit-v0.1.0`, because the two packages are versioned apart (D4). If D116 is changed, change the tag in steps 5 and 6 only.

## Where the release stands (round 230)

**Published (round 230):** Rodrigo published `chicla-zip` 0.1.0 and `chicla-kit` 0.1.0 on 2026-10-22 and closed G-C6. Claude saw (pasted by him): `npm view` says `0.1.0` for both; the sha256 of `npm pack chicla-kit@0.1.0` equals the checked `.sha256` file (`44046aea…9410`); the tags `chicla-zip-v0.1.0` and `chicla-kit-v0.1.0` exist on `origin` (same commit `ddad586b`); both GitHub releases are listed. Not seen by Claude: the same comparison for `chicla-zip` (its published sha256 is `14eb0ae3…4795`). One lesson for the next release: write the file as `./dist/x.tgz`, because npm reads `dist/x.tgz` as a GitHub shorthand and stops with `EALLOWGIT`. The list below is what stood between the tree and the tag; every item is done.

What is still between the tree and the tag, in order. Claude keeps this list true; Rodrigo marks the gates.

1. **G-C5, the last review.** The sixth narrow pass (C15.28, report `chicla-zip-security-review-6.md`, round 212 tree, `zipkit.mjs` sha256 starts `89478bbe`) found no bypass of the ZIP-022 fix and three INFO findings: ZIP-024 (an old test expected the old behavior; its expectation was updated in round 213), ZIP-025 and ZIP-026 (documented as known limits in `SECURITY.md`). `zipkit.mjs` was not touched after it, so the pin did not move. Rodrigo closed G-C5 on 2026-10-21 (round 216).
2. **`/dump` and «recovery mode» once more**, after the LAST `zipkit.mjs` change (the pin moved in rounds 201, 202, 203, 207, 208 and 210).
3. **The checks only Rodrigo can run:** `npm test` on Node 18, 20 and 22, the two mutants `R210-*` (`node scripts/mutants.mjs --only R210-no-dup-check --timeout 60`, then `R210-dup-after-skip`), `npm run smoke`, CI green on every job of the last pushed commit (G-C10 `pack`, G-C13 `windows`, G-C9 `bench`). The CI part was seen green on the round 219 tree (round 220: 12 of 12 jobs; push the final tree and read it again before the tag).
4. **Both packages say `"version": "0.1.0"`**: `chicla-zip` since round 163 and `chicla-kit` since round 229 (that round changed the number and the status line of the kit README, nothing else).
5. **Then the steps below**, `chicla-zip` first.

Open gates that do not block the tarball but decide what the README may claim: G-C4 (Windows statement), G-C12 (the panel on a real terminal), G-C15 (the agent files on each vendor's page), G-C8 (ROADMAP §9).

Known limits to carry in the release notes (all in `SECURITY.md` or `docs/zip-handling.md` §7): the concurrent writer (ZIP-003, ZIP-004), parent folders left by a failed extraction (ZIP-017), a zip whose comment contains an end-record signature is refused, more than 8 end-record candidates is refused, the end-record window of 65 557 bytes (ZIP-021), a slash-named entry with the symlink mode that is listed as a folder and not created (ZIP-023), a symlink stored together with a folder of the same name is refused, which Info-ZIP can produce with `zip -y -r z.zip d dirlink d/ dirlink/` (ZIP-025), and names that two entries share only through the Unicode Path extra field, which Python 3.11 does not apply (ZIP-026); the sixth review's smaller shapes (a name ending in `/.`, symlink bits with host OS 2, 5 or 30, the `filter` option and the duplicate check) are listed in `SECURITY.md`.

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
   npm publish ./dist/chicla-zip-0.1.0.tgz --access public     # npm asks for the two-factor code (or add --otp=<code>)
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

Every feature is built (`init`, `init --agent`, `update`, the fingerprint and state-file specs, the packaging) and the steps were rehearsed on a scratch folder in round 184: both tarballs packed with `scripts/pack-release.mjs`, installed together offline into an empty folder, then `chicla --help`, `chicla init`, `chicla update` and `chicla bump-round --verify` run there. The kit needs `chicla-zip` (`"chicla-zip": "^0.1.0"`), so **`chicla-zip` goes out first** (the section above, through step 9); only then the kit. Both go out the same day (decided 2026-10-16: nothing is published until both are ready).

The tag is `chicla-kit-v0.1.0` (D116). Same rules as above: the AI never runs `npm publish`, `git tag` or `gh release create`.

### Before you start

1. `chicla-zip` 0.1.0 is published and checked (zip steps 1 to 9), and `npm view chicla-zip version` says `0.1.0`.
2. The last pushed commit is green on every CI job, and the `pack-kit` job is one of them (it builds `chicla-kit-<version>.tgz`; the artifact is `chicla-kit-tarball`).
3. `packages/chicla-kit/package.json` says `"version": "0.1.0"`. Round 229 set it (it said `0.0.0` before; the versions of the two packages change only at their releases), together with the status line at the top of `packages/chicla-kit/README.md`.
4. The gates you decided to close before the release are closed or accepted by you: G-C12 (the panel on a real terminal), G-C15 (the agent files checked on each vendor's page) and G-C4 (Windows support statement). They do not block the tarball; they decide what the README may claim.

### Steps

1. **Push and wait for CI** (zip step 1). If the round that set `0.1.0` is already pushed, there is nothing new to push.
2. **Download the tarball.** In the GitHub run, **Artifacts**, `chicla-kit-tarball`, unzip into `dist`. It holds `chicla-kit-0.1.0.tgz` and `chicla-kit-0.1.0.tgz.sha256`.
3. **Check it (independent reader).**
   ```
   cd dist
   sha256sum -c chicla-kit-0.1.0.tgz.sha256        # macOS: shasum -a 256 -c chicla-kit-0.1.0.tgz.sha256
   tar -tzf chicla-kit-0.1.0.tgz                    # package/LICENSE, package/README.md, package/package.json, package/src/*, package/templates/* only
   ```
4. **Try it in an empty folder, with the published `chicla-zip`.**
   ```
   mkdir /tmp/trykit && cd /tmp/trykit && npm init -y
   npm install /path/to/dist/chicla-kit-0.1.0.tgz          # pulls chicla-zip from npm
   npx --no-install chicla --help                          # lists init, update, bump-round, make-delivery ...
   mkdir proj && cd proj && npx --no-install chicla init   # six files created
   npx --no-install chicla bump-round --verify             # every line a ✓
   npx --no-install chicla update                          # «the 2 instruction files match the templates of this kit»
   ```
   If `npm install` cannot find `chicla-zip`, step 1 of «Before you start» is not true yet: stop.
5. **Tag.**
   ```
   git tag -a chicla-kit-v0.1.0 -m "chicla-kit 0.1.0"
   git push origin chicla-kit-v0.1.0
   ```
6. **GitHub release** with the tarball, its checksum and the sha256 in the notes:
   ```
   node scripts/pack-release.mjs packages/chicla-kit --out dist2 > notes.md
   gh release create chicla-kit-v0.1.0 dist/chicla-kit-0.1.0.tgz dist/chicla-kit-0.1.0.tgz.sha256 --title "chicla-kit 0.1.0" --notes-file notes.md
   ```
   `dist2` must hold the same sha256 as `dist`; if it differs, stop and tell Claude.
7. **Publish to npm.** The file you checked is the file you publish.
   ```
   npm whoami                                               # the account that owns the chicla-kit name (npm view chicla-kit shows the owner; a free name is created by the first publish)
   npm publish ./dist/chicla-kit-0.1.0.tgz --access public    # npm asks for the two-factor code (or add --otp=<code>)
   ```
   A published version cannot be published again: last, and only when steps 3 and 4 passed.
8. **Check what npm serves.**
   ```
   npm view chicla-kit version                      # 0.1.0
   mkdir /tmp/kitnpm && cd /tmp/kitnpm && npm pack chicla-kit --pack-destination .
   sha256sum chicla-kit-0.1.0.tgz                   # equal to the line in chicla-kit-0.1.0.tgz.sha256
   cd $(mktemp -d) && npm init -y && npm install chicla-kit && npx --no-install chicla --help
   ```
   If a hash differs, tell Claude before using the package anywhere.
9. **Record it.** Tell Claude in the next session: «G-C6 chicla-kit done» with the tag and the npm version. You mark the gate; the AI never does.

Your projects can then use the kit with `npm install --save-dev chicla-kit` and `npx chicla init`. Always install it first: `npx chicla` in a folder where `chicla-kit` is not installed would fetch the unrelated `chicla` placeholder package, not this kit.
