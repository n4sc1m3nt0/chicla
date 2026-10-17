// Round 164 — things found in round 163 outside its task, fixed with a test each; and D118 (Rodrigo: «d118 sim»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

test('docs/zip-handling.md §7 does not say Windows was never run (CI runs it, blocking) and does not call Windows names «written» by default', () => {
  const s = read('docs/zip-handling.md');
  assert.doesNotMatch(s, /Windows has not been run at all/);
  assert.doesNotMatch(s, /Windows is its own milestone \(M14, D19\), not the 0\.1 line/);
  const sec = s.slice(s.indexOf('## 7. Known limits'));
  assert.match(sec, /CI runs the `chicla-zip` suite on Ubuntu, macOS and Windows/);
  assert.match(sec, /real Windows machine/);
});

test('no test names the origin project in a title or comment (D117); the one guard that must name it stays in layout.test.mjs', () => {
  for (const f of ['test/dump-policy.test.mjs', 'test/policy.test.mjs', 'test/recovery-policy.test.mjs']) assert.doesNotMatch(read(f), /cedar/i, `${f} still names it`);
  const lines = read('test/layout.test.mjs').split('\n').filter((l) => /cedar/i.test(l));
  assert.equal(lines.length, 1, 'layout.test.mjs may hold only the guard regex');
  assert.match(lines[0], /doesNotMatch\(src, \/CEDAR\|cedar\/i/);
});

test('mutants list: every `find` occurs exactly once in its file (a stale anchor, as in round 151, is caught by npm test, not 12 rounds later)', async () => {
  const m = await import(pathToFileURL(join(root, 'packages/chicla-zip/mutants/list.mjs')).href);
  const list = m.default;
  assert.ok(Array.isArray(list) && list.length > 200, 'the list was not loaded');
  const bad = [];
  for (const x of list) { const src = read(`packages/chicla-zip/${x.file}`); if (src.split(x.find).length - 1 !== 1) bad.push(x.id); }
  assert.deepEqual(bad, [], 'stale or ambiguous anchors');
});

test('D118: C5.3b-A15 is an accepted survivor with a reason (equivalent since round 151: the catch closes the stream and removes the file)', async () => {
  const m = await import(pathToFileURL(join(root, 'packages/chicla-zip/mutants/list.mjs')).href);
  const x = m.default.find((e) => e.id === 'C5.3b-A15');
  assert.ok(x, 'the entry exists'); assert.equal(typeof x.survives, 'string'); assert.ok(x.survives.length > 40);
});
