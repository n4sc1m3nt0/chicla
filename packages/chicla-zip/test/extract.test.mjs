// C2.1 / C2.2: atomic extraction and full pre-validation. Zips are fabricated by test/zipfab.mjs.
// "Untouched" is checked by snapshots of the parent folder before and after (the leak oracle), never by extractZip itself.
// Assertions use error classes and codes, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, rmSync, symlinkSync, statSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';
const WIN = process.platform === 'win32';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-extract-')); mkdirSync(join(dir, 'zips')); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const put = (entries, opts) => { const p = join(dir, 'zips', `z${n++}.zip`); writeFileSync(p, buildZip(entries, opts)); return p; };
// A fresh parent folder per case, so "nothing left behind" means "the parent is exactly as it was".
const parent = () => { const p = join(dir, `case${n++}`); mkdirSync(p); return p; };

// Recursive snapshot: relative path -> type, mode (files) and content. Independent of the code under test.
const snap = (root) => {
  const out = {};
  const walk = (p) => {
    const st = lstatSync(p), rel = relative(root, p) || '.';
    if (st.isDirectory()) { out[rel] = 'dir'; for (const c of readdirSync(p).sort()) walk(join(p, c)); }
    else if (st.isSymbolicLink()) out[rel] = 'symlink';
    else out[rel] = `file:${(st.mode & 0o777).toString(8)}:${readFileSync(p).toString('hex')}`;
  };
  walk(root); return out;
};
const shape = (s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.replace(/^file:[0-7]+:/, 'file:')]));
const code = (c) => (err) => err instanceof ZipError && err.code === c;
const isZipError = (err) => err instanceof ZipError;

const OK = [{ name: 'a.txt', data: 'alpha' }, { name: 'd/b.txt', data: 'bravo', method: 8 }, { name: 'd/e/', dir: true }, { name: 'd/e/c.txt', data: 'charlie' }];
const py = spawnSync('python3', ['-c', 'import zipfile']).status === 0;

// ---------- C2.1: atomic ----------
test('extracts into a destination that does not exist, creating missing parents, and leaves no temp folder behind', () => {
  const p = parent(), dest = join(p, 'x', 'y', 'out');
  return extractZip(put(OK), dest).then((r) => {
    assert.equal(r.files, 3);
    assert.equal(readFileSync(join(dest, 'd/e/c.txt'), 'utf8'), 'charlie');
    assert.deepEqual(readdirSync(join(p, 'x', 'y')), ['out']);
  });
});

test('the tree matches what Python zipfile extracts (independent reader)', { skip: !py }, async () => {
  const z = put(OK), p = parent(), dest = join(p, 'ours'), theirs = join(p, 'theirs');
  await extractZip(z, dest);
  const r = spawnSync('python3', ['-c', 'import sys,zipfile\nzipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', z, theirs], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(shape(snap(dest)), shape(snap(theirs)));
});

test('a destination that is an existing empty folder is filled, and keeps its own identity and mode', async () => {
  const p = parent(), dest = join(p, 'out'); mkdirSync(dest, { mode: 0o750 }); chmodSync(dest, 0o750);
  const ino = statSync(dest).ino;
  await extractZip(put(OK), dest);
  assert.equal(statSync(dest).ino, ino);
  if (!WIN) assert.equal(statSync(dest).mode & 0o777, 0o750); // Windows has no mode bits
  assert.equal(readFileSync(join(dest, 'a.txt'), 'utf8'), 'alpha');
  assert.deepEqual(readdirSync(p), ['out']);
});

test('a new destination gets the default folder mode (0777 & ~umask), not the temp folder mode', { skip: WIN && 'modes and umask do not exist on Windows' }, async () => {
  const p = parent(), dest = join(p, 'out'), um = process.umask();
  await extractZip(put(OK), dest);
  assert.equal(statSync(dest).mode & 0o777, 0o777 & ~um);
});

test('file modes from the zip are kept (exec bit) with the owner always able to read and write', { skip: WIN && 'Windows has no mode bits' }, async () => {
  const p = parent(), dest = join(p, 'out');
  await extractZip(put([{ name: 'run.sh', data: '#!/bin/sh', mode: 0o100755 }, { name: 'ro.txt', data: 'x', mode: 0o100444 }]), dest);
  assert.equal(statSync(join(dest, 'run.sh')).mode & 0o777, 0o755);
  assert.equal(statSync(join(dest, 'ro.txt')).mode & 0o600, 0o600);
});

const BAD_LATE = [{ name: 'first.txt', data: 'one' }, { name: 'sub/second.txt', data: 'two', method: 8 }, { name: 'sub/third.txt', data: 'three', crc: 0x12345678 }];
const BAD_CASES = {
  'CRC mismatch in the last file': BAD_LATE,
  'declared size larger than the data': [{ name: 'ok.txt', data: 'fine' }, { name: 'bad.txt', data: 'abc', usize: 99, csize: 3 }],
  'data runs past the end of the file': [{ name: 'ok.txt', data: 'fine' }, { name: 'bad.txt', data: 'abc', csize: 5000 }],
  'deflate stream that is corrupt': [{ name: 'ok.txt', data: 'fine' }, { name: 'bad.txt', data: 'abc', method: 8, rawData: Buffer.from([0xff, 0xff, 0xff, 0xff]), csize: 4, usize: 3 }],
  'stream larger than declared': [{ name: 'ok.txt', data: 'fine' }, { name: 'bad.txt', data: 'abcdefgh', usize: 3 }],
};
for (const [name, entries] of Object.entries(BAD_CASES)) {
  test(`failure halfway (${name}): a new destination is never created and no temp folder is left`, async () => {
    const p = parent(), dest = join(p, 'out'), before = readdirSync(p);
    await assert.rejects(extractZip(put(entries), dest), isZipError);
    assert.deepEqual(readdirSync(p), before);
  });
  test(`failure halfway (${name}): an existing destination is byte-for-byte unchanged`, async () => {
    const p = parent(), dest = join(p, 'out'); mkdirSync(join(dest, 'keep'), { recursive: true });
    writeFileSync(join(dest, 'keep', 'mine.txt'), 'mine'); writeFileSync(join(dest, 'ok.txt'), 'old');
    const before = snap(p);
    await assert.rejects(extractZip(put(entries), dest, { overwrite: true }), isZipError);
    assert.deepEqual(snap(p), before);
  });
}

test('merging into an existing folder without overwrite: new files arrive, existing ones are untouched', async () => {
  const p = parent(), dest = join(p, 'out'); mkdirSync(join(dest, 'd'), { recursive: true });
  writeFileSync(join(dest, 'mine.txt'), 'mine'); writeFileSync(join(dest, 'd', 'other.txt'), 'other');
  await extractZip(put(OK), dest);
  assert.equal(readFileSync(join(dest, 'mine.txt'), 'utf8'), 'mine');
  assert.equal(readFileSync(join(dest, 'd', 'other.txt'), 'utf8'), 'other');
  assert.equal(readFileSync(join(dest, 'd', 'b.txt'), 'utf8'), 'bravo');
  assert.equal(readFileSync(join(dest, 'd', 'e', 'c.txt'), 'utf8'), 'charlie');
});

test('a file that already exists without overwrite: refused, and NOTHING from the zip is written (not even the other files)', async () => {
  const p = parent(), dest = join(p, 'out'); mkdirSync(join(dest, 'd', 'e'), { recursive: true });
  writeFileSync(join(dest, 'd', 'e', 'c.txt'), 'mine');
  const before = snap(p);
  await assert.rejects(extractZip(put(OK), dest), code('EEXIST'));
  assert.deepEqual(snap(p), before);
});

test('overwrite replaces an existing file', async () => {
  const p = parent(), dest = join(p, 'out'); mkdirSync(dest); writeFileSync(join(dest, 'a.txt'), 'old');
  await extractZip(put(OK), dest, { overwrite: true });
  assert.equal(readFileSync(join(dest, 'a.txt'), 'utf8'), 'alpha');
});

test('overwrite never turns a folder into a file or a file into a folder: refused, nothing written', async () => {
  const p1 = parent(), d1 = join(p1, 'out'); mkdirSync(join(d1, 'a.txt'), { recursive: true });
  const b1 = snap(p1);
  await assert.rejects(extractZip(put(OK), d1, { overwrite: true }), code('EEXIST'));
  assert.deepEqual(snap(p1), b1);
  const p2 = parent(), d2 = join(p2, 'out'); mkdirSync(d2); writeFileSync(join(d2, 'd'), 'i am a file');
  const b2 = snap(p2);
  await assert.rejects(extractZip(put(OK), d2, { overwrite: true }), code('EEXIST'));
  assert.deepEqual(snap(p2), b2);
});

test('a destination that is an existing file is refused and untouched', async () => {
  const p = parent(), dest = join(p, 'out'); writeFileSync(dest, 'file');
  await assert.rejects(extractZip(put(OK), dest), code('EEXIST'));
  assert.equal(readFileSync(dest, 'utf8'), 'file');
});

test('a destination that is a symlink to a folder: files go into the real folder and the symlink survives', async () => {
  const p = parent(), real = join(p, 'real'), link = join(p, 'link'); mkdirSync(real); symlinkSync(real, link);
  await extractZip(put(OK), link);
  assert.equal(lstatSync(link).isSymbolicLink(), true);
  assert.equal(readFileSync(join(real, 'a.txt'), 'utf8'), 'alpha');
});

test('a destination that is a dangling symlink is refused', async () => {
  const p = parent(), link = join(p, 'link'); symlinkSync(join(p, 'nowhere'), link);
  await assert.rejects(extractZip(put(OK), link), isZipError);
  assert.equal(lstatSync(link).isSymbolicLink(), true);
});

// ---------- C2.2: pre-validation, all before writing ----------
const refusedUntouched = async (entries, opts, c = 'EUNSAFE') => {
  const p = parent(), dest = join(p, 'out'), before = readdirSync(p);
  await assert.rejects(extractZip(put(entries), dest, opts), code(c));
  assert.deepEqual(readdirSync(p), before);
};

test('file and folder with the same path: refused up front, in any order', async () => {
  await refusedUntouched([{ name: 'x', data: 'f' }, { name: 'x/y', data: 'g' }]);
  await refusedUntouched([{ name: 'x/y', data: 'g' }, { name: 'x', data: 'f' }]);
  await refusedUntouched([{ name: 'x/', dir: true }, { name: 'x', data: 'f' }]);
  await refusedUntouched([{ name: 'x', data: 'f' }, { name: 'x/', dir: true }]);
  await refusedUntouched([{ name: 'a/b', data: 'f' }, { name: 'a/b/c/d', data: 'g' }]);
});

test('duplicate names are refused even when they only differ in how the path is written', async () => {
  await refusedUntouched([{ name: 'a/b.txt', data: '1' }, { name: 'a/b.txt', data: '2' }]);
  await refusedUntouched([{ name: 'a/b.txt', data: '1' }, { name: './a//b.txt', data: '2' }]);
});

test('the same folder listed twice is fine', async () => {
  const p = parent(), dest = join(p, 'out');
  await extractZip(put([{ name: 'd/', dir: true }, { name: 'd/f', data: 'x' }, { name: 'd/', dir: true }]), dest);
  assert.equal(readFileSync(join(dest, 'd', 'f'), 'utf8'), 'x');
});

test('an entry named "." is reported in skipped, never silently dropped, and the rest still extracts', async () => {
  const p = parent(), dest = join(p, 'out');
  const r = await extractZip(put([{ name: './', dir: true, mode: 0o040700 }, { name: '.', data: 'payload' }, { name: 'ok.txt', data: 'fine' }]), dest);
  assert.equal(r.files, 1);
  assert.deepEqual(r.skipped.map((s) => s.name).sort(), ['.', './']);
  assert.deepEqual(readdirSync(dest), ['ok.txt']);
  if (!WIN) assert.equal(statSync(dest).mode & 0o777, 0o777 & ~process.umask(), 'the zip does not set the destination root mode'); // Windows has no mode bits
});

test('limits are checked before writing: entry count and total declared bytes', async () => {
  await refusedUntouched(OK, { maxEntries: 2 }, 'EZIP');
  await refusedUntouched([{ name: 'a', data: 'abcd' }, { name: 'b', data: 'efgh' }], { maxTotalBytes: 7 });
});

test('unsafe names and unsupported entries refuse the whole extraction before anything is written', async () => {
  await refusedUntouched([{ name: 'ok.txt', data: 'x' }, { name: '../evil.txt', data: 'y' }]);
  await refusedUntouched([{ name: 'ok.txt', data: 'x' }, { name: '/abs.txt', data: 'y' }]);
  await refusedUntouched([{ name: 'ok.txt', data: 'x' }, { name: 'enc.txt', data: 'y', flags: 1 }]);
  await refusedUntouched([{ name: 'ok.txt', data: 'x' }, { name: 'm.txt', data: 'y', methodField: 12 }]);
});

test('symlink entries are skipped and reported, never created', async () => {
  const p = parent(), dest = join(p, 'out');
  const r = await extractZip(put([{ name: 'ok.txt', data: 'x' }, { name: 'link', data: '/etc', mode: 0o120777 }]), dest);
  assert.deepEqual(r.skipped.map((s) => s.name), ['link']);
  assert.deepEqual(readdirSync(dest), ['ok.txt']);
});

test('NFC/NFD and case collisions are reported, not refused', async () => {
  const p = parent(), dest = join(p, 'out'), nfc = 'é.txt', nfd = nfc.normalize('NFD');
  const r = await extractZip(put([{ name: nfc, data: '1' }, { name: nfd, data: '2' }]), dest).catch((e) => e);
  // On a normalising file system the second one collides at write time (ECOLLISION); on Linux both exist and are reported.
  if (r instanceof Error) assert.ok(r instanceof ZipError);
  else assert.equal(r.collisions.length, 1);
});

test('a symlink inside an existing destination is never followed or replaced, even with overwrite: refused, nothing changes', async () => {
  for (const linkName of ['a.txt', 'd']) {
    const p = parent(), dest = join(p, 'out'), outside = join(p, 'outside'); mkdirSync(dest); mkdirSync(outside);
    writeFileSync(join(outside, 'secret.txt'), 'secret'); symlinkSync(linkName === 'd' ? outside : join(outside, 'secret.txt'), join(dest, linkName));
    const before = snap(p);
    await assert.rejects(extractZip(put(OK), dest, { overwrite: true }), code('EUNSAFE'), linkName);
    assert.deepEqual(snap(p), before, linkName);
  }
});
