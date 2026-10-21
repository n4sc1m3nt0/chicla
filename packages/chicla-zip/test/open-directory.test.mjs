// C14.3 slice a (round 150): openZip of a directory is a ZipError with code EISDIR on every platform.
// On Windows, opening a directory for reading can succeed and the first read gives no bytes instead of EISDIR (seen in the CI
// logs of rounds 145 to 149). The test makes Linux behave the same way: every readSync returns 0 bytes. The code must look at
// what was opened BEFORE it reads, so the answer is EISDIR and not a vague «truncated zip».
// Error assertions use classes and codes, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openZip, listZip, readZipFile, ZipError } from '../src/zipkit.mjs';

let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-opendir-')); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });

const withEmptyReads = (fn) => {
  const real = fs.readSync;
  fs.readSync = () => 0; syncBuiltinESMExports();
  try { return fn(); } finally { fs.readSync = real; syncBuiltinESMExports(); }
};

test('openZip of a directory whose reads return no bytes (the Windows case) is EISDIR, as is listZip and readZipFile', () => {
  for (const f of [() => openZip(dir), () => listZip(dir), () => readZipFile(dir, 'a.txt')]) {
    assert.throws(() => withEmptyReads(f), (e) => e instanceof ZipError && e.code === 'EISDIR');
  }
});

test('a plain file that is not a zip still says ENOTZIP when reads return no bytes (the directory check does not swallow it)', () => {
  const p = join(dir, 'not-a-zip.bin'); writeFileSync(p, 'hello');
  assert.throws(() => openZip(p), (e) => e instanceof ZipError && e.code === 'ENOTZIP');
});

test('the descriptor of a refused directory is closed (a second open of the same directory gives the same error)', () => {
  for (let i = 0; i < 3; i++) assert.throws(() => withEmptyReads(() => openZip(dir)), (e) => e.code === 'EISDIR');
});
