// C4.4 (round 40), written before the code. D35 (confirmed by Rodrigo): `create` refuses an existing output unless `--overwrite`, as `extract` does;
// and help: `--help` (anywhere before `--`) or `-h` as the first argument exits 0 with the usage on stdout (with `--json`: one line).
// A refusal is exit 1 with code EEXIST, writes nothing and leaves what was there byte for byte. Assertions use exit codes and error `code`s.
import { listZip } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, readdirSync, symlinkSync, existsSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'zipkit.mjs');
let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-c44-')); });
after(() => { rmSync(base, { recursive: true, force: true }); });
const fresh = () => { const d = join(base, `t${n++}`); mkdirSync(d); return d; };
const run = (...args) => {
  const r = spawnSync(process.execPath, [SRC, ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C.UTF-8' } });
  return { code: r.status, text: r.stdout.toString('utf8'), etext: r.stderr.toString('utf8') };
};
const oneJson = (r) => { const lines = r.text.split('\n').filter(Boolean); assert.equal(lines.length, 1, r.text); return JSON.parse(lines[0]); };
const tree = () => { const root = join(fresh(), 'src'); mkdirSync(root); writeFileSync(join(root, 'a.txt'), 'alpha'); return root; };
const names = (p) => listZip(p).entries.map((e) => e.name).sort();

// ---------- D35 ----------
test('create: an existing output is refused with EEXIST (exit 1), nothing changes; text and json', () => {
  const root = tree(), out = join(fresh(), 'out.zip'), old = buildZip([{ name: 'old.txt', data: 'old' }]); writeFileSync(out, old);
  let r = run('create', out, root); assert.equal(r.code, 1); assert.equal(r.text, ''); assert.match(r.etext, /^✗ /);
  assert.ok(readFileSync(out).equals(old), 'the old zip is untouched');
  r = run('create', out, root, '--json'); assert.equal(r.code, 1); assert.equal(r.etext, ''); assert.deepEqual([oneJson(r).ok, oneJson(r).error.code], [false, 'EEXIST']);
  r = run('create', out, root, '--stream'); assert.equal(r.code, 1, '--stream is refused too'); assert.ok(readFileSync(out).equals(old));
  assert.deepEqual(readdirSync(dirname(out)), ['out.zip'], 'no .partial left');
});

test('create --overwrite: replaces the existing output (plain and --stream), exit 0', () => {
  const root = tree(), out = join(fresh(), 'out.zip'); writeFileSync(out, buildZip([{ name: 'old.txt', data: 'old' }]));
  assert.equal(run('create', out, root, '--overwrite').code, 0); assert.deepEqual(names(out), ['a.txt']);
  writeFileSync(out, buildZip([{ name: 'old.txt', data: 'old' }]));
  assert.equal(run('create', out, root, '--overwrite', '--stream', '--json').code, 0); assert.deepEqual(names(out), ['a.txt']);
});

test('create: a new output still works without --overwrite; --overwrite on a new output is harmless', () => {
  const root = tree();
  assert.equal(run('create', join(fresh(), 'new.zip'), root).code, 0);
  assert.equal(run('create', join(fresh(), 'new2.zip'), root, '--overwrite').code, 0);
});

test('create: anything else at the output path is refused too (a folder, a symlink even when dangling), and --overwrite does not follow the link', () => {
  const root = tree(), d = fresh(), dir = join(d, 'adir'); mkdirSync(dir);
  assert.equal(run('create', dir, root, '--json').code, 1); assert.equal(oneJson(run('create', dir, root, '--json')).error.code, 'EEXIST');
  const link = join(d, 'link.zip'), victim = join(d, 'victim.txt'); symlinkSync(victim, link); // dangling
  assert.equal(oneJson(run('create', link, root, '--json')).error.code, 'EEXIST'); assert.ok(!existsSync(victim));
  writeFileSync(victim, 'precious'); const r = run('create', link, root, '--overwrite');
  assert.equal(readFileSync(victim, 'utf8'), 'precious', 'the file behind the link is never written through');
  assert.equal(r.code, 0); assert.ok(lstatSync(link).isFile(), 'the link itself was replaced by the zip (rename), not written through');
});

test('create: the other options still do not take --overwrite where it makes no sense; extract and mark behave as before', () => {
  const z = join(fresh(), 'a.zip'); writeFileSync(z, buildZip([{ name: 'a.txt', data: 'x' }]));
  assert.equal(run('ls', z, '--overwrite').code, 2); assert.equal(run('mark', z, '--overwrite').code, 2);
  assert.equal(run('extract', z, join(fresh(), 'o'), '--overwrite').code, 0);
});

// ---------- help ----------
test('--help: exit 0, the usage on stdout, stderr empty, nothing created; also after a command or with other arguments', () => {
  for (const args of [['--help'], ['-h'], ['ls', '--help'], ['create', '--help'], ['extract', 'x.zip', 'dest', '--help'], ['--help', 'bogus']]) {
    const r = run(...args); assert.equal(r.code, 0, JSON.stringify(args)); assert.equal(r.etext, ''); assert.match(r.text, /usage/i); assert.match(r.text, /create/);
  }
});

test('--help --json: one JSON line with the usage', () => {
  const j = oneJson(run('--help', '--json')); assert.equal(j.ok, true); assert.equal(j.command, 'help'); assert.match(j.usage, /usage/i);
});

test('-h is only the help as the FIRST argument; elsewhere it is a name, and after `--` so is --help', () => {
  const z = join(fresh(), 'h.zip'); writeFileSync(z, buildZip([{ name: '-h', data: 'dash-h' }, { name: '--help', data: 'dash-help' }]));
  let r = run('cat', z, '-h'); assert.equal(r.code, 0); assert.equal(r.text, 'dash-h');
  r = run('cat', z, '--', '--help'); assert.equal(r.code, 0); assert.equal(r.text, 'dash-help');
});

test('no arguments, an unknown command and other usage errors are still exit 2 with the usage on stderr (help did not change them)', () => {
  for (const args of [[], ['frobnicate'], ['ls']]) { const r = run(...args); assert.equal(r.code, 2); assert.equal(r.text, ''); assert.match(r.etext, /usage/i); }
});
