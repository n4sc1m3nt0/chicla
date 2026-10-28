// Round 240 (C16.6, AUDIT-4 P-2): `check-manifest` reads each file ONCE (the secret scan and the crc32 of `--write` use the same bytes) and does not
// `statSync` every entry (readdir with file types). Written before the change; red until it is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'packages/chicla-kit/src/check-manifest.mjs');
const manifest = await importPinned('manifest');
const j = (...p) => p.join('');

// A tree with: nested folders, an empty file, a file over 1 MiB (never scanned), a non-ASCII name, a secret (left out), an .env (skipped by name),
// node_modules (skipped), and a symlink to a folder (followed, as before) when the system allows it.
function tree() {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'chicla-1r-')));
  const put = (rel, data) => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), data); };
  put('package.json', '{"name":"x"}\n'); put('README.md', '# x\n'); put('src/a/b/deep.txt', 'deep\n'); put('src/empty.txt', '');
  put('data/big.bin', Buffer.alloc(1572864, 7)); put('docs/ação.txt', 'não\n'); put('cfg/leak.txt', `token = ${j('ghp_', 'a1B2'.repeat(9))}\n`);
  put('.env', 'A=1\n'); put('node_modules/m/index.js', 'x\n'); put('bin/blob.dat', Buffer.from([0, 1, 2, 3, 0, 255]));
  let link = false; try { mkdirSync(join(d, 'real')); put('real/r.txt', 'r\n'); symlinkSync(join(d, 'real'), join(d, 'linked'), 'dir'); link = true; } catch { /* no symlinks here */ }
  return { d, link };
}
const EXPECT = (link) => ['README.md', 'bin/blob.dat', 'data/big.bin', 'docs/ação.txt', 'package.json', 'real/r.txt', 'src/a/b/deep.txt', 'src/empty.txt', ...(link ? ['linked/r.txt'] : [])].sort();

const HOOK = `
import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
const log = [], fds = new Map();
for (const name of ['openSync', 'readFileSync', 'statSync', 'lstatSync']) {
  const o = fs[name];
  fs[name] = function (p, ...a) {
    if (typeof p === 'string') log.push([name, p]); else if (name === 'readFileSync' && fds.has(p)) log.push(['readFd', fds.get(p)]);
    const r = o.call(this, p, ...a); if (name === 'openSync' && typeof p === 'string') fds.set(r, p); return r;
  };
}
syncBuiltinESMExports();
process.on('exit', () => fs.writeFileSync(process.env.HOOK_LOG, JSON.stringify(log)));
`;
function run(d, write) {
  const hook = join(d, '..', `hook-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`); const logf = hook + '.json';
  writeFileSync(hook, HOOK);
  const code = `const m = await import(${JSON.stringify(pathToFileURL(SRC).href)}); const r = m.checkManifest({ root: ${JSON.stringify(d)}, write: ${write} }); process.stdout.write(JSON.stringify({ ok: r.ok, code: r.code }));`;
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(hook).href, '--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, HOOK_LOG: logf } });
  assert.equal(r.status, 0, r.stderr);
  const log = JSON.parse(readFileSync(logf, 'utf8')); rmSync(hook); rmSync(logf);
  return { log: log.filter(([, p]) => p.startsWith(d + '/') && !/FILES\.manifest|chicla\.policy\.json/.test(p)), out: JSON.parse(r.stdout) };
}
const count = (log, names) => { const m = new Map(); for (const [n, p] of log) if (names.includes(n)) m.set(p, (m.get(p) ?? 0) + 1); return m; };
const reads = (log) => count(log, ['openSync', 'readFileSync']); // opens, plus whole-file reads by path
const dataReads = (log) => count(log, ['readFd', 'readFileSync']); // the bytes actually read (by descriptor or by path)

test('--write: the manifest is byte-identical to the one an independent oracle (readFileSync, crc32, sort) makes', () => {
  const { d, link } = tree();
  try {
    const r = run(d, true); assert.equal(r.out.ok, true);
    const want = manifest.serializeManifest(EXPECT(link).map((rel) => { const b = readFileSync(join(d, rel)); return { path: rel, crc32: manifest.crc32(b), size: b.length }; }));
    assert.equal(readFileSync(join(d, 'FILES.manifest'), 'utf8'), want);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('--write: every file that is listed or scanned is opened exactly once (no second read for the crc32)', () => {
  const { d } = tree();
  try {
    const log = run(d, true).log, m = reads(log), r = dataReads(log);
    for (const rel of ['README.md', 'package.json', 'src/a/b/deep.txt', 'src/empty.txt', 'data/big.bin', 'docs/ação.txt', 'bin/blob.dat', 'cfg/leak.txt']) {
      assert.equal(m.get(join(d, rel)), 1, `${rel} opened ${m.get(join(d, rel))} time(s)`); assert.equal(r.get(join(d, rel)), 1, `${rel}: bytes read ${r.get(join(d, rel))} time(s)`);
    }
    for (const rel of ['.env', 'node_modules/m/index.js']) assert.equal(m.get(join(d, rel)), undefined, `${rel} must not be read at all`);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('check (no --write): a file over 1 MiB is not read at all, the others once; the secret file is still left out', () => {
  const { d } = tree();
  try {
    run(d, true);
    const r = run(d, false); const m = reads(r.log), bytes = dataReads(r.log);
    assert.equal(bytes.get(join(d, 'data/big.bin')), undefined, 'nothing to scan, nothing to hash: its bytes are not read');
    for (const rel of ['README.md', 'package.json', 'src/a/b/deep.txt', 'cfg/leak.txt']) { assert.equal(m.get(join(d, rel)), 1, rel); assert.equal(bytes.get(join(d, rel)), 1, rel); }
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('no statSync/lstatSync per entry in the walk (readdir with file types); a symlink to a folder is the only entry that may need one', () => {
  const { d, link } = tree();
  try {
    const r = run(d, true);
    const stats = r.log.filter(([n]) => n === 'statSync' || n === 'lstatSync');
    // only a symlink may need a stat (to learn whether it points to a folder)
    assert.ok(stats.every(([, p]) => p === join(d, 'linked')), `unexpected stat calls: ${JSON.stringify(stats.slice(0, 4))}`);
    assert.ok(link ? stats.length <= 1 : stats.length === 0);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('an `allow`ed file is not scanned: not read in check mode, read once and listed with `--write`', () => {
  const { d } = tree();
  try {
    writeFileSync(join(d, 'chicla.policy.json'), JSON.stringify({ version: 1, allow: ['cfg/leak.txt'] }));
    const w = run(d, true), m = reads(w.log), r = dataReads(w.log);
    assert.equal(m.get(join(d, 'cfg/leak.txt')), 1); assert.equal(r.get(join(d, 'cfg/leak.txt')), 1);
    assert.match(readFileSync(join(d, 'FILES.manifest'), 'utf8'), /cfg\/leak\.txt/, 'the released file is in the manifest');
    const c = run(d, false);
    assert.equal(reads(c.log).get(join(d, 'cfg/leak.txt')), undefined, 'check mode does not even open an allowed file');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

const canLock = process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() !== 0;
test('a file that cannot be read still stops `--write` with the read error and writes nothing; in check mode it is just listed', { skip: !canLock && 'needs a non-root user on a system with file modes' }, () => {
  const { d } = tree();
  try {
    writeFileSync(join(d, 'locked.txt'), 'x\n'); chmodSync(join(d, 'locked.txt'), 0);
    const w = run(d, true);
    assert.equal(w.out.ok, false); assert.equal(w.out.code, 'EACCES');
    assert.throws(() => readFileSync(join(d, 'FILES.manifest')), /ENOENT/, 'nothing was written');
    chmodSync(join(d, 'locked.txt'), 0o644); run(d, true); chmodSync(join(d, 'locked.txt'), 0);
    assert.equal(run(d, false).out.ok, true, 'check mode does not need the bytes of an unreadable file');
  } finally { try { chmodSync(join(d, 'locked.txt'), 0o644); } catch { /* gone */ } rmSync(d, { recursive: true, force: true }); }
});
