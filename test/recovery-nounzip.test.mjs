// C9.4 slice b (round 83): recovery-report extracts the dump and the baseline zip with chicla-zip's extractZip, not the external `unzip`.
// Run with a PATH that has node only (no unzip, no tar, no zip, no python) and LC_ALL=C (Info-ZIP unzip needs a UTF-8 locale for bit-11 names; chicla-zip does not).
// Hostile zips are written by Python (an independent writer). Tests assert exit codes and file facts, not wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinnedFile } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const which = (n) => spawnSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
const PY = which('python3');
const CAFE = 'caf\u00e9.txt';

const mini = (T) => {
  const work = join(T, 'work'), proj = join(work, 'chicla');
  const put = (rel, text) => { mkdirSync(dirname(join(proj, rel)), { recursive: true }); writeFileSync(join(proj, rel), text); };
  put('package.json', '{"version":"0.0.1"}\n'); put('CHANGELOG.md', '<!-- CHANGELOG_FINGERPRINT seq=1 -->\n## Round 1\n');
  put('a.txt', 'alpha\n'); put(`dir/${CAFE}`, 'unicode name\n'); put('FILES.manifest', 'a.txt\n');
  return work;
};
const dump = (T) => {
  const outdir = join(T, 'out');
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/emergency-dump.mjs'), '--work', mini(T), '--outdir', outdir, '--no-outputs', 'c94b'], { encoding: 'utf8' });
  const z = existsSync(outdir) ? readdirSync(outdir).find((f) => f.endsWith('.zip')) : undefined;
  return { r, zip: z && join(outdir, z) };
};
const bareBin = (T) => { const b = join(T, 'bin'); mkdirSync(b); symlinkSync(process.execPath, join(b, 'node')); return b; };
const recover = (T, zip, ...more) => {
  const bin = bareBin(T), out = join(T, 'rec');
  const r = spawnSync(join(bin, 'node'), [pinnedFile(ROOT, 'recovery-report'), zip, '--out', out, ...more],
    { encoding: 'utf8', cwd: ROOT, env: { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LC_ALL: 'C' }, maxBuffer: 1 << 28 });
  return { r, out, diff: existsSync(join(out, 'RECOVERY_DIFF.md')) ? readFileSync(join(out, 'RECOVERY_DIFF.md'), 'utf8') : '' };
};
const py = (code, ...a) => spawnSync(PY, ['-c', code, ...a], { encoding: 'utf8' });
// writes a zip with Python: entries = [[name, text], …]
const pyzip = (path, entries) => assert.equal(py('import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1],"w");[z.writestr(n,t) for n,t in json.loads(sys.argv[2])];z.close()', path, JSON.stringify(entries)).status, 0);

test('C9.4b: a dump is extracted with no unzip on the PATH, and a non-ASCII name keeps its true name under LC_ALL=C', () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c94b-'));
  try {
    const d = dump(T);
    assert.equal(d.r.status, 0, d.r.stderr);
    const x = recover(T, d.zip);
    assert.equal(x.r.status, 0, x.r.stdout + x.r.stderr);
    assert.ok(existsSync(join(x.out, 'RECOVERY_MARKER.json')), 'the marker was extracted');
    assert.ok(existsSync(join(x.out, 'work/chicla/dir', CAFE)), 'the name is café, not caf#U00e9.txt');
    assert.ok(!/#U00/.test(x.diff), 'the diff carries no mangled name');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.4b: a wrapped baseline zip is extracted without unzip and the comparison still works', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c94b-'));
  try {
    const d = dump(T);
    assert.equal(d.r.status, 0, d.r.stderr);
    const base = join(T, 'base.zip');
    pyzip(base, [['chicla/package.json', '{"version":"0.0.1"}\n'], ['chicla/a.txt', 'OLD\n'], [`chicla/dir/${CAFE}`, 'unicode name\n'], ['chicla/gone.txt', 'x\n']]);
    const x = recover(T, d.zip, '--baseline', base);
    assert.equal(x.r.status, 0, x.r.stdout + x.r.stderr);
    assert.match(x.diff, /Modified \(\d+\)[^]*a\.txt/, 'a.txt differs from the baseline');
    assert.match(x.diff, /MISSING vs the base \(1\)[^]*gone\.txt/, 'gone.txt is only in the baseline');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.4b: a hostile dump (a name that climbs out of the destination) is refused and nothing is written outside', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c94b-'));
  try {
    const evil = join(T, 'evil-dump.zip');
    pyzip(evil, [['RECOVERY_MARKER.json', '{}'], ['../ESCAPED-dump.txt', 'x']]);
    const x = recover(T, evil);
    assert.notEqual(x.r.status, 0, 'refused');
    assert.match(x.r.stderr, /EUNSAFE/, 'refused by chicla-zip (the error code), not by a missing tool');
    assert.ok(!existsSync(join(T, 'ESCAPED-dump.txt')), 'nothing outside the destination');
    assert.ok(!existsSync(join(x.out, 'RECOVERY_DIFF.md')), 'no report on a refused dump');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.4b: a hostile baseline zip is refused and nothing is written outside', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c94b-'));
  try {
    const d = dump(T);
    assert.equal(d.r.status, 0, d.r.stderr);
    const evil = join(T, 'evil-base.zip');
    pyzip(evil, [['package.json', '{}'], ['../ESCAPED-base.txt', 'x']]);
    const x = recover(T, d.zip, '--baseline', evil);
    assert.notEqual(x.r.status, 0, 'refused');
    assert.match(x.r.stderr, /EUNSAFE/, 'refused by chicla-zip (the error code), not by a missing tool');
    assert.ok(!existsSync(join(T, 'ESCAPED-base.txt')) && !existsSync(join(tmpdir(), 'ESCAPED-base.txt')), 'nothing outside the temp folder');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.4b: recovery-report no longer calls unzip', () => {
  assert.ok(!/["'`]unzip["'`]/.test(readFileSync(pinnedFile(ROOT, 'recovery-report'), 'utf8')), 'no spawn of unzip');
});
