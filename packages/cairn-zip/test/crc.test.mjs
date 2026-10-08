// R4 / C1.4: CRC-32 uses zlib.crc32 when Node has it (22.2+, 20.15+), and a JS implementation otherwise. Both must agree
// on everything, including incremental use. CAIRN_ZIP_JS_CRC=1 forces the JS path so CI can exercise it on any Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { crc32, crc32Js, crc32Source, makeCrc32 } from '../src/zipkit.mjs';
import { crc32 as reference } from './zipfab.mjs';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const forced = Boolean(process.env.CAIRN_ZIP_JS_CRC);
const hasNative = typeof zlib.crc32 === 'function';

// small deterministic PRNG so failures are reproducible
const rng = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const bytes = (r, n) => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (r() * 256) | 0; return b; };

test('known vectors, for the selected implementation and for the JS one', () => {
  for (const f of [crc32, crc32Js]) {
    assert.equal(f(Buffer.alloc(0)), 0);
    assert.equal(f(Buffer.from('123456789')), 0xcbf43926);
    assert.equal(f(Buffer.from('hello')), 907060870);
    assert.equal(f(Buffer.from('world'), f(Buffer.from('hello'))), 4192936109, 'incremental: the previous result is the seed');
  }
});

test('selected, JS and the test reference agree on random data of many sizes', () => {
  const r = rng(1234);
  for (const n of [0, 1, 2, 3, 7, 8, 9, 15, 16, 17, 255, 256, 257, 4095, 4096, 4097, 70000]) {
    const b = bytes(r, n), want = reference(b);
    assert.equal(crc32(b), want, `selected, ${n} bytes`);
    assert.equal(crc32Js(b), want, `js, ${n} bytes`);
  }
});

test('incremental use gives the same result however the data is split', () => {
  const r = rng(99), b = bytes(r, 100000), want = reference(b);
  for (const f of [crc32, crc32Js]) {
    let c = 0;
    for (let i = 0; i < b.length; ) { const n = 1 + ((r() * 9000) | 0); c = f(b.subarray(i, i + n), c); i += n; }
    assert.equal(c, want);
  }
});

test('typed-array views with an offset are read from their own start, not from the underlying buffer', () => {
  const backing = Buffer.from('xxxxhello worldyyyy'), view = new Uint8Array(backing.buffer, backing.byteOffset + 4, 11);
  for (const f of [crc32, crc32Js]) assert.equal(f(view), reference(Buffer.from('hello world')));
});

test('a large buffer agrees too', () => {
  const b = bytes(rng(7), 3 * 1024 * 1024);
  assert.equal(crc32(b), crc32Js(b));
});

test('the selection follows what Node offers (and the override)', () => {
  assert.equal(crc32Source, hasNative && !forced ? 'native' : 'js');
  assert.equal(typeof crc32Js, 'function');
});

test('makeCrc32: a real function is used as-is, anything else falls back to JS', () => {
  const calls = [];
  const fake = (buf, prev) => { calls.push([buf.length, prev]); return 42; };
  const m = makeCrc32(fake);
  assert.equal(m.source, 'native');
  assert.equal(m.crc32(Buffer.from('abc')), 42);
  assert.equal(m.crc32(Buffer.from('abcd'), 7), 42);
  assert.deepEqual(calls, [[3, 0], [4, 7]], 'the seed defaults to 0 and is passed through');
  for (const notFn of [undefined, null, 42, 'crc32', {}]) {
    const j = makeCrc32(notFn);
    assert.equal(j.source, 'js');
    assert.equal(j.crc32(Buffer.from('123456789')), 0xcbf43926);
  }
});

test('the JS fallback path passes the whole read suite (child process with CAIRN_ZIP_JS_CRC=1)', { skip: forced }, () => {
  const env = { ...process.env, CAIRN_ZIP_JS_CRC: '1' };
  const probe = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { crc32Source } from ${JSON.stringify(here('../src/zipkit.mjs'))}; console.log(crc32Source);`], { env, encoding: 'utf8' });
  assert.equal(probe.stdout.trim(), 'js', probe.stderr);
  const r = spawnSync(process.execPath, ['--test', here('./read.test.mjs'), here('./open.test.mjs'), here('./legacy-encoding.test.mjs')], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout.slice(-2000) + r.stderr.slice(-1000));
});
