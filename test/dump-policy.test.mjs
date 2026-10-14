// C6.1 slice c (round 95): emergency-dump keeps its OWN copy of the «never leaves» rules (it must not depend on an import that can break, D7).
// This test ties that copy to src/pinned/policy.mjs: whatever the policy says never leaves the project (built from the policy's own lists, so a new rule is
// covered at once) must be absent from a dump, at the project root and in a sub-folder; the controls must be present. The dump may exclude MORE than
// the policy (the .zip files, tool caches), never less. The dump is read by Python (an independent reader).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DUMP_COPY } from './toolchain-files.mjs';
import { importPinned } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = await importPinned('policy');
const PY = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();

// Candidates built from the policy itself.
const ENV_NAMES = ['.env', '.env.local', '.env.production', '.env.example', '.env.sample', '.envrc'];
const stems = [''];
const never = [], keep = [];
for (const base of stems) {
  for (const d of policy.SKIP_NAMES) never.push(`${base}${d}/x.txt`);
  for (const d of policy.PYTHON_DIRS) never.push(`${base}${d}/x.txt`);
  for (const n of ENV_NAMES) (policy.isSecretEnv(n) ? never : keep).push(`${base}${n}`);
  never.push(`${base}t.pyc`, `${base}.DS_Store`, `${base}tsconfig.tsbuildinfo`);
}
keep.push('a.txt', 'docs/note.md', 'corpus/real-world/x.pdf', 'corpus/huge/y.bin'); // D64: the Cedar folders are ordinary folders

test('the candidate lists agree with the policy (the control of this test)', () => {
  for (const p of never) assert.ok(policy.neverShipReason(p) || policy.SKIP_NAMES.has(p.split('/')[0]) || policy.isJunkName(p.split('/').pop()), `${p} must be refused by the policy`);
  for (const p of keep) assert.ok(!policy.neverShipReason(p) && !policy.isJunkName(p.split('/').pop()), `${p} must be allowed by the policy`);
});

const which = (n) => spawnSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
const ZIP = which('zip'), TAR = which('tar'), GZIP = which('gzip');
const COPY = DUMP_COPY;
const BROKEN = 'export const writeZipStream = async () => { throw new Error("broken on purpose"); };\n';

// mode: 'stream' (the normal path), 'zip' (writer broken: the external zip), 'tar' (writer broken, no zip: .tar.gz). Returns the names inside the dump.
function dumpNames(T, mode) {
  const work = join(T, 'work'), proj = join(work, 'chicla'), outdir = join(T, 'out');
  const put = (rel, text = 'x\n') => { mkdirSync(dirname(join(proj, rel)), { recursive: true }); writeFileSync(join(proj, rel), text); };
  put('package.json', '{"version":"0.0.1"}\n'); put('FILES.manifest', 'a.txt\n');
  for (const p of [...never, ...keep]) { put(p); put(`sub/${p}`); }
  let node = process.execPath, script = join(ROOT, 'scripts/emergency-dump.mjs'), env = process.env;
  if (mode !== 'stream') {
    const tool = join(T, 'tool'), bin = join(T, 'bin'); mkdirSync(bin);
    for (const f of COPY) { mkdirSync(dirname(join(tool, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(tool, f)); }
    writeFileSync(join(tool, 'packages/chicla-zip/src/zipkit.mjs'), BROKEN);
    symlinkSync(process.execPath, join(bin, 'node'));
    for (const t of mode === 'zip' ? [ZIP] : [TAR, GZIP]) symlinkSync(t, join(bin, t.split('/').pop()));
    node = join(bin, 'node'); script = join(tool, 'scripts/emergency-dump.mjs'); env = { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
  }
  const r = spawnSync(node, [script, '--work', work, '--outdir', outdir, '--no-outputs', 'c61c'], { encoding: 'utf8', env, maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const f = readdirSync(outdir).find((n) => n.endsWith(mode === 'tar' ? '.tar.gz' : '.zip'));
  assert.ok(f, `a ${mode === 'tar' ? '.tar.gz' : '.zip'} in ${readdirSync(outdir)}`);
  const code = mode === 'tar' ? 'import tarfile,sys;print("\\n".join(m.name for m in tarfile.open(sys.argv[1])))' : 'import zipfile,sys;print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))';
  return new Set(spawnSync(PY, ['-c', code, join(outdir, f)], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout.split('\n').filter(Boolean).map((n) => n.replace(/^\.\//, '')));
}

for (const [mode, ok] of [['stream', true], ['zip', !!ZIP], ['tar', !!TAR && !!GZIP]]) {
  test(`emergency-dump (${mode} path) leaves out everything the policy says never leaves, and keeps the controls`, { skip: !PY || !ok }, () => {
    const T = mkdtempSync(join(tmpdir(), 'chicla-c61c-'));
    try {
      const names = dumpNames(T, mode);
      const inZip = (rel) => names.has(`work/chicla/${rel}`);
      const leaked = never.flatMap((p) => [p, `sub/${p}`]).filter(inZip), lost = keep.flatMap((p) => [p, `sub/${p}`]).filter((p) => !inZip(p));
      assert.deepEqual(leaked, [], 'in the dump, must not be');
      // the tar.gz last resort over-excludes on purpose and documented (header of emergency-dump.mjs): it does not put back .env.example/.sample. Leaking is checked in every path; keeping the controls in the zip paths.
      if (mode !== 'tar') assert.deepEqual(lost, [], 'missing from the dump');
    } finally { rmSync(T, { recursive: true, force: true }); }
  });
}
