// C18.4 (round 253, AUDIT-5 F-4): lines 59-60 of `pinned/manifest.mjs`, the JS table that computes crc32 when this Node has no `zlib.crc32` (before 22.2 / 20.15), were never run
// on the Node of the sandbox, only on the CI's Node 18. This test reaches them on any Node: a child process removes `zlib.crc32` BEFORE it imports the module, then the
// module's crc32 must give the published check value (CRC-32 of "123456789" is 0xcbf43926) and agree with `zlib.crc32` (or with python's zlib, when there is no native one) on a larger input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = pathToFileURL(join(root, 'packages/chicla-kit/src/pinned/manifest.mjs')).href;
const data = createHash('sha256').update('seed').digest('hex').repeat(40);

// `import * as zlib` in the module sees the change only after syncBuiltinESMExports(); without it the native function would still be used and the test would pass without reaching the table.
const child = (removeNative) => spawnSync(process.execPath, ['--input-type=module', '-e', `
  import zlib from 'node:zlib';
  import { syncBuiltinESMExports } from 'node:module';
  ${removeNative ? 'zlib.crc32 = undefined; syncBuiltinESMExports();' : ''}
  const { crc32 } = await import(${JSON.stringify(MANIFEST)});
  const ns = await import('node:zlib');
  console.log(JSON.stringify({ native: typeof zlib.crc32, viaNs: typeof ns.crc32, check: crc32(Buffer.from('123456789')), empty: crc32(Buffer.alloc(0)), big: crc32(Buffer.from(${JSON.stringify(data)})) }));
`], { encoding: 'utf8' });

test('pinned/manifest.mjs crc32: with no native zlib.crc32 the JS table gives the standard check value, the empty value and the same sum as the native one', () => {
  const r = child(true);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.native, 'undefined', 'the child really ran without the native function');
  assert.equal(j.viaNs, 'undefined', 'and the namespace the module reads follows it');
  assert.equal(j.check, 0xcbf43926);
  assert.equal(j.empty, 0);
  if (typeof zlib.crc32 === 'function') assert.equal(j.big, zlib.crc32(Buffer.from(data)) >>> 0);
  else assert.equal(j.big, child(false) && JSON.parse(child(false).stdout).big);
});

test('pinned/manifest.mjs crc32: with the native function (this Node, when it has one) the value is the same', () => {
  const j = JSON.parse(child(false).stdout);
  assert.equal(j.check, 0xcbf43926);
  assert.equal(j.empty, 0);
});
