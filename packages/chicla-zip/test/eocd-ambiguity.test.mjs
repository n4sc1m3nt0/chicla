// Round 170 / G-C5 ZIP-001 (D123): a false end-of-central-directory record inside the zip comment.
// Several records can look like the EOCD (every candidate whose comment fits the end of the file). The reader picks the one
// whose central directory ends exactly where the record starts; if that does not give ONE answer it refuses (EAMBIGUOUS).
// Hostile bytes are built here, never with the writer under test. Error assertions use classes and codes, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openZip, listZip, readZipFile, testZip, extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-eocd-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };

const SIG = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
// A 22-byte EOCD record with the given fields and an empty comment.
const eocd = ({ total = 0, cdSize = 0, cdOff = 0, comment = 0 } = {}) =>
  Buffer.concat([SIG, u16(0), u16(0), u16(total), u16(total), u32(cdSize), u32(cdOff), u16(comment)]);
// Gives the zip a comment: the comment length of its last EOCD is rewritten and the bytes are appended.
const withComment = (zip, comment) => {
  const out = Buffer.concat([zip, comment]), e = zip.lastIndexOf(SIG);
  out.writeUInt16LE(comment.length, e + 20);
  return out;
};
const base = () => buildZip([{ name: 'secret.txt', data: 'HELLO' }]);
const EVIL = () => Buffer.concat([Buffer.from('evil'), eocd()]); // the case of the review: claims no entries, no directory

test('ZIP-001: an ordinary comment is read as before', () => {
  const p = put(withComment(base(), Buffer.from('just a comment, no signature in it')));
  assert.deepEqual(listZip(p).entries.map((e) => e.name), ['secret.txt']);
  assert.equal(readZipFile(p, 'secret.txt').toString(), 'HELLO');
});

test('ZIP-001: a false zero-entry EOCD in the comment does not hide the real entries', async () => {
  const p = put(withComment(base(), EVIL()));
  const z = openZip(p);
  try {
    assert.deepEqual(z.entries.map((e) => e.name), ['secret.txt']);
    assert.equal(z.read('secret.txt').toString(), 'HELLO');
  } finally { z.close(); }
  assert.deepEqual(await testZip(p), { files: 1, bytes: 5 });
});

test('ZIP-001: extractZip writes the real entry (it used to extract nothing and say nothing)', async () => {
  const p = put(withComment(base(), EVIL())), out = join(dir, 'out-evil');
  await extractZip(p, out);
  assert.equal(readFileSync(join(out, 'secret.txt'), 'utf8'), 'HELLO');
});

test('ZIP-001: several false records in the comment, with different fields, are all passed over', () => {
  const comment = Buffer.concat([
    eocd({ total: 5, cdSize: 230, cdOff: 10 }), Buffer.from('x'),
    eocd({ total: 1, cdSize: 46, cdOff: 0 }), Buffer.from('yy'),
    eocd({ total: 0, cdSize: 0, cdOff: 0, comment: 3 }), Buffer.from('zzz'),
  ]);
  const p = put(withComment(base(), comment));
  assert.deepEqual(listZip(p).entries.map((e) => e.name), ['secret.txt']);
});

test('ZIP-001: the same holds when the real record is a zip64 one', () => {
  const zip = buildZip([{ name: 'secret.txt', data: 'HELLO', zip64: {} }, { name: 'b.txt', data: 'bravo' }], { zip64Eocd: true });
  const p = put(withComment(zip, EVIL()));
  assert.deepEqual(listZip(p).entries.map((e) => e.name), ['secret.txt', 'b.txt']);
  assert.equal(readZipFile(p, 'b.txt').toString(), 'bravo');
});

test('ZIP-001: bytes after the record are still tolerated when there is only one candidate', () => {
  const p = put(Buffer.concat([base(), Buffer.from('junk!')]));
  assert.deepEqual(listZip(p).entries.map((e) => e.name), ['secret.txt']);
});

test('ZIP-001: two records whose directories both end where they start are refused (EAMBIGUOUS), never one picked silently', async () => {
  const zip = base(), e = zip.lastIndexOf(SIG), cdOff = zip.readUInt32LE(e + 16);
  const prefix = Buffer.from('padding-in-the-comment'), q = zip.length + prefix.length; // where the false record will start
  // The false record points at the real directory and claims it runs on up to itself: 0 + (q - cdOff) lands exactly on its own start.
  const polyglot = Buffer.concat([prefix, eocd({ total: 1, cdSize: q - cdOff, cdOff })]);
  const p = put(withComment(zip, polyglot));
  assert.throws(() => openZip(p), (err) => err instanceof ZipError && err.code === 'EAMBIGUOUS');
  assert.throws(() => listZip(p), (err) => err instanceof ZipError && err.code === 'EAMBIGUOUS');
  await assert.rejects(testZip(p), (err) => err instanceof ZipError && err.code === 'EAMBIGUOUS');
});

test('ZIP-001: several candidates and none whose directory ends at its record are refused (EAMBIGUOUS)', () => {
  const zip = base(), e = zip.lastIndexOf(SIG);
  zip.writeUInt32LE(zip.readUInt32LE(e + 16) + 3, e + 16); // the real record now points three bytes off
  const p = put(withComment(zip, EVIL()));
  assert.throws(() => openZip(p), (err) => err instanceof ZipError && err.code === 'EAMBIGUOUS');
});

test('ZIP-001: at most 8 candidates are weighed; the 9th is refused without parsing them (EAMBIGUOUS)', () => {
  const falses = (k) => Buffer.concat(Array.from({ length: k }, () => eocd()));
  const ok = put(withComment(base(), falses(7))); // 8 candidates with the real one
  assert.deepEqual(listZip(ok).entries.map((x) => x.name), ['secret.txt']);
  const many = put(withComment(base(), falses(8))); // 9 candidates
  assert.throws(() => openZip(many), (err) => err instanceof ZipError && err.code === 'EAMBIGUOUS');
});

test('ZIP-001: a single candidate keeps every earlier error (no EAMBIGUOUS where there is nothing to choose)', () => {
  const zip = base(), e = zip.lastIndexOf(SIG);
  zip.writeUInt32LE(zip.length, e + 16); // central directory offset past the end of the file
  assert.throws(() => openZip(put(zip)), (err) => err instanceof ZipError && err.code !== 'EAMBIGUOUS');
});
