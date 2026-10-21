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

test('C15.22 (ZIP-018): CLAUDE.md and README.md state the mutant count of the list, so it cannot go stale again', async () => {
  const m = await import(pathToFileURL(join(root, 'packages/chicla-zip/mutants/list.mjs')).href);
  for (const f of ['CLAUDE.md', 'README.md']) { const hit = read(f).match(/\((?:\d+ )?(\d+) (?:hand-made )?mutants\)|(\d+) hand-made mutants/); const n = Number(hit?.[1] ?? hit?.[2]); assert.equal(n, m.default.length, `${f} says ${n}`); }
});

test('C15.22 (ZIP-018): C5.3b-A13 and C5.1-central-bounds are accepted survivors with a reason and are pinned by test/audit-zip018.test.mjs', async () => {
  const m = await import(pathToFileURL(join(root, 'packages/chicla-zip/mutants/list.mjs')).href);
  for (const id of ['C5.3b-A13', 'C5.1-central-bounds']) { const x = m.default.find((e) => e.id === id); assert.ok(x, id); assert.ok(typeof x.survives === 'string' && x.survives.length > 40, id); assert.ok(x.tests.includes('test/audit-zip018.test.mjs'), id); }
});

test('ZIP-021 (round 209, C15.26): docs/zip-handling.md §2 documents the end-record search window, and trailing-size-fake.test.mjs no longer describes the pre-ZIP-015 rule', () => {
  const s = read('docs/zip-handling.md');
  const sec = s.slice(s.indexOf('## 2. What the reader does'), s.indexOf('## 3. What extraction promises'));
  assert.match(sec, /last 21 bytes/, 'the 21-byte rule is not written');
  assert.match(sec, /65 557/, 'the tail window is not written');
  assert.match(sec, /65 558/, 'the Python window is not written');
  assert.match(sec, /never misread/, 'the safe direction is not written');
  const t = read('packages/chicla-zip/test/trailing-size-fake.test.mjs').split('\n').slice(0, 12).join('\n');
  assert.match(t, /ZIP-015/, 'the header does not mention the general rule of round 200');
  assert.doesNotMatch(t, /is now EAMBIGUOUS; candidates BEFORE/, 'the stale one-case sentence is still there');
});
