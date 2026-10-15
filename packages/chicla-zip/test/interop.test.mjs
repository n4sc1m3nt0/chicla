// C3.1: the interoperability harness is itself tested. A reader that can never fail proves nothing about the writer, so every
// reader is shown a good zip (made by independent tools: Python, Info-ZIP `zip`, the test fabricator) and then broken ones.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkZip } from './interop.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-interop-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const P = (ext = 'zip') => join(dir, `z${n++}.${ext}`);
const have = (cmd, ...a) => !spawnSync(cmd, a).error;
const TREE = { 'a.txt': 'hello', 'dir/': '', 'dir/b.bin': Buffer.alloc(70000, 7), 'é-ß.txt': 'unicode', 'empty': '' };
const REQUIRED = ['unzip', 'zipinfo', 'python', 'chicla'];

const pyZip = (tree, method) => {
  // the spec goes in a file: 93 000 characters in argv are over the Windows limit (32 767), and through stdin the macOS Node 18 job stood still (round 146)
  const p = P(), specFile = P('json');
  writeFileSync(specFile, JSON.stringify(Object.entries(tree).map(([k, v]) => [k, Buffer.from(v).toString('base64')])));
  const r = spawnSync('python3', ['-c', `import sys,json,base64,zipfile\nz=zipfile.ZipFile(sys.argv[1],'w',${method})\nfor k,v in json.load(open(sys.argv[2],encoding='utf-8')):\n    z.writestr(k,base64.b64decode(v))\nz.close()`, p, specFile], { timeout: 60000, env: { ...process.env, PYTHONUTF8: '1' } });
  assert.equal(r.status, 0, String(r.stderr) || String(r.error)); return p;
};

test('every required reader is installed here, and a zip made by Python is accepted by all of them', async () => {
  for (const method of ['zipfile.ZIP_STORED', 'zipfile.ZIP_DEFLATED']) {
    const c = await checkZip(pyZip(TREE, method), TREE);
    assert.deepEqual(c.problems, [], method);
    for (const t of REQUIRED) assert.ok(c.ran.includes(t), `${t} did not run`);
  }
});

test('a zip made by Info-ZIP `zip` and one made by the test fabricator are accepted too', async (t) => {
  const tree = { 'a.txt': 'hello', 'sub/b.txt': 'world' };
  const src = join(dir, 'src'); mkdirSync(join(src, 'sub'), { recursive: true }); writeFileSync(join(src, 'a.txt'), 'hello'); writeFileSync(join(src, 'sub/b.txt'), 'world');
  if (have('zip', '-v')) { const p = P(); assert.equal(spawnSync('zip', ['-qr', '-D', p, 'a.txt', 'sub/b.txt'], { cwd: src }).status, 0); assert.deepEqual((await checkZip(p, tree)).problems, []); }
  else t.diagnostic('`zip` not installed: that half did not run');
  const f = P(); writeFileSync(f, buildZip(Object.entries(TREE).map(([name, data]) => name.endsWith('/') ? { name, dir: true, flags: 0x800 } : { name, data, method: data.length ? 8 : 0, flags: 0x800 })));
  assert.deepEqual((await checkZip(f, TREE)).problems, []);
});

test('each reader fails on its own for a zip with a flipped data byte (stored, so the CRC is the only thing that notices)', async () => {
  const p = pyZip({ 'a.txt': 'x'.repeat(100) }, 'zipfile.ZIP_STORED'), b = readFileSync(p); b[b.indexOf('xxxx') + 10] ^= 0xff; writeFileSync(p, b);
  const c = await checkZip(p, { 'a.txt': 'x'.repeat(100) });
  for (const tool of ['unzip', 'python', 'chicla']) assert.equal(c.result[tool].ok, false, `${tool} accepted a corrupted file`);
});

test('each reader fails on its own for a truncated zip', async () => {
  const p = pyZip(TREE, 'zipfile.ZIP_DEFLATED'); writeFileSync(p, readFileSync(p).subarray(0, -30));
  const c = await checkZip(p, TREE);
  for (const tool of REQUIRED) assert.equal(c.result[tool].ok, false, `${tool} accepted a truncated zip`);
});

test('a zip that is valid but has other content than expected is reported (missing, extra, different)', async () => {
  const p = pyZip({ 'a.txt': 'one', 'extra.txt': 'e' }, 'zipfile.ZIP_DEFLATED');
  const c = await checkZip(p, { 'a.txt': 'TWO', 'missing.txt': 'm' });
  for (const tool of ['zipinfo', 'python', 'chicla']) assert.equal(c.result[tool].ok, false, tool);
  assert.ok(c.problems.some((x) => /missing/.test(x)) && c.problems.some((x) => /unexpected/.test(x)) && c.problems.some((x) => /differs/.test(x)));
});

test('a tool that is not installed is reported as not run, never as a pass', async (t) => {
  const c = await checkZip(pyZip(TREE, 'zipfile.ZIP_STORED'), TREE);
  for (const tool of c.skipped) assert.deepEqual(c.result[tool], { ran: false, ok: null, problems: [] });
  t.diagnostic(`ran: ${c.ran.join(', ')}; not run: ${c.skipped.join(', ') || 'none'}`);
});

// Round 149: the first reading of `unzip -t` exit 1 was wrong. On Windows Info-ZIP warns about names it cannot represent and ends with
// «At least one warning-error was detected» (not «No errors detected»): 26 differential tests failed on that line. A real error says
// «At least one error was detected» or «bad CRC».
test('round 149: unzip -t verdict: warnings pass only where names are lossy, errors and bad CRCs never', async () => {
  const { unzipVerdict } = await import('./interop.mjs');
  const ok = { status: 0, stdout: '    testing: a.txt   OK\nNo errors detected in compressed data of z.zip.\n', stderr: '' };
  const warn = { status: 1, stdout: '    testing: caf+.txt   OK\nAt least one warning-error was detected in z.zip.\n', stderr: '' };
  assert.equal(unzipVerdict(ok, false), true);
  assert.equal(unzipVerdict(warn, true), true, 'a warning where names are lossy is a pass');
  assert.equal(unzipVerdict(warn, false), false, 'a warning where names are exact is a failure');
  assert.equal(unzipVerdict({ ...warn, stdout: warn.stdout + '    testing: b.bin   bad CRC 1234abcd  (should be 5678ef01)\n' }, true), false, 'a bad CRC is never a warning');
  assert.equal(unzipVerdict({ status: 2, stdout: 'At least one error was detected in z.zip.\n', stderr: '' }, true), false);
  assert.equal(unzipVerdict({ status: 1, stdout: 'No errors detected in compressed data of z.zip.\n', stderr: '' }, true), true);
  assert.equal(unzipVerdict({ status: 0, stdout: '', stderr: '' }, true), false, 'exit 0 without the closing line is not a pass');
});
