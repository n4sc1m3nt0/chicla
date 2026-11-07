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

// Round 320 (C29.1, AUDIT-11 F-1): the message of EMANIFEST_TRACKED said only the first 15 names. Rodrigo's repository had 188 (and a first command that failed in zsh), so the guard now GROUPS the
// names and prints ONE ready `git rm -r -q --cached --ignore-unmatch -- …` line (it stops tracking and keeps the files on disk). Result fields: `trackedGroups` [{ path, kind: folder|glob|file, files }]
// sorted by path, `trackedCommand` (null when nothing is outside), `trackedCommandComplete` (false when the line was cut at about 3000 characters: run the check again for the rest).
// Rules: a FOLDER is named only when every tracked file under it is outside the manifest; a GLOB only when no other tracked file matches it (a listed file must never be taken by it);
// paths are shell-quoted. Up to 15 outside files are still listed by name, as before; more are summarised by group. Tests assert fields, and run the command for real.
const OUT_PREFIX = 'git rm -r -q --cached --ignore-unmatch --';
const runCmd = (dir, cmd) => spawnSync('sh', ['-c', cmd], { cwd: dir, encoding: 'utf8' });
const NOSH = process.platform === 'win32';

test('C29.1: folders, globs and single files; a listed file is never taken by a folder or a glob; paths are quoted', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n', 'docs/keep.md': 'k\n', 'docs/note-1.md': 'n\n' });
  for (const f of ['dist2/a.tgz.sha256', 'dist2/sub/b.txt', 'docs/status-archive-done-1-1.md', 'docs/status-archive-done-2-2.md', 'docs/status-archive-prev-3-3.md', 'docs/note-2.md', 'docs/note-3.md', "it's here.txt"]) put(dir, f);
  git(dir, 'add', '-A');
  const r = checkManifest({ root: dir });
  assert.equal(r.code, 'EMANIFEST_TRACKED');
  assert.deepEqual(r.trackedGroups, [
    { path: 'dist2', kind: 'folder', files: 2 },
    { path: 'docs/note-2.md', kind: 'file', files: 1 },
    { path: 'docs/note-3.md', kind: 'file', files: 1 },
    { path: 'docs/status-archive-done-*.md', kind: 'glob', files: 2 },
    { path: 'docs/status-archive-prev-3-3.md', kind: 'file', files: 1 },
    { path: "it's here.txt", kind: 'file', files: 1 },
  ]);
  assert.equal(r.trackedCommand, `${OUT_PREFIX} dist2 docs/note-2.md docs/note-3.md 'docs/status-archive-done-*.md' docs/status-archive-prev-3-3.md 'it'\\''s here.txt'`);
  assert.equal(r.trackedCommandComplete, true);
  assert.ok(renderCheckManifest(r).err.includes(r.trackedCommand), 'the command is printed in the message');
});

test('C29.1: the command works for real: it stops tracking, keeps the files on disk, leaves the listed ones, and the check then passes', { skip: !HAS_GIT || NOSH }, () => {
  const dir = project({ 'a.txt': 'a\n', 'docs/keep.md': 'k\n', 'docs/note-1.md': 'n\n' });
  for (const f of ['dist2/a.tgz.sha256', 'docs/status-archive-done-1-1.md', 'docs/status-archive-done-2-2.md', 'docs/note-2.md', "it's here.txt"]) put(dir, f);
  git(dir, 'add', '-A');
  const r = checkManifest({ root: dir });
  const run = runCmd(dir, r.trackedCommand);
  assert.equal(run.status, 0, run.stderr);
  const after = checkManifest({ root: dir });
  assert.equal(after.ok, true, 'the guard passes after the command');
  assert.deepEqual(after.trackedOutside, []);
  assert.equal(spawnSync('git', ['ls-files', 'docs/keep.md', 'docs/note-1.md', 'a.txt'], { cwd: dir, encoding: 'utf8' }).stdout.trim().split('\n').length, 3, 'the listed files are still tracked');
  assert.ok(checkManifest({ root: dir }).added.includes('dist2/a.tgz.sha256'), 'the files stay on disk (untracked: only a warning)');
});

test('C29.1: with no tracked file outside the manifest the fields are empty', { skip: !HAS_GIT }, () => {
  const r = checkManifest({ root: project({ 'a.txt': 'a\n' }) });
  assert.deepEqual([r.trackedGroups, r.trackedCommand], [[], null]);
});

test('C29.1: many files: 30 folders of 6 files are summarised (at most 15 group lines, never 180 names) and ONE short command names all 30', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n' });
  for (let g = 0; g < 30; g++) for (let k = 0; k < 6; k++) put(dir, `build${String(g).padStart(2, '0')}/f${k}.txt`);
  git(dir, 'add', '-A');
  const r = checkManifest({ root: dir });
  assert.equal(r.trackedOutside.length, 180);
  assert.equal(r.trackedGroups.length, 30);
  assert.ok(r.trackedGroups.every((g) => g.kind === 'folder' && g.files === 6));
  const { err } = renderCheckManifest(r);
  assert.ok(err.split('\n').length < 40, 'the message stays short');
  assert.ok(!err.includes('build29/f5.txt'), 'single names are not printed past the limit');
  assert.ok(r.trackedCommand.includes('build00') && r.trackedCommand.includes('build29'));
  assert.equal(r.trackedCommandComplete, true);
});

test('C29.1: a very long list is cut at about 3000 characters (trackedCommandComplete false) and running the command again, a few times, clears it', { skip: !HAS_GIT || NOSH, timeout: 120000 }, () => {
  const dir = project({ 'a.txt': 'a\n' });
  const L = (i) => { let s = ''; let k = i; do { s = String.fromCharCode(97 + (k % 26)) + s; k = Math.floor(k / 26); } while (k > 0); return s; }; // letters only: no glob can join them
  for (let i = 0; i < 120; i++) put(dir, `a-long-folder-name-for-the-test/with-a-long-file-name-${L(i)}-and-more-letters-after-it.txt`.replace('a-long-folder-name-for-the-test/', `d${L(i)}x-long-folder-name-for-the-test-over-and-over/`));
  git(dir, 'add', '-A');
  let r = checkManifest({ root: dir });
  assert.equal(r.trackedOutside.length, 120);
  assert.equal(r.trackedGroups.length, 120);
  assert.equal(r.trackedCommandComplete, false);
  assert.ok(r.trackedCommand.length <= 3300, `the command is ${r.trackedCommand.length} characters`);
  let rounds = 0;
  while (!r.ok && rounds < 40) { assert.equal(runCmd(dir, r.trackedCommand).status, 0); rounds++; r = checkManifest({ root: dir }); }
  assert.equal(r.ok, true);
  assert.ok(rounds >= 2 && rounds < 40, `it took ${rounds} rounds`);
});
