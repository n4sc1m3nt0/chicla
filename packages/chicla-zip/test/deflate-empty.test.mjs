// Decision (Rodrigo, 2026-10-08): a deflate entry with 0 bytes of data is REFUSED, like `unzip` does ("invalid compressed data").
// A deflate stream is never empty (an empty file is the 2-byte stream 03 00, or a stored entry). Before this, the reader gave an empty file.
// Assertions use error classes and file system state, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openZip, readZipFile, testZip, extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-emptydef-')); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const put = (entries) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buildZip(entries)); return p; };
const BAD = { name: 'bad', data: '', method: 8, rawData: Buffer.alloc(0) };      // deflate, csize 0
const REAL_EMPTY_DEFLATE = { name: 'e8', data: '', method: 8, rawData: Buffer.from([0x03, 0x00]) }; // what Java, Python... write
const STORED_EMPTY = { name: 'e0', data: '', method: 0 };
const isZipError = (e) => e instanceof ZipError;

test('a deflate entry with no data is refused by read, testZip and extract', async () => {
  const p = put([{ name: 'ok.txt', data: 'fine' }, BAD]);
  assert.throws(() => readZipFile(p, 'bad'), isZipError);
  await assert.rejects(testZip(p), isZipError);
  const dest = join(dir, `d${n++}`);
  await assert.rejects(extractZip(p, dest), (e) => isZipError(e) && e.code === 'EUNSAFE');
  assert.deepEqual(readdirSync(dir).filter((f) => f.startsWith('d') && !f.endsWith('.zip')).includes(dest.split('/').pop()), false, 'destination created');
  const existing = join(dir, `x${n++}`); mkdirSync(existing);
  await assert.rejects(extractZip(p, existing), isZipError);
  assert.deepEqual(readdirSync(existing), [], 'existing destination changed');
});

test('listing still works (the entry is described, only using it is refused) and the other entries stay readable', () => {
  const p = put([{ name: 'ok.txt', data: 'fine' }, BAD]), z = openZip(p);
  try { assert.deepEqual(z.entries.map((e) => e.name), ['ok.txt', 'bad']); assert.equal(z.read('ok.txt').toString(), 'fine'); } finally { z.close(); }
});

test('the real empty deflate stream (03 00) and a stored empty entry are fine', async () => {
  const p = put([REAL_EMPTY_DEFLATE, STORED_EMPTY]);
  assert.equal(readZipFile(p, 'e8').length, 0); assert.equal(readZipFile(p, 'e0').length, 0);
  await testZip(p);
  const dest = join(dir, `d${n++}`); const r = await extractZip(p, dest);
  assert.equal(r.files, 2); assert.deepEqual(readdirSync(dest).sort(), ['e0', 'e8']);
});
