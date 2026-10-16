// C11.1, slice 4a (D82) — `emergency-dump` as a core (`emergencyDump({ work, outdir, note, projectOnly, noOutputs, hashLimit })`: never prints, exits or throws) and
// `chicla dump [note...] [--note <text>] [--project-only] [--outdir <dir>] [--json] [--root <dir>]`. `--root` is the working directory that is dumped (default: the
// current folder). Exit 0 when a dump was created (warnings never change that), 1 when none was (EDUMP_NO_PROJECT, EDUMP_FAILED), 2 for a usage error.
// Zips are read by Python's zipfile (an independent reader), never by the writer that made them. Tests assert codes, names, marker fields and exit statuses; the
// only text compared is the script's output against the core's and the CLI's (parity). Every project is built in a temp folder; the real tree is never touched.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { findPython } from './python-probe.mjs';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts/emergency-dump.mjs');
const PY = findPython(); // C14.7: no `sh`, see python-probe.mjs
const skip = !PY && 'no python3';
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const { main } = await imp('packages/chicla-kit/src/cli.mjs');
const { emergencyDump, renderEmergencyDump } = await imp('scripts/emergency-dump.mjs');

const T = mkdtempSync(join(tmpdir(), 'chicla-c111e-'));
after(() => rmSync(T, { recursive: true, force: true }));
let n = 0;
const AWS = `AKIA${'ABCDEFGHIJKLMNOP'}`;
const RECOVER = ['baseline.mjs', 'manifest.mjs', 'policy.mjs', 'recovery-report.mjs', 'zipkit.mjs'].map((f) => `RECOVER/${f}`);

/** A working directory: a project in work/chicla (NO scripts/ folder: the toolchain comes from the kit), a scratch file beside it, and an empty out/. */
const space = ({ project = true, extra = {} } = {}) => {
  const base = join(T, `s${n++}`), work = join(base, 'work'), out = join(base, 'out');
  const put = (rel, text) => { mkdirSync(dirname(join(work, rel)), { recursive: true }); writeFileSync(join(work, rel), text); };
  if (project) {
    put('chicla/package.json', '{"name":"p","private":true,"version":"0.0.7"}\n'); put('chicla/FILES.manifest', 'a.txt\n'); put('chicla/a.txt', 'a\n');
    put('chicla/CHANGELOG.md', '<!-- CHANGELOG_FINGERPRINT: seq=7 -->\n# Changelog\n\n## Round 3 — x\n');
    put('chicla/CHICLA_PROJECT_STATUS-7.md', '# Status\n');
  } else put('lonely.txt', 'x\n');
  put('scratch.txt', 'scratch\n');
  for (const [rel, text] of Object.entries(extra)) put(rel, text);
  mkdirSync(out, { recursive: true });
  return { base, work, out };
};
/** Reads a zip with Python's zipfile: { names, marker, tested }. */
const read = (zip) => {
  const code = 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({"names":z.namelist(),"marker":json.loads(z.read("RECOVERY_MARKER.json")),"tested":z.testzip() is None,"report":z.read("RECOVERY_REPORT.md").decode()}))';
  const r = spawnSync(PY, ['-c', code, zip], { encoding: 'utf8', maxBuffer: 1 << 26 }); assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout); return { ...o, names: new Set(o.names) };
};
const zips = (out) => readdirSync(out).filter((f) => f.endsWith('.zip'));
const run = async (args, cwd = T) => {
  let out = '', err = '';
  const status = await main(args, { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd });
  return { status, out, err };
};
/** The text with what differs between two runs (folder, stamped name, size) made equal. */
const norm = (text, ...dirs) => dirs.reduce((t, d) => t.split(d).join('<out>'), text).replace(/chicla-EMERGENCY-[^\s/]*\.zip/g, '<zip>').replace(/\(\d+(\.\d)? (KB|MB)\)/g, '(<size>)');

test('core: emergencyDump makes the zip and returns the facts', { skip }, async () => {
  const { work, out } = space();
  const r = await emergencyDump({ work, outdir: out, note: 'core note' });
  assert.equal(r.ok, true); assert.equal(r.code, null);
  assert.equal(dirname(r.path), out); assert.match(basename(r.path), /^chicla-EMERGENCY-afterRound3-\d{4}-\d{2}-\d{2}-\d{6}\.zip$/);
  assert.ok(existsSync(r.path)); assert.equal(r.projectFiles, 5); assert.equal(r.projectOnly, false);
  assert.ok(Array.isArray(r.messages) && r.messages.length > 0, 'the text is data, in messages');
  const z = read(r.path);
  assert.equal(z.tested, true, 'an independent reader accepts the zip');
  for (const f of ['RECOVERY_MARKER.json', 'RECOVERY_REPORT.md', ...RECOVER, 'work/chicla/a.txt', 'work/chicla/FILES.manifest', 'work/scratch.txt']) assert.ok(z.names.has(f), f);
  assert.equal(z.marker.note, 'core note'); assert.equal(z.marker.format, 'chicla-recovery-v1'); assert.equal(z.marker.projectRootRel, 'chicla'); assert.equal(z.marker.afterRound, '3');
});

test('core: importing the script and calling the core prints nothing and never exits (checked in a child process), for a dump and for a refusal', { skip }, () => {
  for (const projectOnly of [false, true]) {
    const { work, out } = space({ project: false });
    const code = `import(${JSON.stringify(pathToFileURL(SCRIPT).href)}).then(async (m) => { const r = await m.emergencyDump(${JSON.stringify({ work, outdir: out, projectOnly })}); process.stderr.write(''); process.exitCode = r.ok ? 0 : 7; });`;
    const c = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', cwd: T });
    assert.equal(c.stdout, '', 'stdout stays empty'); assert.equal(c.stderr, '', 'stderr stays empty');
    assert.equal(c.status, projectOnly ? 7 : 0, 'it came back with the result instead of exiting (a refusal is 7 here, our own code)');
    assert.equal(zips(out).length, projectOnly ? 0 : 1);
  }
});

test('core: projectOnly keeps the project and leaves the scratch files out', { skip }, async () => {
  const { work, out } = space();
  const r = await emergencyDump({ work, outdir: out, projectOnly: true });
  assert.equal(r.ok, true); assert.equal(r.projectOnly, true);
  const z = read(r.path);
  assert.ok(z.names.has('work/chicla/a.txt')); assert.ok(!z.names.has('work/scratch.txt'), 'scratch stays out');
  assert.equal(z.marker.projectOnly, true);
});

test('core: projectOnly with no project root refuses with a code, makes NO zip, and does not exit or throw', async () => {
  const { work, out } = space({ project: false });
  const r = await emergencyDump({ work, outdir: out, projectOnly: true });
  assert.equal(r.ok, false); assert.equal(r.code, 'EDUMP_NO_PROJECT'); assert.equal(r.path, null);
  assert.deepEqual(zips(out), []);
  assert.ok(r.messages.some((m) => m.stream === 'err'), 'the refusal is told on the error stream');
  const plain = await emergencyDump({ work, outdir: out });
  assert.equal(plain.ok, true, 'a plain dump of a directory with no project still works (D59)');
});

test('core: a file whose content looks like a secret is held back, and the match never appears', { skip }, async () => {
  const { work, out } = space({ extra: { 'chicla/key.txt': `${AWS}\n` } });
  const r = await emergencyDump({ work, outdir: out });
  const z = read(r.path);
  assert.ok(!z.names.has('work/chicla/key.txt'));
  assert.deepEqual(z.marker.secretsHeld, [{ path: 'work/chicla/key.txt', kind: 'AWS access key' }]);
  assert.deepEqual(r.held, z.marker.secretsHeld);
  assert.ok(!JSON.stringify(r).includes(AWS) && !z.report.includes(AWS), 'name and kind only');
});

test('cli: `dump` makes the zip, exits 0, and prints the same text as the script (parity)', { skip }, async () => {
  const a = space(), b = space();
  const r = await run(['dump', 'one', 'note', '--root', a.work, '--outdir', a.out]);
  assert.equal(r.status, 0);
  assert.equal(zips(a.out).length, 1);
  const s = spawnSync(process.execPath, [SCRIPT, '--work', b.work, '--outdir', b.out, 'one', 'note'], { encoding: 'utf8' });
  assert.equal(s.status, 0);
  assert.equal(norm(r.out, a.out), norm(s.stdout, b.out), 'stdout is the same');
  assert.equal(norm(r.err, a.out), norm(s.stderr, b.out), 'stderr is the same');
  assert.match(r.out, /EMERGENCY DUMP CREATED/);
  assert.equal(read(join(a.out, zips(a.out)[0])).marker.note, 'one note', 'the words after the command are the note');
});

test('cli: --note gives the note, and `--root` defaults to the current folder', { skip }, async () => {
  const { work, out } = space();
  const r = await run(['dump', '--note', 'by flag', '--outdir', out], work);
  assert.equal(r.status, 0);
  const z = read(join(out, zips(out)[0]));
  assert.equal(z.marker.note, 'by flag'); assert.ok(z.names.has('work/chicla/a.txt'), 'the current folder was dumped');
});

test('cli: --json writes ONE object on stdout (no messages key) and the human text on stderr', { skip }, async () => {
  const { work, out } = space();
  const r = await run(['dump', '--json', '--root', work, '--outdir', out, 'n']);
  assert.equal(r.status, 0);
  const o = JSON.parse(r.out); assert.equal(r.out.trim().split('\n').length, 1);
  assert.equal(o.ok, true); assert.equal(o.command, 'dump'); assert.equal(o.code, null); assert.equal(o.path, join(out, zips(out)[0])); assert.equal(o.projectFiles, 5);
  assert.ok(!('messages' in o)); assert.match(r.err, /EMERGENCY DUMP CREATED/);
});

test('cli: --project-only keeps the project only; with no project it exits 1 with EDUMP_NO_PROJECT and makes no zip', { skip }, async () => {
  const a = space(), b = space({ project: false });
  const ok = await run(['dump', '--project-only', '--root', a.work, '--outdir', a.out]);
  assert.equal(ok.status, 0);
  const z = read(join(a.out, zips(a.out)[0])); assert.ok(!z.names.has('work/scratch.txt')); assert.equal(z.marker.projectOnly, true);
  const no = await run(['dump', '--project-only', '--json', '--root', b.work, '--outdir', b.out]);
  assert.equal(no.status, 1); const o = JSON.parse(no.out); assert.equal(o.ok, false); assert.equal(o.code, 'EDUMP_NO_PROJECT');
  assert.deepEqual(zips(b.out), []);
  const plain = await run(['dump', '--json', '--root', b.work, '--outdir', b.out]);
  assert.equal(plain.status, 0, 'and a plain dump is the offered way out');
});

test('cli: usage errors exit 2 with EUSAGE (unknown option, a value missing)', async () => {
  const { work, out } = space();
  for (const args of [['dump', '--bogus'], ['dump', '--outdir'], ['dump', '--root'], ['dump', '--note']]) {
    const r = await run([...args, '--json', ...(args.includes('--root') ? [] : ['--root', work])]);
    assert.equal(r.status, 2, args.join(' ')); assert.equal(JSON.parse(r.out).code, 'EUSAGE', args.join(' '));
  }
  assert.deepEqual(zips(out), []);
  assert.match((await run(['--help'])).out, /\bdump\b/, 'the help lists dump');
});

test('an unexpected error (an output folder that cannot be created) comes back as EDUMP_ERROR: the core does not throw, the CLI exits 1, nothing is made', async () => {
  const { work, base } = space();
  const blocker = join(base, 'a-file'); writeFileSync(blocker, 'not a folder\n');
  const r = await emergencyDump({ work, outdir: join(blocker, 'out') });
  assert.equal(r.ok, false); assert.equal(r.code, 'EDUMP_ERROR'); assert.equal(r.path, null);
  assert.ok(r.messages.some((m) => m.stream === 'err' && m.text.includes('EDUMP_ERROR')));
  const c = await run(['dump', '--json', '--root', work, '--outdir', join(blocker, 'out')]);
  assert.equal(c.status, 1); assert.equal(JSON.parse(c.out).code, 'EDUMP_ERROR');
});
