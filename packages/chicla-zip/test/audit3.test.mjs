// AUDIT-3 (end of M4), written before the fixes. Real bugs found by running the command line by hand:
//  A-1 a closed pipe (`ls zip | head`) crashed with an unhandled EPIPE stack trace;
//  A-2 no way to name a zip or an entry that starts with «--» (`cat z --flag.txt` was «unknown option»): `--` ends the options;
//  A-3 names from the zip went to the terminal raw: an entry called "evil\x1b]0;…" or "a\nfake line" could rewrite the title, clear the screen or fake output lines (a zip is hostile input);
//  A-4 `--max-bytes` took anything `Number()` accepts («0x10», «1e3», «», «-5»): only plain digits are a size.
// Assertions use exit codes and error `code`s; for A-3 they look at the bytes written, never at message wording.
import { buildZip } from './zipfab.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'zipkit.mjs');
let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-au3-')); });
after(() => { rmSync(base, { recursive: true, force: true }); });
const fresh = () => { const d = join(base, `t${n++}`); mkdirSync(d); return d; };
const zipOf = (entries, name = 'a.zip') => { const p = join(fresh(), name); writeFileSync(p, buildZip(entries)); return p; };
const run = (...args) => {
  const r = spawnSync(process.execPath, [SRC, ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C.UTF-8' } });
  return { code: r.status, out: r.stdout, text: r.stdout.toString('utf8'), etext: r.stderr.toString('utf8') };
};
const oneJson = (r) => { const lines = r.text.split('\n').filter(Boolean); assert.equal(lines.length, 1, r.text); return JSON.parse(lines[0]); };

// ---------- A-1 ----------
test('A-1 a reader that closes the pipe early: no stack trace, nothing on stderr, a non-zero code (ls and cat)', () => {
  const big = zipOf(Array.from({ length: 3000 }, (_, i) => ({ name: `file-number-${String(i).padStart(5, '0')}-with-a-long-name-to-fill-the-pipe.txt`, data: 'x' })));
  const cat = zipOf([{ name: 'big.bin', data: Buffer.alloc(3 * 1024 * 1024, 7) }]);
  for (const cmd of [`'${process.execPath}' '${SRC}' ls '${big}'`, `'${process.execPath}' '${SRC}' cat '${cat}' big.bin`, `'${process.execPath}' '${SRC}' ls '${big}' --json`]) {
    const r = spawnSync('bash', ['-c', `${cmd} 2>"$E" | head -c1 >/dev/null; c=\${PIPESTATUS[0]}; cat "$E" >&2; exit $c`], { encoding: 'utf8', env: { ...process.env, E: join(fresh(), 'err.txt') } });
    assert.equal(r.stderr, '', cmd); assert.equal(r.status, 1, cmd);
  }
});

// Windows reports a pipe closed by the reader as EOF (libuv UV_EOF) on Node 18 and 20, not EPIPE (CI round 151 log, C14.3 slice d).
// The preload makes the first write to stdout fail with that code, so it can be seen on any platform.
for (const code of ['EPIPE', 'EOF']) {
  test(`A-1 a write to stdout that fails with ${code} (the reader closed the pipe) ends quietly with exit 1`, () => {
    const pre = join(fresh(), 'preload.cjs');
    writeFileSync(pre, `const c = ${JSON.stringify(code)}; process.stdout.write = function () { setImmediate(() => process.stdout.emit('error', Object.assign(new Error(c), { code: c }))); return true; };\n`);
    const r = spawnSync(process.execPath, ['--require', pre, SRC, 'ls', zipOf([{ name: 'a.txt', data: 'x' }])], { encoding: 'utf8' });
    assert.equal(r.stderr, ''); assert.equal(r.status, 1);
  });
}

test('A-2 `--` is not a way to smuggle a command or the --json flag past the options', () => {
  assert.equal(run('--', 'ls', zipOf([{ name: 'a.txt', data: 'x' }])).code, 2, 'the command comes before «--»');
  assert.equal(run('--', 'ls').code, 2, 'nothing but «--» and a word that would be a command');
  const r = run('ls', '--', '--json'); // a zip called «--json» that does not exist: a plain failure, so text on stderr and nothing on stdout
  assert.equal(r.code, 1); assert.equal(r.text, ''); assert.match(r.etext, /^✗ /);
});

// ---------- A-2 ----------
test('A-2 `--` ends the options: an entry or a zip whose name starts with «--» can be reached', () => {
  const z = zipOf([{ name: '--flag.txt', data: 'dash' }, { name: '--json', data: 'j' }], '--weird.zip');
  let r = run('cat', z, '--', '--flag.txt'); assert.equal(r.code, 0); assert.equal(r.text, 'dash');
  r = run('cat', '--', z, '--json'); assert.equal(r.code, 0); assert.equal(r.text, 'j', '«--json» after «--» is a name, not the flag');
  const cwd = dirname(z); r = spawnSync(process.execPath, [SRC, 'ls', '--json', '--', '--weird.zip'], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).entries.length, 2);
});

test('A-2 `--` changes nothing else: without it an unknown option is still a usage error, and a missing argument after it is too', () => {
  const z = zipOf([{ name: 'a.txt', data: 'x' }]);
  assert.equal(run('cat', z, '--flag.txt').code, 2);
  assert.equal(run('cat', z, '--').code, 2, '«--» with nothing after it: the name is missing');
  assert.equal(run('ls', '--', z, 'extra').code, 2);
  assert.equal(run('ls', '--', z).code, 0);
});

// ---------- A-3 ----------
const HOSTILE = ['evil\x1b]0;PWNED\x07\x1b[2Jname.txt', 'nl\nfake: line.txt', 'cr\rover.txt', 'del\x7f.txt', 'c1\u009b31m.txt', 'bidi‮txt.exe', 'nul-free tab\tname.txt', 'sep\u2028line.txt', 'para\u2029graph.txt', 'iso\u2067late.txt'];
const rawBad = new RegExp(String.raw`[\x00-\x08\x0b-\x1a\x1c-\x1f\x7f\u0080-\u009f  ‪-‮⁦-⁩\r]|\x1b`, 'u'); // built from escapes: a literal U+2028 inside a regex literal would be a line break
const EXPECT_LINES = (r, n) => r.text.split('\n').filter(Boolean).length === n;

test('A-3 ls (text): no control, escape, C1 or bidi character reaches the terminal, and each entry is exactly one line', () => {
  const z = zipOf(HOSTILE.map((name) => ({ name, data: 'x', flags: 0x800 })));
  const r = run('ls', z); assert.equal(r.code, 0);
  assert.ok(!rawBad.test(r.text), JSON.stringify(r.text)); assert.ok(EXPECT_LINES(r, HOSTILE.length), JSON.stringify(r.text));
  assert.ok(r.text.includes('\\x1b'), 'the escape is shown, not dropped'); assert.ok(r.text.includes('fake: line.txt'), 'the readable part of a name stays');
});

test('A-3 ls --json keeps the real names (data, not display): they round-trip through JSON.parse', () => {
  const z = zipOf(HOSTILE.map((name) => ({ name, data: 'x', flags: 0x800 })));
  assert.deepEqual(oneJson(run('ls', z, '--json')).entries.map((e) => e.name), HOSTILE);
});

test('A-3 error text, `test` warnings and `extract` lines are cleaned too (stderr and stdout)', () => {
  const z = zipOf([{ name: 'a\x1b[31m.txt', data: '1', flags: 0x800 }, { name: 'A\x1b[31m.txt', data: '2', flags: 0x800 }, { name: '../up\x1b[2J', data: '3', flags: 0x800 }]);
  const t = run('test', z); assert.ok(!rawBad.test(t.text) && !rawBad.test(t.etext), JSON.stringify(t.text));
  const miss = run('cat', zipOf([{ name: 'a.txt', data: 'x' }]), 'nope\x1b[2J'); assert.equal(miss.code, 1); assert.ok(!rawBad.test(miss.etext), JSON.stringify(miss.etext));
  const ok = zipOf([{ name: 'a\x1b[31m.txt', data: '1', flags: 0x800 }, { name: 'A\x1b[31m.txt', data: '2', flags: 0x800 }]);
  const e = run('extract', ok, join(fresh(), 'o')); assert.ok(!rawBad.test(e.text) && !rawBad.test(e.etext), JSON.stringify(e.text + e.etext)); assert.match(e.text + e.etext, /\\x1b/);
});

test('A-3 the `test` warning for a name without the UTF-8 flag, symlink lines of `extract`, and usage errors are cleaned too', () => {
  const noflag = zipOf([{ name: 'é\x1b[2J.txt', data: 'x' }]);
  const t = run('test', noflag); assert.ok(/NO UTF-8|without the UTF-8 flag/.test(t.text), 'the warning exists'); assert.ok(!rawBad.test(t.text), JSON.stringify(t.text));
  const link = zipOf([{ name: 'ln\x1b[2J', data: 'target', mode: 0o120777, flags: 0x800 }]);
  const e = run('extract', link, join(fresh(), 'o')); assert.equal(e.code, 0); assert.match(e.text, /skipped/); assert.ok(!rawBad.test(e.text) && !rawBad.test(e.etext), JSON.stringify(e.text));
  const u = run('bogus\x1b[2J'); assert.equal(u.code, 2); assert.ok(!rawBad.test(u.etext), JSON.stringify(u.etext));
});

test('A-3 `cat` is still raw: its bytes are the file, whatever they are', () => {
  const data = Buffer.from([0x1b, 0x5b, 0x32, 0x4a, 0x0a, 0x00, 0x7f, 0xc2, 0x9b]);
  const r = run('cat', zipOf([{ name: 'raw.bin', data }]), 'raw.bin'); assert.equal(r.code, 0); assert.ok(r.out.equals(data));
});

// ---------- A-4 ----------
test('A-4 --max-bytes takes plain digits only: anything else is a usage error (exit 2, nothing extracted)', () => {
  const z = zipOf([{ name: 'a.txt', data: 'hello' }]);
  for (const v of ['-5', '', '0x10', '1e3', '1.5', ' 7', '+7', 'abc', 'Infinity', '9'.repeat(400)]) {
    const d = join(fresh(), 'out'), r = run('extract', z, d, '--max-bytes', v); assert.equal(r.code, 2, JSON.stringify(v)); assert.ok(!existsSync(d), JSON.stringify(v));
  }
  assert.equal(run('extract', z, join(fresh(), 'ok'), '--max-bytes', '5').code, 0);
  assert.equal(run('extract', z, join(fresh(), 'ok'), '--max-bytes', '4').code, 1, 'a real limit still refuses (4 < 5 bytes)');
});
