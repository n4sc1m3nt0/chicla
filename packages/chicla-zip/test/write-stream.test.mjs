// C3.7: writeZipStream(sink, sources, opts) -> Promise<{ entries, bytes }>: the zip goes to a Node Writable (a file, a socket, stdout, a pipe), not to a path,
// and a file's data never has to be in memory whole. PROPOSED API (D29), written as tests first:
//   - `sink`: a Writable. It is ENDED (and awaited until 'finish') on success; on any failure it is destroyed, so no half-zip looks finished.
//   - sources: [{ name, data }] (Buffer / Uint8Array), [{ name, stream }] (an async or sync iterable of Buffer / Uint8Array chunks, a Readable, or a function
//     returning one, called only when the writer reaches that entry), and folders [{ name: 'dir/' }]; `mtime` and `mode` as in writeZip.
//   - every FILE entry is streamed: general-purpose bit 3 set, local header with crc and sizes 0 plus a zero zip64 extra, deflate (method 8) always (level 0 and
//     already-compressed names such as .zip/.jpg use deflate with stored blocks, because a stored entry with a data descriptor cannot be streamed), a 24-byte
//     descriptor after the data (signature 0x08074b50, crc32, csize u64, usize u64); sizes are unknown up front, so file entries are zip64 and `zip64: false` is EZIP64.
//   - folders are written as in writeZip (no descriptor, no zip64). The central directory is written at the end from metadata only.
//   - options as writeZip: level, zip64 ("auto" | true | false), deterministic, epoch, sha256, extendedTime; and `_limits` (tests only: max16, max32).
//   - errors (codes, never message text): EARG, EUNSAFE, EDUP, EZIP64 (all before one byte is written), ESOURCE (a source stream failed: the cause is kept) and EZIP
//     (the sink failed). Backpressure is honoured: the writer never runs ahead of a slow sink.
// Independent readers: unzip, zipinfo, Python zipfile and the Chicla reader (interop.mjs); a raw parse of the headers that does not use the Chicla reader.
import { writeZipStream, writeZip, extractZip, readZipFile, ZipError } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Writable, Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, createWriteStream, createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkZip, readers } from './interop.mjs';

let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-stream-')); });
after(() => { rmSync(base, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const fresh = () => join(base, `t${n++}`);
const noise = (len, seed = 1) => { const b = Buffer.alloc(len); let x = seed; for (let i = 0; i < len; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; b[i] = x >>> 24; } return b; };
const sha = (b) => createHash('sha256').update(b).digest('hex');
const code = (c) => (e) => e instanceof ZipError && e.code === c;

// a sink that keeps everything in memory
const memSink = (opts = {}) => { const parts = []; const w = new Writable({ ...opts, write(c, _e, cb) { parts.push(c); cb(); } }); w.bytes = () => Buffer.concat(parts); return w; };
const toBuffer = async (sources, opts) => { const s = memSink(); const r = await writeZipStream(s, sources, opts); return { buf: s.bytes(), ...r, sink: s }; };
const toFile = async (sources, opts) => { const p = fresh(), s = createWriteStream(p); const r = await writeZipStream(s, sources, opts); return { p, ...r }; };
async function* chunks(buf, size) { for (let o = 0; o < buf.length; o += size) yield buf.subarray(o, o + size); }

// Raw parse of the headers, independent of the Chicla reader. Returns [{ name, flags, method, local: { crc, csize, usize, extra }, central: { crc, csize, usize, offset }, desc }]
const raw = (b) => {
  let e = b.length - 22; while (b.readUInt32LE(e) !== 0x06054b50) e--;
  let cd = b.readUInt32LE(e + 16), count = b.readUInt16LE(e + 10);
  if (b.readUInt32LE(e - 20) === 0x07064b50) { const z = Number(b.readBigUInt64LE(e - 12)); count = Number(b.readBigUInt64LE(z + 32)); cd = Number(b.readBigUInt64LE(z + 48)); }
  const out = [];
  for (let i = 0; i < count; i++) {
    const flags = b.readUInt16LE(cd + 8), method = b.readUInt16LE(cd + 10), nl = b.readUInt16LE(cd + 28), xl = b.readUInt16LE(cd + 30), cl = b.readUInt16LE(cd + 32);
    const c = { need: b.readUInt16LE(cd + 6), crc: b.readUInt32LE(cd + 16), csize: b.readUInt32LE(cd + 20), usize: b.readUInt32LE(cd + 24), offset: b.readUInt32LE(cd + 42) };
    const name = b.toString('utf8', cd + 46, cd + 46 + nl); let x = cd + 46 + nl; const xe = x + xl;
    while (x + 4 <= xe) { const id = b.readUInt16LE(x), len = b.readUInt16LE(x + 2); if (id === 1) { let o = x + 4; if (c.usize === 0xffffffff) { c.usize = Number(b.readBigUInt64LE(o)); o += 8; } if (c.csize === 0xffffffff) { c.csize = Number(b.readBigUInt64LE(o)); o += 8; } if (c.offset === 0xffffffff) c.offset = Number(b.readBigUInt64LE(o)); } x += 4 + len; }
    const l = c.offset, lnl = b.readUInt16LE(l + 26), lxl = b.readUInt16LE(l + 28);
    const local = { crc: b.readUInt32LE(l + 14), csize: b.readUInt32LE(l + 18), usize: b.readUInt32LE(l + 22), extra: b.subarray(l + 30 + lnl, l + 30 + lnl + lxl), flags: b.readUInt16LE(l + 6), need: b.readUInt16LE(l + 4) };
    let desc; if (flags & 8) { const d = l + 30 + lnl + lxl + c.csize; desc = { sig: b.readUInt32LE(d), crc: b.readUInt32LE(d + 4), csize: Number(b.readBigUInt64LE(d + 8)), usize: Number(b.readBigUInt64LE(d + 16)), end: d + 24 }; }
    out.push({ name, flags, method, local, central: c, desc, cdAt: cd });
    cd += 46 + nl + xl + cl;
  }
  return out;
};

// ---- the contract on the wire ----
test('files are streamed: bit 3, local crc and sizes 0 with a zero zip64 extra, deflate, a 24-byte descriptor with the true crc and sizes; folders are plain', async () => {
  const data = Buffer.from('chicla '.repeat(2000));
  const { buf, entries } = await toBuffer([{ name: 'dir/' }, { name: 'dir/a.txt', stream: chunks(data, 777) }, { name: 'b.bin', data: noise(5000) }, { name: 'empty', stream: [] }]);
  const r = Object.fromEntries(raw(buf).map((x) => [x.name, x]));
  assert.equal(r['dir/'].flags & 8, 0); assert.equal(r['dir/'].desc, undefined); assert.equal(r['dir/'].local.extra.length, 0); assert.equal(r['dir/'].central.need, 20); assert.equal(r['dir/'].local.need, 20);
  for (const f of ['dir/a.txt', 'b.bin', 'empty']) {
    const x = r[f]; assert.equal(x.flags & 8, 8, `${f}: bit 3`); assert.equal(x.local.flags & 8, 8);
    assert.equal(x.method, 8, `${f}: deflate`); assert.equal(x.local.need, 45); assert.equal(x.central.need, 45, `${f}: central version needed`);
    assert.deepEqual([x.local.crc, x.local.csize, x.local.usize], [0, 0, 0]);
    assert.deepEqual(x.local.extra, Buffer.concat([Buffer.from([1, 0, 16, 0]), Buffer.alloc(16)]), `${f}: zero zip64 extra`);
    assert.equal(x.desc.sig, 0x08074b50); assert.equal(x.desc.crc, x.central.crc); assert.equal(x.desc.csize, x.central.csize); assert.equal(x.desc.usize, x.central.usize);
  }
  assert.equal(r['dir/a.txt'].central.usize, data.length); assert.equal(r['b.bin'].central.usize, 5000); assert.equal(r.empty.central.usize, 0);
  assert.equal(r['dir/a.txt'].central.crc >>> 0, entries.find((e) => e.name === 'dir/a.txt').crc32);
});

test('readers agree (unzip, zipinfo, Python zipfile, Chicla): mixed sources, empty file, folder, non-ASCII names, incompressible data, a file read from disk', async () => {
  const big = noise(900_000, 7), disk = fresh(); writeFileSync(disk, 'from disk '.repeat(40_000));
  const tree = { 'a.txt': 'hello', 'empty': '', 'dir/': '', 'dir/b.txt': 'x'.repeat(100_000), 'disk.txt': readFileSync(disk) }, utree = { 'caf\u00e9.txt': 'nfc', 'cafe\u0301.txt': 'nfd', '\u30a2/\u00df.bin': big };
  const sources = [
    { name: 'a.txt', data: Buffer.from('hello') }, { name: 'empty', stream: (async function* () {})() }, { name: 'dir/' }, { name: 'dir/b.txt', stream: chunks(Buffer.from('x'.repeat(100_000)), 4096) },
    { name: 'caf\u00e9.txt', data: Buffer.from('nfc') }, { name: 'cafe\u0301.txt', stream: Readable.from([Buffer.from('nfd')]) }, { name: '\u30a2/\u00df.bin', stream: chunks(big, 65_536) },
    { name: 'disk.txt', stream: () => createReadStream(disk) },
  ];
  const pick = (names) => sources.filter((x) => names.includes(x.name)), ascii = Object.keys(tree), wide = Object.keys(utree);
  const { p } = await toFile(sources.filter((x) => ascii.includes(x.name)));
  const c = await checkZip(p, tree);
  assert.deepEqual(c.problems, []);
  for (const t of ['unzip', 'zipinfo', 'python', 'chicla']) assert.ok(c.ran.includes(t), `${t} did not run`);
  // Non-ASCII names: file entries are always zip64 here, and Info-ZIP 6.00 shows «caf#U00e9» for those in a C locale (a display quirk of that tool, see
  // ROADMAP risks, same as writeZip with zip64: true), so zipinfo is left out and the readers that decode UTF-8 by themselves are used.
  const u = await toFile(pick(wide));
  for (const t of ['unzip', 'python', 'chicla']) { const res = await readers[t](u.p, utree); assert.ok(res, `${t} did not run`); assert.deepEqual(res.problems, [], t); }
});

test('the Chicla extractor gives back byte for byte what was streamed (round trip)', async () => {
  const big = noise(300_000, 3), { p } = await toFile([{ name: 'x/big.bin', stream: chunks(big, 10_000) }, { name: 'x/t.txt', data: Buffer.from('t') }]), dest = fresh();
  await extractZip(p, dest);
  assert.deepEqual(readFileSync(join(dest, 'x/big.bin')), big); assert.equal(readFileSync(join(dest, 'x/t.txt'), 'utf8'), 't');
});

test('what is returned: entries with name, method, size, csize and crc32 (sha256 only for files and only when asked), and bytes = what the sink got', async () => {
  const data = noise(50_000, 9), srcs = () => [{ name: 'd/' }, { name: 'f', stream: chunks(data, 999) }];
  const a = await toBuffer(srcs()); assert.equal(a.bytes, a.buf.length);
  assert.deepEqual(a.entries.map((e) => [e.name, e.size]), [['d/', 0], ['f', 50_000]]);
  assert.equal(a.entries[1].method, 8); assert.equal(a.entries[1].csize, raw(a.buf)[1].central.csize); assert.equal('sha256' in a.entries[1], false);
  const b = await toBuffer(srcs(), { sha256: true }); assert.equal(b.entries[1].sha256, sha(data)); assert.equal('sha256' in b.entries[0], false);
});

test('the sink is ended and awaited on success', async () => {
  const s = memSink(); await writeZipStream(s, [{ name: 'a', data: Buffer.from('a') }]);
  assert.equal(s.writableFinished, true);
});

test('no sources: a valid empty zip; only folders: valid too', async () => {
  const e = await toFile([]); assert.equal(readFileSync(e.p).length, 22, 'an empty zip is just the end record');
  const py = spawnSync('python3', ['-c', 'import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nprint(len(z.namelist()), z.testzip())', e.p], { encoding: 'utf8' }); assert.equal(py.stdout.trim(), '0 None', py.stderr); // unzip -t exits 1 for an empty archive, by design
  const q = await toFile([{ name: 'a/' }, { name: 'a/b/' }]); assert.deepEqual((await checkZip(q.p, { 'a/': '', 'a/b/': '' })).problems, []);
});

// ---- properties ----
test('the bytes do not depend on how the source is cut into chunks (deterministic: true)', async () => {
  const data = Buffer.concat([noise(200_000, 5), Buffer.alloc(300_000), Buffer.from('tail '.repeat(10_000))]);
  const o = { deterministic: true, epoch: 1_700_000_000 };
  const one = await toBuffer([{ name: 'f', data }], o), many = await toBuffer([{ name: 'f', stream: chunks(data, 1000) }], o), odd = await toBuffer([{ name: 'f', stream: chunks(data, 65_537) }], o);
  assert.ok(one.buf.equals(many.buf), '1 chunk vs 1000-byte chunks'); assert.ok(one.buf.equals(odd.buf), '1 chunk vs 65 537-byte chunks');
  const again = await toBuffer([{ name: 'f', data }], o); assert.ok(one.buf.equals(again.buf), 'same input, same bytes');
});

test('deterministic dates: the DOS stamp is read in UTC from epoch (which wins over mtime), in the local header and in the central entry, files and folders', async () => {
  const want = { date: ((2023 - 1980) << 9) | (11 << 5) | 14, time: (22 << 11) | (13 << 5) | (20 >> 1) }; // 2023-11-14 22:13:20 UTC = epoch 1 700 000 000
  const { buf } = await toBuffer([{ name: 'd/' }, { name: 'f', data: Buffer.from('x'), mtime: new Date(0) }], { deterministic: true, epoch: 1_700_000_000 });
  for (const x of raw(buf)) {
    assert.equal(buf.readUInt16LE(x.central.offset + 10), want.time, `${x.name}: local time`); assert.equal(buf.readUInt16LE(x.central.offset + 12), want.date, `${x.name}: local date`);
    assert.equal(buf.readUInt16LE(x.cdAt + 12), want.time, `${x.name}: central time`); assert.equal(buf.readUInt16LE(x.cdAt + 14), want.date, `${x.name}: central date`);
  }
  const m = await toBuffer([{ name: 'f', data: Buffer.from('x'), mtime: new Date(Date.UTC(2001, 1, 3, 4, 5, 6)) }], { deterministic: true }); assert.equal(m.buf.readUInt16LE(raw(m.buf)[0].central.offset + 12), ((2001 - 1980) << 9) | (2 << 5) | 3, 'without epoch the source mtime is used, in UTC');
});

test('level 0 and already-compressed names still use method 8 (stored blocks): a stored entry with a descriptor cannot be streamed', async () => {
  const { buf, p } = await (async () => { const r = await toBuffer([{ name: 'a.txt', data: Buffer.from('plain '.repeat(1000)) }, { name: 'b.zip', data: noise(4000) }], { level: 0 }); const p = fresh(); writeFileSync(p, r.buf); return { ...r, p }; })();
  for (const x of raw(buf)) { assert.equal(x.method, 8, x.name); assert.ok(x.central.csize >= x.central.usize, `${x.name}: level 0 must not compress`); }
  assert.deepEqual((await checkZip(p, { 'a.txt': 'plain '.repeat(1000), 'b.zip': noise(4000) })).problems, []);
  const z = await toBuffer([{ name: 'photo.jpg', data: Buffer.alloc(100_000) }]); assert.ok(raw(z.buf)[0].central.csize >= 100_000, 'a .jpg is not compressed');
});

test('extendedTime and mtime: the UT extra is in the local and the central header of a file, with the exact second', async () => {
  const when = new Date(Date.UTC(2024, 4, 6, 7, 8, 9)), { buf } = await toBuffer([{ name: 'f', stream: chunks(Buffer.from('x'), 1), mtime: when }], { extendedTime: true });
  const x = raw(buf)[0], want = Buffer.alloc(9); want.writeUInt16LE(0x5455, 0); want.writeUInt16LE(5, 2); want[4] = 1; want.writeInt32LE(when.getTime() / 1000, 5);
  assert.deepEqual(x.local.extra.subarray(20), want, 'local UT after the zip64 extra');
  const cx = buf.subarray(x.cdAt + 46 + 1, x.cdAt + 46 + 1 + buf.readUInt16LE(x.cdAt + 30)); assert.ok(cx.includes(want), 'central UT');
  const d = await toBuffer([{ name: 'f', data: Buffer.from('x'), mtime: when }]); assert.equal(raw(d.buf)[0].local.extra.length, 20, 'no UT by default');
});

test('zip64 switches by limits: many entries and offsets past the plain limit are written as zip64 and still read', async () => {
  const srcs = () => Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, stream: chunks(Buffer.from(`file ${i} `.repeat(50)), 64) }));
  const a = await toBuffer(srcs(), { _limits: { max16: 3 } }); const pa = fresh(); writeFileSync(pa, a.buf);
  assert.equal(raw(a.buf).length, 5); assert.deepEqual((await checkZip(pa, Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`f${i}`, `file ${i} `.repeat(50)])))).problems, []);
  const b = await toBuffer(srcs(), { _limits: { max32: 200 } }); const pb = fresh(); writeFileSync(pb, b.buf);
  assert.ok(raw(b.buf).some((x) => x.central.offset > 200), 'offsets past the limit exist'); assert.equal(b.buf.readUInt32LE(raw(b.buf)[4].cdAt + 42), 0xffffffff, 'the offset marker is set');
  assert.deepEqual((await checkZip(pb, Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`f${i}`, `file ${i} `.repeat(50)])))).problems, []);
});

// ---- memory and backpressure ----
test('a big file does not sit in memory: 400 MiB of zeros through a counting sink keeps array-buffer memory flat', async () => {
  const MB = 1 << 20, chunk = Buffer.alloc(MB); let max = 0; const base0 = process.memoryUsage().arrayBuffers;
  async function* gen() { for (let i = 0; i < 400; i++) { max = Math.max(max, process.memoryUsage().arrayBuffers - base0); yield chunk; } }
  let got = 0; const s = new Writable({ write(c, _e, cb) { got += c.length; cb(); } });
  const r = await writeZipStream(s, [{ name: 'zeros', stream: gen() }]);
  assert.equal(r.entries[0].size, 400 * MB); assert.ok(got < 5 * MB, 'zeros compress to almost nothing'); assert.ok(max < 96 * MB, `array buffers grew by ${(max / MB) | 0} MiB`);
});

test('backpressure: with a slow sink the writer never reads far ahead of it (the source may be at most a few chunks in front)', async () => {
  const one = noise(64 * 1024, 11), N = 120; let produced = 0, written = 0, lead = 0;
  async function* gen() { for (let i = 0; i < N; i++) { produced++; lead = Math.max(lead, produced - Math.floor(written / 65_536)); yield one; } }
  const s = new Writable({ highWaterMark: 1024, write(c, _e, cb) { written += c.length; setTimeout(cb, 2); } });
  await writeZipStream(s, [{ name: 'f', stream: gen() }], { level: 0 });
  assert.equal(produced, N); assert.ok(lead < 12, `the source ran ${lead} chunks ahead of the sink`);
});

// ---- refusals and failures ----
test('refusals happen before one byte is written', async () => {
  const cases = [
    ['unsafe name', [{ name: '../x', data: Buffer.alloc(1) }], 'EUNSAFE'], ['absolute name', [{ name: '/x', data: Buffer.alloc(1) }], 'EUNSAFE'],
    ['name twice', [{ name: 'a', data: Buffer.alloc(1) }, { name: 'a', data: Buffer.alloc(1) }], 'EDUP'], ['no name', [{ data: Buffer.alloc(1) }], 'EARG'],
    ['no data and no stream', [{ name: 'a' }], 'EARG'], ['data and stream', [{ name: 'a', data: Buffer.alloc(1), stream: [] }], 'EARG'],
    ['a folder with a stream', [{ name: 'a/', stream: [Buffer.alloc(1)] }], 'EARG'], ['stream is a number', [{ name: 'a', stream: 5 }], 'EARG'],
    ['data is a string', [{ name: 'a', data: 'text' }], 'EARG'], ['name over 65 535 bytes', [{ name: 'a'.repeat(70_000), data: Buffer.alloc(1) }], 'EARG'],
  ];
  for (const [label, src, c] of cases) { const s = memSink(); await assert.rejects(writeZipStream(s, src), code(c), label); assert.equal(s.bytes().length, 0, `${label}: bytes written`); assert.equal(s.destroyed, true, `${label}: sink destroyed`); }
  const s = memSink(); await assert.rejects(writeZipStream(s, 'nope'), code('EARG')); await assert.rejects(writeZipStream({}, []), code('EARG')); await assert.rejects(writeZipStream(null, []), code('EARG'));
  for (const o of [{ level: 10 }, { level: 1.5 }, { zip64: 'yes' }, { sha256: 1 }, { extendedTime: 'y' }, { deterministic: 1 }, { epoch: 5 }, { deterministic: true, epoch: -1 }]) await assert.rejects(writeZipStream(memSink(), [], o), code('EARG'), JSON.stringify(o));
});

test('zip64: false refuses a file entry (its size is unknown up front) with EZIP64, but folders are fine', async () => {
  const s = memSink(); await assert.rejects(writeZipStream(s, [{ name: 'f', data: Buffer.from('x') }], { zip64: false }), code('EZIP64')); assert.equal(s.bytes().length, 0);
  const { buf } = await toBuffer([{ name: 'a/' }], { zip64: false }); assert.equal(raw(buf).length, 1);
  const t = await toBuffer([{ name: 'f', data: Buffer.from('x') }], { zip64: true }); assert.equal(raw(t.buf).length, 1);
});

test('a chunk that is not bytes is EARG and a source that throws is ESOURCE with the cause kept; the sink is destroyed and nothing is claimed as done', async () => {
  async function* bad() { yield Buffer.from('ok'); yield 'a string'; }
  const s1 = memSink(); await assert.rejects(writeZipStream(s1, [{ name: 'f', stream: bad() }]), code('EARG')); assert.equal(s1.destroyed, true); assert.equal(s1.writableFinished, false);
  const boom = new Error('disk fell off'); let closed = false;
  async function* dies() { try { yield Buffer.from('first'); throw boom; } finally { closed = true; } }
  const s2 = memSink(); const e = await writeZipStream(s2, [{ name: 'f', stream: dies() }]).then(() => null, (x) => x);
  assert.ok(e instanceof ZipError && e.code === 'ESOURCE'); assert.equal(e.cause, boom); assert.equal(s2.destroyed, true); assert.equal(s2.writableFinished, false); assert.equal(closed, true);
  const fn = await writeZipStream(memSink(), [{ name: 'f', stream: () => { throw boom; } }]).then(() => null, (x) => x); assert.equal(fn?.code, 'ESOURCE'); assert.equal(fn.cause, boom);
});

test('a sink that fails stops the writer, closes the source and rejects with EZIP (never hangs)', async () => {
  let k = 0, closed = false, pulled = 0; async function* gen() { try { for (let i = 0; i < 10_000; i++) { pulled++; yield noise(64 * 1024, i + 1); } } finally { await new Promise((r) => setTimeout(r, 40)); closed = true; } } // a slow, async cleanup: the writer must wait for it
  const s = new Writable({ highWaterMark: 1, write(_c, _e, cb) { cb(++k >= 12 ? new Error('sink broke') : null); } });
  const e = await Promise.race([writeZipStream(s, [{ name: 'f', stream: gen() }], { level: 0 }).then(() => null, (x) => x), new Promise((r) => setTimeout(() => r('HANG'), 5000))]);
  assert.notEqual(e, 'HANG', 'the writer hung on a failed sink'); assert.ok(e instanceof ZipError && e.code === 'EZIP', String(e?.code)); assert.equal(closed, true, 'the source was not closed'); assert.ok(pulled < 100, `pulled ${pulled} chunks after the sink broke`);
  const d = memSink(); d.destroy(); await assert.rejects(writeZipStream(d, [{ name: 'a', data: Buffer.from('a') }]), code('EZIP'));
});

test('writeZip (to a path) is untouched: same bytes as before for the same sources', async () => {
  const p = fresh(); await writeZip(p, [{ name: 'a.txt', data: Buffer.from('hello hello hello hello') }, { name: 'd/' }], { deterministic: true, epoch: 1_700_000_000 });
  const b = readFileSync(p); assert.equal(createHash('sha256').update(b).digest('hex').length, 64); assert.equal(raw(Buffer.from(b)).every((x) => (x.flags & 8) === 0), true, 'writeZip must not use descriptors');
  assert.equal((await readZipFile(p, 'a.txt')).toString(), 'hello hello hello hello');
});
