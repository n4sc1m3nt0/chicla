// Round 240 (C16.6, AUDIT-4 P-1): `npm run test:fast` and `npm run test:slow` split EXACTLY the files `npm test` (`node --test`, no arguments) runs.
// Written before scripts/run-tests.mjs; red until it exists. The CI keeps running the full `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLOW, discover, split } from '../scripts/run-tests.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUN = join(ROOT, 'scripts/run-tests.mjs');
const env = (() => { const e = { ...process.env }; delete e.NODE_TEST_CONTEXT; return e; })(); // inside `node --test` this variable would make a nested `node --test` speak the machine format
const cli = (...a) => spawnSync(process.execPath, [RUN, ...a], { encoding: 'utf8', env });

function fixture(files) {
  const d = mkdtempSync(join(tmpdir(), 'chicla-ts-'));
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), text); }
  return d;
}

test('discover: the files `node --test` runs with no arguments (every .js/.cjs/.mjs under a test/ folder, *.test.*, *-test.*, *_test.*, test-*.*, test.*; never node_modules or dot folders)', () => {
  const d = fixture({
    'test/a.mjs': '', 'test/deep/b.cjs': '', 'pkg/test/c.js': '', 'x/one.test.mjs': '', 'x/two-test.js': '', 'x/three_test.cjs': '', 'y/test-four.mjs': '', 'y/test.js': '',
    'x/helper.mjs': '', 'x/attest.mjs': '', 'x/test.md': '', 'x/tests/e.mjs': '', 'node_modules/m/z.test.mjs': '', 'node_modules/test/q.js': '', '.hidden/h.test.mjs': '', 'x/notes.test.txt': '',
  });
  try {
    assert.deepEqual(discover(d), ['pkg/test/c.js', 'test/a.mjs', 'test/deep/b.cjs', 'x/one.test.mjs', 'x/three_test.cjs', 'x/two-test.js', 'y/test-four.mjs', 'y/test.js']);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('split: fast and slow are disjoint and together are exactly all; the slow list is fixed by name', () => {
  const all = discover(ROOT); const { fast, slow } = split(all);
  assert.equal(fast.length + slow.length, all.length);
  assert.deepEqual([...fast, ...slow].sort(), [...all].sort());
  assert.ok(fast.every((f) => !slow.includes(f)));
  assert.ok(slow.length >= 5, 'the integration tests are in the slow set');
  assert.ok(all.length >= 150, 'the project test files were found');
});

test('every name in SLOW is a real test file (a rename must not silently move a slow file into the fast set)', () => {
  const all = new Set(discover(ROOT));
  for (const f of SLOW) assert.ok(all.has(f), `SLOW names a file that is not a test file: ${f}`);
  assert.equal(new Set(SLOW).size, SLOW.length, 'no duplicates in SLOW');
});

test('package.json: `test` is still plain `node --test`; `test:fast` and `test:slow` go through the runner', () => {
  const s = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;
  assert.equal(s.test, 'node --test');
  assert.equal(s['test:fast'], 'node scripts/run-tests.mjs fast');
  assert.equal(s['test:slow'], 'node scripts/run-tests.mjs slow');
});

test('the CI keeps running the full `npm test` (not the fast set)', () => {
  const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /npm test\b(?!:)/);
  assert.doesNotMatch(ci, /test:fast|test:slow|run-tests/);
});

test('CLI: `--list` prints the files of a set, one per line, and runs nothing; a wrong set is an error', () => {
  const all = discover(ROOT), { fast, slow } = split(all);
  assert.deepEqual(cli('fast', '--list').stdout.trim().split('\n'), fast);
  assert.deepEqual(cli('slow', '--list').stdout.trim().split('\n'), slow);
  assert.deepEqual(cli('all', '--list').stdout.trim().split('\n'), all);
  for (const bad of [[], ['medium'], ['fast', '--nope']]) { const r = cli(...bad); assert.equal(r.status, 1, JSON.stringify(bad)); assert.match(r.stderr, /usage/i); }
});

test('CLI: it runs the set with `node --test <files>` in the project folder and returns its status (green 0, a failing test 1)', () => {
  const ok = fixture({ 'test/a.test.mjs': "import {test} from 'node:test'; test('a', () => {});", 'test/b.test.mjs': "import {test} from 'node:test'; test('b', () => {});" });
  const bad = fixture({ 'test/a.test.mjs': "import {test} from 'node:test'; import assert from 'node:assert'; test('a', () => assert.equal(1, 2));" });
  try {
    const g = cli('fast', '--root', ok); assert.equal(g.status, 0, g.stdout + g.stderr); assert.match(g.stdout, /2 files/); assert.match(g.stdout, /# pass 2/);
    const r = cli('fast', '--root', bad); assert.equal(r.status, 1);
    const s = cli('slow', '--root', ok); assert.equal(s.status, 0, 'an empty set is not a failure'); assert.match(s.stdout, /0 files/);
  } finally { rmSync(ok, { recursive: true, force: true }); rmSync(bad, { recursive: true, force: true }); }
});
