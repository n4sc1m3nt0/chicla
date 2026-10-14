// C7.1, slice c — the manifest format is documented in docs/manifest.md, and the doc cannot drift from the code:
// the header it shows, every EMANIFEST_* code the scripts can raise, and the one exemption (the baseline) are checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINNED, importPinned } from './toolchain-files.mjs';
const { MANIFEST_V2_HEADER } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DOC = 'docs/manifest.md';

test('docs/manifest.md exists and docs/README.md lists it', () => {
  assert.ok(existsSync(join(ROOT, DOC)), `${DOC} is missing`);
  assert.ok(read('docs/README.md').includes('`manifest.md`'), 'docs/README.md has no row for manifest.md');
});

test('the doc shows the exact v2 header the code uses', () => {
  assert.ok(read(DOC).includes(MANIFEST_V2_HEADER));
});

test('every EMANIFEST_* code the scripts raise is explained in the doc (and no code is documented that no script raises)', () => {
  const inCode = new Set();
  for (const f of [PINNED.manifest, 'packages/chicla-kit/src/verify-delivery.mjs', 'packages/chicla-kit/src/check-manifest.mjs', 'scripts/make-delivery-zip.mjs']) for (const m of read(f).matchAll(/EMANIFEST_[A-Z0-9]+/g)) inCode.add(m[0]);
  const inDoc = new Set([...read(DOC).matchAll(/EMANIFEST_[A-Z0-9]+/g)].map((m) => m[0]));
  assert.ok(inCode.size >= 5, `expected at least 5 codes in the scripts, found ${[...inCode]}`);
  assert.deepEqual([...inCode].filter((c) => !inDoc.has(c)).sort(), [], 'codes in the code but not in the doc');
  assert.deepEqual([...inDoc].filter((c) => !inCode.has(c)).sort(), [], 'codes in the doc but in no script');
});

test('the doc says the baseline is listed but exempt from the crc32/size check, and that the check does not decompress', () => {
  const t = read(DOC);
  assert.match(t, /FILES\.baseline\.json/);
  assert.match(t, /exempt/i);
  assert.match(t, /central directory/i);
  assert.match(t, /decompress/i);
});
