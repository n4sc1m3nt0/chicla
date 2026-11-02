// C26.3 (round 300, D151, D-C confirmed by Rodrigo): the last readers of the status-file name move to the prefix of C26.1 (`status-prefix:` in CLAUDE.md, none = CHICLA):
// `emergency-dump.mjs` (its own copy, D7), `pinned/recovery-report.mjs` (PINNED: the toolchain pin moves, G-C11 is due again) and `scripts/archive-changelog.mjs`
// (it is copied alone into a temp project by its tests, so it cannot import the kit: it reads the line itself). Written before the code; red until it exists.
// The dump names the status file of the project's prefix (never a guess: an invalid or conflicting line, or only a file of another prefix, is «(not found)»);
// the recovery does not call an OLDER status file of the baseline «removed» whatever its prefix (a status file is renumbered every round);
// `archive-changelog` finds the status file of the prefix and still refuses two, or none. Tests assert marker fields, lists and exit codes, never wording.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinnedFile } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PY = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();
const T = mkdtempSync(join(tmpdir(), 'chicla-c263-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
const fresh = () => { const d = join(T, `t${n++}`); mkdirSync(d); return d; };
const put = (base, rel, text = 'x\n') => { mkdirSync(dirname(join(base, rel)), { recursive: true }); writeFileSync(join(base, rel), text); };
const rules = (...lines) => `# rules\n\n${lines.join('\n')}\n`;

// ---- the dump ----
/** Dumps a project `work/chicla` made of `files` and returns the `statusFile` of its RECOVERY_MARKER.json. */
const dumped = (files) => {
  const t = fresh(), work = join(t, 'work'), out = join(t, 'out');
  put(work, 'chicla/package.json', '{"version":"0.0.1"}\n'); put(work, 'chicla/FILES.manifest', 'a.txt\n'); put(work, 'chicla/CHANGELOG.md', '<!-- CHANGELOG_FINGERPRINT: seq=5 -->\n# Changelog\n\n## Round 5 — x\n');
  for (const [k, v] of Object.entries(files)) put(work, `chicla/${k}`, v);
  mkdirSync(out, { recursive: true });
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/emergency-dump.mjs'), '--work', work, '--outdir', out, '--project-only', 'c263'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const zip = readdirSync(out).find((f) => f.endsWith('.zip'));
  assert.ok(zip, r.stdout + r.stderr);
  const m = spawnSync('unzip', ['-p', join(out, zip), 'RECOVERY_MARKER.json'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(m.status, 0, m.stderr);
  return JSON.parse(m.stdout).statusFile;
};

test('dump: the status file named in the marker is the one of the prefix in CLAUDE.md, whatever other status files lie in the project', () => {
  assert.equal(dumped({ 'CLAUDE.md': rules('status-prefix: ACME'), 'ACME_PROJECT_STATUS-5.md': 's\n', 'CHICLA_PROJECT_STATUS-9.md': 's\n' }), 'ACME_PROJECT_STATUS-5.md');
});

test('dump: no line (or no CLAUDE.md) is the legacy CHICLA name', () => {
  assert.equal(dumped({ 'CLAUDE.md': rules('- a rule'), 'CHICLA_PROJECT_STATUS-5.md': 's\n' }), 'CHICLA_PROJECT_STATUS-5.md');
  assert.equal(dumped({ 'CHICLA_PROJECT_STATUS-5.md': 's\n' }), 'CHICLA_PROJECT_STATUS-5.md');
});

test('dump: never a guess: an invalid line, two different lines, or only a status file of another prefix is «(not found)»', () => {
  assert.equal(dumped({ 'CLAUDE.md': rules('status-prefix: acme'), 'ACME_PROJECT_STATUS-5.md': 's\n', 'CHICLA_PROJECT_STATUS-5.md': 's\n' }), '(not found)');
  assert.equal(dumped({ 'CLAUDE.md': rules('status-prefix: ACME', 'status-prefix: OTHER'), 'ACME_PROJECT_STATUS-5.md': 's\n' }), '(not found)');
  assert.equal(dumped({ 'CLAUDE.md': rules('status-prefix: ACME'), 'CHICLA_PROJECT_STATUS-5.md': 's\n' }), '(not found)');
});

// ---- the recovery ----
const pyzip = (path, entries) => assert.equal(spawnSync(PY, ['-c', 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1],"w");[z.writestr(n,t) for n,t in json.loads(sys.argv[2])];z.close()', path, JSON.stringify(entries)], { encoding: 'utf8' }).status, 0);
const recover = (dumpFiles, baseFiles) => {
  const t = fresh(), P = 'work/chicla/', dump = join(t, 'd.zip'), base = join(t, 'b.zip'), out = join(t, 'rec');
  const marker = JSON.stringify({ format: 'chicla-recovery-v1', projectRootRel: 'chicla', hashes: {}, created: 'x', note: 't' });
  pyzip(dump, [['RECOVERY_MARKER.json', marker], [`${P}package.json`, '{}'], [`${P}FILES.manifest`, 'a.txt\n'], ...dumpFiles.map(([k, v]) => [P + k, v])]);
  pyzip(base, [['chicla/package.json', '{}'], ...baseFiles.map(([k, v]) => [`chicla/${k}`, v])]);
  const r = spawnSync(process.execPath, [pinnedFile(ROOT, 'recovery-report'), dump, '--baseline', base, '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return readFileSync(join(out, 'RECOVERY_DIFF.md'), 'utf8');
};

test('recovery: the older status file of the baseline is not «removed», whatever the prefix; another lost file still is', { skip: !PY }, () => {
  const diff = recover([['ACME_PROJECT_STATUS-5.md', 's'], ['a.txt', 'a']], [['ACME_PROJECT_STATUS-4.md', 's'], ['a.txt', 'a'], ['gone.txt', 'g']]);
  assert.ok(!diff.includes('ACME_PROJECT_STATUS-4.md'), 'the renumbered status file is not a loss');
  assert.ok(diff.includes('gone.txt'), 'a file that is really gone is still reported');
});

test('recovery: the legacy name is still not «removed» (guard)', { skip: !PY }, () => {
  const diff = recover([['CHICLA_PROJECT_STATUS-5.md', 's']], [['CHICLA_PROJECT_STATUS-4.md', 's'], ['gone.txt', 'g']]);
  assert.ok(!diff.includes('CHICLA_PROJECT_STATUS-4.md'));
  assert.ok(diff.includes('gone.txt'));
});

// ---- archive-changelog (copied alone into a temp project, as its own tests do) ----
const HEAD = '# Status\n\n**Current version:** v0.0.1 (x)\n\n**Fingerprint:** seq=7\n\n**Last updated (round 9):** newest.\n\n';
const BLOCKS = ['8', '7', '6', '5'].map((r) => `**Previous (round ${r}):** text of ${r}.\n\n`).join('');
const TAIL = '## Snapshot\n\n- Done: round 9.\n\n## Next up\n\nnext.\n';
const project = (claude, statusNames) => {
  const d = fresh(); mkdirSync(join(d, 'docs')); mkdirSync(join(d, 'scripts'));
  copyFileSync(join(ROOT, 'scripts/archive-changelog.mjs'), join(d, 'scripts/archive-changelog.mjs'));
  put(d, 'CHANGELOG.md', '<!-- CHANGELOG_FINGERPRINT: seq=7 -->\n# Changelog\n\n## Round 1 — a\n- x\n');
  if (claude !== null) put(d, 'CLAUDE.md', claude);
  for (const s of statusNames) put(d, s, HEAD + BLOCKS + TAIL);
  return d;
};
const run = (d, ...a) => spawnSync(process.execPath, [join(d, 'scripts/archive-changelog.mjs'), ...a], { encoding: 'utf8' });
const archives = (d) => readdirSync(join(d, 'docs')).filter((f) => f.startsWith('status-archive-previous-'));

test('archive-changelog --status: archives the old «Previous» blocks of the status file of the prefix in CLAUDE.md', () => {
  const d = project(rules('status-prefix: ACME'), ['ACME_PROJECT_STATUS-7.md']);
  const r = run(d, '--status', '--keep-previous', '2');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(archives(d).length, 1);
  assert.deepEqual([...readFileSync(join(d, 'ACME_PROJECT_STATUS-7.md'), 'utf8').matchAll(/^\*\*Previous \(round ([^)]+)\)/gm)].map((m) => m[1]), ['8', '7']);
});

test('archive-changelog: no line is the legacy name; the three modes all look for the status file of the prefix, not for the Chicla name', () => {
  const legacy = project(rules('- a rule'), ['CHICLA_PROJECT_STATUS-7.md']);
  assert.equal(run(legacy, '--status', '--keep-previous', '2').status, 0);
  for (const mode of ['--status', '--snapshot', '--rolling']) {
    const d = project(rules('status-prefix: ACME'), ['ACME_PROJECT_STATUS-7.md']);
    const r = run(d, mode);
    assert.doesNotMatch(r.stderr, /expected exactly one/, `${mode}: ${r.stderr}`);
  }
});

test('archive-changelog: never a guess: a status file of another prefix than the line, two files of the prefix, an invalid or a conflicting line all stop it, nothing changed', () => {
  for (const [claude, names] of [
    [rules('status-prefix: ACME'), ['CHICLA_PROJECT_STATUS-7.md']],
    [rules('status-prefix: ACME'), ['ACME_PROJECT_STATUS-7.md', 'ACME_PROJECT_STATUS-8.md']],
    [rules('status-prefix: acme'), ['ACME_PROJECT_STATUS-7.md', 'CHICLA_PROJECT_STATUS-7.md']],
    [rules('status-prefix: ACME', 'status-prefix: OTHER'), ['ACME_PROJECT_STATUS-7.md']],
  ]) {
    const d = project(claude, names), before = names.map((f) => readFileSync(join(d, f), 'utf8'));
    const r = run(d, '--status', '--keep-previous', '2');
    assert.equal(r.status, 1, JSON.stringify([claude, names]));
    assert.deepEqual(names.map((f) => readFileSync(join(d, f), 'utf8')), before);
    assert.equal(archives(d).length, 0);
  }
});
