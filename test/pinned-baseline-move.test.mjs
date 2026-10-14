// C11.1 slice 6a-1 (D91): `baseline` moves, byte-identical, to packages/chicla-kit/src/pinned/baseline.mjs; the shim that src/pinned/baseline.mjs was is gone (slice 6c).
// The pin in CLAUDE.md must not move: the bytes are the same, so `bump-round --verify` and this test prove nothing else changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, REMOVED_SHIMS, TOOLCHAIN_SOURCES, pinnedPath } from './toolchain-files.mjs';

const NEW = 'packages/chicla-kit/src/pinned/baseline.mjs';
const OLD = REMOVED_SHIMS.baseline; // the re-export shim of slices 6a, deleted in 6c
const BASELINE_SHA256 = '7ee14e7084caf978cda226463dd71d90e3f5b36a0d1e9162d310936f734a3e0c'; // sha256 of baseline.mjs before the move (round 129)
const read = (p) => readFileSync(join(ROOT, p));

test('the helper points at the new file, and the file is byte-identical to the one that was pinned', () => {
  assert.equal(pinnedPath('baseline'), NEW);
  assert.equal(TOOLCHAIN_SOURCES['baseline.mjs'], NEW);
  assert.ok(existsSync(join(ROOT, NEW)));
  assert.equal(createHash('sha256').update(read(NEW)).digest('hex'), BASELINE_SHA256);
});

test('the re-export shim of baseline in the scripts folder is gone (slice 6c): the pinned file is the only copy', () => {
  assert.equal(existsSync(join(ROOT, OLD)), false);
});

test('the pinned file exports the names the cores use', async () => {
  const b = await import(join(ROOT, NEW));
  assert.deepEqual(Object.keys(b).sort(), ['BASELINE_FILE', 'BASELINE_FORMAT', 'buildBaseline', 'parseBaseline', 'serializeBaseline']);
});

test('the two TOOLCHAIN maps (bump-round, emergency-dump) read baseline from the new place, never from the shim', () => {
  for (const f of ['packages/chicla-kit/src/bump-round.mjs', 'packages/chicla-kit/src/emergency-dump.mjs']) {
    const src = read(f).toString('utf8');
    const m = src.match(/"(?:RECOVER\/)?baseline\.mjs":\s*"([^"]+)"/);
    assert.ok(m, `${f}: no baseline entry in the TOOLCHAIN map`);
    assert.equal(m[1], NEW, f);
  }
});

test('the two cores that import baseline use the pinned file directly', () => {
  for (const f of ['packages/chicla-kit/src/make-delivery.mjs', 'packages/chicla-kit/src/verify-delivery.mjs']) {
    const specs = [...read(f).toString('utf8').matchAll(/from "([^"]*baseline\.mjs)"/g)].map((m) => m[1]);
    assert.deepEqual(specs, ['./pinned/baseline.mjs'], f);
  }
});
