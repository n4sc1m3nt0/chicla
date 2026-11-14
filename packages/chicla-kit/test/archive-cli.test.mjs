// C30.1 (D160, D-A): `chicla archive` runs the archive script of the kit on a project that has NO scripts/ folder (what `npm install chicla` + `chicla init` gives).
// Before, `archive-changelog` existed only as scripts/archive-changelog.mjs and the package told the user to run a file the project never had.
// Tests assert exit codes and files, never message text. Every project is a temp folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(KIT, '..', '..');
const { main } = await import(pathToFileURL(join(KIT, 'src', 'cli.mjs')).href);

const T = mkdtempSync(join(tmpdir(), 'chicla-c301-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
const rounds = Array.from({ length: 14 }, (_, i) => `## Round ${14 - i} — entry ${14 - i}\n\n- text of ${14 - i}\n`).join('\n');

/** A project like the one `chicla init` writes: a CHANGELOG and a status file, and no scripts/. */
function project() {
  const dir = join(T, `p${++n}`);
  mkdirSync(dir);
  writeFileSync(join(dir, 'CHANGELOG.md'), `<!-- CHANGELOG_FINGERPRINT: seq=3 -->\n# Changelog\n\n${rounds}`);
  writeFileSync(join(dir, 'CHICLA_PROJECT_STATUS-3.md'), '# Status\n\n**Current version:** v1.\n\n**Last updated (round 10):** now.\n');
  return dir;
}
const sink = () => { const s = { text: '', write(x) { this.text += x; return true; } }; return s; };
const chicla = async (cwd, ...argv) => { const stdout = sink(), stderr = sink(); const code = await main(argv, { stdout, stderr, cwd }); return { code, stdout: stdout.text, stderr: stderr.text }; };
const tree = (dir) => readdirSync(dir, { recursive: true }).sort().join('|');

test('chicla archive --dry-run on a project with no scripts/ exits 0 and writes nothing', async () => {
  const dir = project(), before = tree(dir), changelog = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
  const r = await chicla(dir, 'archive', '--dry-run', '--keep', '3');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(tree(dir), before);
  assert.equal(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), changelog);
});

test('chicla archive moves the old rounds into docs/archive/changelog, nothing is lost, still no scripts/', async () => {
  const dir = project();
  const r = await chicla(dir, 'archive', '--keep', '3');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!existsSync(join(dir, 'scripts')));
  const files = readdirSync(join(dir, 'docs/archive/changelog'));
  assert.equal(files.length, 1);
  const kept = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), moved = readFileSync(join(dir, 'docs/archive/changelog', files[0]), 'utf8');
  for (let i = 1; i <= 14; i++) assert.ok(kept.includes(`entry ${i}\n`) || moved.includes(`entry ${i}\n`), `round ${i} is in neither file`);
  assert.ok(kept.includes('entry 14\n') && !kept.includes('entry 1\n'));
});

test('--root names the project when the current folder is another one', async () => {
  const dir = project(), elsewhere = join(T, 'elsewhere'); mkdirSync(elsewhere);
  const r = await chicla(elsewhere, 'archive', '--status', '--dry-run', '--root', dir);
  assert.equal(r.code, 0, r.stderr);
  const bad = await chicla(elsewhere, 'archive', '--dry-run');
  assert.notEqual(bad.code, 0, 'the folder without a project must not pass');
});

test('--root without a folder, and an option the script does not know, are usage errors (exit 2) that change nothing', async () => {
  const dir = project(), before = tree(dir);
  assert.equal((await chicla(dir, 'archive', '--root')).code, 2);
  assert.equal((await chicla(dir, 'archive', '--root', '--dry-run')).code, 2);
  assert.equal((await chicla(dir, 'archive', '--nope')).code, 2);
  assert.equal(tree(dir), before);
});

test('chicla archive --help prints the usage of the script (not the general help) and exits 0', async () => {
  const r = await chicla(T, 'archive', '--help');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--keep-previous/);
});

test('scripts/archive-changelog.mjs of this repo is a wrapper: same code, root = the repo, --help exits 0', () => {
  const r = spawnSync(process.execPath, [join(REPO, 'scripts/archive-changelog.mjs'), '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--keep-previous/);
  const wrapper = readFileSync(join(REPO, 'scripts/archive-changelog.mjs'), 'utf8');
  assert.ok(wrapper.split('\n').length < 15, 'the wrapper must stay a wrapper');
});

test('the script itself (run on its own, as scripts/ and the CLI do) refuses --root without a folder with exit 2 and changes nothing', () => {
  const dir = project(), before = tree(dir), core = join(KIT, 'src', 'archive-changelog.mjs');
  for (const a of [['--root'], ['--root', '--dry-run'], ['--dry-run', '--root']]) {
    const r = spawnSync(process.execPath, [core, ...a], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 2, `${a.join(' ')}: ${r.stderr}`);
  }
  assert.equal(tree(dir), before);
});
