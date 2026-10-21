// Round 221: the dump leaked the session's own credentials. `HOME_NOISE` named four top-level names (`.local`, `.config`, `.npmrc`, `.wget-hsts`), so
// `work/.claude/remote/.oauth_token`, `.session_ingress_token`, `work/.pki/nssdb/*` and `work/.gitconfig` went into the zip, and the content detector
// (private key, AWS, GitHub, npm) does not know those token formats ("Held back: 0"). The rule is now: when work/ is NOT the project root, EVERY entry
// whose name starts with a dot at the TOP of work/ stays out (home-directory state is never project work), named in the report and in `marker.homeSkipped`.
// Unchanged: only the top level; never when work/ is itself the project root; nested dot folders inside the project stay in; `recovered*` stays in.
// Three write paths (chicla-zip writer, external `zip`, `tar`). Python reads the zip; tests assert names and bytes, never wording.
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
const ZIP = which('zip'), TAR = which('tar'), PY = which('python3');
const SECRET = ['SESSION', 'SECRET', 'c221'].join('-'); // not a format any content detector knows, on purpose

// What a Claude Code session leaves in the home directory, plus the usual suspects.
const HOME_DOT = {
  '.claude/remote/.oauth_token': SECRET + '-a\n', '.claude/remote/.session_ingress_token': SECRET + '-b\n', '.claude/skills/s/SKILL.md': SECRET + '-c\n',
  '.pki/nssdb/key4.db': SECRET + '-d\n', '.gitconfig': `[credential]\n\thelper = store ${SECRET}-e\n`, '.bash_history': SECRET + '-f\n',
  '.gnupg/private-keys-v1.d/k.key': SECRET + '-g\n', '.docker/config.json': `{"auth":"${SECRET}-h"}\n`, '.kube/config': SECRET + '-i\n',
  '.config/uv/uv-receipt.json': 'x\n', '.local/bin/uv': 'x\n', '.wget-hsts': 'x\n',
};
const TOP_DOT_NAMES = ['.bash_history', '.claude', '.config', '.docker', '.gitconfig', '.gnupg', '.kube', '.local', '.pki', '.wget-hsts'];
const PROJECT = { 'package.json': '{"version":"0.0.1"}\n', 'CHANGELOG.md': '## Round 1\n', 'FILES.manifest': 'a.txt\n', 'a.txt': 'a\n' };

const put = (base, files) => { for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(base, rel)), { recursive: true }); writeFileSync(join(base, rel), text); } };
const py = (code, ...a) => spawnSync(PY, ['-c', code, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const read = (zp, n) => py('import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode("utf8","replace"))', zp, n).stdout;
const dump = (script, work, outdir, env) => {
  const r = spawnSync(env ? env.node : process.execPath, [script, '--work', work, '--outdir', outdir, '--no-outputs', 'c221'], { encoding: 'utf8', env: env?.env, maxBuffer: 1 << 28 });
  const z = existsSync(outdir) ? readdirSync(outdir).find((f) => f.endsWith('.zip') || f.endsWith('.tar.gz')) : undefined;
  const zp = z && join(outdir, z);
  const names = !zp ? [] : zp.endsWith('.zip')
    ? py('import zipfile,sys;print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', zp).stdout.split('\n').filter(Boolean)
    : spawnSync(TAR, ['-tzf', zp], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout.split('\n').filter(Boolean).map((n) => n.replace(/^\.\//, ''));
  return { r, zp, names };
};
const inDump = (names, rel) => names.some((n) => n === `work/${rel}` || n === `work/${rel}/` || n.startsWith(`work/${rel}/`));
const leaked = (zp) => {
  // the secret must be in no member, whatever its name (zip: read by Python; tar: extracted to text through tar -xzOf)
  if (zp.endsWith('.zip')) return py('import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(any(sys.argv[2].encode() in z.read(n) for n in z.namelist() if not n.endswith("/")))', zp, SECRET).stdout.trim() === 'True';
  return spawnSync(TAR, ['-xzOf', zp], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout.includes(SECRET);
};
const fixture = (work) => put(work, { ...HOME_DOT, ...Object.fromEntries(Object.entries(PROJECT).map(([k, v]) => [`chicla/${k}`, v])),
  'chicla/.claude/skills/own/SKILL.md': 'the project\'s own skill\n', 'chicla/.github/ci.yml': 'ci\n', 'recovered/work/r1/a.txt': 'a recovery session works here\n', 'loose.txt': 'l\n' });
const assertSafe = (d, label) => {
  assert.ok(d.zp, `${label}: a dump was made (${d.r.stdout}${d.r.stderr})`);
  assert.equal(d.r.status, 0, d.r.stderr);
  for (const n of TOP_DOT_NAMES) assert.ok(!inDump(d.names, n), `${label}: top-level ${n} is left out`);
  assert.ok(!leaked(d.zp), `${label}: the secret is in no member of the dump`);
  for (const n of ['chicla/a.txt', 'chicla/.claude/skills/own/SKILL.md', 'chicla/.github/ci.yml', 'recovered/work/r1/a.txt', 'loose.txt']) assert.ok(inDump(d.names, n), `${label}: ${n} stays in`);
};

test('221: every top-level dot entry of work/ stays out (stream writer); the marker and the report name them; project dot folders, recovered/ and loose files stay in', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c221-'));
  try {
    const work = join(T, 'work'); fixture(work);
    const d = dump(join(ROOT, 'scripts/emergency-dump.mjs'), work, join(T, 'out'));
    assertSafe(d, 'writer');
    assert.deepEqual(JSON.parse(read(d.zp, 'RECOVERY_MARKER.json')).homeSkipped, TOP_DOT_NAMES, 'the marker names what was skipped');
    const report = read(d.zp, 'RECOVERY_REPORT.md');
    for (const n of TOP_DOT_NAMES) assert.ok(report.includes(n), `the report names ${n}`);
    assert.ok(!report.includes(SECRET) && !read(d.zp, 'RECOVERY_MARKER.json').includes(SECRET), 'names only, never contents');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('221: when work/ is itself the project root its own top-level dot folders are work and stay in (secret NAMES still go: D73)', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c221-'));
  try {
    const work = join(T, 'work');
    put(work, { ...PROJECT, '.github/ci.yml': 'ci\n', '.claude/skills/own/SKILL.md': 'own\n', '.eslintrc': 'e\n', '.npmrc': 'secret by name\n' });
    const d = dump(join(ROOT, 'scripts/emergency-dump.mjs'), work, join(T, 'out'));
    assert.equal(d.r.status, 0, d.r.stderr);
    for (const n of ['.github/ci.yml', '.claude/skills/own/SKILL.md', '.eslintrc']) assert.ok(inDump(d.names, n), `${n} stays in`);
    assert.ok(!inDump(d.names, '.npmrc'), '.npmrc is a credentials name, out whatever the folder');
    assert.deepEqual(JSON.parse(read(d.zp, 'RECOVERY_MARKER.json')).homeSkipped, []);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

const brokenTool = (T) => {
  const tool = join(T, 'tool');
  for (const f of DUMP_COPY) { mkdirSync(dirname(join(tool, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(tool, f)); }
  writeFileSync(join(tool, 'packages/chicla-zip/src/zipkit.mjs'), 'export const writeZipStream = async () => { throw new Error("broken on purpose"); };\n');
  return tool;
};

test('221: the external zip path (chicla-zip broken on purpose) leaves the same entries out', { skip: !ZIP || !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c221-'));
  try {
    const tool = brokenTool(T), work = join(T, 'work'); fixture(work);
    const bin = join(T, 'bin'); mkdirSync(bin); symlinkSync(process.execPath, join(bin, 'node')); symlinkSync(ZIP, join(bin, 'zip'));
    const d = dump(join(tool, 'scripts/emergency-dump.mjs'), work, join(T, 'out'), { node: join(bin, 'node'), env: { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR } });
    assert.ok(d.zp?.endsWith('.zip'), 'made by zip');
    assertSafe(d, 'zip');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('221: the tar.gz path (chicla-zip broken, no zip on PATH) leaves the same entries out', { skip: !TAR || !PY || !which('gzip') }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c221-'));
  try {
    const tool = brokenTool(T), work = join(T, 'work'); fixture(work);
    const bin = join(T, 'bin'); mkdirSync(bin); symlinkSync(process.execPath, join(bin, 'node')); symlinkSync(TAR, join(bin, 'tar')); symlinkSync(which('gzip'), join(bin, 'gzip'));
    const d = dump(join(tool, 'scripts/emergency-dump.mjs'), work, join(T, 'out'), { node: join(bin, 'node'), env: { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR } });
    assert.ok(d.zp?.endsWith('.tar.gz'), 'made by tar');
    assertSafe(d, 'tar');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('221: --project-only takes only the project, so none of the home dot entries can be in it', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c221-'));
  try {
    const work = join(T, 'work'); fixture(work);
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/emergency-dump.mjs'), '--project-only', '--work', work, '--outdir', join(T, 'out'), '--no-outputs', 'c221'], { encoding: 'utf8', maxBuffer: 1 << 28 });
    assert.equal(r.status, 0, r.stderr);
    const zp = join(T, 'out', readdirSync(join(T, 'out')).find((f) => f.endsWith('.zip')));
    assert.ok(!leaked(zp), 'the secret is in no member');
    const names = py('import zipfile,sys;print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', zp).stdout.split('\n');
    for (const n of TOP_DOT_NAMES) assert.ok(!inDump(names, n), `${n} is not in a project-only dump`);
  } finally { rmSync(T, { recursive: true, force: true }); }
});
