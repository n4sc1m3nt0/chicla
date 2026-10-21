// Round 202 / C15.19 / G-C5 ZIP-014 (D135, third security review): `read` and `cat` took the FIRST of several entries with the same name, silently,
// while Python's `ZipFile.read(name)` takes the LAST: a scanner and a user of the same zip could see two different files. `extractZip` already refused
// a duplicate (EUNSAFE); the read path now refuses too (EAMBIGUOUS, nothing is returned). Exact spelling first, as before: one exact match is read even
// when another spelling of the same name (NFD against NFC) is present; the NFC fallback is ambiguous only when it finds more than one.
// Zips come from test/zipfab.mjs; Python is the independent reader. Assertions use error codes, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openZip, listZip, readZipFile, testZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-readdup-')); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };
const ambiguous = (err) => err instanceof ZipError && err.code === 'EAMBIGUOUS';
const havePython = spawnSync('python3', ['-c', '1'], { stdio: 'ignore' }).status === 0;
const DUP = () => put(buildZip([{ name: 'a.txt', data: 'FIRST-benign' }, { name: 'a.txt', data: 'SECOND-evil' }, { name: 'b.txt', data: 'bravo' }]));
const cli = (...args) => spawnSync(process.execPath, [fileURLToPath(new URL('../src/zipkit.mjs', import.meta.url)), ...args], { encoding: 'utf8' });

test('ZIP-014: readZipFile and the handle refuse a name that two entries share (EAMBIGUOUS), nothing is returned', () => {
  const p = DUP();
  assert.throws(() => readZipFile(p, 'a.txt'), ambiguous);
  const z = openZip(p);
  try { assert.throws(() => z.read('a.txt'), ambiguous); assert.equal(z.read('b.txt').toString(), 'bravo', 'the other names still read'); } finally { z.close(); }
});

test('ZIP-014: the fixture is a real differential, Python read() takes the LAST entry', { skip: !havePython }, () => {
  const out = spawnSync('python3', ['-I', '-c', 'import sys,zipfile,warnings;warnings.simplefilter("ignore");sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("a.txt").decode())', DUP()], { encoding: 'utf8' }).stdout;
  assert.equal(out, 'SECOND-evil');
});

test('ZIP-014: the list and the test still work on such a zip (only the read of that name is refused)', async () => {
  const p = DUP();
  assert.deepEqual(listZip(p).entries.map((e) => e.name), ['a.txt', 'a.txt', 'b.txt']);
  assert.deepEqual(await testZip(p), { files: 3, bytes: 12 + 11 + 5 });
});

test('ZIP-014: `cat` exits 1 with no output and no stack trace; `--json` is not involved', () => {
  const r = cli('cat', DUP(), 'a.txt');
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});

test('ZIP-014: two spellings that only normalise to the same name (no exact match) are ambiguous too', () => {
  const p = put(buildZip([{ name: 'Å.txt', data: 'angstrom sign' }, { name: 'Å.txt', data: 'A ring' }]));
  assert.throws(() => readZipFile(p, 'Å.txt'), ambiguous);
});

test('ZIP-014 controls: one entry reads; the exact spelling wins over another spelling; a folder of the same name is not a match', () => {
  assert.equal(readZipFile(put(buildZip([{ name: 'one.txt', data: 'x' }])), 'one.txt').toString(), 'x');
  const both = put(buildZip([{ name: 'café.txt', data: 'NFC' }, { name: 'café.txt', data: 'NFD' }]));
  assert.equal(readZipFile(both, 'café.txt').toString(), 'NFC');
  assert.equal(readZipFile(both, 'café.txt').toString(), 'NFD');
  const folder = put(buildZip([{ name: 'a/', dir: true }, { name: 'a', data: 'file' }])); // a folder is a name with a slash (ZIP-020, D136)
  assert.equal(readZipFile(folder, 'a').toString(), 'file');
});

test('ZIP-014 docs: §2 of zip-handling.md says that read and cat refuse a duplicate name', () => {
  const doc = readFileSync(new URL('../../../docs/zip-handling.md', import.meta.url), 'utf8');
  assert.match(doc, /ZIP-014/);
  assert.match(doc, /refuse \(`EAMBIGUOUS`, nothing returned\) a name that matches more than one file entry/);
});
