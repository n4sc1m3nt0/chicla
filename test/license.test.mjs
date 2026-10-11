// G-C2 / D46 — the licence is Apache-2.0 (Rodrigo, 2026-10-11): the text in the root and the SPDX id in every package.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('LICENSE is the Apache License 2.0, whole terms included', () => {
  assert.ok(existsSync(join(root, 'LICENSE')), 'no LICENSE in the root');
  const t = read('LICENSE');
  assert.match(t, /Apache License\s+Version 2\.0, January 2004/);
  for (const part of ['TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION', '2. Grant of Copyright License.', '3. Grant of Patent License.', '4. Redistribution.', '7. Disclaimer of Warranty.', '8. Limitation of Liability.', 'END OF TERMS AND CONDITIONS']) assert.ok(t.includes(part), `missing: ${part}`);
});

test('the root and both packages declare Apache-2.0 (SPDX), never UNLICENSED', () => {
  for (const p of ['package.json', 'packages/chicla-zip/package.json', 'packages/chicla-kit/package.json']) assert.equal(JSON.parse(read(p)).license, 'Apache-2.0', p);
});

test('CLAUDE.md no longer tells the AI to leave the licence open', () => {
  assert.doesNotMatch(read('CLAUDE.md'), /leave `UNLICENSED`/);
  assert.match(read('CLAUDE.md'), /Apache-2\.0/);
});

test('the licence travels: LICENSE is in FILES.manifest', () => {
  assert.ok(read('FILES.manifest').split('\n').includes('LICENSE'));
});
