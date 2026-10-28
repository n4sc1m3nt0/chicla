// C9.5 (round 84): D7, the dump never fails because of Chicla. The tests BREAK chicla-zip on purpose (in a copy of the tool tree) and
// check that the dump still comes out through the old external path: `zip`, then `tar` when there is no `zip`. The dump is read by Python
// (an independent reader), the secret never enters, the marker still has the hashes and the report says which path was used.
// Tests assert exit codes and file facts, not wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DUMP_COPY } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const which = (n) => spawnSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
const ZIP = which('zip'), TAR = which('tar'), GZIP = which('gzip'), PY = which('python3');
const SECRET = ['PRIVATE', 'MARKER', 'c95'].join('-');
const COPY = DUMP_COPY;
const BROKEN = {
  'the writer throws': 'export const writeZipStream = async () => { throw new Error("broken on purpose"); };\n',
  'the module does not parse': 'export const writeZipStream = ;;; (\n',
};

// a copy of the tool tree whose zipkit.mjs is replaced; the project to dump sits beside it
const setup = (T, zipkit, extra = {}, beside = {}) => {
  const tool = join(T, 'tool');
  for (const f of COPY) { mkdirSync(dirname(join(tool, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(tool, f)); }
  writeFileSync(join(tool, 'packages/chicla-zip/src/zipkit.mjs'), zipkit);
  const work = join(T, 'work'), proj = join(work, 'chicla');
  const put = (rel, text) => { mkdirSync(dirname(join(proj, rel)), { recursive: true }); writeFileSync(join(proj, rel), text); };
  put('package.json', '{"version":"0.0.1"}\n'); put('CHANGELOG.md', '<!-- CHANGELOG_FINGERPRINT seq=1 -->\n## Round 1\n');
  put('a.txt', 'alpha\n'); put('dir/b.txt', 'bravo\n'); put('FILES.manifest', 'a.txt\n'); put('.env', `TOKEN=${SECRET}\n`);
  for (const [rel, text] of Object.entries(extra)) put(rel, text);
  for (const [rel, text] of Object.entries(beside)) { mkdirSync(dirname(join(work, rel)), { recursive: true }); writeFileSync(join(work, rel), text); } // next to the project, inside the work folder
  return { tool, work };
};
const run = (T, bin, zipkit, o = {}) => {
  const { tool, work } = setup(T, zipkit, o.extra, o.beside), outdir = join(T, 'out');
  const r = spawnSync(join(bin, 'node'), [join(tool, 'scripts/emergency-dump.mjs'), '--work', work, '--outdir', outdir, '--no-outputs', ...(o.args ?? []), 'c95'],
    { encoding: 'utf8', env: { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR }, maxBuffer: 1 << 28 });
  return { r, files: existsSync(outdir) ? readdirSync(outdir) : [], outdir };
};
const binWith = (T, ...tools) => { const b = join(T, 'bin'); mkdirSync(b); symlinkSync(process.execPath, join(b, 'node')); for (const t of tools) symlinkSync(t, join(b, t.split('/').pop())); return b; };
const py = (code, ...a) => spawnSync(PY, ['-c', code, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });

for (const [why, zipkit] of Object.entries(BROKEN)) {
  test(`C9.5: ${why}: the dump still comes out through the external zip, intact and without secrets`, { skip: !ZIP || !PY }, () => {
    const T = mkdtempSync(join(tmpdir(), 'chicla-c95-'));
    try {
      const d = run(T, binWith(T, ZIP), zipkit);
      assert.equal(d.r.status, 0, d.r.stdout + d.r.stderr);
      const z = d.files.filter((f) => f.endsWith('.zip'));
      assert.equal(z.length, 1, `one .zip: ${d.files}`);
      const zp = join(d.outdir, z[0]);
      const names = py('import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("\\n".join(z.namelist()))', zp).stdout.split('\n').filter(Boolean);
      for (const n of ['RECOVERY_MARKER.json', 'RECOVERY_REPORT.md', 'work/chicla/a.txt', 'work/chicla/dir/b.txt']) assert.ok(names.includes(n), `${n} in the dump`);
      assert.ok(names.some((n) => n.startsWith('RECOVER/')), 'the toolchain folder is there');
      assert.ok(!names.some((n) => n.endsWith('.env')), 'the secret file stays out');
      const read = (n) => py('import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode("utf8","replace"))', zp, n).stdout;
      const marker = JSON.parse(read('RECOVERY_MARKER.json'));
      assert.ok(Object.keys(marker.hashes).some((k) => k.endsWith('a.txt')), 'the marker still hashes the project files');
      assert.ok(!read('RECOVERY_MARKER.json').includes(SECRET) && !read('RECOVERY_REPORT.md').includes(SECRET), 'no secret in marker or report');
      assert.match(read('RECOVERY_REPORT.md'), /used zip\/tar/, 'the report says the fallback ran');
    } finally { rmSync(T, { recursive: true, force: true }); }
  });
}

test('C9.5: the writer is broken AND there is no zip: the dump comes out as a .tar.gz', { skip: !TAR || !GZIP || !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c95-'));
  try {
    const d = run(T, binWith(T, TAR, GZIP), BROKEN['the writer throws']);
    assert.equal(d.r.status, 0, d.r.stdout + d.r.stderr);
    const t = d.files.filter((f) => f.endsWith('.tar.gz'));
    assert.equal(t.length, 1, `one .tar.gz: ${d.files}`);
    const names = py('import tarfile,sys;print("\\n".join(tarfile.open(sys.argv[1]).getnames()))', join(d.outdir, t[0])).stdout.split('\n').filter(Boolean);
    assert.ok(names.includes('work/chicla/a.txt') && names.includes('RECOVERY_MARKER.json'), 'files and marker in the tarball');
    assert.ok(!names.some((n) => n.endsWith('.env')), 'the secret file stays out');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.5: the writer is broken and neither zip nor tar exists: exit 1 and no dump (the only case where it fails)', () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c95-'));
  try {
    const d = run(T, binWith(T), BROKEN['the writer throws']);
    assert.equal(d.r.status, 1);
    assert.deepEqual(d.files.filter((f) => /\.(zip|tar\.gz)$/.test(f)), []);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

// C18.4 (round 253, AUDIT-5 F-4): the coverage report cannot see these lines (this file starts the dump with a clean `env`, which drops NODE_V8_COVERAGE), so the hand mutants K-DMP-04 to
// K-DMP-09 of packages/chicla-kit/mutants/list.mjs are the proof that they are reached. Three of them survived the tests above; these three kill them.
const zipNames = (d) => { const z = d.files.filter((f) => f.endsWith('.zip')); assert.equal(z.length, 1, `one .zip: ${d.files}`); return { zp: join(d.outdir, z[0]), names: py('import zipfile,sys;print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', join(d.outdir, z[0])).stdout.split('\n').filter(Boolean) }; };

test('C18.4 (K-DMP-07): through the external zip a .env.example is put back while .env stays out', { skip: !ZIP || !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c184-'));
  try {
    const d = run(T, binWith(T, ZIP), BROKEN['the writer throws'], { extra: { '.env.example': 'TOKEN=\n' } });
    assert.equal(d.r.status, 0, d.r.stdout + d.r.stderr);
    const { names } = zipNames(d);
    assert.ok(names.includes('work/chicla/.env.example'), 'the example file is in the dump');
    assert.ok(!names.includes('work/chicla/.env'), 'the secret file stays out');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C18.4 (K-DMP-08): through the external zip --project-only takes the project folder and nothing beside it', { skip: !ZIP || !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c184-'));
  try {
    const d = run(T, binWith(T, ZIP), BROKEN['the writer throws'], { args: ['--project-only'], beside: { 'scratch/other.txt': 'not the project\n' } });
    assert.equal(d.r.status, 0, d.r.stdout + d.r.stderr);
    const { names } = zipNames(d);
    assert.ok(names.includes('work/chicla/a.txt') && names.includes('RECOVERY_MARKER.json'), 'the project and the marker are in');
    assert.ok(!names.some((n) => n.includes('scratch')), `nothing beside the project: ${names.filter((n) => n.includes('scratch'))}`);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C18.4 (K-DMP-09): the fallback starts the hashes over: a file that the failed writer had hashed and that is gone by then is not in the marker', { skip: !ZIP || !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c184-'));
  try {
    const gone = join(T, 'work', 'chicla', 'a.txt');
    const zipkit = `import { rmSync } from "node:fs";
export const writeZipStream = async (out, sources) => { for (const s of sources) if (s.name === "work/chicla/a.txt") for await (const c of s.stream()) void c; rmSync(${JSON.stringify(gone)}); throw new Error("broken on purpose"); };\n`;
    const d = run(T, binWith(T, ZIP), zipkit);
    assert.equal(d.r.status, 0, d.r.stdout + d.r.stderr);
    const { zp } = zipNames(d);
    const marker = JSON.parse(py('import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("RECOVERY_MARKER.json").decode("utf8"))', zp).stdout);
    assert.ok(Object.keys(marker.hashes).some((k) => k.endsWith('b.txt')), 'a file that is still there is hashed');
    assert.ok(!Object.keys(marker.hashes).some((k) => k.endsWith('a.txt')), 'the vanished file has no stale hash');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

// C18.7 (round 255, AUDIT-5 F-4, K-DMP-06): the CODE of the one failing case lives in the object the core returns; the CLI prints text and exits 1, so the test calls the core in a child
// whose PATH has neither zip nor tar, with the writer broken, and reads the result as JSON.
test('C18.7 (K-DMP-06): the core returns { ok: false, code: "EDUMP_FAILED", path: null } when the writer is broken and neither zip nor tar exists, and it does not throw', () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c187-'));
  try {
    const bin = binWith(T), { tool, work } = setup(T, BROKEN['the writer throws']), outdir = join(T, 'out');
    const core = join(tool, 'packages/chicla-kit/src/emergency-dump.mjs');
    const r = spawnSync(join(bin, 'node'), ['--input-type=module', '-e',
      `import { emergencyDump } from ${JSON.stringify('file://' + core)}; const r = await emergencyDump({ work: ${JSON.stringify(work)}, outdir: ${JSON.stringify(outdir)}, noOutputs: true, note: 'c187' }); console.log(JSON.stringify({ ok: r.ok, code: r.code, path: r.path }));`],
      { encoding: 'utf8', env: { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR }, maxBuffer: 1 << 28 });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), { ok: false, code: 'EDUMP_FAILED', path: null });
    assert.deepEqual(readdirSync(outdir).filter((f) => /\.(zip|tar\.gz)$/.test(f)), []);
  } finally { rmSync(T, { recursive: true, force: true }); }
});
