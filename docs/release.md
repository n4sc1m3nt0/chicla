# Releasing `chicla-zip` (gate G-C6)

Only Rodrigo publishes (login and two-factor authentication): the AI never runs `npm publish`, `git tag` or `gh release create`. This is the runbook for `chicla-zip` 0.1.0; the last section is the one for `chicla-kit` 0.1.0, which goes out second.

The tag name is proposed in D116: one tag per package, `chicla-zip-v0.1.0` and later `chicla-kit-v0.1.0`, because the two packages are versioned apart (D4). If D116 is changed, change the tag in steps 5 and 6 only.

## Releasing chicla 0.2.1 (round 284, AUDIT-8 F-1, gate G-C17)

Why: `chicla` 0.2.0 is on npm and `chicla recovery` does not start in it (`ERR_MODULE_NOT_FOUND`, AUDIT-8 F-1): the pinned `recovery-report.mjs` looks for `zipkit.mjs` beside itself, and the package had it only one folder up. `scripts/build-chicla.mjs` now also puts the same bytes at `src/pinned/zipkit.mjs` (the built package only, never the repository; no pinned file is edited, the pin did not move). Round 287 adds a third (AUDIT-8 F-2, C24.5): `emergency-dump.mjs` looks for the five pinned toolchain files beside its own module first (`src/pinned/`, `src/zipkit.mjs`), so a dump made by the installed package carries `RECOVER/` with the pinned bytes (0.2.0 read them from a path only the repository has: no `RECOVER/`, five warnings); the pin does not move, because it hashes the five files and `emergency-dump.mjs` is not one of them. Round 285 adds the second fix to the same release: `chicla init` writes a minimal private `package.json` (C24.2, AUDIT-8 F-3), because `make-delivery`, `verify-delivery` and `recovery` refused a project without one. The package is `0.2.1` in `packages/chicla/package.json`; nothing else changed. Only Rodrigo publishes (CLAUDE.md product rule 4); Claude never runs `npm publish`, tags or releases.

Same path as «Releasing chicla 0.2.0» below, with `0.2.1` where it says `0.2.0`, plus the differences:

1. **Push** the delivery and wait for CI (`pack-chicla` green). **Download** `chicla-tarball` into `dist/` and check it: `sha256sum -c chicla-0.2.1.tgz.sha256`, then `tar -tzf chicla-0.2.1.tgz`: now **30 files**, with `package/src/pinned/zipkit.mjs` beside `package/src/pinned/recovery-report.mjs`.
2. **Try it in an empty folder** as in step 4 below, and ALSO the path that was broken: in a project with a `package.json`, `npx --no-install chicla dump --outdir ../d "x"` and then `npx --no-install chicla recovery ../d/<the dump>.zip --out ../r`; it must end `recovered project root` and exit 0, and the dump must list the five files of `RECOVER/` and report no warning (`unzip -l` or `chicla-zip ls`). And in a NEW empty folder: `npx --no-install chicla init` (it writes `package.json`), then `npx --no-install chicla make-delivery ../first.zip` must end `delivery created and verified`.
3. **Tag and release:** `git tag -a chicla-v0.2.1 -m "chicla 0.2.1" && git push origin chicla-v0.2.1`; rebuild with `node scripts/build-chicla.mjs --out stage2 && node scripts/pack-release.mjs stage2/chicla --out dist2 > notes-chicla.md`; `mkdir ci && tar -xzf dist/chicla-0.2.1.tgz -C ci && diff -r ci/package stage2/chicla` (the CONTENT must be identical; not the bytes, see «Published: chicla 0.2.0»); `gh release create chicla-v0.2.1 dist/chicla-0.2.1.tgz dist/chicla-0.2.1.tgz.sha256 --title "chicla 0.2.1" --notes-file notes-chicla.md`.
4. **Publish** from the checked file, WITHOUT `tee` (it stopped with `EOTP` last time): `npm whoami`, then `npm publish ./dist/chicla-0.2.1.tgz` (two-factor code at hand), then `npm view chicla version` must say `0.2.1`.
5. **Only after step 4**, point people off the broken version: `npm deprecate chicla@0.2.0 "recovery does not start; use chicla 0.2.1"`.

The project in step 2 needs a `package.json`; since C24.2 (AUDIT-8 F-3) `chicla init` writes one, so a project made with 0.2.1 or later has it. A project made by `chicla` 0.2.0 does not: add one by hand.

## Releasing chicla 0.2.0 (round 281, D148, gate G-C16)

`chicla` 0.2.0 is the ONE package (D148): the `chicla` command, the `chicla-zip` command and the zip library at `chicla/zip`, with no dependencies. It is assembled from the kit and the zip module by `scripts/build-chicla.mjs` (nothing is converted: every file is a byte copy), and packed by `scripts/pack-release.mjs`, which is the CI job `pack-chicla`. `packages/chicla-zip` and `packages/chicla-kit` stay in the tree as internal source and are `private`: `pack-release` refuses them (`EPRIVATE`), so nothing more can go out under their names. Their `0.1.x` stay on npm; step 8 deprecates them. The thin `chicla` 0.1.1 of D147 was never published and has no runbook any more. Only Rodrigo publishes: the AI never runs `npm publish`, `git tag`, `gh release create` or `npm deprecate`. Tag: `chicla-v0.2.0`.

1. **Push** the delivery (copy it over the clone, `git rm` any old `CHICLA_PROJECT_STATUS-*.md` the check lists) and wait for CI: every job green, `pack-chicla` included.
2. **Download** `chicla-tarball` from **Artifacts** into `dist/`.
3. **Check** it (`cd dist`): `sha256sum -c chicla-0.2.0.tgz.sha256` (macOS: `shasum -a 256 -c`), then `tar -tzf chicla-0.2.0.tgz`: `package/package.json`, `package/README.md`, `package/LICENSE`, `package/templates/` and `package/src/`, with `package/src/zipkit.mjs` beside `package/src/zipkit-loader.mjs`; no `test/`, no `packages/`, no `node_modules/`.
4. **Try it in an empty folder:** `npm init -y && npm install /path/to/dist/chicla-0.2.0.tgz` (no dependencies are pulled), then `npx --no-install chicla --help`, `npx --no-install chicla-zip --help`, `node -e 'import("chicla/zip").then((m) => console.log(Object.keys(m).length))'`, and in a new folder `npx --no-install chicla init` and `npx --no-install chicla bump-round --verify`.
5. **Tag and release:**
   ```
   git tag -a chicla-v0.2.0 -m "chicla 0.2.0" && git push origin chicla-v0.2.0
   node scripts/build-chicla.mjs --out stage2 && node scripts/pack-release.mjs stage2/chicla --out dist2 > notes-chicla.md
   mkdir ci && tar -xzf dist/chicla-0.2.0.tgz -C ci && diff -r ci/package stage2/chicla      # the CONTENT must be identical; if not, stop (see «Published: chicla 0.2.0», why not the bytes)
   gh release create chicla-v0.2.0 dist/chicla-0.2.0.tgz dist/chicla-0.2.0.tgz.sha256 --title "chicla 0.2.0" --notes-file notes-chicla.md
   ```
6. **Publish** (login and two-factor, irreversible; write `./dist/`, never `dist/`, or npm stops with `EALLOWGIT`): `npm whoami`, then `npm publish ./dist/chicla-0.2.0.tgz --access public`; npm asks for the two-factor code (or add `--otp=<code>`). Run it directly in the terminal, never through `tee` or any pipe: npm then cannot ask for the confirmation and stops with `EOTP`. Without an authenticator app npm asks you to confirm in the browser (press ENTER at the prompt).
7. **Check what npm serves:** `npm view chicla version` says `0.2.0` and `npm view chicla dependencies` prints nothing; `npm pack chicla --pack-destination .` in a scratch folder gives a file whose `sha256sum` equals the `.sha256` line (if a hash differs, tell Claude before going on); and in an empty folder with nothing installed first, `npx chicla --help` works (this is the point of the package).
8. **Deprecate the two old names, only after step 7 passed** (login and two-factor; the message is the one agreed in D148):
   ```
   npm deprecate chicla-zip@"*" "moved into chicla: npm install chicla"
   npm deprecate chicla-kit@"*" "moved into chicla: npm install chicla"
   ```
   (`npm deprecate chicla-zip "moved into chicla: npm install chicla"` and `npm deprecate chicla-kit "moved into chicla: npm install chicla"`, with no range, do the same.) Deprecating only adds a warning at install time: their `0.1.x` stay on npm, so nobody who pinned them breaks; do not run `npm unpublish` on either. Check: `npm view chicla-zip deprecated` and `npm view chicla-kit deprecated` print the message.
9. **Record it:** tell Claude «chicla 0.2.0 published, both deprecated» with the tag. Rodrigo marks G-C16; the AI never does.

## Published: chicla 0.2.0 (round 282, D148, gate G-C16)

Rodrigo published `chicla` 0.2.0 on npm on 2026-10-29, after the CI of the round 281 tree (commit `50bc186`, «unifying under single chicla package») was all green, made the tag `chicla-v0.2.0` and the GitHub release, and deprecated the two old names; he pasted the output of every step and then said «podes fechar e registar nos docs do projeto» (G-C16). Only Rodrigo publishes: the AI ran no `npm publish`, `git tag`, `gh release create` or `npm deprecate`.

What Claude saw, in his pasted output (nothing was read from the registry or from GitHub by Claude):

- The artifact `chicla-tarball` of the CI: `chicla-0.2.0.tgz`, 102885 bytes, 29 files, sha256 `bd13bc23ff0c2fdd6a97d722bf0a7f7e8b84f348cc978667903fbf7bb9def1b9`; `sha256sum -c` said OK, and the listing had `package/src/zipkit.mjs` beside `zipkit-loader.mjs` and nothing from `test/`, `packages/` or `node_modules/`.
- Installed alone in an empty folder it gave `chicla --help`, `chicla-zip --help`, `import("chicla/zip")` (19 exports), `chicla init` and `chicla bump-round --verify`, with no dependency pulled.
- `npm view chicla version` said `0.2.0`; `npx --yes chicla@0.2.0 --help` worked in an empty folder with nothing installed first; `npm pack chicla@0.2.0` gave the same sha256 as the CI tarball, so npm serves what the CI built.
- The tag `chicla-v0.2.0` went to the repository (renamed from `cairn` to `chicla`; GitHub redirected the push and Rodrigo then set the remote to the new address) and the release page was created at `https://github.com/n4sc1m3nt0/chicla/releases/tag/chicla-v0.2.0`.
- `npm deprecate` with «moved into chicla: npm install chicla» on `chicla-zip@"*"` and `chicla-kit@"*"`: `npm view` shows that message for `chicla-zip@0.1.0`, `chicla-zip@0.1.1`, `chicla-kit@0.1.0` and `chicla-kit@0.1.1`; the placeholders `0.0.0` and `0.0.0-stage` of both names were marked too (the range was `*`). There was no `npm unpublish`: every `0.1.x` stays on npm.

What went differently, and what the runbook now says:

- **The rebuilt tarball differs in bytes, not in content.** The runbook (step 5) used to say that a local rebuild must have the CI's sha256. On Rodrigo's Mac (npm 12.2.0, Node 26) it did not: `bd13bc23…` against `f089fb6d…`. Claude packed the same tree on Linux with npm 10.9.9 (the CI's npm) and got `bd13bc23…`, the CI's sum; `diff -r` of the extracted CI tarball against the rebuilt folder was empty. So the bytes of a tarball depend on the npm version that packs it. Step 5 now compares the content with `diff -r`; the sha256 that counts is the one of the tarball that is published (the CI's, checked in step 3 and again against npm in step 7).
- **`EOTP`.** The first `npm publish` ran through `tee`, npm could not ask for the confirmation and stopped with `EOTP`; nothing was published. The tag and the release already existed by then. Run directly in the terminal it worked (step 6 says so).
- Not seen by Claude: the GitHub release page itself and the tag on GitHub, the browser confirmations, and the registry other than through his pasted `npm view` lines. G-C16 is closed by Rodrigo, not by Claude.

## Releasing 0.1.1 (round 276, D146)

> **History, retired by D148 (rounds 279 to 281):** both packages were published at `0.1.1` and are now `private`; do not repeat these steps. The runbook for what goes out next is «Releasing chicla 0.2.0» above.

Both packages are at `0.1.1` in the tree; `0.1.0` of each is on npm since round 230. What is new, measured against the published tarballs: **`chicla-zip` 0.1.1 is a README only release** (`src/zipkit.mjs` is byte-identical to 0.1.0; the npm page still says «not published yet»), and **`chicla-kit` 0.1.1** carries the fixes of rounds 231 to 275 in nine sources (the one that matters most: two `emergency-dump` runs in the same second no longer delete each other's archive). The kit keeps `"chicla-zip": "^0.1.0"`, so it works with either zip version. Only Rodrigo publishes: the AI never runs `npm publish`, `git tag` or `gh release create`. Publish `chicla-zip` first, then `chicla-kit`; the same steps twice. Tags: `chicla-zip-v0.1.1` and `chicla-kit-v0.1.1`.

1. **Push** the delivery (copy it over the clone, `git rm` any old `CHICLA_PROJECT_STATUS-*.md` the check lists) and wait for CI: all 12 jobs green, `pack` and `pack-kit` included.
2. **Download** `chicla-zip-tarball` and `chicla-kit-tarball` from **Artifacts** into `dist/`.
3. **Check** each one (`cd dist`): `sha256sum -c chicla-zip-0.1.1.tgz.sha256` and `sha256sum -c chicla-kit-0.1.1.tgz.sha256` (macOS: `shasum -a 256 -c`), then `tar -tzf chicla-zip-0.1.1.tgz` and `tar -tzf chicla-kit-0.1.1.tgz` list only the shipped files.
4. **Try it in an empty folder:** `npm init -y && npm install /path/to/dist/chicla-zip-0.1.1.tgz`, then the same for the kit and `npx --no-install chicla --help`, `npx --no-install chicla init` in a new folder, `npx --no-install chicla bump-round --verify`.
5. **Tag and release**, `chicla-zip` first, then the kit:
   ```
   git tag -a chicla-zip-v0.1.1 -m "chicla-zip 0.1.1" && git push origin chicla-zip-v0.1.1
   node scripts/pack-release.mjs packages/chicla-zip --out dist2 > notes-zip.md      # its sha256 must equal the one in dist/; if not, stop
   gh release create chicla-zip-v0.1.1 dist/chicla-zip-0.1.1.tgz dist/chicla-zip-0.1.1.tgz.sha256 --title "chicla-zip 0.1.1" --notes-file notes-zip.md
   git tag -a chicla-kit-v0.1.1 -m "chicla-kit 0.1.1" && git push origin chicla-kit-v0.1.1
   node scripts/pack-release.mjs packages/chicla-kit --out dist3 > notes-kit.md      # same rule
   gh release create chicla-kit-v0.1.1 dist/chicla-kit-0.1.1.tgz dist/chicla-kit-0.1.1.tgz.sha256 --title "chicla-kit 0.1.1" --notes-file notes-kit.md
   ```
6. **Publish** (login and two-factor, irreversible; write `./dist/`, never `dist/`, or npm stops with `EALLOWGIT`): `npm whoami`, then `npm publish ./dist/chicla-zip-0.1.1.tgz --access public`, check it (step 7), and only then `npm publish ./dist/chicla-kit-0.1.1.tgz --access public`; npm asks for the two-factor code (or add `--otp=<code>`).
7. **Check what npm serves:** `npm view chicla-zip version` and `npm view chicla-kit version` say `0.1.1`; `npm pack chicla-zip chicla-kit --pack-destination .` in a scratch folder gives files whose `sha256sum` equal the `.sha256` lines; `npm install chicla-kit` in an empty folder and `npx --no-install chicla --help` work. If a hash differs, tell Claude before using the package.
8. **Record it:** tell Claude «chicla-zip 0.1.1 and chicla-kit 0.1.1 published» with the tags. Rodrigo marks any gate; the AI never does.

## Published: 0.1.1 (round 277, D146)

Rodrigo published `chicla-zip` 0.1.1 and `chicla-kit` 0.1.1 on npm on 2026-10-28, the zip first and the kit three minutes later, made both tags (`chicla-zip-v0.1.1`, `chicla-kit-v0.1.1`) and both GitHub releases, and checked the sha256 of both tarballs; he told Claude «já fiz as tags as releases e verifiquei os sha256 dos tarball». Only Rodrigo publishes: the AI ran no `npm publish`, `git tag` or `gh release create`.

What Claude saw itself, on 2026-10-28 (the npm registry, read with `curl`, and the tree of round 276):

- `npm` serves `0.1.1` as `latest` for both packages: `chicla-zip` published at 21:45 UTC and `chicla-kit` at 21:48 UTC, so the zip went first, as the runbook says.
- The tarballs downloaded from the registry have these sha256: `chicla-zip-0.1.1.tgz` (37082 bytes) `a20c2f20e31d6937c0c90252412d96d51237c4676cbf99cce85f8e7a9ac7f8f7`, and `chicla-kit-0.1.1.tgz` (73737 bytes) `f8ca89dd1e3e3fb4c1b47d014c472605975f12ea9535bb6a6a41c731625bf37f`.
- `node scripts/pack-release.mjs packages/chicla-zip` and `packages/chicla-kit`, run on the round 276 tree, give tarballs that are byte-identical to those two (same sha256), so what npm serves is what the tree holds.

Not seen by Claude: the two tags, the two GitHub releases, the checked `.sha256` files of his `dist/` and the clean-folder install of step 4; they are in his word only. No gate was opened or marked by this round (G-C6 is closed since round 230).

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
   mkdir proj && cd proj && npx --no-install chicla init   # seven files created (the six and a package.json)
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
