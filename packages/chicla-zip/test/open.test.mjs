// R2 / C1.2: openZip returns a reusable handle. The central directory is read once, at open time.
// Error assertions use classes and codes, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, openSync, writeSync, closeSync, statSync, existsSync, readdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openZip, listZip, readZipFile, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-open-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };

const NFC = 'relatório.txt', NFD = NFC.normalize('NFD');
const sample = () => buildZip([
  { name: 'a.txt', data: 'alpha' },
  { name: 'd/', dir: true },
  { name: 'd/b.txt', data: 'bravo bravo bravo bravo', method: 8 },
  { name: NFC, data: 'accented', flags: 0x800 },
]);
const CD_SIG = Buffer.from([0x50, 0x4b, 0x01, 0x02]);

test('openZip: the handle exposes path, size, entries and the central directory offset', () => {
  const buf = sample(), p = put(buf), z = openZip(p);
  try {
    assert.equal(z.path, p);
    assert.equal(z.size, buf.length);
    assert.equal(z.cdOff, buf.indexOf(CD_SIG));
    assert.deepEqual(z.entries.map((e) => e.name), ['a.txt', 'd/', 'd/b.txt', NFC]);
    assert.deepEqual(z.entries, listZip(p).entries, 'same entries as listZip');
  } finally { z.close(); }
});

test('openZip: read() returns each file from one open handle, in any order, repeatedly', () => {
  const z = openZip(put(sample()));
  try {
    assert.equal(z.read('d/b.txt').toString(), 'bravo bravo bravo bravo');
    assert.equal(z.read('a.txt').toString(), 'alpha');
    assert.equal(z.read('d/b.txt').toString(), 'bravo bravo bravo bravo');
    assert.equal(z.read(NFD).toString(), 'accented', 'NFD request finds the NFC entry');
  } finally { z.close(); }
});

test('openZip: read() does not read the central directory again', () => {
  const buf = sample(), p = put(buf), z = openZip(p);
  try {
    // Wipe the on-disk central directory behind the open handle: only a handle that cached the entries still works.
    const fd = openSync(p, 'r+');
    writeSync(fd, Buffer.alloc(statSync(p).size - z.cdOff), 0, buf.length - z.cdOff, z.cdOff);
    closeSync(fd);
    assert.equal(z.read('a.txt').toString(), 'alpha');
    assert.equal(z.read('d/b.txt').toString(), 'bravo bravo bravo bravo');
    assert.throws(() => readZipFile(p, 'a.txt'), ZipError, 'a fresh read sees the wiped directory');
  } finally { z.close(); }
});

test('openZip: read() keeps every refusal of readZipFile', () => {
  const body = 'payload payload payload';
  const z = openZip(put(buildZip([
    { name: 'ok.txt', data: 'fine' },
    { name: 'badcrc.txt', data: body, crc: 0xdeadbeef },
    { name: 'badsize.txt', data: body, method: 8, usize: 5 },
    { name: 'bz.txt', data: 'abc', methodField: 12 },
    { name: 'big.bin', data: Buffer.alloc(2000, 1) },
    { name: 'd/', dir: true },
  ])));
  try {
    assert.equal(z.read('ok.txt').toString(), 'fine');
    for (const name of ['badcrc.txt', 'badsize.txt', 'bz.txt']) assert.throws(() => z.read(name), ZipError, name);
    assert.throws(() => z.read('nope.txt'), (e) => e instanceof ZipError && e.code === 'ENOENT');
    assert.throws(() => z.read('d/'), (e) => e instanceof ZipError && e.code === 'ENOENT');
    assert.throws(() => z.read('big.bin', { maxBytes: 1000 }), ZipError);
    assert.equal(z.read('big.bin', { maxBytes: 2000 }).length, 2000);
    assert.equal(z.read('ok.txt').toString(), 'fine', 'a failed read does not poison the handle');
  } finally { z.close(); }
});

test('openZip: after close() reads fail with ECLOSED, and close() can be called twice', () => {
  const z = openZip(put(sample()));
  assert.equal(z.read('a.txt').toString(), 'alpha');
  z.close();
  assert.throws(() => z.read('a.txt'), (e) => e instanceof ZipError && e.code === 'ECLOSED');
  assert.doesNotThrow(() => z.close());
});

test('openZip: refuses what listZip refuses (not a zip, truncated, multi-part) with the same codes', () => {
  const good = buildZip([{ name: 'a.txt', data: 'abc' }]);
  assert.throws(() => openZip(put(Buffer.alloc(0))), (e) => e instanceof ZipError && e.code === 'ENOTZIP');
  assert.throws(() => openZip(put(good.subarray(0, good.length - 10))), (e) => e instanceof ZipError && e.code === 'ENOTZIP');
  assert.throws(() => openZip(put(buildZip([{ name: 'a.txt', data: 'abc' }], { eocd: { disk: 1, cdDisk: 1 } }))), ZipError);
});

test('openZip: a missing file is a ZipError with code ENOENT, keeping the system error as cause (round 37)', () => {
  const p = join(dir, 'does-not-exist.zip');
  assert.throws(() => openZip(p), (e) => e instanceof ZipError && e.code === 'ENOENT' && e.cause?.code === 'ENOENT' && e.cause?.syscall === 'open');
});

test('openZip: a directory is a ZipError with code EISDIR, and listZip and readZipFile give the same errors (round 37)', () => {
  const miss = join(dir, 'does-not-exist.zip');
  for (const f of [() => openZip(dir), () => listZip(dir), () => readZipFile(dir, 'a.txt')]) assert.throws(f, (e) => e instanceof ZipError && e.code === 'EISDIR');
  for (const f of [() => listZip(miss), () => readZipFile(miss, 'a.txt')]) assert.throws(f, (e) => e instanceof ZipError && e.code === 'ENOENT');
});

test('openZip: an unreadable file is a ZipError with the system code (round 37)', { skip: (process.getuid?.() === 0 && 'root can read anything') || (process.platform === 'win32' && 'chmod 000 does not make a file unreadable on Windows') }, () => {
  const p = put(sample()); chmodSync(p, 0o000);
  assert.throws(() => openZip(p), (e) => e instanceof ZipError && e.code === 'EACCES');
});

test('openZip: ENOENT for a missing zip and ENOENT for a missing name are both ZipErrors, told apart by message only through the path (round 37)', () => {
  const z = openZip(put(sample()));
  assert.throws(() => z.read('nope.txt'), (e) => e instanceof ZipError && e.code === 'ENOENT' && e.cause === undefined);
  z.close();
});

test('openZip: no descriptor leaks, on success or on failure', () => {
  const fds = () => (existsSync('/proc/self/fd') ? readdirSync('/proc/self/fd').length : null);
  const bad = put(Buffer.from('not a zip')), good = put(sample());
  const before = fds();
  for (let i = 0; i < 2000; i++) assert.throws(() => openZip(bad), ZipError);
  for (let i = 0; i < 2000; i++) openZip(good).close();
  const after = fds();
  if (before !== null) assert.equal(after, before, 'descriptor count changed: a handle was leaked');
});

test('listZip and readZipFile release the descriptor, on success and on failure', () => {
  const fds = () => (existsSync('/proc/self/fd') ? readdirSync('/proc/self/fd').length : null);
  const good = put(sample()), bad = put(Buffer.from('not a zip'));
  const before = fds();
  for (let i = 0; i < 1000; i++) {
    listZip(good);
    readZipFile(good, 'a.txt');
    assert.throws(() => readZipFile(good, 'nope.txt'), ZipError); // open succeeds, read fails: the finally must still close
    assert.throws(() => listZip(bad), ZipError);
    assert.throws(() => readZipFile(bad, 'a.txt'), ZipError);
  }
  const after = fds();
  if (before !== null) assert.equal(after, before, 'descriptor count changed: a handle was leaked');
});
