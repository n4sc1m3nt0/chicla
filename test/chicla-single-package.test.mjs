// Round 280 (C23.2, D148): the single package `chicla`. packages/chicla holds only its metadata; scripts/build-chicla.mjs assembles the package
// (the kit's src/ and templates/ plus zipkit.mjs beside the loader) and pack-release packs it. Written before the script; red until it exists.
// Tests assert exit codes, files and hashes, never message wording. Replaces test/chicla-package.test.mjs (the thin package of round 278).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const node = (args, opts = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', ...opts });
const walk = (d, base = d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name), base) : [join(d, e.name).slice(base.length + 1).split('\\').join('/')])).sort();
const tmp = () => mkdtempSync(join(tmpdir(), 'chicla-single-'));
const NPM = process.platform === 'win32' ? { shell: true } : {};
const BUILD = join(root, 'scripts', 'build-chicla.mjs');
const PACK = join(root, 'scripts', 'pack-release.mjs');

test('packages/chicla/package.json: chicla 0.2.0, two commands, the zip library at chicla/zip, nothing to install with it', () => {
  const pkg = json('packages/chicla/package.json');
  assert.equal(pkg.name, 'chicla');
  assert.equal(pkg.version, '0.2.0');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.private, undefined);
  assert.deepEqual(pkg.bin, { chicla: 'src/cli.mjs', 'chicla-zip': 'src/zipkit.mjs' });
  assert.deepEqual(pkg.exports, { './zip': './src/zipkit.mjs', './package.json': './package.json' });
  assert.deepEqual(pkg.files, ['src', 'templates', 'README.md', 'LICENSE']);
  assert.equal(pkg.dependencies, undefined, 'the single package has no dependency at all');
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.engines.node, '>=18');
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.repository.directory, 'packages/chicla');
  assert.doesNotMatch(pkg.description, /thin|reserved|nothing usable/i);
});

test('packages/chicla holds only its metadata: package.json, README.md, LICENSE (the sources are assembled, never copied into the repo)', () => {
  assert.deepEqual(walk(join(root, 'packages', 'chicla')), ['LICENSE', 'README.md', 'package.json']);
  assert.equal(read('packages/chicla/LICENSE'), read('LICENSE'));
});

test('packages/chicla/README.md: how to install and run, the zip library, and what happened to the two old names', () => {
  const r = read('packages/chicla/README.md');
  for (const part of ['npm install chicla', 'npx chicla', 'chicla init', 'chicla-zip', 'chicla/zip', '0.2.0', 'chicla-kit', 'deprecated']) assert.ok(r.includes(part), `the README does not mention ${part}`);
  assert.doesNotMatch(r, /thin package|name reserved|nothing usable|work in progress/i);
});

test('build-chicla: no --out is a usage error (2); an existing <out>/chicla is refused (1) and left as it was', () => {
  assert.equal(node([BUILD]).status, 2);
  const out = tmp();
  try {
    mkdirSync(join(out, 'chicla'));
    writeFileSync(join(out, 'chicla', 'keep.txt'), 'mine');
    const r = node([BUILD, '--out', out, '--json']);
    assert.equal(r.status, 1);
    assert.equal(JSON.parse(r.stdout).error.code, 'EEXISTS');
    assert.deepEqual(readdirSync(join(out, 'chicla')), ['keep.txt']);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('build-chicla: the stage is exactly the metadata + the kit src/ and templates/ + zipkit.mjs beside the loader, byte for byte, with no tests', () => {
  const out = tmp();
  try {
    const r = node([BUILD, '--out', out, '--json']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim().split('\n').length, 1, '--json prints one line');
    const info = JSON.parse(r.stdout);
    assert.equal(info.ok, true);
    const stage = join(out, 'chicla');
    const kit = join(root, 'packages', 'chicla-kit');
    const expected = [
      'LICENSE', 'README.md', 'package.json',
      ...walk(join(kit, 'src')).map((f) => `src/${f}`), 'src/zipkit.mjs',
      ...walk(join(kit, 'templates')).map((f) => `templates/${f}`),
    ].sort();
    assert.deepEqual(walk(stage), expected);
    assert.equal(info.files, expected.length);
    for (const f of ['package.json', 'README.md', 'LICENSE']) assert.equal(sha(join(stage, f)), sha(join(root, 'packages', 'chicla', f)), f);
    for (const f of walk(join(kit, 'src'))) assert.equal(sha(join(stage, 'src', f)), sha(join(kit, 'src', f)), `src/${f}`);
    for (const f of walk(join(kit, 'templates'))) assert.equal(sha(join(stage, 'templates', f)), sha(join(kit, 'templates', f)), `templates/${f}`);
    assert.equal(sha(join(stage, 'src', 'zipkit.mjs')), sha(join(root, 'packages', 'chicla-zip', 'src', 'zipkit.mjs')), 'the zip module must be byte-identical (it is a pinned file of the dump)');
    assert.ok(!existsSync(join(stage, 'test')), 'no tests in the package');
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('pack-release refuses a package whose bin or files entries are missing (EINCOMPLETE): packages/chicla itself is only metadata', () => {
  const out = tmp();
  try {
    const r = node([PACK, join(root, 'packages', 'chicla'), '--out', out, '--json']);
    assert.equal(r.status, 1);
    const e = JSON.parse(r.stdout).error;
    assert.equal(e.code, 'EINCOMPLETE');
    assert.match(e.message, /src\/cli\.mjs/);
    assert.deepEqual(readdirSync(out), [], 'a refusal writes nothing');
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('the three-step chain, then installed ALONE (offline, no other package) in an empty folder: both commands, the library and a dump work', { timeout: 180000 }, () => {
  const out = tmp();
  try {
    assert.equal(node([BUILD, '--out', join(out, 'stage')]).status, 0);
    const p = node([PACK, join(out, 'stage', 'chicla'), '--out', join(out, 'dist'), '--json']);
    assert.equal(p.status, 0, p.stdout + p.stderr);
    assert.equal(JSON.parse(p.stdout).file, 'chicla-0.2.0.tgz');
    const names = execFileSync('tar', ['-tzf', join(out, 'dist', 'chicla-0.2.0.tgz')], { encoding: 'utf8' }).trim().split('\n');
    for (const f of ['package/LICENSE', 'package/README.md', 'package/package.json', 'package/src/cli.mjs', 'package/src/zipkit.mjs', 'package/src/zipkit-loader.mjs', 'package/src/pinned/recovery-report.mjs', 'package/templates/CLAUDE.md']) assert.ok(names.includes(f), `the tarball lacks ${f}`);
    assert.ok(!names.some((n) => n.startsWith('package/test/')), 'tests are in the tarball');

    const proj = join(out, 'proj');
    mkdirSync(proj);
    execFileSync('npm', ['init', '-y'], { cwd: proj, stdio: 'pipe', ...NPM });
    const inst = spawnSync('npm', ['install', '--offline', '--no-audit', '--no-fund', '--ignore-scripts', join(out, 'dist', 'chicla-0.2.0.tgz')], { cwd: proj, encoding: 'utf8', ...NPM });
    assert.equal(inst.status, 0, inst.stderr);
    assert.deepEqual(readdirSync(join(proj, 'node_modules')).filter((n) => !n.startsWith('.')), ['chicla'], 'nothing else was installed with it');
    const bin = (n) => join(proj, 'node_modules', '.bin', n);
    const run = (n, args, cwd = proj) => spawnSync(bin(n) + (process.platform === 'win32' ? '.cmd' : ''), args, { cwd, encoding: 'utf8', ...NPM });

    const help = run('chicla', ['--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout + help.stderr, /init/);
    assert.equal(run('chicla', ['no-such-command']).status, 2, 'a usage error exits 2');
    const fresh = join(out, 'fresh');
    mkdirSync(fresh);
    assert.equal(run('chicla', ['init', '--root', fresh]).status, 0);
    assert.ok(existsSync(join(fresh, 'CLAUDE.md')) && existsSync(join(fresh, 'FILES.manifest')), 'init wrote the project files');

    assert.equal(run('chicla-zip', ['--help']).status, 0);
    assert.equal(run('chicla-zip', []).status, 2, 'chicla-zip with no command is a usage error');
    const zip = join(out, 'fresh.zip');
    assert.equal(run('chicla-zip', ['create', zip, fresh]).status, 0);
    const ls = run('chicla-zip', ['ls', zip, '--json']);
    assert.equal(ls.status, 0, ls.stderr);
    assert.ok(ls.stdout.includes('CLAUDE.md'), 'the zip made by chicla-zip lists the project');

    writeFileSync(join(proj, 'probe.mjs'), 'import * as z from "chicla/zip"; process.stdout.write([typeof z.writeZip, typeof z.extractZip].join(" "));');
    assert.equal(execFileSync(process.execPath, ['probe.mjs'], { cwd: proj, encoding: 'utf8' }), 'function function');
    writeFileSync(join(proj, 'deep.mjs'), 'import("chicla/src/cli.mjs").then(() => process.stdout.write("open"), (e) => process.stdout.write(e.code));');
    assert.equal(execFileSync(process.execPath, ['deep.mjs'], { cwd: proj, encoding: 'utf8' }), 'ERR_PACKAGE_PATH_NOT_EXPORTED', 'only chicla/zip and the commands are public');

    const dumpDir = join(out, 'dumped');
    const d = run('chicla', ['dump', '--outdir', dumpDir, 'smoke'], fresh);
    assert.equal(d.status, 0, d.stdout + d.stderr);
    const zips = readdirSync(dumpDir).filter((f) => f.endsWith('.zip'));
    assert.equal(zips.length, 1, 'one dump zip');
    const dls = run('chicla-zip', ['ls', join(dumpDir, zips[0]), '--json']);
    assert.ok(dls.stdout.includes('RECOVERY_MARKER.json') && dls.stdout.includes('RECOVERY_REPORT.md'), 'the dump has its marker and report');
  } finally { rmSync(out, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('CI: the `pack-chicla` job builds the single package, packs it, uploads `chicla-tarball`, and never publishes', () => {
  const ci = read('.github/workflows/ci.yml');
  const job = ci.split(/\n(?=  [a-z][\w-]*:\n)/).find((j) => /^\s*pack-chicla:/.test(j)) ?? '';
  assert.ok(job, 'no `pack-chicla:` job in ci.yml');
  assert.match(job, /node scripts\/build-chicla\.mjs --out stage/);
  assert.match(job, /pack-release\.mjs stage\/chicla --out dist/);
  assert.ok(job.indexOf('build-chicla.mjs') < job.indexOf('pack-release.mjs'), 'build first, then pack');
  assert.match(job, /name:\s*chicla-tarball/);
  assert.doesNotMatch(job, /npm publish|gh release/);
});

test('ROADMAP: D148 has D-B, D-C and D-D confirmed by Rodrigo («avança», 2026-10-29), and C23.2 is done', () => {
  const r = read('ROADMAP.md');
  const d = r.split('\n').find((l) => l.startsWith('| D148 |')) ?? '';
  assert.match(d, /CONFIRMED by Rodrigo \(D-A, 2026-10-28; D-B, D-C and D-D, 2026-10-29: «avança»\)/);
  assert.doesNotMatch(d, /PROPOSED by Claude|applied as default/);
  const c = r.split('\n').find((l) => l.startsWith('| C23.2 |')) ?? '';
  assert.match(c, /feito \(round 280/);
});
