// C3.6: crc32 + sha256 in one pass, and detection of a file that changed while it was being read. Written before the code.
// Contract under test:
//   writeZip(out, sources, { sha256 = false, ... }): with `sha256: true` every FILE entry returned carries `sha256` (64 lowercase hex characters), computed in
//     the same pass over the data as the crc32 (the same blocks, also with the 1 GiB block size lowered by `_limits.chunk`); folder entries carry no `sha256`;
//     without the option nothing is computed and no entry has the field; a value that is not a boolean is EARG (nothing written).
//   createZip(out, root, { sha256, ... }): passes it through (the hash is of the bytes that went into the zip).
//   createZip refuses with ECHANGED (nothing written) when a file is not the one that was listed or is not stable while it is read: its size, mtime, ctime or
//     inode differ between the listing (lstat) and the open, or between the open and the end of the read, or fewer/more bytes were read than the size said.
//     `_afterRead(absPath)` (tests only, like `_limits`) runs after the bytes were read and before the final check; `exclude` runs between the listing and the read.
// Assertions use error codes, never message text. Linux and macOS only (inodes, mtime).
import { writeZip, createZip, listZip, readZipFile, crc32, ZipError } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, mkdirSync, statSync, utimesSync, truncateSync, appendFileSync, renameSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { checkZip } from './interop.mjs';

let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-digest-')); });
after(() => { rmSync(base, { recursive: true, force: true }); });
const fresh = () => { const d = join(base, `t${n++}`); mkdirSync(d); return d; };
const sha = (b) => createHash('sha256').update(b).digest('hex');
const noOut = (out) => { assert.throws(() => statSync(out), { code: 'ENOENT' }, 'output exists after a refusal'); assert.deepEqual(readdirSync(join(out, '..')).filter((x) => x.endsWith('.partial')), [], 'a .partial was left'); };
const changed = async (root, out, opts) => {
  await assert.rejects(createZip(out, root, opts), (e) => e instanceof ZipError && e.code === 'ECHANGED', 'expected ECHANGED');
  noOut(out);
};
const sample = (size, seed = 1) => { const b = Buffer.alloc(size); let x = seed; for (let i = 0; i < size; i++) { x = (x * 1103515245 + 12345) >>> 0; b[i] = x >>> 24; } return b; };

test('sha256: true returns the SHA-256 of each file entry, next to the crc32', async () => {
  const out = join(fresh(), 'a.zip'), big = sample(300000), text = Buffer.from('hello\n');
  const r = await writeZip(out, [{ name: 'd/' }, { name: 'd/a.txt', data: text }, { name: 'e.bin', data: big }, { name: 'empty', data: Buffer.alloc(0) }], { sha256: true });
  const by = Object.fromEntries(r.entries.map((e) => [e.name, e]));
  assert.equal(by['d/a.txt'].sha256, sha(text)); assert.equal(by['e.bin'].sha256, sha(big)); assert.equal(by['empty'].sha256, sha(Buffer.alloc(0)));
  assert.equal(by['empty'].sha256, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.match(by['e.bin'].sha256, /^[0-9a-f]{64}$/);
  assert.equal('sha256' in by['d/'], false, 'a folder has no sha256');
  assert.equal(by['d/a.txt'].crc32, crc32(text)); // crc32 still returned
  assert.equal(by['e.bin'].crc32, crc32(big));
  assert.deepEqual((await checkZip(out, { 'd/': '', 'd/a.txt': 'hello\n', 'e.bin': big, empty: '' })).problems, []);
});

test('without the option no hash is computed and no entry has the field (default behaviour unchanged)', async () => {
  const out = join(fresh(), 'a.zip'); const r = await writeZip(out, [{ name: 'a', data: Buffer.from('x') }]);
  assert.equal('sha256' in r.entries[0], false);
  const r2 = await writeZip(join(fresh(), 'b.zip'), [{ name: 'a', data: Buffer.from('x') }], { sha256: false });
  assert.equal('sha256' in r2.entries[0], false);
});

test('sha256 must be a boolean (EARG) and nothing is written', async () => {
  for (const bad of ['yes', 1, null, {}]) {
    const out = join(fresh(), 'a.zip');
    await assert.rejects(writeZip(out, [{ name: 'a', data: Buffer.from('x') }], { sha256: bad }), (e) => e instanceof ZipError && e.code === 'EARG');
    noOut(out);
  }
});

test('the block path gives the same crc32 and sha256 as the one-shot path, for any block size (one pass over the same blocks)', async () => {
  const data = sample(10007, 9), ref = join(fresh(), 'ref.zip');
  const r0 = await writeZip(ref, [{ name: 'f', data }], { sha256: true });
  for (const chunk of [1, 2, 7, 4096, 10006, 10007, 10008]) {
    const out = join(fresh(), 'c.zip'), r = await writeZip(out, [{ name: 'f', data }], { sha256: true, _limits: { chunk } });
    assert.equal(r.entries[0].sha256, r0.entries[0].sha256, `chunk ${chunk}`); assert.equal(r.entries[0].crc32, r0.entries[0].crc32, `chunk ${chunk}`);
    assert.equal(r.entries[0].sha256, sha(data));
    assert.deepEqual(readZipFile(out, 'f'), data);
  }
});

test('the hash and the crc32 are of the same bytes that were stored, also for a stored (incompressible or .zip-like) entry and a level-0 write', async () => {
  const data = sample(50000, 3);
  const r = await writeZip(join(fresh(), 'a.zip'), [{ name: 'x.bin', data }, { name: 'y.png', data }], { sha256: true, level: 0 });
  for (const e of r.entries) { assert.equal(e.sha256, sha(data)); assert.equal(e.method, 0); }
});

test('createZip passes sha256 through: the hash is of the bytes that went into the zip', async () => {
  const root = fresh(); mkdirSync(join(root, 'd')); writeFileSync(join(root, 'a.txt'), 'alpha'); writeFileSync(join(root, 'd', 'b.bin'), sample(70000, 5));
  const out = join(fresh(), 'a.zip'), r = await createZip(out, root, { sha256: true });
  for (const e of r.entries) { if (e.name.endsWith('/')) assert.equal('sha256' in e, false); else assert.equal(e.sha256, sha(readZipFile(out, e.name))); }
  assert.equal(r.entries.find((e) => e.name === 'a.txt').sha256, sha('alpha'));
  const plain = await createZip(join(fresh(), 'p.zip'), root); assert.equal('sha256' in plain.entries[0], false);
});

test('a stable tree is not reported as changed (no false alarm), also with files the same size and mtime as the clock tick', async () => {
  const root = fresh(); for (let i = 0; i < 40; i++) writeFileSync(join(root, `f${i}`), `content ${i}`);
  const out = join(fresh(), 'a.zip'); const r = await createZip(out, root, { _afterRead: () => {} });
  assert.equal(r.entries.length, 40);
});

test('changed between the listing and the read (exclude runs in between): content and size → ECHANGED, nothing written', async () => {
  const root = fresh(); writeFileSync(join(root, 'a.txt'), 'one'); writeFileSync(join(root, 'b.txt'), 'two');
  const out = join(fresh(), 'a.zip');
  await changed(root, out, { exclude: (rel) => { if (rel === 'b.txt') appendFileSync(join(root, 'b.txt'), ' more'); return false; } });
});

test('changed between the listing and the read, same size, only the mtime moved → ECHANGED', async () => {
  const root = fresh(); writeFileSync(join(root, 'a.txt'), 'abcdef'); const p = join(root, 'a.txt');
  const out = join(fresh(), 'a.zip');
  await changed(root, out, { exclude: (rel) => { if (rel === 'a.txt') { writeFileSync(p, 'abcdeX'); const t = new Date(Date.now() + 5000); utimesSync(p, t, t); } return false; } });
});

test('replaced by another file (new inode, same size) between the listing and the read → ECHANGED', async () => {
  const root = fresh(); const p = join(root, 'a.txt'); writeFileSync(p, 'abcdef'); const old = statSync(p);
  const out = join(fresh(), 'a.zip');
  await changed(root, out, { exclude: (rel) => { if (rel === 'a.txt') { writeFileSync(join(root, '.tmp'), 'ghijkl'); utimesSync(join(root, '.tmp'), old.atime, old.mtime); renameSync(join(root, '.tmp'), p); } return false; } });
});

test('changed while it is being read: appended, truncated, rewritten with the same size → ECHANGED, nothing written', async () => {
  const mk = () => { const root = fresh(); writeFileSync(join(root, 'a.txt'), 'abcdef'); writeFileSync(join(root, 'z.txt'), 'zzz'); return root; };
  let root = mk(); await changed(root, join(fresh(), 'a.zip'), { _afterRead: (p) => { if (p.endsWith('a.txt')) appendFileSync(p, 'g'); } });
  root = mk(); await changed(root, join(fresh(), 'b.zip'), { _afterRead: (p) => { if (p.endsWith('a.txt')) truncateSync(p, 2); } });
  root = mk(); await changed(root, join(fresh(), 'c.zip'), { _afterRead: (p) => { if (p.endsWith('a.txt')) { writeFileSync(p, 'ABCDEF'); const t = new Date(Date.now() + 5000); utimesSync(p, t, t); } } });
});

test('a change to a file that is excluded is not an error (it is never read)', async () => {
  const root = fresh(); writeFileSync(join(root, 'a.txt'), 'one'); writeFileSync(join(root, 'skip.log'), 'x');
  const out = join(fresh(), 'a.zip');
  const r = await createZip(out, root, { exclude: (rel) => { if (rel === 'skip.log') return true; if (rel === 'a.txt') appendFileSync(join(root, 'skip.log'), 'y'); return false; } });
  assert.deepEqual(r.entries.map((e) => e.name), ['a.txt']);
});

test('the error names the file (so the user can retry) and keeps the code ECHANGED', async () => {
  const root = fresh(); writeFileSync(join(root, 'a.txt'), 'abc'); const out = join(fresh(), 'a.zip');
  await assert.rejects(createZip(out, root, { _afterRead: (p) => { if (p.endsWith('a.txt')) appendFileSync(p, 'd'); } }), (e) => e instanceof ZipError && e.code === 'ECHANGED' && e.message.includes('a.txt'));
});

test('the data in the zip of a stable file is exactly the file (hash of the zip entry = hash of the disk)', async () => {
  const root = fresh(); const data = sample(123457, 11); writeFileSync(join(root, 'big.bin'), data);
  const out = join(fresh(), 'a.zip'), r = await createZip(out, root, { sha256: true });
  assert.equal(r.entries[0].sha256, sha(readFileSync(join(root, 'big.bin'))));
  assert.equal(listZip(out).entries[0].name, 'big.bin');
});

test('rewritten with the same size and the old mtime put back by hand: the ctime still gives it away → ECHANGED (at the listing gap and during the read)', async () => {
  const mk = () => { const root = fresh(); writeFileSync(join(root, 'a.txt'), 'abcdef'); return root; };
  const redo = (p) => { const old = statSync(p); writeFileSync(p, 'ABCDEF'); utimesSync(p, old.atime, old.mtime); };
  let root = mk(); await changed(root, join(fresh(), 'a.zip'), { exclude: (rel) => { if (rel === 'a.txt') redo(join(root, 'a.txt')); return false; } });
  root = mk(); await changed(root, join(fresh(), 'b.zip'), { _afterRead: (p) => redo(p) });
});

// Round 190 / C15.12 (G-C5 second review, ZIP-013): the old «put the mtime back» test restored the time through a `Date` (millisecond precision), so it was the
// MTIME that gave the rewrite away and the ctime check was never the only thing that fired (mutant M3c-same-ctime survived, wrongly marked as redundant).
// Here the mtime is a whole second set before the run and set back to exactly that second (`touch -r`): size, mtime and inode are identical and ONLY the ctime differs.
const T0 = 1700000000;
const spin = (ms) => { const end = Date.now() + ms; while (Date.now() < end); }; // the kernel's ctime clock ticks in milliseconds: make sure it has moved
const touchedBack = (p) => { // rewrite with the same size, put the exact mtime back, and prove that only the ctime moved
  const was = statSync(p, { bigint: true });
  spin(30); writeFileSync(p, 'ABCDEF'); utimesSync(p, T0, T0);
  const now = statSync(p, { bigint: true });
  assert.equal(now.size, was.size, 'precondition: same size'); assert.equal(now.mtimeNs, was.mtimeNs, 'precondition: exact same mtime');
  assert.equal(now.ino, was.ino, 'precondition: same inode'); assert.equal(now.dev, was.dev, 'precondition: same device');
  assert.ok(now.ctimeNs > was.ctimeNs, 'precondition: the ctime moved (if this fails the file system does not keep a ctime and the test proves nothing)');
};
const mkExact = () => { const root = fresh(), p = join(root, 'a.txt'); writeFileSync(p, 'abcdef'); utimesSync(p, T0, T0); return { root, p }; };

for (const stream of [false, true]) {
  test(`only the ctime differs (exact mtime put back, same size and inode) → ECHANGED, ${stream ? 'streamed' : 'whole-file'} read, at the listing gap and during the read`, async () => {
    let t = mkExact();
    await changed(t.root, join(fresh(), 'a.zip'), { stream, exclude: (rel) => { if (rel === 'a.txt') touchedBack(t.p); return false; } });
    t = mkExact();
    await changed(t.root, join(fresh(), 'b.zip'), { stream, _afterRead: (p) => { if (p.endsWith('a.txt')) touchedBack(p); } });
  });
}
