// C4.1: markUtf8Names sets bit 11 (UTF-8 names) on the entries whose non-ASCII name is valid UTF-8 and has no flag (what Info-ZIP's `zip` writes).
// ROADMAP §13 B1: it used to write the central-directory flag at `cdPos + 8`, an offset relative to the central directory, not to the file,
// so it overwrote the method field of the first local header and corrupted the zip.
// Contract under test:
//   - only the 2 flag bytes of the local header and the 2 of the central entry change, only by bit 0x0800, and only for entries that are non-ASCII, valid
//     UTF-8 and unflagged; every other byte of the file (data, sizes, CRC, method, ASCII names, names that are not UTF-8, already flagged entries) is identical;
//   - returns { patched, total }; a second run patches 0 and leaves the bytes untouched (idempotent);
//   - an independent reader (Info-ZIP `unzip -t`, Python `zipfile`) accepts the result and reads the names as UTF-8 (before, Python reads them as CP437);
//   - works when the central directory is found through zip64 records and when an entry's local offset sits in the zip64 extra;
//   - a bad local header or an offset outside the file is a ZipError and NOTHING is written (the file stays byte-identical); a non-zip is ENOTZIP.
// Assertions use values and error codes, never message text. Linux and macOS only (unzip).
import { markUtf8Names, listZip, readZipFile, testZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';
import { checkZip } from './interop.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-mark-')); });
after(() => { rmSync(base, { recursive: true, force: true }); });
const put = (bytes) => { const p = join(base, `t${n++}.zip`); writeFileSync(p, bytes); return p; };
const LATIN1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x2e, 0x74, 0x78, 0x74]); // «café.txt» in Latin-1: not valid UTF-8
const body = 'hello hello hello hello hello hello hello hello';

// Positions of the flag fields (local +6, central +8), found independently of the code under test by walking the central directory.
const flagPositions = (buf) => {
  const eo = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), cdOff = buf.readUInt32LE(eo + 16), total = buf.readUInt16LE(eo + 10), out = [];
  let p = cdOff;
  for (let i = 0; i < total; i++) {
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    out.push({ central: p + 8, local: buf.readUInt32LE(p + 42) + 6 }); p += 46 + nl + xl + cl;
  }
  return out;
};
const changed = (a, b) => { assert.equal(a.length, b.length); const out = []; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(i); return out; };

test('single entry: the zip is not corrupted (B1) and the name reads as UTF-8 in independent readers', async () => {
  const p = put(buildZip([{ name: 'café.txt', data: body, method: 8 }]));
  const r = markUtf8Names(p);
  assert.deepEqual(r, { patched: 1, total: 1 });
  await testZip(p);
  const rep = await checkZip(p, { 'café.txt': body });
  assert.deepEqual(rep.problems, []);
  assert.ok(rep.ran.includes('chicla'));
  assert.equal(listZip(p).entries[0].flagMissing, false);
});

test('before the repair Python reads the name as CP437, after it as UTF-8 (so the check above is not vacuous)', async () => {
  const p = put(buildZip([{ name: 'café.txt', data: body }]));
  const before = await checkZip(p, { 'café.txt': body });
  if (before.result.python.ran) assert.notDeepEqual(before.result.python.problems, [], 'python should disagree on the name before the flag');
  markUtf8Names(p);
  const after = await checkZip(p, { 'café.txt': body });
  assert.deepEqual(after.problems, []);
});

test('only the 4 flag bytes of each patched entry change, and only bit 11', () => {
  const entries = [
    { name: 'a.txt', data: body, method: 8 },
    { name: 'café.txt', data: body, method: 8 },
    { name: LATIN1, data: body },
    { name: 'ünï/', dir: true },
    { name: '日本語.txt', data: 'x', flags: 0x0002 },
    { name: 'ok-é.txt', data: 'y', flags: 0x0800 },
  ];
  const buf = buildZip(entries), p = put(buf), pos = flagPositions(buf);
  const r = markUtf8Names(p);
  assert.deepEqual(r, { patched: 3, total: 6 });
  const after = readFileSync(p), diff = changed(buf, after);
  const expected = [1, 3, 4].flatMap((i) => [pos[i].local, pos[i].central]).sort((x, y) => x - y);
  const flat = [...new Set(diff.map((d) => d))];
  assert.ok(flat.every((d) => expected.includes(d) || expected.includes(d - 1)), 'a byte outside the flag fields changed');
  for (const i of [1, 3, 4]) for (const at of [pos[i].local, pos[i].central]) assert.equal(after.readUInt16LE(at), buf.readUInt16LE(at) | 0x0800);
  for (const i of [0, 2, 5]) for (const at of [pos[i].local, pos[i].central]) assert.equal(after.readUInt16LE(at), buf.readUInt16LE(at));
  assert.equal(after.readUInt16LE(pos[4].central), 0x0802, 'other flag bits are kept');
});

test('data stays intact and the entries read back the same', () => {
  const p = put(buildZip([{ name: 'a.txt', data: 'one', method: 8 }, { name: 'é.txt', data: body, method: 8 }, { name: 'ü.txt', data: 'three' }]));
  markUtf8Names(p);
  assert.equal(readZipFile(p, 'a.txt').toString(), 'one');
  assert.equal(readZipFile(p, 'é.txt').toString(), body);
  assert.equal(readZipFile(p, 'ü.txt').toString(), 'three');
});

test('idempotent: the second run patches 0 and changes no byte', () => {
  const p = put(buildZip([{ name: 'café.txt', data: body, method: 8 }, { name: 'b.txt', data: 'b' }]));
  markUtf8Names(p); const once = readFileSync(p);
  assert.deepEqual(markUtf8Names(p), { patched: 0, total: 2 });
  assert.deepEqual(readFileSync(p), once);
});

test('nothing to patch: ASCII, non-UTF-8 and flagged names leave the file byte-identical', () => {
  const buf = buildZip([{ name: 'a.txt', data: 'a' }, { name: LATIN1, data: 'b' }, { name: 'é.txt', data: 'c', flags: 0x0800 }]), p = put(buf);
  assert.deepEqual(markUtf8Names(p), { patched: 0, total: 3 });
  assert.deepEqual(readFileSync(p), buf);
});

test('an empty zip is fine', () => {
  const buf = buildZip([]), p = put(buf);
  assert.deepEqual(markUtf8Names(p), { patched: 0, total: 0 });
  assert.deepEqual(readFileSync(p), buf);
});

test('zip64 end records: the central directory is found through the locator', async () => {
  const p = put(buildZip([{ name: 'café.txt', data: body, method: 8 }, { name: 'é2.txt', data: 'z' }], { zip64Eocd: true }));
  assert.deepEqual(markUtf8Names(p), { patched: 2, total: 2 });
  await testZip(p);
  const rep = await checkZip(p, { 'café.txt': body, 'é2.txt': 'z' });
  assert.deepEqual(rep.problems, []);
});

test('zip64 local offset in the extra field of the entry', async () => {
  const p = put(buildZip([{ name: 'a.txt', data: 'a' }, { name: 'café.txt', data: body, method: 8, zip64: { fields: ['offset'] } }]));
  assert.deepEqual(markUtf8Names(p), { patched: 1, total: 2 });
  await testZip(p);
  // Known (ROADMAP risks): Info-ZIP 6.00 in a non-UTF-8 locale mangles non-ASCII names of entries with a zip64 extra and exits 1; the zip is fine.
  const was = process.env.LC_ALL; process.env.LC_ALL = 'C.UTF-8';
  try { const rep = await checkZip(p, { 'a.txt': 'a', 'café.txt': body }); assert.deepEqual(rep.problems, []); }
  finally { if (was === undefined) delete process.env.LC_ALL; else process.env.LC_ALL = was; }
});

test('one patched entry changes exactly 2 bytes of the file (high byte of the two flag fields)', () => {
  const buf = buildZip([{ name: 'é.txt', data: 'q' }]), p = put(buf);
  markUtf8Names(p);
  assert.equal(changed(buf, readFileSync(p)).length, 2);
});

test('a bad local header is a ZipError and nothing is written, even for the entries before it', () => {
  const buf = buildZip([{ name: 'é1.txt', data: 'one' }, { name: 'é2.txt', data: 'two' }]);
  const second = flagPositions(buf)[1].local - 6;
  buf.writeUInt32LE(0xdeadbeef, second);
  const p = put(buf);
  assert.throws(() => markUtf8Names(p), (e) => e instanceof ZipError);
  assert.deepEqual(readFileSync(p), buf);
});

test('a local offset outside the file is a ZipError and nothing is written', () => {
  const buf = buildZip([{ name: 'é.txt', data: 'one', zip64: { fields: ['offset'], values: { offset: 1 << 30 } } }]), p = put(buf);
  assert.throws(() => markUtf8Names(p), (e) => e instanceof ZipError);
  assert.deepEqual(readFileSync(p), buf);
});

test('not a zip: ENOTZIP, file untouched', () => {
  const buf = Buffer.from('this is not a zip file at all, just some text'), p = put(buf);
  assert.throws(() => markUtf8Names(p), (e) => e instanceof ZipError && e.code === 'ENOTZIP');
  assert.deepEqual(readFileSync(p), buf);
});

test('a local offset whose header would run past the end of the file is a ZipError and nothing is written', () => {
  // A valid local signature hidden in the zip comment, 9 bytes before the end: the 30-byte header cannot fit.
  const raw = buildZip([{ name: 'é.txt', data: 'one', zip64: { fields: ['offset'], values: { offset: 0 } } }]);
  const tail = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(5)]);
  const buf = Buffer.concat([raw, tail]); buf.writeUInt16LE(tail.length, raw.length - 2); // comment length in the end record
  const at = buf.length - tail.length, z = buf.indexOf(Buffer.from([0x01, 0x00, 0x08, 0x00])); // zip64 extra of the entry: id 1, 8 data bytes
  buf.writeBigUInt64LE(BigInt(at), z + 4);
  const p = put(buf);
  assert.throws(() => markUtf8Names(p), (e) => e instanceof ZipError);
  assert.deepEqual(readFileSync(p), buf);
});
