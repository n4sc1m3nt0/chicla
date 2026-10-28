// Round 273 (C20.6; D-272b confirmed by Rodrigo: «sim a tudo»): the first whole `npm run mutants` on a Mac (2026-10-28, 348 entries) left ONE survivor,
// `R202-folder-counts` (read() counting a folder entry as a match), because its entry ran only `test/read-duplicate.test.mjs`; the tests that go red for it
// are `test/read.test.mjs` («a directory is not a file») and `test/open.test.mjs` (read() keeps every refusal). The fault was in the list, not in the code.
// Written before the fix; red until the entry names them. Data and this test only: no source, the pin does not move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = join(root, 'packages/chicla-zip');
const list = (await import(pathToFileURL(join(pkg, 'mutants/list.mjs')).href)).default;

test('R202-folder-counts runs the test files that go red for it, not only the duplicate-name file', () => {
  const m = list.find((x) => x.id === 'R202-folder-counts');
  assert.ok(m, 'the entry R202-folder-counts is gone from the zip list');
  for (const f of ['test/read-duplicate.test.mjs', 'test/read.test.mjs', 'test/open.test.mjs']) {
    assert.ok(m.tests.includes(f), `R202-folder-counts does not run ${f}`);
  }
  assert.equal(m.survives, undefined, 'it is a real gap that the named tests close, not an explained survivor');
});

test('every test file that an entry of the zip list names exists in the package', () => {
  const missing = [];
  for (const m of list) for (const f of m.tests) if (!existsSync(join(pkg, f))) missing.push(`${m.id}: ${f}`);
  assert.deepEqual(missing, []);
});
