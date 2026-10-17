// C6.1 slice b (round 94): recovery-report compares a recovered tree with the baseline using the shared policy (src/pinned/policy.mjs):
// junk and secrets are never listed as «New»; a corpus/ folder is a normal folder (D64).
// The dump is written by Python (an independent writer). Tests assert the file lists, not wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinnedFile } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PY = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();
const pyzip = (path, entries) => assert.equal(spawnSync(PY, ['-c', 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1],"w");[z.writestr(n,t) for n,t in json.loads(sys.argv[2])];z.close()', path, JSON.stringify(entries)], { encoding: 'utf8' }).status, 0);

test('recovery-report: junk and secrets are not «New»; a corpus folder is a normal folder', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c61b-'));
  try {
    const marker = JSON.stringify({ format: 'chicla-recovery-v1', projectRootRel: 'chicla', hashes: {}, created: 'x', note: 't' });
    const P = 'work/chicla/';
    const dump = join(T, 'd.zip'), base = join(T, 'b.zip');
    pyzip(dump, [['RECOVERY_MARKER.json', marker], [P + 'FILES.manifest', 'a.txt\n'], [P + 'package.json', '{}'], [P + 'a.txt', 'a'],
      [P + '.env', 'S=1'], [P + '.env.local', 'S=2'], [P + '.env.example', 'S='], [P + '.DS_Store', 'x'], [P + 'n.tsbuildinfo', 't'], [P + 't.pyc', 'p'],
      [P + 'x/__pycache__/m.txt', 'p'], [P + '.venv/v.txt', 'p'], [P + 'node_modules/m.js', 'm'], [P + '.next/c.txt', 'c'],
      [P + 'corpus/real-world/p.pdf', 'p'], [P + 'corpus/huge/h.bin', 'h'], [P + 'corpus/huge/.gitkeep', ''], [P + 'docs/corpus/real-world/ok.txt', 'k']]);
    pyzip(base, [['chicla/package.json', '{}'], ['chicla/a.txt', 'a']]);
    const out = join(T, 'rec');
    const r = spawnSync(process.execPath, [pinnedFile(ROOT, 'recovery-report'), dump, '--baseline', base, '--out', out], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const diff = readFileSync(join(out, 'RECOVERY_DIFF.md'), 'utf8');
    const news = diff.split('### New')[1].split('###')[0].split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2)).filter((l) => !l.startsWith('('));
    assert.deepEqual(news.sort(), ['.env.example', 'FILES.manifest', 'corpus/huge/.gitkeep', 'corpus/huge/h.bin', 'corpus/real-world/p.pdf', 'docs/corpus/real-world/ok.txt']);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

// C6.1 slice d2b: recovery-report applies the project's chicla.policy.json to the recovered tree (D67).
const recover = (T, entries, hashes = {}, baseEntries = []) => {
  const marker = JSON.stringify({ format: 'chicla-recovery-v1', projectRootRel: 'chicla', hashes, created: 'x', note: 't' });
  const P = 'work/chicla/';
  const dump = join(T, 'd.zip'), base = join(T, 'b.zip'), out = join(T, 'rec');
  pyzip(dump, [['RECOVERY_MARKER.json', marker], [P + 'FILES.manifest', 'a.txt\n'], [P + 'package.json', '{}'], [P + 'a.txt', 'a'], ...entries.map(([n, t]) => [P + n, t])]);
  pyzip(base, [['chicla/package.json', '{}'], ['chicla/a.txt', 'a'], ...baseEntries.map(([n, t]) => ['chicla/' + n, t])]);
  const r = spawnSync(process.execPath, [pinnedFile(ROOT, 'recovery-report'), dump, '--baseline', base, '--out', out], { encoding: 'utf8' });
  const diff = readFileSync(join(out, 'RECOVERY_DIFF.md'), 'utf8');
  const news = diff.split('### New')[1].split('###')[0].split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2)).filter((l) => !l.startsWith('(')).sort();
  return { r, diff, news };
};
const POL = JSON.stringify({ version: 1, names: ['scratch-x'], paths: ['private-x/'] });
const sha = (t) => createHash('sha256').update(t).digest('hex');

test('recovery-report: files the project policy lists are not «New», not hashed, and not a false «corrupted zip»', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-d2b-r-'));
  try {
    const { r, diff, news } = recover(T, [['chicla.policy.json', POL], ['private-x/a.txt', 'p'], ['deep/scratch-x/b.txt', 'p'], ['sub/private-x/ok.txt', 'k']], { 'private-x/a.txt': sha('p'), 'a.txt': sha('a') }, [['private-x/old.txt', 'o']]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(!diff.includes('private-x/old.txt'), 'a listed file of the BASELINE is not «removed» either');
    assert.deepEqual(news, ['FILES.manifest', 'chicla.policy.json', 'sub/private-x/ok.txt'], 'a path is anchored at the root');
    assert.ok(!diff.split('## Zip integrity')[1].split('\n##')[0].includes('✗'), 'a marker hash of a listed file is not an integrity failure');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('recovery-report: a policy file that cannot be used does not stop the recovery; it is reported by code', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-d2b-r-'));
  try {
    const { r, diff, news } = recover(T, [['chicla.policy.json', '{ nope'], ['private-x/a.txt', 'p']]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(diff, /EPOLICY_PARSE/);
    assert.ok(news.includes('private-x/a.txt'), 'without a usable policy the folder is ordinary, so the diff shows it');
  } finally { rmSync(T, { recursive: true, force: true }); }
});
