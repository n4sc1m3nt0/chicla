// Round 171 / G-C5 ZIP-002 (D124): the local header has to agree with the central directory.
// A zip can carry two descriptions of one entry. Python's `zipfile` refuses a local header whose name differs from the central one, and `unzip` warns
// and exits 1, but this reader used to take the data position from the local header and trust the central directory for everything else, so a tool that
// lists with one view and extracts with the other could be shown different files. `dataStart` now compares, with the central directory, the name BYTES,
// the compression method and the encryption bits (0x01 and 0x40). Flags are NOT compared as a whole: the data descriptor bit (0x08) legitimately differs.
// Hostile bytes are patched in here, never made with the writer under test. Error assertions use classes and codes, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openZip, readZipFile, testZip, extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-localhdr-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };

// The first entry's local header is at offset 0: flags at 6, method at 8, name length at 26, extra length at 28, name at 30.
const patch = (zip, off, bytes) => { const out = Buffer.from(zip); Buffer.from(bytes).copy(out, off); return out; };
const le16 = (v) => [v & 0xff, v >> 8];
const NAME = 'secret.txt';
const one = (e = {}) => buildZip([{ name: NAME, data: 'HELLO', ...e }]);
const isZipError = (err) => err instanceof ZipError;

// All three readers (read, testZip, extractZip) must refuse, and extractZip must leave nothing behind.
const refused = async (zip, label) => {
  const p = put(zip), out = join(dir, `out${n++}`);
  assert.throws(() => readZipFile(p, NAME), isZipError, `${label}: read`);
  await assert.rejects(() => testZip(p), isZipError, `${label}: testZip`);
  await assert.rejects(() => extractZip(p, out), isZipError, `${label}: extractZip`);
  assert.equal(existsSync(out), false, `${label}: nothing was created`);
  assert.equal(readdirSync(dir).filter((f) => f.startsWith('.chicla') || f.includes('.tmp')).length, 0, `${label}: no temporary folder left`);
};

test('ZIP-002: an ordinary zip, and a local extra field that differs from the central one, are read as before', async () => {
  const p = put(one({ localExtra: Buffer.from([0xaa, 0xbb, 0x02, 0x00, 1, 2]) }));
  assert.equal(readZipFile(p, NAME).toString(), 'HELLO');
  assert.deepEqual(await testZip(p), { files: 1, bytes: 5 });
});

test('ZIP-002: a local name that differs from the central one (same length) is refused', async () => {
  await refused(patch(one(), 30, Buffer.from('SECRET.txt')), 'case change');
  await refused(patch(one(), 30, Buffer.from('other_.txt')), 'other name');
});

test('ZIP-002: a single differing byte at the END of the name is refused (the whole name is compared)', async () => {
  await refused(patch(one(), 30 + NAME.length - 1, [0x78]), 'last byte');
});

test('ZIP-002: a local name of another length is refused', async () => {
  await refused(patch(one(), 26, le16(NAME.length - 3)), 'shorter');
  await refused(patch(one(), 26, le16(NAME.length + 3)), 'longer');
});

test('ZIP-002: a local name length moved INTO the extra field (the data starts at the same place) is refused', async () => {
  // name + extra stay 10 + 6 bytes, so the data position does not change and only the length field tells the two headers apart (the CRC cannot).
  const extra = Buffer.from([0xaa, 0xbb, 0x02, 0x00, 1, 2]);
  await refused(patch(one({ localExtra: extra }), 26, [...le16(NAME.length + 3), ...le16(extra.length - 3)]), 'name takes 3 bytes of the extra');
  await refused(patch(one({ localExtra: extra }), 26, [...le16(NAME.length - 3), ...le16(extra.length + 3)]), 'extra takes 3 bytes of the name');
});

test('ZIP-002: a name that differs only in its encoding (same text, other bytes) is refused: bytes are compared, not decoded text', async () => {
  // NFC «é» is 2 bytes and NFD «e» + U+0301 is 3, so a padding character makes both names the same byte length.
  const nfc = Buffer.from('café_.txt', 'utf8'), nfd = Buffer.from('café.txt', 'utf8');
  assert.equal(nfc.length, nfd.length);
  const zip = buildZip([{ name: nfc, data: 'HELLO' }]);
  const p = put(patch(zip, 30, nfd));
  assert.throws(() => readZipFile(p, 'café_.txt'), isZipError);
  await assert.rejects(() => testZip(p), isZipError);
});

test('ZIP-002: a method that differs (local stored, central deflate, and the other way round) is refused', async () => {
  await refused(patch(one({ method: 8 }), 8, le16(0)), 'central 8, local 0');
  await refused(patch(one({ method: 0 }), 8, le16(8)), 'central 0, local 8');
});

test('ZIP-002: an encryption bit in the local header that the central one does not have is refused (0x01 and 0x40)', async () => {
  await refused(patch(one(), 6, le16(0x0001)), 'traditional encryption');
  await refused(patch(one(), 6, le16(0x0040)), 'strong encryption');
});

test('ZIP-002: the data descriptor bit (0x08) may differ either way; flags are not compared as a whole', async () => {
  for (const [central, local] of [[0x0008, 0x0000], [0x0000, 0x0008], [0x0800, 0x0000], [0x0000, 0x0800]]) {
    const p = put(patch(one({ flags: central }), 6, le16(local)));
    assert.equal(readZipFile(p, NAME).toString(), 'HELLO', `central ${central} local ${local}`);
    assert.deepEqual(await testZip(p), { files: 1, bytes: 5 });
  }
});

test('ZIP-002: the streaming path (an entry above the small-entry limit) refuses too, and creates nothing', async () => {
  const big = Buffer.alloc(300 * 1024, 0x61);
  const zip = buildZip([{ name: NAME, data: big }]);
  const p = put(patch(zip, 30, Buffer.from('SECRET.txt'))), out = join(dir, `out${n++}`);
  await assert.rejects(() => testZip(p), isZipError);
  await assert.rejects(() => extractZip(p, out), isZipError);
  assert.equal(existsSync(out), false);
  // and the untouched one still extracts, so the test above is about the patch and not about the size
  const ok = join(dir, `out${n++}`);
  await extractZip(put(zip), ok);
  assert.equal(readFileSync(join(ok, NAME)).length, big.length);
});

test('ZIP-002: one bad entry among good ones refuses the whole extraction before any file is written', async () => {
  const zip = buildZip([{ name: 'a.txt', data: 'AAA' }, { name: NAME, data: 'HELLO' }, { name: 'c.txt', data: 'CCC' }]);
  // the second local header starts after the first one: 30 + 5 name + 3 data
  const second = 30 + 'a.txt'.length + 3;
  const p = put(patch(zip, second + 30, Buffer.from('SECRET.txt'))), out = join(dir, `out${n++}`);
  await assert.rejects(() => extractZip(p, out), isZipError);
  assert.equal(existsSync(out), false);
});

test('ZIP-002: the refusal is a ZipError with the general code EZIP', () => {
  const p = put(patch(one(), 30, Buffer.from('SECRET.txt')));
  const z = openZip(p);
  try { assert.throws(() => z.read(NAME), (err) => err instanceof ZipError && err.code === 'EZIP'); } finally { z.close(); }
});
