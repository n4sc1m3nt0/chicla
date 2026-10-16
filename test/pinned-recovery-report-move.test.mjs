// C11.1 slice 6b (D91): `recovery-report` moves to packages/chicla-kit/src/pinned/recovery-report.mjs; scripts/recovery-report.mjs becomes a wrapper.
// The ONLY change in the moved file is the zipkit fallback path; so the pin in CLAUDE.md moves exactly once, here, and the shell still checks it before running anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, TOOLCHAIN_SOURCES, WRAPPERS, pinnedPath } from './toolchain-files.mjs';

const NEW = 'packages/chicla-kit/src/pinned/recovery-report.mjs';
const [WRAPPER] = WRAPPERS; // the wrapper left in scripts/
const OLD_SHA256 = 'a7c265261c84100221c51239f8b6c7ee4fd4ad98961debde1f72caa34f2b436e'; // sha256 of recovery-report.mjs before the move (round 132)
const OLD_FALLBACK = 'new URL("../packages/chicla-zip/src/zipkit.mjs", import.meta.url)';
const NEW_FALLBACK = 'new URL("../../../chicla-zip/src/zipkit.mjs", import.meta.url)';
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const run = (file, ...args) => spawnSync(process.execPath, [join(ROOT, file), ...args], { encoding: 'utf8', cwd: ROOT });

test('the helper points at the new file, and the file is the old one with ONLY the zipkit fallback changed', () => {
  assert.equal(pinnedPath('recovery-report'), NEW);
  assert.equal(TOOLCHAIN_SOURCES['recovery-report.mjs'], NEW);
  assert.ok(existsSync(join(ROOT, NEW)));
  const s = read(NEW);
  assert.equal(s.split(NEW_FALLBACK).length, 2, 'the new fallback appears once');
  assert.ok(!s.includes(OLD_FALLBACK), 'the old fallback is gone');
  // C14.7 (round 158, D113) changed five spots of the pinned file on purpose (`leaf` instead of `.split("/").pop()`, and its import): reverse exactly those and the bytes must be the ones that were pinned.
  const back = s.replace('import { parseManifest, leaf } from "./manifest.mjs";', 'import { parseManifest } from "./manifest.mjs";').replace('leaf(HERE) === "RECOVER"', 'HERE.split("/").pop() === "RECOVER"').replace('leaf(zip)', 'zip.split("/").pop()').replace('leaf(baselineZip)', 'baselineZip.split("/").pop()');
  assert.equal(createHash('sha256').update(back.replace(NEW_FALLBACK, OLD_FALLBACK)).digest('hex'), OLD_SHA256);
});

test('the moved file still imports its three siblings by ./ and nothing else from the tree (it must run alone from RECOVER/)', () => {
  const specs = [...read(NEW).matchAll(/from "(\.[^"]*)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(specs, ['./baseline.mjs', './manifest.mjs', './policy.mjs']);
});

test('the two TOOLCHAIN maps (bump-round, emergency-dump) read recovery-report from the new place', () => {
  for (const f of ['packages/chicla-kit/src/bump-round.mjs', 'packages/chicla-kit/src/emergency-dump.mjs']) {
    const m = read(f).match(/"(?:RECOVER\/)?recovery-report\.mjs":\s*"([^"]+)"/);
    assert.ok(m, `${f}: no recovery-report entry`);
    assert.equal(m[1], NEW, f);
  }
});

test('the recovery-report wrapper in scripts/ is a wrapper: it re-exports the core and has its own entry point, and holds no logic', () => {
  const s = read(WRAPPER);
  assert.match(s, /from "\.\.\/packages\/chicla-kit\/src\/pinned\/recovery-report\.mjs"/);
  assert.match(s, /export \{ recoveryReport, renderRecoveryReport \}/);
  assert.ok(s.split('\n').length < 40, 'a wrapper is short');
  assert.ok(!/extractZip|createHash|spawnSync/.test(s), 'no logic in the wrapper');
});

test('both entry points run: with no dump each says EUSAGE and exits 2 (so zipkit loaded from the new place)', () => {
  for (const f of [WRAPPER, NEW]) {
    const r = run(f);
    assert.equal(r.status, 2, `${f}: ${r.stderr}`);
    assert.match(r.stderr + r.stdout, /EUSAGE|usage/i, f);
  }
});
