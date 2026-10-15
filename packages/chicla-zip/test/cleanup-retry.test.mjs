// C14.3 slice b (round 151; D103, D104, D105): cleanup after a failure on Windows. Written before the code.
// Windows cannot delete a file that still has an open handle, and an antivirus can hold one for a moment: rmSync then gives EPERM, EBUSY or ENOTEMPTY.
// The tests make Linux behave the same way by swapping fs functions (fs.syncBuiltinESMExports makes the swap visible to zipkit.mjs):
//   - openSync and open remember which path each descriptor belongs to; fs.close is DELAYED, so a descriptor stays open for a few milliseconds;
//   - rmSync refuses (EPERM) any path that still has an open descriptor, or the first `busy` calls on it.
// Expected (D103): handles are closed BEFORE the remove, and the remove is retried a bounded number of times.
// Expected (D104): a cleanup that still fails never replaces the real error (and is not thrown raw).
// Error assertions use classes and codes, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtempSync, mkdirSync, rmSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createZip, extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-cleanup-')); });
after(() => { rmSync(base, { recursive: true, force: true }); });
const fresh = () => { const d = join(base, `t${n++}`); mkdirSync(d); return d; };

// Runs fn with the Windows-like file system; returns what the fake saw. busy: the first N rmSync calls on each path fail with EPERM.
const windowsLike = async (fn, { busy = 0, closeDelayMs = 40, code = 'EPERM' } = {}) => {
  const real = { openSync: fs.openSync, open: fs.open, close: fs.close, rmSync: fs.rmSync };
  const open = new Map(), tries = new Map(), log = { refused: 0, removed: [] };
  fs.openSync = (p, ...a) => { const fd = real.openSync(p, ...a); open.set(fd, String(p)); return fd; };
  fs.open = (p, ...a) => { const cb = a.pop(); real.open(p, ...a, (err, fd) => { if (!err) open.set(fd, String(p)); cb(err, fd); }); };
  fs.close = (fd, cb) => { setTimeout(() => real.close(fd, (err) => { open.delete(fd); cb?.(err); }), closeDelayMs); };
  fs.rmSync = (p, o) => {
    const k = String(p), t = (tries.get(k) ?? 0) + 1; tries.set(k, t);
    const held = [...open.values()].some((v) => v === k || v.startsWith(k + '/') || v.startsWith(k + '\\'));
    if (held || t <= busy) { log.refused++; throw Object.assign(new Error(`${code}: unlink '${k}'`), { code, syscall: 'unlink', path: k }); }
    log.removed.push(k); return real.rmSync(p, o);
  };
  syncBuiltinESMExports();
  try { await fn(); } finally { Object.assign(fs, real); syncBuiltinESMExports(); }
  return log;
};

test('createZip stream:true that fails: the stream is closed BEFORE the .partial is removed, so nothing is left (Windows: an open handle blocks the remove)', async () => {
  const root = fresh(); writeFileSync(join(root, 'a.txt'), 'one'); writeFileSync(join(root, 'b.txt'), 'two');
  const dir = fresh(), out = join(dir, 'a.zip');
  await windowsLike(async () => {
    await assert.rejects(createZip(out, root, { stream: true, exclude: (rel) => { if (rel === 'b.txt') appendFileSync(join(root, 'b.txt'), ' more'); return false; } }), (e) => e instanceof ZipError && e.code === 'ECHANGED');
  });
  assert.deepEqual(readdirSync(dir), [], 'no .partial left');
});

test('a large bad entry (slow path) with a remove busy for the first three tries: retried, nothing left, and the caller gets the ZipError, not a raw EPERM', async () => {
  const z = join(fresh(), 'bad.zip'); writeFileSync(z, buildZip([{ name: 'bad.bin', data: Buffer.alloc(300000, 'x'), crc: 0x12345678 }]));
  const p = fresh(), dest = join(p, 'out');
  const log = await windowsLike(async () => {
    await assert.rejects(extractZip(z, dest), (e) => e instanceof ZipError && e.code !== 'EPERM');
  }, { busy: 3, closeDelayMs: 0 });
  assert.deepEqual(readdirSync(p), [], 'the temp folder was removed after the retries');
  assert.ok(log.refused >= 3, 'the fake refused at least three times, so the retries really ran');
});

test('a remove that never works is bounded and silent: the real error still wins and the call comes back in a few seconds (D104)', async () => {
  const z = join(fresh(), 'bad.zip'); writeFileSync(z, buildZip([{ name: 'bad.bin', data: Buffer.alloc(300000, 'x'), crc: 0x12345678 }]));
  const p = fresh(), dest = join(p, 'out'); const t0 = Date.now();
  const log = await windowsLike(async () => {
    await assert.rejects(extractZip(z, dest), (e) => e instanceof ZipError && e.code !== 'EPERM' && e.cause?.code !== 'EPERM');
  }, { busy: 1000, closeDelayMs: 0 });
  const took = Date.now() - t0;
  assert.ok(took >= 300, `it waited between the tries (${took} ms)`);
  assert.ok(took < 5000, 'bounded');
  assert.ok(log.refused >= 3 && log.refused < 100, `tried more than once and gave up (${log.refused} refusals)`);
  for (const d of readdirSync(p)) rmSync(join(p, d), { recursive: true, force: true }); // the fake left it on purpose
});

test('a stale .partial that is busy for the first two tries is removed after the retries and the zip is written', async () => {
  const root = fresh(); writeFileSync(join(root, 'a.txt'), 'one');
  const dir = fresh(), out = join(dir, 'a.zip'); writeFileSync(`${out}.partial`, 'stale');
  const log = await windowsLike(async () => { await createZip(out, root, {}); }, { busy: 2, closeDelayMs: 0 });
  assert.ok(log.refused >= 2, 'the remove was refused twice and retried');
  assert.deepEqual(readdirSync(dir), ['a.zip']);
});

test('a remove that fails with a code that is not a busy one (EACCES) is not retried: the caller gets that error at once', async () => {
  const root = fresh(); writeFileSync(join(root, 'a.txt'), 'one');
  const dir = fresh(), out = join(dir, 'a.zip'); writeFileSync(`${out}.partial`, 'stale');
  const log = await windowsLike(async () => {
    await assert.rejects(createZip(out, root, {}), (e) => e instanceof ZipError && e.code === 'EACCES');
  }, { busy: 1000, closeDelayMs: 0, code: 'EACCES' });
  assert.ok(log.refused <= 2, `no retries for EACCES (${log.refused} refusals)`);
});
