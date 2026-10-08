// C2.3: fast path for small entries and a folder cache in extractZip. Whatever the path, the guarantees of C2.1/C2.2 must hold:
// the same tree as an independent reader, CRC and size checked, a bad entry leaves nothing behind. The tests use sizes on
// both sides of any plausible threshold (0 bytes up to 1 MiB), stored and deflate, so they do not depend on the exact cut.
// Assertions use error classes, never message text. Speed is measured by packages/cairn-zip/bench/small-files.mjs, not here.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'cairn-zip-fast-')); mkdirSync(join(dir, 'zips')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (entries) => { const p = join(dir, 'zips', `z${n++}.zip`); writeFileSync(p, buildZip(entries)); return p; };
const parent = () => { const p = join(dir, `case${n++}`); mkdirSync(p); return p; };
const py = spawnSync('python3', ['-c', 'import zipfile']).status === 0;
const isZipError = (err) => err instanceof ZipError;

// Deterministic content: 'noise' does not compress, 'text' compresses very well.
const noise = (len, seed) => { const b = Buffer.alloc(len); let x = seed >>> 0 || 1; for (let i = 0; i < len; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; b[i] = x >>> 24; } return b; };
const text = (len) => Buffer.from('cairn '.repeat(Math.ceil(len / 6)).slice(0, len));
const SIZES = [0, 1, 255, 4095, 65535, 65536, 262143, 262144, 262145, 1048576];

// Recursive snapshot of a tree: relative path -> type, mode and content (independent of the code under test).
const snap = (root) => {
  const out = {};
  const walk = (p) => {
    const st = lstatSync(p), rel = relative(root, p) || '.';
    if (st.isDirectory()) { out[rel] = 'dir'; for (const c of readdirSync(p).sort()) walk(join(p, c)); }
    else out[rel] = `file:${(st.mode & 0o777).toString(8)}:${readFileSync(p).toString('hex')}`;
  };
  walk(root); return out;
};

test('every size, stored and deflate, extracts to the same bytes and the same tree as Python zipfile', { skip: !py }, async () => {
  const entries = [];
  for (const len of SIZES) for (const kind of ['noise', 'text']) for (const method of [0, 8]) {
    const data = kind === 'noise' ? noise(len, len + 7) : text(len);
    entries.push({ name: `s${len}/${kind}-m${method}.bin`, data, method, mode: method ? 0o100644 : 0o100755 });
  }
  const z = put(entries), p = parent(), ours = join(p, 'ours'), theirs = join(p, 'theirs');
  const r = await extractZip(z, ours);
  assert.equal(r.files, entries.length);
  const t = spawnSync('python3', ['-c', 'import sys,zipfile\nzipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', z, theirs], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stderr);
  const a = snap(ours), b = snap(theirs);
  assert.deepEqual(Object.keys(a), Object.keys(b));
  for (const e of entries) assert.equal(readFileSync(join(ours, e.name)).compare(e.data), 0, e.name);
  for (const k of Object.keys(a)) assert.equal(a[k].replace(/^file:[0-7]+:/, 'file:'), b[k].replace(/^file:[0-7]+:/, 'file:'), k);
});

test('modes and mtimes of small files are applied exactly as for large ones', async () => {
  const p = parent(), dest = join(p, 'out');
  await extractZip(put([
    { name: 'small-x.sh', data: '#!/bin/sh', mode: 0o100755 }, { name: 'small-ro.txt', data: 'x', method: 8, mode: 0o100444 },
    { name: 'big-x.sh', data: noise(300000, 3), mode: 0o100755 }, { name: 'empty.txt', data: '', mode: 0o100640 },
  ]), dest);
  for (const f of ['small-x.sh', 'big-x.sh']) assert.equal(statSync(join(dest, f)).mode & 0o777, 0o755, f);
  assert.equal(statSync(join(dest, 'small-ro.txt')).mode & 0o600, 0o600);
  assert.equal(statSync(join(dest, 'empty.txt')).mode & 0o777, 0o640);
  const want = statSync(join(dest, 'big-x.sh')).mtimeMs;
  for (const f of ['small-x.sh', 'small-ro.txt', 'empty.txt']) assert.equal(statSync(join(dest, f)).mtimeMs, want, `${f} has the zip's date like the large file`);
});

// A bad entry at any size must be refused (ZipError) with nothing left behind, however it gets read.
const BAD = {
  'CRC mismatch': (len) => ({ name: 'bad.bin', data: text(len), crc: 0x12345678 }),
  'CRC mismatch (deflate)': (len) => ({ name: 'bad.bin', data: text(len), method: 8, crc: 0x12345678 }),
  'declared size larger than the data': (len) => ({ name: 'bad.bin', data: text(len), usize: len + 5, csize: len }),
  'declared size smaller than the data (stored)': (len) => ({ name: 'bad.bin', data: text(len), usize: len - 1 }),
  'declared size smaller than the data (deflate bomb)': (len) => ({ name: 'bad.bin', data: text(len), method: 8, usize: len - 1 }),
  'corrupt deflate stream': (len) => ({ name: 'bad.bin', data: text(len), method: 8, rawData: noise(len, 9), csize: len }),
  'data runs past the end of the file': (len) => ({ name: 'bad.bin', data: text(len), csize: len + 100000 }),
};
for (const [label, make] of Object.entries(BAD)) for (const len of [2, 1000, 262143, 262145, 300000]) {
  test(`bad entry, ${label}, ${len} bytes: refused, new destination never created, existing one unchanged`, async () => {
    const z = put([{ name: 'ok/first.txt', data: 'one' }, make(len), { name: 'ok/last.txt', data: 'two', method: 8 }]);
    const p = parent(), dest = join(p, 'out'), before = readdirSync(p);
    await assert.rejects(extractZip(z, dest), isZipError);
    assert.deepEqual(readdirSync(p), before);
    mkdirSync(join(dest, 'keep'), { recursive: true }); writeFileSync(join(dest, 'keep', 'mine.txt'), 'mine');
    const b = snap(p);
    await assert.rejects(extractZip(z, dest, { overwrite: true }), isZipError);
    assert.deepEqual(snap(p), b);
  });
}

test('a tree with many files sharing folders, folder entries after their files, and empty folders comes out identical', { skip: !py }, async () => {
  const entries = [];
  for (let d = 0; d < 20; d++) for (let f = 0; f < 15; f++) entries.push({ name: `a${d % 4}/b${d}/c${d % 3}/f${f}.txt`, data: `file ${d}/${f}\n`.repeat(1 + f), method: f % 2 ? 8 : 0 });
  entries.push({ name: 'a0/b0/', dir: true, mode: 0o040750 }, { name: 'empty/deep/er/', dir: true });
  const z = put(entries), p = parent(), ours = join(p, 'ours'), theirs = join(p, 'theirs');
  const r = await extractZip(z, ours);
  assert.equal(r.files, 300);
  const t = spawnSync('python3', ['-c', 'import sys,zipfile\nzipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', z, theirs], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stderr);
  const strip = (s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.replace(/^file:[0-7]+:/, 'file:')]));
  assert.deepEqual(strip(snap(ours)), strip(snap(theirs)));
});

test('a file and a folder with the same name are still refused when the folder is already known to the extractor', async () => {
  const p = parent(), dest = join(p, 'out');
  await assert.rejects(extractZip(put([{ name: 'd/x.txt', data: 'one' }, { name: 'd/y.txt', data: 'two' }, { name: 'd', data: 'a file called d' }]), dest), isZipError);
  assert.deepEqual(readdirSync(p), []);
});

// On a normalising or case-insensitive file system (macOS) the second name collides with the first at write time and must be
// refused as ECOLLISION, never overwritten, small or large, with or without overwrite. On Linux both files exist and are
// reported in `collisions`. Only a Mac can turn this test red: it is part of the G-C3 re-run.
for (const [label, len] of [['small', 5], ['large', 300000]]) for (const overwrite of [false, true]) {
  test(`NFC/NFD name collision, ${label} files, overwrite=${overwrite}: ECOLLISION on a normalising file system, both kept elsewhere`, async () => {
    const p = parent(), dest = join(p, 'out'), nfc = 'é.txt', nfd = nfc.normalize('NFD');
    const r = await extractZip(put([{ name: nfc, data: text(len) }, { name: nfd, data: noise(len, 5) }]), dest, { overwrite }).catch((e) => e);
    if (r instanceof Error) { assert.ok(r instanceof ZipError); assert.equal(r.code, 'ECOLLISION'); assert.deepEqual(readdirSync(p), []); }
    else { assert.equal(r.collisions.length, 1); assert.equal(readdirSync(dest).length, 2); }
  });
}
