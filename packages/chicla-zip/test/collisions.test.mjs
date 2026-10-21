// C2.5: `collisions` in the result of extractZip. Names that differ only in NFC/NFD or in case are reported per PATH (files, explicit
// folders and the folders implied by a file's path), never just per entry name. Zips are fabricated by test/zipfab.mjs.
// Policy under test: a group is reported when it has two or more spellings and at least one of them is not a purely implied folder
// (folders that exist only because files sit inside them merge without losing anything). Folders are spelled with a trailing «/».
// On a normalising or case-insensitive file system (macOS) the file system itself refuses some of these zips (ECOLLISION / EEXIST):
// that is also correct, and the assertions on `collisions` then do not apply. Only Linux can turn them red; a Mac re-run is G-C3.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-collisions-')); mkdirSync(join(dir, 'zips')); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const put = (entries) => { const p = join(dir, 'zips', `z${n++}.zip`); writeFileSync(p, buildZip(entries)); return p; };
const parent = () => { const p = join(dir, `case${n++}`); mkdirSync(p); return p; };

// Each group sorted, the list sorted; null when the file system itself refused the zip (a ZipError, which is acceptable there).
const groupsOf = async (entries) => {
  const dest = join(parent(), 'out');
  const r = await extractZip(put(entries), dest).catch((e) => e);
  if (r instanceof Error) { assert.ok(r instanceof ZipError, `unexpected ${r}`); return null; }
  return r.collisions.map((g) => [...g].sort()).sort();
};
const expectGroups = async (entries, expected) => {
  const got = await groupsOf(entries);
  if (got) assert.deepEqual(got, expected.map((g) => [...g].sort()).sort());
};
const NFC = 'é', NFD = NFC.normalize('NFD');

test('a file and a folder that differ only in case collide: reported, in either order', async () => {
  await expectGroups([{ name: 'a', data: 'file' }, { name: 'A/b.txt', data: 'in folder' }], [['a', 'A/']]);
  await expectGroups([{ name: 'A/b.txt', data: 'in folder' }, { name: 'a', data: 'file' }], [['a', 'A/']]);
});

test('a file and a folder that differ only in NFC/NFD collide: reported', async () => {
  await expectGroups([{ name: NFC, data: 'file' }, { name: `${NFD}/b.txt`, data: 'in folder' }], [[NFC, `${NFD}/`]]);
  await expectGroups([{ name: NFD, data: 'file' }, { name: `${NFC}/b.txt`, data: 'in folder' }], [[NFD, `${NFC}/`]]);
});

test('the clash is found at any depth of the path, and the implied parents are not reported', async () => {
  await expectGroups([{ name: 'x/a', data: 'file' }, { name: 'X/A/b.txt', data: 'deeper' }], [['x/a', 'X/A/']]);
});

test('explicit folder entries that differ only in case are reported', async () => {
  await expectGroups([{ name: 'Foo/', dir: true }, { name: 'foo/', dir: true }], [['Foo/', 'foo/']]);
});

test('pin: folders that exist only because files sit inside them merge without a report', async () => {
  await expectGroups([{ name: 'Foo/x.txt', data: 'one' }, { name: 'foo/y.txt', data: 'two' }], []);
});

test('pin: the same file under differently spelled folders is reported once, as the files', async () => {
  await expectGroups([{ name: 'Foo/x.txt', data: 'one' }, { name: 'foo/x.txt', data: 'two' }], [['Foo/x.txt', 'foo/x.txt']]);
});

test('case folding goes beyond toLowerCase: Greek final sigma (ΑΣ, ας, ασ) is one group of three', async () => {
  const names = ['ΑΣ.txt', 'ας.txt', 'ασ.txt'];
  await expectGroups(names.map((name, i) => ({ name, data: String(i) })), [names]);
});

test('pin: names that really differ are never reported', async () => {
  await expectGroups(['a.txt', 'b.txt', 'ab.txt', 'A.bak', 'd/a.txt'].map((name) => ({ name, data: name })), []);
});
