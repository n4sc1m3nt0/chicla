// C11.1 slice 6a-2 (D91): `manifest` moves, byte-identical, to packages/chicla-kit/src/pinned/manifest.mjs; the shim that src/pinned/manifest.mjs was is gone (slice 6c).
// The pin in CLAUDE.md must not move: the bytes are the same, so `bump-round --verify` and this test prove nothing else changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, REMOVED_SHIMS, TOOLCHAIN_SOURCES, pinnedPath } from './toolchain-files.mjs';

const NEW = 'packages/chicla-kit/src/pinned/manifest.mjs';
const OLD = REMOVED_SHIMS.manifest; // the re-export shim of slices 6a, deleted in 6c
const MANIFEST_SHA256 = '7a39869c96221aa407d90c3a72131288fae4a5d3baca9702b8a99cc1e15c1f34'; // sha256 of manifest.mjs before the move (round 130)
const read = (p) => readFileSync(join(ROOT, p));

test('the helper points at the new file, and the file is byte-identical to the one that was pinned', () => {
  assert.equal(pinnedPath('manifest'), NEW);
  assert.equal(TOOLCHAIN_SOURCES['manifest.mjs'], NEW);
  assert.ok(existsSync(join(ROOT, NEW)));
  // C14.7 (round 158, D113) added `leaf` to the pinned file (the pin moved on purpose): reverse that ONE edit and the bytes must be the ones that were pinned, so nothing else has changed.
  const LEAF_IMPORT = 'import { basename } from "node:path";\n';
  const s = read(NEW).toString('utf8'), at = s.indexOf('// C14.7 (D113)'), end = s.indexOf('export const MANIFEST_V2_HEADER');
  assert.ok(at > 0 && end > at && s.includes(LEAF_IMPORT), 'the C14.7 block of manifest.mjs is not where this test expects it');
  assert.equal(createHash('sha256').update((s.slice(0, at) + s.slice(end)).replace(LEAF_IMPORT, '')).digest('hex'), MANIFEST_SHA256);
});

test('the re-export shim of manifest in the scripts folder is gone (slice 6c): the pinned file is the only copy', () => {
  assert.equal(existsSync(join(ROOT, OLD)), false);
});

test('the pinned file exports the names the cores use', async () => {
  const b = await import(join(ROOT, NEW));
  assert.deepEqual(Object.keys(b).sort(), ['MANIFEST_V2_HEADER', 'crc32', 'leaf', 'parseManifest', 'serializeManifest']);
});

test('the two TOOLCHAIN maps (bump-round, emergency-dump) read manifest from the new place, never from the shim', () => {
  for (const f of ['packages/chicla-kit/src/bump-round.mjs', 'packages/chicla-kit/src/emergency-dump.mjs']) {
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
