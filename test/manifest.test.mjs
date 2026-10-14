// C7.1, slice a1 — FILES.manifest format v2 can be READ everywhere before anything writes it.
// v1: one path per line (what every delivery so far has). v2: first line `# chicla-manifest v2`, then `path<TAB>crc32<TAB>size[<TAB>sha256]`
// (crc32 as 8 lowercase hex digits). Tests assert error `code`s, never message text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_MANIFEST_COPY, PINNED, VERIFY_DELIVERY_COPY, copyFiles, importPinned } from './toolchain-files.mjs';
const { MANIFEST_V2_HEADER, parseManifest, serializeManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const codeOf = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const SHA = 'a'.repeat(64);

test('v1: one path per line, blank lines ignored, no extra fields', () => {
  assert.deepEqual(parseManifest('a.txt\nsub/b.txt\n\n'), [{ path: 'a.txt' }, { path: 'sub/b.txt' }]);
  assert.deepEqual(parseManifest(''), []);
});

test('v2: header, then path, crc32, size and an optional sha256', () => {
  const text = `${MANIFEST_V2_HEADER}\na.txt\t0000abcd\t12\nsub/b.txt\tffffffff\t0\t${SHA}\n`;
  assert.deepEqual(parseManifest(text), [{ path: 'a.txt', crc32: 0xabcd, size: 12 }, { path: 'sub/b.txt', crc32: 0xffffffff, size: 0, sha256: SHA }]);
});

test('a v1 file whose first path merely starts with «#» is still v1 (only the exact header makes it v2)', () => {
  assert.deepEqual(parseManifest('#notes.txt\nb.txt\n'), [{ path: '#notes.txt' }, { path: 'b.txt' }]);
});

test('serialize then parse gives the same entries; v1 entries serialize as plain paths', () => {
  const v2 = [{ path: 'a b/ç.txt', crc32: 1, size: 2 }, { path: 'z', crc32: 0, size: 0, sha256: SHA }];
  assert.deepEqual(parseManifest(serializeManifest(v2)), v2);
  assert.ok(serializeManifest(v2).startsWith(MANIFEST_V2_HEADER + '\n'));
  assert.equal(serializeManifest([{ path: 'a' }, { path: 'b' }]), 'a\nb\n');
});

test('refusals carry a stable code: bad field count, crc, size, sha256, duplicate and unsafe paths, mixed formats', () => {
  const v2 = (...rows) => `${MANIFEST_V2_HEADER}\n${rows.join('\n')}\n`;
  assert.equal(codeOf(() => parseManifest(v2('a.txt\t0000abcd'))), 'EMANIFEST_FORMAT', 'too few fields');
  assert.equal(codeOf(() => parseManifest(v2('a.txt\t0000abcd\t1\t' + SHA + '\textra'))), 'EMANIFEST_FORMAT', 'too many fields');
  assert.equal(codeOf(() => parseManifest(v2('a.txt\tABCD\t1'))), 'EMANIFEST_FORMAT', 'crc not 8 lowercase hex');
  assert.equal(codeOf(() => parseManifest(v2('a.txt\t0000abcd\t-1'))), 'EMANIFEST_FORMAT', 'negative size');
  assert.equal(codeOf(() => parseManifest(v2('a.txt\t0000abcd\t1.5'))), 'EMANIFEST_FORMAT', 'fractional size');
  assert.equal(codeOf(() => parseManifest(v2('a.txt\t0000abcd\t1\t' + 'g'.repeat(64)))), 'EMANIFEST_FORMAT', 'bad sha256');
  assert.equal(codeOf(() => parseManifest(v2('a.txt\t0000abcd\t1', 'a.txt\t0000abcd\t1'))), 'EMANIFEST_DUPLICATE', 'duplicate path');
  assert.equal(codeOf(() => parseManifest('a.txt\na.txt\n')), 'EMANIFEST_DUPLICATE', 'duplicate path in v1');
  assert.equal(codeOf(() => parseManifest(v2('../x\t0000abcd\t1'))), 'EMANIFEST_UNSAFE', 'path escapes the root');
  assert.equal(codeOf(() => parseManifest(v2('/abs\t0000abcd\t1'))), 'EMANIFEST_UNSAFE', 'absolute path');
  assert.equal(codeOf(() => parseManifest('a/../b\n')), 'EMANIFEST_UNSAFE', 'unsafe path in v1');
  assert.equal(codeOf(() => parseManifest(`${MANIFEST_V2_HEADER}\nplain.txt\n`)), 'EMANIFEST_FORMAT', 'a v1 line under a v2 header');
});

test('serialize refuses a path with a tab or newline, and half-filled v2 entries', () => {
  assert.equal(codeOf(() => serializeManifest([{ path: 'a\tb', crc32: 0, size: 0 }])), 'EMANIFEST_UNSAFE');
  assert.equal(codeOf(() => serializeManifest([{ path: 'a\nb' }])), 'EMANIFEST_UNSAFE');
  assert.equal(codeOf(() => serializeManifest([{ path: 'a', crc32: 1 }])), 'EMANIFEST_FORMAT', 'crc without size');
  assert.equal(codeOf(() => serializeManifest([{ path: 'a', crc32: 1, size: 1 }, { path: 'b' }])), 'EMANIFEST_FORMAT', 'mixed v1 and v2 entries');
});

// ---- the readers: check-manifest and verify-delivery-zip accept a v2 manifest ----
const project = (manifestText) => {
  const d = mkdtempSync(join(tmpdir(), 'chicla-c71-'));
  copyFiles(ROOT, d, [...CHECK_MANIFEST_COPY, ...VERIFY_DELIVERY_COPY]); // the two wrappers, their cores in the kit and the pinned files they read
  for (const [rel, text] of Object.entries({ 'package.json': '{"version":"0.0.1"}\n', 'CLAUDE.md': 'x\n', 'CHANGELOG.md': '<!-- CHANGELOG_FINGERPRINT: seq=1 -->\n', 'CHICLA_PROJECT_STATUS-1.md': 's\n', 'a.txt': 'alpha\n', 'sub/b.txt': 'beta\n' })) { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), text); }
  writeFileSync(join(d, 'FILES.manifest'), manifestText);
  return d;
};
const ALL = ['CHANGELOG.md', 'CHICLA_PROJECT_STATUS-1.md', 'CLAUDE.md', 'a.txt', 'package.json', PINNED.baseline, 'scripts/check-manifest.mjs', PINNED.manifest, PINNED.policy, 'scripts/verify-delivery-zip.mjs', 'sub/b.txt'].sort();
const v2Of = (paths) => `${MANIFEST_V2_HEADER}\n${paths.map((p) => `${p}\t00000000\t0`).join('\n')}\n`;

test('check-manifest reads a v2 manifest: passes when nothing is lost, fails naming the lost path when something is', () => {
  const d = project(v2Of(ALL));
  try {
    const ok = spawnSync(process.execPath, [join(d, 'scripts/check-manifest.mjs')], { cwd: d, encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    writeFileSync(join(d, 'FILES.manifest'), v2Of([...ALL, 'gone/lost.txt']));
    const bad = spawnSync(process.execPath, [join(d, 'scripts/check-manifest.mjs')], { cwd: d, encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /gone\/lost\.txt/);
    assert.doesNotMatch(bad.stderr, /crc|\t/, 'the lost path is printed alone, without the v2 columns');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('check-manifest refuses a corrupt manifest with the code, instead of passing', () => {
  const d = project(`${MANIFEST_V2_HEADER}\na.txt\tnot-a-crc\t1\n`);
  try {
    const r = spawnSync(process.execPath, [join(d, 'scripts/check-manifest.mjs')], { cwd: d, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /EMANIFEST_FORMAT/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('verify-delivery-zip reads a v2 manifest inside the zip (complete: passes on the manifest check; missing path: named)', () => {
  const d = project(v2Of(ALL));
  try {
    const mkzip = (name, files) => { const z = join(d, name); spawnSync('zip', ['-q', z, '-@'], { cwd: d, input: files.join('\n') + '\n' }); return z; };
    const files = [...ALL, 'FILES.manifest'];
    const good = spawnSync(process.execPath, [join(d, 'scripts/verify-delivery-zip.mjs'), mkzip('good.zip', files)], { cwd: d, encoding: 'utf8' });
    // the crc32/size here are invented (zeros): a mismatch is expected and covered in manifest-v2.test.mjs; this test is about READING v2
    assert.doesNotMatch(good.stderr, /EMANIFEST_(FORMAT|DUPLICATE|UNSAFE)|cannot be read/, 'the v2 manifest is read fine: ' + good.stderr);
    writeFileSync(join(d, 'FILES.manifest'), v2Of([...ALL, 'sub/ghost.txt']));
    const bad = spawnSync(process.execPath, [join(d, 'scripts/verify-delivery-zip.mjs'), mkzip('bad.zip', files)], { cwd: d, encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /sub\/ghost\.txt/);
    writeFileSync(join(d, 'FILES.manifest'), `${MANIFEST_V2_HEADER}\na.txt\tzz\t1\n`);
    const corrupt = spawnSync(process.execPath, [join(d, 'scripts/verify-delivery-zip.mjs'), mkzip('corrupt.zip', files)], { cwd: d, encoding: 'utf8' });
    assert.equal(corrupt.status, 1);
    assert.match(corrupt.stderr, /EMANIFEST_FORMAT/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
