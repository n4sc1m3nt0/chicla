// C18.6 (round 254, AUDIT-5 F-4 / C18.4): `makeDelivery` with `out` = a folder that already exists THREW `ERR_FS_EISDIR` (the catch of its outer try called `rmSync` on the folder again)
// and the wrapper ended in a Node stack trace. Product rule 2: errors are returned, never thrown through the CLI. Written before the fix; red until it. The project is a temp copy of the real one.
// Tests assert codes, exit status and file facts, never message text (product rule 6).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned } from '../../../test/toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const T = mkdtempSync(join(tmpdir(), 'chicla-c186-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
const project = () => {
  const p = join(T, `p${n++}`);
  for (const { path: rel } of parseManifest(read('FILES.manifest'))) { mkdirSync(dirname(join(p, rel)), { recursive: true }); try { copyFileSync(join(ROOT, rel), join(p, rel)); } catch { /* listed but not on disk */ } }
  copyFileSync(join(ROOT, 'FILES.manifest'), join(p, 'FILES.manifest'));
  return p;
};
// the folder sits outside the project: inside it, it would be a new file for the manifest
const folderWithFile = (p) => { const d = join(T, `out-folder-${n++}`); mkdirSync(d); writeFileSync(join(d, 'keep.txt'), 'mine\n'); return d; };

test('makeDelivery: `out` that is an existing folder is RETURNED as EDELIVERY_ERROR (it does not throw), the folder and what is in it are untouched, and no zip is written', async () => {
  const p = project(), d = folderWithFile(p);
  const { makeDelivery } = await import(pathToFileURL(join(p, 'packages/chicla-kit/src/make-delivery.mjs')).href);
  let r;
  await assert.doesNotReject(async () => { r = await makeDelivery({ root: p, out: d }); });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'EDELIVERY_ERROR');
  assert.equal(r.step, null);
  assert.equal(r.messages.length, 1, 'refused before any step: no check-manifest or check-build output, so nothing in the project was regenerated');
  assert.equal(statSync(d).isDirectory(), true, 'the folder is still a folder');
  assert.deepEqual(readdirSync(d), ['keep.txt']);
  assert.equal(readFileSync(join(d, 'keep.txt'), 'utf8'), 'mine\n');
});

test('the wrapper with `out` = an existing folder: a non-zero exit and no Node stack trace (an error, never a crash)', () => {
  const p = project(), d = folderWithFile(p);
  const r = spawnSync(process.execPath, [join(p, 'scripts/make-delivery-zip.mjs'), d], { cwd: p, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 100000 });
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stderr, /\n\s+at .*\(|Node\.js v\d/, `no stack trace: ${r.stderr.slice(-300)}`);
  assert.deepEqual(readdirSync(d), ['keep.txt']);
});

test('makeDelivery: `out` that is an existing FILE is still replaced (the behaviour the fix must keep): the old zip is overwritten by the new one', async () => {
  const p = project(), out = join(T, `old-${n++}.zip`);
  writeFileSync(out, 'not a zip, an old delivery\n');
  const { makeDelivery } = await import(pathToFileURL(join(p, 'packages/chicla-kit/src/make-delivery.mjs')).href);
  const r = await makeDelivery({ root: p, out });
  assert.equal(r.ok, true, JSON.stringify(r.messages.filter((m) => m.stream === 'err')));
  assert.equal(existsSync(out), true);
  assert.equal(readFileSync(out).subarray(0, 2).toString(), 'PK');
});
