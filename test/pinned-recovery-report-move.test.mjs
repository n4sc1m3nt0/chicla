// C11.1 slice 6b (D91): `recovery-report` moves to packages/chicla-kit/src/pinned/recovery-report.mjs; scripts/recovery-report.mjs becomes a wrapper.
// The ONLY change in the moved file is the zipkit fallback path; so the pin in CLAUDE.md moves exactly once, here, and the shell still checks it before running anything.
// Round 271 (C21.1, D-270b, plan docs/plan-a2-pins.md): this file no longer freezes the bytes of the file (a sha256 or reverse patches from the round of the move): every legitimate edit of a pinned file turned exactly one such test red.
// What guards the bytes now is the pin itself (`bump-round --verify`, `toolchain-pin.test.mjs`), and `pinned-edit-follow-ups.test.mjs` proves that an edit costs `bump-round` only. The structural tests below stay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, TOOLCHAIN_SOURCES, WRAPPERS, pinnedPath } from './toolchain-files.mjs';

const NEW = 'packages/chicla-kit/src/pinned/recovery-report.mjs';
const [WRAPPER] = WRAPPERS; // the wrapper left in scripts/
const OLD_FALLBACK = 'new URL("../packages/chicla-zip/src/zipkit.mjs", import.meta.url)';
const NEW_FALLBACK = 'new URL("../../../chicla-zip/src/zipkit.mjs", import.meta.url)';
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const run = (file, ...args) => spawnSync(process.execPath, [join(ROOT, file), ...args], { encoding: 'utf8', cwd: ROOT });

test('the helper points at the new file, and its zipkit fallback is the one from the kit own folder (the bytes are held by the pin, not by this test)', () => {
  assert.equal(pinnedPath('recovery-report'), NEW);
  assert.equal(TOOLCHAIN_SOURCES['recovery-report.mjs'], NEW);
  assert.ok(existsSync(join(ROOT, NEW)));
  const s = read(NEW);
  assert.equal(s.split(NEW_FALLBACK).length, 2, 'the new fallback appears once');
  assert.ok(!s.includes(OLD_FALLBACK), 'the old fallback is gone');
});

test('the moved file still imports its three siblings by ./ and nothing else from the tree (it must run alone from RECOVER/)', () => {
  const specs = [...read(NEW).matchAll(/from "(\.[^"]*)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(specs, ['./baseline.mjs', './manifest.mjs', './policy.mjs']);
});

test('the two TOOLCHAIN maps (integrity, emergency-dump) read recovery-report from the new place', () => {
  for (const f of ['packages/chicla-kit/src/integrity.mjs', 'packages/chicla-kit/src/emergency-dump.mjs']) {
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
