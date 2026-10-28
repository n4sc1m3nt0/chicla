// Round 250 (C18.2, AUDIT-5 F-2; D-248b confirmed by Rodrigo): `archive-changelog.mjs --rolling` keeps the newest N clauses (default 3) of the
// «Current version» paragraph and of the «Open decisions» paragraph of the status file, moves the older ones verbatim to
// docs/status-archive-rolling-<lo>-<hi>.md and leaves one pointer in each paragraph. Written before the code; red until it exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/archive-changelog.mjs');
const HEAD = '# Chicla — Project Status\n\n## Instructions\n\n1. rule one.\n\n';
const CV_HEAD = '**Current version:** v0.0.9 (';
const CV_CLAUSES = ['round 9: nine, with (nested; round x) parens', 'round 8b: eight b', 'round 8: eight', 'round 7: seven', 'round 6: six', 'round 5 made the thing'];
const CV_CLOSE = ').';
const CV = CV_HEAD + CV_CLAUSES.join('; ') + CV_CLOSE;
const MID = '\n\n**Fingerprint:** seq=7 · app=version.mjs ·\napp_sha256_12=aaaaaaaaaaaa ·\nchangelog_sha256_12=bbbbbbbbbbbb\n\n**Last updated (round 9):** text.\n\n## Snapshot\n\n- Done: round 9.\n\n## Next up\n\n';
const OD_HEAD = '**Open decisions:** ';
const OD_ENTRIES = ['(round 9: none open; D-1 CONFIRMED (Rodrigo: «sim»). **Next:** C1.)', '(round 8: one (a; b) thing)', '(round 7: seven) One call made in round 6: loose text', '(round 6: six)', '(round 5: five)'];
const OD = OD_HEAD + OD_ENTRIES.join(' ');
const TAIL = '\n\n## Gates\n\n| G | x |\n';
const status = (cv = CV, od = OD) => HEAD + cv + MID + od + TAIL;

function project(text, name = 'CHICLA_PROJECT_STATUS-7.md') {
  const dir = mkdtempSync(join(tmpdir(), 'chicla-roll-'));
  mkdirSync(join(dir, 'scripts')); mkdirSync(join(dir, 'docs'));
  copyFileSync(SCRIPT, join(dir, 'scripts/archive-changelog.mjs'));
  writeFileSync(join(dir, name), text);
  writeFileSync(join(dir, 'CHANGELOG.md'), '<!-- CHANGELOG_FINGERPRINT: seq=7 -->\n# Changelog\n\n## Round 1 — a\n- x\n');
  return dir;
}
const run = (dir, ...a) => spawnSync(process.execPath, [join(dir, 'scripts/archive-changelog.mjs'), ...a], { encoding: 'utf8' });
const stat = (dir) => readFileSync(join(dir, 'CHICLA_PROJECT_STATUS-7.md'), 'utf8');
const archives = (dir) => readdirSync(join(dir, 'docs')).filter((f) => f.startsWith('status-archive-rolling-'));
const line = (t, start) => t.split('\n').find((l) => l.startsWith(start));
const done = (dir) => rmSync(dir, { recursive: true, force: true });
const lines = (arch, title) => { const s = arch.split(`\n## ${title}\n`)[1]; return s.split('\n## ')[0].split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2)); };
const PTR_CV = (names) => `; older rounds archived (nothing deleted): ${names.map((n) => `\`docs/${n}\``).join(', ')}`;
const PTR_OD = (names) => `(earlier rounds: archived verbatim, nothing deleted: ${names.map((n) => `\`docs/${n}\``).join(', ')})`;

test('--rolling keeps the newest 3 clauses of each paragraph, archives the older ones verbatim, and archive + live rebuild the original', () => {
  const dir = project(status()); const before = stat(dir);
  const r = run(dir, '--rolling');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(archives(dir), ['status-archive-rolling-5-7.md']);
  const live = stat(dir), name = 'status-archive-rolling-5-7.md';
  assert.equal(line(live, '**Current version:**'), CV_HEAD + CV_CLAUSES.slice(0, 3).join('; ') + PTR_CV([name]) + CV_CLOSE);
  assert.equal(line(live, '**Open decisions:**'), OD_HEAD + OD_ENTRIES.slice(0, 3).join(' ') + ' ' + PTR_OD([name]));
  const arch = readFileSync(join(dir, 'docs', name), 'utf8');
  assert.deepEqual(lines(arch, 'Current version clauses'), CV_CLAUSES.slice(3), 'moved clauses, verbatim, one per line');
  assert.deepEqual(lines(arch, 'Open decisions entries'), OD_ENTRIES.slice(3), 'moved entries, verbatim, one per line');
  // rebuild: take the pointer out, put the archived text back
  const cvBack = line(live, '**Current version:**').replace(PTR_CV([name]), '').replace(CV_CLOSE, '; ' + lines(arch, 'Current version clauses').join('; ') + CV_CLOSE);
  const odBack = line(live, '**Open decisions:**').replace(' ' + PTR_OD([name]), ' ' + lines(arch, 'Open decisions entries').join(' '));
  assert.equal(stat(dir).replace(line(live, '**Current version:**'), cvBack).replace(line(live, '**Open decisions:**'), odBack), before);
  done(dir);
});

test('everything outside the two paragraphs is byte for byte as before', () => {
  const dir = project(status()); const before = stat(dir);
  assert.equal(run(dir, '--rolling').status, 0);
  const outside = (t) => t.split('\n').filter((l) => !l.startsWith('**Current version:**') && !l.startsWith('**Open decisions:**')).join('\n');
  assert.equal(outside(stat(dir)), outside(before));
  done(dir);
});

test('a paragraph with no more clauses than the keep value is untouched; with nothing to archive no file is written', () => {
  const dir = project(status()); const before = stat(dir);
  const r = run(dir, '--rolling', '--keep-clauses', '6');
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /nothing to archive/);
  assert.equal(stat(dir), before); assert.deepEqual(archives(dir), []);
  // only one paragraph is long: the short one stays as it is
  const dir2 = project(status('**Current version:** v0.0.1 (round 2: b; round 1: a).')); const b2 = stat(dir2);
  assert.equal(run(dir2, '--rolling').status, 0);
  assert.equal(line(stat(dir2), '**Current version:**'), '**Current version:** v0.0.1 (round 2: b; round 1: a).');
  assert.notEqual(stat(dir2), b2, 'the Open decisions paragraph was archived');
  // the template shapes (no parenthesised clauses at all) are fine too
  const dir3 = project(status('**Current version:** v0.0.1 (round 1)', '**Open decisions:** none.')); const b3 = stat(dir3);
  const r3 = run(dir3, '--rolling'); assert.equal(r3.status, 0, r3.stderr); assert.equal(stat(dir3), b3);
  for (const d of [dir, dir2, dir3]) done(d);
});

test('--dry-run writes nothing and says what it would do; the default keep is 3 and --keep-clauses changes it', () => {
  const dir = project(status()); const before = stat(dir);
  const d = run(dir, '--rolling', '--dry-run');
  assert.equal(d.status, 0); assert.match(d.stdout, /dry-run/); assert.match(d.stdout, /3 clauses/); assert.match(d.stdout, /2 entries/);
  assert.equal(stat(dir), before); assert.deepEqual(archives(dir), []);
  assert.equal(run(dir, '--rolling', '--keep-clauses', '1').status, 0);
  assert.equal(line(stat(dir), '**Open decisions:**').startsWith(OD_HEAD + OD_ENTRIES[0] + ' (earlier rounds:'), true);
  done(dir);
});

test('a second batch adds to the one pointer of each paragraph (never a second pointer), and an existing archive is never overwritten', () => {
  const dir = project(status());
  assert.equal(run(dir, '--rolling').status, 0);
  const r = run(dir, '--rolling', '--keep-clauses', '2');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(archives(dir), ['status-archive-rolling-5-7.md', 'status-archive-rolling-7-8.md']);
  const live = stat(dir), names = ['status-archive-rolling-5-7.md', 'status-archive-rolling-7-8.md'];
  assert.equal(line(live, '**Current version:**'), CV_HEAD + CV_CLAUSES.slice(0, 2).join('; ') + PTR_CV(names) + CV_CLOSE);
  assert.equal(line(live, '**Open decisions:**'), OD_HEAD + OD_ENTRIES.slice(0, 2).join(' ') + ' ' + PTR_OD(names));
  assert.equal(live.split('older rounds archived').length, 2); assert.equal(live.split('earlier rounds: archived').length, 2);
  // an archive with the name the run would use is refused, nothing changes
  const dir2 = project(status()); writeFileSync(join(dir2, 'docs/status-archive-rolling-5-7.md'), 'x'); const b2 = stat(dir2);
  const r2 = run(dir2, '--rolling'); assert.equal(r2.status, 1); assert.match(r2.stderr, /already exists/);
  assert.equal(stat(dir2), b2); assert.equal(readFileSync(join(dir2, 'docs/status-archive-rolling-5-7.md'), 'utf8'), 'x');
  done(dir); done(dir2);
});

test('it refuses, changing nothing, when --keep-clauses is not an integer >= 1, or when there is not exactly one status file; stray text between clauses stays glued to the clause before it, verbatim', () => {
  const dir = project(status()); const before = stat(dir);
  for (const v of ['0', 'x', '1.5']) { const r = run(dir, '--rolling', '--keep-clauses', v); assert.equal(r.status, 1, v); assert.match(r.stderr, /--keep-clauses/); }
  assert.equal(stat(dir), before); assert.deepEqual(archives(dir), []);
  writeFileSync(join(dir, 'CHICLA_PROJECT_STATUS-8.md'), before);
  const r = run(dir, '--rolling'); assert.equal(r.status, 1); assert.match(r.stderr, /exactly one/);
  const dir2 = project(status(CV_HEAD + 'round 9: a; round 8: b; round 7: c; a clause with no number; round 5: e' + CV_CLOSE)); const b2 = stat(dir2);
  const r2 = run(dir2, '--rolling', '--keep-clauses', '2'); assert.equal(r2.status, 0, r2.stderr);
  assert.ok(readFileSync(join(dir2, 'docs', archives(dir2)[0]), 'utf8').includes('a clause with no number'));
  assert.notEqual(stat(dir2), b2);
  done(dir); done(dir2);
});

test('the real status file keeps both paragraphs short, and instruction 6 names --rolling', () => {
  const name = readdirSync(ROOT).filter((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f)).sort((x, y) => parseInt(x.split('-')[1]) - parseInt(y.split('-')[1])).pop();
  const s = readFileSync(join(ROOT, name), 'utf8');
  for (const start of ['**Current version:**', '**Open decisions:**']) {
    const l = line(s, start);
    assert.ok(Buffer.byteLength(l) <= 6000, `${start} is ${Buffer.byteLength(l)} bytes; run node scripts/archive-changelog.mjs --rolling`);
  }
  assert.match(s.split('\n').find((l) => l.startsWith('6. **History is never deleted.**')), /--rolling/);
  const docs = readdirSync(join(ROOT, 'docs'));
  const arch = docs.filter((f) => /^status-archive-rolling-.*\.md$/.test(f));
  assert.ok(arch.length >= 1);
  for (const f of arch) assert.ok(s.includes(f), `${f} is not named in the status file`);
});
