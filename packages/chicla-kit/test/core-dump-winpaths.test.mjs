// M14, C14.7 (round 157, D113 confirmed), written before the code. Round 156 CI log, Windows: `chicla-kit` `emergency-dump` found no project root («no project root found», the zip name
// `afterRoundunknown`) because the scan kept `rel` as `path.relative()` gives it (backslashes on win32) while the rest of the core compares and splits it with «/» (the project root test
// `FILES.manifest` + `package.json`, `dir.split("/")`, `projRel`). The fix is ONE helper, `relPosix(root, p, pm = path)`, used wherever the scan makes a `rel`.
// A Linux run cannot take the win32 branch of the real scan, so: (1) the helper is tested with `path.win32` and `path.posix`; (2) a shape guard says the core makes every `rel` through it.
// The Windows behaviour itself is proven only by the CI log (G-C13), not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { relPosix } from '../src/emergency-dump.mjs';

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'emergency-dump.mjs'), 'utf8');

test('relPosix on win32 paths: backslashes become «/», at every depth, and a top-level file has no separator', () => {
  const w = path.win32, R = 'C:\\work';
  assert.equal(relPosix(R, 'C:\\work\\package.json', w), 'package.json');
  assert.equal(relPosix(R, 'C:\\work\\proj\\FILES.manifest', w), 'proj/FILES.manifest');
  assert.equal(relPosix(R, 'C:\\work\\a\\b\\c\\d.txt', w), 'a/b/c/d.txt');
  assert.equal(relPosix('C:\\work\\', 'C:\\work\\proj\\x y.md', w), 'proj/x y.md');
});

test('relPosix on posix paths is the identity of path.relative: a backslash in a POSIX file name is a name character and must NOT become «/»', () => {
  const p = path.posix;
  assert.equal(relPosix('/work', '/work/proj/FILES.manifest', p), 'proj/FILES.manifest');
  assert.equal(relPosix('/work', '/work/a\\b.txt', p), 'a\\b.txt');
  assert.equal(relPosix('/work', '/work/dir/we\\ird/c.txt', p), 'dir/we\\ird/c.txt');
});

test('relPosix defaults to the running platform\'s path module (what the scan uses)', () => {
  assert.equal(relPosix(path.resolve('x'), path.join(path.resolve('x'), 'a', 'b.txt')), 'a/b.txt');
});

test('shape guard: the scan makes every `rel` through relPosix (a bare `relative(root, p)` is how the Windows bug came in)', () => {
  assert.equal((SRC.match(/\brelative\(/g) ?? []).length, 1, 'path.relative must be called in exactly one place, inside relPosix');
  assert.equal((SRC.match(/relPosix\(root, p\)/g) ?? []).length, 2, 'the zip entries and the files of the scan');
  assert.ok(!/rel:\s*relative\(/.test(SRC));
});
