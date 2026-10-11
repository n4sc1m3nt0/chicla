// C3.9 (round 34, D32), written before the code: the WRITER reports names that collide on a normalising or case-insensitive file system.
// `collisions` is in the result of writeZip, writeZipStream and createZip: groups of PATHS (files, explicit folders and the folders implied by a
// file's path, folders spelled with a trailing «/») that differ only in NFC/NFD or case, a group needing at least one real entry (a file or an
// explicit folder). Same policy and same shape as extractZip (C2.5). Report only: nothing is refused, the zip is written as given.
// Assertions use error codes and group contents, never message text.
import { writeZip, writeZipStream, createZip, extractZip } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkZip } from './interop.mjs';

let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-wcoll-')); });
after(() => { rmSync(base, { recursive: true, force: true }); });
const fresh = () => { const d = join(base, `t${n++}`); mkdirSync(d); return d; };
const NFC = 'é', NFD = NFC.normalize('NFD');
const norm = (c) => c.map((g) => [...g].sort()).sort();
const D = (s) => ({ name: s, data: Buffer.from('data data data data') });
const F = (s) => ({ name: s.endsWith('/') ? s : `${s}/` });
const sinkOf = () => new Writable({ write(_c, _e, cb) { cb(); } });

// The same sources through the three writers; the caller says what each must report.
const viaWriteZip = async (sources) => writeZip(join(fresh(), 'a.zip'), sources);
const viaStream = async (sources) => writeZipStream(sinkOf(), sources.map((s) => (s.data ? { name: s.name, stream: [s.data] } : s)));
const viaCreate = async (sources) => {
  const root = join(fresh(), 'root'); mkdirSync(root);
  for (const s of sources) { if (s.name.endsWith('/')) mkdirSync(join(root, s.name), { recursive: true }); else { mkdirSync(join(root, s.name, '..'), { recursive: true }); writeFileSync(join(root, s.name), s.data); } }
  return createZip(join(fresh(), 'a.zip'), root);
};
const writers = { writeZip: viaWriteZip, writeZipStream: viaStream };

for (const [label, w] of Object.entries(writers)) {
  test(`${label}: NFC and NFD spellings of one file are reported as one group`, async () => {
    const r = await w([D(NFC), D(NFD)]);
    assert.deepEqual(norm(r.collisions), norm([[NFC, NFD]]));
  });
  test(`${label}: names that differ only in case are reported`, async () => {
    const r = await w([D('Readme.md'), D('README.md'), D('other.txt')]);
    assert.deepEqual(norm(r.collisions), norm([['Readme.md', 'README.md']]));
  });
  test(`${label}: a file and a folder that differ only in case collide, in either order`, async () => {
    assert.deepEqual(norm((await w([D('a'), D('A/b.txt')])).collisions), norm([['a', 'A/']]));
    assert.deepEqual(norm((await w([D('A/b.txt'), D('a')])).collisions), norm([['a', 'A/']]));
  });
  test(`${label}: two explicit folders that differ only in case collide`, async () => {
    assert.deepEqual(norm((await w([F('Dir'), F('dir')])).collisions), norm([['Dir/', 'dir/']]));
  });
  test(`${label}: folders that exist only because files sit inside them are not a collision`, async () => {
    const r = await w([D('Dir/a.txt'), D('dir/b.txt')]);
    assert.deepEqual(r.collisions, []);
  });
  test(`${label}: an explicit folder against an implied one differing in case is a collision`, async () => {
    assert.deepEqual(norm((await w([F('Dir'), D('dir/b.txt')])).collisions), norm([['Dir/', 'dir/']]));
  });
  test(`${label}: the whole path is folded: a/b.txt and A/B.txt are one group (their implied folders alone are not reported on top)`, async () => {
    const r = await w([D('a/b.txt'), D('A/B.txt')]);
    assert.deepEqual(norm(r.collisions), norm([['a/b.txt', 'A/B.txt']]));
  });
  test(`${label}: files at the same fold in different folders ARE a collision`, async () => {
    const r = await w([D('x/Readme'), D('x/README')]);
    assert.deepEqual(norm(r.collisions), norm([['x/Readme', 'x/README']]));
  });
  test(`${label}: no collisions gives an empty list, never undefined`, async () => {
    const r = await w([D('a.txt'), D('b.txt'), F('dir')]);
    assert.ok(Array.isArray(r.collisions)); assert.equal(r.collisions.length, 0);
  });
  test(`${label}: an empty sources list gives an empty list`, async () => {
    assert.deepEqual((await w([])).collisions, []);
  });
  test(`${label}: Greek final sigma and other folds the extractor catches are caught here too`, async () => {
    const r = await w([D('ΑΣ.txt'), D('ας.txt'), D('ασ.txt')]); // same triple as test/collisions.test.mjs
    assert.deepEqual(norm(r.collisions), norm([['ΑΣ.txt', 'ας.txt', 'ασ.txt']]));
  });
  test(`${label}: three spellings of one name are one group of three`, async () => {
    const r = await w([D(NFC), D(NFD), D(NFC.toUpperCase())]);
    assert.deepEqual(norm(r.collisions), norm([[NFC, NFD, NFC.toUpperCase()]]));
  });
}

test('writeZipStream: the report does not change what is written (ASCII names: Info-ZIP in a C locale mangles non-ASCII zip64 names)', async () => {
  const chunks = []; const w = new Writable({ write(c, _e, cb) { chunks.push(c); cb(); } });
  const r = await writeZipStream(w, [{ name: 'Readme', stream: [Buffer.from('one')] }, { name: 'README', stream: [Buffer.from('two')] }]);
  assert.equal(r.entries.length, 2); assert.equal(r.collisions.length, 1);
  const p = join(fresh(), 's.zip'); writeFileSync(p, Buffer.concat(chunks));
  const c = await checkZip(p, { Readme: 'one', README: 'two' });
  assert.ok(c.ran.length > 0); assert.deepEqual(c.problems, []);
});

test('writeZip: nothing is refused and both entries are written; the extractor reports the same group on the zip it gets back', async () => {
  const out = join(fresh(), 'a.zip');
  const r = await writeZip(out, [D(NFC), D(NFD)]);
  assert.equal(r.entries.length, 2);
  const x = await extractZip(out, join(fresh(), 'x')).catch((e) => e); // a normalising file system may refuse; Linux extracts both
  if (!(x instanceof Error)) assert.deepEqual(norm(x.collisions), norm(r.collisions));
});

test('createZip (buffered): collisions reach the result, next to entries and skipped', async () => {
  if (process.platform === 'darwin') return; // the tree itself cannot hold both names there
  const r = await viaCreate([D('Readme.md'), D('README.md')]);
  assert.deepEqual(norm(r.collisions), norm([['Readme.md', 'README.md']]));
  assert.ok(Array.isArray(r.skipped) && Array.isArray(r.entries));
});

test('createZip (stream: true, path): collisions reach the result', async () => {
  if (process.platform === 'darwin') return;
  const root = join(fresh(), 'root'); mkdirSync(root);
  writeFileSync(join(root, 'Readme.md'), 'a'); writeFileSync(join(root, 'README.md'), 'b');
  const r = await createZip(join(fresh(), 'a.zip'), root, { stream: true });
  assert.deepEqual(norm(r.collisions), norm([['Readme.md', 'README.md']]));
});

test('createZip (Writable): collisions reach the result', async () => {
  if (process.platform === 'darwin') return;
  const root = join(fresh(), 'root'); mkdirSync(root);
  writeFileSync(join(root, 'Readme.md'), 'a'); writeFileSync(join(root, 'README.md'), 'b');
  const r = await createZip(sinkOf(), root);
  assert.deepEqual(norm(r.collisions), norm([['Readme.md', 'README.md']]));
});

test('createZip with no collisions in the tree: empty list', async () => {
  const r = await viaCreate([D('a.txt'), D('d/b.txt')]);
  assert.deepEqual(r.collisions, []);
});

test('a refused write has no result: EUNSAFE and EDUP still win over the report (nothing is returned)', async () => {
  await assert.rejects(() => writeZip(join(fresh(), 'a.zip'), [D('a'), D('a')]), { code: 'EDUP' });
  await assert.rejects(() => writeZip(join(fresh(), 'b.zip'), [D('./x')]), { code: 'EUNSAFE' });
});
