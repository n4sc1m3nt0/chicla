// C11.1 slice 6a-3 (D91): `policy` moves, byte-identical, to packages/chicla-kit/src/pinned/policy.mjs; the shim that src/pinned/policy.mjs was is gone (slice 6c).
// The pin in CLAUDE.md must not move: the bytes are the same, so `bump-round --verify` and this test prove nothing else changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, REMOVED_SHIMS, TOOLCHAIN_SOURCES, pinnedPath } from './toolchain-files.mjs';

const NEW = 'packages/chicla-kit/src/pinned/policy.mjs';
const OLD = REMOVED_SHIMS.policy; // the re-export shim of slices 6a, deleted in 6c
const POLICY_SHA256 = 'ecd473378605a29b8774bab9015edffee43ae66f23106ff4595627ebc5b29f4e'; // sha256 of policy.mjs before the move (round 131)
const read = (p) => readFileSync(join(ROOT, p));

test('the helper points at the new file, and the file is byte-identical to the one that was pinned', () => {
  assert.equal(pinnedPath('policy'), NEW);
  assert.equal(TOOLCHAIN_SOURCES['policy.mjs'], NEW);
  assert.ok(existsSync(join(ROOT, NEW)));
  assert.equal(createHash('sha256').update(read(NEW)).digest('hex'), POLICY_SHA256);
});

test('the re-export shim of policy in the scripts folder is gone (slice 6c): the pinned file is the only copy', () => {
  assert.equal(existsSync(join(ROOT, OLD)), false);
});

test('the pinned file exports the names the cores use', async () => {
  const b = await import(join(ROOT, NEW));
  assert.deepEqual(Object.keys(b).sort(), ['NO_POLICY', 'POLICY_FILE', 'PRESETS', 'PYTHON_DIRS', 'SCAN_LIMIT', 'SECRET_DIRS', 'SKIP_NAMES', 'detectSecret', 'isJunkName', 'isSecretEnv', 'isSecretFileName', 'loadPolicy', 'neverShipReason', 'parsePolicy', 'policyAllows', 'policySkips', 'scanFile']);
});

test('the two TOOLCHAIN maps (bump-round, emergency-dump) read policy from the new place, never from the shim', () => {
  for (const f of ['packages/chicla-kit/src/bump-round.mjs', 'packages/chicla-kit/src/emergency-dump.mjs']) {
    const src = read(f).toString('utf8');
    const m = src.match(/"(?:RECOVER\/)?policy\.mjs":\s*"([^"]+)"/);
    assert.ok(m, `${f}: no policy entry in the TOOLCHAIN map`);
    assert.equal(m[1], NEW, f);
  }
});

test('the three cores that import policy use the pinned file directly', () => {
  for (const f of ['verify-delivery', 'emergency-dump', 'check-manifest'].map((n) => `packages/chicla-kit/src/${n}.mjs`)) {
    const specs = [...read(f).toString('utf8').matchAll(/"([^"]*policy\.mjs)"/g)].map((m) => m[1]).filter((x) => x.startsWith(".") && /(^|\/)policy\.mjs$/.test(x));
    assert.deepEqual(specs, ['./pinned/policy.mjs'], f);
  }
});
