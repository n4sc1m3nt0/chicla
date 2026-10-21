// Round 172 / G-C5 §5.2 (D125): overlapping entries, and entries that overlap the central directory, are refused when the zip is opened.
// Each entry owns a span of the file that starts at its local header and is AT LEAST 30 + name + compressed size long (the local extra field and a data
// descriptor only make it longer, and are not known without another read). Two spans that share a byte, or a span that reaches the central directory,
// cannot come from a real writer: one byte range would then be two different files in two views. The check uses only the central directory (no I/O).
// Hostile bytes are patched in here, never made with the writer under test. Error assertions use classes and codes, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openZip, listZip, readZipFile, testZip, extractZip, markUtf8Names, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-overlap-')); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };

const CEN = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
// Position of the i-th central directory header.
const cenPos = (zip, i) => { let p = -1; for (let k = 0; k <= i; k++) { p = zip.indexOf(CEN, p + 1); assert.ok(p >= 0); } return p; };
const setCen = (zip, i, field, value) => { // field: 'offset' (+42) or 'csize' (+20)
  const out = Buffer.from(zip); out.writeUInt32LE(value >>> 0, cenPos(zip, i) + (field === 'offset' ? 42 : 20)); return out;
};
const getCen = (zip, i, field) => zip.readUInt32LE(cenPos(zip, i) + (field === 'offset' ? 42 : 20));
const three = () => buildZip([{ name: 'a.txt', data: 'AAAAAAAAAA' }, { name: 'b.txt', data: 'BBBBBBBBBB' }, { name: 'c.txt', data: 'CCCCCCCCCC' }]);
const isOverlap = (err) => err instanceof ZipError && err.code === 'EOVERLAP';

const refused = async (zip, label) => {
  const p = put(zip), out = join(dir, `out${n++}`);
  assert.throws(() => openZip(p), isOverlap, `${label}: openZip`);
  assert.throws(() => listZip(p), isOverlap, `${label}: listZip`);
  assert.throws(() => readZipFile(p, 'a.txt'), isOverlap, `${label}: read`);
  await assert.rejects(() => testZip(p), isOverlap, `${label}: testZip`);
  await assert.rejects(() => extractZip(p, out), isOverlap, `${label}: extractZip`);
  assert.equal(existsSync(out), false, `${label}: nothing was created`);
};

test('overlap: an ordinary zip with extras, an empty file, a folder and a deflate entry opens as before', async () => {
  const p = put(buildZip([
    { name: 'dir/', dir: true }, { name: 'dir/a.txt', data: 'AAA', localExtra: Buffer.from([1, 2, 3, 4, 5, 6]) },
    { name: 'empty.txt', data: '' }, { name: 'z.txt', data: 'z'.repeat(500), method: 8 }, { name: 'flag.txt', data: 'F', flags: 0x08 },
  ]));
  assert.equal(listZip(p).entries.length, 5);
  assert.deepEqual(await testZip(p), { files: 4, bytes: 3 + 0 + 500 + 1 });
});

test('overlap: entries that touch (one ends exactly where the next starts) are fine', () => {
  const p = put(three());
  assert.deepEqual(listZip(p).entries.map((e) => e.name), ['a.txt', 'b.txt', 'c.txt']);
});

test('overlap: the central directory lists entries in any order (the check does not depend on it)', () => {
  let zip = three();
  const o = [0, 1, 2].map((i) => getCen(zip, i, 'offset'));
  zip = setCen(setCen(setCen(zip, 0, 'offset', o[2]), 1, 'offset', o[0]), 2, 'offset', o[1]);
  assert.equal(listZip(put(zip)).entries.length, 3);
});

test('overlap: two entries at the same local offset are refused', async () => {
  const zip = three();
  await refused(setCen(zip, 1, 'offset', getCen(zip, 0, 'offset')), 'same offset');
});

test('overlap: an entry that starts inside the data of the previous one is refused', async () => {
  const zip = three();
  await refused(setCen(zip, 1, 'offset', getCen(zip, 0, 'offset') + 40), 'inside the data');
});

test('overlap: an entry that starts one byte before the previous one ends is refused (off by one)', async () => {
  const zip = three(), end0 = getCen(zip, 1, 'offset');
  await refused(setCen(zip, 1, 'offset', end0 - 1), 'one byte early');
});

test('overlap: a compressed size that runs over the next entry is refused', async () => {
  const zip = three();
  await refused(setCen(zip, 0, 'csize', 10 + 30), 'size over the next header');
});

test('overlap: an entry whose span reaches the central directory is refused', async () => {
  const zip = three(), cdOff = zip.indexOf(CEN);
  await refused(setCen(zip, 2, 'csize', 10 + 5), 'data runs into the central directory');
  assert.ok(cdOff > 0);
});

test('overlap: the refusal carries the code EOVERLAP', () => {
  const zip = three();
  assert.throws(() => openZip(put(setCen(zip, 1, 'offset', getCen(zip, 0, 'offset')))), (err) => err instanceof ZipError && err.code === 'EOVERLAP');
});

test('overlap: markUtf8Names refuses an overlapping zip and leaves the file byte for byte as it was', () => {
  const zip = buildZip([{ name: 'café.txt', data: 'AAAA' }, { name: 'naïve.txt', data: 'BBBB' }]);
  const bad = setCen(zip, 1, 'offset', getCen(zip, 0, 'offset')), p = put(bad);
  assert.throws(() => markUtf8Names(p), isOverlap);
  assert.deepEqual(readFileSync(p), bad);
});

test('overlap: markUtf8Names still patches an ordinary zip', () => {
  const p = put(buildZip([{ name: 'café.txt', data: 'AAAA' }]));
  assert.equal(markUtf8Names(p).patched, 1);
});
