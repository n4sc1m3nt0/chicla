// C10.6 (round 182, D131) — the status file that `chicla init` writes has the same cold start as this project's: the Instructions block comes before
// `**Current version:**`, and item 1 gives the one command that prints the Instructions block, the Fingerprint paragraph and the newest «Last updated» entry.
// The test RUNS the command it finds in the template, on a copy of the template, so the text and the behaviour cannot drift apart.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'packages/chicla-kit/templates/CHICLA_PROJECT_STATUS-1.md');
const text = readFileSync(TEMPLATE, 'utf8');
const T = mkdtempSync(join(tmpdir(), 'chicla-c106-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 5 }));
const at = (s) => text.search(new RegExp('^' + s.replace(/[*()]/g, '\\$&'), 'm'));

test('the template orders the parts like the project: Instructions, Current version, Fingerprint, Last updated, Snapshot, Next up, Gates', () => {
  const order = ['## Instructions', '**Current version:**', '**Fingerprint:**', '**Last updated (round', '## Snapshot', '## Next up', '## Gates'].map(at);
  assert.ok(order.every((x) => x >= 0), `a part is missing: ${order}`);
  assert.ok(order.every((x, i) => !i || x > order[i - 1]), `the parts are out of order: ${order}`);
});

test('item 1 of the template holds the cold-start command in a fenced block, and the command is the one of this project (names the files it cuts at)', () => {
  const item1 = text.slice(text.indexOf('1. **Cold start.**'), text.indexOf('2. **Short commands.**'));
  const cmd = (item1.match(/^[ ]*```\n([\s\S]*?)\n[ ]*```/m) ?? [])[1];
  assert.ok(cmd, 'item 1 has no fenced command');
  for (const piece of ['CHICLA_PROJECT_STATUS-*.md', 'Current version', 'Fingerprint', 'Last updated (round']) assert.ok(cmd.includes(piece), `the command does not mention ${piece}`);
});

test('running that command on the template prints the Instructions block, the Fingerprint paragraph and the Last updated entry, and nothing after them', () => {
  const item1 = text.slice(text.indexOf('1. **Cold start.**'), text.indexOf('2. **Short commands.**'));
  const cmd = item1.match(/^[ ]*```\n([\s\S]*?)\n[ ]*```/m)[1];
  const dir = join(T, 'p'); spawnSync('mkdir', ['-p', dir]);
  writeFileSync(join(dir, 'CHICLA_PROJECT_STATUS-1.md'), text);
  const r = spawnSync('bash', ['-c', cmd], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  for (const want of ['## Instructions', '10. **Session-start check.**', '**Fingerprint:** seq=1', '**Last updated (round 1):**']) assert.ok(r.stdout.includes(want), `the output lacks ${want}`);
  for (const not of ['**Current version:**', '## Snapshot', '## Next up', '## Gates']) assert.ok(!r.stdout.includes(not), `the output has ${not}`);
});

test('the command picks the highest-numbered status file (sort by number, not by text)', () => {
  const cmd = text.slice(text.indexOf('1. **Cold start.**'), text.indexOf('2. **Short commands.**')).match(/^[ ]*```\n([\s\S]*?)\n[ ]*```/m)[1];
  const dir = join(T, 'q'); spawnSync('mkdir', ['-p', dir]);
  writeFileSync(join(dir, 'CHICLA_PROJECT_STATUS-9.md'), text.replace('seq=1', 'seq=9'));
  writeFileSync(join(dir, 'CHICLA_PROJECT_STATUS-10.md'), text.replace('seq=1', 'seq=10'));
  const r = spawnSync('bash', ['-c', cmd], { cwd: dir, encoding: 'utf8' });
  assert.ok(r.stdout.includes('seq=10') && !r.stdout.includes('seq=9 '), r.stdout.slice(-300));
});
