// Round 207 / C15.24 / G-C5 ZIP-020 (D136, fourth security review): a folder is decided by the NAME (a trailing slash) only, as Python `zipfile` and `unzip` do.
// Before, an entry whose Unix mode said "folder" counted as a folder even without the slash: `read` and `cat` skipped it (so `a` + `a` with the folder-by-mode
// entry second read BENIGN where Python reads EVIL, with no EAMBIGUOUS), and a single such entry was extracted as a FOLDER where Python and `unzip` make a file.
// Now: such an entry is a file entry for `read` (a duplicate is EAMBIGUOUS in both orders) and extraction refuses it (EUNSAFE, nothing written).
// A name WITH a slash stays a folder whatever its mode says. Zips from test/zipfab.mjs; Python is the independent reader. Assertions use codes, never text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { listZip, readZipFile, extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-dirname-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };
const havePython = spawnSync('python3', ['-c', '1'], { stdio: 'ignore' }).status === 0;
const FILE = { name: 'a', data: 'BENIGN', mode: 0o100644 }, MODEDIR = { name: 'a', data: 'EVIL', mode: 0o040755 };
const code = (c) => (e) => e instanceof ZipError && e.code === c;

test('ZIP-020: a duplicate name is EAMBIGUOUS in read and cat whichever entry is first, also when one has the folder mode', () => {
  assert.throws(() => readZipFile(put(buildZip([FILE, MODEDIR])), 'a'), code('EAMBIGUOUS'));
  assert.throws(() => readZipFile(put(buildZip([MODEDIR, FILE])), 'a'), code('EAMBIGUOUS'));
});

test('ZIP-020: the fixture is a real differential, Python read() gives the LAST one of the two orders', { skip: !havePython }, () => {
  const py = (p) => spawnSync('python3', ['-I', '-c', 'import sys,zipfile;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("a").decode())', p], { encoding: 'utf8' }).stdout;
  assert.equal(py(put(buildZip([FILE, MODEDIR]))), 'EVIL'); assert.equal(py(put(buildZip([MODEDIR, FILE]))), 'BENIGN');
});

test('ZIP-020: a single entry with the folder mode and no slash is a file for list and read, as for Python', () => {
  const p = put(buildZip([MODEDIR]));
  assert.equal(listZip(p).entries[0].isDir, false);
  assert.equal(readZipFile(p, 'a').toString(), 'EVIL');
});

test('ZIP-020: extraction refuses that entry (EUNSAFE) and writes nothing, not even a folder', async () => {
  const p = put(buildZip([MODEDIR, { name: 'ok.txt', data: 'fine' }])), dest = join(dir, `d${n++}`);
  await assert.rejects(extractZip(p, dest), code('EUNSAFE'));
  assert.equal(existsSync(dest), false);
});

test('ZIP-020 controls: a name with a slash is a folder whatever its mode, and extracts as a folder', async () => {
  const p = put(buildZip([{ name: 'd/', dir: true }, { name: 'e/', data: '', mode: 0o100644 }, { name: 'd/f.txt', data: 'x' }])), dest = join(dir, `d${n++}`);
  assert.deepEqual(listZip(p).entries.map((e) => e.isDir), [true, true, false]);
  await extractZip(p, dest);
  assert.ok(statSync(join(dest, 'd')).isDirectory() && statSync(join(dest, 'e')).isDirectory());
  assert.equal(readFileSync(join(dest, 'd', 'f.txt'), 'utf8'), 'x');
});

test('ZIP-020 docs: §3 of zip-handling.md says a folder is decided by the name and a folder-mode entry without a slash is refused', () => {
  const doc = readFileSync(new URL('../../../docs/zip-handling.md', import.meta.url), 'utf8');
  assert.match(doc, /ZIP-020/); assert.match(doc, /a folder is decided by its NAME/i);
});
