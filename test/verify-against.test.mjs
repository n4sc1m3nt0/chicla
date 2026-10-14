// C8.3 (round 78): `--against` and `--allow-removed` of verify-delivery-zip (and so of make-delivery-zip) work on a PATH with node only.
// The code was ported in rounds 76-77 (no `zip`, no `unzip`); this pins the behaviour so a later change cannot lose it silently.
// Previous zips are made with Python (absolute path), never by the code under test. Tests assert exit codes and file names in the output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPinned } from './toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PY = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();
const skip = !PY && 'no python3';

const setup = () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c83-')), bin = join(T, 'bin'), proj = join(T, 'proj');
  mkdirSync(bin); symlinkSync(process.execPath, join(bin, 'node'));
  for (const { path: rel } of parseManifest(readFileSync(join(ROOT, 'FILES.manifest'), 'utf8'))) {
    if (!existsSync(join(ROOT, rel))) continue;
    mkdirSync(dirname(join(proj, rel)), { recursive: true }); copyFileSync(join(ROOT, rel), join(proj, rel));
  }
  const env = { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
  const node = (script, ...a) => spawnSync(join(bin, 'node'), [join(proj, 'scripts', script), ...a], { cwd: proj, encoding: 'utf8', env, maxBuffer: 1 << 28 });
  const zip = join(T, 'new.zip');
  const mk = node('make-delivery-zip.mjs', zip); assert.equal(mk.status, 0, mk.stdout + mk.stderr);
  // a "previous upload": every file of the new zip plus `extra` entries; `prefix` wraps everything in one folder (as a download often does)
  const previous = (out, extra, prefix = '') => {
    const code = 'import zipfile,sys,json\nzin=zipfile.ZipFile(sys.argv[1]);zout=zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED)\nfor i in zin.infolist(): zout.writestr(sys.argv[3]+i.filename, zin.read(i.filename))\nfor n in json.loads(sys.argv[4]): zout.writestr(sys.argv[3]+n, b"old\\n")\nzout.close()';
    const r = spawnSync(PY, ['-c', code, zip, out, prefix, JSON.stringify(extra)], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
    return out;
  };
  return { T, node, zip, previous };
};

test('C8.3: a file of the previous zip that is not in this one is refused and named; --allow-removed lets it go', { skip }, () => {
  const { T, node, zip, previous } = setup();
  try {
    const prev = previous(join(T, 'prev.zip'), ['old/gone.txt']);
    const r = node('verify-delivery-zip.mjs', zip, '--against', prev);
    assert.equal(r.status, 1); assert.match(r.stderr, /old\/gone\.txt/);
    const ok = node('verify-delivery-zip.mjs', zip, '--against', prev, '--allow-removed', 'old/gone.txt');
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    const other = node('verify-delivery-zip.mjs', zip, '--against', prev, '--allow-removed', 'old/other.txt');
    assert.equal(other.status, 1, 'allowing a different path does not allow this one');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C8.3: an upload wrapped in one folder is compared by its inner paths', { skip }, () => {
  const { T, node, zip, previous } = setup();
  try {
    const wrapped = previous(join(T, 'wrapped.zip'), ['old/gone.txt'], 'upload-folder/');
    const r = node('verify-delivery-zip.mjs', zip, '--against', wrapped);
    assert.equal(r.status, 1); assert.match(r.stderr, /old\/gone\.txt/); assert.doesNotMatch(r.stderr, /upload-folder\/package\.json/);
    assert.equal(node('verify-delivery-zip.mjs', zip, '--against', wrapped, '--allow-removed', 'old/gone.txt').status, 0);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C8.3: names are compared in NFC (a previous zip written by macOS has NFD names)', { skip }, () => {
  const { T, node, zip, previous } = setup();
  try {
    const nfd = 'old/á-ação.txt', nfc = nfd.normalize('NFC');
    const prev = previous(join(T, 'nfd.zip'), [nfd]);
    assert.equal(node('verify-delivery-zip.mjs', zip, '--against', prev).status, 1);
    assert.equal(node('verify-delivery-zip.mjs', zip, '--against', prev, '--allow-removed', nfc).status, 0);
    assert.equal(node('verify-delivery-zip.mjs', zip, '--against', prev, '--allow-removed', nfd).status, 0, 'the path given on the command line may be NFD too (a macOS shell)');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C8.3: junk, private files and old status files in a previous zip are never "lost"', { skip }, () => {
  const { T, node, zip, previous } = setup();
  try {
    const prev = previous(join(T, 'junk.zip'), ['node_modules/x/index.js', '.DS_Store', '.env', 'CHICLA_PROJECT_STATUS-1.md']);
    const r = node('verify-delivery-zip.mjs', zip, '--against', prev);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C8.3: make-delivery-zip passes --against and --allow-removed on (a delivery that would lose a file is refused and deleted)', { skip }, () => {
  const { T, node, zip, previous } = setup();
  try {
    const prev = previous(join(T, 'prev.zip'), ['old/gone.txt']);
    const out = join(T, 'next.zip');
    const r = node('make-delivery-zip.mjs', out, '--against', prev);
    assert.equal(r.status, 1); assert.equal(existsSync(out), false); assert.match(r.stderr + r.stdout, /old\/gone\.txt/);
    const ok = node('make-delivery-zip.mjs', out, '--against', prev, '--allow-removed', 'old/gone.txt');
    assert.equal(ok.status, 0, ok.stdout + ok.stderr); assert.ok(existsSync(out));
  } finally { rmSync(T, { recursive: true, force: true }); }
});
