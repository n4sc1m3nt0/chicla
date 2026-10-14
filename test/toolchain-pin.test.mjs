// C9.4 slice a (round 82): the recovery toolchain (RECOVER/) is pinned. `bump-round` writes its digest into CLAUDE.md (`toolchain-digest: <hex>`) and
// `--verify` checks it; `recovery-report` run from a RECOVER/ folder refuses (EHASH_TOOLCHAIN, exit 3) unless the digest it is given matches the files beside it
// or Rodrigo says --trust-toolchain; the start line in the status file (item 17) checks the digest in the shell BEFORE running anything from the zip.
// Digest = sha256 of the output of `sha256sum RECOVER/*.mjs` (so a shell can reproduce it). Tests assert exit codes and codes, not wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { parseManifest } = await importPinned('manifest');
import { TOOLCHAIN_SOURCES } from './toolchain-files.mjs';
import { importPinned, pinnedFile } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = TOOLCHAIN_SOURCES;
const sh = (script, cwd) => spawnSync('sh', ['-c', script], { cwd, encoding: 'utf8' });
const pinOf = (text) => (text.match(/toolchain-digest: ([0-9a-f]{64})/) ?? [])[1];

const recoverDir = (T) => { const d = join(T, 'RECOVER'); mkdirSync(d, { recursive: true }); for (const [n, src] of Object.entries(TOOLS)) copyFileSync(join(ROOT, src), join(d, n)); return d; };
const shellDigest = (T) => sh('LC_ALL=C; sha256sum RECOVER/*.mjs | sha256sum | cut -d" " -f1', T).stdout.trim();
const miniDump = (T) => { // a dump made by the real script, from a small tree
  const work = join(T, 'work', 'chicla'); mkdirSync(work, { recursive: true });
  for (const [n, t] of Object.entries({ 'package.json': '{"version":"0.0.1"}\n', 'CHANGELOG.md': '## Round 1\n', 'FILES.manifest': 'a.txt\n', 'a.txt': 'a\n' })) writeFileSync(join(work, n), t);
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/emergency-dump.mjs'), '--work', join(T, 'work'), '--outdir', join(T, 'out'), '--no-outputs', 'c94'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return join(T, 'out', readdirSync(join(T, 'out')).find((f) => f.endsWith('.zip')));
};
const recover = (T, dump, ...a) => spawnSync(process.execPath, [join(T, 'RECOVER/recovery-report.mjs'), dump, '--out', join(T, 'rec-out-' + Math.random().toString(36).slice(2)), ...a], { encoding: 'utf8' });

test('C9.4a: CLAUDE.md pins the digest of the toolchain, and it is the one a shell computes from RECOVER/', () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c94-'));
  try {
    recoverDir(T);
    const pin = pinOf(readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8'));
    assert.ok(pin, 'CLAUDE.md has a toolchain-digest line');
    assert.equal(pin, shellDigest(T), 'red between editing a toolchain script and running bump-round, by design');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.4a: bump-round --verify fails on a stale pin, and --refresh rewrites it', () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c94-'));
  try {
    const proj = join(T, 'proj');
    for (const { path: rel } of parseManifest(readFileSync(join(ROOT, 'FILES.manifest'), 'utf8'))) { mkdirSync(dirname(join(proj, rel)), { recursive: true }); try { copyFileSync(join(ROOT, rel), join(proj, rel)); } catch { /* not on disk */ } }
    copyFileSync(join(ROOT, 'FILES.manifest'), join(proj, 'FILES.manifest'));
    const run = (...a) => spawnSync(process.execPath, [join(proj, 'scripts/bump-round.mjs'), ...a], { cwd: proj, encoding: 'utf8' });
    assert.equal(run('--verify').status, 0);
    const cm = join(proj, 'CLAUDE.md'), good = pinOf(readFileSync(cm, 'utf8'));
    writeFileSync(cm, readFileSync(cm, 'utf8').replace(good, '0'.repeat(64)));
    assert.equal(run('--verify').status, 1, 'stale pin');
    assert.equal(run('--refresh').status, 0);
    assert.equal(pinOf(readFileSync(cm, 'utf8')), good, 'rewritten to the real digest');
    assert.equal(run('--verify').status, 0);
    appendFileSync(pinnedFile(proj, 'baseline'), '\n// edited\n');
    assert.equal(run('--verify').status, 1, 'a toolchain file changed: the pin is stale');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.4a: recovery-report from RECOVER/ refuses a wrong or missing digest (EHASH_TOOLCHAIN, exit 3) and runs with the right one or --trust-toolchain', () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c94-'));
  try {
    const d = miniDump(T); recoverDir(T);
    const good = shellDigest(T);
    const ok = recover(T, d, '--toolchain-digest', good);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    for (const args of [['--toolchain-digest', '0'.repeat(64)], []]) {
      const bad = recover(T, d, ...args);
      assert.equal(bad.status, 3, 'refused');
      assert.match(bad.stderr, /EHASH_TOOLCHAIN/);
      assert.equal(bad.stdout.includes('RECOVERY DIFF'), false, 'nothing ran past the check');
    }
    const trust = recover(T, d, '--toolchain-digest', '0'.repeat(64), '--trust-toolchain');
    assert.equal(trust.status, 0, trust.stderr);
    appendFileSync(join(T, 'RECOVER/manifest.mjs'), '\n// tampered\n');
    assert.equal(recover(T, d, '--toolchain-digest', good).status, 3, 'a changed file no longer matches the pinned digest');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.4a: from the normal tree (scripts/), recovery-report needs no digest', () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c94-'));
  try {
    const d = miniDump(T);
    const r = spawnSync(process.execPath, [pinnedFile(ROOT, 'recovery-report'), d, '--out', join(T, 'o')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.4a: the start line of item 17 checks the digest in the shell before running anything from the zip', () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c94-'));
  try {
    const status = readFileSync(join(ROOT, readdirSync(ROOT).find((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f))), 'utf8');
    const line = (status.match(/`(D=<dump\.zip>[^`]*)`/) ?? [])[1];
    assert.ok(line, 'item 17 has the start line');
    assert.match(line, /toolchain-digest/);
    const dump = miniDump(T);
    mkdirSync(join(T, 'new')); copyFileSync(join(ROOT, 'CLAUDE.md'), join(T, 'new/CLAUDE.md'));
    const go = (extra = '') => sh(`LC_ALL=C; ${line.replace('<dump.zip>', JSON.stringify(dump)).replace('<last delivery zip>', '')} ${extra}`.replace(/--baseline ""/, ''), join(T, 'new'));
    const r = go(`--out ${JSON.stringify(join(T, 'recovered'))}`); // the start line has no --out and the default is /home/claude/recovered: a CI runner cannot create it (round 143)
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /RECOVERY DIFF/);
    // a toolchain swapped inside the zip must stop in the shell, and nothing of it may run
    const bad = join(T, 'bad.zip');
    assert.equal(spawnSync('python3', ['-c', 'import zipfile,sys;a=zipfile.ZipFile(sys.argv[1]);b=zipfile.ZipFile(sys.argv[2],"w")\nfor i in a.infolist():\n  d=a.read(i.filename)\n  if i.filename=="RECOVER/manifest.mjs": d=b"console.log(\\"RAN-FROM-ZIP\\");"+d\n  b.writestr(i,d)\nb.close()', dump, bad]).status, 0);
    const r2 = sh(`LC_ALL=C; ${line.replace('<dump.zip>', JSON.stringify(bad)).replace('<last delivery zip>', '')}`.replace(/--baseline ""/, ''), join(T, 'new'));
    assert.notEqual(r2.status, 0);
    assert.equal((r2.stdout + r2.stderr).includes('RAN-FROM-ZIP'), false);
  } finally { rmSync(T, { recursive: true, force: true }); }
});
