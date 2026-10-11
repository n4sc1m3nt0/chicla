// C3.5: createZip(out, root, opts) walks a folder and writes it with writeZip. Written before the code (it failed first; see the CHANGELOG of round 24).
// Contract under test:
//   createZip(out, root, { exclude, symlinks = "skip", ...writeZipOptions }) -> { entries, bytes, skipped }
//   - entries come in a fixed order: depth first, siblings sorted by the bytes of their UTF-8 names, a folder before its contents; the root itself
//     is not an entry; empty folders are kept (the readdir order of the machine never shows);
//   - `exclude(relPath, { isDir })` returns true to leave something out; an excluded folder is not entered; relPath uses "/" and has no trailing slash;
//   - symlinks are NEVER followed. "skip" (default) leaves them out and reports them in `skipped`; "error" refuses with ESYMLINK; anything else is EARG.
//     Sockets, FIFOs and devices are skipped (reason "special"), never read (a FIFO would block);
//   - the output (and its .partial) may not be inside the tree being read: ERECURSE, also through a symlinked folder; a sibling whose name only
//     starts like the root's is fine; nothing is written when it refuses;
//   - unsafe names found on disk are refused with EUNSAFE (as writeZip does); a root that is not a folder is EARG; a root that is a symlink to a
//     folder is accepted (the user named it).
// Assertions use error codes, never message text. Linux and macOS only (symlinks, mkfifo).
import { createZip, listZip, ZipError } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, statSync, renameSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { checkZip } from './interop.mjs';
import { refusesNoncharacters } from './fsprobe.mjs';

let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-create-')); });
after(() => { rmSync(base, { recursive: true, force: true }); });
const fresh = () => { const d = join(base, `t${n++}`); mkdirSync(d); return d; };
const tree = (root, files) => { for (const [name, v] of Object.entries(files)) { const p = join(root, name); if (name.endsWith('/')) mkdirSync(p, { recursive: true }); else { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, v); } } return root; };
const names = (zip) => listZip(zip).entries.map((e) => e.name);
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const refuses = async (root, out, code, opts) => {
  await assert.rejects(createZip(out, root, opts), (e) => e instanceof ZipError && e.code === code, `expected ${code}`);
  assert.throws(() => statSync(out), { code: 'ENOENT' }, 'output exists after a refusal');
  let left = []; try { left = readdirSync(join(out, '..')).filter((x) => x.endsWith('.partial')); } catch { /* the folder does not exist: nothing can be left */ }
  assert.deepEqual(left, [], 'a .partial file was left');
};

test('the walk is in a fixed order whatever the creation order: depth first, byte-sorted, folders before their contents', async () => {
  const a = fresh(), b = fresh();
  tree(a, { 'z.txt': 'z', 'b/': '', 'b/y.txt': 'y', 'b/a.txt': 'a', 'a.txt': 'a', 'B.txt': 'B', 'caf\u00e9.txt': 'e', 'd/e/f.txt': 'f' });
  tree(b, { 'd/e/f.txt': 'f', 'caf\u00e9.txt': 'e', 'B.txt': 'B', 'a.txt': 'a', 'b/a.txt': 'a', 'b/y.txt': 'y', 'b/': '', 'z.txt': 'z' });
  const oa = join(base, 'oa.zip'), ob = join(base, 'ob.zip');
  const r = await createZip(oa, a, { deterministic: true, epoch: 1700000000 }); await createZip(ob, b, { deterministic: true, epoch: 1700000000 });
  assert.deepEqual(names(oa), ['B.txt', 'a.txt', 'b/', 'b/a.txt', 'b/y.txt', 'caf\u00e9.txt', 'd/', 'd/e/', 'd/e/f.txt', 'z.txt']);
  assert.deepEqual(r.entries.map((e) => e.name), names(oa));
  assert.equal(sha(oa), sha(ob), 'same content, different creation order: different bytes');
  assert.deepEqual(r.skipped, []); assert.ok(r.bytes > 0);
});

test('files, empty folders and nested folders round-trip through unzip, zipinfo, Python and the Chicla reader; the root is not an entry', async () => {
  const root = tree(fresh(), { 'a.txt': 'hello', 'empty': '', 'e/': '', 'd/x/y.bin': Buffer.alloc(100000, 7).toString('latin1') });
  const out = join(base, 'rt.zip'); await createZip(out, root);
  const exp = { 'a.txt': 'hello', 'empty': '', 'e/': '', 'd/': '', 'd/x/': '', 'd/x/y.bin': Buffer.alloc(100000, 7).toString('latin1') };
  assert.deepEqual((await checkZip(out, exp)).problems, []);
  assert.ok(!names(out).includes('') && !names(out).includes('/'));
});

test('mtime and mode come from the disk by default, and deterministic normalises them', async () => {
  const root = tree(fresh(), { 'a.txt': 'x' }); const t = new Date(Date.UTC(2020, 5, 15, 12, 0, 0));
  const { utimesSync, chmodSync } = await import('node:fs'); utimesSync(join(root, 'a.txt'), t, t); chmodSync(join(root, 'a.txt'), 0o600);
  const o1 = join(base, 'm1.zip'), o2 = join(base, 'm2.zip'); await createZip(o1, root); await createZip(o2, root, { deterministic: true, epoch: 1700000000 });
  const [e1] = listZip(o1).entries, [e2] = listZip(o2).entries;
  assert.equal(e1.mode & 0o777, 0o600); assert.ok(Math.abs(e1.mtime - t) <= 2000 + 24 * 3600e3, 'mtime not from the disk');
  assert.equal(e2.mode & 0o777, 0o644);
});

test('exclude: gets the relative path and isDir; leaves files out; an excluded folder is not entered', async () => {
  const root = tree(fresh(), { 'keep.txt': 'k', 'skip.log': 's', 'node_modules/p/i.js': 'i', 'src/a.js': 'a', 'src/a.log': 'l' });
  const calls = [], out = join(base, 'ex.zip');
  await createZip(out, root, { exclude: (rel, { isDir }) => { calls.push([rel, isDir]); return rel === 'node_modules' || rel.endsWith('.log'); } });
  assert.deepEqual(names(out), ['keep.txt', 'src/', 'src/a.js']);
  assert.ok(!calls.some(([rel]) => rel.startsWith('node_modules/')), 'entered an excluded folder');
  assert.deepEqual(calls.find(([rel]) => rel === 'node_modules'), ['node_modules', true]);
  assert.deepEqual(calls.find(([rel]) => rel === 'src/a.js'), ['src/a.js', false]);
});

test('exclude must be a function; symlinks must be "skip" or "error"; the root must be a folder', async () => {
  const root = tree(fresh(), { 'a': 'a' }), o = () => join(base, `arg${n++}.zip`);
  for (const exclude of ['*.log', 1, {}, null]) await refuses(root, o(), 'EARG', { exclude });
  for (const symlinks of ['follow', true, 1, null]) await refuses(root, o(), 'EARG', { symlinks });
  await refuses(join(root, 'a'), o(), 'EARG'); await refuses(join(root, 'missing'), o(), 'EARG'); await refuses(42, o(), 'EARG');
});

test('symlinks are skipped by default and reported; nothing behind them is read, whatever they point at', async () => {
  const secret = tree(fresh(), { 'secret.txt': 'TOP SECRET', 'deep/s2.txt': 'ALSO SECRET' }), root = tree(fresh(), { 'real.txt': 'real', 'sub/': '' });
  symlinkSync(join(secret, 'secret.txt'), join(root, 'link-file')); symlinkSync(secret, join(root, 'link-dir')); symlinkSync(join(root, 'nope'), join(root, 'dangling'));
  symlinkSync('real.txt', join(root, 'sub', 'rel-link')); symlinkSync('..', join(root, 'sub', 'up'));
  const out = join(base, 'sl.zip'), r = await createZip(out, root);
  assert.deepEqual(names(out), ['real.txt', 'sub/']);
  assert.deepEqual(r.skipped.map((s) => s.name).sort(), ['dangling', 'link-dir', 'link-file', 'sub/rel-link', 'sub/up']);
  assert.ok(r.skipped.every((s) => s.reason === 'symlink'));
  assert.ok(!readFileSync(out).includes('SECRET'), 'content behind a symlink was read');
});

test('symlinks: "error" refuses with ESYMLINK and writes nothing', async () => {
  const root = tree(fresh(), { 'a': 'a' }); symlinkSync('a', join(root, 'l'));
  await refuses(root, join(base, 'se.zip'), 'ESYMLINK', { symlinks: 'error' });
  const clean = tree(fresh(), { 'a': 'a' }), out = join(base, 'se2.zip'); await createZip(out, clean, { symlinks: 'error' }); assert.deepEqual(names(out), ['a']);
});

test('an excluded symlink is neither reported nor an error', async () => {
  const root = tree(fresh(), { 'a': 'a' }); symlinkSync('a', join(root, 'l'));
  const out = join(base, 'xs.zip'), r = await createZip(out, root, { symlinks: 'error', exclude: (rel) => rel === 'l' });
  assert.deepEqual(names(out), ['a']); assert.deepEqual(r.skipped, []);
});

test('a FIFO is skipped as "special" and never read (reading it would block)', { timeout: 20000 }, async () => {
  const root = tree(fresh(), { 'a': 'a' }); const m = spawnSync('mkfifo', [join(root, 'pipe')]); if (m.status !== 0) return; // no mkfifo: nothing to test here
  const out = join(base, 'fifo.zip'), r = await createZip(out, root);
  assert.deepEqual(names(out), ['a']); assert.deepEqual(r.skipped, [{ name: 'pipe', reason: 'special' }]);
});

test('a file swapped for a symlink after it was listed is not followed (O_NOFOLLOW)', async () => {
  const secret = tree(fresh(), { 's.txt': 'TOP SECRET' }), root = tree(fresh(), { 'a.txt': 'a', 'b.txt': 'b' }), out = join(base, 'swap.zip');
  const r = await createZip(out, root, { exclude: (rel) => { if (rel === 'b.txt') { unlinkSync(join(root, 'b.txt')); symlinkSync(join(secret, 's.txt'), join(root, 'b.txt')); } return false; } });
  assert.ok(!readFileSync(out).includes('SECRET'), 'followed a symlink that appeared after the listing');
  assert.ok(!names(out).includes('b.txt'));
  assert.deepEqual(r.skipped, [{ name: 'b.txt', reason: 'symlink' }]);
});

test('the output may not be inside the tree being read (ERECURSE), also through a symlinked folder, and nothing is written', async () => {
  const root = tree(fresh(), { 'a': 'a', 'sub/': '' }), before = readdirSync(root).sort();
  await refuses(root, join(root, 'out.zip'), 'ERECURSE'); await refuses(root, join(root, 'sub', 'deep', 'out.zip'), 'ERECURSE');
  const viaLink = join(fresh(), 'alias'); symlinkSync(join(root, 'sub'), viaLink); await refuses(root, join(viaLink, 'out.zip'), 'ERECURSE');
  const rootLink = join(fresh(), 'rootlink'); symlinkSync(root, rootLink); await refuses(rootLink, join(root, 'out2.zip'), 'ERECURSE');
  assert.deepEqual(readdirSync(root).sort(), before, 'the tree was touched');
});

test('the output next to the root, even with a name that starts like it, is fine', async () => {
  const parent = fresh(), root = tree(join(parent, 'proj'), { 'a': 'a' }); mkdirSync(join(parent, 'proj-backup'));
  for (const out of [join(parent, 'proj.zip'), join(parent, 'proj-backup', 'o.zip'), join(parent, 'projx')]) { await createZip(out, root); assert.deepEqual(names(out), ['a']); }
});

test('a root that is a symlink to a folder is accepted', async () => {
  const real = tree(fresh(), { 'a': 'a' }), link = join(fresh(), 'ln'); symlinkSync(real, link);
  const out = join(base, 'rl.zip'); await createZip(out, link); assert.deepEqual(names(out), ['a']);
});

test('an unsafe name found on disk is refused with EUNSAFE and nothing is written', async () => {
  const root = tree(fresh(), { 'ok': 'ok' }); writeFileSync(join(root, 'back\\slash'), 'x');
  await refuses(root, join(base, 'unsafe.zip'), 'EUNSAFE');
});

test('writeZip options pass through (level, zip64, deterministic) and a bad one is refused', async () => {
  const root = tree(fresh(), { 'a': 'a'.repeat(5000) }), o1 = join(base, 'l0.zip'), o9 = join(base, 'l9.zip');
  const s0 = await createZip(o1, root, { level: 0 }), s9 = await createZip(o9, root, { level: 9 });
  assert.equal(s0.entries[0].method, 0); assert.equal(s9.entries[0].method, 8);
  await refuses(root, join(base, 'badopt.zip'), 'EARG', { epoch: 5 });
  const z = join(base, 'z64.zip'); await createZip(z, root, { zip64: true }); assert.deepEqual(names(z), ['a']);
});

test('a name on disk that is not valid UTF-8 is refused with EUNSAFE (it cannot be written truthfully)', async () => {
  const root = tree(fresh(), { 'ok': 'ok' });
  try { writeFileSync(Buffer.concat([Buffer.from(`${root}/caf`), Buffer.from([0xe9])]), 'x'); } catch { return; } // macOS refuses such names: nothing to test there
  await refuses(root, join(base, 'badutf8.zip'), 'EUNSAFE');
});

test('the order is by the bytes of the names, not by the machine nor by JavaScript string order (300 shuffled names, astral and high BMP characters)', async () => {
  const root = fresh(); let x = 99; const nm = new Set([...(refusesNoncharacters ? [] : ['\uffff.txt']), '\u{1f600}.txt', '\ue000.txt', 'z']); // macOS refuses U+FFFF (EILSEQ)
  while (nm.size < 300) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; nm.add(`f${x.toString(36)}`); }
  for (const f of [...nm].sort(() => 0.5 - ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 2 ** 32))) writeFileSync(join(root, f), f);
  const out = join(base, 'order.zip'); await createZip(out, root);
  assert.deepEqual(names(out), [...nm].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
});

test('a file swapped for a FIFO after it was listed is skipped as "special" and does not block', { timeout: 20000 }, async () => {
  const root = tree(fresh(), { 'a.txt': 'a', 'b.txt': 'b' }), out = join(base, 'swapfifo.zip'); let made = true;
  const r = await createZip(out, root, { exclude: (rel) => { if (rel === 'b.txt' && made) { unlinkSync(join(root, 'b.txt')); made = spawnSync('mkfifo', [join(root, 'b.txt')]).status === 0; } return false; } });
  if (!made) return; // no mkfifo
  assert.deepEqual(names(out), ['a.txt']); assert.deepEqual(r.skipped, [{ name: 'b.txt', reason: 'special' }]);
});
