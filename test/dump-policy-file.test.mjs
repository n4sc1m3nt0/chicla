// C6.1 slice d2b (round 98): emergency-dump and recovery-report apply the project's chicla.policy.json (D66, D67).
// The dump keeps its own rules (D7) but reads the policy through a GUARDED import: it never stops because of the policy; it records why it was not applied.
// What the policy lists must be absent from the dump in every path (stream, external zip, tar.gz); a name or path with glob characters must still be excluded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DUMP_COPY, PINNED } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const which = (n) => spawnSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
const PY = which('python3'), ZIP = which('zip'), TAR = which('tar'), GZIP = which('gzip');
const SECRET = 'SECRET-POLICY-LISTED-7f3a';
const POLICY = JSON.stringify({ version: 1, names: ['scratch-x'], paths: ['private-x/', 'docs/secret.txt', 'odd[1]*dir/'] });
const NEVER = ['private-x/a.txt', 'private-x/sub/b.txt', 'scratch-x/c.txt', 'deep/scratch-x/d.txt', 'docs/secret.txt', 'odd[1]*dir/x.txt', 'other/scratch-x']; // the last is a FILE with a listed name
const KEEP = ['sub/private-x/ok.txt', 'docs/other.txt', 'a.txt', 'chicla.policy.json', 'my-scratch-x/ok.txt', 'odd1dir/ok.txt'];
const COPY = DUMP_COPY;
const BROKEN = 'export const writeZipStream = async () => { throw new Error("broken on purpose"); };\n';

// mode: 'stream' | 'zip' (writer broken) | 'tar' (writer broken, no zip). opts: { policy, noPolicyModule }. Returns { names, marker, run }.
function dump(T, mode, { policy = POLICY, noPolicyModule = false, extra = [], keepExtra = [] } = {}) {
  const work = join(T, 'work'), proj = join(work, 'chicla'), outdir = join(T, 'out');
  const put = (rel, text = 'x\n') => { mkdirSync(dirname(join(proj, rel)), { recursive: true }); writeFileSync(join(proj, rel), text); };
  put('package.json', '{"version":"0.0.1"}\n'); put('FILES.manifest', 'a.txt\n');
  if (policy !== null) put('chicla.policy.json', policy);
  for (const p of NEVER) put(p, SECRET);
  for (const p of extra) put(p, SECRET); for (const p of keepExtra) put(p);
  for (const p of KEEP.filter((x) => x !== 'chicla.policy.json')) put(p);
  put('node_modules/m/i.js', SECRET); put('.env', SECRET);
  let node = process.execPath, script = join(ROOT, 'scripts/emergency-dump.mjs'), env = process.env;
  if (mode !== 'stream' || noPolicyModule) {
    const tool = join(T, 'tool'), bin = join(T, 'bin'); mkdirSync(bin);
    for (const f of COPY) { if (noPolicyModule && f === PINNED.policy) continue; mkdirSync(dirname(join(tool, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(tool, f)); }
    if (mode !== 'stream') writeFileSync(join(tool, 'packages/chicla-zip/src/zipkit.mjs'), BROKEN);
    symlinkSync(process.execPath, join(bin, 'node'));
    for (const t of mode === 'stream' ? [] : mode === 'zip' ? [ZIP] : [TAR, GZIP]) symlinkSync(t, join(bin, t.split('/').pop()));
    node = join(bin, 'node'); script = join(tool, 'scripts/emergency-dump.mjs'); env = { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
  }
  const r = spawnSync(node, [script, '--work', work, '--outdir', outdir, '--no-outputs', 'd2b'], { encoding: 'utf8', env, maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const f = readdirSync(outdir).find((n) => n.endsWith(mode === 'tar' ? '.tar.gz' : '.zip'));
  assert.ok(f, `a dump in ${readdirSync(outdir)}`);
  const path = join(outdir, f);
  const code = mode === 'tar'
    ? 'import tarfile,sys,json;t=tarfile.open(sys.argv[1]);m=[x for x in t.getmembers()];mk=[x for x in m if x.name.endswith("RECOVERY_MARKER.json")];print(json.dumps({"names":[x.name for x in m],"marker":json.loads(t.extractfile(mk[0]).read()) if mk else None,"secret":any(x.isfile() and sys.argv[2].encode() in t.extractfile(x).read() and not x.name.endswith(("RECOVERY_REPORT.md","RECOVERY_MARKER.json")) and "node_modules" not in x.name and not x.name.endswith(".env") for x in m)}))'
    : 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);n=z.namelist();print(json.dumps({"names":n,"marker":json.loads(z.read("RECOVERY_MARKER.json")),"secret":any(sys.argv[2].encode() in z.read(i) for i in n if not i.endswith(("RECOVERY_REPORT.md","RECOVERY_MARKER.json")))}))';
  const o = JSON.parse(spawnSync(PY, ['-c', code, path, SECRET], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout);
  return { names: new Set(o.names.map((n) => n.replace(/^\.\//, ''))), marker: o.marker, secret: o.secret, run: r, path };
}

for (const [mode, ok] of [['stream', true], ['zip', !!ZIP], ['tar', !!TAR && !!GZIP]]) {
  test(`emergency-dump (${mode} path): what chicla.policy.json lists is not in the dump; the controls are`, { skip: !PY || !ok }, () => {
    const T = mkdtempSync(join(tmpdir(), 'chicla-d2b-'));
    try {
      const d = dump(T, mode);
      const inDump = (rel) => d.names.has(`work/chicla/${rel}`);
      assert.deepEqual(NEVER.filter(inDump), [], 'listed by the policy, must not be in the dump');
      assert.deepEqual(KEEP.filter((p) => !inDump(p)), [], 'controls (a path is anchored, a name is a whole segment), must be in the dump');
      assert.equal(inDump('node_modules/m/i.js') || inDump('.env'), false, 'the built-in rules still hold');
      assert.equal(d.secret, false, 'no listed content in any member');
    } finally { rmSync(T, { recursive: true, force: true }); }
  });
}

test('emergency-dump: the marker says the policy was applied and the dropped files are not hashed', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-d2b-'));
  try {
    const d = dump(T, 'stream');
    assert.equal(d.marker.policy.applied, true);
    assert.equal(d.marker.policy.error, null);
    assert.equal(d.marker.policy.dropped, NEVER.length);
    assert.deepEqual(Object.keys(d.marker.hashes).filter((k) => NEVER.includes(k)), [], 'no hash of a listed file');
    assert.ok('chicla.policy.json' in d.marker.hashes && 'a.txt' in d.marker.hashes);
    assert.equal(d.marker.projectFileCount, Object.keys(d.marker.hashes).length);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('emergency-dump: no policy file, nothing changes and the marker says so', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-d2b-'));
  try {
    const d = dump(T, 'stream', { policy: null });
    assert.deepEqual(d.marker.policy, { applied: false, dropped: 0, error: null });
    assert.ok(d.names.has('work/chicla/private-x/a.txt'), 'without a policy the folder is an ordinary one');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('emergency-dump: a policy file that cannot be used never stops the dump; the built-in rules hold and the marker names the code', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-d2b-'));
  try {
    const d = dump(T, 'stream', { policy: '{ not json' });
    assert.equal(d.marker.policy.applied, false);
    assert.equal(d.marker.policy.error, 'EPOLICY_PARSE');
    assert.equal(d.names.has('work/chicla/node_modules/m/i.js') || d.names.has('work/chicla/.env'), false, 'built-in rules hold');
    assert.match(d.run.stdout, /EPOLICY_PARSE/, 'the summary warns');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('emergency-dump: if policy.mjs cannot be imported the dump is still made and says so (D7)', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-d2b-'));
  try {
    const d = dump(T, 'stream', { noPolicyModule: true });
    assert.equal(d.marker.policy.applied, false);
    assert.equal(d.marker.policy.error, 'EPOLICY_IMPORT');
    assert.equal(d.names.has('work/chicla/.env'), false, 'built-in rules hold');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('emergency-dump (stream path): a preset in the policy file keeps its names out of the dump', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-d3-'));
  try {
    const d = dump(T, 'stream', { policy: JSON.stringify({ version: 1, presets: ['cargo'] }), extra: ['target/debug/x', 'crates/c/target/y'], keepExtra: ['src/lib.rs'] });
    assert.equal(d.names.has('work/chicla/target/debug/x') || d.names.has('work/chicla/crates/c/target/y'), false, 'cargo: target at any depth');
    assert.ok(d.names.has('work/chicla/src/lib.rs'));
    assert.deepEqual(d.marker.policy.error, null);
    assert.equal(d.marker.policy.applied, true);
  } finally { rmSync(T, { recursive: true, force: true }); }
});
