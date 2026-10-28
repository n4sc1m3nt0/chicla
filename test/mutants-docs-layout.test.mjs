// Round 274 (C20.7; D145 and D-272a confirmed by Rodrigo: «sim a tudo», «avança»): the first whole `npm run mutants` on a Mac stopped at the baseline, because four tests of
// chicla-zip (ZIP-014, -015, -016, -020) read `../../../docs/zip-handling.md`, and `scripts/mutants.mjs` copied the package to `<tmp>/chicla-mutants-X/pkg`, so that path
// landed in the OS temp folder, outside the private folder the script owns. Rodrigo got past it with a `TMPDIR` that held a copy of `docs/`.
// The copy now sits where the package sits in the repo, below the private folder, and that folder gets `docs/`. Written before the fix; red until then.
// The child runs with an EMPTY TMPDIR of its own, so that nothing left in the machine's temp folder can make it pass. Source: `scripts/mutants.mjs` only, the pin does not move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));

// One entry of the zip list's own kind (R202-code: the refusal carries EAMBIGUOUS), run against ONE test file that reads docs/zip-handling.md.
const entry = {
  id: 'T-docs-layout', file: 'src/zipkit.mjs', tests: ['test/read-duplicate.test.mjs'], why: 'the docs test of read-duplicate runs in the copy',
  find: '(a duplicate name)`, "EAMBIGUOUS")', replace: '(a duplicate name)`, "EZIP")',
};

function run() {
  const scratch = mkdtempSync(join(tmpdir(), 'chicla-docs-layout-'));
  const tmp = join(scratch, 'tmp'); // the child's TMPDIR: empty, so nothing outside the copy is there to read
  const list = join(scratch, 'list.mjs');
  writeFileSync(list, `export default ${JSON.stringify([entry])};\n`);
  try {
    mkdirSync(tmp);
    const env = { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp }; delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, [join(root, 'scripts/mutants.mjs'), '--list', list, '--timeout', '60'], {
      cwd: root, encoding: 'utf8', timeout: 120000, env, // no NODE_TEST_CONTEXT: a child `node --test` that inherits it exits 0 without running anything (round 267)
    });
    return { r, left: readdirSync(tmp) };
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

test('the baseline passes with an empty TMPDIR: the copy of the package finds docs/zip-handling.md where its tests expect it', () => {
  const { r } = run();
  assert.equal(r.status, 0, `mutants.mjs exited ${r.status}:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^RED\s+T-docs-layout/m, 'the mutant of the entry must be RED');
  assert.doesNotMatch(r.stdout, /baseline FAILED/);
});

test('nothing is left in the temp folder afterwards (the copy of docs/ goes with the private folder)', () => {
  const { left } = run();
  assert.deepEqual(left, []);
});
