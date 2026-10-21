// C4.2a (round 36, D34), written before the code: the command line of zipkit.mjs, first slice. `ls`, `test` and `cat` get `--json` and fixed exit codes;
// `extract` and `mark` keep working (guarded here) and take the same exit codes; `--json` on them (and `create`) is the next slice (C4.2b) and is a usage error now.
// Contract under test (D34, proposed): exit 0 ok · 1 the command ran and failed (any ZipError: not a zip, CRC, missing entry, extraction refused) · 2 usage
// · 3 internal error (anything that is not a ZipError). With `--json` exactly ONE line of JSON goes to stdout, `{ ok: true, command, ... }` or
// `{ ok: false, error: { code, message } }`, and stderr stays empty; without it errors go to stderr as «✗ message» and stdout stays empty.
// `cat` writes the raw bytes and nothing else, so it has no `--json` (usage error). Warnings (unsafe names, missing UTF-8 flag) never change the exit code.
// Assertions use exit codes and error `code`s, never message text. Real child processes, so exit codes and stdout bytes are the real ones.
import { runCli, writeZip } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZip } from './zipfab.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'zipkit.mjs');
let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-cli-')); });
after(() => { rmSync(base, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const fresh = () => { const d = join(base, `t${n++}`); mkdirSync(d); return d; };
const zipOf = (entries, opts) => { const p = join(fresh(), 'a.zip'); writeFileSync(p, buildZip(entries, opts)); return p; };
const run = (...args) => {
  const r = spawnSync(process.execPath, [SRC, ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C.UTF-8' } });
  return { code: r.status, out: r.stdout, err: r.stderr, text: r.stdout.toString('utf8'), etext: r.stderr.toString('utf8') };
};
const oneJson = (r) => { const lines = r.text.split('\n').filter(Boolean); assert.equal(lines.length, 1, `expected one JSON line, got: ${r.text}`); assert.ok(r.text.endsWith('\n')); return JSON.parse(lines[0]); };
const good = () => zipOf([{ name: 'hello.txt', data: 'hello world, hello world', method: 8 }, { name: 'dir/', dir: true }, { name: 'dir/b.txt', data: 'bee' }]);

// ---------- ls ----------
test('ls: text output lists every entry with its size, exit 0, nothing on stderr', () => {
  const r = run('ls', good());
  assert.equal(r.code, 0); assert.equal(r.etext, '');
  assert.match(r.text, /hello\.txt/); assert.match(r.text, /dir\/b\.txt/); assert.match(r.text, /\b24\b/);
});

test('ls --json: one JSON line with the entries and their facts, exit 0, stderr empty', () => {
  const r = run('ls', good(), '--json'); assert.equal(r.code, 0); assert.equal(r.etext, '');
  const j = oneJson(r);
  assert.equal(j.ok, true); assert.equal(j.command, 'ls'); assert.equal(j.entries.length, 3);
  const h = j.entries.find((e) => e.name === 'hello.txt');
  assert.equal(h.size, 24); assert.equal(h.method, 8); assert.equal(h.isDir, false); assert.equal(typeof h.csize, 'number');
  assert.match(h.crc32, /^[0-9a-f]{8}$/); assert.equal(h.nameSource, 'ascii'); assert.equal(h.flagMissing, false);
  assert.equal(j.entries.find((e) => e.name === 'dir/').isDir, true);
  assert.ok(!Number.isNaN(Date.parse(h.mtime)), 'mtime is an ISO date');
});

test('ls --json: a non-ASCII name without the UTF-8 flag says so (nameSource and flagMissing)', () => {
  const p = zipOf([{ name: 'café.txt', data: 'x' }]); // no bit 11
  const e = oneJson(run('ls', p, '--json')).entries[0];
  assert.equal(e.name, 'café.txt'); assert.equal(e.flagMissing, true); assert.notEqual(e.nameSource, 'ascii');
  const t = run('ls', p); assert.match(t.text, /NO UTF-8 flag/);
});

test('ls --json: the CRC is always eight hex digits, leading zeros kept', () => {
  const p = zipOf([{ name: 'a.txt', data: 'abc', crc: 0x0000abcd }]);
  assert.equal(oneJson(run('ls', p, '--json')).entries[0].crc32, '0000abcd');
});

test('ls --json: the flag order does not matter', () => {
  const p = good();
  assert.equal(oneJson(run('--json', 'ls', p)).ok, true);
});

test('ls: a file that does not exist is exit 1, «✗» on stderr, stdout empty', () => {
  const r = run('ls', join(fresh(), 'nope.zip'));
  assert.equal(r.code, 1); assert.equal(r.text, ''); assert.match(r.etext, /^✗ /);
});

test('ls --json: a file that does not exist is exit 1, ok:false with a code, stderr empty', () => {
  const r = run('ls', join(fresh(), 'nope.zip'), '--json'); assert.equal(r.code, 1); assert.equal(r.etext, '');
  const j = oneJson(r); assert.equal(j.ok, false); assert.equal(typeof j.error.code, 'string'); assert.equal(typeof j.error.message, 'string');
});

test('ls --json: not a zip is exit 1 with the reader\'s code', () => {
  const p = join(fresh(), 'x.zip'); writeFileSync(p, 'this is not a zip file at all, just text');
  const r = run('ls', p, '--json'); assert.equal(r.code, 1);
  const j = oneJson(r); assert.equal(j.ok, false); assert.equal(j.error.code, 'ENOTZIP');
});

// ---------- test ----------
test('test: a good zip is exit 0 with the count and bytes', () => {
  const r = run('test', good()); assert.equal(r.code, 0); assert.equal(r.etext, '');
  assert.match(r.text, /✓ 2 file\(s\), 27 bytes/);
});

test('test --json: files, bytes and empty warnings', () => {
  const r = run('test', good(), '--json'); assert.equal(r.code, 0); assert.equal(r.etext, '');
  const j = oneJson(r);
  assert.deepEqual(j, { ok: true, command: 'test', files: 2, bytes: 27, warnings: { unsafeNames: [], missingUtf8Flag: [], windowsNames: [] } });
});

test('test: a wrong CRC is exit 1 (text: «✗» on stderr; json: ok:false and a code)', () => {
  const p = zipOf([{ name: 'a.txt', data: 'abcdef', crc: 0x12345678 }]);
  const t = run('test', p); assert.equal(t.code, 1); assert.match(t.etext, /^✗ /); assert.doesNotMatch(t.text, /✓/);
  const r = run('test', p, '--json'); assert.equal(r.code, 1); assert.equal(r.etext, '');
  const j = oneJson(r); assert.equal(j.ok, false); assert.equal(typeof j.error.code, 'string');
});

test('test: warnings (unsafe name, missing UTF-8 flag) are reported and do NOT change the exit code', () => {
  const p = zipOf([{ name: '../evil.txt', data: 'x' }, { name: 'café.txt', data: 'y' }, { name: 'ok.txt', data: 'z' }]);
  const t = run('test', p); assert.equal(t.code, 0); assert.match(t.text, /unsafe name/); assert.match(t.text, /UTF-8 flag/);
  const j = oneJson(run('test', p, '--json'));
  assert.equal(j.ok, true); assert.deepEqual(j.warnings.unsafeNames, ['../evil.txt']); assert.deepEqual(j.warnings.missingUtf8Flag, ['café.txt']);
});

test('test --json: the warning lists are complete, not cut at five like the text output', () => {
  const p = zipOf(Array.from({ length: 8 }, (_, i) => ({ name: `../e${i}.txt`, data: 'x' })));
  assert.equal(oneJson(run('test', p, '--json')).warnings.unsafeNames.length, 8);
});

// ---------- cat ----------
test('cat: the raw bytes of one file and nothing else (all 256 byte values survive)', () => {
  const data = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const p = zipOf([{ name: 'bin.dat', data, method: 8 }]);
  const r = run('cat', p, 'bin.dat'); assert.equal(r.code, 0); assert.equal(r.etext, ''); assert.ok(r.out.equals(data));
});

test('cat: an empty file gives empty stdout and exit 0', () => {
  const r = run('cat', zipOf([{ name: 'e.txt', data: '' }]), 'e.txt'); assert.equal(r.code, 0); assert.equal(r.out.length, 0);
});

test('cat: a name that is not in the zip is exit 1, nothing on stdout', () => {
  const r = run('cat', good(), 'missing.txt'); assert.equal(r.code, 1); assert.equal(r.out.length, 0); assert.match(r.etext, /^✗ /);
});

test('cat: a file larger than the pipe buffer arrives whole', () => {
  const data = Buffer.alloc(3 * 1024 * 1024, 'abcdefghij');
  const p = zipOf([{ name: 'big.txt', data, method: 8 }]);
  const r = run('cat', p, 'big.txt'); assert.equal(r.code, 0); assert.ok(r.out.equals(data));
});

test('cat has no --json: usage error, exit 2, and a JSON error line only because --json was asked', () => {
  const r = run('cat', good(), 'hello.txt', '--json'); assert.equal(r.code, 2); assert.equal(r.etext, '');
  const j = oneJson(r); assert.equal(j.ok, false); assert.equal(j.error.code, 'EUSAGE');
});

// ---------- usage ----------
test('usage: no arguments, an unknown command, a missing zip or name, an unknown flag: all exit 2 with stderr and empty stdout', () => {
  const z = good();
  for (const args of [[], ['frobnicate', z], ['ls'], ['test'], ['cat', z], ['extract', z], ['ls', z, '--bogus'], ['test', z, '--bogus'], ['cat', z, 'hello.txt', '--bogus'], ['ls', z, 'extra'], ['test', z, 'extra'], ['mark', z, 'extra'], ['extract', z, 'o', 'extra'], ['extract', z, 'o', '--max-bytes'], ['extract', z, 'o', '--max-bytes', 'abc'], ['constructor', z]]) {
    const r = run(...args); assert.equal(r.code, 2, `args ${JSON.stringify(args)}`); assert.equal(r.text, ''); assert.match(r.etext, /usage/i);
  }
});

test('usage with --json: one JSON line with code EUSAGE, stderr empty', () => {
  for (const args of [['frobnicate', 'x', '--json'], ['ls', '--json'], ['--json']]) {
    const r = run(...args); assert.equal(r.code, 2, `args ${JSON.stringify(args)}`); assert.equal(r.etext, '');
    const j = oneJson(r); assert.equal(j.ok, false); assert.equal(j.error.code, 'EUSAGE');
  }
});

// ---------- extract and mark: behaviour kept, exit codes added, --json not yet ----------
test('extract: still extracts, exit 0; the files are on disk', () => {
  const d = join(fresh(), 'out'), r = run('extract', good(), d);
  assert.equal(r.code, 0); assert.match(r.text, /2 file\(s\)/);
  assert.equal(readFileSync(join(d, 'hello.txt'), 'utf8'), 'hello world, hello world'); assert.ok(existsSync(join(d, 'dir', 'b.txt')));
});

test('extract: a refusal (unsafe name) is exit 1 and nothing is written', () => {
  const d = join(fresh(), 'out'), r = run('extract', zipOf([{ name: '../evil.txt', data: 'x' }]), d);
  assert.equal(r.code, 1); assert.match(r.etext, /^✗ /); assert.ok(!existsSync(d));
});

test('extract: --overwrite and --max-bytes still work', () => {
  const z = good(), d = join(fresh(), 'out');
  assert.equal(run('extract', z, d).code, 0);
  assert.equal(run('extract', z, d).code, 1, 'second time: EEXIST');
  assert.equal(run('extract', z, d, '--overwrite').code, 0);
  assert.equal(run('extract', z, join(fresh(), 'o2'), '--max-bytes', '5').code, 1, 'over the limit');
});

test('mark: marks a non-ASCII name, exit 0, and `ls --json` then shows the flag', () => {
  const p = zipOf([{ name: 'café.txt', data: 'x' }]);
  const r = run('mark', p); assert.equal(r.code, 0); assert.match(r.text, /1 of 1/);
  assert.equal(oneJson(run('ls', p, '--json')).entries[0].flagMissing, false);
});

test('mark and extract take --json since C4.2b (tests in cli-create.test.mjs); cat still does not', () => {
  const z = good();
  for (const args of [['mark', z, '--json'], ['extract', z, join(fresh(), 'o'), '--json']]) assert.equal(oneJson(run(...args)).ok, true);
  assert.equal(run('cat', z, 'hello.txt', '--json').code, 2);
});

// ---------- runCli in process ----------
const sinkOf = () => { const parts = []; return { write: (c) => { parts.push(Buffer.from(c)); return true; }, text: () => Buffer.concat(parts).toString('utf8') }; };

test('runCli returns the exit code and never ends the process', async () => {
  const out = sinkOf(), err = sinkOf();
  assert.equal(await runCli(['ls', good(), '--json'], { out, err }), 0); assert.equal(JSON.parse(out.text()).ok, true); assert.equal(err.text(), '');
  const o2 = sinkOf(), e2 = sinkOf();
  assert.equal(await runCli(['ls'], { out: o2, err: e2 }), 2); assert.equal(o2.text(), ''); assert.match(e2.text(), /usage/i);
});

test('runCli: something that is not a ZipError is exit 3 (internal error), with the stack on stderr, or ok:false INTERNAL in json', async () => {
  const boom = { write() { throw new TypeError('boom'); } };
  const err = sinkOf(); assert.equal(await runCli(['ls', good()], { out: boom, err }), 3); assert.match(err.text(), /boom/);
  let first = true; const once = { write(c) { if (first) { first = false; throw new TypeError('boom'); } return true; }, text: () => '' };
  assert.equal(await runCli(['ls', good(), '--json'], { out: once, err: sinkOf() }), 3);
});

test('runCli: a zip written by writeZip is listed and tested through the same entry point (independent of the zipfab helper)', async () => {
  const p = join(fresh(), 'w.zip'); await writeZip(p, [{ name: 'é.txt', data: Buffer.from('written by Chicla') }]);
  const out = sinkOf(); assert.equal(await runCli(['test', p, '--json'], { out, err: sinkOf() }), 0);
  assert.deepEqual(JSON.parse(out.text()).warnings, { unsafeNames: [], missingUtf8Flag: [], windowsNames: [] });
});
