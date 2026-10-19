// Round 187 / C15.7 / G-C5 second review (ZIP-005, ZIP-006, ZIP-009): the end-of-central-directory record, read the way the other readers read it.
//   ZIP-005: a fake record at the very END, whose comment does not fit, must not be dropped silently (Python and unzip take the last signature).
//   ZIP-006: with a zip64 locator in front of the record, the zip64 record is the truth; the plain fields may differ from it only by being 0xffff / 0xffffffff.
//   ZIP-009: 0xffff in the plain entry count is a real count when there is no zip64 locator (Python writes exactly 65 535 entries that way).
// Hostile bytes come from test/zipraw.mjs, never from the writer under test. Assertions use error classes and codes, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openZip, listZip, readZipFile, testZip, extractZip, createZip, ZipError } from '../src/zipkit.mjs';
import { local, central, eocd, eocd64 } from './zipraw.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-eocd2-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };
const refused = (err) => err instanceof ZipError && err.code === 'EAMBIGUOUS';
const names = (p) => listZip(p).entries.map((e) => e.name);
const havePython = spawnSync('python3', ['-c', '1'], { stdio: 'ignore' }).status === 0;
const pyNames = (p) => JSON.parse(spawnSync('python3', ['-I', '-c', 'import sys,json,zipfile;print(json.dumps([i.filename for i in zipfile.ZipFile(sys.argv[1]).infolist()]))', p], { encoding: 'utf8' }).stdout || '[]');

// good | evil | cdGood | real EOCD | cdEvil | fake EOCD: each directory ends where its own record starts (the layout of the review's PoC).
const GOOD = 'benign content\n', EVIL = 'EVIL content\n';
const trailingFake = (fakeFields = {}) => {
  const good = local('good.txt', GOOD), evil = local('evil.txt', EVIL);
  const cdGood = central('good.txt', GOOD, 0), cdEvil = central('evil.txt', EVIL, good.length);
  const cdGoodAt = good.length + evil.length, realAt = cdGoodAt + cdGood.length, cdEvilAt = realAt + 22;
  return Buffer.concat([good, evil, cdGood, eocd({ total: 1, cdSize: cdGood.length, cdOff: cdGoodAt }), cdEvil,
    eocd({ total: 1, cdSize: cdEvil.length, cdOff: cdEvilAt, commentLen: 0xffff, ...fakeFields })]);
};
// A directory A (good) and a directory B (evil) behind it, a zip64 record describing B and its locator, then a plain record describing A.
const withLocator = (plain = {}, z64 = {}) => {
  const a = local('good.txt', GOOD), b = local('evil.txt', EVIL);
  const cdA = central('good.txt', GOOD, 0), cdB = central('evil.txt', EVIL, a.length);
  const cdAAt = a.length + b.length, cdBAt = cdAAt + cdA.length, z64At = cdBAt + cdB.length;
  return Buffer.concat([a, b, cdA, cdB,
    eocd64({ total: 1, cdSize: cdB.length, cdOff: cdBAt, at: z64At, ...z64 }),
    eocd({ total: 1, cdSize: cdA.length, cdOff: cdAAt, ...plain })]);
};

test('ZIP-005: a fake record at the very end with a comment that does not fit is refused (EAMBIGUOUS), not skipped', async () => {
  const p = put(trailingFake());
  assert.throws(() => openZip(p), refused);
  assert.throws(() => listZip(p), refused);
  await assert.rejects(testZip(p), refused);
  const out = join(dir, 'out005');
  await assert.rejects(extractZip(p, out), refused);
  assert.equal(existsSync(out), false, 'nothing is written for a refused zip');
});

test('ZIP-005: the fixture is a real differential: Python reads the fake, so the two readers would disagree', { skip: !havePython }, () => {
  assert.deepEqual(pyNames(put(trailingFake())), ['evil.txt']);
});

// One honest entry, with whatever follows the record.
const plain = (tail = Buffer.alloc(0)) => {
  const l = local('good.txt', GOOD), c = central('good.txt', GOOD, 0);
  return Buffer.concat([l, c, eocd({ total: 1, cdSize: c.length, cdOff: l.length }), tail]);
};

test('ZIP-005: a real record followed by junk with no signature in it is still read (one candidate)', () => {
  assert.deepEqual(names(put(plain(Buffer.from('junk after the record')))), ['good.txt']);
});

test('ZIP-005: an ordinary comment that fits is still read', () => {
  const l = local('good.txt', GOOD), c = central('good.txt', GOOD, 0), comment = Buffer.from('a short comment');
  assert.deepEqual(names(put(Buffer.concat([l, c, eocd({ total: 1, cdSize: c.length, cdOff: l.length, comment })]))), ['good.txt']);
});

test('ZIP-006: a zip64 locator with a plain record that points at another directory is refused (EAMBIGUOUS)', async () => {
  const p = put(withLocator());
  assert.throws(() => openZip(p), refused);
  assert.throws(() => listZip(p), refused);
  await assert.rejects(testZip(p), refused);
  const out = join(dir, 'out006');
  await assert.rejects(extractZip(p, out), refused);
  assert.equal(existsSync(out), false, 'nothing is written for a refused zip');
});

test('ZIP-006: the fixture is a real differential: Python follows the zip64 record, chicla would have followed the plain one', { skip: !havePython }, () => {
  assert.deepEqual(pyNames(put(withLocator())), ['evil.txt']);
});

test('ZIP-006: each plain field that disagrees with the zip64 record and is not a marker refuses on its own', () => {
  // The zip64 record describes B (1 entry). Plain fields that equal it, or are markers, are fine; any other value is a second truth.
  const b = local('evil.txt', EVIL), cdB = central('evil.txt', EVIL, 0), cdBAt = b.length, z64At = cdBAt + cdB.length;
  const build = (plainFields) => put(Buffer.concat([b, cdB, eocd64({ total: 1, cdSize: cdB.length, cdOff: cdBAt, at: z64At }),
    eocd({ total: 1, cdSize: cdB.length, cdOff: cdBAt, ...plainFields })]));
  assert.deepEqual(names(build({})), ['evil.txt'], 'plain fields equal to the zip64 record');
  assert.deepEqual(names(build({ total: 0xffff, cdSize: 0xffffffff, cdOff: 0xffffffff })), ['evil.txt'], 'all three are markers');
  assert.deepEqual(names(build({ total: 0xffff })), ['evil.txt'], 'only the count is a marker');
  assert.deepEqual(names(build({ cdSize: 0xffffffff })), ['evil.txt'], 'only the size is a marker');
  assert.deepEqual(names(build({ cdOff: 0xffffffff })), ['evil.txt'], 'only the offset is a marker');
  assert.throws(() => openZip(build({ total: 2 })), refused, 'count differs');
  assert.throws(() => openZip(build({ cdSize: cdB.length + 1 })), refused, 'size differs');
  assert.throws(() => openZip(build({ cdOff: cdBAt + 1 })), refused, 'offset differs');
});

// 65 535 empty files, written the way Python writes them: plain record, count 0xffff, no zip64 record, no locator.
const many = (count) => {
  const locals = [], cds = []; let off = 0;
  for (let i = 0; i < count; i++) { const name = `f${i}`, l = local(name, ''); locals.push(l); cds.push(central(name, '', off)); off += l.length; }
  const cd = Buffer.concat(cds);
  return Buffer.concat([...locals, cd, eocd({ total: count, cdSize: cd.length, cdOff: off })]);
};

test('ZIP-009: exactly 65 535 entries with 0xffff in the plain count and no zip64 record are read', () => {
  const p = put(many(0xffff));
  const z = openZip(p);
  try { assert.equal(z.entries.length, 0xffff); assert.equal(z.entries[0].name, 'f0'); assert.equal(z.entries[0xfffe].name, 'f65534'); } finally { z.close(); }
  if (havePython) assert.equal(pyNames(p).length, 0xffff, 'Python reads the same count');
});

test('ZIP-009: 0xffff in the count without a locator is still checked against the directory (fewer entries than it claims is refused)', () => {
  const l = local('good.txt', GOOD), c = central('good.txt', GOOD, 0);
  const p = put(Buffer.concat([l, c, eocd({ total: 0xffff, cdSize: c.length, cdOff: l.length })]));
  assert.throws(() => openZip(p), (err) => err instanceof ZipError);
});

test('ZIP-009: a 0xffffffff size or offset in the plain record without a locator is still refused (zip64 without locator)', () => {
  const l = local('good.txt', GOOD), c = central('good.txt', GOOD, 0);
  for (const f of [{ cdSize: 0xffffffff }, { cdOff: 0xffffffff }]) {
    const p = put(Buffer.concat([l, c, eocd({ total: 1, cdSize: c.length, cdOff: l.length, ...f })]));
    assert.throws(() => openZip(p), (err) => err instanceof ZipError && err.code === 'EZIP', 'zip64 without locator keeps its own refusal, not another one further on');
  }
});

test('ZIP-006/009: genuine zip64 zips (markers in every moved field, from the fabricator and from chicla\'s own writer) are still read', async () => {
  const zip = buildZip([{ name: 'a.txt', data: 'alpha', zip64: {} }, { name: 'b.txt', data: 'bravo' }], { zip64Eocd: true });
  assert.deepEqual(names(put(zip)), ['a.txt', 'b.txt']);
  const src = join(dir, 'src-zip64'); mkdirSync(src); writeFileSync(join(src, 'x.txt'), 'xray');
  const out = join(dir, 'own64.zip'); await createZip(out, src, { zip64: true });
  assert.deepEqual(names(out), ['x.txt']);
  assert.equal(readZipFile(out, 'x.txt').toString(), 'xray');
});
