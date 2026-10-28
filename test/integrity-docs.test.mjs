// C17.4 (round 247, D140; plan in docs/plan-a1-integrity.md §5): `docs/integrity.md` says what `packages/chicla-kit/src/integrity.mjs` does, and a test holds the doc to the code,
// like `fingerprint-docs` does for the fingerprint. Written before the doc; red until it exists. A rule, an export, a caller or a code the doc does not name goes red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MOD = 'packages/chicla-kit/src/integrity.mjs', DOC = 'docs/integrity.md';
const I = await import(pathToFileURL(join(ROOT, MOD)).href);
const doc = () => read(DOC);
const code = (f) => read(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

test('docs/integrity.md exists and docs/README.md lists it', () => {
  assert.ok(existsSync(join(ROOT, DOC)), `${DOC} does not exist`);
  assert.ok(read('docs/README.md').includes('`integrity.md`'), 'docs/README.md has no row for integrity.md');
});

test('the doc names every export of the module', () => {
  for (const name of Object.keys(I)) assert.ok(doc().includes('`' + name + '`'), `the doc does not name the export ${name}`);
});

test('the doc names every rule id the module produces, and the EINTEGRITY code each one becomes in verify-delivery', () => {
  const ids = ['lf', 'pin', 'state', 'fingerprint'];
  for (const id of ids) {
    assert.ok(doc().includes('`' + id + '`'), `rule id ${id}`);
    assert.ok(doc().includes('`EINTEGRITY_' + id.toUpperCase() + '`'), `code for ${id}`);
  }
  assert.ok(code('packages/chicla-kit/src/verify-delivery.mjs').includes('EINTEGRITY_${r.id.toUpperCase()}'), 'verify-delivery builds the code from the id');
  assert.ok(code('packages/chicla-kit/src/check-manifest.mjs').includes('EINTEGRITY_LF'), 'check-manifest uses EINTEGRITY_LF');
});

test('the doc lists every file of the LF list and every file of the pin', () => {
  for (const f of I.LF_FILES) assert.ok(doc().includes('`' + f + '`'), f);
  for (const [name, src] of Object.entries(I.TOOLCHAIN)) { assert.ok(doc().includes('`' + name + '`'), name); assert.ok(doc().includes(src), src); }
});

test('the doc names the three callers, and each really imports the module', () => {
  for (const f of ['bump-round', 'verify-delivery', 'check-manifest']) {
    assert.ok(doc().includes('`' + f + '`'), `the doc does not name ${f}`);
    assert.match(code(`packages/chicla-kit/src/${f}.mjs`), /from "\.\/integrity\.mjs"/, `${f} does not import integrity.mjs`);
  }
});

test('the doc states the design limits: pure, not pinned, not in RECOVER/, the reader is the caller\'s, --against is exempt, an absent file skips', () => {
  const d = doc();
  for (const w of ['pure', 'not pinned', 'RECOVER/', 'reader', '--against', 'skipped', 'D-242c', 'D7']) assert.ok(d.includes(w), `the doc does not say «${w}»`);
  assert.equal(/^\s*import\s/m.test(read(MOD)), false, 'the module still has no import');
});

test('pointers: fingerprint.md, manifest.md, the kit README and the status file Map name docs/integrity.md', () => {
  for (const f of ['docs/fingerprint.md', 'docs/manifest.md', 'packages/chicla-kit/README.md']) assert.ok(read(f).includes('integrity.md'), `${f} has no pointer to integrity.md`);
  const status = read(readdirSyncStatus());
  assert.ok(status.includes('docs/integrity.md'), 'the status file Map does not name docs/integrity.md');
});

import { readdirSync } from 'node:fs';
function readdirSyncStatus() { return readdirSync(ROOT).find((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f)); }
