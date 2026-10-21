// M14, C14.5 slice (a) (round 154, D98 and D108 confirmed), written before the code. The `windowsNames` option of the API (C14.2) gets its two command-line faces:
// (1) `extract` and `create` take `--windows-names` (= `windowsNames: true`, on any platform; without the flag the default stays «on only on win32»);
// (2) `test` reports the entry names that are not valid on Windows as a warning (text line and `warnings.windowsNames` in `--json`), on every platform, never changing the exit code.
// Assertions use exit codes, error `code`s, JSON fields and what is on disk, never message text (D18); the one text check is the marker of the warning line.
import { listZip, runCli } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZip } from './zipfab.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'zipkit.mjs');
let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-clwin-')); });
after(() => { rmSync(base, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const fresh = () => { const d = join(base, `t${n++}`); mkdirSync(d); return d; };
const zipOf = (entries) => { const p = join(fresh(), 'a.zip'); writeFileSync(p, buildZip(entries)); return p; };
const run = (...args) => {
  const r = spawnSync(process.execPath, [SRC, ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C.UTF-8' } });
  return { code: r.status, text: r.stdout.toString('utf8'), etext: r.stderr.toString('utf8') };
};
const oneJson = (r) => { const lines = r.text.split('\n').filter(Boolean); assert.equal(lines.length, 1, `expected one JSON line, got: ${r.text}`); return JSON.parse(lines[0]); };
const sinkOf = () => { let t = ''; const w = new Writable({ write(c, _e, cb) { t += c; cb(); } }); w.text = () => t; return w; };
const F = (name) => ({ name, data: 'some data' });
const BAD = ['nul.txt', 'dir/CON', 'a<b', 'name.', 'ab:stream', 'x/COM1.log'];
const GOOD = ['a.txt', 'dir/sub/b.txt', 'CONSOLE.txt'];
const onWin = process.platform === 'win32';

// ---------- extract --windows-names ----------
test('extract --windows-names refuses each bad name with EUNSAFE (exit 1) and writes NOTHING, beside good names; text and json', () => {
  for (const b of BAD) {
    const zip = zipOf([...GOOD, b].map(F)), dest = fresh();
    const t = run('extract', zip, dest, '--windows-names'); assert.equal(t.code, 1, b); assert.equal(t.text, ''); assert.match(t.etext, /^✗ /);
    const j = run('extract', zip, dest, '--windows-names', '--json'); assert.equal(j.code, 1, b); assert.equal(j.etext, '');
    assert.deepEqual([oneJson(j).ok, oneJson(j).error.code], [false, 'EUNSAFE'], b);
    assert.deepEqual(readdirSync(dest), [], `nothing written for ${b}`);
  }
});

test('extract --windows-names extracts good names normally (exit 0), the flag may stand anywhere among the options', () => {
  const zip = zipOf(GOOD.map(F)), dest = fresh();
  const r = run('extract', zip, '--windows-names', dest, '--json'); assert.equal(r.code, 0, r.etext); assert.equal(oneJson(r).files, GOOD.length);
  assert.ok(existsSync(join(dest, 'dir', 'sub', 'b.txt')));
});

test('extract without the flag: the platform decides (win32 refuses, elsewhere the names are extracted as before)', () => {
  const zip = zipOf(['nul.txt', 'x/COM1.log'].map(F)), dest = fresh();
  const r = run('extract', zip, dest, '--json');
  if (onWin) { assert.equal(r.code, 1); assert.equal(oneJson(r).error.code, 'EUNSAFE'); } else { assert.equal(r.code, 0, r.etext); assert.equal(oneJson(r).files, 2); }
});

test('extract --windows-names combines with --overwrite and --max-bytes (the other options still count)', () => {
  const zip = zipOf(GOOD.map(F)), dest = fresh();
  assert.equal(run('extract', zip, dest, '--windows-names', '--max-bytes', '1').code, 1, 'the size limit still applies');
  assert.equal(run('extract', zip, fresh(), '--windows-names', '--overwrite', '--max-bytes', '1000000').code, 0);
});

// ---------- create --windows-names ----------
const treeOf = (names) => { const root = join(fresh(), 'src'); mkdirSync(root); for (const nm of names) { mkdirSync(dirname(join(root, nm)), { recursive: true }); writeFileSync(join(root, nm), 'x'); } return root; };

test('create --windows-names refuses a Windows-unsafe file name with EUNSAFE (exit 1) and leaves no output, plain and --stream', { skip: onWin && 'the test tree itself needs names Windows cannot create' }, () => {
  for (const b of BAD) {
    const root = treeOf(['ok.txt', b]);
    for (const extra of [[], ['--stream']]) {
      const out = join(fresh(), 'out.zip'), r = run('create', out, root, '--windows-names', '--json', ...extra);
      assert.equal(r.code, 1, `${b} ${extra}`); assert.equal(r.etext, ''); assert.deepEqual([oneJson(r).ok, oneJson(r).error.code], [false, 'EUNSAFE'], b);
      assert.deepEqual(readdirSync(dirname(out)), [], `no output and no .partial for ${b} ${extra}`);
    }
  }
});

test('create --windows-names with good names writes the zip (exit 0); without the flag the names go in as before off Windows', { skip: onWin && 'the test tree itself needs names Windows cannot create' }, () => {
  let out = join(fresh(), 'good.zip'); assert.equal(run('create', out, treeOf(GOOD), '--windows-names').code, 0);
  assert.deepEqual(listZip(out).entries.filter((e) => !e.isDir).map((e) => e.name).sort(), [...GOOD].sort());
  out = join(fresh(), 'bad.zip'); const r = run('create', out, treeOf(['nul.txt', 'x/COM1.log']), '--json'); assert.equal(r.code, 0, r.etext); assert.equal(oneJson(r).entries >= 2, true);
});

// ---------- usage ----------
test('--windows-names belongs to extract and create only: ls, test, cat and mark refuse it as an unknown option (exit 2, EUSAGE); the usage line names it for both commands', () => {
  const zip = zipOf(GOOD.map(F));
  for (const args of [['ls', zip], ['test', zip], ['cat', zip, 'a.txt'], ['mark', zip]]) {
    const r = run(...args, '--windows-names'); assert.equal(r.code, 2, args[0]);
  }
  const j = run('ls', zip, '--windows-names', '--json'); assert.equal(oneJson(j).error.code, 'EUSAGE');
  const help = run('--help').text; assert.match(help, /extract [^·]*--windows-names/); assert.match(help, /create [^·]*--windows-names/);
});

// ---------- test: the warning ----------
test('test --json lists the names that are not valid on Windows in warnings.windowsNames (every platform, complete list, exit 0); good names give []', () => {
  const j = oneJson(run('test', zipOf([...GOOD, ...BAD].map(F)), '--json'));
  assert.equal(j.ok, true); assert.deepEqual([...j.warnings.windowsNames].sort(), [...BAD].sort());
  assert.deepEqual(oneJson(run('test', zipOf(GOOD.map(F)), '--json')).warnings.windowsNames, []);
});

test('test --json: a folder entry is checked without its trailing slash, and the unsafe-name and Windows lists are separate', () => {
  const p = zipOf([{ name: 'nul/', dir: true }, F('ok.txt'), F('../evil.txt'), F('e:/x')]);
  const w = oneJson(run('test', p, '--json')).warnings;
  assert.ok(w.windowsNames.includes('nul/'), 'the folder nul/ is a reserved name'); assert.ok(!w.windowsNames.includes('ok.txt'));
  assert.deepEqual(w.unsafeNames.includes('../evil.txt'), true); assert.equal(w.windowsNames.includes('../evil.txt'), false, '.. is not this check\'s business (it is the unsafe-name warning)');
});

test('test (text): one line « ! N name(s) not valid on Windows » when there is a hit, none when there is not; the exit code stays 0', () => {
  const t = run('test', zipOf([...GOOD, 'nul.txt', 'a<b'].map(F)));
  assert.equal(t.code, 0); assert.match(t.text, /^! 2 name\(s\) not valid on Windows/m);
  const ok = run('test', zipOf(GOOD.map(F))); assert.equal(ok.code, 0); assert.doesNotMatch(ok.text, /Windows/);
});

test('test (text): the Windows line shows at most five names, escaped like the other warnings (a control character never reaches the terminal)', () => {
  const p = zipOf([F('bad\u001b[2Jname?'), ...Array.from({ length: 8 }, (_, i) => F(`nul.${i}`))]);
  const t = run('test', p); assert.equal(t.code, 0); assert.ok(!t.text.includes('\u001b'), 'no raw ESC in the output');
  const line = t.text.split('\n').find((l) => /not valid on Windows/.test(l)); assert.ok(line, 'the line exists');
  assert.ok(line.split(', ').length <= 5, `at most five names in: ${line}`);
  assert.ok(line.includes('\\x1b'), `the ESC shows as \\x1b in: ${line}`);
});

test('runCli: the same flags through the exported entry point (extract, create, test) with injected streams', async () => {
  const zip = zipOf(['nul.txt'].map(F)), out = sinkOf(), err = sinkOf();
  assert.equal(await runCli(['extract', zip, fresh(), '--windows-names', '--json'], { out, err }), 1); assert.equal(JSON.parse(out.text()).error.code, 'EUNSAFE');
  const o2 = sinkOf(); assert.equal(await runCli(['test', zip, '--json'], { out: o2, err: sinkOf() }), 0); assert.deepEqual(JSON.parse(o2.text()).warnings.windowsNames, ['nul.txt']);
});
