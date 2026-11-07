// Round 312 (C28.1, AUDIT-10 F-4, F-5; D-310a confirmed by Rodrigo): the root holds no stray script, and no live test or script names the old folder of the status archives.
// Written before the change; red until it. It reads files only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

test('C28.1: the only script in the root is version.mjs (t.mjs was a sandbox leftover, AUDIT-10 F-4)', () => {
  const mjs = readdirSync(root).filter((f) => f.endsWith('.mjs')).sort();
  assert.deepEqual(mjs, ['version.mjs']);
});

test('C28.1: no test or script names the old folder of the status archives (it is docs/archive/status/, AUDIT-10 F-5)', () => {
  const needle = 'docs/' + 'status-archive-'; // two pieces, so this file does not match itself
  for (const dir of ['test', 'scripts']) {
    for (const f of readdirSync(join(root, dir)).filter((n) => n.endsWith('.mjs'))) {
      assert.ok(!readFileSync(join(root, dir, f), 'utf8').includes(needle), `${dir}/${f} still says the old folder`);
    }
  }
});
