// C20.5 (round 269, D-265e, AUDIT-7 F-6): the outer `catch` of `makeDelivery` (the only place that returns EDELIVERY_ERROR for an exception) had no test.
// A root where a core throws exists without touching the source: `verifyDelivery` calls `allowRemoved.map(...)` AFTER the zip was written, so an `allowRemoved`
// that is not a list throws a TypeError out of the core. The catch must turn it into a RETURNED EDELIVERY_ERROR (product rule 2) and delete the zip that was
// already written (nobody may deliver a zip whose verification never finished). Tests assert codes and file facts, never message text (product rule 6).
// The project is a temp copy of the real one; `out` sits outside it (inside, it would be a new file for the manifest).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned } from '../../../test/toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const T = mkdtempSync(join(tmpdir(), 'chicla-c205-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
const project = () => {
  const p = join(T, `p${n++}`);
  for (const { path: rel } of parseManifest(read('FILES.manifest'))) { mkdirSync(dirname(join(p, rel)), { recursive: true }); try { copyFileSync(join(ROOT, rel), join(p, rel)); } catch { /* listed but not on disk */ } }
  copyFileSync(join(ROOT, 'FILES.manifest'), join(p, 'FILES.manifest'));
  return p;
};
const load = (p) => import(pathToFileURL(join(p, 'packages/chicla-kit/src/make-delivery.mjs')).href);

for (const [label, allowRemoved] of [['a number', 5], ['a plain object', {}]]) {
  test(`makeDelivery: a core that THROWS (allowRemoved is ${label}, so verifyDelivery fails after the zip is written) is RETURNED as EDELIVERY_ERROR, never thrown, and the zip is deleted`, async () => {
    const p = project(), out = join(T, `out-${n++}.zip`);
    writeFileSync(out, 'an old delivery\n');
    const { makeDelivery } = await load(p);
    let r;
    await assert.doesNotReject(async () => { r = await makeDelivery({ root: p, out, allowRemoved }); });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'EDELIVERY_ERROR');
    assert.equal(r.step, null, 'no script step failed: the exception came from inside one');
    assert.equal(r.cause, null);
    assert.equal(existsSync(out), false, 'the zip that was written before the throw is gone, and so is the old file that was at `out`');
    const err = r.messages.filter((m) => m.stream === 'err');
    assert.ok(err.length >= 1 && err.every((m) => !/\n\s+at .*\(/.test(m.text)), 'a message, not a stack trace');
  });
}

test('makeDelivery: after the caught throw the same project still delivers with sane arguments (nothing was left half-done)', async () => {
  const p = project(), bad = join(T, `bad-${n++}.zip`), good = join(T, `good-${n++}.zip`);
  const { makeDelivery } = await load(p);
  assert.equal((await makeDelivery({ root: p, out: bad, allowRemoved: 5 })).code, 'EDELIVERY_ERROR');
  const r = await makeDelivery({ root: p, out: good });
  assert.equal(r.ok, true, JSON.stringify(r.messages.filter((m) => m.stream === 'err')));
  assert.equal(readFileSync(good).subarray(0, 2).toString(), 'PK');
});
