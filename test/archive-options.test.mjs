// Round 257 (C19.1, AUDIT-6 F-2; D142 confirmed by Rodrigo: «d142 sim»): `archive-changelog.mjs` refuses an argument it does not know. Before, `--help` (or a typo) fell through to the
// default command and ARCHIVED the CHANGELOG for real (round 251). Now: an unknown option or a stray word exits 2 with a usage text and changes nothing; `--help` / `-h` print the usage and
// exit 0; every known option still works. Written before the code; red until it. Tests assert exit codes and file facts, never wording (product rule 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(fileURLToPath(new URL('..', import.meta.url)), 'scripts/archive-changelog.mjs');
const rounds = Array.from({ length: 14 }, (_, i) => `## Round ${14 - i} — entry ${14 - i}\n\n- text of ${14 - i}\n`).join('\n');
const blocks = [9, 8, 7, 6, 5, 4, 3].map((n) => `**Previous (round ${n}):** text of ${n}.\n`).join('\n');
const STATUS = `# Status\n\n**Current version:** v1 (round 9: a; round 8: b; round 7: c; round 6: d).\n\n**Fingerprint:** seq=3 ·\napp=x\n\n**Last updated (round 10):** now.\n\n${blocks}\n## Snapshot\n\n${[9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 10, 11].map((n) => `- Done: round ${n}.`).join('\n')}\n\n## Next up\n\n**Open decisions:** (round 9: a) (round 8: b) (round 7: c) (round 6: d)\n\n## Gates\n\n| G | x |\n`;

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'chicla-arcopt-'));
  mkdirSync(join(dir, 'scripts')); mkdirSync(join(dir, 'docs'));
  copyFileSync(SCRIPT, join(dir, 'scripts/archive-changelog.mjs'));
  writeFileSync(join(dir, 'CHANGELOG.md'), `<!-- CHANGELOG_FINGERPRINT: seq=3 -->\n# Changelog\n\n${rounds}`);
  writeFileSync(join(dir, 'CHICLA_PROJECT_STATUS-3.md'), STATUS);
  return dir;
}
const run = (dir, ...a) => spawnSync(process.execPath, [join(dir, 'scripts/archive-changelog.mjs'), ...a], { encoding: 'utf8' });
const tree = (dir) => readdirSync(dir, { recursive: true }).sort().map((f) => { try { return `${f}:${readFileSync(join(dir, f), 'utf8')}`; } catch { return `${f}:/`; } }).join('\u241E');
const withProject = (fn) => { const dir = project(); try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test('an option the script does not know, or a stray word, exits 2 with a usage text on stderr and changes nothing', () => {
  for (const bad of [['--bogus'], ['--rollin'], ['--status2'], ['stray'], ['-x'], ['--keep=3'], ['--dry-run', 'oops'], ['--status', '--bogus'], ['--keep', '5', 'extra']]) withProject((dir) => {
    const before = tree(dir), r = run(dir, ...bad);
    assert.equal(r.status, 2, `${bad.join(' ')}: exit ${r.status}`);
    assert.ok(r.stderr.trim().length > 0, 'a usage text on stderr');
    assert.equal(r.stdout, '');
    assert.equal(tree(dir), before, `${bad.join(' ')}: nothing in the project changed`);
  });
});

test('--help and -h print the usage on stdout, exit 0, and change nothing (they used to archive the CHANGELOG for real)', () => {
  for (const h of ['--help', '-h']) withProject((dir) => {
    const before = tree(dir), r = run(dir, h);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.trim().length > 0 && r.stderr === '');
    assert.equal(tree(dir), before);
  });
});

test('every known option still works: the four modes, --dry-run and the four counts take their value as a word of their own', () => {
  for (const ok of [['--dry-run'], ['--keep', '5', '--dry-run'], ['--status', '--dry-run'], ['--status', '--keep-previous', '2', '--dry-run'], ['--snapshot', '--dry-run', '--keep-done', '3'], ['--rolling', '--dry-run', '--keep-clauses', '2']]) withProject((dir) => {
    const before = tree(dir), r = run(dir, ...ok);
    assert.equal(r.status, 0, `${ok.join(' ')}: exit ${r.status}: ${r.stderr}`);
    assert.equal(tree(dir), before, `${ok.join(' ')}: a dry run writes nothing`);
  });
});

test('a count option with no value, or with a bad one, is still the old error (exit 1), not a silent default', () => {
  for (const bad of [['--keep'], ['--keep', 'x'], ['--status', '--keep-previous'], ['--rolling', '--keep-clauses', '0']]) withProject((dir) => {
    const before = tree(dir), r = run(dir, ...bad);
    assert.equal(r.status, 1, `${bad.join(' ')}: exit ${r.status}`);
    assert.equal(tree(dir), before);
  });
});

test('without an option the default command still archives the CHANGELOG (the behaviour the check must keep)', () => withProject((dir) => {
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(readdirSync(join(dir, 'docs/archive/changelog')).some((f) => /^CHANGELOG-archive-rounds-\d/.test(f)), 'an archive file was written');
}));

// Round 305 (C27.1, D-305a to D-305d, «confirmo tudo»): the archives of the CHANGELOG live in docs/archive/changelog/, not in the root. Written before the code; red until it.
const ARCH = 'docs/archive/changelog';
test('C27.1: the archive goes to docs/archive/changelog/ (the folder is created), never to the root', () => withProject((dir) => {
  assert.equal(run(dir).status, 0);
  assert.deepEqual(readdirSync(dir).filter((f) => f.startsWith('CHANGELOG-archive')), [], 'nothing in the root');
  const files = readdirSync(join(dir, ARCH));
  assert.equal(files.length, 1);
  assert.match(files[0], /^CHANGELOG-archive-rounds-.+\.md$/);
}));

test('C27.1: --dry-run does not create the folder either', () => withProject((dir) => {
  const before = tree(dir);
  assert.equal(run(dir, '--dry-run').status, 0);
  assert.equal(tree(dir), before);
}));

test('C27.1: the index line of the live CHANGELOG names the archive with its folder, and the archive header says where to grep', () => withProject((dir) => {
  assert.equal(run(dir).status, 0);
  const name = readdirSync(join(dir, ARCH))[0];
  const live = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
  assert.ok(live.includes(`\`${ARCH}/${name}\``), 'the index names the path');
  assert.ok(readFileSync(join(dir, ARCH, name), 'utf8').includes(`${ARCH}/CHANGELOG-archive-*.md`), 'the header greps in the folder');
}));

test('C27.1: an archive already in the folder is never overwritten (exit 1, nothing changed)', () => withProject((dir) => {
  const before = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
  assert.equal(run(dir, '--dry-run').status, 0);
  const name = (/archive (\d+) rounds \((.+?)\)/.exec(run(dir, '--dry-run').stdout) || [])[2];
  assert.ok(name, 'the dry run names the rounds');
  mkdirSync(join(dir, ARCH), { recursive: true });
  const target = join(dir, ARCH, `CHANGELOG-archive-rounds-${name}.md`);
  writeFileSync(target, 'precious');
  assert.equal(run(dir).status, 1);
  assert.equal(readFileSync(target, 'utf8'), 'precious');
  assert.equal(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), before);
}));
