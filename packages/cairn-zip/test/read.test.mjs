// R1 / C1.1: read tests for cairn-zip (names, listZip, readZipFile, testZip, refusals).
// Every zip here is fabricated by test/zipfab.mjs, so hostile and odd archives do not depend on an external `zip`.
// Assertions use error classes and codes, never message text (messages move to keys in D8 / C13.3).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { listZip, readZipFile, testZip, ZipError } from '../src/zipkit.mjs';
import { buildZip, unicodePathExtra, crc32 } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'cairn-zip-read-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };
const zipOf = (entries, opts) => put(buildZip(entries, opts));
const first = (p) => listZip(p).entries[0];

const NFC = 'relatório.txt', NFD = NFC.normalize('NFD');
const cp437Cafe = Buffer.from([0x63, 0x61, 0x66, 0x82, 0x2e, 0x74, 0x78, 0x74]); // "caf" 0x82 ".txt": é in cp437, invalid UTF-8

// ---------- names: 0x7075 (with CRC) > bit 11 > valid UTF-8 > cp437 ----------
test('names: ASCII name', () => {
  const e = first(zipOf([{ name: 'a.txt', data: 'x' }]));
  assert.equal(e.name, 'a.txt');
  assert.equal(e.nameSource, 'ascii');
  assert.equal(e.flagMissing, false);
});

test('names: bit 11 set, UTF-8 name', () => {
  const e = first(zipOf([{ name: NFC, data: 'x', flags: 0x800 }]));
  assert.equal(e.name, NFC);
  assert.equal(e.nameSource, 'flag');
  assert.equal(e.flagMissing, false);
});

test('names: no bit 11 but valid UTF-8 is read as UTF-8 and reported as missing the flag', () => {
  const e = first(zipOf([{ name: NFC, data: 'x' }]));
  assert.equal(e.name, NFC);
  assert.equal(e.nameSource, 'utf8');
  assert.equal(e.flagMissing, true);
});

test('names: no bit 11 and invalid UTF-8 falls back to cp437', () => {
  const e = first(zipOf([{ name: cp437Cafe, data: 'x' }]));
  assert.equal(e.name, 'café.txt');
  assert.equal(e.nameSource, 'cp437');
  assert.equal(e.flagMissing, false);
});

test('names: Unicode Path extra (0x7075) with the right CRC wins over the raw name', () => {
  const extra = unicodePathExtra(cp437Cafe, 'cafe-ü.txt');
  const e = first(zipOf([{ name: cp437Cafe, data: 'x', extra }]));
  assert.equal(e.name, 'cafe-ü.txt');
  assert.equal(e.nameSource, 'unicode-extra');
});

test('names: Unicode Path extra with a wrong CRC is ignored', () => {
  const extra = unicodePathExtra(cp437Cafe, 'cafe-ü.txt', { crc: 0x12345678 });
  const e = first(zipOf([{ name: cp437Cafe, data: 'x', extra }]));
  assert.equal(e.name, 'café.txt');
  assert.equal(e.nameSource, 'cp437');
});

test('names: Unicode Path extra with an unknown version is ignored', () => {
  const extra = unicodePathExtra(cp437Cafe, 'cafe-ü.txt', { version: 2 });
  const e = first(zipOf([{ name: cp437Cafe, data: 'x', extra }]));
  assert.equal(e.nameSource, 'cp437');
});

// ---------- listZip ----------
test('listZip: entries carry method, sizes, crc, directory flag and unix mode', () => {
  const body = 'hello hello hello hello hello hello';
  const { entries } = listZip(zipOf([
    { name: 'd/', dir: true },
    { name: 'd/stored.txt', data: 'abc' },
    { name: 'd/deflated.txt', data: body, method: 8, mode: 0o100755 },
  ]));
  assert.equal(entries.length, 3);
  assert.equal(entries[0].isDir, true);
  assert.equal(entries[1].method, 0);
  assert.equal(entries[1].usize, 3);
  assert.equal(entries[1].crc, crc32(Buffer.from('abc')));
  assert.equal(entries[2].method, 8);
  assert.equal(entries[2].usize, body.length);
  assert.equal(entries[2].csize, deflateRawSync(Buffer.from(body)).length);
  assert.equal(entries[2].mode & 0o777, 0o755);
});

// ---------- readZipFile ----------
test('readZipFile: stored and deflate return the original bytes', () => {
  const big = Buffer.from('0123456789'.repeat(5000));
  const p = zipOf([{ name: 's.bin', data: big }, { name: 'd.bin', data: big, method: 8 }]);
  assert.deepEqual(readZipFile(p, 's.bin'), big);
  assert.deepEqual(readZipFile(p, 'd.bin'), big);
});

test('readZipFile: an empty file reads as an empty buffer', () => {
  const p = zipOf([{ name: 'empty.txt', data: '' }]);
  assert.equal(readZipFile(p, 'empty.txt').length, 0);
});

test('readZipFile: NFC and NFD names find the same file, in both directions', () => {
  const nfcZip = zipOf([{ name: NFC, data: 'one', flags: 0x800 }]);
  assert.equal(readZipFile(nfcZip, NFD).toString(), 'one');
  const nfdZip = zipOf([{ name: NFD, data: 'two', flags: 0x800 }]);
  assert.equal(readZipFile(nfdZip, NFC).toString(), 'two');
});

test('readZipFile: a missing name is ENOENT, and a directory is not a file', () => {
  const p = zipOf([{ name: 'd/', dir: true }, { name: 'a.txt', data: 'x' }]);
  assert.throws(() => readZipFile(p, 'nope.txt'), (e) => e instanceof ZipError && e.code === 'ENOENT');
  assert.throws(() => readZipFile(p, 'd/'), (e) => e instanceof ZipError && e.code === 'ENOENT');
});

test('readZipFile: refuses a wrong CRC (stored and deflate)', () => {
  const p = zipOf([
    { name: 's.txt', data: 'payload', crc: 0xdeadbeef },
    { name: 'd.txt', data: 'payload payload payload', method: 8, crc: 0xdeadbeef },
  ]);
  assert.throws(() => readZipFile(p, 's.txt'), ZipError);
  assert.throws(() => readZipFile(p, 'd.txt'), ZipError);
});

test('readZipFile: refuses a declared size that does not match (stored, and deflate in both directions)', () => {
  const body = 'payload payload payload';
  const p = zipOf([
    { name: 's.txt', data: 'payload', usize: 3 },
    { name: 'over.txt', data: body, method: 8, usize: body.length + 50 },
    { name: 'under.txt', data: body, method: 8, usize: 5 },
  ]);
  for (const name of ['s.txt', 'over.txt', 'under.txt']) assert.throws(() => readZipFile(p, name), ZipError, name);
});

test('readZipFile: refuses data that runs past the end of the file', () => {
  const p = zipOf([{ name: 'a.txt', data: 'abc', csize: 100000, usize: 100000 }]);
  assert.throws(() => readZipFile(p, 'a.txt'), ZipError);
});

test('readZipFile: maxBytes caps what is read into memory', () => {
  const p = zipOf([{ name: 'a.bin', data: Buffer.alloc(2000, 7) }]);
  assert.throws(() => readZipFile(p, 'a.bin', { maxBytes: 1000 }), ZipError);
  assert.equal(readZipFile(p, 'a.bin', { maxBytes: 2000 }).length, 2000);
});

test('readZipFile: refuses unsupported methods and encrypted entries, with a ZipError', () => {
  const p = zipOf([
    { name: 'bz.txt', data: 'abc', methodField: 12 },
    { name: 'enc.txt', data: 'abc', flags: 0x1 },
    { name: 'strong.txt', data: 'abc', flags: 0x40 },
  ]);
  for (const name of ['bz.txt', 'enc.txt', 'strong.txt']) assert.throws(() => readZipFile(p, name), ZipError, name);
});

// ---------- refusals on the container itself ----------
test('not a zip: empty file, random bytes and a truncated zip are ENOTZIP', () => {
  const good = buildZip([{ name: 'a.txt', data: 'abc' }]);
  const cases = { empty: Buffer.alloc(0), junk: Buffer.from('this is not a zip file at all, just text'), cut: good.subarray(0, good.length - 10) };
  for (const [label, buf] of Object.entries(cases)) {
    assert.throws(() => listZip(put(buf)), (e) => e instanceof ZipError && e.code === 'ENOTZIP', label);
  }
});

test('corrupted central directory: a bad entry signature is a ZipError', () => {
  const buf = buildZip([{ name: 'a.txt', data: 'abc' }]);
  const cdStart = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  buf[cdStart] = 0x00;
  assert.throws(() => listZip(put(buf)), ZipError);
});

test('central directory outside the file is a ZipError', () => {
  assert.throws(() => listZip(zipOf([{ name: 'a.txt', data: 'abc' }], { eocd: { cdOff: 0x7fffffff } })), ZipError);
});

test('multi-part zips are refused', () => {
  assert.throws(() => listZip(zipOf([{ name: 'a.txt', data: 'abc' }], { eocd: { disk: 1, cdDisk: 1 } })), ZipError);
});

// ---------- testZip (the `unzip -t`) ----------
test('testZip: a good zip with stored, deflate, empty files and a directory reports files and bytes', async () => {
  const p = zipOf([
    { name: 'd/', dir: true },
    { name: 'd/a.txt', data: 'abc' },
    { name: 'd/b.txt', data: 'bbbbbbbbbbbbbbbbbbbbbbbb', method: 8 },
    { name: 'd/empty.txt', data: '' },
  ]);
  assert.deepEqual(await testZip(p), { files: 3, bytes: 3 + 24 });
});

test('testZip: refuses a wrong CRC', async () => {
  const p = zipOf([{ name: 'a.txt', data: 'payload', crc: 1 }]);
  await assert.rejects(testZip(p), ZipError);
});

test('testZip: refuses a stream that is larger than declared, without hanging', async () => {
  const body = Buffer.alloc(100000, 0x61);
  const p = zipOf([{ name: 'bomb.txt', data: body, method: 8, usize: 10 }]);
  await assert.rejects(testZip(p), ZipError);
});

test('testZip: refuses a stream that is smaller than declared', async () => {
  const p = zipOf([{ name: 'a.txt', data: 'abc', method: 0, usize: 10, csize: 3 }]);
  await assert.rejects(testZip(p), ZipError);
});

test('testZip: refuses an empty entry that declares data', async () => {
  const p = zipOf([{ name: 'a.txt', data: '', usize: 5, crc: 0x12345678 }]);
  await assert.rejects(testZip(p), ZipError);
});

test('testZip: refuses unsupported methods and encrypted entries', async () => {
  await assert.rejects(testZip(zipOf([{ name: 'bz.txt', data: 'abc', methodField: 12 }])), ZipError);
  await assert.rejects(testZip(zipOf([{ name: 'enc.txt', data: 'abc', flags: 0x1 }])), ZipError);
});
