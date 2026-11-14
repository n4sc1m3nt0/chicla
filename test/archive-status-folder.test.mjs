// Round 308 (C27.4, D155: Claude's label, confirmed by Rodrigo with D154): the three status-file archives (`--status`, `--snapshot`, `--rolling`) go to docs/archive/status/,
// not to docs/ (C27.1 did the same for the CHANGELOG). The names stay. Written before the code; red until it. Tests assert exit codes and file facts, never wording (product rule 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(fileURLToPath(new URL('..', import.meta.url)), 'packages/chicla-kit/src/archive-changelog.mjs');
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

const ARCH = 'docs/archive/status';
const MODES = [
  ['--status', '--keep-previous', '2', 'status-archive-previous-'],
  ['--snapshot', '--keep-done', '3', 'status-archive-done-'],
  ['--rolling', '--keep-clauses', '2', 'status-archive-rolling-'],
];
const inDocs = (dir, prefix) => readdirSync(join(dir, 'docs')).filter((f) => f.startsWith(prefix));

for (const [mode, opt, n, prefix] of MODES) {
  test(`C27.4 ${mode}: the archive goes to ${ARCH}/ (the folder is created), never to docs/`, () => withProject((dir) => {
    const r = run(dir, mode, opt, n);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(inDocs(dir, prefix), [], 'nothing of this kind in docs/');
    const files = readdirSync(join(dir, ARCH)).filter((f) => f.startsWith(prefix));
    assert.equal(files.length, 1);
    assert.match(files[0], /\.md$/);
  }));

  test(`C27.4 ${mode}: --dry-run does not create the folder`, () => withProject((dir) => {
    const before = tree(dir);
    assert.equal(run(dir, mode, opt, n, '--dry-run').status, 0);
    assert.equal(tree(dir), before);
  }));

  test(`C27.4 ${mode}: the live status file names the archive with its folder`, () => withProject((dir) => {
    assert.equal(run(dir, mode, opt, n).status, 0);
    const name = readdirSync(join(dir, ARCH)).find((f) => f.startsWith(prefix));
    const live = readFileSync(join(dir, 'CHICLA_PROJECT_STATUS-3.md'), 'utf8');
    assert.ok(live.includes(`\`${ARCH}/${name}\``), 'the index names the path');
    assert.ok(readFileSync(join(dir, ARCH, name), 'utf8').includes(`${ARCH}/${prefix}`), 'the header greps in the folder');
  }));

  test(`C27.4 ${mode}: an archive already in the folder is never overwritten (exit 1, nothing changed)`, () => withProject((dir) => {
    assert.equal(run(dir, mode, opt, n).status, 0);
    const name = readdirSync(join(dir, ARCH)).find((f) => f.startsWith(prefix));
    const dir2 = project();
    mkdirSync(join(dir2, ARCH), { recursive: true });
    writeFileSync(join(dir2, ARCH, name), 'precious');
    const before = readFileSync(join(dir2, 'CHICLA_PROJECT_STATUS-3.md'), 'utf8');
    assert.equal(run(dir2, mode, opt, n).status, 1);
    assert.equal(readFileSync(join(dir2, ARCH, name), 'utf8'), 'precious');
    assert.equal(readFileSync(join(dir2, 'CHICLA_PROJECT_STATUS-3.md'), 'utf8'), before);
    rmSync(dir2, { recursive: true, force: true });
  }));
}
