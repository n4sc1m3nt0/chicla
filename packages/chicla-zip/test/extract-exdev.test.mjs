// C2.8 (AUDIT-1, A-6): a destination that is a BIND MOUNT has the same `dev` as its parent, so the A-1 check (`sameVolume`) keeps the temp folder
// next to it and the final `rename` fails with EXDEV. Contract: when the FIRST rename of the merge reports EXDEV (nothing moved yet), the
// extraction is redone with the temp folder inside the destination; a later EXDEV (something already moved) and any other error are NOT
// retried (that is C2.7); every outcome leaves no `.chicla-tmp-*` behind. Assertions use error classes and file system state, never message text.
// Two ways in: a real bind mount (needs root and Linux; skipped, and says so, anywhere else) and the test-only `_rename` hook (runs everywhere).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { realTmp } from './fsprobe.mjs';
import { extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(realTmp(), 'chicla-zip-exdev-')); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const put = (entries) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buildZip(entries)); return p; };
const world = () => { const parent = join(dir, `w${n++}`), dest = join(parent, 'out'); mkdirSync(dest, { recursive: true }); writeFileSync(join(dest, 'keep.txt'), 'mine'); return { parent, dest }; };
const exdev = () => Object.assign(new Error('EXDEV: cross-device link not permitted'), { code: 'EXDEV' });
const TWO = () => put([{ name: 'a.txt', data: 'alpha' }, { name: 'sub/b.txt', data: 'beta', method: 8 }]);
const noTmp = (p) => readdirSync(p).filter((x) => x.startsWith('.chicla-tmp-'));

test('hook: EXDEV on the first rename retries with the temp folder inside the destination, and the result is complete', async () => {
  const { parent, dest } = world(), froms = []; let calls = 0;
  const _rename = (from, to) => { froms.push(from); if (calls++ === 0) throw exdev(); renameSync(from, to); };
  const r = await extractZip(TWO(), dest, { _rename });
  assert.equal(r.files, 2);
  assert.equal(readFileSync(join(dest, 'a.txt'), 'utf8'), 'alpha'); assert.equal(readFileSync(join(dest, 'sub', 'b.txt'), 'utf8'), 'beta'); assert.equal(readFileSync(join(dest, 'keep.txt'), 'utf8'), 'mine');
  assert.equal(dirname(froms[0]).startsWith(dest), false, 'first attempt: temp folder next to the destination');
  assert.ok(froms.slice(1).every((f) => f.startsWith(dest)), 'second attempt: temp folder inside the destination');
  assert.deepEqual(readdirSync(parent), ['out']); assert.deepEqual(noTmp(dest), []);
});

test('hook: EXDEV after something already moved is not retried: the move is undone (C2.7), it is a ZipError and the destination is as before', async () => {
  const { parent, dest } = world(); let calls = 0;
  const _rename = (from, to) => { if (calls++ === 1) throw exdev(); renameSync(from, to); };
  await assert.rejects(extractZip(TWO(), dest, { _rename, overwrite: true }), (e) => e instanceof ZipError); // overwrite: a wrong retry would otherwise fail anyway with EEXIST and look the same
  assert.equal(calls, 3, 'two moves (the second fails) and one undo; no second attempt after a partial merge');
  assert.deepEqual(readdirSync(dest), ['keep.txt'], 'the move already done was undone'); assert.deepEqual(readdirSync(parent), ['out']);
});

test('hook: EXDEV on the first rename of EVERY place is a ZipError, one try per place, nothing left (never a silent success)', async () => {
  const { parent, dest } = world(); let calls = 0;
  const _rename = () => { calls++; throw exdev(); };
  await assert.rejects(extractZip(TWO(), dest, { _rename }), (e) => e instanceof ZipError);
  assert.equal(calls, 2, 'next to the destination, then inside it');
  assert.deepEqual(readdirSync(dest), ['keep.txt']); assert.deepEqual(readdirSync(parent), ['out']);
});

test('hook: an error other than EXDEV on the first rename is not retried and the destination is unchanged', async () => {
  const { parent, dest } = world(); let calls = 0;
  const _rename = () => { calls++; throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); };
  await assert.rejects(extractZip(TWO(), dest, { _rename }), (e) => e instanceof ZipError);
  assert.equal(calls, 1);
  assert.deepEqual(readdirSync(dest), ['keep.txt']); assert.deepEqual(readdirSync(parent), ['out']);
});

test('hook: EXDEV when the destination does not exist yet has no other place to go: ZipError, nothing left', async () => {
  const parent = join(dir, `w${n++}`); mkdirSync(parent); let calls = 0;
  const _rename = () => { calls++; throw exdev(); };
  await assert.rejects(extractZip(TWO(), join(parent, 'new'), { _rename }), (e) => e instanceof ZipError);
  assert.equal(calls, 1); assert.deepEqual(readdirSync(parent), []);
});

// A real bind mount: same device number as the parent, still EXDEV. Linux and root only.
const bind = (src, dst) => { try { execFileSync('mount', ['--bind', src, dst], { stdio: 'ignore' }); return true; } catch { return false; } };
const unbind = (dst) => { try { execFileSync('umount', [dst], { stdio: 'ignore' }); } catch { /* nothing to undo */ } };
test('real bind mount: extracting into the root of a bind mount works (merge into existing files too)', async (t) => {
  const parent = join(dir, `w${n++}`), src = join(parent, 'src'), dest = join(parent, 'out'); mkdirSync(src, { recursive: true }); mkdirSync(dest);
  if (!bind(src, dest)) return t.skip('cannot create a bind mount here (needs Linux and root); the hook tests above cover the logic');
  try {
    writeFileSync(join(dest, 'keep.txt'), 'mine'); writeFileSync(join(dest, 'a.txt'), 'old');
    const r = await extractZip(TWO(), dest, { overwrite: true });
    assert.equal(r.files, 2);
    assert.equal(readFileSync(join(dest, 'a.txt'), 'utf8'), 'alpha'); assert.equal(readFileSync(join(dest, 'sub', 'b.txt'), 'utf8'), 'beta'); assert.equal(readFileSync(join(dest, 'keep.txt'), 'utf8'), 'mine');
    assert.deepEqual(noTmp(dest), []); assert.deepEqual(noTmp(parent), []);
  } finally { unbind(dest); }
});
