// Round 290 (C24.6, found by the first CI run of the `tarball` job, round 289): on windows-latest `smoke-test-tarball` ended `ETARBALL: pack-release failed (exit 1)` and showed no reason.
// Two defects: (1) `pack-release.mjs` ran `execFileSync('npm', ...)`, and on Windows `npm` is a `.cmd` file that only a shell can start; (2) the smoke test printed an exit code, not the
// reason. Written before the fix; red until made. Windows itself cannot be run here: the first test reads the source for what Windows needs, the others run the real behaviour on this system.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const node = (args, opts = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', ...opts });

test('pack-release.mjs starts npm through a shell on Windows only, with every argument quoted (a path with a space must survive)', () => {
  const src = read('scripts/pack-release.mjs');
  const call = src.split('\n').find((l) => l.includes("execFileSync('npm'")) ?? '';
  assert.ok(call, 'the npm pack call is gone');
  assert.match(call, /shell:\s*WIN\b/, 'no shell option tied to Windows');
  assert.match(src, /const WIN = process\.platform === 'win32'/);
  assert.match(call, /WIN \? [^:]*map\(/, 'on Windows the arguments are quoted one by one');
  assert.doesNotMatch(call, /shell:\s*true/, 'a shell on every system would change Linux and macOS');
});

test('pack-release.mjs still packs on this system (the change must not break the system that worked)', { timeout: 120000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'chicla space pack-'));
  try {
    const r = node([join(root, 'scripts', 'pack-release.mjs'), join(root, 'packages', 'chicla-zip'), '--out', out, '--json']);
    assert.equal(r.status, 1, 'chicla-zip is private: refused, as before');
    assert.equal(JSON.parse(r.stdout).error.code, 'EPRIVATE');
    const b = node([join(root, 'scripts', 'build-chicla.mjs'), '--out', join(out, 'stage')]);
    assert.equal(b.status, 0, b.stderr);
    const p = node([join(root, 'scripts', 'pack-release.mjs'), join(out, 'stage', 'chicla'), '--out', join(out, 'dist dir'), '--json']);
    assert.equal(p.status, 0, p.stdout + p.stderr);
    assert.match(JSON.parse(p.stdout).file, /^chicla-\d+\.\d+\.\d+\.tgz$/);
  } finally { rmSync(out, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

// A copy of the smoke script in a folder whose scripts/ are stubs, so a failing build or pack can be made on any system.
function fakeTree(buildBody, packBody) {
  const t = mkdtempSync(join(tmpdir(), 'chicla-fake-tree-'));
  mkdirSync(join(t, 'scripts'));
  copyFileSync(join(root, 'scripts', 'smoke-test-tarball.mjs'), join(t, 'scripts', 'smoke-test-tarball.mjs'));
  copyFileSync(join(root, 'scripts', 'win-quote.mjs'), join(t, 'scripts', 'win-quote.mjs')); // C25.1: the smoke script imports it
  copyFileSync(join(root, 'scripts', 'failure-reason.mjs'), join(t, 'scripts', 'failure-reason.mjs')); // C25.4: and this one
  writeFileSync(join(t, 'scripts', 'build-chicla.mjs'), buildBody);
  writeFileSync(join(t, 'scripts', 'pack-release.mjs'), packBody);
  return t;
}

test('smoke-test-tarball: when pack-release refuses, ETARBALL carries its code and its message (not only the exit code)', () => {
  const t = fakeTree('process.exit(0);', 'process.stdout.write(JSON.stringify({ ok: false, error: { code: "EPACK", message: "boom-pack-xyz" } }) + "\\n"); process.exit(1);');
  try {
    const r = node([join(t, 'scripts', 'smoke-test-tarball.mjs'), '--json']);
    assert.equal(r.status, 1);
    const e = JSON.parse(r.stdout.trim()).error;
    assert.equal(e.code, 'ETARBALL');
    assert.match(e.message, /EPACK/);
    assert.match(e.message, /boom-pack-xyz/);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test('smoke-test-tarball: when build-chicla fails, ETARBALL carries the first line it printed on stderr', () => {
  const t = fakeTree('process.stderr.write("first-line-build-abc\\nsecond\\n"); process.exit(1);', 'process.exit(0);');
  try {
    const r = node([join(t, 'scripts', 'smoke-test-tarball.mjs'), '--json']);
    assert.equal(r.status, 1);
    const e = JSON.parse(r.stdout.trim()).error;
    assert.equal(e.code, 'ETARBALL');
    assert.match(e.message, /first-line-build-abc/);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test('smoke-test-tarball: when pack-release fails with no JSON, the first line of its output is shown', () => {
  const t = fakeTree('process.exit(0);', 'process.stderr.write("plain-failure-qrs\\n"); process.exit(1);');
  try {
    const r = node([join(t, 'scripts', 'smoke-test-tarball.mjs'), '--json']);
    assert.equal(r.status, 1);
    assert.match(JSON.parse(r.stdout.trim()).error.message, /plain-failure-qrs/);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test('ROADMAP: C24.6 is done (round 290) and says that Windows was not run', () => {
  const c = read('ROADMAP.md').split('\n').find((l) => l.startsWith('| C24.6 |')) ?? '';
  assert.match(c, /feito \(round 290/);
  assert.match(c, /Windows/);
  assert.match(c, /not run|NOT run/i);
});
