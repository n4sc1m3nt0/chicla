// C9.2 (round 80): the dump carries a RECOVER/ folder with ASCII names (the recovery toolchain: recovery-report and what it imports, plus chicla-zip)
// and the marker holds the sha256 of each. Recovery starts from that folder: extract RECOVER/ and run it. (The old start line copied ONE file to /tmp
// and could not find its imports.) Python reads the zip; the recovered script runs on a real dump. Tests assert exit codes and file facts, not wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLCHAIN_SOURCES } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const which = (n) => spawnSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
const PY = which('python3');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const TOOLS = Object.fromEntries(Object.entries(TOOLCHAIN_SOURCES).map(([n, src]) => ['RECOVER/' + n, src]));

const mini = (T) => {
  const work = join(T, 'work'), proj = join(work, 'chicla');
  const put = (rel, text) => { mkdirSync(dirname(join(proj, rel)), { recursive: true }); writeFileSync(join(proj, rel), text); };
  put('package.json', '{"version":"0.0.1"}\n'); put('CHANGELOG.md', '<!-- CHANGELOG_FINGERPRINT seq=1 -->\n## Round 1\n'); put('a.txt', 'alpha\n');
  put('FILES.manifest', 'a.txt\n');
  return work;
};
const dump = (T) => {
  const outdir = join(T, 'out');
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/emergency-dump.mjs'), '--work', mini(T), '--outdir', outdir, '--no-outputs', 'c92'], { encoding: 'utf8' });
  const z = existsSync(outdir) ? readdirSync(outdir).find((f) => f.endsWith('.zip')) : undefined;
  return { r, zip: z && join(outdir, z) };
};
const py = (code, ...a) => spawnSync(PY, ['-c', code, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });

test('C9.2: the dump holds RECOVER/ with ASCII names and the marker has the sha256 of each file', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c92-'));
  try {
    const d = dump(T);
    assert.equal(d.r.status, 0, d.r.stderr);
    const names = py('import zipfile,sys;print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', d.zip).stdout.split('\n').filter(Boolean);
    const recover = names.filter((n) => n.startsWith('RECOVER/')).sort();
    assert.deepEqual(recover, Object.keys(TOOLS).sort());
    for (const n of recover) assert.match(n, /^[\x20-\x7e]+$/, 'ASCII name');
    const marker = JSON.parse(py('import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("RECOVERY_MARKER.json").decode())', d.zip).stdout);
    assert.deepEqual(Object.keys(marker.toolchain).sort(), Object.keys(TOOLS).sort());
    for (const [n, src] of Object.entries(TOOLS)) {
      assert.equal(marker.toolchain[n], sha(readFileSync(join(ROOT, src))), `${n}: marker = the repo file`);
      const inZip = Buffer.from(py('import zipfile,sys,base64;print(base64.b64encode(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2])).decode())', d.zip, n).stdout.trim(), 'base64');
      assert.equal(sha(inZip), marker.toolchain[n], `${n}: marker = the bytes in the zip`);
    }
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.2: the recovery script extracted from RECOVER/ runs on its own (its imports sit beside it)', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c92-'));
  try {
    const d = dump(T);
    assert.ok(d.zip);
    const R = join(T, 'rec');
    assert.equal(py('import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);[z.extract(n,sys.argv[2]) for n in z.namelist() if n.startswith("RECOVER/")]', d.zip, R).status, 0);
    const r = spawnSync(process.execPath, [join(R, 'RECOVER/recovery-report.mjs'), d.zip, '--out', join(T, 'rec-out'), '--trust-toolchain'], { encoding: 'utf8', cwd: R }); // C9.4a: a RECOVER/ run needs the pinned digest or --trust-toolchain; this test is about the imports
    assert.ok(!/ERR_MODULE_NOT_FOUND/.test(r.stderr), r.stderr);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally { rmSync(T, { recursive: true, force: true }); }
});
