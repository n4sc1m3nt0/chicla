// C9.8 (round 88): the dump leaves out the tool and home-directory noise at the TOP of work/ (`.local`, `.config`, `.npmrc`, `.wget-hsts`:
// the 60 MB `uv` binary and an `.npmrc` that can hold a registry token), says which names it skipped (report and marker), and still comes out.
// Rules pinned here: only the top level of work/; never when work/ is itself the project root; `recovered*` folders are NOT skipped (a recovery
// session works INSIDE `recovered/work/<project>`, so a dump taken there must keep that work: D59). Python reads the zip; tests assert names, not wording.
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
const ZIP = which('zip'), PY = which('python3');
const TOKEN = ['REGISTRY', 'TOKEN', 'c98'].join('-');
const NOISE = ['.local/bin/uv', '.config/uv/uv-receipt.json', '.npmrc', '.wget-hsts'];
const COPY = DUMP_COPY;

const put = (base, files) => { for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(base, rel)), { recursive: true }); writeFileSync(join(base, rel), text); } };
const PROJECT = { 'package.json': '{"version":"0.0.1"}\n', 'CHANGELOG.md': '## Round 1\n', 'FILES.manifest': 'a.txt\n', 'a.txt': 'a\n' };
const noise = () => Object.fromEntries(NOISE.map((n) => [n, n === '.npmrc' ? `//registry/:_authToken=${TOKEN}\n` : 'x\n']));
const py = (code, ...a) => spawnSync(PY, ['-c', code, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const read = (zp, n) => py('import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode("utf8","replace"))', zp, n).stdout;
const dump = (script, work, outdir, env) => {
  const r = spawnSync(env ? env.node : process.execPath, [script, '--work', work, '--outdir', outdir, '--no-outputs', 'c98'], { encoding: 'utf8', env: env?.env, maxBuffer: 1 << 28 });
  const z = existsSync(outdir) ? readdirSync(outdir).find((f) => f.endsWith('.zip')) : undefined;
  const zp = z && join(outdir, z);
  return { r, zp, names: zp ? py('import zipfile,sys;print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', zp).stdout.split('\n').filter(Boolean) : [] };
};
const inZip = (names, rel) => names.some((n) => n === `work/${rel}` || n.startsWith(`work/${rel}/`));

test('C9.8: .local, .config, .npmrc and .wget-hsts at the top of work/ stay out; the project, a nested .local and recovered/ stay in', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c98-'));
  try {
    const work = join(T, 'work');
    put(work, { ...noise(), ...Object.fromEntries(Object.entries(PROJECT).map(([k, v]) => [`chicla/${k}`, v])), 'chicla/.local/keep.txt': 'inside the project\n', 'recovered/work/r82/a.txt': 'a recovery session works here\n', 'loose.txt': 'l\n' });
    const d = dump(join(ROOT, 'scripts/emergency-dump.mjs'), work, join(T, 'out'));
    assert.equal(d.r.status, 0, d.r.stderr);
    for (const n of ['.local', '.config', '.npmrc', '.wget-hsts']) assert.ok(!inZip(d.names, n), `${n} is left out`);
    for (const n of ['chicla/a.txt', 'chicla/.local/keep.txt', 'recovered/work/r82/a.txt', 'loose.txt']) assert.ok(inZip(d.names, n), `${n} stays in`);
    assert.deepEqual(JSON.parse(read(d.zp, 'RECOVERY_MARKER.json')).homeSkipped, ['.config', '.local', '.npmrc', '.wget-hsts'], 'the marker names what was skipped');
    const report = read(d.zp, 'RECOVERY_REPORT.md');
    for (const n of ['.config', '.local', '.npmrc', '.wget-hsts']) assert.ok(report.includes(n), `the report names ${n}`);
    assert.ok(!d.names.some((n) => n.startsWith('work/') && read(d.zp, n).includes(TOKEN)), 'the registry token is nowhere in the dump');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.8: when work/ is itself the project root, its own .config, .local and .wget-hsts are work and stay in; nothing is reported as skipped (the .npmrc is a credentials name since C6.3 a, D73, and stays out)', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c98-'));
  try {
    const work = join(T, 'work');
    put(work, { ...PROJECT, ...noise() });
    const d = dump(join(ROOT, 'scripts/emergency-dump.mjs'), work, join(T, 'out'));
    assert.equal(d.r.status, 0, d.r.stderr);
    for (const n of NOISE.filter((x) => x !== '.npmrc')) assert.ok(inZip(d.names, n), `${n} stays in`);
    assert.ok(!inZip(d.names, '.npmrc'), '.npmrc is out whatever the folder (D73)');
    assert.deepEqual(JSON.parse(read(d.zp, 'RECOVERY_MARKER.json')).homeSkipped, []);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.8: no noise, nothing skipped: marker.homeSkipped is empty', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c98-'));
  try {
    const work = join(T, 'work');
    put(work, Object.fromEntries(Object.entries(PROJECT).map(([k, v]) => [`chicla/${k}`, v])));
    const d = dump(join(ROOT, 'scripts/emergency-dump.mjs'), work, join(T, 'out'));
    assert.equal(d.r.status, 0, d.r.stderr);
    assert.deepEqual(JSON.parse(read(d.zp, 'RECOVERY_MARKER.json')).homeSkipped, []);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.8: the external zip path (chicla-zip broken on purpose) leaves the same noise out', { skip: !ZIP || !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c98-'));
  try {
    const tool = join(T, 'tool');
    for (const f of COPY) { mkdirSync(dirname(join(tool, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(tool, f)); }
    writeFileSync(join(tool, 'packages/chicla-zip/src/zipkit.mjs'), 'export const writeZipStream = async () => { throw new Error("broken on purpose"); };\n');
    const work = join(T, 'work');
    put(work, { ...noise(), ...Object.fromEntries(Object.entries(PROJECT).map(([k, v]) => [`chicla/${k}`, v])), 'chicla/.local/keep.txt': 'k\n' });
    const bin = join(T, 'bin'); mkdirSync(bin); symlinkSync(process.execPath, join(bin, 'node')); symlinkSync(ZIP, join(bin, 'zip'));
    const d = dump(join(tool, 'scripts/emergency-dump.mjs'), work, join(T, 'out'), { node: join(bin, 'node'), env: { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR } });
    assert.equal(d.r.status, 0, d.r.stdout + d.r.stderr);
    assert.ok(d.zp, 'a zip');
    for (const n of ['.local', '.config', '.npmrc', '.wget-hsts']) assert.ok(!inZip(d.names, n), `${n} is left out`);
    for (const n of ['chicla/a.txt', 'chicla/.local/keep.txt']) assert.ok(inZip(d.names, n), `${n} stays in`);
  } finally { rmSync(T, { recursive: true, force: true }); }
});
