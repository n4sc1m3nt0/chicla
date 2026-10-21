// Round 210 / C15.27 / ZIP-022 (fifth security review): a duplicate name is refused by `extractZip` also when one of the two entries is a symlink or a special file.
// Before, those entries were skipped BEFORE the duplicate check, so `[file a, symlink a]` extracted the file while `read("a")` said EAMBIGUOUS, Python wrote the last
// entry and `unzip` made the symlink. Now: EUNSAFE, nothing written. A symlink alone, and a file and a symlink with different names, still extract as before.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-dupskip-')); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };
const FILE = { name: 'a', data: 'BENIGN', mode: 0o100644 }, LINK = { name: 'a', data: 'zz', mode: 0o120777 }, FIFO = { name: 'a', data: 'x', mode: 0o010644 };
const code = (c) => (e) => e instanceof ZipError && e.code === c;

for (const [label, entries] of [['file + symlink', [FILE, LINK]], ['symlink + file', [LINK, FILE]], ['symlink + symlink', [LINK, LINK]], ['file + fifo', [FILE, FIFO]], ['fifo + symlink', [FIFO, LINK]]]) {
  test(`ZIP-022: ${label} with one name is EUNSAFE and nothing is written`, async () => {
    const dest = join(dir, `d${n++}`);
    await assert.rejects(extractZip(put(buildZip(entries)), dest), code('EUNSAFE'));
    assert.equal(existsSync(dest), false);
  });
}

test('ZIP-022: a symlink under a path that is also a file name is refused (file and folder at once)', async () => {
  const dest = join(dir, `d${n++}`);
  await assert.rejects(extractZip(put(buildZip([LINK, { name: 'a/x', data: 'y', mode: 0o100644 }])), dest), code('EUNSAFE'));
  assert.equal(existsSync(dest), false);
});

test('ZIP-022 controls: one symlink alone, and a file next to a symlink with another name, extract and report the skip', async () => {
  const d1 = join(dir, `d${n++}`), r1 = await extractZip(put(buildZip([LINK])), d1);
  assert.deepEqual(r1.skipped.map((s) => s.name), ['a']); assert.deepEqual(readdirSync(d1), []);
  const d2 = join(dir, `d${n++}`), r2 = await extractZip(put(buildZip([FILE, { ...LINK, name: 'b' }])), d2);
  assert.deepEqual(r2.skipped.map((s) => s.name), ['b']); assert.deepEqual(readdirSync(d2), ['a']);
});
