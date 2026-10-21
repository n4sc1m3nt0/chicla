// C15.11 (ZIP-012, round 193), written before the code: the temp folder of `extractZip` stays 0700 until after the final rename.
// Before, `chmod(tmp, 0777 & ~umask)` ran BEFORE the rename: under `umask 0` the folder (with every extracted file inside it, whose modes are the
// archive's) was 0777 for a moment, and next to the destination that is a window for any other local user. Now the mode is applied to the
// destination AFTERWARDS (a new destination only; an existing one keeps its own mode). Observed through the test-only `_rename` hook, which sees
// the temp folder at the moment of the rename. Assertions use modes and file system state, never message text. POSIX modes: skipped on Windows.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, renameSync, statSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';
const skip = process.platform === 'win32' ? 'POSIX modes' : false;

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-zip012-')); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const put = (entries) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buildZip(entries)); return p; };
const world = () => { const parent = join(dir, `w${n++}`); mkdirSync(parent); return parent; };
const ZIP = () => put([{ name: 'a.txt', data: 'alpha', mode: 0o100666 }, { name: 'sub/b.txt', data: 'beta', mode: 0o100777 }]);
const tmps = (p) => readdirSync(p).filter((x) => x.startsWith('.chicla-tmp-'));
const withUmask = async (u, f) => { const old = process.umask(u); try { return await f(); } finally { process.umask(old); } };
const mode = (p) => statSync(p).mode & 0o777;

test('zip012: under umask 0 the temp folder is still 0700 when it is renamed to a NEW destination', { skip }, async () => {
  await withUmask(0, async () => {
    const parent = world(), dest = join(parent, 'out'), seen = [];
    const _rename = (from, to) => { for (const t of tmps(parent)) seen.push(mode(join(parent, t))); renameSync(from, to); };
    const r = await extractZip(ZIP(), dest, { _rename });
    assert.equal(r.files, 2);
    assert.deepEqual(seen, [0o700], 'one rename, the temp folder 0700 at that moment');
  });
});
test('zip012: afterwards the new destination gets the mode the umask allows (0777 & ~umask), under umask 0 and 022', { skip }, async () => {
  for (const [u, want] of [[0, 0o777], [0o022, 0o755], [0o077, 0o700]]) await withUmask(u, async () => {
    const dest = join(world(), 'out'); await extractZip(ZIP(), dest);
    assert.equal(mode(dest), want, `umask ${u.toString(8)}`);
  });
});
test('zip012: the files inside keep the modes of the archive (small and large, folder included)', { skip }, async () => {
  await withUmask(0, async () => {
    const dest = join(world(), 'out'); await extractZip(ZIP(), dest);
    assert.equal(mode(join(dest, 'a.txt')), 0o666); assert.equal(mode(join(dest, 'sub', 'b.txt')), 0o777);
  });
});
test('zip012: merging into an EXISTING destination: the temp folder is 0700 at every rename and the destination keeps its own mode', { skip }, async () => {
  await withUmask(0, async () => {
    const parent = world(), dest = join(parent, 'out'), seen = []; mkdirSync(dest); chmodSync(dest, 0o750);
    const _rename = (from, to) => { for (const t of tmps(parent)) seen.push(mode(join(parent, t))); renameSync(from, to); };
    await extractZip(ZIP(), dest, { _rename });
    assert.ok(seen.length >= 1 && seen.every((m) => m === 0o700), `seen ${seen}`);
    assert.equal(mode(dest), 0o750);
    assert.equal(readFileSync(join(dest, 'a.txt'), 'utf8'), 'alpha');
  });
});
test('zip012: a failed rename leaves no temp folder, no destination, and nothing was ever more open than 0700', { skip }, async () => {
  await withUmask(0, async () => {
    const parent = world(), dest = join(parent, 'out'), seen = [];
    const _rename = () => { for (const t of tmps(parent)) seen.push(mode(join(parent, t))); throw Object.assign(new Error('EIO'), { code: 'EIO' }); };
    await assert.rejects(extractZip(ZIP(), dest, { _rename }), (e) => e instanceof ZipError);
    assert.deepEqual(readdirSync(parent), []); assert.deepEqual(seen, [0o700]);
  });
});
