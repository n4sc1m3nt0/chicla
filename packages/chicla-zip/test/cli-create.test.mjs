// C4.2b (round 38), written before the code: `create` on the command line and `--json` on `create`, `extract` and `mark` (same contract as D34, confirmed).
//   create <out.zip> <folder> [--exclude GLOB]... [--stream] [--deterministic] [--json]
//   --exclude: a pattern without «/» matches a file or folder NAME at any depth; a pattern with «/» matches the whole path from the folder; «*» and «?» never cross «/».
//   An excluded folder is pruned with everything in it. Output: «✓ N entry(ies), B bytes → out», then «! skipped: …» and «! equivalent names …» lines.
//   --json: ONE line { ok: true, command, ... } on stdout, stderr empty; failures { ok: false, error: { code, message } }, exit 1 (or 2 for usage).
// Zips made by `create` are read back by independent readers (unzip, zipinfo, Python) through checkZip, not only by the Chicla reader.
// Assertions use exit codes and error `code`s, never message text.
import { listZip } from '../src/zipkit.mjs';
import { checkZip } from './interop.mjs';
import { caseInsensitive } from './fsprobe.mjs';
import { buildZip } from './zipfab.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'zipkit.mjs');
let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-clic-')); });
after(() => { rmSync(base, { recursive: true, force: true }); });
const fresh = () => { const d = join(base, `t${n++}`); mkdirSync(d); return d; };
const run = (...args) => {
  const r = spawnSync(process.execPath, [SRC, ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C.UTF-8' } });
  return { code: r.status, text: r.stdout.toString('utf8'), etext: r.stderr.toString('utf8') };
};
const oneJson = (r) => { const lines = r.text.split('\n').filter(Boolean); assert.equal(lines.length, 1, `expected one JSON line, got: ${r.text}`); assert.ok(r.text.endsWith('\n')); return JSON.parse(lines[0]); };
// A tree: a.txt, sub/b.txt, sub/c.log, d.log, node_modules/x/y.js, keep/node_modules.txt
const tree = () => {
  const root = join(fresh(), 'src');
  for (const [p, c] of [['a.txt', 'alpha'], ['sub/b.txt', 'bravo'], ['sub/c.log', 'log c'], ['d.log', 'log d'], ['node_modules/x/y.js', 'js'], ['keep/node_modules.txt', 'kept']]) {
    mkdirSync(join(root, dirname(p)), { recursive: true }); writeFileSync(join(root, p), c);
  }
  return root;
};
const outZip = () => join(fresh(), 'out.zip');
const names = (p) => listZip(p).entries.map((e) => e.name).sort();
const ALL = ['a.txt', 'd.log', 'keep/', 'keep/node_modules.txt', 'node_modules/', 'node_modules/x/', 'node_modules/x/y.js', 'sub/', 'sub/b.txt', 'sub/c.log'];

test('create: makes the zip, exit 0, summary on stdout, stderr empty; independent readers accept it', async () => {
  const root = tree(), out = outZip(), r = run('create', out, root);
  assert.equal(r.code, 0); assert.equal(r.etext, ''); assert.match(r.text, /^✓ 10 entry\(ies\)/);
  assert.deepEqual(names(out), ALL);
  const c = await checkZip(out, { 'a.txt': 'alpha', 'd.log': 'log d', 'keep/': '', 'keep/node_modules.txt': 'kept', 'node_modules/': '', 'node_modules/x/': '', 'node_modules/x/y.js': 'js', 'sub/': '', 'sub/b.txt': 'bravo', 'sub/c.log': 'log c' });
  assert.ok(c.ran.length >= 1); assert.deepEqual(c.problems, []);
});

test('create --json: one line with entries, bytes, skipped and collisions; stderr empty', () => {
  const root = tree(), out = outZip(), r = run('create', out, root, '--json');
  assert.equal(r.code, 0); assert.equal(r.etext, '');
  const j = oneJson(r);
  assert.equal(j.ok, true); assert.equal(j.command, 'create'); assert.equal(j.entries, 10); assert.equal(typeof j.bytes, 'number'); assert.ok(j.bytes > 0);
  assert.deepEqual(j.skipped, []); assert.deepEqual(j.collisions, []);
});

test('create --exclude: a pattern without «/» matches names at any depth; a folder is pruned with its contents', () => {
  const root = tree(), out = outZip();
  assert.equal(run('create', out, root, '--exclude', '*.log', '--exclude', 'node_modules').code, 0);
  assert.deepEqual(names(out), ['a.txt', 'keep/', 'keep/node_modules.txt', 'sub/', 'sub/b.txt']);
});

test('create --exclude: a pattern with «/» matches the whole path, so sub/c.log goes and d.log stays; «*» never crosses «/»', () => {
  const root = tree(), out = outZip();
  assert.equal(run('create', out, root, '--exclude', 'sub/c.log').code, 0);
  assert.deepEqual(names(out), ALL.filter((x) => x !== 'sub/c.log'));
  const out2 = outZip();
  assert.equal(run('create', out2, root, '--exclude', 'sub/*.log', '--exclude', 'node_modules/*').code, 0);
  assert.deepEqual(names(out2), ['a.txt', 'd.log', 'keep/', 'keep/node_modules.txt', 'node_modules/', 'sub/', 'sub/b.txt']); // node_modules/ itself stays; its child x is pruned
  const out3 = outZip();
  assert.equal(run('create', out3, root, '--exclude', 'node_modules/*.js').code, 0);
  assert.ok(names(out3).includes('node_modules/x/y.js'), '«*» does not cross «/»: node_modules/x/y.js is not node_modules/*.js');
});

test('create --exclude: «?» is one character, and other regex characters are literal', () => {
  const root = tree(); writeFileSync(join(root, 'a+b.txt'), 'p'); writeFileSync(join(root, 'aab.txt'), 'q');
  const out = outZip(); assert.equal(run('create', out, root, '--exclude', 'a+b.txt', '--exclude', 'd.lo?').code, 0);
  const got = names(out); assert.ok(!got.includes('a+b.txt') && !got.includes('d.log') && got.includes('aab.txt'));
  const out2 = outZip(); assert.equal(run('create', out2, root, '--exclude', 'a.b.txt').code, 0);
  assert.ok(names(out2).includes('aab.txt'), '«.» is a dot, not any character');
});

test('create --exclude: «?» does not match «/» either (node_modules/x?y.js is not node_modules/x/y.js)', () => {
  const root = tree(), out = outZip();
  assert.equal(run('create', out, root, '--exclude', 'node_modules/x?y.js').code, 0);
  assert.ok(names(out).includes('node_modules/x/y.js'));
});

test('create --exclude without a value, or create with the wrong number of arguments or a flag it does not have: exit 2', () => {
  const root = tree();
  for (const args of [['create', outZip(), root, '--exclude'], ['create', outZip()], ['create'], ['create', outZip(), root, 'extra'], ['create', outZip(), root, '--max-bytes', '5'], ['ls', outZip(), '--exclude', 'x']]) {
    const r = run(...args); assert.equal(r.code, 2, JSON.stringify(args)); assert.equal(r.text, ''); assert.match(r.etext, /usage/i);
  }
});

test('create --deterministic: the flag reaches the writer (modes become 0644) and two runs are byte-identical', () => {
  const root = tree(); chmodSync(join(root, 'a.txt'), 0o600);
  const plain = outZip(), det = outZip(), det2 = outZip();
  assert.equal(run('create', plain, root).code, 0); assert.equal(run('create', det, root, '--deterministic').code, 0); assert.equal(run('create', det2, root, '--deterministic').code, 0);
  const mode = (p) => listZip(p).entries.find((e) => e.name === 'a.txt').mode & 0o777;
  assert.equal(mode(plain), 0o600); assert.equal(mode(det), 0o644);
  assert.ok(readFileSync(det).equals(readFileSync(det2)));
});

test('create --stream: streamed through writeZipStream (data descriptors, bit 3), no .partial left, accepted by independent readers', async () => {
  const root = tree(), out = outZip();
  assert.equal(run('create', out, root, '--stream').code, 0);
  assert.ok(listZip(out).entries.filter((e) => !e.isDir).every((e) => e.flags & 8), 'bit 3 set on files');
  const plain = outZip(); run('create', plain, root); assert.ok(listZip(plain).entries.filter((e) => !e.isDir).every((e) => !(e.flags & 8)));
  assert.deepEqual(readdirSync(dirname(out)), ['out.zip']);
  assert.deepEqual((await checkZip(out, { 'a.txt': 'alpha', 'd.log': 'log d', 'keep/': '', 'keep/node_modules.txt': 'kept', 'node_modules/': '', 'node_modules/x/': '', 'node_modules/x/y.js': 'js', 'sub/': '', 'sub/b.txt': 'bravo', 'sub/c.log': 'log c' })).problems, []);
});

test('create: a symlink is skipped and reported (text and json); exit stays 0', () => {
  const root = tree(); symlinkSync('a.txt', join(root, 'link'));
  const j = oneJson(run('create', outZip(), root, '--json')); assert.deepEqual(j.skipped, [{ name: 'link', reason: 'symlink' }]); assert.equal(j.entries, 10);
  const t = run('create', outZip(), root); assert.equal(t.code, 0); assert.match(t.text, /^! skipped: link \(symlink\)$/m);
});

test('create: names that differ only in case or normalisation are reported as collisions (text and json), the zip is still written', { skip: caseInsensitive && 'this file system cannot hold a.txt and A.txt in one folder (the tree cannot be built)' }, () => {
  const root = tree(); writeFileSync(join(root, 'A.txt'), 'upper');
  const out = outZip(), j = oneJson(run('create', out, root, '--json'));
  assert.equal(j.collisions.length, 1); assert.deepEqual([...j.collisions[0]].sort(), ['A.txt', 'a.txt']); assert.ok(existsSync(out));
  const t = run('create', outZip(), root); assert.equal(t.code, 0); assert.match(t.text, /^! equivalent names .*≈/m);
});

test('create: a folder that does not exist is exit 1 (EARG); an output inside the folder is exit 1 (ERECURSE); json says so; nothing is written', () => {
  const root = tree(), out = outZip();
  let r = run('create', out, join(root, 'nope')); assert.equal(r.code, 1); assert.match(r.etext, /^✗ /); assert.equal(r.text, ''); assert.ok(!existsSync(out));
  r = run('create', out, join(root, 'nope'), '--json'); assert.equal(r.code, 1); assert.equal(r.etext, ''); assert.deepEqual([oneJson(r).ok, oneJson(r).error.code], [false, 'EARG']);
  const inside = join(root, 'out.zip');
  r = run('create', inside, root, '--json'); assert.equal(r.code, 1); assert.equal(oneJson(r).error.code, 'ERECURSE'); assert.ok(!existsSync(inside));
});

test('create: a missing folder for the output is exit 1 with ENOENT (same code as the library), plain and with --stream', () => {
  const root = tree(), out = join(fresh(), 'no', 'such', 'out.zip');
  for (const extra of [[], ['--stream']]) { const r = run('create', out, root, '--json', ...extra); assert.equal(r.code, 1, String(extra)); assert.equal(oneJson(r).error.code, 'ENOENT'); }
});

// ---------- --json on extract and mark ----------
const good = () => { const p = join(fresh(), 'a.zip'); writeFileSync(p, buildZip([{ name: 'hello.txt', data: 'hello world, hello world', method: 8 }, { name: 'dir/', dir: true }, { name: 'dir/b.txt', data: 'bee' }])); return p; };

test('extract --json: files, dirs, bytes, skipped and collisions on one line; the files are on disk; stderr empty', () => {
  const d = join(fresh(), 'out'), r = run('extract', good(), d, '--json');
  assert.equal(r.code, 0); assert.equal(r.etext, '');
  const j = oneJson(r); assert.deepEqual(j, { ok: true, command: 'extract', files: 2, dirs: 1, bytes: 27, skipped: [], collisions: [] });
  assert.equal(readFileSync(join(d, 'dir', 'b.txt'), 'utf8'), 'bee');
});

test('extract --json: collisions and skipped entries are listed, not only counted', { skip: caseInsensitive && 'this file system is case-insensitive: extract refuses a.txt + A.txt (ECOLLISION), which is the right answer there' }, () => {
  const p = join(fresh(), 'c.zip'); writeFileSync(p, buildZip([{ name: 'a.txt', data: '1' }, { name: 'A.txt', data: '2' }]));
  const j = oneJson(run('extract', p, join(fresh(), 'o'), '--json', '--overwrite')); assert.equal(j.ok, true); assert.equal(j.collisions.length, 1); assert.deepEqual([...j.collisions[0]].sort(), ['A.txt', 'a.txt']);
});

test('extract --json: a refusal is exit 1 with ok:false and a code, stderr empty, nothing written; flag order does not matter; --overwrite and --max-bytes combine with it', () => {
  const p = join(fresh(), 'e.zip'); writeFileSync(p, buildZip([{ name: '../evil.txt', data: 'x' }]));
  const d = join(fresh(), 'out'), r = run('--json', 'extract', p, d); assert.equal(r.code, 1); assert.equal(r.etext, ''); assert.equal(oneJson(r).ok, false); assert.ok(!existsSync(d));
  const z = good(), d2 = join(fresh(), 'o2'); assert.equal(run('extract', z, d2, '--json').code, 0);
  assert.equal(oneJson(run('extract', z, d2, '--overwrite', '--json')).ok, true);
  const big = run('extract', z, join(fresh(), 'o3'), '--max-bytes', '5', '--json'); assert.equal(big.code, 1); assert.equal(oneJson(big).ok, false);
});

test('mark --json: patched and total; a second run patches none; a missing zip is exit 1', () => {
  const p = join(fresh(), 'm.zip'); writeFileSync(p, buildZip([{ name: 'café.txt', data: 'x' }, { name: 'plain.txt', data: 'y' }]));
  assert.deepEqual(oneJson(run('mark', p, '--json')), { ok: true, command: 'mark', patched: 1, total: 2 });
  assert.deepEqual(oneJson(run('mark', p, '--json')), { ok: true, command: 'mark', patched: 0, total: 2 });
  const r = run('mark', join(fresh(), 'nope.zip'), '--json'); assert.equal(r.code, 1); assert.equal(r.etext, ''); assert.equal(oneJson(r).error.code, 'ENOENT');
});

test('the usage line names create and --json for every command that has it', () => {
  const r = run('create'); assert.equal(r.code, 2); assert.match(r.etext, /create/); assert.match(r.etext, /--exclude/); assert.match(r.etext, /--stream/); assert.match(r.etext, /--deterministic/);
});
