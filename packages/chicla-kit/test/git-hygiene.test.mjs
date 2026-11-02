// C27.2 (round 306, D153): git hygiene guard in `checkManifest` (check mode). When the project has a `.git`, the files git tracks (`git ls-files`) are compared with
// FILES.manifest: a tracked file that exists on disk and is NOT listed fails with EMANIFEST_TRACKED and is named (the case of `ci/package/` and `stage2/` in round 303:
// build output committed by mistake; the old «new file outside the manifest» was a warning only, so nothing stopped it).
// Rules: no `.git` (a delivery zip, a copy) = the check is not made; git missing or failing = skipped, never a failure (`git.state`); a tracked file that is gone from the
// disk is not flagged (a pending `git rm`, an old status file); an UNTRACKED file outside the manifest stays a warning; `--write` is not touched.
// Written before the code; red until it exists. Tests assert codes and fields, never message text. Every project is a temp folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { checkManifest, renderCheckManifest } = await import(pathToFileURL(join(KIT, 'src', 'check-manifest.mjs')).href);

const HAS_GIT = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;
const T = mkdtempSync(join(tmpdir(), 'chicla-c272-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
const git = (dir, ...args) => { const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`); };
/** A project with a manifest; `withGit` also runs `git init` and tracks everything that exists. */
function project(files, { withGit = true } = {}) {
  const dir = join(T, `p${++n}`);
  mkdirSync(dir, { recursive: true });
  for (const [f, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text); }
  assert.equal(checkManifest({ root: dir, write: true }).ok, true);
  if (withGit) { git(dir, 'init', '-q'); git(dir, 'add', '-A'); }
  return dir;
}
const put = (dir, f, text = 'x\n') => { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text); };

test('no .git: the check is not made, the result is ok and says «none»', () => {
  const dir = project({ 'a.txt': 'a\n' }, { withGit: false });
  put(dir, 'stage2/x.md');
  const r = checkManifest({ root: dir });
  assert.equal(r.ok, true);
  assert.equal(r.git.state, 'none');
  assert.deepEqual(r.trackedOutside, []);
});

test('every tracked file is in the manifest: ok, nothing outside', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n', 'src/b.mjs': 'b\n' });
  const r = checkManifest({ root: dir });
  assert.equal(r.ok, true);
  assert.equal(r.code, null);
  assert.equal(r.git.state, 'ok');
  assert.deepEqual(r.trackedOutside, []);
});

test('a tracked file that is not in the manifest fails with EMANIFEST_TRACKED and is named (the ci/package and stage2 case)', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n' });
  put(dir, 'stage2/chicla/README.md'); put(dir, 'ci/package/README.md');
  git(dir, 'add', '-A');
  const r = checkManifest({ root: dir });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'EMANIFEST_TRACKED');
  assert.deepEqual([...r.trackedOutside].sort(), ['ci/package/README.md', 'stage2/chicla/README.md']);
  const { err } = renderCheckManifest(r);
  assert.ok(err.includes('stage2/chicla/README.md') && err.includes('ci/package/README.md'), 'both files are named in the message');
});

test('an UNTRACKED file outside the manifest is still only a warning', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n' });
  put(dir, 'new.txt'); // not `git add`ed
  const r = checkManifest({ root: dir });
  assert.equal(r.ok, true);
  assert.deepEqual(r.added, ['new.txt']);
  assert.deepEqual(r.trackedOutside, []);
});

test('a tracked file gone from the disk is not flagged (a pending git rm, the old status file)', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n', 'old.txt': 'o\n' });
  checkManifest({ root: dir, write: true });
  unlinkSync(join(dir, 'old.txt')); // still in the index, gone from the disk
  checkManifest({ root: dir, write: true }); // the manifest no longer lists it
  const r = checkManifest({ root: dir });
  assert.equal(r.ok, true);
  assert.deepEqual(r.trackedOutside, []);
});

test('names outside ASCII are compared as they are (no quoting of ç, no NFC/NFD false alarm)', { skip: !HAS_GIT }, () => {
  const dir = project({ 'ação/ç.txt': 'c\n', 'a b.txt': 'b\n' });
  const r = checkManifest({ root: dir });
  assert.equal(r.ok, true);
  assert.deepEqual(r.trackedOutside, []);
});

test('git missing: the check is skipped («unavailable»), never a failure', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n' });
  put(dir, 'stage2/x.md'); git(dir, 'add', '-A');
  const r = checkManifest({ root: dir, git: 'chicla-no-such-git-binary' });
  assert.equal(r.ok, true);
  assert.equal(r.git.state, 'unavailable');
  assert.deepEqual(r.trackedOutside, []);
});

test('a .git that git cannot read: skipped («error»), never a failure', () => {
  const dir = project({ 'a.txt': 'a\n' }, { withGit: false });
  writeFileSync(join(dir, '.git'), 'gitdir: /nonexistent/chicla-c272\n'); // a broken worktree pointer
  const r = checkManifest({ root: dir });
  assert.equal(r.ok, true);
  assert.ok(['error', 'unavailable'].includes(r.git.state), `state ${r.git.state}`);
  assert.deepEqual(r.trackedOutside, []);
});

test('--write is not touched: it regenerates the manifest even with a tracked file outside it', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n' });
  put(dir, 'stage2/x.md'); git(dir, 'add', '-A');
  const r = checkManifest({ root: dir, write: true });
  assert.equal(r.ok, true);
  assert.equal(checkManifest({ root: dir }).ok, true, 'after --write the file is listed, so the check passes');
});

test('a LOST file is still reported first (EMANIFEST_LOST), the git check does not hide it', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n', 'b.txt': 'b\n' });
  unlinkSync(join(dir, 'b.txt'));
  put(dir, 'stage2/x.md'); git(dir, 'add', '-A');
  assert.equal(checkManifest({ root: dir }).code, 'EMANIFEST_LOST');
});
