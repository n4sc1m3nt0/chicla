// C7.3 (round 85, D56/D57): two names that differ only in NFC/NFD are an ERROR, never a warning, in the manifest (EMANIFEST_COLLISION),
// on disk in `check-manifest`, `--write` included (EMANIFEST_COLLISION), and in a delivery zip (EZIP_COLLISION). Before this, the NFC
// comparison (round 1r) put both names under one key: a lost file could hide behind its look-alike. Tests assert codes, never wording.
// The zip with look-alike names is written by Python (independent writer). Tests that need two such files on disk skip where the file system folds them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_MANIFEST_COPY, copyFiles, importPinned } from './toolchain-files.mjs';
const { parseManifest, serializeManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PY = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();
const NFC = 'caf\u00e9.txt', NFD = 'cafe\u0301.txt';
const codeOf = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const H = '# chicla-manifest v2';

// can this file system hold both spellings as two files?
const holdsBoth = (() => {
  const d = mkdtempSync(join(tmpdir(), 'chicla-c73-probe-'));
  try { writeFileSync(join(d, NFC), '1'); writeFileSync(join(d, NFD), '2'); return readdirSync(d).length === 2; } finally { rmSync(d, { recursive: true, force: true }); }
})();

test('C7.3: parseManifest refuses two paths that differ only in NFC/NFD (v1 and v2); the exact same path stays EMANIFEST_DUPLICATE', () => {
  assert.equal(codeOf(() => parseManifest(`a.txt\n${NFC}\n${NFD}\n`)), 'EMANIFEST_COLLISION');
  assert.equal(codeOf(() => parseManifest(`${H}\n${NFC}\t00000000\t1\n${NFD}\t00000000\t1\n`)), 'EMANIFEST_COLLISION');
  assert.equal(codeOf(() => parseManifest(`dir/${NFC}\ndir/${NFD}\n`)), 'EMANIFEST_COLLISION', 'inside a folder too');
  assert.equal(codeOf(() => parseManifest(`${NFC}\n${NFC}\n`)), 'EMANIFEST_DUPLICATE', 'byte-equal is still a duplicate');
  assert.equal(codeOf(() => parseManifest(`${NFC}\ncafe.txt\nb/${NFD}\n`)), null, 'different names, no collision');
});

test('C7.3: serializeManifest refuses to write a collision', () => {
  assert.equal(codeOf(() => serializeManifest([{ path: NFC }, { path: NFD }])), 'EMANIFEST_COLLISION');
  assert.equal(codeOf(() => serializeManifest([{ path: NFC, crc32: 1, size: 1 }, { path: NFD, crc32: 2, size: 2 }])), 'EMANIFEST_COLLISION');
});

const project = (files, manifest) => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c73-'));
  copyFiles(ROOT, T, CHECK_MANIFEST_COPY); // the wrapper, its core in the kit and the pinned files it reads
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(T, rel)), { recursive: true }); writeFileSync(join(T, rel), text); }
  if (manifest !== undefined) writeFileSync(join(T, 'FILES.manifest'), manifest);
  const run = (...a) => spawnSync(process.execPath, [join(T, 'scripts/check-manifest.mjs'), ...a], { cwd: T, encoding: 'utf8' });
  return { T, run };
};

test('C7.3: two files on disk that differ only in NFC/NFD fail the check and --write (the manifest is left as it was)', { skip: !holdsBoth && 'this file system folds the two names' }, () => {
  const { T, run } = project({ 'a.txt': 'a', [NFC]: '1', [NFD]: '2' }, 'a.txt\n');
  try {
    const c = run(); assert.equal(c.status, 1, c.stdout + c.stderr); assert.match(c.stderr, /EMANIFEST_COLLISION/);
    const w = run('--write'); assert.equal(w.status, 1, w.stdout + w.stderr); assert.match(w.stderr, /EMANIFEST_COLLISION/);
    assert.equal(readFileSync(join(T, 'FILES.manifest'), 'utf8'), 'a.txt\n', 'FILES.manifest was not written');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C7.3: a manifest with two look-alike paths fails the check with EMANIFEST_COLLISION', () => {
  const { T, run } = project({ 'a.txt': 'a', [NFC]: '1' }, `a.txt\n${NFC}\n${NFD}\n`);
  try { const c = run(); assert.equal(c.status, 1, c.stdout + c.stderr); assert.match(c.stderr, /EMANIFEST_COLLISION/); } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C7.3: the NFC comparison still works when there is no collision (manifest NFD, disk NFC: nothing lost)', () => {
  const { T, run } = project({ 'a.txt': 'a', [NFC]: '1' }, `a.txt\n${NFD}\n`);
  try { const c = run(); assert.equal(c.status, 0, c.stdout + c.stderr); assert.doesNotMatch(c.stderr, /COLLISION/); } finally { rmSync(T, { recursive: true, force: true }); }
});

const pyzip = (path, names) => assert.equal(spawnSync(PY, ['-c', 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1],"w");[z.writestr(n,"x") for n in json.loads(sys.argv[2])];z.close()', path, JSON.stringify(names)], { encoding: 'utf8' }).status, 0);
const verify = (zip) => spawnSync(process.execPath, [join(ROOT, 'scripts/verify-delivery-zip.mjs'), zip], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });

test('C7.3: a zip with two names that differ only in NFC/NFD is refused with EZIP_COLLISION; distinct names are not', { skip: !PY && 'no python3' }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c73-'));
  try {
    const bad = join(T, 'bad.zip'); pyzip(bad, ['package.json', `dir/${NFC}`, `dir/${NFD}`]);
    const r = verify(bad); assert.equal(r.status, 1); assert.match(r.stderr + r.stdout, /EZIP_COLLISION/);
    const ok = join(T, 'ok.zip'); pyzip(ok, ['package.json', `dir/${NFC}`, 'dir/cafe.txt']);
    assert.doesNotMatch(verify(ok).stderr + verify(ok).stdout, /EZIP_COLLISION/);
  } finally { rmSync(T, { recursive: true, force: true }); }
});
