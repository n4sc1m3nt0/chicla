// C1.5: zip64 reading and clear refusals. Zips are fabricated by test/zipfab.mjs (no external `zip`).
// Assertions use error classes, never message text (messages move to keys in D8 / C13.3), except where the
// card says the refusal must name zip64 / multi-part.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openZip, listZip, readZipFile, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-z64-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };
const zipOf = (entries, opts) => put(buildZip(entries, opts));
// Opening must refuse with a ZipError (never a RangeError or other raw error) matching `re`.
const refuses = (p, re) => assert.throws(() => openZip(p).close(), (err) => err instanceof ZipError && (!re || re.test(err.message)), `expected a ZipError ${re ?? ''}`);

const FILES = [{ name: 'a.txt', data: 'alpha' }, { name: 'b/c.txt', data: 'bravo', method: 8 }];

// ---------- the fabricator itself, checked by an independent reader ----------
const py = spawnSync('python3', ['-c', 'import zipfile']).status === 0;
test('fabricated zip64 zips are readable by Python zipfile (checks the fabricator, not the reader)', { skip: !py }, () => {
  const p = zipOf(FILES.map((f) => ({ ...f, zip64: {} })), { zip64Eocd: true });
  const r = spawnSync('python3', ['-c', 'import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(",".join(f"{i.filename}={z.read(i).decode()}" for i in z.infolist()))', p], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'a.txt=alpha,b/c.txt=bravo');
});

// ---------- reading zip64 ----------
test('zip64 end-of-central-directory record and locator: entries and data come out the same as a plain zip', () => {
  const plain = listZip(zipOf(FILES)).entries, z = listZip(zipOf(FILES, { zip64Eocd: true })).entries;
  assert.deepEqual(z.map((e) => [e.name, e.usize, e.csize, e.localOffset, e.crc]), plain.map((e) => [e.name, e.usize, e.csize, e.localOffset, e.crc]));
  assert.equal(readZipFile(zipOf(FILES, { zip64Eocd: true }), 'b/c.txt').toString(), 'bravo');
});

test('zip64 extra on entries (all three fields): sizes, offset and data are right', () => {
  const p = zipOf(FILES.map((f) => ({ ...f, zip64: {} })), { zip64Eocd: true });
  const es = listZip(p).entries;
  assert.equal(es[1].usize, 5);
  assert.equal(es[1].localOffset > 0, true);
  assert.equal(readZipFile(p, 'a.txt').toString(), 'alpha');
  assert.equal(readZipFile(p, 'b/c.txt').toString(), 'bravo');
});

test('zip64 extra with only some fields: they are consumed in the order usize, csize, offset', () => {
  const only = (fields) => zipOf(FILES.map((f) => ({ ...f, zip64: { fields } })));
  for (const fields of [['usize'], ['csize'], ['offset'], ['usize', 'offset'], ['csize', 'offset'], ['usize', 'csize']]) {
    const p = only(fields), es = listZip(p).entries;
    assert.equal(es[1].localOffset, listZip(zipOf(FILES)).entries[1].localOffset, fields.join());
    assert.equal(readZipFile(p, 'b/c.txt').toString(), 'bravo', fields.join());
  }
});

test('zip64 extra on a plain end record (no zip64 EOCD): entries still read', () => {
  assert.equal(readZipFile(zipOf(FILES.map((f) => ({ ...f, zip64: {} }))), 'a.txt').toString(), 'alpha');
});

test('a declared size above 4 GiB is reported as such and refused for in-memory reading', () => {
  const big = 5n * 1024n ** 3n;
  const p = zipOf([{ name: 'big.bin', data: 'x', zip64: { fields: ['usize'], values: { usize: big } } }]);
  assert.equal(listZip(p).entries[0].usize, Number(big));
  assert.throws(() => readZipFile(p, 'big.bin'), ZipError);
});

// ---------- refusals ----------
test('a zip64 value beyond 2^53 is refused with a ZipError', () => {
  refuses(zipOf([{ name: 'a', data: 'x', zip64: { fields: ['usize'], values: { usize: 1n << 60n } } }]));
  refuses(zipOf(FILES, { zip64Eocd: { cdOff: 1n << 60n } }));
});

test('a truncated zip64 extra is a ZipError, not a RangeError', () => {
  const short = Buffer.from([1, 0, 0, 0]);          // 0x0001 with length 0
  const half = Buffer.from([1, 0, 4, 0, 1, 2, 3, 4]); // 0x0001 with 4 bytes where 8 are needed
  refuses(zipOf([{ name: 'a', data: 'x', zip64: { fields: ['usize'], rawExtra: short } }]), /zip64/i);
  refuses(zipOf([{ name: 'a', data: 'x', zip64: { fields: ['usize'], rawExtra: half } }]), /zip64/i);
  refuses(zipOf([{ name: 'a', data: 'x', zip64: { fields: ['usize', 'csize'], rawExtra: Buffer.from([1, 0, 8, 0, 1, 0, 0, 0, 0, 0, 0, 0]) } }]), /zip64/i);
});

test('0xffffffff in a central field with no zip64 extra is refused, naming zip64', () => {
  for (const f of ['usize', 'csize', 'offset']) refuses(zipOf([{ name: 'a', data: 'x', zip64: { fields: [f], noExtra: true } }]), /zip64/i);
});

test('end record asks for zip64 but there is no locator', () => {
  refuses(zipOf(FILES, { zip64Eocd: { noLocator: true } }), /zip64/i);
});

test('locator that does not point to a zip64 record, or points outside the file', () => {
  refuses(zipOf(FILES, { zip64Eocd: { sig: 0x12345678 } }), /zip64/i);
  refuses(zipOf(FILES, { zip64Eocd: { locSig: 0x12345678 } }), /zip64/i);
  refuses(zipOf(FILES, { zip64Eocd: { locOffset: 1 << 30 } }));
  refuses(zipOf(FILES, { zip64Eocd: { locOffset: 2n ** 62n } }));
});

test('multi-part zip64: locator with more than one disk, or disk numbers in the record', () => {
  refuses(zipOf(FILES, { zip64Eocd: { locDisks: 2 } }), /multi-part/i);
  refuses(zipOf(FILES, { zip64Eocd: { locDisk: 1 } }), /multi-part/i);
  refuses(zipOf(FILES, { zip64Eocd: { disk: 1 } }), /multi-part/i);
  refuses(zipOf(FILES, { zip64Eocd: { cdDisk: 1 } }), /multi-part/i);
});

test('zip64 record too short for its own fields', () => {
  refuses(zipOf(FILES, { zip64Eocd: { recSize: 12 } }), /zip64/i);
});

test('zip64 record that lies about the central directory (count, size, offset)', () => {
  refuses(zipOf(FILES, { zip64Eocd: { total: 2n ** 40n } }));            // far more entries than the directory can hold
  refuses(zipOf(FILES, { zip64Eocd: { total: 1_000_000 } }));
  refuses(zipOf(FILES, { zip64Eocd: { cdSize: 1n << 40n } }));
  refuses(zipOf(FILES, { zip64Eocd: { cdOff: 10_000_000 } }));
});

test('an impossible entry count is refused before any entry is parsed', () => {
  // 1 million entries cannot fit in a 100-byte directory (46 bytes minimum each): refuse on the numbers alone.
  const t0 = Date.now();
  refuses(zipOf(FILES, { zip64Eocd: { total: 2n ** 52n } }), /entry count/i);
  assert.ok(Date.now() - t0 < 1000);
});

test('a local offset past the end of the file via zip64 is a ZipError on read, not a crash', () => {
  const p = zipOf([{ name: 'a', data: 'x', zip64: { fields: ['offset'], values: { offset: 1n << 40n } } }]);
  assert.throws(() => readZipFile(p, 'a'), ZipError);
});

test('a file that is only an end record asking for zip64 (no room for a locator) is a ZipError', () => {
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0xffff, 10); eocd.writeUInt16LE(0xffff, 8);
  eocd.writeUInt32LE(0xffffffff, 12); eocd.writeUInt32LE(0xffffffff, 16);
  refuses(put(eocd), /zip64/i);
});
