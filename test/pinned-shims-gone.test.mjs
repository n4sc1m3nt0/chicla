// C11.1 slice 6c (D91): the three re-export shims of slices 6a (scripts/baseline.mjs, manifest.mjs, policy.mjs) are deleted; every importer uses the pinned files directly.
// The pin in CLAUDE.md must NOT move (the five RECOVER/ files are untouched): `bump-round --verify` and the byte checks of test/pinned-*-move.test.mjs prove it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, DUMP_COPY, PINNED, REMOVED_SHIMS, WRAPPERS } from './toolchain-files.mjs';

const GONE = Object.values(REMOVED_SHIMS);
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => e.name === 'node_modules' ? [] : e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);

test('the three shims are gone from scripts/, and the wrapper of recovery-report stays', () => {
  for (const f of GONE) assert.equal(existsSync(join(ROOT, f)), false, f);
  for (const w of WRAPPERS) assert.ok(existsSync(join(ROOT, w)), `${w} is a wrapper with its own entry point, not a shim`);
});

test('no source file imports a path under scripts/ for baseline, manifest or policy', () => {
  const files = [...walk('scripts'), ...walk('packages')].filter((f) => f.endsWith('.mjs') && !f.includes('/test/'));
  const offenders = files.filter((f) => /\b(?:from|import)\s*\(?\s*["'][^"']*scripts\/(?:baseline|manifest|policy)\.mjs["']/.test(read(f)) || /from\s+["']\.\/(?:baseline|manifest|policy)\.mjs["']/.test(read(f)) && f.startsWith('scripts/'));
  assert.deepEqual(offenders, []);
});

test('a fake project for the dump no longer needs the shims', () => {
  for (const f of GONE) assert.ok(!DUMP_COPY.includes(f), f);
  for (const name of Object.keys(PINNED)) assert.ok(DUMP_COPY.includes(PINNED[name]), name);
});

test('the CLI comment no longer says the kit cannot be published alone because the cores live in scripts/', () => {
  assert.ok(!/cannot be published on its own yet/.test(read('packages/chicla-kit/src/cli.mjs')));
});

test('README and docs/manifest.md name the pinned files, not the old shims in the scripts folder', () => {
  assert.ok(!/scripts\/(policy|manifest|baseline)\.mjs/.test(read('README.md')));
  assert.ok(!/scripts\/manifest\.mjs/.test(read('docs/manifest.md')));
});
