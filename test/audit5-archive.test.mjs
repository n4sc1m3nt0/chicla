// Round 249 (C18.1, AUDIT-5 F-1 and F-5; D-248a confirmed by Rodrigo: «sim a todas»): the history is archived again and item 20 carries the timing measured on 2026-10-26.
// Written before the archiving; red until it is done. No source, the pin does not move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const statusName = () => readdirSync(root).filter((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f)).sort((x, y) => parseInt(x.split('-')[1]) - parseInt(y.split('-')[1])).pop();

test('the status file keeps at most 5 «Previous» blocks and at most 10 «Done» lines in the Snapshot (instruction 6)', () => {
  const s = read(statusName());
  const prev = s.split('\n').filter((l) => l.startsWith('**Previous (round '));
  assert.ok(prev.length <= 5, `${prev.length} «Previous» blocks`);
  const snap = s.split('## Snapshot')[1].split('## Next up')[0];
  const done = snap.split('\n').filter((l) => l.startsWith('- Done:'));
  assert.ok(done.length <= 10, `${done.length} «Done» lines`);
});

test('the live CHANGELOG keeps at most 21 round headings and the archives hold the rest', () => {
  const c = read('CHANGELOG.md');
  const heads = c.split('\n').filter((l) => /^## Round /.test(l));
  assert.ok(heads.length <= 21, `${heads.length} round headings`);
  const archives = readdirSync(root).filter((f) => /^CHANGELOG-archive-rounds-.*\.md$/.test(f));
  assert.ok(archives.length >= 2, 'a second archive file is expected');
  for (const a of archives) assert.ok(c.includes(a), `${a} is not named in the CHANGELOG header`);
});

test('every archived «Previous» block and «Done» line is in an archive file under docs/ (nothing deleted)', () => {
  const docs = readdirSync(join(root, 'docs'));
  assert.ok(docs.some((f) => /^status-archive-previous-.*\.md$/.test(f)));
  assert.ok(docs.some((f) => /^status-archive-done-.*\.md$/.test(f)));
  const s = read(statusName());
  for (const f of docs.filter((f) => /^status-archive-(previous|done)-/.test(f))) assert.ok(s.includes(f), `${f} is not named in the status file`);
});

test('item 20 names the timing measured on 2026-10-26: test:fast 213 s for 1472 tests, and the whole npm test 477 s for 1530', () => {
  const item = read(statusName()).split('\n').find((l) => l.startsWith('20. **Long commands'));
  assert.ok(item, 'item 20 not found');
  assert.match(item, /213 s/);
  assert.match(item, /1472 tests/);
  assert.match(item, /477 s/);
  assert.match(item, /1530 tests/);
});
