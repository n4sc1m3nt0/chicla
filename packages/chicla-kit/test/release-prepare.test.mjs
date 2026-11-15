// C32.2 (D167, D169, M32) — `chicla release prepare --run <id> [--out <dir>]`: the CI tarball of a run into a NEW folder, checked, never published. Five checks, by id, in this order, and it STOPS at the first that fails
// (each needs the one before): `run-is-head` (the run is of HEAD, completed, success), `download` (the artifact `chicla-tarball` into the new folder: exactly `<name>-<version>.tgz` and its `.sha256`),
// `sha256` (the sha256 computed here equals the one in the `.sha256` file, which names this tarball), `tarball-smoke` (`node scripts/smoke-test-tarball.mjs --tarball <file> --json` installs it ALONE in an empty folder and exits 0),
// `notes` (`notes-<name>-<version>.md` with the CI's numbers; written only when the four before passed). `git`, `gh`, `npm` and `node` run through ONE function, `run(cmd, args, { cwd })`, that these tests replace
// with a fake: no test here can touch git, GitHub, the registry or a real tarball. Written before the code: red until `releasePrepare` exists. Tests assert ids, codes and calls, never message text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(join(KIT, f)).href);
const { releasePrepare, renderReleasePrepare } = await imp('src/release.mjs');
const { main } = await imp('src/cli.mjs');

const SHA = 'a'.repeat(40), RUN = '123456789', TGZ = Buffer.from('the bytes of a tarball'), SUM = createHash('sha256').update(TGZ).digest('hex'), NAME = 'chicla-0.4.0.tgz';
const T = () => mkdtempSync(join(tmpdir(), 'chicla-prepare-'));
const done = (d) => rmSync(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 });
const project = (pkg = { name: 'chicla', version: '0.4.0' }) => { const d = T(); mkdirSync(join(d, 'packages', 'chicla'), { recursive: true }); writeFileSync(join(d, 'packages', 'chicla', 'package.json'), JSON.stringify(pkg)); writeFileSync(join(d, 'keep.txt'), 'x'); return d; };
const snapshot = (d) => Object.fromEntries(readdirSync(d, { recursive: true }).map((f) => { try { return [f, readFileSync(join(d, f), 'utf8')]; } catch { return [f, null]; } }));
const check = (r, id) => r.checks.find((c) => c.id === id);
const ids = (r) => r.checks.map((c) => c.id);
const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const bad = (stderr = '', status = 1) => ({ status, stdout: '', stderr });
const view = (o = {}) => ok(JSON.stringify({ headSha: SHA, status: 'completed', conclusion: 'success', ...o }));
// what `gh run download` leaves in the folder named by -D
const download = (o = {}) => (args) => {
  const out = args[args.indexOf('-D') + 1]; mkdirSync(out, { recursive: true });
  for (const f of o.files ?? [[NAME, TGZ], [`${NAME}.sha256`, `${o.sum ?? SUM}  ${o.sumName ?? NAME}\n`]]) writeFileSync(join(out, f[0]), f[1]);
  return ok();
};
const fake = (over = {}) => {
  const calls = [];
  const f = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], cwd: opts?.cwd });
    const line = `${cmd} ${args.join(' ')}`;
    for (const [k, v] of Object.entries(over)) if (line.startsWith(k)) return typeof v === 'function' ? v(args) : v;
    if (line.startsWith('git rev-parse')) return ok(`${SHA}\n`);
    if (line.startsWith('gh run view')) return view();
    if (line.startsWith('gh run download')) return download()(args);
    if (line.startsWith('node ')) return ok('{"ok":true}');
    return bad('unexpected call');
  };
  f.calls = calls; f.lines = () => calls.map((c) => `${c.cmd} ${c.args.join(' ')}`);
  return f;
};

test('core: everything green: five checks pass in order; the tarball, its .sha256 and the notes are in the new folder', () => {
  const d = project(); const out = join(d, 'dist'); try {
    const r = releasePrepare({ root: d, run: fake(), runId: RUN, out });
    assert.equal(r.ok, true); assert.deepEqual(r.checks.map((c) => [c.id, c.ok, c.level]), [['run-is-head', true, 'pass'], ['download', true, 'pass'], ['sha256', true, 'pass'], ['tarball-smoke', true, 'pass'], ['notes', true, 'pass']]);
    assert.equal(r.name, 'chicla'); assert.equal(r.version, '0.4.0'); assert.equal(r.tag, 'chicla-v0.4.0'); assert.equal(r.commit, SHA); assert.equal(r.run, RUN);
    assert.equal(r.out, out); assert.equal(r.file, NAME); assert.equal(r.sha256, SUM); assert.equal(r.bytes, TGZ.length);
    assert.deepEqual(readdirSync(out).sort(), [NAME, `${NAME}.sha256`, 'notes-chicla-0.4.0.md']);
    assert.deepEqual(readFileSync(join(out, NAME)), TGZ);
  } finally { done(d); }
});

test('core: the default folder is dist-<version> in the project root', () => {
  const d = project(); try {
    const r = releasePrepare({ root: d, run: fake(), runId: RUN });
    assert.equal(r.ok, true); assert.equal(r.out, join(d, 'dist-0.4.0')); assert.ok(existsSync(join(d, 'dist-0.4.0', NAME)));
  } finally { done(d); }
});

test('core: every call is on the allowlist, runs in the project root, and nothing is written outside the new folder', () => {
  const d = project(); const out = join(d, 'dist'); try {
    const before = snapshot(d); const run = fake();
    releasePrepare({ root: d, run, runId: RUN, out });
    assert.deepEqual(run.lines(), ['git rev-parse HEAD', `gh run view ${RUN} --json headSha,status,conclusion`, `gh run download ${RUN} -n chicla-tarball -D ${out}`, `node ${join(d, 'scripts', 'smoke-test-tarball.mjs')} --tarball ${join(out, NAME)} --json`]);
    for (const l of run.lines()) assert.doesNotMatch(l, /publish|release create|push|(^| )tag |install|login/);
    for (const c of run.calls) assert.equal(c.cwd, d);
    const after = snapshot(d); for (const k of Object.keys(after)) if (!k.startsWith('dist')) assert.equal(after[k], before[k], k);
    assert.deepEqual(Object.keys(before).sort(), Object.keys(after).filter((k) => !k.startsWith('dist')).sort());
  } finally { done(d); }
});

test('core: a run id that is not plain digits (an angle bracket, an option, a space, zero) is ERELEASE_RUN: nothing runs, nothing is written', () => {
  const d = project(); try {
    for (const id of ['', '12a', '<123>', '--help', '-1', '0', '1 2', '1e3', undefined, 123]) {
      const run = fake(), before = snapshot(d);
      const r = releasePrepare({ root: d, run, runId: id, out: join(d, 'dist') });
      assert.equal(r.ok, false, String(id)); assert.equal(r.code, 'ERELEASE_RUN', String(id)); assert.equal(run.calls.length, 0, String(id)); assert.deepEqual(snapshot(d), before, String(id));
    }
  } finally { done(d); }
});

test('core: a folder that already exists is ERELEASE_OUT_EXISTS: no call at all and the folder is not touched', () => {
  const d = project(); const out = join(d, 'dist'); mkdirSync(out); writeFileSync(join(out, 'mine.txt'), 'mine'); try {
    const run = fake(), r = releasePrepare({ root: d, run, runId: RUN, out });
    assert.equal(r.ok, false); assert.equal(r.code, 'ERELEASE_OUT_EXISTS'); assert.equal(run.calls.length, 0); assert.deepEqual(readdirSync(out), ['mine.txt']);
    const f = join(d, 'afile'); writeFileSync(f, 'x'); assert.equal(releasePrepare({ root: d, run: fake(), runId: RUN, out: f }).code, 'ERELEASE_OUT_EXISTS');
  } finally { done(d); }
});

test('core: no usable packages/chicla/package.json, or a missing project folder, stops before any call', () => {
  const d = T(); try {
    for (const [root, code] of [[d, 'ERELEASE_NOPACKAGE'], [join(d, 'nope'), 'ENOROOT']]) { const run = fake(); const r = releasePrepare({ root, run, runId: RUN }); assert.equal(r.code, code); assert.equal(run.calls.length, 0); }
    for (const pkg of [{ name: '@x/chicla', version: '0.4.0' }, { name: 'chicla', version: '--registry=x' }, { name: 'chicla', version: '1.2' }]) { const bd = project(pkg); try { const run = fake(); assert.equal(releasePrepare({ root: bd, run, runId: RUN }).code, 'ERELEASE_NOPACKAGE'); assert.equal(run.calls.length, 0); } finally { done(bd); } }
  } finally { done(d); }
});

test('core: a run that is not of HEAD, not finished, not a success, or that gh cannot read, fails `run-is-head` and STOPS: nothing is downloaded', () => {
  const d = project(); try {
    const cases = { 'another commit': view({ headSha: 'b'.repeat(40) }), 'still running': view({ status: 'in_progress', conclusion: null }), 'running with a success': view({ status: 'in_progress' }), failure: view({ conclusion: 'failure' }), cancelled: view({ conclusion: 'cancelled' }), 'gh fails': bad('HTTP 404'), garbage: ok('not json'), 'no sha': ok('{"status":"completed","conclusion":"success"}') };
    for (const [name, answer] of Object.entries(cases)) {
      const run = fake({ 'gh run view': answer }), out = join(d, `dist-${name.replace(/ /g, '-')}`);
      const r = releasePrepare({ root: d, run, runId: RUN, out });
      assert.equal(r.ok, false, name); assert.equal(r.code, 'ERELEASE_FAILED', name); assert.deepEqual(ids(r), ['run-is-head'], name); assert.equal(check(r, 'run-is-head').ok, false, name);
      assert.ok(!run.lines().some((l) => l.startsWith('gh run download')), name); assert.equal(existsSync(out), false, name);
    }
    const run = fake({ 'git rev-parse': bad('no repo') }); assert.deepEqual(ids(releasePrepare({ root: d, run, runId: RUN, out: join(d, 'x') })), ['run-is-head']);
  } finally { done(d); }
});

test('core: a download that fails, or leaves not exactly <name>-<version>.tgz and its .sha256, fails `download` and STOPS: no sha check, no smoke', () => {
  const d = project(); try {
    const cases = {
      'gh fails': () => bad('file exists'), 'no files': download({ files: [] }), 'no sha file': download({ files: [[NAME, TGZ]] }), 'no tarball': download({ files: [[`${NAME}.sha256`, `${SUM}  ${NAME}\n`]] }),
      'wrong version': download({ files: [['chicla-0.3.0.tgz', TGZ], ['chicla-0.3.0.tgz.sha256', `${SUM}  chicla-0.3.0.tgz\n`]] }), 'two tarballs': download({ files: [[NAME, TGZ], [`${NAME}.sha256`, `${SUM}  ${NAME}\n`], ['chicla-0.4.1.tgz', TGZ]] }),
    };
    for (const [name, answer] of Object.entries(cases)) {
      const run = fake({ 'gh run download': answer }), out = join(d, `dist-${name.replace(/ /g, '-')}`);
      const r = releasePrepare({ root: d, run, runId: RUN, out });
      assert.equal(r.ok, false, name); assert.equal(r.code, 'ERELEASE_FAILED', name); assert.deepEqual(ids(r), ['run-is-head', 'download'], name); assert.equal(check(r, 'download').ok, false, name);
      assert.ok(!run.lines().some((l) => l.startsWith('node ')), name);
    }
  } finally { done(d); }
});

test('core: a sha256 that differs from the .sha256 file, a file naming another tarball, or a file that is not a sha256 line fails `sha256` and STOPS', () => {
  const d = project(); try {
    const cases = { 'other digest': { sum: 'b'.repeat(64) }, 'other name': { sumName: 'chicla-0.3.0.tgz' }, 'short digest': { sum: SUM.slice(0, 63) }, 'not hex': { sum: 'z'.repeat(64) }, 'upper case of another': { sum: SUM.replace(/[0-9]/, (c) => (c === '0' ? '1' : '0')) } };
    for (const [name, o] of Object.entries(cases)) {
      const run = fake({ 'gh run download': download(o) }), out = join(d, `dist-${name.replace(/ /g, '-')}`);
      const r = releasePrepare({ root: d, run, runId: RUN, out });
      assert.equal(r.ok, false, name); assert.equal(r.code, 'ERELEASE_FAILED', name); assert.deepEqual(ids(r), ['run-is-head', 'download', 'sha256'], name);
      assert.ok(!run.lines().some((l) => l.startsWith('node ')), name); assert.ok(!existsSync(join(out, 'notes-chicla-0.4.0.md')), name);
    }
    const run = fake({ 'gh run download': download({ sum: SUM.toUpperCase() }) }); assert.equal(releasePrepare({ root: d, run, runId: RUN, out: join(d, 'up') }).ok, true, 'sha256sum may be written in capitals');
  } finally { done(d); }
});

test('core: a smoke that exits non-zero fails `tarball-smoke`; no notes are written (nothing half-done)', () => {
  const d = project(); const out = join(d, 'dist'); try {
    const r = releasePrepare({ root: d, run: fake({ node: bad('step init failed', 1) }), runId: RUN, out });
    assert.equal(r.ok, false); assert.equal(r.code, 'ERELEASE_FAILED'); assert.deepEqual(ids(r), ['run-is-head', 'download', 'sha256', 'tarball-smoke']); assert.equal(check(r, 'tarball-smoke').ok, false);
    assert.ok(!existsSync(join(out, 'notes-chicla-0.4.0.md')));
    const n = releasePrepare({ root: d, run: fake({ node: { status: null, stdout: '', stderr: 'ENOENT' } }), runId: RUN, out: join(d, 'o2') }); assert.equal(check(n, 'tarball-smoke').ok, false);
  } finally { done(d); }
});

test('core: a run function that throws never makes the core throw', () => {
  const d = project(); try {
    const r = releasePrepare({ root: d, run: () => { throw new Error('boom'); }, runId: RUN, out: join(d, 'dist') });
    assert.equal(r.ok, false); assert.equal(check(r, 'run-is-head').ok, false);
  } finally { done(d); }
});

test('core: the notes carry the CI\'s numbers (name, version, tag, commit, run id, file, size, sha256) and no angle bracket', () => {
  const d = project(); const out = join(d, 'dist'); try {
    releasePrepare({ root: d, run: fake(), runId: RUN, out });
    const n = readFileSync(join(out, 'notes-chicla-0.4.0.md'), 'utf8');
    for (const s of ['chicla 0.4.0', 'chicla-v0.4.0', SHA, RUN, NAME, `${TGZ.length} bytes`, SUM]) assert.ok(n.includes(s), s);
    assert.doesNotMatch(n, /[<>]/);
  } finally { done(d); }
});

test('core: the renderer prints one line per check; a failure prints its code on stderr; a stop before the checks prints the code', () => {
  const d = project(); try {
    const g = renderReleasePrepare(releasePrepare({ root: d, run: fake(), runId: RUN, out: join(d, 'a') }));
    assert.match(g.out, /^✓ release prepare: 5 checks/); assert.equal(g.err, ''); assert.equal(g.out.split('\n').filter((l) => /^  ✓ /.test(l)).length, 5); assert.match(g.out, new RegExp(SUM));
    const f = renderReleasePrepare(releasePrepare({ root: d, run: fake({ node: bad('x') }), runId: RUN, out: join(d, 'b') }));
    assert.match(f.err, /ERELEASE_FAILED/); assert.equal(f.out.split('\n').filter((l) => /^  ✗ tarball-smoke/.test(l)).length, 1);
    assert.match(renderReleasePrepare({ ok: false, code: 'ERELEASE_RUN', message: 'm' }).err, /ERELEASE_RUN/);
  } finally { done(d); }
});

test('cli: `chicla release prepare --run <id>` runs the core with io.run, --out is read from the current folder, --json prints one object, exit 0 / 1', async () => {
  const d = project(); const cwd = T(); try {
    const go = async (args, run) => { let out = '', err = ''; const status = await main(args, { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd, run }); return { status, out, err }; };
    const a = await go(['release', 'prepare', '--run', RUN, '--out', 'made', '--root', d, '--json'], fake());
    assert.equal(a.status, 0); const j = JSON.parse(a.out); assert.equal(j.command, 'release'); assert.equal(j.ok, true); assert.equal(j.checks.length, 5); assert.equal(j.run, RUN); assert.equal(j.out, resolve(cwd, 'made')); assert.ok(existsSync(join(cwd, 'made', NAME)));
    const h = await go(['release', 'prepare', '--run', RUN, '--out', 'made3', '--root', d], fake()); assert.equal(h.status, 0); assert.match(h.out, /^✓ release prepare: 5 checks/);
    const b = await go(['release', 'prepare', '--run', RUN, '--out', 'made2', '--root', d], fake({ node: bad('x') }));
    assert.equal(b.status, 1); assert.match(b.err, /ERELEASE_FAILED/);
    const c = await go(['release', 'prepare', '--run', RUN, '--out', 'made', '--root', d], fake());
    assert.equal(c.status, 1); assert.match(c.err, /ERELEASE_OUT_EXISTS/);
  } finally { done(d); done(cwd); }
});

test('cli: prepare without --run, with a run id that is not digits, a stray option, a second subcommand, or `--run` / `--out` on `check` are usage errors (exit 2) and run nothing', async () => {
  const d = project(); try {
    for (const args of [['release', 'prepare'], ['release', 'prepare', '--run'], ['release', 'prepare', '--run', '<123>'], ['release', 'prepare', '--run', '--out'], ['release', 'prepare', '--run', RUN, '--out'], ['release', 'prepare', '--run', RUN, '--out', '--json'], ['release', 'prepare', '--run', RUN, '--nope'], ['release', 'prepare', 'check', '--run', RUN], ['release', 'check', '--run', RUN], ['release', 'check', '--out', 'x'], ['release', 'publish', '--run', RUN]]) {
      const run = fake(); let err = '';
      const status = await main(args.concat(['--root', d]), { stdout: { write() {} }, stderr: { write: (s) => { err += s; } }, cwd: d, run });
      assert.equal(status, 2, args.join(' ')); assert.match(err, /EUSAGE/); assert.equal(run.calls.length, 0, args.join(' ')); assert.equal(existsSync(join(d, 'dist-0.4.0')), false);
    }
  } finally { done(d); }
});

test('cli: `--help` names `release prepare`', async () => {
  let out = ''; assert.equal(await main(['--help'], { stdout: { write: (s) => { out += s; } }, stderr: { write() {} } }), 0);
  assert.match(out, /^  release .*prepare/m);
});
