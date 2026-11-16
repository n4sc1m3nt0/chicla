// C32.5 (D170, D172) — the counterpart of EMANIFEST_TRACKED (C27.2): files that FILES.manifest LISTS and that git does not know (the case of round 340: three archive files and a test were in every zip
// and never `git add`ed, so the CI checkout lacked them and 22 tests were red). In check mode, when the project has a `.git` and git answers, `checkManifest` also reports `notInGit` (the manifest files that
// are on disk, untracked and NOT ignored: `git ls-files --others --exclude-standard`), `notInGitCommand` (ONE ready `git add -- …` line, cut at about 3000 characters) and `notInGitComplete`, and prints one note
// BEFORE the final ✓ line. It is a NOTE, never a failure: `ok` and `code` do not change (before a commit every new file is untracked, by design). A file that is only MODIFIED is not reported (that is `git status`, and
// `release check`'s tree-clean). No `.git`, no git, or a git that fails = nothing new; `--write` = nothing new. Written before the code; red until it exists. Every project is a temp folder, never the real one.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { checkManifest, renderCheckManifest } = await import(pathToFileURL(join(KIT, 'src', 'check-manifest.mjs')).href);

const HAS_GIT = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;
const T = mkdtempSync(join(tmpdir(), 'chicla-c325-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
const git = (dir, ...args) => { const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`); };
const put = (dir, f, text = 'x\n') => { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text); };
/** A project with a manifest, `git init`ed and everything tracked. */
function project(files, { withGit = true } = {}) {
  const dir = join(T, `p${++n}`); mkdirSync(dir, { recursive: true });
  for (const [f, text] of Object.entries(files)) put(dir, f, text);
  assert.equal(checkManifest({ root: dir, write: true }).ok, true);
  if (withGit) { git(dir, 'init', '-q'); git(dir, 'add', '-A'); }
  return dir;
}
/** Adds files and regenerates the manifest (as a round does) WITHOUT `git add`. */
const grow = (dir, files) => { for (const [f, text] of Object.entries(files)) put(dir, f, text); assert.equal(checkManifest({ root: dir, write: true }).ok, true); };

test('files listed in the manifest and never added to git are named, with ONE ready `git add` line; the result stays ok', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n' });
  grow(dir, { 'docs/old.md': 'old\n', 'test/t.mjs': 't\n' });
  const r = checkManifest({ root: dir });
  assert.equal(r.ok, true); assert.equal(r.code, null); assert.equal(r.git.state, 'ok');
  assert.deepEqual(r.notInGit, ['docs/old.md', 'test/t.mjs']);
  assert.equal(r.notInGitCommand, 'git add -- docs/old.md test/t.mjs'); assert.equal(r.notInGitComplete, true);
  const { out, err } = renderCheckManifest(r);
  assert.ok(out.includes('git add -- docs/old.md test/t.mjs')); assert.equal(err, '');
  assert.ok(out.trimEnd().split('\n').at(-1).startsWith('✓'), 'the note comes BEFORE the final ✓ line');
});

test('running the printed line makes the next check silent: notInGit empty, no command, no note', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n' });
  grow(dir, { 'docs/old.md': 'old\n' });
  const first = checkManifest({ root: dir });
  const parts = first.notInGitCommand.split(' ').slice(3); git(dir, 'add', '--', ...parts);
  const r = checkManifest({ root: dir });
  assert.deepEqual(r.notInGit, []); assert.equal(r.notInGitCommand, null); assert.equal(r.notInGitComplete, true);
  assert.ok(!renderCheckManifest(r).out.includes('git add'));
});

test('everything tracked: nothing reported', { skip: !HAS_GIT }, () => {
  const r = checkManifest({ root: project({ 'a.txt': 'a\n', 'src/b.mjs': 'b\n' }) });
  assert.equal(r.ok, true); assert.deepEqual(r.notInGit, []); assert.equal(r.notInGitCommand, null);
});

test('a tracked file that is only MODIFIED is not reported (that is git status, and release check)', { skip: !HAS_GIT }, () => {
  const dir = project({ 'README.md': 'one\n' });
  put(dir, 'README.md', 'two\n'); assert.equal(checkManifest({ root: dir, write: true }).ok, true);
  const r = checkManifest({ root: dir });
  assert.deepEqual(r.notInGit, []);
});

test('a file the .gitignore ignores is not reported (git add would refuse it)', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n', '.gitignore': 'local.txt\n' });
  grow(dir, { 'local.txt': 'mine\n', 'new.txt': 'n\n' });
  const r = checkManifest({ root: dir });
  assert.deepEqual(r.notInGit, ['new.txt']);
});

test('an untracked file that is NOT in the manifest is not in notInGit (it stays the old warning)', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n' });
  put(dir, 'stray.txt');
  const r = checkManifest({ root: dir });
  assert.equal(r.ok, true); assert.deepEqual(r.notInGit, []);
});

test('names with spaces, an apostrophe or «ç» are listed as they are and quoted in the command', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n' });
  grow(dir, { 'docs/a b.md': '1\n', "docs/it's.md": '2\n', 'docs/ação.md': '3\n' });
  const r = checkManifest({ root: dir });
  assert.deepEqual(r.notInGit, ['docs/a b.md', 'docs/ação.md', "docs/it's.md"]);
  assert.ok(r.notInGitCommand.includes("'docs/a b.md'")); assert.ok(r.notInGitCommand.includes(`'docs/it'\\''s.md'`));
  const run = spawnSync('sh', ['-c', r.notInGitCommand], { cwd: dir, encoding: 'utf8' }); assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(checkManifest({ root: dir }).notInGit, []);
});

test('many files: every name is in notInGit, the command is cut at about 3000 characters and says it is not complete', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n' });
  const files = {}; for (let i = 0; i < 150; i++) files[`docs/archive/some-long-folder-name/file-number-${String(i).padStart(3, '0')}.md`] = `${i}\n`;
  grow(dir, files);
  const r = checkManifest({ root: dir });
  assert.equal(r.notInGit.length, 150); assert.equal(r.notInGitComplete, false); assert.ok(r.notInGitCommand.length <= 3100); assert.ok(r.notInGitCommand.startsWith('git add -- '));
  assert.equal(r.ok, true);
});

test('no .git, no git binary, or --write: nothing new and nothing breaks', { skip: !HAS_GIT }, () => {
  const bare = project({ 'a.txt': 'a\n' }, { withGit: false }); put(bare, 'b.txt'); assert.equal(checkManifest({ root: bare, write: true }).ok, true);
  const a = checkManifest({ root: bare }); assert.equal(a.ok, true); assert.equal(a.git.state, 'none'); assert.deepEqual(a.notInGit, []); assert.equal(a.notInGitCommand, null);
  const dir = project({ 'a.txt': 'a\n' }); grow(dir, { 'new.txt': 'n\n' });
  const b = checkManifest({ root: dir, git: 'chicla-no-such-git' }); assert.equal(b.ok, true); assert.equal(b.git.state, 'unavailable'); assert.deepEqual(b.notInGit, []);
  const w = checkManifest({ root: dir, write: true }); assert.equal(w.ok, true); assert.deepEqual(w.notInGit, []); assert.equal(w.notInGitCommand, null);
});

test('EMANIFEST_TRACKED still wins: a tracked file outside the manifest fails as before, with no note', { skip: !HAS_GIT }, () => {
  const dir = project({ 'a.txt': 'a\n' });
  put(dir, 'stage2/x.md'); git(dir, 'add', '-A'); // tracked, but not in the manifest
  const r = checkManifest({ root: dir });
  assert.equal(r.ok, false); assert.equal(r.code, 'EMANIFEST_TRACKED'); assert.deepEqual(r.notInGit, []);
});
