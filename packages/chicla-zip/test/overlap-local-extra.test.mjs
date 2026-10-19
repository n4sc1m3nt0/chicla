// C15.9 (ZIP-011, round 192), written before the code: the layout check uses the REAL span of each entry, local extra field included.
// D125 counted only 30 + name + compressed size from the central directory. The local extra field sits between the name and the data, so an entry A
// whose local extra is long can carry another entry's whole local header (B), and B's central record points into it: the spans only touch under the old
// rule, yet one byte range is two files (`unzip` refuses such a zip as a possible zip bomb). The span now reads each entry's local name and extra lengths
// (one 30-byte read per entry; a header that cannot be read keeps the central-only span, dataStart refuses it later) and a hit is EOVERLAP.
// Hostile bytes are patched in here, never made with the writer under test. Error assertions use classes and codes, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openZip, listZip, readZipFile, testZip, extractZip, markUtf8Names, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';
import { local, central, eocd } from './zipraw.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-zip011-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };
const isOverlap = (err) => err instanceof ZipError && err.code === 'EOVERLAP';
const assemble = (locals, centrals) => { const body = Buffer.concat(locals), cd = Buffer.concat(centrals); return Buffer.concat([body, cd, eocd({ total: centrals.length, cdSize: cd.length, cdOff: body.length })]); };

// A is an empty file whose local extra field is B's whole local entry; the central directory lists B at that position.
const hidden = (nameA = 'a.txt', nameB = 'b.txt', skip = 0) => {
  const B = local(nameB, 'BBBB'), pad = Buffer.alloc(skip), A = local(nameA, '', { extra: Buffer.concat([pad, B]) });
  const bOff = 30 + Buffer.byteLength(nameA) + skip;
  return assemble([A], [central(nameA, '', 0), central(nameB, 'BBBB', bOff)]);
};

const refused = async (zip, label) => {
  const p = put(zip), out = join(dir, `out${n++}`);
  assert.throws(() => openZip(p), isOverlap, `${label}: openZip`);
  assert.throws(() => listZip(p), isOverlap, `${label}: listZip`);
  assert.throws(() => readZipFile(p, 'b.txt'), isOverlap, `${label}: read`);
  await assert.rejects(() => testZip(p), isOverlap, `${label}: testZip`);
  await assert.rejects(() => extractZip(p, out), isOverlap, `${label}: extractZip`);
  assert.equal(existsSync(out), false, `${label}: nothing was created`);
};

test('zip011: an entry whose local header sits inside another entry\'s local extra field is EOVERLAP', async () => {
  await refused(hidden(), 'hidden at the start of the extra');
});
test('zip011: the same, deeper inside the extra field', async () => {
  await refused(hidden('a.txt', 'b.txt', 7), 'hidden 7 bytes in');
});
test('zip011: the entry order in the central directory does not matter', async () => {
  const B = local('b.txt', 'BBBB'), A = local('a.txt', '', { extra: B });
  await refused(assemble([A], [central('b.txt', 'BBBB', 35), central('a.txt', '', 0)]), 'reversed');
});
test('zip011: an entry whose local extra field runs into the central directory is EOVERLAP', async () => {
  const A = local('a.txt', 'x'), bad = Buffer.from(A); bad.writeUInt16LE(40, 28); // the local header claims 40 extra bytes that are the central directory
  await refused(assemble([bad], [central('a.txt', 'x', 0)]), 'extra into the directory');
});
test('zip011: markUtf8Names refuses it and leaves the file byte for byte as it was', () => {
  const bad = hidden('café.txt', 'naïve.txt'), p = put(bad);
  assert.throws(() => markUtf8Names(p), isOverlap);
  assert.deepEqual(readFileSync(p), bad);
});

// What must keep working.
test('zip011: ordinary zips with local extra fields (other sizes than the central ones) still open, test and extract', async () => {
  const p = put(buildZip([{ name: 'a.txt', data: 'AAA', localExtra: Buffer.alloc(24, 1) }, { name: 'b.txt', data: 'BBB', extra: Buffer.alloc(8), localExtra: Buffer.alloc(40) }, { name: 'e.txt', data: '', localExtra: Buffer.alloc(5) }, { name: 'd/', dir: true }]));
  assert.equal(listZip(p).entries.length, 4);
  assert.deepEqual(await testZip(p), { files: 3, bytes: 6 });
  assert.equal((await extractZip(p, join(dir, `ok${n++}`))).files, 3);
});
test('zip011: an unreadable local header is not this check: the entry is still reported by dataStart, as before', () => {
  const A = local('a.txt', 'x'), bad = Buffer.from(A); bad.writeUInt32LE(0, 0); // no local signature
  const p = put(assemble([bad], [central('a.txt', 'x', 0)]));
  assert.equal(listZip(p).entries.length, 1); // listing never reads the data
  assert.throws(() => readZipFile(p, 'a.txt'), (e) => e instanceof ZipError && e.code !== 'EOVERLAP');
});
test('zip011: lengths are read only from a header that has the local signature (garbage lengths are not a span)', () => {
  const A = Buffer.from(local('a.txt', 'x')), B = local('b.txt', 'y'); A.writeUInt32LE(0, 0); A.writeUInt16LE(200, 28); // no signature, and a huge «extra length»
  const p = put(assemble([A, B], [central('a.txt', 'x', 0), central('b.txt', 'y', A.length)]));
  assert.equal(listZip(p).entries.length, 2); // not EOVERLAP: that entry keeps the central-only span
  assert.equal(readZipFile(p, 'b.txt').toString(), 'y');
  assert.throws(() => readZipFile(p, 'a.txt'), (e) => e instanceof ZipError && e.code !== 'EOVERLAP');
});
test('zip011: markUtf8Names still patches an ordinary zip with a long local extra field and does not touch the data', () => {
  const z = buildZip([{ name: 'café.txt', data: 'AAAA', localExtra: Buffer.alloc(30, 9) }]), p = put(z);
  assert.equal(markUtf8Names(p).patched, 1);
  const after = readFileSync(p); assert.ok(after.includes(Buffer.from('AAAA')));
});
