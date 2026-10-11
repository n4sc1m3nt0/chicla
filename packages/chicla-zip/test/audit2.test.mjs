// AUDIT-2 (round 32), written before the fixes. Three findings of the M3 audit:
//   A-1  `<out>.partial` is opened with flags "w": a symlink planted there makes writeZip / createZip overwrite whatever it points to.
//        Fix: any existing `<out>.partial` is removed first (a link is removed, never followed), then created exclusively (O_EXCL|O_NOFOLLOW).
//   A-2  `createZip({ stream: true })` to a path did not fsync the folder after the rename (writeZip does). Not testable (fsync): see AUDIT-2 §3.
//        Related and testable: the same missing-folder failure was EZIP here and ENOENT in writeZip; both are ENOENT now.
//   A-3  The writer accepted names with an empty or "." segment ("./x", "a//b", "a/./b", "a//"): a zip with both "x" and "./x" passes `unzip -t`
//        but Chicla's own extractor refuses it as a duplicate and `unzip` silently keeps the last one. The WRITER now refuses them (EUNSAFE, nothing
//        written). The reader and extractor still accept such names from other tools (D31, proposed).
// Assertions use error codes, never message text. Linux and macOS only (symlinks).
import { writeZip, writeZipStream, createZip, testZip, extractZip, ZipError } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkZip } from './interop.mjs';
import { buildZip } from './zipfab.mjs';

let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-audit2-')); });
after(() => { rmSync(base, { recursive: true, force: true }); });
const fresh = () => { const d = join(base, `t${n++}`); mkdirSync(d); return d; };
const sink = () => { const w = new Writable({ write(_c, _e, cb) { cb(); } }); return w; };
const tree = () => { const root = join(fresh(), 'root'); mkdirSync(root); writeFileSync(join(root, 'f.txt'), 'data data data data'); return root; };

test('A-1 writeZip: a symlink planted at <out>.partial is replaced, never followed; the victim keeps its bytes', async () => {
  const d = fresh(), victim = join(d, 'victim.txt'), out = join(d, 'a.zip');
  writeFileSync(victim, 'PRECIOUS'); symlinkSync(victim, `${out}.partial`);
  await writeZip(out, [{ name: 'x', data: Buffer.from('hi') }]);
  assert.equal(readFileSync(victim, 'utf8'), 'PRECIOUS');
  assert.equal(readFileSync(out).subarray(0, 2).toString(), 'PK');
  assert.equal((await testZip(out)).files, 1);
  assert.deepEqual(readdirSync(d).filter((x) => x.endsWith('.partial')), []);
});

test('A-1 createZip stream:true to a path: same, the victim keeps its bytes', async () => {
  const d = fresh(), victim = join(d, 'victim.txt'), out = join(d, 'b.zip');
  writeFileSync(victim, 'PRECIOUS'); symlinkSync(victim, `${out}.partial`);
  await createZip(out, tree(), { stream: true });
  assert.equal(readFileSync(victim, 'utf8'), 'PRECIOUS');
  assert.equal((await testZip(out)).files, 1);
  assert.deepEqual(readdirSync(d).filter((x) => x.endsWith('.partial')), []);
});

test('A-1 a dangling symlink at <out>.partial is replaced too, and its target is not created', async () => {
  const d = fresh(), ghost = join(d, 'ghost.txt'), out = join(d, 'c.zip');
  symlinkSync(ghost, `${out}.partial`);
  await writeZip(out, [{ name: 'x', data: Buffer.from('hi') }]);
  assert.throws(() => lstatSync(ghost), { code: 'ENOENT' });
  await createZip(join(d, 'e.zip'), tree(), { stream: true }); // control: normal path still works
});

test('A-1 a failed run leaves no <out>.partial and does not touch the victim (symlink planted, then a refusal after the open)', async () => {
  const d = fresh(), victim = join(d, 'victim.txt'), out = join(d, 'f.zip');
  writeFileSync(victim, 'PRECIOUS'); symlinkSync(victim, `${out}.partial`);
  const root = tree(); symlinkSync(join(root, 'f.txt'), join(root, 'l'));
  await assert.rejects(createZip(out, root, { stream: true, symlinks: 'error' }), (e) => e instanceof ZipError && e.code === 'ESYMLINK');
  assert.equal(readFileSync(victim, 'utf8'), 'PRECIOUS');
});

test('A-2 a missing output folder has the same code in every path: ENOENT', async () => {
  const d = fresh(), out = join(d, 'nope', 'z.zip'), root = tree(), codes = [];
  for (const f of [() => writeZip(out, []), () => createZip(out, root), () => createZip(out, root, { stream: true })]) {
    try { await f(); codes.push('ok'); } catch (e) { codes.push(e.code); }
  }
  assert.deepEqual(codes, ['ENOENT', 'ENOENT', 'ENOENT']);
  assert.deepEqual(readdirSync(d).filter((x) => x.includes('partial')), []);
});

for (const name of ['./x', 'a//b', 'a/./b', 'a//', 'a/./', './b/', 'x/.']) {
  test(`A-3 writeZip refuses «${name}» (EUNSAFE) and writes nothing`, async () => {
    const d = fresh(), out = join(d, 'z.zip');
    const src = name.endsWith('/') ? { name } : { name, data: Buffer.from('1') };
    await assert.rejects(writeZip(out, [{ name: 'ok', data: Buffer.from('1') }, src]), (e) => e instanceof ZipError && e.code === 'EUNSAFE');
    assert.deepEqual(readdirSync(d), []);
  });
  test(`A-3 writeZipStream refuses «${name}» (EUNSAFE) before one byte is written`, async () => {
    const w = sink(); let written = 0; const orig = w.write.bind(w); w.write = (...a) => { written += a[0].length; return orig(...a); };
    const src = name.endsWith('/') ? { name } : { name, data: Buffer.from('1') };
    await assert.rejects(writeZipStream(w, [{ name: 'ok', data: Buffer.from('1') }, src]), (e) => e instanceof ZipError && e.code === 'EUNSAFE');
    assert.equal(written, 0);
  });
}

test('A-3 ordinary names with dots and slashes are still accepted and every reader agrees: a/b, a/b/, .hidden, a/.hidden/c, ..x, x.., a.b/c', async () => {
  const d = fresh(), out = join(d, 'z.zip');
  const names = ['a/', 'a/b', 'a/b/', 'a/b/c.txt', '.hidden', 'a/.hidden/c', '..x', 'x..', 'a.b/c'];
  await writeZip(out, names.map((name) => (name.endsWith('/') ? { name } : { name, data: Buffer.from('1') })));
  assert.equal((await testZip(out)).files, names.filter((x) => !x.endsWith('/')).length);
  const exp = Object.fromEntries(names.map((x) => [x, x.endsWith('/') ? '' : '1']));
  const c = await checkZip(out, exp); assert.deepEqual(c.problems, []); assert.ok(c.ran.length >= 2);
});

test('A-3 the reader and extractor still ACCEPT a unique «./x» written by another tool (D31 is about the writer only)', async () => {
  const d = fresh(), z = join(d, 'tar-style.zip');
  writeFileSync(z, buildZip([{ name: './x', data: 'one' }, { name: 'y', data: 'two' }]));
  const r = await extractZip(z, join(d, 'dest'));
  assert.equal(r.files, 2); assert.equal(readFileSync(join(d, 'dest', 'x'), 'utf8'), 'one');
});
