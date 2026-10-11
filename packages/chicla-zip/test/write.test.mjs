// C3.2: behaviour of writeZip that the interoperability matrix does not cover: refusals, atomic output, modes, dates, arguments.
// Assertions use error codes, never message text.
import { writeZip, listZip, ZipError, extractZip, testZip } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkZip, readers } from './interop.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-write-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const out = () => join(dir, `w${n++}.zip`);
const f = (name, s = 'x') => ({ name, data: Buffer.from(s) });
const rejects = async (p, sources, code, opts) => {
  await assert.rejects(writeZip(p, sources, opts), (e) => e instanceof ZipError && e.code === code, `expected ${code}`);
  assert.deepEqual(readdirSync(dir).filter((x) => x.endsWith('.partial')), [], 'a .partial file was left');
};

test('unsafe names are refused before anything is written', async () => {
  for (const name of ['../x', 'a/../../x', '/abs', 'C:x', 'a\\b', 'a\0b', '', '/', 'dir/../']) {
    const p = out(); await rejects(p, [name.endsWith('/') ? { name } : f(name)], 'EUNSAFE');
    assert.throws(() => statSync(p), { code: 'ENOENT' }, `output exists after refusing «${name}»`);
  }
});

test('the same name twice is refused (exact match)', async () => {
  await rejects(out(), [f('a.txt'), f('a.txt', 'y')], 'EDUP');
  const p = out(); await writeZip(p, [f('a.txt'), f('A.txt', 'y')]); // case-folding is the extractor's business (collisions), not an error here
  assert.equal(listZip(p).entries.length, 2);
});

test('bad arguments are refused with EARG', async () => {
  await rejects(out(), 'nope', 'EARG');
  await rejects(out(), [{ data: Buffer.from('x') }], 'EARG');
  await rejects(out(), [{ name: 'a.txt' }], 'EARG');
  await rejects(out(), [{ name: 'a.txt', data: 'a string' }], 'EARG');
  await rejects(out(), [{ name: 'd/', data: Buffer.from('x') }], 'EARG');
  await rejects(out(), [f('a')], 'EARG', { level: 10 });
  await rejects(out(), [f('a')], 'EARG', { level: 1.5 });
  await rejects(out(), [{ ...f('a'), mtime: new Date(NaN) }], 'EARG');
  await rejects(out(), [f('é'.repeat(40_000))], 'EARG'); // 80 000 bytes of name
});

const many = (k) => Array.from({ length: k }, (_, i) => ({ name: `f${i}`, data: Buffer.from(`${i}`) }));
const manyTree = (k) => Object.fromEntries(Array.from({ length: k }, (_, i) => [`f${i}`, `${i}`]));
// Raw look at the file: [{ name, usize, csize, off, extra: Buffer }] from the central directory, and whether a zip64 locator/record is present.
const raw = (p) => {
  const b = readFileSync(p), e = b.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6])), res = { entries: [], plain: { count: b.readUInt16LE(e + 10), cdSize: b.readUInt32LE(e + 12), cdOff: b.readUInt32LE(e + 16) } };
  res.locator = e >= 20 && b.readUInt32LE(e - 20) === 0x07064b50; res.zip64Record = res.locator && b.readUInt32LE(Number(b.readBigUInt64LE(e - 12))) === 0x06064b50;
  let o = res.plain.cdOff === 0xffffffff ? Number(b.readBigUInt64LE(Number(b.readBigUInt64LE(e - 12)) + 48)) : res.plain.cdOff;
  for (let i = 0; i < (res.plain.count === 0xffff ? Number(b.readBigUInt64LE(Number(b.readBigUInt64LE(e - 12)) + 32)) : res.plain.count); i++) {
    const nl = b.readUInt16LE(o + 28), xl = b.readUInt16LE(o + 30);
    res.entries.push({ name: b.subarray(o + 46, o + 46 + nl).toString('utf8'), usize: b.readUInt32LE(o + 24), csize: b.readUInt32LE(o + 20), off: b.readUInt32LE(o + 42), need: b.readUInt16LE(o + 6), extra: b.subarray(o + 46 + nl, o + 46 + nl + xl) });
    o += 46 + nl + xl;
  }
  return res;
};

test('65 535 entries or more switch to zip64 on their own, and every reader agrees', async () => {
  const p = out(); await writeZip(p, many(65_535));
  const r = raw(p); assert.ok(r.zip64Record, 'no zip64 end-of-central-directory record'); assert.equal(r.plain.count, 0xffff); assert.equal(r.entries.length, 65_535);
  // checkZip's own reader opens the zip once per entry (quadratic at this size), so the readers are called one by one here
  const tree = manyTree(65_535);
  for (const t of ['unzip', 'zipinfo', 'python']) { const res = await readers[t](p, tree); assert.ok(res, `${t} did not run`); assert.deepEqual(res.problems, [], t); }
  assert.equal((await testZip(p)).files, 65_535); assert.equal(listZip(p).entries.length, 65_535);
  const q = out(); await writeZip(q, many(65_534)); assert.equal(raw(q).locator, false, 'zip64 records written for 65 534 entries, which fit');
  assert.equal(listZip(q).entries.length, 65_534);
});

test('zip64: false refuses what needs it with EZIP64 and writes nothing', async () => {
  for (const [sources, opts] of [[many(65_535), {}], [[f('big', '0'.repeat(500))], { _limits: { max32: 100 } }], [[f('a', '1'.repeat(80)), f('b', '2'.repeat(80)), f('c')], { level: 0, _limits: { max32: 150 } }], [many(3), { _limits: { max16: 2 } }]]) {
    const p = out(); await rejects(p, sources, 'EZIP64', { zip64: false, ...opts }); assert.throws(() => statSync(p), { code: 'ENOENT' });
  }
  const p = out(); await writeZip(p, many(10), { zip64: false }); assert.equal(raw(p).locator, false); // nothing needs it: fine
});

test('a size above the limit gets zip64 sizes in the local and central headers; an offset above it gets the offset; the rest stays plain', async () => {
  const noise = Buffer.alloc(300); for (let i = 0; i < 300; i++) noise[i] = (i * 7919) & 255;
  const sources = [{ name: 'zeros', data: Buffer.alloc(500) }, { name: 'noise.png', data: noise }, f('tiny', 'x'), f('tiny2', 'y')], p = out();
  await writeZip(p, sources, { _limits: { max32: 100 } });
  const r = raw(p), by = Object.fromEntries(r.entries.map((e) => [e.name, e]));
  assert.equal(by.zeros.usize, 0xffffffff); assert.equal(by.zeros.csize, 0xffffffff); assert.equal(by.zeros.off, 0); assert.equal(by.zeros.extra.length, 20); assert.equal(by.zeros.need, 45);
  assert.equal(by['noise.png'].usize, 0xffffffff); assert.equal(by['noise.png'].off, 63); assert.equal(by['noise.png'].extra.length, 20); // sizes only: its offset (63) still fits
  assert.equal(by.tiny.usize, 1); assert.equal(by.tiny.csize, 1); assert.equal(by.tiny.off, 0xffffffff); assert.equal(by.tiny.extra.length, 12); assert.equal(by.tiny.need, 45); // offset only (422 > 100)
  assert.equal(by.tiny2.off, 0xffffffff); assert.equal(by.tiny2.extra.length, 12);
  assert.ok(r.locator && r.zip64Record); assert.equal(r.plain.cdOff, 0xffffffff); assert.equal(r.plain.cdSize, 0xffffffff);
  const b = readFileSync(p), nl = b.readUInt16LE(26); // local header of «zeros»: sizes are markers and the extra holds usize then csize
  assert.equal(b.readUInt32LE(18), 0xffffffff); assert.equal(b.readUInt32LE(22), 0xffffffff); assert.equal(b.readUInt16LE(28), 20);
  assert.equal(b.readUInt16LE(30 + nl), 1); assert.equal(b.readUInt16LE(32 + nl), 16);
  assert.equal(Number(b.readBigUInt64LE(34 + nl)), 500); assert.equal(Number(b.readBigUInt64LE(42 + nl)), listZip(p).entries[0].csize);
  const c = await checkZip(p, { zeros: Buffer.alloc(500), 'noise.png': noise, tiny: 'x', tiny2: 'y' }); assert.deepEqual(c.problems, []);
  const dest = join(dir, `x${n++}`); await extractZip(p, dest);
  assert.deepEqual(readFileSync(join(dest, 'noise.png')), noise); assert.equal(readFileSync(join(dest, 'tiny2'), 'utf8'), 'y');
});

test('each trigger alone: entry count, central directory offset, central directory size', async () => {
  const noise80 = Buffer.alloc(80); for (let i = 0; i < 80; i++) noise80[i] = (i * 131 + 7) & 255;
  // count only (limit 2 entries): the plain count is the marker, the real count is in the zip64 record
  const a = out(); await writeZip(a, many(3), { _limits: { max16: 2 } }); const ra = raw(a);
  assert.ok(ra.zip64Record); assert.equal(ra.plain.count, 0xffff); assert.equal(ra.entries.length, 3); assert.notEqual(ra.plain.cdOff, 0xffffffff); assert.notEqual(ra.plain.cdSize, 0xffffffff);
  assert.deepEqual((await checkZip(a, manyTree(3))).problems, []);
  // offset only: one stored 80-byte file puts the central directory past 100 bytes, while its size and the directory's size stay under
  const o = out(); await writeZip(o, [{ name: 'n.png', data: noise80 }], { _limits: { max32: 100 } }); const ro = raw(o);
  assert.ok(ro.zip64Record); assert.equal(ro.plain.cdOff, 0xffffffff); assert.notEqual(ro.plain.cdSize, 0xffffffff); assert.equal(ro.entries[0].usize, 80); assert.equal(ro.entries[0].extra.length, 0);
  assert.deepEqual((await checkZip(o, { 'n.png': noise80 })).problems, []);
  // directory size only: three empty files keep the offset at 93, their central records add up to more than 100
  const s = out(); await writeZip(s, [f('a', ''), f('b', ''), f('c', '')], { _limits: { max32: 100 } }); const rs = raw(s);
  assert.ok(rs.zip64Record); assert.equal(rs.plain.cdSize, 0xffffffff); assert.equal(rs.plain.cdOff, 93); assert.equal(rs.plain.count, 3);
  assert.deepEqual((await checkZip(s, { a: '', b: '', c: '' })).problems, []);
});

test('a small zip has no zip64 records at all; zip64: true puts them everywhere and the readers still agree', async () => {
  const tree = { 'a.txt': 'hello', 'dir/': '', 'dir/b.txt': 'b'.repeat(2000) }, srcs = Object.entries(tree).map(([name, v]) => (name.endsWith('/') ? { name } : f(name, v)));
  const p = out(); await writeZip(p, srcs); const r = raw(p); assert.equal(r.locator, false); assert.ok(r.entries.every((e) => e.extra.length === 0 && e.need <= 20));
  const q = out(); await writeZip(q, srcs, { zip64: true }); const s = raw(q);
  assert.ok(s.zip64Record); assert.ok(s.entries.every((e) => e.usize === 0xffffffff && e.csize === 0xffffffff && e.extra.length === 20 && e.need === 45));
  const c = await checkZip(q, tree); assert.deepEqual(c.problems, []); for (const t of ['unzip', 'zipinfo', 'python', 'chicla']) assert.ok(c.ran.includes(t), `${t} did not run`);
  // Non-ASCII names in zip64 entries: Info-ZIP 6.00 prints «caf#U00e9» in a C locale (it does not for plain entries; a display quirk of that
  // tool, not of the file), so zipinfo is left out here and the readers that decode UTF-8 by themselves are used.
  const u = out(), utree = { 'caf\u00e9.txt': 'x', '\u30a2/\u00df': 'y' }; await writeZip(u, Object.entries(utree).map(([name, v]) => f(name, v)), { zip64: true });
  for (const t of ['unzip', 'python', 'chicla']) { const res = await readers[t](u, utree); assert.ok(res, `${t} did not run`); assert.deepEqual(res.problems, [], t); }
});

test('big data is compressed and checksummed in blocks (here forced with a tiny block size): same CRC, right sizes, every reader agrees', async () => {
  // Real bug found with a 4.4 GB file: Node's one-shot deflate wraps the length modulo 2^32 and the zip still passed unzip -t and Python.
  const noise = Buffer.alloc(30_000); for (let i = 0, x = 99; i < noise.length; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; noise[i] = x >>> 24; }
  const text = Buffer.from('chicla zip block test, '.repeat(5000)), tree = { 'text.txt': text, 'noise.bin': noise, 'tiny': 'x', 'seven': '1234567' };
  const srcs = Object.entries(tree).map(([name, v]) => ({ name, data: Buffer.from(v) })), a = out(), b = out();
  const ra = await writeZip(a, srcs), rb = await writeZip(b, srcs, { _limits: { chunk: 1000 } });
  assert.deepEqual(rb.entries.map((e) => [e.name, e.method, e.size, e.crc32]), ra.entries.map((e) => [e.name, e.method, e.size, e.crc32]));
  const by = Object.fromEntries(rb.entries.map((e) => [e.name, e])); assert.equal(by['text.txt'].method, 8); assert.ok(by['text.txt'].csize < 2000); assert.equal(by['noise.bin'].method, 0); assert.equal(by['noise.bin'].csize, 30_000);
  const c = await checkZip(b, tree); assert.deepEqual(c.problems, []); for (const t of ['unzip', 'zipinfo', 'python', 'chicla']) assert.ok(c.ran.includes(t), `${t} did not run`);
  assert.equal((await testZip(b)).files, 4);
});

test('bad zip64 option is refused with EARG', async () => { await rejects(out(), [f('a')], 'EARG', { zip64: 'yes' }); });

test('a failure leaves an existing output untouched and no .partial; success replaces it atomically', async () => {
  const p = out(); await writeZip(p, [f('old.txt', 'old')]);
  const before = readFileSync(p);
  await rejects(p, [f('../bad')], 'EUNSAFE');
  assert.deepEqual(readFileSync(p), before);
  await writeZip(p, [f('new.txt', 'new')]);
  assert.deepEqual(listZip(p).entries.map((e) => e.name), ['new.txt']);
  assert.deepEqual(readdirSync(dir).filter((x) => x.endsWith('.partial')), []);
});

test('an output path that cannot be written fails with a ZipError and leaves nothing', async () => {
  await assert.rejects(writeZip(join(dir, 'no', 'such', 'folder', 'x.zip'), [f('a')]), (e) => e instanceof ZipError && e.code === 'ENOENT');
  const asDir = join(dir, 'isdir.zip'); mkdirSync(asDir);
  await assert.rejects(writeZip(asDir, [f('a')]), (e) => e instanceof ZipError);
  assert.deepEqual(readdirSync(dir).filter((x) => x.endsWith('.partial')), []);
});

test('zero entries gives a valid empty zip', async () => {
  const p = out(); const r = await writeZip(p, []);
  assert.equal(r.bytes, 22); assert.equal(listZip(p).entries.length, 0);
  assert.equal(spawnSync('python3', ['-c', 'import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1]); assert z.namelist()==[] and z.testzip() is None', p]).status, 0);
});

test('returned entries describe what was written; Uint8Array input works', async () => {
  const p = out(), u8 = new Uint8Array([1, 2, 3, 4, 5]), r = await writeZip(p, [{ name: 'u.bin', data: u8 }, { name: 'z.txt', data: Buffer.alloc(10_000) }, { name: 'd/' }]);
  const by = Object.fromEntries(listZip(p).entries.map((e) => [e.name, e]));
  assert.deepEqual(r.entries.map((e) => [e.name, e.method, e.size]), [['u.bin', 0, 5], ['z.txt', 8, 10_000], ['d/', 0, 0]]);
  for (const e of r.entries) { assert.equal(by[e.name].csize, e.csize); assert.equal(by[e.name].usize, e.size); }
  assert.equal(r.bytes, statSync(p).size);
  const dest = join(dir, `x${n++}`); await extractZip(p, dest);
  assert.deepEqual(readFileSync(join(dest, 'u.bin')), Buffer.from(u8));
});

test('already-compressed extensions are stored; level 0 stores everything', async () => {
  const p = out(); await writeZip(p, [f('a.png', '0'.repeat(5000)), f('b.txt', '0'.repeat(5000))]);
  const by = Object.fromEntries(listZip(p).entries.map((e) => [e.name, e]));
  assert.equal(by['a.png'].method, 0); assert.equal(by['b.txt'].method, 8);
  const q = out(); await writeZip(q, [f('b.txt', '0'.repeat(5000))], { level: 0 });
  assert.equal(listZip(q).entries[0].method, 0);
});

test('modes: permission bits only (no setuid/setgid/sticky), folders flagged as folders', async () => {
  const p = out(); await writeZip(p, [{ ...f('run.sh'), mode: 0o4755 }, f('plain'), { name: 'd/', mode: 0o2775 }]);
  const py = spawnSync('python3', ['-c', 'import sys,zipfile,json\nprint(json.dumps({i.filename:[i.external_attr>>16, i.is_dir(), bool(i.external_attr & 0x10)] for i in zipfile.ZipFile(sys.argv[1]).infolist()}))', p], { encoding: 'utf8' });
  const m = JSON.parse(py.stdout);
  assert.deepEqual(m['run.sh'], [0o100755, false, false]); assert.deepEqual(m.plain, [0o100644, false, false]); assert.deepEqual(m['d/'], [0o040775, true, true]);
});

test('dates: kept to the second pair, clamped to 1980 to 2107, read back by unzip-compatible readers', async () => {
  const p = out(), d = new Date(2024, 4, 17, 13, 45, 31);
  await writeZip(p, [{ ...f('a'), mtime: d }, { ...f('old'), mtime: new Date(1970, 0, 1) }, { ...f('far'), mtime: new Date(2200, 5, 5) }]);
  const py = spawnSync('python3', ['-c', 'import sys,zipfile,json\nprint(json.dumps({i.filename:list(i.date_time) for i in zipfile.ZipFile(sys.argv[1]).infolist()}))', p], { encoding: 'utf8' });
  const m = JSON.parse(py.stdout);
  assert.deepEqual(m.a, [2024, 5, 17, 13, 45, 30]); // DOS time has a 2-second resolution (31 -> 30)
  assert.deepEqual(m.old, [1980, 1, 1, 0, 0, 0]); assert.deepEqual(m.far.slice(0, 3), [2107, 12, 31]);
});

test('names are written as given: NFC and NFD stay different, no normalisation, bit 11 only when needed', async () => {
  const p = out(); await writeZip(p, [f('café'), f('café'), f('ascii')]);
  const names = listZip(p).entries.map((e) => e.name);
  assert.deepEqual(names, ['café', 'café', 'ascii']); assert.notEqual(names[0], names[1]);
  const py = spawnSync('python3', ['-c', 'import sys,zipfile,json\nprint(json.dumps([i.flag_bits & 0x800 != 0 for i in zipfile.ZipFile(sys.argv[1]).infolist()]))', p], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(py.stdout), [true, true, false]);
});
