// Round 208 / C15.25 / G-C5 fourth review (ZIP-019, D136): the zip64 end record must END exactly where its locator starts.
//   The locator carries an offset, and Chicla followed it without asking where that record ends. A record that does not end at the locator (a gap, a wrong size
//   field, or a second record in front of the locator) is read differently by the other readers (seen: Python 3.12.3 refuses the poc_loc2 shape, `unzip` follows the
//   locator; the reviewer reports that an older Python reads the record in front of it, which Claude did NOT reproduce).
//   The rule: endsAt + 12 + size-field === locator position (the size field counts the bytes after the first 12, so extensible data is allowed when it is counted).
// Hostile bytes come from test/zipraw.mjs, never from the writer under test. Assertions use error classes and codes, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openZip, listZip, testZip, extractZip, ZipError } from '../src/zipkit.mjs';
import { local, central, eocd, eocd64, u64 } from './zipraw.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-loc-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };
const refused = (err) => err instanceof ZipError && err.code === 'EZIP';
const names = (p) => listZip(p).entries.map((e) => e.name);
const havePython = spawnSync('python3', ['-c', '1'], { stdio: 'ignore' }).status === 0;
const pyNames = (p) => JSON.parse(spawnSync('python3', ['-I', '-c', 'import sys,json,zipfile;print(json.dumps([i.filename for i in zipfile.ZipFile(sys.argv[1]).infolist()]))', p], { encoding: 'utf8' }).stdout || '[]');

const GOOD = 'benign content\n', EVIL = 'EVIL content\n';
const MARKERS = { total: 0xffff, cdSize: 0xffffffff, cdOff: 0xffffffff }; // the plain record of a real zip64 archive
const rec = (b) => b.subarray(0, 56), loc = (b) => b.subarray(56, 76);
const withSize = (r, sz) => { const c = Buffer.from(r); u64(sz).copy(c, 4); return c; };

// One honest entry, then its directory, its zip64 record (size field `sz`, `ext` bytes of extensible data, `gap` bytes of filler), the locator and the plain record.
const one = ({ sz = 44, ext = Buffer.alloc(0), gap = Buffer.alloc(0) } = {}) => {
  const l = local('good.txt', GOOD), c = central('good.txt', GOOD, 0), at = l.length + c.length;
  const z = eocd64({ total: 1, cdSize: c.length, cdOff: l.length, at });
  return Buffer.concat([l, c, withSize(rec(z), sz), ext, gap, loc(z), eocd({ ...MARKERS })]);
};
// The shape of the reviewer's poc_loc2: directory A and its record (the one the locator points at), then directory B and ITS record directly in front of the locator.
// Python reads B (a fixed place in front of the locator); the locator, `unzip` and the old Chicla say A.
const twoRecords = () => {
  const a = local('good.txt', GOOD), b = local('evil.txt', EVIL);
  const cdA = central('good.txt', GOOD, 0), cdB = central('evil.txt', EVIL, a.length);
  const cdAAt = a.length + b.length, zAAt = cdAAt + cdA.length, cdBAt = zAAt + 56, zBAt = cdBAt + cdB.length;
  const zA = eocd64({ total: 1, cdSize: cdA.length, cdOff: cdAAt, at: zAAt });
  const zB = eocd64({ total: 1, cdSize: cdB.length, cdOff: cdBAt, at: zAAt }); // the locator that follows zB still says zAAt
  return Buffer.concat([a, b, cdA, rec(zA), cdB, rec(zB), loc(zB), eocd({ ...MARKERS })]);
};

test('ZIP-019: a normal zip64 archive (the record ends at its locator) is read', () => {
  const p = put(one());
  assert.deepEqual(names(p), ['good.txt']);
  openZip(p);
});

test('ZIP-019: the fixture of a normal zip64 archive is read the same by Python', { skip: !havePython }, () => {
  assert.deepEqual(pyNames(put(one())), ['good.txt']);
});

test('ZIP-019: a zip64 record with extensible data that is COUNTED in the size field and ends at the locator is read', async () => {
  const p = put(one({ sz: 44 + 8, ext: Buffer.alloc(8, 0x61) }));
  assert.deepEqual(names(p), ['good.txt']);
  const r = await testZip(p);
  assert.ok(r);
});

test('ZIP-019: a gap between the zip64 record and its locator is refused (EZIP), nothing is written', async () => {
  const p = put(one({ gap: Buffer.alloc(8, 0x62) }));
  assert.throws(() => openZip(p), refused);
  assert.throws(() => listZip(p), refused);
  await assert.rejects(testZip(p), refused);
  const out = join(dir, 'out019gap');
  await assert.rejects(extractZip(p, out), refused);
  assert.equal(existsSync(out), false, 'nothing is written for a refused zip');
});

test('ZIP-019: extensible data that the size field does NOT count is refused', () => {
  assert.throws(() => openZip(put(one({ sz: 44, ext: Buffer.alloc(8, 0x63) }))), refused);
});

test('ZIP-019: a size field that reaches past the locator is refused', () => {
  assert.throws(() => openZip(put(one({ sz: 44 + 8 }))), refused);
});

test('ZIP-019: a size field that stops short of the locator is refused (one byte is enough)', () => {
  assert.throws(() => openZip(put(one({ gap: Buffer.alloc(1, 0x64) }))), refused);
});

test('ZIP-019 (poc_loc2): the locator points at one record and another sits in front of it: refused', async () => {
  const p = put(twoRecords());
  assert.throws(() => openZip(p), refused);
  assert.throws(() => listZip(p), refused);
  await assert.rejects(testZip(p), refused);
  const out = join(dir, 'out019two');
  await assert.rejects(extractZip(p, out), refused);
  assert.equal(existsSync(out), false, 'nothing is written for a refused zip');
});

// Python 3.12 refuses this shape ("Corrupt zip64 end of central directory record") and `unzip` follows the locator (good.txt); an older Python reads the record in
// front of the locator (evil.txt). Whatever the version, Python does not agree with the locator, so the readers differ and Chicla must not pick one.
test('ZIP-019 (poc_loc2): the fixture is a real differential: Python does not read what the locator points at', { skip: !havePython }, () => {
  assert.notDeepEqual(pyNames(put(twoRecords())), ['good.txt']);
});
