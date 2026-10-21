// C5.3b slice 5 (round 56): the mutants of the M2 rounds (7 to 12) showed five behaviours of `extractZip` that no test pinned. Written as tests first.
//  1. an entry with an EMPTY name is refused (EUNSAFE) and nothing is written;
//  2. `dirs` counts the folders created (here: a, a/b and d);
//  3. the `filter` option leaves entries out, and they are never written;
//  4. a LARGE file (slow path) with no permission bits gets 0644, as a small one does;
//  5. a folder gets its date from the zip (the file inside was written after it was created, so only the late pass can give it).
// Assertions use error codes and file system state, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';
const WIN = process.platform === 'win32';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-m2gaps-')); mkdirSync(join(dir, 'zips')); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const put = (entries) => { const p = join(dir, 'zips', `z${n++}.zip`); writeFileSync(p, buildZip(entries)); return p; };
const parent = () => { const p = join(dir, `case${n++}`); mkdirSync(p); return p; };
const text = (len) => Buffer.from('chicla '.repeat(Math.ceil(len / 7)).slice(0, len));

test('an entry with an empty name is refused (EUNSAFE) and nothing is written, not even the temp folder', async () => {
  const p = parent(), dest = join(p, 'out');
  await assert.rejects(extractZip(put([{ name: '', data: 'x' }, { name: 'a.txt', data: 'y' }]), dest), (e) => e instanceof ZipError && e.code === 'EUNSAFE');
  assert.deepEqual(readdirSync(p), []);
});

test('dirs counts the folders created: a, a/b and d', async () => {
  const dest = join(parent(), 'out');
  const r = await extractZip(put([{ name: 'a/b/c.txt', data: 'x' }, { name: 'd/', dir: true }]), dest);
  assert.equal(r.dirs, 3); assert.equal(r.files, 1);
});

test('filter leaves entries out: they are not written and not counted', async () => {
  const dest = join(parent(), 'out');
  const r = await extractZip(put([{ name: 'keep.txt', data: 'k' }, { name: 'skip.txt', data: 's' }, { name: 'sub/skip-too.txt', data: 't' }]), dest, { filter: (e) => !e.name.includes('skip') });
  assert.deepEqual(readdirSync(dest), ['keep.txt']); assert.equal(r.files, 1);
  assert.ok(!existsSync(join(dest, 'sub')));
});

test('a large file with no permission bits gets 0644 (slow path), like a small one', { skip: WIN && 'Windows has no mode bits' }, async () => {
  const dest = join(parent(), 'out');
  await extractZip(put([{ name: 'big.bin', data: text(300000), method: 8, mode: 0o100000 }, { name: 'small.bin', data: 'x', mode: 0o100000 }]), dest);
  assert.equal(statSync(join(dest, 'big.bin')).mode & 0o777, 0o644); assert.equal(statSync(join(dest, 'small.bin')).mode & 0o777, 0o644);
});

test('a folder gets its date from the zip, after the files inside it were written', async () => {
  const dest = join(parent(), 'out'), want = new Date(2026, 9, 8, 12, 0, 0).getTime();
  await extractZip(put([{ name: 'd/', dir: true }, { name: 'd/f.txt', data: 'x' }]), dest);
  assert.equal(statSync(join(dest, 'd/f.txt')).mtimeMs, want); assert.equal(statSync(join(dest, 'd')).mtimeMs, want);
});
