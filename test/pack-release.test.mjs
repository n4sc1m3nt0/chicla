// C5.5 slice b (round 74): scripts/pack-release.mjs packs a package with `npm pack`, writes the sha256 beside the
// tarball and prints release notes. Independent readers: `sha256sum` and `tar`. Nothing is published (rule 4).
// Tests assert exit codes and error codes, never wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'pack-release.mjs');
const zipPkg = join(root, 'packages', 'chicla-zip');
const tmp = () => mkdtempSync(join(tmpdir(), 'chicla-rel-'));
const run = (...a) => spawnSync(process.execPath, [script, ...a], { encoding: 'utf8' });

test('packs chicla-zip: tarball, .sha256 file, notes on stdout; sha256sum agrees', () => {
  const out = tmp();
  try {
    const r = run(zipPkg, '--out', out);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(readdirSync(out).sort(), ['chicla-zip-0.1.0.tgz', 'chicla-zip-0.1.0.tgz.sha256']);
    execFileSync('sha256sum', ['-c', 'chicla-zip-0.1.0.tgz.sha256'], { cwd: out, stdio: 'pipe' }); // independent reader
    const sha = readFileSync(join(out, 'chicla-zip-0.1.0.tgz.sha256'), 'utf8').split(/\s+/)[0];
    assert.match(sha, /^[0-9a-f]{64}$/);
    assert.ok(r.stdout.includes(sha) && r.stdout.includes('chicla-zip-0.1.0.tgz'));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('the tarball holds the four shipped files and nothing else (listed by tar)', () => {
  const out = tmp();
  try {
    assert.equal(run(zipPkg, '--out', out).status, 0);
    const names = execFileSync('tar', ['-tzf', join(out, 'chicla-zip-0.1.0.tgz')], { encoding: 'utf8' }).trim().split('\n').sort();
    assert.deepEqual(names, ['package/LICENSE', 'package/README.md', 'package/package.json', 'package/src/zipkit.mjs']);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('the same tree packs to the same sha256 twice (the notes can be checked later)', () => {
  const a = tmp(), b = tmp();
  try {
    run(zipPkg, '--out', a); run(zipPkg, '--out', b);
    assert.equal(readFileSync(join(a, 'chicla-zip-0.1.0.tgz.sha256'), 'utf8'), readFileSync(join(b, 'chicla-zip-0.1.0.tgz.sha256'), 'utf8'));
  } finally { rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true }); }
});

test('--json: exactly one line, ok with name, version, file, sha256, size', () => {
  const out = tmp();
  try {
    const r = run(zipPkg, '--out', out, '--json');
    assert.equal(r.status, 0);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines.length, 1);
    const j = JSON.parse(lines[0]);
    assert.equal(j.ok, true); assert.equal(j.name, 'chicla-zip'); assert.equal(j.version, '0.1.0');
    assert.equal(j.file, 'chicla-zip-0.1.0.tgz'); assert.match(j.sha256, /^[0-9a-f]{64}$/); assert.ok(j.size > 0);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('refuses a private package (the root) with EPRIVATE, exit 1, nothing written', () => {
  const out = tmp();
  try {
    const r = run(root, '--out', out, '--json');
    assert.equal(r.status, 1);
    assert.equal(JSON.parse(r.stdout).error.code, 'EPRIVATE');
    assert.deepEqual(readdirSync(out), []);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('refuses a package whose tarball would carry no LICENSE: ELICENSE, exit 1', () => {
  const d = tmp(), out = tmp();
  try {
    cpSync(zipPkg, join(d, 'p'), { recursive: true, filter: (s) => !/\/LICENSE$/.test(s) });
    const r = run(join(d, 'p'), '--out', out, '--json');
    assert.equal(r.status, 1);
    assert.equal(JSON.parse(r.stdout).error.code, 'ELICENSE');
    assert.deepEqual(readdirSync(out), []);
  } finally { rmSync(d, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
});

test('usage errors exit 2: no --out, a missing folder, an unknown option', () => {
  assert.equal(run(zipPkg).status, 2);
  assert.equal(run(join(tmpdir(), 'chicla-no-such-dir'), '--out', tmpdir()).status, 2);
  assert.equal(run(zipPkg, '--out', tmpdir(), '--bogus').status, 2);
});
