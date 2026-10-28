// C11.1 slice 6a-2 (D91): `manifest` moves, byte-identical, to packages/chicla-kit/src/pinned/manifest.mjs; the shim that src/pinned/manifest.mjs was is gone (slice 6c).
// The pin in CLAUDE.md must not move: the bytes are the same, so `bump-round --verify` and this test prove nothing else changed.
// Round 271 (C21.1, D-270b, plan docs/plan-a2-pins.md): this file no longer freezes the bytes of the file (a sha256 or reverse patches from the round of the move): every legitimate edit of a pinned file turned exactly one such test red.
// What guards the bytes now is the pin itself (`bump-round --verify`, `toolchain-pin.test.mjs`), and `pinned-edit-follow-ups.test.mjs` proves that an edit costs `bump-round` only. The structural tests below stay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, REMOVED_SHIMS, TOOLCHAIN_SOURCES, pinnedPath } from './toolchain-files.mjs';

const NEW = 'packages/chicla-kit/src/pinned/manifest.mjs';
const OLD = REMOVED_SHIMS.manifest; // the re-export shim of slices 6a, deleted in 6c
const read = (p) => readFileSync(join(ROOT, p));

test('the helper points at the new file, and the file exists (the bytes are held by the pin, not by this test)', () => {
  assert.equal(pinnedPath('manifest'), NEW);
  assert.equal(TOOLCHAIN_SOURCES['manifest.mjs'], NEW);
  assert.ok(existsSync(join(ROOT, NEW)));
});

test('the re-export shim of manifest in the scripts folder is gone (slice 6c): the pinned file is the only copy', () => {
  assert.equal(existsSync(join(ROOT, OLD)), false);
});

test('the pinned file exports the names the cores use', async () => {
  const b = await import(join(ROOT, NEW));
  assert.deepEqual(Object.keys(b).sort(), ['MANIFEST_V2_HEADER', 'crc32', 'leaf', 'parseManifest', 'serializeManifest']);
});

test('the two TOOLCHAIN maps (integrity, emergency-dump) read manifest from the new place, never from the shim', () => {
  for (const f of ['packages/chicla-kit/src/integrity.mjs', 'packages/chicla-kit/src/emergency-dump.mjs']) {
    const src = read(f).toString('utf8');
    const m = src.match(/"(?:RECOVER\/)?manifest\.mjs":\s*"([^"]+)"/);
    assert.ok(m, `${f}: no manifest entry in the TOOLCHAIN map`);
    assert.equal(m[1], NEW, f);
  }
});

test('the four cores that import manifest use the pinned file directly', () => {
  for (const f of ['make-delivery', 'verify-delivery', 'emergency-dump', 'check-manifest'].map((n) => `packages/chicla-kit/src/${n}.mjs`)) {
    const specs = [...read(f).toString('utf8').matchAll(/from "([^"]*manifest\.mjs)"/g)].map((m) => m[1]).filter((x) => /(^|\/)manifest\.mjs$/.test(x));
    assert.deepEqual(specs, ['./pinned/manifest.mjs'], f);
  }
});
