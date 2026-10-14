// C6.3 slice a (round 102, D73): the wider list of NAMES that hold credentials is a built-in, never-removable rule of src/pinned/policy.mjs:
// the folders `.ssh` and `.aws` (skipped at any depth) and the file names `.npmrc`, `.netrc`, `.git-credentials`, `*.pem`, `id_rsa*`
// (file names compared in lower case: macOS keeps the case you typed but finds the file whatever the case).
// Read by the manifest (check-manifest), the verifier (neverShipReason) and the recovery (isJunkName, SKIP_NAMES); the dump keeps its OWN copy (D7)
// and test/dump-policy.test.mjs ties it to this list for the folders; here the file names are tied in the three write paths.
// A chicla.policy.json can only ADD rules, so nothing here can be switched off by it (the `allow` key of slice c never reaches the name rules).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_MANIFEST_COPY, DUMP_COPY, copyFiles } from './toolchain-files.mjs';
import { importPinned } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = await importPinned('policy');
const PY = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();
const which = (n) => spawnSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
const ZIP = which('zip'), TAR = which('tar'), GZIP = which('gzip');

const SECRET_FILES = ['.npmrc', '.netrc', '.git-credentials', 'server.pem', 'KEY.PEM', 'id_rsa', 'id_rsa.pub', 'id_rsa_work', 'ID_RSA'];
const SECRET_DIR_FILES = ['.ssh/config', '.ssh/known_hosts', '.aws/credentials', '.aws/config'];
// names that LOOK like the rules and are not (whole-name and suffix controls)
const CONTROLS = ['a.txt', 'docs/pem.md', 'docs/npmrc.txt', 'netrc.md', 'my_id_rsa', 'rsa.md', 'cert.pem.md', 'ssh/config', 'aws/config', 'x.ssh/y', 'git-credentials.md', '.envrc'];

test('the predicate: isSecretFileName names exactly the file rules (any case, any folder is up to the caller)', () => {
  assert.equal(typeof policy.isSecretFileName, 'function');
  for (const n of SECRET_FILES) assert.equal(policy.isSecretFileName(n), true, n);
  for (const n of ['a.txt', 'pem.md', 'npmrc.txt', 'netrc.md', 'my_id_rsa', 'rsa.md', 'cert.pem.md', 'git-credentials.md', '.envrc', 'npmrc', '.npmrc.example', 'identity']) assert.equal(policy.isSecretFileName(n), false, n);
});

test('the walk rules: .ssh and .aws are skipped everywhere, with the older names', () => {
  assert.deepEqual([...policy.SKIP_NAMES].sort(), ['.aws', '.git', '.next', '.ssh', '__MACOSX', 'node_modules']);
  assert.deepEqual([...policy.SECRET_DIRS].sort(), ['.aws', '.ssh']);
});

test('neverShipReason: secret file names and credential folders, at any depth, with a reason', () => {
  const r = policy.neverShipReason;
  for (const n of SECRET_FILES) for (const p of [n, `sub/${n}`, `a/b/c/${n}`]) assert.ok(r(p), `${p} must never ship`);
  for (const p of SECRET_DIR_FILES) for (const q of [p, `sub/${p}`]) assert.ok(r(q), `${q} must never ship`);
  assert.ok(r('.ssh'), 'a path that IS the folder name');
  for (const p of CONTROLS) assert.equal(r(p), null, `${p} is an ordinary path`);
  assert.equal(r('.env'), '.env file (secrets)', 'the older rules keep their reason');
  assert.equal(r('x/__pycache__/m.pyc'), 'Python artefact');
  assert.notEqual(r('.npmrc'), r('.ssh/config'), 'a file name and a folder give different reasons');
});

test('isJunkName (the recovery) takes the file rules; the older junk is unchanged', () => {
  for (const n of SECRET_FILES) assert.equal(policy.isJunkName(n), true, n);
  for (const n of ['.DS_Store', 'x.tsbuildinfo', 'a.pyc', '.env', '.env.local']) assert.equal(policy.isJunkName(n), true, n);
  for (const n of ['a.txt', '.env.example', 'cert.pem.md', 'my_id_rsa']) assert.equal(policy.isJunkName(n), false, n);
});

test('a policy file cannot remove a name rule: the keys only add (and there is no key to release)', () => {
  for (const [o, want] of [[{ allow: ['.npmrc'] }, 'EPOLICY_PATH'], [{ allow: ['.ssh/config'] }, 'EPOLICY_PATH'], [{ remove: ['.npmrc'] }, 'EPOLICY_FORMAT'], [{ names: ['x'], allow: ['id_rsa'] }, 'EPOLICY_PATH']]) {
    let code = null; try { policy.parsePolicy(JSON.stringify({ version: 1, ...o })); } catch (e) { code = e.code; }
    assert.equal(code, want, JSON.stringify(o)); // `allow` exists (C6.3 c) but never for a name rule: it is refused, not ignored
  }
  const p = policy.parsePolicy(JSON.stringify({ version: 1, names: ['dist'] }));
  assert.ok(policy.neverShipReason('.npmrc', p) && policy.neverShipReason('.aws/credentials', p));
});

// ---- check-manifest, in a copy of the scripts ----
const project = (files) => {
  const d = mkdtempSync(join(tmpdir(), 'chicla-c63a-'));
  mkdirSync(join(d, 'scripts'));
  copyFiles(ROOT, d, CHECK_MANIFEST_COPY); // the wrapper, its core in the kit and the pinned files it reads
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), text); }
  return d;
};
const manifestOf = (d) => readFileSync(join(d, 'FILES.manifest'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[0]).filter((x) => !x.startsWith('scripts/') && !x.startsWith('packages/chicla-kit/src/pinned/') && x !== 'packages/chicla-kit/src/check-manifest.mjs').sort();

test('check-manifest --write keeps every secret name out, at the root and in sub-folders, and keeps the controls', () => {
  const files = { 'package.json': '{}' };
  for (const p of [...SECRET_FILES, ...SECRET_DIR_FILES]) { files[p] = 'S'; files[`sub/${p}`] = 'S'; }
  const keep = CONTROLS.filter((p) => p !== '.envrc').concat(['.envrc']);
  for (const p of keep) files[p] = 'k';
  const d = project(files);
  try {
    const r = spawnSync(process.execPath, [join(d, 'scripts/check-manifest.mjs'), '--write'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const m = manifestOf(d);
    for (const p of [...SECRET_FILES, ...SECRET_DIR_FILES]) { assert.ok(!m.includes(p), `${p} out`); assert.ok(!m.includes(`sub/${p}`), `sub/${p} out`); }
    assert.deepEqual(m, ['package.json', ...keep].sort(), 'the controls and package.json stay in');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// ---- the dump: its own copy, three write paths ----
const COPY = DUMP_COPY;
const BROKEN = 'export const writeZipStream = async () => { throw new Error("broken on purpose"); };\n';
function dumpNames(T, mode, where) {
  const work = join(T, 'work'), proj = where === 'root' ? work : join(work, 'chicla'), outdir = join(T, 'out');
  const put = (rel, text = 'x\n') => { mkdirSync(dirname(join(proj, rel)), { recursive: true }); writeFileSync(join(proj, rel), text); };
  put('package.json', '{"version":"0.0.1"}\n'); put('FILES.manifest', 'a.txt\n');
  for (const p of [...SECRET_FILES, ...SECRET_DIR_FILES, ...CONTROLS]) { put(p, 'TOKEN-c63a\n'); put(`sub/${p}`, 'TOKEN-c63a\n'); }
  let node = process.execPath, script = join(ROOT, 'scripts/emergency-dump.mjs'), env = process.env;
  if (mode !== 'stream') {
    const tool = join(T, 'tool'), bin = join(T, 'bin'); mkdirSync(bin);
    for (const f of COPY) { mkdirSync(dirname(join(tool, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(tool, f)); }
    writeFileSync(join(tool, 'packages/chicla-zip/src/zipkit.mjs'), BROKEN);
    symlinkSync(process.execPath, join(bin, 'node'));
    for (const t of mode === 'zip' ? [ZIP] : [TAR, GZIP]) symlinkSync(t, join(bin, t.split('/').pop()));
    node = join(bin, 'node'); script = join(tool, 'scripts/emergency-dump.mjs'); env = { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
  }
  const r = spawnSync(node, [script, '--work', work, '--outdir', outdir, '--no-outputs', 'c63a'], { encoding: 'utf8', env, maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const f = readdirSync(outdir).find((n) => n.endsWith(mode === 'tar' ? '.tar.gz' : '.zip'));
  assert.ok(f, `a ${mode === 'tar' ? '.tar.gz' : '.zip'} in ${readdirSync(outdir)}`);
  const code = mode === 'tar' ? 'import tarfile,sys;print("\\n".join(m.name for m in tarfile.open(sys.argv[1])))' : 'import zipfile,sys;print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))';
  const names = spawnSync(PY, ['-c', code, join(outdir, f)], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout.split('\n').filter(Boolean).map((n) => n.replace(/^\.\//, ''));
  return { names, prefix: where === 'root' ? 'work/' : 'work/chicla/' };
}
const checkDump = ({ names, prefix }, tag) => { // (a member is listed by its name, so a name that is out is its content out too)

  const set = new Set(names);
  for (const p of [...SECRET_FILES, ...SECRET_DIR_FILES]) for (const q of [p, `sub/${p}`]) assert.ok(!set.has(prefix + q), `${tag}: ${q} must be out of the dump`);
  for (const p of CONTROLS) for (const q of [p, `sub/${p}`]) assert.ok(set.has(prefix + q), `${tag}: ${q} must stay in the dump`);
};

for (const where of ['nested', 'root']) {
  test(`the dump (stream path, project ${where}): secret names out, controls in`, { skip: !PY && 'no python3' }, () => {
    const T = mkdtempSync(join(tmpdir(), 'chicla-c63a-d-'));
    try { checkDump(dumpNames(T, 'stream', where), `stream/${where}`); } finally { rmSync(T, { recursive: true, force: true }); }
  });
  test(`the dump (external zip path, writer broken, project ${where}): the same names out`, { skip: (!PY || !ZIP) && 'no python3 or zip' }, () => {
    const T = mkdtempSync(join(tmpdir(), 'chicla-c63a-d-'));
    try { checkDump(dumpNames(T, 'zip', where), `zip/${where}`); } finally { rmSync(T, { recursive: true, force: true }); }
  });
  test(`the dump (tar fallback, no zip, project ${where}): the same names out`, { skip: (!PY || !TAR || !GZIP) && 'no python3, tar or gzip' }, () => {
    const T = mkdtempSync(join(tmpdir(), 'chicla-c63a-d-'));
    try { checkDump(dumpNames(T, 'tar', where), `tar/${where}`); } finally { rmSync(T, { recursive: true, force: true }); }
  });
}
