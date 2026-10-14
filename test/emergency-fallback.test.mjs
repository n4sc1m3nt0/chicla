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
const setup = (T, zipkit) => {
  const tool = join(T, 'tool');
  for (const f of COPY) { mkdirSync(dirname(join(tool, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(tool, f)); }
  writeFileSync(join(tool, 'packages/chicla-zip/src/zipkit.mjs'), zipkit);
  const work = join(T, 'work'), proj = join(work, 'chicla');
  const put = (rel, text) => { mkdirSync(dirname(join(proj, rel)), { recursive: true }); writeFileSync(join(proj, rel), text); };
  put('package.json', '{"version":"0.0.1"}\n'); put('CHANGELOG.md', '<!-- CHANGELOG_FINGERPRINT seq=1 -->\n## Round 1\n');
  put('a.txt', 'alpha\n'); put('dir/b.txt', 'bravo\n'); put('FILES.manifest', 'a.txt\n'); put('.env', `TOKEN=${SECRET}\n`);
  return { tool, work };
};
const run = (T, bin, zipkit) => {
  const { tool, work } = setup(T, zipkit), outdir = join(T, 'out');
  const r = spawnSync(join(bin, 'node'), [join(tool, 'scripts/emergency-dump.mjs'), '--work', work, '--outdir', outdir, '--no-outputs', 'c95'],
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
