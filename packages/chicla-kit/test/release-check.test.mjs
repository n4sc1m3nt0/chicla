// C32.1 (D167, M32) — `chicla release check [--json] [--root <dir>]`: READS ONLY. Four checks, by id, in this order:
// `npm-version-free` (the version of packages/chicla/package.json is not on npm), `tree-clean` (git status has nothing), `tag-absent` (no local tag `<name>-v<version>`),
// `ci-green` (every CI run of HEAD is completed with success, at least one). `git`, `gh` and `npm` run through ONE function, `run(cmd, args, { cwd })`, that these tests replace with a fake:
// no test here can touch git, GitHub or the registry. Written before the code: red until `src/release.mjs` exists. Tests assert ids, codes and calls, never message text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(join(KIT, f)).href);
const { releaseCheck, renderReleaseCheck, runTool } = await imp('src/release.mjs');
const { main } = await imp('src/cli.mjs');

const SHA = 'a'.repeat(40);
const T = () => mkdtempSync(join(tmpdir(), 'chicla-release-'));
const done = (d) => rmSync(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 });
const project = (pkg = { name: 'chicla', version: '0.4.0' }) => { const d = T(); mkdirSync(join(d, 'packages', 'chicla'), { recursive: true }); writeFileSync(join(d, 'packages', 'chicla', 'package.json'), typeof pkg === 'string' ? pkg : JSON.stringify(pkg)); return d; };
const snapshot = (d) => Object.fromEntries(readdirSync(d, { recursive: true }).map((f) => { try { return [f, readFileSync(join(d, f), 'utf8')]; } catch { return [f, null]; } }));
const check = (r, id) => r.checks.find((c) => c.id === id);
const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const bad = (stderr = '', status = 1) => ({ status, stdout: '', stderr });
const runs = (...rs) => ok(JSON.stringify(rs));
const GREEN = runs({ databaseId: 1, name: 'ci', status: 'completed', conclusion: 'success' }, { databaseId: 2, name: 'bench', status: 'completed', conclusion: 'success' });
// a fake that answers by the command line and records every call
const fake = (over = {}) => {
  const calls = [];
  const f = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], cwd: opts?.cwd });
    const line = `${cmd} ${args.join(' ')}`;
    for (const [k, v] of Object.entries(over)) if (line.startsWith(k)) return typeof v === 'function' ? v(args) : v;
    if (line.startsWith('npm view')) return bad('npm error code E404\nnpm error 404 Not Found');
    if (line.startsWith('git status')) return ok('');
    if (line.startsWith('git tag')) return ok('');
    if (line.startsWith('git rev-parse')) return ok(`${SHA}\n`);
    if (line.startsWith('gh run list')) return GREEN;
    return bad('unexpected call');
  };
  f.calls = calls;
  return f;
};

test('core: everything green: four checks pass in order, with the name, version, tag and commit', () => {
  const d = project(); try {
    const run = fake();
    const r = releaseCheck({ root: d, run });
    assert.equal(r.ok, true); assert.equal(check(r, 'npm-version-free').published, false);
    assert.deepEqual(r.checks.map((c) => [c.id, c.ok, c.level]), [['npm-version-free', true, 'pass'], ['tree-clean', true, 'pass'], ['tag-absent', true, 'pass'], ['ci-green', true, 'pass']]);
    assert.equal(r.name, 'chicla'); assert.equal(r.version, '0.4.0'); assert.equal(r.tag, 'chicla-v0.4.0'); assert.equal(r.commit, SHA);
  } finally { done(d); }
});

test('core: it READS ONLY: every call is on the allowlist, runs in the project root, and nothing is written', () => {
  const d = project(); try {
    const before = snapshot(d);
    const run = fake();
    releaseCheck({ root: d, run });
    const lines = run.calls.map((c) => `${c.cmd} ${c.args.join(' ')}`);
    assert.deepEqual(lines, ['npm view chicla@0.4.0 version', 'git status --porcelain', 'git tag --list chicla-v0.4.0', 'git rev-parse HEAD', `gh run list --commit ${SHA} --json databaseId,name,status,conclusion --limit 50`]);
    for (const c of run.calls) { assert.ok(['git', 'gh', 'npm'].includes(c.cmd)); if (c.cmd !== 'npm') assert.equal(c.cwd, d); }
    for (const l of lines) assert.doesNotMatch(l, /publish|release create|push|(^| )commit |(^| )add |tag (?!--list)/);
    assert.deepEqual(snapshot(d), before);
  } finally { done(d); }
});

test('core: npm-version-free: a version that npm knows fails; E404 passes; any other answer fails (it cannot tell)', () => {
  const d = project(); try {
    const a = releaseCheck({ root: d, run: fake({ 'npm view': ok('0.4.0\n') }) });
    assert.equal(a.ok, false); assert.equal(a.code, 'ERELEASE_FAILED'); assert.equal(check(a, 'npm-version-free').ok, false); assert.equal(check(a, 'npm-version-free').published, true);
    assert.deepEqual(a.checks.filter((c) => c.id !== 'npm-version-free').map((c) => c.ok), [true, true, true]);
    for (const answer of [bad('npm error network request failed'), bad('', 127), { status: null, stdout: '', stderr: 'spawn npm ENOENT' }, ok('')]) {
      const b = releaseCheck({ root: d, run: fake({ 'npm view': answer }) });
      assert.equal(check(b, 'npm-version-free').ok, false, JSON.stringify(answer)); assert.equal(check(b, 'npm-version-free').published, null, JSON.stringify(answer));
    }
  } finally { done(d); }
});

test('core: tree-clean: any line of git status fails and is counted; a git error fails', () => {
  const d = project(); try {
    const a = releaseCheck({ root: d, run: fake({ 'git status': ok(' M a.mjs\n?? b.mjs\n') }) });
    assert.equal(check(a, 'tree-clean').ok, false); assert.equal(check(a, 'tree-clean').count, 2);
    assert.equal(check(releaseCheck({ root: d, run: fake({ 'git status': bad('fatal: not a git repository', 128) }) }), 'tree-clean').ok, false);
  } finally { done(d); }
});

test('core: tag-absent: the tag `<name>-v<version>` in the list fails; an empty list passes; a git error fails', () => {
  const d = project(); try {
    assert.equal(check(releaseCheck({ root: d, run: fake({ 'git tag': ok('chicla-v0.4.0\n') }) }), 'tag-absent').ok, false);
    assert.equal(check(releaseCheck({ root: d, run: fake({ 'git tag': bad('fatal', 128) }) }), 'tag-absent').ok, false);
  } finally { done(d); }
});

test('core: ci-green: no run, a run still going, one red run among green ones, a bad answer of gh, and no commit all fail; a skipped run is not success', () => {
  const d = project(); try {
    const one = (status, conclusion) => runs({ databaseId: 9, name: 'ci', status, conclusion });
    const cases = {
      none: fake({ 'gh run list': runs() }),
      running: fake({ 'gh run list': one('in_progress', '') }),
      queued: fake({ 'gh run list': one('queued', null) }),
      red: fake({ 'gh run list': runs({ databaseId: 1, name: 'ci', status: 'completed', conclusion: 'success' }, { databaseId: 2, name: 'windows', status: 'completed', conclusion: 'failure' }) }),
      cancelled: fake({ 'gh run list': one('completed', 'cancelled') }),
      skipped: fake({ 'gh run list': one('completed', 'skipped') }),
      gherr: fake({ 'gh run list': bad('gh: not logged in') }),
      notjson: fake({ 'gh run list': ok('<html>') }),
      notarray: fake({ 'gh run list': ok('{"a":1}') }),
      nosha: fake({ 'git rev-parse': bad('fatal', 128) }),
      badsha: fake({ 'git rev-parse': ok('--upload-pack=x\n') }),
    };
    for (const [name, run] of Object.entries(cases)) {
      const r = releaseCheck({ root: d, run });
      assert.equal(check(r, 'ci-green').ok, false, name);
      assert.equal(r.ok, false, name);
      assert.deepEqual(r.checks.filter((c) => c.id !== 'ci-green').map((c) => c.ok), [true, true, true], name);
    }
    assert.equal(check(releaseCheck({ root: d, run: cases.red }), 'ci-green').failing, 1);
    assert.equal(cases.badsha.calls.some((c) => c.cmd === 'gh'), false, 'a commit that is not 40 hex digits is never passed to gh');
    assert.equal(releaseCheck({ root: d, run: fake({ 'gh run list': one('completed', 'success') }) }).ok, true);
  } finally { done(d); }
});

test('core: a run function that throws or returns junk makes the checks fail; the core never throws', () => {
  const d = project(); try {
    const r1 = releaseCheck({ root: d, run: () => { throw new Error('boom'); } });
    assert.equal(r1.ok, false); assert.equal(r1.checks.length, 4); assert.ok(r1.checks.every((c) => c.ok === false));
    const r2 = releaseCheck({ root: d, run: () => undefined });
    assert.equal(r2.ok, false); assert.ok(r2.checks.every((c) => c.ok === false));
  } finally { done(d); }
});

test('core: the package: no folder is ENOROOT; no or broken packages/chicla/package.json is ERELEASE_NOPACKAGE; a name or version that is not plain is refused before any call', () => {
  assert.equal(releaseCheck({ root: join(tmpdir(), 'chicla-release-nope-' + process.pid), run: fake() }).code, 'ENOROOT');
  const e = T(); try { const run = fake(); const r = releaseCheck({ root: e, run }); assert.equal(r.code, 'ERELEASE_NOPACKAGE'); assert.equal(run.calls.length, 0); } finally { done(e); }
  for (const pkg of ['{not json', { name: 'chicla' }, { version: '0.4.0' }, { name: 'chicla', version: '--registry=x' }, { name: 'chicla', version: '0.4' }, { name: '@scope/chicla', version: '0.4.0' }, { name: 'chi cla', version: '0.4.0' }, { name: 'chicla', version: 4 }]) {
    const d = project(pkg); try { const run = fake(); const r = releaseCheck({ root: d, run }); assert.equal(r.code, 'ERELEASE_NOPACKAGE', JSON.stringify(pkg)); assert.equal(run.calls.length, 0); } finally { done(d); }
  }
  const p = project({ name: 'chicla', version: '1.2.3-rc.1' }); try { assert.equal(releaseCheck({ root: p, run: fake() }).tag, 'chicla-v1.2.3-rc.1'); } finally { done(p); }
});

test('one function: runTool is the only place of release.mjs that starts a process, and it never throws', () => {
  const src = readFileSync(join(KIT, 'src', 'release.mjs'), 'utf8');
  assert.equal((src.match(/spawnSync\(/g) ?? []).length, 1);
  assert.equal(typeof runTool, 'function');
  const r = runTool('chicla-no-such-tool-' + process.pid, [], { cwd: tmpdir() });
  assert.equal(r.status === 0, false); assert.equal(typeof r.stdout, 'string'); assert.equal(typeof r.stderr, 'string');
});

test('render: one line per check (✓ or ✗); a failure names the code on stderr and the exit is not ok', () => {
  const d = project(); try {
    const g = renderReleaseCheck(releaseCheck({ root: d, run: fake() }));
    assert.match(g.out, /^✓ release check: 4 checks/); assert.equal(g.err, ''); assert.equal(g.out.split('\n').filter((l) => /^  ✓ /.test(l)).length, 4);
    const f = renderReleaseCheck(releaseCheck({ root: d, run: fake({ 'git status': ok('x') }) }));
    assert.match(f.err, /ERELEASE_FAILED/); assert.equal(f.out.split('\n').filter((l) => /^  ✗ tree-clean/.test(l)).length, 1);
    assert.match(renderReleaseCheck({ ok: false, code: 'ENOROOT', message: 'm' }).err, /ENOROOT/);
  } finally { done(d); }
});

test('cli: `chicla release check` runs the core with io.run, prints JSON with --json, and exits 0 / 1; the root is --root', async () => {
  const d = project(); const cwd = T(); try {
    const go = async (args, run) => { let out = '', err = ''; const status = await main(args, { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd, run }); return { status, out, err }; };
    const a = await go(['release', 'check', '--root', d, '--json'], fake());
    assert.equal(a.status, 0);
    const j = JSON.parse(a.out); assert.equal(j.command, 'release'); assert.equal(j.ok, true); assert.equal(j.checks.length, 4); assert.equal(j.tag, 'chicla-v0.4.0');
    const b = await go(['release', 'check', '--root', d], fake({ 'git status': ok('x') }));
    assert.equal(b.status, 1); assert.match(b.err, /ERELEASE_FAILED/);
    const c = await go(['release', 'check', '--root', join(d, 'nope')], fake());
    assert.equal(c.status, 1); assert.match(c.err, /ENOROOT/);
  } finally { done(d); done(cwd); }
});

test('cli: `release` alone, an unknown or not-yet-built subcommand, a second subcommand and a stray option are usage errors (exit 2) and run nothing', async () => {
  const d = project(); try {
    for (const args of [['release'], ['release', 'prepare'], ['release', 'publish'], ['release', 'nope'], ['release', 'check', 'check'], ['release', 'check', '--run', '1'], ['check', 'release']]) {
      const run = fake(); let err = '';
      const status = await main(args.concat(['--root', d]), { stdout: { write() {} }, stderr: { write: (s) => { err += s; } }, cwd: d, run });
      assert.equal(status, 2, args.join(' ')); assert.match(err, /EUSAGE|ECOMMAND_UNKNOWN/); assert.equal(run.calls.length, 0, args.join(' '));
    }
  } finally { done(d); }
});

test('cli: `--help` lists `release`, and the page of the npm package names it', async () => {
  let out = ''; assert.equal(await main(['--help'], { stdout: { write: (s) => { out += s; } }, stderr: { write() {} } }), 0);
  assert.match(out, /^  release /m);
  assert.ok(readFileSync(join(KIT, '..', 'chicla', 'README.md'), 'utf8').includes('`release`'));
});
