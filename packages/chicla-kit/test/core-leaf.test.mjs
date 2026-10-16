// M14, C14.7 slice 2 (round 158, D113), written before the code. Round 157 CI log, Windows: 4 chicla-kit tests still red, all one cause: three places took the last part of a PATH with
// `p.split("/").pop()`, and on win32 a path has backslashes: `verify-delivery` printed «nothing lost vs C:\...\prev.zip» (2 tests), `recovery-report` printed «baseline C:\...\base.zip» (1 test) and,
// worse, `HERE.split("/").pop() === "RECOVER"` was never true, so run from a RECOVER/ folder on Windows it SKIPPED the toolchain digest check (EHASH_TOOLCHAIN, exit 3) and ran with exit 0 (1 test).
// One helper, `leaf(p, pm = path)` in pinned/manifest.mjs (both modules already import it), used at all five places. A Linux run cannot take the win32 branch of the real code, so: the helper is tested with
// `path.win32` / `path.posix`, and a shape guard says the two sources no longer split a path by hand. The Windows behaviour itself is proven only by the CI log (G-C13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leaf } from '../src/pinned/manifest.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = (f) => readFileSync(join(SRC, f), 'utf8');

test('leaf on win32 paths: the last part, with backslashes (a zip, the RECOVER folder, a path with spaces)', () => {
  const w = path.win32;
  assert.equal(leaf('C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\chicla-x\\prev.zip', w), 'prev.zip');
  assert.equal(leaf('D:\\a\\chicla\\RECOVER', w), 'RECOVER');
  assert.equal(leaf('C:\\my work\\old zips\\base 1.zip', w), 'base 1.zip');
  assert.equal(leaf('prev.zip', w), 'prev.zip');
});

test('leaf on posix paths: the last part; a backslash in a POSIX name is a name character and stays', () => {
  const p = path.posix;
  assert.equal(leaf('/tmp/x/prev.zip', p), 'prev.zip'); assert.equal(leaf('/work/RECOVER', p), 'RECOVER');
  assert.equal(leaf('/tmp/a\\b.zip', p), 'a\\b.zip');
});

test('leaf defaults to the running platform\'s path module', () => {
  assert.equal(leaf(path.join(path.resolve('x'), 'RECOVER')), 'RECOVER');
});

test('shape guard: verify-delivery and recovery-report no longer take the last part of a path by hand, and RECOVER is recognised through leaf', () => {
  for (const f of ['verify-delivery.mjs', 'pinned/recovery-report.mjs']) assert.ok(!/\.split\("\/"\)\.pop\(\)/.test(read(f)), `${f} still has .split("/").pop()`);
  assert.equal((read('verify-delivery.mjs').match(/leaf\(prev\)/g) ?? []).length, 2, 'both messages of --against');
  const rr = read('pinned/recovery-report.mjs');
  assert.ok(/leaf\(HERE\) === "RECOVER"/.test(rr), 'the toolchain-digest check must recognise RECOVER on every platform');
  assert.ok(/leaf\(zip\)/.test(rr) && /leaf\(baselineZip\)/.test(rr));
});
