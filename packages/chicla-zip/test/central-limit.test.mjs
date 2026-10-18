// Round 174 / G-C5 §5.4 (D128): a central directory above 64 MiB (67 108 864 bytes) is refused before it is read.
// The directory is read whole and costs ~450 to 500 bytes of memory per entry (bench/central-memory.mjs), so the old 1 GiB bound never fired before Node
// ran out of memory (an uncatchable abort). The tests fabricate only the END of a zip (the size the end record claims): the check runs before the
// directory is read, so no 64 MiB file is made. Error assertions use classes and codes, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openZip, listZip, testZip, extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

const LIMIT = 64 * 1024 * 1024;
let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-central-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };

// A plain end record that claims a central directory of `cdSize` bytes at offset 0, in a file that has nothing else.
const plain = (cdSize) => Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(0), u16(0), u32(cdSize), u32(0), u16(0)]);
// The same claim in the zip64 way: zip64 end record, locator, then an end record with the 32-bit fields at their marker values.
const zip64 = (cdSize) => Buffer.concat([
  u32(0x06064b50), u64(44), u16(45), u16(45), u32(0), u32(0), u64(0), u64(0), u64(cdSize), u64(0),
  u32(0x07064b50), u32(0), u64(0), u32(1),
  u32(0x06054b50), u16(0), u16(0), u16(0xffff), u16(0xffff), u32(0xffffffff), u32(0xffffffff), u16(0)]);
const isCentral = (err) => err instanceof ZipError && err.code === 'ECENTRAL';
const notCentral = (err) => err instanceof ZipError && err.code !== 'ECENTRAL';

test('D128: one byte above 64 MiB is refused with ECENTRAL by every entry point', async () => {
  const p = put(plain(LIMIT + 1)), out = join(dir, `out${n++}`);
  assert.throws(() => openZip(p), isCentral);
  assert.throws(() => listZip(p), isCentral);
  await assert.rejects(() => testZip(p), isCentral);
  await assert.rejects(() => extractZip(p, out), isCentral);
});

test('D128: exactly 64 MiB is NOT refused as too large (the bound is exclusive); the file is then found truncated, a different error', () => {
  assert.throws(() => openZip(put(plain(LIMIT))), notCentral);
  assert.throws(() => openZip(put(plain(LIMIT - 1))), notCentral);
});

test('D128: the old 1 GiB bound and sizes far above it are refused too (the zip64 way as well)', () => {
  assert.throws(() => openZip(put(plain(1 << 30))), isCentral);
  assert.throws(() => openZip(put(plain(0xfffffffe))), isCentral);
  assert.throws(() => openZip(put(zip64(LIMIT + 1))), isCentral);
  assert.throws(() => openZip(put(zip64(2 ** 40))), isCentral);
  assert.throws(() => openZip(put(zip64(LIMIT))), notCentral);
});

test('D128: an ordinary zip, and a zip with many entries, still open', () => {
  assert.equal(listZip(put(buildZip([{ name: 'a.txt', data: 'A' }]))).entries.length, 1);
  const many = buildZip(Array.from({ length: 5000 }, (_, i) => ({ name: `dir/file-${i}.txt`, data: 'x' })));
  assert.equal(listZip(put(many)).entries.length, 5000);
});
