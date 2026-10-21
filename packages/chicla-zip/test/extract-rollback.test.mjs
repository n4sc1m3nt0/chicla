// C2.7 (AUDIT-1, A-4): merging into an EXISTING destination is a series of renames; if one fails in the middle, the ones already done are undone
// (new items go back to the temp folder, replaced files are restored from a backup made just before), so the destination is exactly as it was.
// If the undo itself fails, the error is `EPARTIAL`, lists what was left in the destination (`leftBehind`) and where the originals are (`backupDir`);
// nothing is lost silently. On success no `.chicla-bak-*` or `.chicla-tmp-*` remains. The failure is injected with the test-only `_rename` hook,
// which every move of the merge (and of the undo) goes through. Assertions use error codes and file system state, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, renameSync, existsSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { extractZip, ZipError } from '../src/zipkit.mjs';
import { realTmp } from './fsprobe.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(realTmp(), 'chicla-zip-rollback-')); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
// Three ops in a fixed order (readdir order): a.txt (replaces an existing file), b.txt (new file), sub (new folder, moved whole).
const ZIP = () => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buildZip([{ name: 'a.txt', data: 'NEW-A' }, { name: 'b.txt', data: 'NEW-B' }, { name: 'sub/c.txt', data: 'NEW-C', method: 8 }])); return p; };
const world = () => { const parent = join(dir, `w${n++}`), dest = join(parent, 'out'); mkdirSync(join(dest, 'old'), { recursive: true }); writeFileSync(join(dest, 'keep.txt'), 'KEEP'); writeFileSync(join(dest, 'a.txt'), 'OLD-A'); writeFileSync(join(dest, 'old', 'z.txt'), 'OLD-Z'); return { parent, dest }; };
const tree = (root) => { const out = {}; const walk = (p) => { const st = lstatSync(p), rel = relative(root, p) || '.'; if (st.isDirectory()) { out[rel] = 'dir'; for (const c of readdirSync(p).sort()) walk(join(p, c)); } else out[rel] = readFileSync(p, 'utf8'); }; walk(root); return out; };
const ORIGINAL = { '.': 'dir', 'a.txt': 'OLD-A', 'keep.txt': 'KEEP', old: 'dir', [join('old', 'z.txt')]: 'OLD-Z' };
const eacces = () => Object.assign(new Error('EACCES'), { code: 'EACCES' });
const failOn = (...idx) => { let calls = 0; const log = []; const fn = (from, to) => { const i = calls++; log.push([from, to]); if (idx.includes(i)) throw eacces(); renameSync(from, to); }; fn.log = log; return fn; };
const leftovers = (parent, dest) => [...readdirSync(parent), ...readdirSync(dest)].filter((x) => /^\.chicla-(tmp|bak)-/.test(x));

test('success with overwrite replaces the file and leaves no backup or temp folder', async () => {
  const { parent, dest } = world();
  await extractZip(ZIP(), dest, { overwrite: true });
  assert.equal(readFileSync(join(dest, 'a.txt'), 'utf8'), 'NEW-A'); assert.equal(readFileSync(join(dest, 'sub', 'c.txt'), 'utf8'), 'NEW-C');
  assert.deepEqual(leftovers(parent, dest), []);
});

for (const failing of [0, 1, 2]) {
  test(`rollback: the ${['first', 'second', 'third'][failing]} rename fails (overwrite on): the destination is exactly as it was`, async () => {
    const { parent, dest } = world(), _rename = failOn(failing);
    await assert.rejects(extractZip(ZIP(), dest, { overwrite: true, _rename }), (e) => e instanceof ZipError && e.code !== 'EPARTIAL' && e.cause?.code === 'EACCES'); // the original failure stays reachable as `cause`
    assert.deepEqual(tree(dest), ORIGINAL); assert.deepEqual(leftovers(parent, dest), []);
  });
}

test('rollback also works without overwrite (only new items were moved)', async () => {
  const { parent, dest } = world(); rmSync(join(dest, 'a.txt'));
  const _rename = failOn(2);
  await assert.rejects(extractZip(ZIP(), dest, { _rename }), (e) => e instanceof ZipError && e.code !== 'EPARTIAL');
  assert.deepEqual(tree(dest), { '.': 'dir', 'keep.txt': 'KEEP', old: 'dir', [join('old', 'z.txt')]: 'OLD-Z' }); assert.deepEqual(leftovers(parent, dest), []);
});

test('EXDEV on the first rename (C2.8) with a file to replace: retried, completed, no backup left', async () => {
  const { parent, dest } = world(); let calls = 0;
  const _rename = (f, t) => { if (calls++ === 0) throw Object.assign(new Error('EXDEV'), { code: 'EXDEV' }); renameSync(f, t); };
  await extractZip(ZIP(), dest, { overwrite: true, _rename });
  assert.equal(readFileSync(join(dest, 'a.txt'), 'utf8'), 'NEW-A'); assert.equal(readFileSync(join(dest, 'b.txt'), 'utf8'), 'NEW-B');
  assert.deepEqual(leftovers(parent, dest), []);
});

test('when the undo fails too: EPARTIAL, lists what was left, keeps the originals reachable, raw error never escapes', async () => {
  const { dest } = world(), _rename = failOn(2, 3); // the third move fails, then the first undo move fails
  let err; try { await extractZip(ZIP(), dest, { overwrite: true, _rename }); } catch (e) { err = e; }
  assert.ok(err instanceof ZipError && err.code === 'EPARTIAL', `expected EPARTIAL, got ${err?.code}`);
  assert.ok(Array.isArray(err.leftBehind) && err.leftBehind.length >= 1, 'leftBehind lists what could not be undone');
  for (const p of err.leftBehind) assert.ok(p.startsWith(dest) && existsSync(p), `${p} is reported and exists inside the destination`);
  assert.equal(typeof err.backupDir, 'string'); assert.ok(existsSync(err.backupDir), 'the backups are kept when the undo failed');
  const where = [join(dest, 'a.txt'), ...readdirSync(err.backupDir).map((f) => join(err.backupDir, f))].map((p) => readFileSync(p, 'utf8'));
  assert.ok(where.includes('OLD-A'), 'the replaced file is still reachable (at its path or in backupDir)');
  assert.equal(readFileSync(join(dest, 'keep.txt'), 'utf8'), 'KEEP'); assert.equal(readFileSync(join(dest, 'old', 'z.txt'), 'utf8'), 'OLD-Z');
});

test('when every undo fails: all the moved items are listed, none skipped (EPARTIAL)', async () => {
  const { dest } = world(), _rename = failOn(2, 3, 4); // third move fails, then both undo moves fail
  let err; try { await extractZip(ZIP(), dest, { overwrite: true, _rename }); } catch (e) { err = e; }
  assert.ok(err instanceof ZipError && err.code === 'EPARTIAL');
  assert.deepEqual([...err.leftBehind].sort(), [join(dest, 'a.txt'), join(dest, 'b.txt')], 'both moved items are reported');
  assert.equal(err.cause?.code, 'EACCES');
});

test('the backup of the move that FAILED does not stay in the kept backup folder', async () => {
  const { dest } = world(); writeFileSync(join(dest, 'b.txt'), 'OLD-B'); // a.txt and b.txt both exist: two files to replace
  const _rename = failOn(1, 2); // second move (b.txt) fails, then the undo of the first fails: EPARTIAL
  let err; try { await extractZip(ZIP(), dest, { overwrite: true, _rename }); } catch (e) { err = e; }
  assert.ok(err instanceof ZipError && err.code === 'EPARTIAL');
  assert.deepEqual(readdirSync(err.backupDir), ['0'], 'only the backup of the move that was done; the failed one was removed');
  assert.equal(readFileSync(join(dest, 'b.txt'), 'utf8'), 'OLD-B', 'the file whose replacement failed is untouched');
});
