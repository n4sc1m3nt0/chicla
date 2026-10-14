// C9.1 (round 79): emergency-dump writes the zip with chicla-zip's writeZipStream, not the external `zip`.
// Run with a PATH that has node only (no zip, no tar, no unzip). The finished zip is read by Python and `unzip`, found by absolute path,
// never by the code that wrote it. Tests assert exit codes and file facts, not wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const which = (n) => spawnSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
const UNZIP = which('unzip'), PY = which('python3');
const sha = (b) => createHash('sha256').update(b).digest('hex');

const SECRET = ['PRIVATE', 'MARKER', 'c91'].join('-');
const tree = (T) => {
  const work = join(T, 'work'), proj = join(work, 'chicla');
  const put = (rel, text) => { const p = join(proj, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };
  put('package.json', '{"version":"0.0.1"}\n');
  put('CHANGELOG.md', '<!-- CHANGELOG_FINGERPRINT seq=1 -->\n## Round 1\n');
  put('a.txt', 'alpha\n');
  put('dir/b.txt', 'b'.repeat(5000));
  put('dir/caf\u00e9.txt', 'unicode name\n');
  put('empty.txt', '');
  put('FILES.manifest', '# FILES.manifest v2\na.txt\t0\t0\n');
  put('.env', `TOKEN=${SECRET}\n`); put('.env.example', 'TOKEN=\n');
  put('node_modules/x/index.js', SECRET); put('corpus/real-world/p.pdf', 'an ordinary file (D64: no corpus rule)\n');
  put('old.zip', SECRET);
  writeFileSync(join(work, 'scratch.txt'), 'outside the project\n');
  return { work, proj };
};
const bareBin = (T) => { const b = join(T, 'bin'); mkdirSync(b); symlinkSync(process.execPath, join(b, 'node')); return b; };
const dump = (T, ...more) => {
  const bin = bareBin(T), outdir = join(T, 'out');
  const r = spawnSync(join(bin, 'node'), [join(ROOT, 'scripts/emergency-dump.mjs'), '--work', join(T, 'work'), '--outdir', outdir, '--no-outputs', ...more, 'c91'],
    { encoding: 'utf8', env: { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR }, maxBuffer: 1 << 28 });
  const files = existsSync(outdir) ? readdirSync(outdir) : [];
  return { r, files, zip: files.find((f) => f.endsWith('.zip')) && join(outdir, files.find((f) => f.endsWith('.zip'))) };
};
const pyread = (zip, code) => spawnSync(PY, ['-c', code, zip], { encoding: 'utf8', maxBuffer: 1 << 28 });
const names = (zip) => pyread(zip, 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("\\n".join(z.namelist()))').stdout.split('\n').filter(Boolean);
const member = (zip, n) => Buffer.from(pyread(zip, `import zipfile,sys,base64;print(base64.b64encode(zipfile.ZipFile(sys.argv[1]).read(${JSON.stringify(n)})).decode())`).stdout.trim(), 'base64');

test('C9.1: the dump is a .zip made with no zip, tar or unzip on the PATH, and independent readers accept it', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c91-'));
  try {
    tree(T);
    const d = dump(T);
    assert.equal(d.r.status, 0, d.r.stdout + d.r.stderr);
    assert.ok(d.zip, 'a .zip, not the tar.gz fallback: ' + d.files);
    if (UNZIP) assert.equal(spawnSync(UNZIP, ['-tq', d.zip]).status, 0, 'unzip -t');
    const n = names(d.zip);
    for (const p of ['RECOVERY_MARKER.json', 'RECOVERY_REPORT.md', 'work/scratch.txt', 'work/chicla/a.txt', 'work/chicla/dir/b.txt', 'work/chicla/dir/caf\u00e9.txt', 'work/chicla/empty.txt',
      'work/chicla/.env.example', 'work/chicla/corpus/real-world/p.pdf']) assert.ok(n.includes(p), p);
    assert.equal(n.filter((x) => /node_modules|\.env$|\.zip$/.test(x)).length, 0, 'excluded files stay out: ' + n.join(' '));
    assert.equal(pyread(d.zip, `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);sys.exit(1 if any(${JSON.stringify(SECRET)}.encode() in z.read(i) for i in z.namelist()) else 0)`).status, 0, 'no secret in any member');
    assert.equal(member(d.zip, 'work/chicla/dir/b.txt').toString(), 'b'.repeat(5000));
    assert.equal(spawnSync(PY, ['-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);i=z.getinfo("work/chicla/dir/caf\\u00e9.txt");sys.exit(0 if i.flag_bits&0x800 else 1)', d.zip]).status, 0, 'bit 11 on a non-ASCII name');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.1: marker hashes are the sha256 of the bytes in the zip, for every project file', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c91-'));
  try {
    tree(T);
    const d = dump(T);
    assert.equal(d.r.status, 0, d.r.stderr);
    const marker = JSON.parse(member(d.zip, 'RECOVERY_MARKER.json').toString());
    assert.equal(marker.format, 'chicla-recovery-v1');
    assert.equal(marker.projectRootRel, 'chicla');
    const keys = Object.keys(marker.hashes).sort();
    assert.deepEqual(keys, ['.env.example', 'CHANGELOG.md', 'FILES.manifest', 'a.txt', 'corpus/real-world/p.pdf', 'dir/b.txt', 'dir/caf\u00e9.txt', 'empty.txt', 'package.json']);
    for (const k of keys) assert.equal(marker.hashes[k], sha(member(d.zip, 'work/chicla/' + k)), k);
    assert.equal(marker.projectFileCount, keys.length);
    assert.deepEqual(marker.reportErrors, []);
    assert.equal(marker.hashLimitReached, false);
    assert.equal(marker.unhashed, 0);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.1: past the hash limit the files still go in, and the marker says what was not hashed', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c91-'));
  try {
    tree(T);
    const d = dump(T, '--hash-limit', '100');
    assert.equal(d.r.status, 0, d.r.stderr);
    const marker = JSON.parse(member(d.zip, 'RECOVERY_MARKER.json').toString());
    assert.equal(marker.hashLimitReached, true);
    assert.equal(marker.hashLimit, 100);
    assert.ok(marker.unhashed > 0);
    assert.equal(Object.keys(marker.hashes).length + marker.unhashed, marker.projectFileCount, 'hashed + unhashed = all project files');
    for (const [k, v] of Object.entries(marker.hashes)) assert.equal(v, sha(member(d.zip, 'work/chicla/' + k)), k); // what it did hash is right
    assert.equal(member(d.zip, 'work/chicla/dir/b.txt').length, 5000, 'a file past the limit is still in the zip, whole');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.1: a bad --hash-limit never stops the dump (it falls back to the default and says so)', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c91-'));
  try {
    tree(T);
    const d = dump(T, '--hash-limit', 'banana');
    assert.equal(d.r.status, 0, d.r.stderr);
    const marker = JSON.parse(member(d.zip, 'RECOVERY_MARKER.json').toString());
    assert.ok(marker.reportErrors.length > 0);
    assert.equal(marker.hashLimitReached, false);
    assert.equal(marker.unhashed, 0);
  } finally { rmSync(T, { recursive: true, force: true }); }
});
