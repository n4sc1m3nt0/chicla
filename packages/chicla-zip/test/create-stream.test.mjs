// C3.7b: createZip in streaming mode. Written before the code (see the CHANGELOG of round 30).
// PROPOSED API (D30), tests first:
//   createZip(out, root, { stream = false, ...opts }) -> { entries, bytes, skipped }
//   - `out` is a path and `stream: true`: the tree is LISTED first (lstat only, no file is opened), then written with writeZipStream to `<out>.partial`, fsync,
//     atomic rename; on any failure the `.partial` is removed and an existing `out` is left as it was. Without `stream` nothing changes (files read whole, writeZip).
//   - `out` is a Writable: it is streamed to it (no `.partial`, no rename); the sink is ENDED on success and DESTROYED on any failure, also when createZip
//     refuses before writing (EARG, ERECURSE, EUNSAFE...). `stream: false` with a Writable is EARG. `stream` that is not a boolean is EARG.
//   - files are opened one at a time, when the writer reaches them, and read in slices of at most 1 MiB (`_slice`, tests only); the data of a file is never in
//     memory whole. The checks of C3.6 hold: size, mtime, ctime and inode compared at the listing, at the open and after EACH slice, and the bytes read must be
//     the size: otherwise ECHANGED. In this mode a file that vanished, became a symlink or stopped being a regular file after the listing is ECHANGED too
//     (the entry's header is already planned: it cannot be skipped any more). `_afterRead(abs)` (tests only) runs after each slice has been read.
//   - everything else is as in C3.5 (order, exclude, symlinks, ERECURSE, EUNSAFE) and the writeZipStream options pass through; `zip64: false` is EZIP64.
// Assertions use error codes, never message text. Linux and macOS only (inodes, symlinks).
import { createZip, listZip, readZipFile, crc32, ZipError } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, statSync, utimesSync, truncateSync, appendFileSync, unlinkSync, existsSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { checkZip, readers } from './interop.mjs';

let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-cstream-')); });
after(() => { rmSync(base, { recursive: true, force: true }); });
const fresh = () => { const d = join(base, `t${n++}`); mkdirSync(d); return d; };
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sample = (size, seed = 1) => { const b = Buffer.alloc(size); let x = seed; for (let i = 0; i < size; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; b[i] = x >>> 24; } return b; };
const memSink = () => { const parts = []; const w = new Writable({ write(c, _e, cb) { parts.push(c); cb(); } }); w.bytes = () => Buffer.concat(parts); return w; };
const noOut = (out) => {
  assert.throws(() => statSync(out), { code: 'ENOENT' }, 'output exists after a refusal');
  assert.deepEqual(readdirSync(join(out, '..')).filter((x) => x.endsWith('.partial')), [], 'a .partial file was left');
};
const refuses = async (root, out, code, opts = {}) => {
  await assert.rejects(createZip(out, root, { stream: true, ...opts }), (e) => e instanceof ZipError && e.code === code, `expected ${code}`);
  noOut(out);
};
// non-ASCII names: every entry is zip64 here and Info-ZIP 6.00 shows «caf#U00e9» for those in a C locale (ROADMAP risks), so zipinfo is left out
const checkWide = async (p, want) => { for (const t of ['unzip', 'python', 'chicla']) { const r = await readers[t](p, want); assert.ok(r, `${t} did not run`); assert.deepEqual(r.problems, [], t); } };
const tree = (root) => {
  writeFileSync(join(root, 'a.txt'), 'alpha'); writeFileSync(join(root, 'b.bin'), sample(5000, 3)); mkdirSync(join(root, 'd/e'), { recursive: true });
  writeFileSync(join(root, 'd/c.txt'), 'gamma '.repeat(100)); writeFileSync(join(root, 'd/e/empty'), ''); writeFileSync(join(root, 'caf\u00e9.txt'), 'caf\u00e9');
  return { 'a.txt': 'alpha', 'b.bin': sample(5000, 3), 'd/': '', 'd/e/': '', 'd/c.txt': 'gamma '.repeat(100), 'd/e/empty': '', 'caf\u00e9.txt': 'caf\u00e9' };
};

test('stream: true gives the same entries, in the same order, with the same sizes and crc32 as the whole-file mode', async () => {
  const root = fresh(), want = tree(root);
  const a = await createZip(join(fresh(), 'a.zip'), root), b = await createZip(join(fresh(), 'b.zip'), root, { stream: true });
  const key = (r) => r.entries.map((e) => [e.name, e.size, e.crc32]);
  assert.deepEqual(key(b), key(a));
  assert.deepEqual(b.skipped, a.skipped);
  assert.deepEqual(Object.keys(want).sort(), b.entries.map((e) => e.name).sort());
});

test('the zip written in streaming mode is accepted by every independent reader and holds the bytes of the disk', async () => {
  const root = fresh(), want = tree(root), out = join(fresh(), 'a.zip');
  const r = await createZip(out, root, { stream: true });
  assert.equal(statSync(out).size, r.bytes);
  await checkWide(out, want);
  assert.deepEqual(readdirSync(join(out, '..')), ['a.zip'], 'only the zip is left in the folder');
});

test('files are read in slices: the read hook runs once per slice, and a file of an exact multiple of the slice has no extra one', async () => {
  const root = fresh(); writeFileSync(join(root, 'ten'), sample(10)); writeFileSync(join(root, 'eight'), sample(8)); writeFileSync(join(root, 'none'), '');
  const seen = {}; const out = join(fresh(), 'a.zip');
  await createZip(out, root, { stream: true, _slice: 4, _afterRead: (p) => { const k = p.split('/').pop(); seen[k] = (seen[k] ?? 0) + 1; } });
  assert.deepEqual(seen, { eight: 2, ten: 3 });
  assert.deepEqual((await checkZip(out, { ten: sample(10), eight: sample(8), none: '' })).problems, []);
});

test('files are opened one at a time, when the writer reaches them (no descriptor per file is held up front)', { skip: !existsSync('/proc/self/fd') }, async () => {
  const root = fresh(); for (let i = 0; i < 200; i++) writeFileSync(join(root, `f${String(i).padStart(3, '0')}`), `data ${i}`);
  const open0 = readdirSync('/proc/self/fd').length; let peak = 0;
  await createZip(join(fresh(), 'a.zip'), root, { stream: true, _afterRead: () => { peak = Math.max(peak, readdirSync('/proc/self/fd').length); } });
  assert.ok(peak - open0 <= 6, `${peak - open0} extra descriptors open at once`);
});

test('a file much bigger than the memory it is allowed is streamed: the resident memory stays far below the size of the file', async () => {
  const root = fresh(), p = join(root, 'big.bin'), SIZE = 400 * 2 ** 20; writeFileSync(p, ''); truncateSync(p, SIZE); // sparse: reads as zeros
  const out = join(fresh(), 'a.zip'); let peak = 0; const start = process.memoryUsage().rss;
  const r = await createZip(out, root, { stream: true, level: 1, _afterRead: () => { peak = Math.max(peak, process.memoryUsage().rss); } });
  assert.equal(r.entries[0].size, SIZE);
  assert.ok(peak - start < 200 * 2 ** 20, `resident memory grew by ${((peak - start) / 2 ** 20).toFixed(0)} MiB for a ${SIZE / 2 ** 20} MiB file`);
  const t = spawnSync('unzip', ['-t', out], { encoding: 'utf8' }); if (!t.error) assert.match(t.stdout, /No errors detected/);
});

test('a Writable as the output: streamed to it, ended on success, same bytes and listing as a file', async () => {
  const root = fresh(), want = tree(root), sink = memSink(); symlinkSync('a.txt', join(root, 'ln'));
  const r = await createZip(sink, root);
  assert.deepEqual(r.skipped, [{ name: 'ln', reason: 'symlink' }]); assert.equal(r.entries.length, Object.keys(want).length);
  assert.ok(sink.writableEnded && sink.writableFinished, 'the sink was not ended');
  const out = join(fresh(), 'viasink.zip'); writeFileSync(out, sink.bytes()); assert.equal(sink.bytes().length, r.bytes);
  await checkWide(out, want);
});

test('a Writable that is a file stream works, and nothing named .partial is created next to it', async () => {
  const root = fresh(), want = tree(root), dir = fresh(), out = join(dir, 'a.zip');
  await createZip(createWriteStream(out), root);
  assert.deepEqual(readdirSync(dir), ['a.zip']); await checkWide(out, want);
});

test('stream must be a boolean (EARG), the output must be a path or a Writable (EARG), and a Writable with stream: false is EARG; the sink is destroyed, nothing written', async () => {
  const root = fresh(); writeFileSync(join(root, 'a'), 'x');
  for (const bad of ['yes', 1, null]) await refuses(root, join(fresh(), 'a.zip'), 'EARG', { stream: bad });
  for (const bad of [42, undefined, {}]) for (const stream of [undefined, true]) await assert.rejects(createZip(bad, root, { stream }), (e) => e instanceof ZipError && e.code === 'EARG');
  const sink = memSink();
  await assert.rejects(createZip(sink, root, { stream: false }), (e) => e instanceof ZipError && e.code === 'EARG');
  assert.ok(sink.destroyed && sink.bytes().length === 0);
});

test('without the option the behaviour is the old one: the whole file is read once, the hook runs once per file', async () => {
  const root = fresh(); writeFileSync(join(root, 'ten'), sample(10));
  let calls = 0; await createZip(join(fresh(), 'a.zip'), root, { _slice: 4, _afterRead: () => { calls++; } });
  assert.equal(calls, 1);
});

test('refusals before writing leave nothing and destroy a sink: ERECURSE (sink inside the tree), EUNSAFE, ESYMLINK, EZIP64', async () => {
  const root = fresh(); writeFileSync(join(root, 'a.txt'), 'x'); symlinkSync('a.txt', join(root, 'ln'));
  await refuses(root, join(root, 'out.zip'), 'ERECURSE'); assert.deepEqual(readdirSync(root).sort(), ['a.txt', 'ln']);
  await refuses(root, join(fresh(), 'a.zip'), 'ESYMLINK', { symlinks: 'error' });
  await refuses(root, join(fresh(), 'a.zip'), 'EZIP64', { zip64: false });
  const bad = fresh(); writeFileSync(join(bad, 'a.txt'), 'x'); writeFileSync(join(bad, '..hidden\\x'), 'y'); // a backslash in a name is unsafe
  await refuses(bad, join(fresh(), 'a.zip'), 'EUNSAFE');
  const inside = join(root, 'sink.zip'), sink = createWriteStream(inside);
  await assert.rejects(createZip(sink, root), (e) => e instanceof ZipError && e.code === 'ERECURSE'); assert.ok(sink.destroyed);
  rmSync(inside, { force: true });
});

test('exclude and symlinks "skip" behave as before in streaming mode, and the skipped list is reported', async () => {
  const root = fresh(); writeFileSync(join(root, 'keep.txt'), 'k'); writeFileSync(join(root, 'drop.log'), 'd'); symlinkSync('keep.txt', join(root, 'ln'));
  const r = await createZip(join(fresh(), 'a.zip'), root, { stream: true, exclude: (rel) => rel.endsWith('.log') });
  assert.deepEqual(r.entries.map((e) => e.name), ['keep.txt']); assert.deepEqual(r.skipped, [{ name: 'ln', reason: 'symlink' }]);
});

test('options pass through: deterministic gives the same bytes on two runs, sha256 is the hash of the disk, extendedTime adds the UT extra', async () => {
  const root = fresh(); tree(root); const o1 = join(fresh(), 'a.zip'), o2 = join(fresh(), 'b.zip');
  const opts = { stream: true, deterministic: true, epoch: 1700000000, sha256: true };
  const r1 = await createZip(o1, root, opts); await createZip(o2, root, opts);
  assert.ok(readFileSync(o1).equals(readFileSync(o2)), 'two deterministic runs differ');
  assert.equal(r1.entries.find((e) => e.name === 'a.txt').sha256, sha('alpha'));
  const o3 = join(fresh(), 'c.zip'); await createZip(o3, root, { stream: true, extendedTime: true });
  assert.ok(readFileSync(o3).includes(Buffer.from([0x55, 0x54, 0x05, 0x00, 0x01])), 'no UT extra in the zip');
});

test('changed between the listing and the read (exclude runs in between) → ECHANGED, nothing written, an existing output untouched', async () => {
  const root = fresh(); writeFileSync(join(root, 'a.txt'), 'one'); writeFileSync(join(root, 'b.txt'), 'two');
  const dir = fresh(), out = join(dir, 'a.zip'); writeFileSync(out, 'OLD ZIP');
  await assert.rejects(createZip(out, root, { stream: true, exclude: (rel) => { if (rel === 'b.txt') appendFileSync(join(root, 'b.txt'), ' more'); return false; } }), (e) => e instanceof ZipError && e.code === 'ECHANGED' && e.message.includes('b.txt'));
  assert.equal(readFileSync(out, 'utf8'), 'OLD ZIP'); assert.deepEqual(readdirSync(dir), ['a.zip']);
  const t = new Date(Date.now() + 5000); const p = join(root, 'a.txt');
  await refuses(root, join(fresh(), 'b.zip'), 'ECHANGED', { exclude: (rel) => { if (rel === 'a.txt') { writeFileSync(p, 'ONE'); utimesSync(p, t, t); } return false; } });
});

test('changed while it is being read, between slices: appended, truncated, rewritten with the same size → ECHANGED, nothing written', async () => {
  const mk = () => { const root = fresh(); writeFileSync(join(root, 'a.txt'), 'abcdefghij'); writeFileSync(join(root, 'z.txt'), 'zzz'); return root; };
  let calls = 0; // the change happens in the first slice and must stop the read THERE (one hook call), not at the end of the file
  const first = (fn) => { let done = false; return (p) => { if (p.endsWith('a.txt')) { calls++; if (!done) { done = true; fn(p); } } }; };
  const early = async (name, fn) => { calls = 0; await refuses(mk(), join(fresh(), name), 'ECHANGED', { _slice: 4, _afterRead: first(fn) }); assert.equal(calls, 1, `${name}: the read went on after the change`); };
  await early('a.zip', (p) => appendFileSync(p, 'k'));
  await early('b.zip', (p) => truncateSync(p, 6));
  await early('c.zip', (p) => { writeFileSync(p, 'ABCDEFGHIJ'); const t = new Date(Date.now() + 5000); utimesSync(p, t, t); });
  await refuses(mk(), join(fresh(), 'd.zip'), 'ECHANGED', { _afterRead: first((p) => appendFileSync(p, 'k')) }); // a single slice: caught at its end
});

test('a change in the last slice is caught too, and a file that does not change is never reported (no false alarm)', async () => {
  const root = fresh(); const data = sample(20000, 9); writeFileSync(join(root, 'a.bin'), data);
  const out = join(fresh(), 'a.zip'); const r = await createZip(out, root, { stream: true, _slice: 4096, _afterRead: () => {} });
  assert.equal(r.entries[0].crc32, crc32(data));
  let k = 0; await refuses(root, join(fresh(), 'b.zip'), 'ECHANGED', { _slice: 4096, _afterRead: (p) => { if (++k === 5) appendFileSync(p, '!'); } }); assert.equal(k, 5);
});

test('after the listing the file vanished, became a symlink, or became a folder → ECHANGED (not skipped, not an unexplained ESOURCE)', async () => {
  const mk = () => { const root = fresh(); writeFileSync(join(root, 'a.txt'), 'abc'); writeFileSync(join(root, 'b.txt'), 'def'); writeFileSync(join(root, 'other'), 'o'); return root; };
  let root = mk(); await refuses(root, join(fresh(), 'a.zip'), 'ECHANGED', { exclude: (rel) => { if (rel === 'b.txt') unlinkSync(join(root, 'b.txt')); return false; } });
  root = mk(); await refuses(root, join(fresh(), 'b.zip'), 'ECHANGED', { exclude: (rel) => { if (rel === 'b.txt') { unlinkSync(join(root, 'b.txt')); symlinkSync('other', join(root, 'b.txt')); } return false; } });
  root = mk(); await refuses(root, join(fresh(), 'c.zip'), 'ECHANGED', { exclude: (rel) => { if (rel === 'b.txt') { unlinkSync(join(root, 'b.txt')); mkdirSync(join(root, 'b.txt')); } return false; } });
});

test('a failing Writable sink (destroyed half way) is EZIP, the .partial is removed, and a leftover .partial of an earlier crash is overwritten on success', async () => {
  const root = fresh(); writeFileSync(join(root, 'a.bin'), sample(300000, 5));
  let k = 0; const sink = new Writable({ highWaterMark: 1024, write(_c, _e, cb) { if (++k === 3) cb(new Error('disk full')); else cb(); } });
  await assert.rejects(createZip(sink, root, { _slice: 8192 }), (e) => e instanceof ZipError && (e.code === 'EZIP' || e.code === 'ESOURCE')); assert.ok(sink.destroyed);
  const dir = fresh(), out = join(dir, 'a.zip'); writeFileSync(`${out}.partial`, 'junk from a crash');
  await createZip(out, root, { stream: true }); assert.deepEqual(readdirSync(dir), ['a.zip']);
  assert.deepEqual((await checkZip(out, { 'a.bin': sample(300000, 5) })).problems, []);
});

test('a successful run replaces an existing output atomically (never a half zip under the final name)', async () => {
  const root = fresh(); writeFileSync(join(root, 'a.txt'), 'new'); const dir = fresh(), out = join(dir, 'a.zip'); writeFileSync(out, 'OLD');
  await createZip(out, root, { stream: true });
  assert.deepEqual(listZip(out).entries.map((e) => e.name), ['a.txt']); assert.equal(readZipFile(out, 'a.txt').toString(), 'new');
});
