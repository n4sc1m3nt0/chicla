// Round 288 (C24.3, AUDIT-8 F-4, M24): `scripts/smoke-test-tarball.mjs` and the CI job `tarball`.
// Until now only one unit test installed the tarball alone, and only on the machine that ran `npm test`; no CI job did it on macOS or Windows.
// Written before the script; red until it exists. Tests assert exit codes, JSON fields and file shapes, never message wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const node = (args, opts = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts });
const SMOKE = join(root, 'scripts', 'smoke-test-tarball.mjs');
const BUILD = join(root, 'scripts', 'build-chicla.mjs');
const PACK = join(root, 'scripts', 'pack-release.mjs');
const STEPS = ['init', 'bump-round-verify', 'make-delivery', 'verify-delivery', 'dump', 'dump-has-recover', 'recovery', 'chicla-zip', 'chicla-zip-library'];

test('C24.3: the script exists, and a usage error exits 2 (unknown option, --tarball with no value)', () => {
  assert.ok(existsSync(SMOKE), 'scripts/smoke-test-tarball.mjs does not exist');
  assert.equal(node([SMOKE, '--no-such-option']).status, 2);
  assert.equal(node([SMOKE, '--tarball']).status, 2);
});

test('C24.3: --tarball naming a file that is not there is a refusal (1), not a crash, and writes one JSON line with --json', () => {
  const r = node([SMOKE, '--tarball', join(tmpdir(), 'chicla-no-such-file.tgz'), '--json']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 1, '--json prints exactly one line');
  const o = JSON.parse(lines[0]);
  assert.equal(o.ok, false);
  assert.equal(o.error.code, 'ETARBALL');
});

test('C24.3: with no --tarball it builds, packs and installs the package ALONE, drives every step, and every step is ok', { timeout: 300000 }, () => {
  const r = node([SMOKE, '--json'], { timeout: 290000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const o = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.equal(o.ok, true);
  assert.deepEqual(o.steps.map((s) => s.name), STEPS);
  assert.ok(o.steps.every((s) => s.ok === true), JSON.stringify(o.steps.filter((s) => !s.ok)));
  assert.match(o.tarball, /chicla-\d+\.\d+\.\d+\.tgz$/);
  assert.equal(o.installed.join(','), 'chicla', 'nothing else was installed with it');
});

test('C24.3, break it on purpose: a tarball without src/pinned/zipkit.mjs (the 0.2.0 defect, F-1) fails at `recovery` and the script exits 1', { timeout: 300000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'chicla-smoke-broken-'));
  try {
    assert.equal(node([BUILD, '--out', join(out, 'stage')]).status, 0);
    rmSync(join(out, 'stage', 'chicla', 'src', 'pinned', 'zipkit.mjs'));
    const p = node([PACK, join(out, 'stage', 'chicla'), '--out', join(out, 'dist'), '--json']);
    assert.equal(p.status, 0, p.stdout + p.stderr);
    const tgz = join(out, 'dist', readdirSync(join(out, 'dist')).find((f) => f.endsWith('.tgz')));
    const r = node([SMOKE, '--tarball', tgz, '--json'], { timeout: 290000 });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const o = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.equal(o.ok, false);
    assert.equal(o.steps.find((s) => s.name === 'recovery')?.ok, false, 'recovery must be the red step');
    assert.equal(o.steps.find((s) => s.name === 'dump')?.ok, true, 'the steps before it stay green (the script goes on after a red step)');
  } finally { rmSync(out, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('C24.3: package.json has `smoke:tarball`, and it is NOT part of `smoke` (that one stays offline and fast)', () => {
  const s = JSON.parse(read('package.json')).scripts;
  assert.equal(s['smoke:tarball'], 'node scripts/smoke-test-tarball.mjs');
  assert.ok(!s.smoke.includes('smoke-test-tarball'));
});

const ci = read('.github/workflows/ci.yml');
const job = ci.split(/\n(?=  [a-z][\w-]*:\n)/).find((j) => /^\s*tarball:/.test(j)) ?? '';

test('C24.3: CI has a `tarball` job on Ubuntu, macOS and Windows; the Windows leg is reported, not blocking (it was never promised)', () => {
  assert.ok(job, 'no `tarball:` job in ci.yml');
  assert.match(job, /os:\s*\[ubuntu-latest,\s*macos-latest,\s*windows-latest\]/);
  assert.match(job, /fail-fast:\s*false/);
  assert.match(job, /continue-on-error:\s*\$\{\{\s*matrix\.os\s*==\s*'windows-latest'\s*\}\}/);
  assert.match(job, /timeout-minutes:\s*\d+/);
  assert.match(job, /node-version:\s*22/);
  assert.match(job, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(job, /actions\/setup-node@[0-9a-f]{40}/);
});

test('C24.3: the `tarball` job runs the script (which builds and packs by itself), and never publishes', () => {
  assert.match(job, /node scripts\/smoke-test-tarball\.mjs/);
  assert.doesNotMatch(ci, /npm publish|gh release/);
  const test_ = ci.split(/\n(?=  [a-z][\w-]*:\n)/).find((j) => /^\s*test:/.test(j));
  assert.doesNotMatch(test_, /smoke-test-tarball/, 'the existing `test` job is untouched');
});

test('C24.3: ROADMAP C24.3 is done (round 288) and says what was not run; AUDIT-8 F-4 points at it', () => {
  const c = read('ROADMAP.md').split('\n').find((l) => l.startsWith('| C24.3 |')) ?? '';
  assert.match(c, /feito \(round 288/);
  assert.match(c, /not run|NOT run/i);
  assert.doesNotMatch(c, /· proposed/);
});
