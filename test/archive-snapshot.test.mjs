// Round 241 (C16.7, D139): `archive-changelog.mjs --snapshot` moves the old lines of the status file's Snapshot to docs/status-archive-done-<lo>-<hi>.md,
// verbatim, keeps the newest ones and leaves one index line. Written before the code; red until it exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/archive-changelog.mjs');
const HEAD = '# Chicla — Project Status\n\n## Instructions\n\n1. rule one.\n\n**Current version:** v0.0.1 (x)\n\n**Fingerprint:** seq=7 · app=version.mjs ·\napp_sha256_12=aaaaaaaaaaaa ·\nchangelog_sha256_12=bbbbbbbbbbbb\n\n**Last updated (round 9):** newest text.\n\n**Previous (round 8):** older text.\n\n';
const TAIL = '\n## Next up\n\nnext.\n\n## Gates\n\n| G | x |\n';
const B = {
  9: '- Done: round 9 (2026-10-22). The newest.',
  8: '- Done (part): slice b (round 8, 2026-10-21). A part.',
  7: '- Done: round 7. A long one\n  that goes on in a second line.',
  6: '- Recovery delivery (round 6, 2026-10-11): a note that is not a «Done».',
  5: '- Done: round 5.',
  4: '- Done: round 4.',
  3: '- Done: C1.1 (round 3, 2026-10-08).',
};
const ORDER = [9, 8, 7, 6, 5, 4, 3];
const snap = (labels, extra = '') => `## Snapshot\n\n${labels.map((l) => B[l] ?? l).join('\n')}\n${extra}${TAIL}`;
const status = (labels, extra) => HEAD + snap(labels, extra);

function project(text, name = 'CHICLA_PROJECT_STATUS-7.md') {
  const dir = mkdtempSync(join(tmpdir(), 'chicla-snap-'));
  mkdirSync(join(dir, 'scripts')); mkdirSync(join(dir, 'docs'));
  copyFileSync(SCRIPT, join(dir, 'scripts/archive-changelog.mjs'));
  writeFileSync(join(dir, name), text);
  writeFileSync(join(dir, 'CHANGELOG.md'), '<!-- CHANGELOG_FINGERPRINT: seq=7 -->\n# Changelog\n\n## Round 1 — a\n- x\n');
  return dir;
}
const run = (dir, ...a) => spawnSync(process.execPath, [join(dir, 'scripts/archive-changelog.mjs'), ...a], { encoding: 'utf8' });
const stat = (dir) => readFileSync(join(dir, 'CHICLA_PROJECT_STATUS-7.md'), 'utf8');
const archives = (dir) => readdirSync(join(dir, 'docs')).filter((f) => f.startsWith('status-archive-done-'));
const bullets = (t) => t.slice(t.indexOf('## Snapshot'), t.indexOf('\n## Next up')).split('\n').filter((l) => l.startsWith('- '));
const done = (dir) => rmSync(dir, { recursive: true, force: true });

test('--snapshot --keep-done 3: keeps the 3 newest lines, archives the other 4 verbatim (a «Done (part)», a note and a two-line entry included), the rest is byte for byte as before', () => {
  const dir = project(status(ORDER)); const before = stat(dir);
  const r = run(dir, '--snapshot', '--keep-done', '3');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(archives(dir), ['status-archive-done-3-6.md']);
  const moved = [B[6], B[5], B[4], B[3]].join('\n') + '\n';
  assert.ok(readFileSync(join(dir, 'docs/status-archive-done-3-6.md'), 'utf8').endsWith(moved), 'verbatim at the end of the archive');
  const live = stat(dir);
  assert.deepEqual(bullets(live), [B[9], B[8], B[7].split('\n')[0], '- Archived «Done» lines (nothing deleted): `docs/status-archive-done-3-6.md`']);
  const idx = '- Archived «Done» lines (nothing deleted): `docs/status-archive-done-3-6.md`\n';
  assert.equal(live.replace(idx, ''), before.replace(moved, ''), 'live without the index = before without the moved lines');
  done(dir);
});

test('the cold-start text, the Previous blocks and everything outside the Snapshot are identical before and after', () => {
  const dir = project(status(ORDER)); const before = stat(dir);
  assert.equal(run(dir, '--snapshot', '--keep-done', '2').status, 0);
  const live = stat(dir);
  const outside = (t) => t.slice(0, t.indexOf('## Snapshot')) + t.slice(t.indexOf('\n## Next up'));
  assert.equal(outside(live), outside(before));
  assert.equal(archives(dir).length, 1);
  done(dir);
});

test('--dry-run writes nothing; nothing to archive when there are no more lines than the keep value; the default keep is 10', () => {
  const lots = Array.from({ length: 14 }, (_, i) => `- Done: round ${20 - i}.`);
  const dir = project(status(lots)); const before = stat(dir);
  const d = run(dir, '--snapshot', '--dry-run');
  assert.equal(d.status, 0); assert.match(d.stdout, /dry-run/); assert.match(d.stdout, /archive 4 lines/);
  assert.equal(stat(dir), before); assert.deepEqual(archives(dir), []);
  assert.equal(run(dir, '--snapshot', '--keep-done', '14').status, 0); assert.equal(stat(dir), before);
  assert.equal(run(dir, '--snapshot').status, 0);
  assert.equal(bullets(stat(dir)).filter((l) => l.startsWith('- Done')).length, 10);
  assert.deepEqual(archives(dir), ['status-archive-done-7-10.md']);
  done(dir);
});

test('a second batch makes a second archive and appends to the index; an existing archive is never overwritten', () => {
  const dir = project(status(ORDER));
  assert.equal(run(dir, '--snapshot', '--keep-done', '5').status, 0); // archives 4 and 3
  const first = readFileSync(join(dir, 'docs/status-archive-done-3-4.md'), 'utf8');
  writeFileSync(join(dir, 'CHICLA_PROJECT_STATUS-7.md'), stat(dir).replace('- Done: round 9', '- Done: round 11.\n- Done: round 10.\n- Done: round 9'));
  assert.equal(run(dir, '--snapshot', '--keep-done', '5').status, 0); // archives 6 and 5 (the two oldest of the kept ones)
  assert.deepEqual(archives(dir).sort(), ['status-archive-done-3-4.md', 'status-archive-done-5-6.md']);
  assert.equal(readFileSync(join(dir, 'docs/status-archive-done-3-4.md'), 'utf8'), first, 'the first archive is untouched');
  const live = stat(dir);
  assert.equal([...live.matchAll(/^- Archived «Done» lines/gm)].length, 1, 'one index line');
  assert.match(live, /status-archive-done-3-4\.md`, `docs\/status-archive-done-5-6\.md`/);
  const blocked = project(status([9, 8, 7, 6])); writeFileSync(join(blocked, 'docs/status-archive-done-6-7.md'), 'precious');
  const b = stat(blocked); const r = run(blocked, '--snapshot', '--keep-done', '2');
  assert.equal(r.status, 1); assert.equal(stat(blocked), b); assert.equal(readFileSync(join(blocked, 'docs/status-archive-done-6-7.md'), 'utf8'), 'precious');
  done(dir); done(blocked);
});

test('it refuses, changing nothing: a loose paragraph or a blank line among the lines, an index that is not last, two status files, no Snapshot, a bad --keep-done', () => {
  const cases = {
    'a loose paragraph': status([9, 8, 'A loose paragraph.', 7, 6]),
    'a blank line between lines': status([9, 8, '', 7, 6]),
    'an index that is not the last line': status([9, '- Archived «Done» lines (nothing deleted): `docs/status-archive-done-1-2.md`', 8, 7, 6]),
    'no Snapshot': HEAD + '## Next up\n\nnext.\n',
  };
  for (const [name, text] of Object.entries(cases)) {
    const dir = project(text); const before = stat(dir);
    const r = run(dir, '--snapshot', '--keep-done', '2');
    assert.equal(r.status, 1, name); assert.equal(stat(dir), before, name); assert.deepEqual(archives(dir), [], name); done(dir);
  }
  let dir = project(status(ORDER)); writeFileSync(join(dir, 'CHICLA_PROJECT_STATUS-6.md'), 'old');
  assert.equal(run(dir, '--snapshot', '--keep-done', '2').status, 1); assert.deepEqual(archives(dir), []); done(dir);
  dir = project(status(ORDER));
  for (const bad of ['0', '-1', 'x', '2.5']) { const r = run(dir, '--snapshot', '--keep-done', bad); assert.equal(r.status, 1, bad); assert.match(r.stderr, /--keep-done must be an integer >= 1/); }
  assert.deepEqual(archives(dir), []); done(dir);
});

test('lines with no round number are archived too; only if none of them has one is it refused', () => {
  const dir = project(status([9, 8, '- Done: an old thing without any number.', '- Done: another one.'])); const b = stat(dir);
  assert.equal(run(dir, '--snapshot', '--keep-done', '2').status, 1, 'the name needs at least one round number among the moved lines'); assert.equal(stat(dir), b);
  const ok = project(status([9, 8, '- Done: an old thing without any number.', B[4]]));
  assert.equal(run(ok, '--snapshot', '--keep-done', '2').status, 0); assert.deepEqual(archives(ok), ['status-archive-done-4-4.md']);
  done(dir); done(ok);
});

test('--snapshot leaves CHANGELOG.md and the Previous blocks alone, and --status and the plain run leave the Snapshot alone', () => {
  const many = '<!-- CHANGELOG_FINGERPRINT: seq=7 -->\n# Changelog\n\n' + Array.from({ length: 12 }, (_, i) => `## Round ${12 - i} — t\n- x\n\n`).join('');
  const dir = project(status(ORDER)); writeFileSync(join(dir, 'CHANGELOG.md'), many);
  assert.equal(run(dir, '--snapshot', '--keep-done', '2').status, 0);
  assert.equal(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), many);
  assert.match(stat(dir), /\*\*Previous \(round 8\):\*\* older text\./);
  const dir2 = project(status(ORDER)); writeFileSync(join(dir2, 'CHANGELOG.md'), many); const before = stat(dir2);
  assert.equal(run(dir2, '--status', '--keep-previous', '1').status, 0); assert.equal(run(dir2, '--keep', '3').status, 0);
  assert.equal(stat(dir2), before, 'the Snapshot (and the rest) untouched');
  done(dir); done(dir2);
});

test('the archive name is the lowest and the highest round named in the moved lines, even when the lines are not in round order', () => {
  const dir = project(status([9, '- Done: round 5.', '- Done: round 12 (out of order).', '- Done: C2.1 (round 3, x).']));
  assert.equal(run(dir, '--snapshot', '--keep-done', '1').status, 0);
  assert.deepEqual(archives(dir), ['status-archive-done-3-12.md']);
  done(dir);
});
