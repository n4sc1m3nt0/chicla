// Round 200 / C15.18 / G-C5 ZIP-015 (D135, third security review): the end record chosen by chicla must be the LAST one of the tail.
// Python and unzip take the last end record they find and trust it. A record after the one chicla chose was ignored when it was empty (size 0)
// or did not parse for chicla (a disk number, zip64 markers without a locator), so the readers described two different archives.
// Now any end record after the chosen one is EAMBIGUOUS, with no exception; records BEFORE it (a stored zip inside an entry) are still ignored.
// Hostile bytes come from test/zipraw.mjs, never from the writer under test; Python is the independent reader. Assertions use error codes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openZip, listZip, readZipFile, testZip, extractZip, ZipError } from '../src/zipkit.mjs';
import { local, central, eocd } from './zipraw.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-lastrec-')); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };
const refused = (err) => err instanceof ZipError && err.code === 'EAMBIGUOUS';
const names = (p) => listZip(p).entries.map((e) => e.name);
const havePython = spawnSync('python3', ['-c', '1'], { stdio: 'ignore' }).status === 0;
const pyNames = (p) => JSON.parse(spawnSync('python3', ['-I', '-c', 'import sys,json,zipfile;print(json.dumps([i.filename for i in zipfile.ZipFile(sys.argv[1]).infolist()]))', p], { encoding: 'utf8' }).stdout || '[]');

// one honest zip, as pieces: local | central | real record (comment = what the caller gives)
const zipOf = (name, data, comment = Buffer.alloc(0)) => {
  const l = local(name, data), c = central(name, data, 0);
  return Buffer.concat([l, c, eocd({ total: 1, cdSize: c.length, cdOff: l.length, comment })]);
};
const EMPTY_RECORD = eocd({ total: 0, cdSize: 0, cdOff: 0 });
// the second PoC of the report: a benign zip, then an evil zip whose record has disk number 1 (chicla: multi-part, "not a directory"; Python ignores the disk)
const benignThenEvilDisk = () => {
  const evil = Buffer.from(zipOf('evil.txt', 'evil\n')), e = evil.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  evil.writeUInt16LE(1, e + 4);
  return Buffer.concat([zipOf('benign.txt', 'benign\n'), evil]);
};

test('ZIP-015 PoC A: an empty end record in the comment is refused by every entry point, nothing is written', async () => {
  const p = put(zipOf('payload.txt', 'hidden from python and unzip\n', EMPTY_RECORD));
  assert.throws(() => openZip(p), refused);
  assert.throws(() => listZip(p), refused);
  assert.throws(() => readZipFile(p, 'payload.txt'), refused);
  await assert.rejects(testZip(p), refused);
  const out = join(dir, 'out-a');
  await assert.rejects(extractZip(p, out), refused);
  assert.equal(existsSync(out), false, 'nothing is written for a refused zip');
});

test('ZIP-015 PoC A: the fixture is a real differential, Python sees an EMPTY archive', { skip: !havePython }, () => {
  assert.deepEqual(pyNames(put(zipOf('payload.txt', 'x', EMPTY_RECORD))), []);
});

test('ZIP-015 PoC B: a trailing record that does not parse for chicla (disk number 1) is refused', async () => {
  const p = put(benignThenEvilDisk());
  assert.throws(() => openZip(p), refused);
  await assert.rejects(extractZip(p, join(dir, 'out-b')), refused);
  assert.equal(existsSync(join(dir, 'out-b')), false);
});

test('ZIP-015 PoC B: the fixture is a real differential, Python reads the OTHER archive', { skip: !havePython }, () => {
  assert.deepEqual(pyNames(put(benignThenEvilDisk())), ['evil.txt']);
});

test('ZIP-015: a trailing record that is zip64 markers without a locator (does not parse) is refused', () => {
  const l = local('good.txt', 'g'), c = central('good.txt', 'g', 0);
  const real = eocd({ total: 1, cdSize: c.length, cdOff: l.length });
  const markers = eocd({ total: 1, cdSize: 0xffffffff, cdOff: 0xffffffff });
  assert.throws(() => openZip(put(Buffer.concat([l, c, real, markers]))), refused);
});

test('ZIP-015: a comment that merely contains the text of an end record is refused (documented cost of the rule)', () => {
  assert.throws(() => openZip(put(zipOf('a.txt', 'a', Buffer.concat([Buffer.from('PK'), Buffer.from([5, 6]), Buffer.alloc(18)])))), refused);
});

test('ZIP-015: the code is the same for a record far after the real one (the whole tail is looked at)', () => {
  assert.throws(() => openZip(put(zipOf('a.txt', 'a', Buffer.concat([Buffer.alloc(30000, 0x61), EMPTY_RECORD, Buffer.alloc(100, 0x62)])))), refused);
});

test('ZIP-015 controls: a stored zip inside an entry (its record is BEFORE the real one) is still read, and so is an honest comment', () => {
  const inner = zipOf('in.txt', 'inner');
  const l = local('inner.zip', inner), c = central('inner.zip', inner, 0);
  const p = put(Buffer.concat([l, c, eocd({ total: 1, cdSize: c.length, cdOff: l.length })]));
  assert.deepEqual(names(p), ['inner.zip']);
  assert.deepEqual(readZipFile(p, 'inner.zip'), inner);
  assert.deepEqual(names(put(zipOf('good.txt', 'g', Buffer.from('just a comment')))), ['good.txt']);
  assert.deepEqual(names(put(Buffer.concat([zipOf('good.txt', 'g'), Buffer.from('junk after the only record')]))), ['good.txt']);
});

test('ZIP-015 docs: §2 of zip-handling.md says the last record rules, and no longer says trailing records are ignored', () => {
  const doc = readFileSync(new URL('../../../docs/zip-handling.md', import.meta.url), 'utf8');
  assert.match(doc, /ZIP-015/);
  assert.match(doc, /any end record AFTER it is `EAMBIGUOUS`/);
  assert.doesNotMatch(doc, /trailing records whose size leads nowhere are still ignored/);
});
