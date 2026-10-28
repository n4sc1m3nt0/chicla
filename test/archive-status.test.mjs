// Round 238 (C16.4, AUDIT-4 T-3): `archive-changelog.mjs --status` moves the old «Previous (round N)» blocks of the status file to
// docs/status-archive-previous-<lo>-<hi>.md, verbatim, and leaves an index paragraph. Written before the code; red until it exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/archive-changelog.mjs');
const HEAD = '# Chicla — Project Status\n\n## Instructions\n\n1. rule one.\n\n**Current version:** v0.0.1 (x)\n\n**Fingerprint:** seq=7 · app=version.mjs ·\napp_sha256_12=aaaaaaaaaaaa ·\nchangelog_sha256_12=bbbbbbbbbbbb\n\n**Last updated (round 9):** newest text.\n\n';
const TAIL = '## Snapshot\n\n- Done: round 9.\n\n## Next up\n\nnext.\n';
const block = (n) => `**Previous (round ${n}):** text of ${n}, one line.\n\n`;
const TWO_LINES = '**Previous (round 5):** this one wraps\nonto a second line, still one paragraph.\n\n';
const status = (labels) => HEAD + labels.map((l) => (l === '5' ? TWO_LINES : block(l))).join('') + TAIL;
const LABELS = ['8', '7b', '7', '6', '5', '4', '3'];

function project(text, name = 'CHICLA_PROJECT_STATUS-7.md') {
  const dir = mkdtempSync(join(tmpdir(), 'chicla-as-'));
  mkdirSync(join(dir, 'scripts')); mkdirSync(join(dir, 'docs'));
  copyFileSync(SCRIPT, join(dir, 'scripts/archive-changelog.mjs'));
  writeFileSync(join(dir, name), text);
  writeFileSync(join(dir, 'CHANGELOG.md'), '<!-- CHANGELOG_FINGERPRINT: seq=7 -->\n# Changelog\n\n## Round 1 — a\n- x\n');
  return dir;
}
const run = (dir, ...a) => spawnSync(process.execPath, [join(dir, 'scripts/archive-changelog.mjs'), ...a], { encoding: 'utf8' });
const coldStart = (s) => s.slice(s.indexOf('**Fingerprint:**'), s.indexOf('**Last updated (round')); // what `sed -n '/^\*\*Fingerprint:\*\*/,/^\*\*Last updated (round/p'` prints, up to its last line
const stat = (dir) => readFileSync(join(dir, 'CHICLA_PROJECT_STATUS-7.md'), 'utf8');
const archives = (dir) => readdirSync(join(dir, 'docs')).filter((f) => f.startsWith('status-archive-previous-'));

test('--status --keep-previous 3: keeps the 3 newest blocks, archives the other 4 verbatim, the rest of the file is byte for byte as before', () => {
  const dir = project(status(LABELS)); const before = stat(dir);
  const r = run(dir, '--status', '--keep-previous', '3');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(archives(dir), ['status-archive-previous-3-6.md']);
  const arch = readFileSync(join(dir, 'docs/status-archive-previous-3-6.md'), 'utf8');
  const moved = ['6', '5', '4', '3'].map((l) => (l === '5' ? TWO_LINES : block(l))).join('');
  assert.ok(arch.endsWith(moved), 'the archive ends with the moved blocks, verbatim');
  const live = stat(dir);
  assert.deepEqual([...live.matchAll(/^\*\*Previous \(round ([^)]+)\)/gm)].map((m) => m[1]), ['8', '7b', '7']);
  assert.match(live, /^\*\*Archived «Previous» blocks \(nothing deleted\):\*\* `docs\/status-archive-previous-3-6\.md`/m);
  const index = live.match(/^\*\*Archived «Previous» blocks[^\n]*\n\n/m)[0];
  assert.equal(live.replace(index, ''), before.replace(moved, ''), 'live without the index = before without the moved blocks');
  rmSync(dir, { recursive: true, force: true });
});

test('the cold-start text (Fingerprint paragraph up to «Last updated») is identical before and after', () => {
  const dir = project(status(LABELS)); const before = coldStart(stat(dir));
  assert.equal(run(dir, '--status', '--keep-previous', '2').status, 0);
  assert.equal(archives(dir).length, 1, 'something was archived');
  assert.equal(coldStart(stat(dir)), before);
  rmSync(dir, { recursive: true, force: true });
});

test('--dry-run writes nothing; nothing to archive when there are no more blocks than the keep value; the default keep is 5', () => {
  const dir = project(status(LABELS)); const before = stat(dir);
  const d = run(dir, '--status', '--dry-run');
  assert.equal(d.status, 0); assert.match(d.stdout, /dry-run/); assert.match(d.stdout, /archive 2 /);
  assert.equal(stat(dir), before); assert.deepEqual(archives(dir), []);
  assert.equal(run(dir, '--status', '--keep-previous', '7').status, 0);
  assert.equal(stat(dir), before); assert.deepEqual(archives(dir), []);
  assert.equal(run(dir, '--status').status, 0);
  assert.equal([...stat(dir).matchAll(/^\*\*Previous \(round/gm)].length, 5);
  rmSync(dir, { recursive: true, force: true });
});

test('a second batch makes a second archive and appends to the index; an existing archive is never overwritten', () => {
  const dir = project(status(LABELS));
  assert.equal(run(dir, '--status', '--keep-previous', '5').status, 0); // archives 4, 3
  const first = readFileSync(join(dir, 'docs/status-archive-previous-3-4.md'), 'utf8');
  // a new round arrives: two new Previous blocks at the top of the list
  const s = stat(dir).replace('**Previous (round 8)', block('10') + block('9') + '**Previous (round 8)');
  writeFileSync(join(dir, 'CHICLA_PROJECT_STATUS-7.md'), s);
  assert.equal(run(dir, '--status', '--keep-previous', '5').status, 0); // archives 6, 5
  assert.deepEqual(archives(dir).sort(), ['status-archive-previous-3-4.md', 'status-archive-previous-5-6.md']);
  assert.equal(readFileSync(join(dir, 'docs/status-archive-previous-3-4.md'), 'utf8'), first, 'the first archive is untouched');
  const live = stat(dir);
  assert.equal([...live.matchAll(/^\*\*Archived «Previous» blocks/gm)].length, 1, 'one index paragraph');
  assert.match(live, /status-archive-previous-3-4\.md`, `docs\/status-archive-previous-5-6\.md`/);
  const blocked = project(status(['8', '7b', '7', '6'])); writeFileSync(join(blocked, 'docs/status-archive-previous-6-7.md'), 'precious');
  const before = stat(blocked); const r = run(blocked, '--status', '--keep-previous', '2');
  assert.equal(r.status, 1); assert.equal(stat(blocked), before); assert.equal(readFileSync(join(blocked, 'docs/status-archive-previous-6-7.md'), 'utf8'), 'precious');
  rmSync(dir, { recursive: true, force: true }); rmSync(blocked, { recursive: true, force: true });
});

test('it refuses, changing nothing, when another paragraph sits among the blocks, when there are two status files, or when --keep-previous is not an integer >= 1', () => {
  const odd = status(LABELS).replace(block('6'), 'A loose paragraph.\n\n' + block('6'));
  let dir = project(odd); let before = stat(dir);
  assert.equal(run(dir, '--status', '--keep-previous', '2').status, 1); assert.equal(stat(dir), before); assert.deepEqual(archives(dir), []);
  rmSync(dir, { recursive: true, force: true });
  dir = project(status(LABELS)); writeFileSync(join(dir, 'CHICLA_PROJECT_STATUS-6.md'), 'old');
  assert.equal(run(dir, '--status', '--keep-previous', '2').status, 1); assert.deepEqual(archives(dir), []);
  rmSync(dir, { recursive: true, force: true });
  dir = project(status(LABELS));
  for (const bad of ['0', '-1', 'x', '2.5']) { const r = run(dir, '--status', '--keep-previous', bad); assert.equal(r.status, 1, bad); assert.match(r.stderr, /--keep-previous must be an integer >= 1/, `${bad}: the refusal names the option`); }
  assert.deepEqual(archives(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test('--status does not touch CHANGELOG.md, and the plain run (no --status) does not touch the status file', () => {
  const many = '<!-- CHANGELOG_FINGERPRINT: seq=7 -->\n# Changelog\n\n' + Array.from({ length: 12 }, (_, i) => `## Round ${12 - i} — t\n- x\n\n`).join('');
  const dir = project(status(LABELS)); writeFileSync(join(dir, 'CHANGELOG.md'), many); const cl = many; const st = stat(dir);
  assert.equal(run(dir, '--status', '--keep-previous', '2').status, 0);
  assert.equal(archives(dir).length, 1, 'the status blocks were archived');
  assert.equal(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), cl);
  const dir2 = project(status(LABELS)); writeFileSync(join(dir2, 'CHANGELOG.md'), many);
  assert.equal(run(dir2, '--keep', '3').status, 0);
  assert.ok(readdirSync(dir2).some((f) => f.startsWith('CHANGELOG-archive')), 'the plain run archived the CHANGELOG');
  assert.equal(stat(dir2), st);
  rmSync(dir, { recursive: true, force: true }); rmSync(dir2, { recursive: true, force: true });
});
