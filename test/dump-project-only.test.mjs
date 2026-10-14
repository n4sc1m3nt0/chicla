// C6.2 (round 100, D70 and D71): `emergency-dump --project-only` takes ONLY the project root, plus the marker, the report and RECOVER/.
// Without the option nothing changes: the whole working directory is dumped (recovery needs the notes and scratch files beside the project, D59).
// Checked in all three write paths (stream, external zip, tar.gz), with a project at the top of work/ and a nested one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DUMP_COPY } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const which = (n) => spawnSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
const PY = which('python3'), ZIP = which('zip'), TAR = which('tar'), GZIP = which('gzip');
const COPY = DUMP_COPY;
const BROKEN = 'export const writeZipStream = async () => { throw new Error("broken on purpose"); };\n';
const SECRET = 'SECRET-OUTSIDE-THE-PROJECT-91c2';

// opts: { dir: project folder under work/ ('' = work itself), projectOnly, project: false = no project root at all }
function dump(T, mode, { dir = 'chicla', projectOnly = true, project = true } = {}) {
  const work = join(T, 'work'), outdir = join(T, 'out');
  const put = (rel, text = 'x\n') => { mkdirSync(dirname(join(work, rel)), { recursive: true }); writeFileSync(join(work, rel), text); };
  const P = (rel) => (dir ? `${dir}/${rel}` : rel);
  if (project) { put(P('package.json'), '{"version":"0.0.1"}\n'); put(P('FILES.manifest'), 'a.txt\n'); put(P('a.txt')); put(P('sub/b.txt')); }
  else put('lonely.txt');
  if (dir) { put('scratch.txt', SECRET); put('other/notes.md', SECRET); }
  mkdirSync(outdir, { recursive: true }); writeFileSync(join(outdir, 'leftover.txt'), SECRET); // a file already in outputs/
  let node = process.execPath, script = join(ROOT, 'scripts/emergency-dump.mjs'), env = process.env;
  if (mode !== 'stream') {
    const tool = join(T, 'tool'), bin = join(T, 'bin'); mkdirSync(bin);
    for (const f of COPY) { mkdirSync(dirname(join(tool, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(tool, f)); }
    writeFileSync(join(tool, 'packages/chicla-zip/src/zipkit.mjs'), BROKEN);
    symlinkSync(process.execPath, join(bin, 'node'));
    for (const t of mode === 'zip' ? [ZIP] : [TAR, GZIP]) symlinkSync(t, join(bin, t.split('/').pop()));
    node = join(bin, 'node'); script = join(tool, 'scripts/emergency-dump.mjs'); env = { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
  }
  const r = spawnSync(node, [script, '--work', work, '--outdir', outdir, ...(projectOnly ? ['--project-only'] : []), 'c62'], { encoding: 'utf8', env, maxBuffer: 1 << 28 });
  const f = existsSync(outdir) ? readdirSync(outdir).find((n) => n.endsWith(mode === 'tar' ? '.tar.gz' : '.zip')) : undefined;
  if (!f) return { r, names: null };
  const code = mode === 'tar'
    ? 'import tarfile,sys,json;t=tarfile.open(sys.argv[1]);m=t.getmembers();mk=[x for x in m if x.name.endswith("RECOVERY_MARKER.json")];print(json.dumps({"names":[x.name for x in m],"marker":json.loads(t.extractfile(mk[0]).read()),"secret":any(x.isfile() and sys.argv[2].encode() in t.extractfile(x).read() for x in m if not x.name.endswith(("RECOVERY_REPORT.md","RECOVERY_MARKER.json")))}))'
    : 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);n=z.namelist();print(json.dumps({"names":n,"marker":json.loads(z.read("RECOVERY_MARKER.json")),"secret":any(sys.argv[2].encode() in z.read(i) for i in n if not i.endswith(("RECOVERY_REPORT.md","RECOVERY_MARKER.json")))}))';
  const o = JSON.parse(spawnSync(PY, ['-c', code, join(outdir, f), SECRET], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout);
  return { r, names: new Set(o.names.map((n) => n.replace(/^\.\//, ''))), marker: o.marker, secret: o.secret, path: join(outdir, f), work };
}

for (const [mode, ok] of [['stream', true], ['zip', !!ZIP], ['tar', !!TAR && !!GZIP]]) {
  for (const dir of ['chicla', 'deep/chicla']) {
    test(`--project-only (${mode} path, project in work/${dir}): only the project, the marker, the report and RECOVER/`, { skip: !PY || !ok }, () => {
      const T = mkdtempSync(join(tmpdir(), 'chicla-c62-'));
      try {
        const d = dump(T, mode, { dir });
        assert.equal(d.r.status, 0, d.r.stdout + d.r.stderr);
        for (const p of ['a.txt', 'sub/b.txt', 'package.json', 'FILES.manifest']) assert.ok(d.names.has(`work/${dir}/${p}`), p);
        assert.ok(d.names.has('RECOVERY_MARKER.json') && d.names.has('RECOVERY_REPORT.md'));
        assert.ok([...d.names].some((n) => n.startsWith('RECOVER/')), 'RECOVER/');
        const outside = [...d.names].filter((n) => (n.startsWith('work/') && !n.startsWith(`work/${dir}/`) && !`work/${dir}`.startsWith(n.replace(/\/$/, ''))) || n.startsWith('outputs/'));
        assert.deepEqual(outside, [], 'nothing of work/ outside the project, nothing of outputs/');
        assert.equal(d.secret, false, 'no content from outside the project');
        assert.equal(d.marker.projectOnly, true);
        assert.equal(d.marker.projectRootRel, dir);
      } finally { rmSync(T, { recursive: true, force: true }); }
    });
  }
}

test('without the option the whole working directory is dumped, as before', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c62-'));
  try {
    const d = dump(T, 'stream', { projectOnly: false });
    assert.equal(d.r.status, 0, d.r.stdout + d.r.stderr);
    for (const p of ['work/scratch.txt', 'work/other/notes.md', 'work/chicla/a.txt', 'outputs/leftover.txt']) assert.ok(d.names.has(p), p);
    assert.equal(d.marker.projectOnly, false);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('--project-only with the project at the root of work/ takes the same files as a plain dump', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c62-'));
  try {
    const d = dump(T, 'stream', { dir: '' });
    assert.equal(d.r.status, 0, d.r.stdout + d.r.stderr);
    for (const p of ['work/a.txt', 'work/sub/b.txt', 'work/package.json']) assert.ok(d.names.has(p), p);
    assert.equal(d.marker.projectRootRel, '');
    assert.ok(![...d.names].some((n) => n.startsWith('outputs/')), 'outputs/ is left out too');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('--project-only with no project root refuses and creates no dump (an explicit option is never silently widened)', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c62-'));
  try {
    const d = dump(T, 'stream', { project: false, dir: '' });
    assert.equal(d.names, null, 'no dump was written');
    assert.notEqual(d.r.status, 0);
    assert.match(d.r.stderr, /--project-only/);
    const plain = dump(mkdtempSync(join(tmpdir(), 'chicla-c62-')), 'stream', { project: false, dir: '', projectOnly: false });
    assert.equal(plain.r.status, 0, 'a plain dump with no project root still works (D7)');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('a project-only dump can be recovered: recovery-report reads it', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c62-'));
  try {
    const d = dump(T, 'stream');
    assert.equal(d.r.status, 0);
    const x = join(T, 'x'); mkdirSync(x);
    assert.equal(spawnSync(PY, ['-c', 'import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', d.path, x]).status, 0);
    const r = spawnSync(process.execPath, [join(x, 'RECOVER/recovery-report.mjs'), d.path, '--out', join(T, 'rec'), '--trust-toolchain'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(existsSync(join(T, 'rec', 'RECOVERY_DIFF.md')));
  } finally { rmSync(T, { recursive: true, force: true }); }
});
