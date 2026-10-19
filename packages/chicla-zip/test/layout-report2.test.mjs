// Round 188 / C15.8 / G-C5 second review (ZIP-007, ZIP-008): the central directory must be exactly where the end record says, and nothing else.
//   ZIP-007: after the `total` entries the directory must end exactly at `cdSize`. Python and unzip read entries until the SIZE is used up, so a hidden entry past the count
//            is seen by them and not by chicla (zip007).
//   ZIP-008: `endRecordPos - cdSize - cdOff` must be 0. A non-zero value is data before the archive (zip008) or a gap between the directory and its record (zip008b):
//            Python and unzip shift every offset by that amount, chicla would not. The other sign (the directory reaching over its own record) is refused too.
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
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-layout2-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };
const refused = (err) => err instanceof ZipError && err.code === 'EZIP';
const names = (p) => listZip(p).entries.map((e) => e.name);
const havePython = spawnSync('python3', ['-c', '1'], { stdio: 'ignore' }).status === 0;
const pyNames = (p) => JSON.parse(spawnSync('python3', ['-I', '-c', 'import sys,json,zipfile;print(json.dumps([i.filename for i in zipfile.ZipFile(sys.argv[1]).infolist()]))', p], { encoding: 'utf8' }).stdout || '[]');
const pyRead = (p, name) => spawnSync('python3', ['-I', '-c', 'import sys,zipfile;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())', p, name], { encoding: 'utf8' }).stdout;

const GOOD = 'benign content\n', EVIL = 'EVIL content\n';
const l1 = local('good.txt', GOOD), l2 = local('evil.txt', EVIL);
const c1 = central('good.txt', GOOD, 0), c2 = central('evil.txt', EVIL, l1.length);
const cdAt = l1.length + l2.length;

// every way of opening the zip refuses it, and nothing is written
const refusedEverywhere = async (p, tag, code = 'EZIP') => {
  const is = (err) => err instanceof ZipError && err.code === code;
  assert.throws(() => openZip(p), is, `${tag}: openZip`);
  assert.throws(() => listZip(p), is, `${tag}: listZip`);
  assert.throws(() => readZipFile(p, 'good.txt'), is, `${tag}: readZipFile`);
  await assert.rejects(testZip(p), is, `${tag}: testZip`);
  const out = join(dir, `out-${tag}`);
  await assert.rejects(extractZip(p, out), is, `${tag}: extractZip`);
  assert.equal(existsSync(out), false, `${tag}: nothing is written for a refused zip`);
};

// zip007: the record says 1 entry and 1 directory of cdSize bytes, but the directory holds two entries (the second one is hidden from a reader that trusts the count).
const zip007 = () => Buffer.concat([l1, l2, c1, c2, eocd({ total: 1, cdSize: c1.length + c2.length, cdOff: cdAt })]);

test('ZIP-007: entries left in the directory after the counted ones are refused (EZIP)', async () => {
  await refusedEverywhere(put(zip007()), 'zip007');
});

test('ZIP-007: the fixture is a real differential: Python reads both entries, chicla would have read one', { skip: !havePython }, () => {
  assert.deepEqual(pyNames(put(zip007())), ['good.txt', 'evil.txt']);
});

test('ZIP-007: a few stray bytes after the last counted entry (not a whole entry) are refused as well', async () => {
  const p = put(Buffer.concat([l1, c1, Buffer.from('xyz'), eocd({ total: 1, cdSize: c1.length + 3, cdOff: l1.length })]));
  await refusedEverywhere(p, 'zip007-stray');
});

test('ZIP-007: a count of 0 with a non-empty directory is refused', () => {
  assert.throws(() => openZip(put(Buffer.concat([l1, c1, eocd({ total: 0, cdSize: c1.length, cdOff: l1.length })]))), refused);
});

test('ZIP-007: the same hidden entry behind a zip64 record is refused too', () => {
  const z64At = cdAt + c1.length + c2.length;
  const p = put(Buffer.concat([l1, l2, c1, c2, eocd64({ total: 1, cdSize: c1.length + c2.length, cdOff: cdAt, at: z64At }),
    eocd({ total: 0xffff, cdSize: 0xffffffff, cdOff: 0xffffffff })]));
  assert.throws(() => openZip(p), refused);
});

// zip008: data before the archive; every offset in the zip is relative to the start of the ARCHIVE, not of the file.
// The junk is a decoy: a local header and a central entry of exactly the sizes of the real ones, so the RAW offsets land on a valid decoy directory (entry «evil.txt»)
// while Python and unzip, which shift by the junk's length, read the real one («good.txt»).
const FAKE = 'X'.repeat(GOOD.length);
const junk = Buffer.concat([local('good.txt', FAKE), central('evil.txt', FAKE, 0)]);
assert.equal(junk.length, l1.length + c1.length);
const zip008 = () => Buffer.concat([junk, l1, c1, eocd({ total: 1, cdSize: c1.length, cdOff: l1.length })]);

test('ZIP-008: data before the archive (offsets that do not match the file) is refused (EZIP)', async () => {
  await refusedEverywhere(put(zip008()), 'zip008');
});

test('ZIP-008: the fixture is a real differential: Python shifts the offsets by the length of the junk and reads the file', { skip: !havePython }, () => {
  const p = put(zip008());
  assert.deepEqual(pyNames(p), ['good.txt']);
  assert.equal(pyRead(p, 'good.txt'), GOOD);
});

// zip008b: a gap between the end of the directory and its record.
const zip008b = () => Buffer.concat([l1, c1, Buffer.from('gap'), eocd({ total: 1, cdSize: c1.length, cdOff: l1.length })]);

test('ZIP-008: a gap between the directory and its end record is refused (EZIP)', async () => {
  await refusedEverywhere(put(zip008b()), 'zip008b');
});

test('ZIP-008: the other sign, a directory that reaches over its own end record, is refused (EZIP)', () => {
  // The last entry's comment IS the end record: the entries parse to the exact size, so only the position check can refuse it.
  const swallow = Buffer.from(c1); swallow.writeUInt16LE(22, 32);
  const rec = eocd({ total: 1, cdSize: c1.length + 22, cdOff: l1.length });
  assert.equal(rec.length, 22);
  const p = put(Buffer.concat([l1, swallow, rec]));
  assert.throws(() => openZip(p), refused);
  // and the cruder form, a size that runs on into the record
  const p2 = put(Buffer.concat([l1, c1, eocd({ total: 1, cdSize: c1.length + 10, cdOff: l1.length })]));
  assert.throws(() => openZip(p2), refused);
});

test('ZIP-008: the same junk in front of a zip64 archive is refused', () => {
  const z64At = junk.length + l1.length + c1.length; // the record sits where the file puts it; the directory offset in it is archive-relative
  const p = put(Buffer.concat([junk, l1, c1, eocd64({ total: 1, cdSize: c1.length, cdOff: l1.length, at: z64At }),
    eocd({ total: 0xffff, cdSize: 0xffffffff, cdOff: 0xffffffff })]));
  assert.throws(() => openZip(p), refused);
});

// What must keep working.
test('C15.8: an honest zip with a zip comment and junk after the record is still read', () => {
  const p = put(Buffer.concat([l1, c1, eocd({ total: 1, cdSize: c1.length, cdOff: l1.length, comment: Buffer.from('a comment') })]));
  assert.deepEqual(names(p), ['good.txt']);
  assert.deepEqual(names(put(Buffer.concat([l1, c1, eocd({ total: 1, cdSize: c1.length, cdOff: l1.length }), Buffer.from('junk after')]))), ['good.txt']);
});

test('C15.8: an empty zip (no entries, empty directory) is still read', () => {
  assert.deepEqual(names(put(eocd({ total: 0, cdSize: 0, cdOff: 0 }))), []);
});

test('C15.8: genuine zip64 zips (fabricator and chicla\'s own writer) and a plain two-entry zip are still read', async () => {
  const zip = buildZip([{ name: 'a.txt', data: 'alpha', zip64: {} }, { name: 'b.txt', data: 'bravo' }], { zip64Eocd: true });
  assert.deepEqual(names(put(zip)), ['a.txt', 'b.txt']);
  assert.deepEqual(names(put(Buffer.concat([l1, l2, c1, c2, eocd({ total: 2, cdSize: c1.length + c2.length, cdOff: cdAt })]))), ['good.txt', 'evil.txt']);
  const src = join(dir, 'src-ok'); mkdirSync(src); writeFileSync(join(src, 'x.txt'), 'xray');
  for (const opts of [{}, { zip64: true }]) {
    const out = join(dir, `own-${Object.keys(opts).length}.zip`); await createZip(out, src, opts);
    assert.deepEqual(names(out), ['x.txt']);
    assert.equal(readZipFile(out, 'x.txt').toString(), 'xray');
  }
});
