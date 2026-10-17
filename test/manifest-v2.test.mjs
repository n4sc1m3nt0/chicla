// C7.1, slice b — `check-manifest --write` writes FILES.manifest as v2 (path, crc32, size; no sha256: the sha256 lives in
// FILES.baseline.json, D43) and `verify-delivery-zip` compares crc32 and size of every listed file with the zip's CENTRAL
// DIRECTORY, without decompressing anything (C7.2). A v1 manifest is still accepted and then only paths are compared.
// Oracles are independent of the code under test: crc32 from Python's zlib, sizes from stat, bytes from `unzip`.
// Tests assert error `code`s, never message text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOADER, CHECK_BUILD_COPY, CHECK_MANIFEST_COPY, VERIFY_DELIVERY_COPY, copyFiles, importPinned } from './toolchain-files.mjs';
const { MANIFEST_V2_HEADER, parseManifest } = await importPinned('manifest');
const { BASELINE_FILE, buildBaseline, serializeBaseline } = await importPinned('baseline');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COPY = [...CHECK_MANIFEST_COPY, ...CHECK_BUILD_COPY, ...VERIFY_DELIVERY_COPY, 'scripts/make-delivery-zip.mjs', LOADER]; // wrappers, the cores in the kit they run, and the pinned files
const dirs = [];
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };
test.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const run = (cwd, script, ...a) => spawnSync(process.execPath, [join(cwd, 'scripts', script), ...a], { cwd, encoding: 'utf8', maxBuffer: 1 << 26 });
const out = (r) => `exit=${r.status}\n${r.stdout}\n${r.stderr}`;
// independent crc32 (Python zlib), as 8 lowercase hex digits
const pyCrc = (file) => {
  const r = spawnSync('python3', ['-c', 'import sys,zlib;print("%08x"%(zlib.crc32(open(sys.argv[1],"rb").read())&0xffffffff))', file], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

const BIG = Buffer.alloc(70000); for (let i = 0; i < BIG.length; i++) BIG[i] = (i * 31 + (i >> 8)) & 0xff;
function makeProject() {
  const root = tmp('chicla-c71b-');
  const w = (rel, data) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), data); };
  copyFiles(ROOT, root, COPY);
  copyFileSync(join(ROOT, 'packages/chicla-kit/src/make-delivery.mjs'), join(root, 'packages/chicla-kit/src/make-delivery.mjs')); // C11.1 5e: scripts/make-delivery-zip.mjs is a wrapper over the core in the kit
  mkdirSync(join(root, 'packages/chicla-zip/src'), { recursive: true }); // C8.1: make-delivery-zip writes with chicla-zip
  copyFileSync(join(ROOT, 'packages/chicla-zip/src/zipkit.mjs'), join(root, 'packages/chicla-zip/src/zipkit.mjs'));
  w('package.json', '{"name":"fake","private":true,"version":"0.0.1"}\n');
  w('CLAUDE.md', '# rules\n');
  w('CHANGELOG.md', '<!-- CHANGELOG_FINGERPRINT: seq=7 file=CHICLA_PROJECT_STATUS-7.md app_sha256_12=aaaaaaaaaaaa changelog_sha256_12=bbbbbbbbbbbb -->\n# Changelog\n');
  w('CHICLA_PROJECT_STATUS-7.md', '# status\n');
  w('docs/notes.md', 'some notes, written once\n');
  w('docs/ação – 日本語.txt', 'non-ASCII name\n');
  w('docs/empty.txt', '');
  w('data/big.bin', BIG);
  return { root, w };
}
const manifestOf = (root) => readFileSync(join(root, 'FILES.manifest'), 'utf8');

test('check-manifest --write writes v2: header, then path, crc32 and size of every file (no sha256, no self entry)', () => {
  const { root } = makeProject();
  const r = run(root, 'check-manifest.mjs', '--write');
  assert.equal(r.status, 0, out(r));
  const text = manifestOf(root);
  const lines = text.split('\n');
  assert.equal(lines[0], MANIFEST_V2_HEADER, 'first line is exactly the v2 header');
  assert.equal(lines.at(-1), '', 'ends with a newline');
  const body = lines.slice(1, -1);
  assert.ok(body.length >= 8, 'every file of the tree is listed');
  for (const l of body) assert.equal(l.split('\t').length, 3, `three fields, no sha256: ${l}`);
  const entries = parseManifest(text);
  assert.ok(!entries.some((e) => e.path === 'FILES.manifest'), 'the manifest does not list itself');
  assert.deepEqual(entries.map((e) => e.path), [...entries.map((e) => e.path)].sort(), 'sorted, as before');
  for (const e of entries) {
    const f = join(root, e.path);
    assert.equal(e.size, statSync(f).size, `size of ${e.path} (stat)`);
    assert.equal(e.crc32.toString(16).padStart(8, '0'), pyCrc(f), `crc32 of ${e.path} (Python zlib)`);
  }
  const names = entries.map((e) => e.path);
  assert.ok(names.includes('docs/ação – 日本語.txt') && names.includes('docs/empty.txt'), 'non-ASCII and empty files are listed with their real values');
});

test('writing twice gives the same bytes; the check mode accepts what --write wrote', () => {
  const { root } = makeProject();
  assert.equal(run(root, 'check-manifest.mjs', '--write').status, 0);
  const first = manifestOf(root);
  assert.equal(run(root, 'check-manifest.mjs', '--write').status, 0);
  assert.equal(manifestOf(root), first, 'idempotent');
  const c = run(root, 'check-manifest.mjs');
  assert.equal(c.status, 0, out(c));
});

// ---- the delivery zip: verify against the central directory ----
function delivery() {
  const p = makeProject();
  const dir = tmp('chicla-c71b-out-');
  const zip = join(dir, 'ok.zip');
  const mk = run(p.root, 'make-delivery-zip.mjs', zip);
  assert.equal(mk.status, 0, out(mk));
  const names = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  assert.ok(names.includes('FILES.manifest') && names.includes(BASELINE_FILE));
  return { ...p, zip, dir };
}
// tampers with the finished zip: unzip, change one thing, zip again, verify
// sets bit 11 (central and local header) on entries whose name has non-ASCII bytes: what a UTF-8 aware zip tool does
const flagUtf8 = (zip) => {
  const buf = Buffer.from(readFileSync(zip));
  const e = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let pos = buf.readUInt32LE(e + 16);
  for (let n = buf.readUInt16LE(e + 10); n > 0; n--) {
    const nl = buf.readUInt16LE(pos + 28), lho = buf.readUInt32LE(pos + 42);
    if (buf.subarray(pos + 46, pos + 46 + nl).some((x) => x > 0x7f)) { buf.writeUInt16LE(buf.readUInt16LE(pos + 8) | 0x800, pos + 8); buf.writeUInt16LE(buf.readUInt16LE(lho + 6) | 0x800, lho + 6); }
    pos += 46 + nl + buf.readUInt16LE(pos + 30) + buf.readUInt16LE(pos + 32);
  }
  writeFileSync(zip, buf);
};
const tamper = (d, name, fn) => {
  const X = tmp(`chicla-c71b-x-${name}-`);
  spawnSync('unzip', ['-q', d.zip, '-d', X]);
  fn(X);
  const z = join(tmp('chicla-c71b-z-'), `${name}.zip`);
  spawnSync('zip', ['-qr', z, '.'], { cwd: X });
  flagUtf8(z); // Info-ZIP does not set bit 11 in every locale; the delivery must carry it (C8.2), so the stand-in tool gets it set
  return run(d.root, 'verify-delivery-zip.mjs', z);
};

test('a delivery built by make-delivery-zip carries a v2 manifest and passes verify-delivery-zip (control)', () => {
  const d = delivery();
  const text = spawnSync('unzip', ['-p', d.zip, 'FILES.manifest'], { encoding: 'utf8' }).stdout;
  assert.equal(text.split('\n')[0], MANIFEST_V2_HEADER);
  const v = run(d.root, 'verify-delivery-zip.mjs', d.zip);
  assert.equal(v.status, 0, out(v));
  assert.ok(!v.stderr.includes('EMANIFEST_SIZE') && !v.stderr.includes('EMANIFEST_CRC32'));
});

test('a file swapped for different bytes of the SAME size is refused: EMANIFEST_CRC32 names it', () => {
  const d = delivery();
  const v = tamper(d, 'same-size', (X) => writeFileSync(join(X, 'docs/notes.md'), 'SOME NOTES, WRITTEN ONCE\n'));
  assert.equal(v.status, 1, out(v));
  assert.ok(v.stderr.includes('EMANIFEST_CRC32') && !v.stderr.includes('EMANIFEST_SIZE'), v.stderr);
  assert.ok(v.stderr.includes('docs/notes.md'), 'the file is named');
});

test('a truncated file and an emptied file are refused: EMANIFEST_SIZE', () => {
  const d = delivery();
  const cut = tamper(d, 'truncated', (X) => writeFileSync(join(X, 'data/big.bin'), BIG.subarray(0, 30000)));
  assert.equal(cut.status, 1, out(cut));
  assert.ok(cut.stderr.includes('EMANIFEST_SIZE') && cut.stderr.includes('data/big.bin'), cut.stderr);
  const empty = tamper(d, 'emptied', (X) => writeFileSync(join(X, 'docs/notes.md'), ''));
  assert.equal(empty.status, 1, out(empty));
  assert.ok(empty.stderr.includes('EMANIFEST_SIZE') && empty.stderr.includes('docs/notes.md'), empty.stderr);
});

test('a file replaced by an OLDER version (what the manifest never saw) is refused: EMANIFEST_CRC32', () => {
  const d = delivery();
  const v = tamper(d, 'older', (X) => writeFileSync(join(X, 'data/big.bin'), Buffer.concat([BIG.subarray(0, 69999), Buffer.from([0])])));
  assert.equal(v.status, 1, out(v));
  assert.ok(v.stderr.includes('EMANIFEST_CRC32') && v.stderr.includes('data/big.bin'), v.stderr);
});

test('the size is compared on its own: a manifest that says another size (crc32 untouched) is refused: EMANIFEST_SIZE', () => {
  const d = delivery();
  const v = tamper(d, 'size-only', (X) => {
    const m = join(X, 'FILES.manifest');
    writeFileSync(m, readFileSync(m, 'utf8').replace(/^(docs\/notes\.md\t[0-9a-f]{8}\t)\d+$/m, '$199'));
  });
  assert.equal(v.status, 1, out(v));
  assert.ok(v.stderr.includes('EMANIFEST_SIZE') && v.stderr.includes('docs/notes.md') && !v.stderr.includes('EMANIFEST_CRC32'), v.stderr);
});

test('the baseline is exempt from the crc32/size check (circular: it hashes the manifest; its own seal and EBASELINE_* cover it)', () => {
  const d = delivery();
  const v = run(d.root, 'verify-delivery-zip.mjs', d.zip);
  assert.equal(v.status, 0, out(v));
  const listed = parseManifest(spawnSync('unzip', ['-p', d.zip, 'FILES.manifest'], { encoding: 'utf8' }).stdout).map((e) => e.path);
  assert.ok(listed.includes(BASELINE_FILE), 'still listed, as before (round 60)');
});

test('a v1 manifest is still accepted by verify-delivery-zip: only paths are compared, a changed file is not a manifest error', () => {
  const d = delivery();
  const v = tamper(d, 'v1', (X) => {
    const names = parseManifest(readFileSync(join(X, 'FILES.manifest'), 'utf8')).map((e) => e.path);
    writeFileSync(join(X, 'FILES.manifest'), names.join('\n') + '\n');
    writeFileSync(join(X, 'docs/notes.md'), 'SOME NOTES, WRITTEN ONCE\n'); // differs from what a v2 manifest would say
    const all = [...names, 'FILES.manifest'];
    writeFileSync(join(X, BASELINE_FILE), serializeBaseline(buildBaseline(X, all)));
  });
  assert.equal(v.status, 0, out(v));
});

test('--against a previous zip with a v1 manifest still works: paths only, nothing lost', () => {
  const d = delivery();
  const P = tmp('chicla-c71b-prev-');
  writeFileSync(join(P, 'FILES.manifest'), 'package.json\ndocs/notes.md\n');
  writeFileSync(join(P, 'package.json'), '{}\n');
  mkdirSync(join(P, 'docs')); writeFileSync(join(P, 'docs/notes.md'), 'old\n');
  const prev = join(tmp('chicla-c71b-prevzip-'), 'prev.zip');
  spawnSync('zip', ['-qr', prev, '.'], { cwd: P });
  assert.ok(existsSync(prev));
  const v = run(d.root, 'verify-delivery-zip.mjs', d.zip, '--against', prev);
  assert.equal(v.status, 0, out(v));
  assert.ok(v.stdout.includes('nothing lost'), v.stdout);
});
