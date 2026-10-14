// C8.2 (round 77): verify-delivery-zip reads the bytes of the zip itself (stored and deflate, from the central directory),
// without `unzip`, and requires the UTF-8 flag (bit 11) on non-ASCII names in the DELIVERY only, not in --against uploads.
// It does NOT use chicla-zip: the verifier is the independent check of what the writer made, so it keeps its own small reader.
// Run with a PATH that has node only: no zip, no unzip. Python (absolute path) rewrites zips to tamper with them.
// Tests assert exit codes and error codes (found in the output), not wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPinned } from './toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PY = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();
const T0 = () => mkdtempSync(join(tmpdir(), 'chicla-c82-'));
const bare = (T) => { const b = join(T, 'bin'); mkdirSync(b); symlinkSync(process.execPath, join(b, 'node')); return b; };
const sh = (bin, cwd, script, ...a) => spawnSync(join(bin, 'node'), [join(cwd, 'scripts', script), ...a], { cwd, encoding: 'utf8', env: { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR }, maxBuffer: 1 << 28 });

const delivery = (T) => {
  const proj = join(T, 'proj'), bin = bare(T);
  for (const { path: rel } of parseManifest(readFileSync(join(ROOT, 'FILES.manifest'), 'utf8'))) {
    if (!existsSync(join(ROOT, rel))) continue;
    mkdirSync(dirname(join(proj, rel)), { recursive: true }); copyFileSync(join(ROOT, rel), join(proj, rel));
  }
  const zip = join(T, 'd.zip');
  const r = sh(bin, proj, 'make-delivery-zip.mjs', zip);
  return { proj, bin, zip, r };
};
// rewrite a zip with Python: fn is Python source that sees `zin` (ZipFile) and `zout` (ZipFile)
const rewrite = (zip, out, body) => {
  const code = `import zipfile,sys\nzin=zipfile.ZipFile(sys.argv[1])\nzout=zipfile.ZipFile(sys.argv[2],"w")\n${body}\nzout.close()`;
  const r = spawnSync(PY, ['-c', code, zip, out], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
};

test('C8.2: the whole chain (make-delivery, verify) runs on a PATH with node only', { skip: !PY && 'no python3' }, () => {
  const T = T0();
  try {
    const { r } = delivery(T);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C8.2: a zip with every entry STORED (method 0) or every entry DEFLATED (method 8) verifies', { skip: !PY && 'no python3' }, () => {
  const T = T0();
  try {
    const { bin, proj, zip, r } = delivery(T); assert.equal(r.status, 0, r.stderr);
    for (const [name, method] of [['stored', 'zipfile.ZIP_STORED'], ['deflated', 'zipfile.ZIP_DEFLATED']]) {
      const out = join(T, `${name}.zip`);
      rewrite(zip, out, `for i in zin.infolist():\n    zout.writestr(i, zin.read(i.filename), ${method})`);
      const v = sh(bin, proj, 'verify-delivery-zip.mjs', out);
      assert.equal(v.status, 0, `${name}: ${v.stdout}${v.stderr}`);
    }
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C8.2: a file swapped for other bytes of the SAME size is refused (EMANIFEST_CRC32 and EBASELINE_MISMATCH)', { skip: !PY && 'no python3' }, () => {
  const T = T0();
  try {
    const { bin, proj, zip } = delivery(T);
    const out = join(T, 'tampered.zip');
    rewrite(zip, out, 'for i in zin.infolist():\n    d=zin.read(i.filename)\n    if i.filename=="LICENSE": d=bytes((b+1)%256 for b in d[:1])+d[1:]\n    zout.writestr(i, d)');
    const v = sh(bin, proj, 'verify-delivery-zip.mjs', out);
    assert.equal(v.status, 1);
    assert.match(v.stderr, /EMANIFEST_CRC32/); assert.match(v.stderr, /EBASELINE_MISMATCH/);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C8.2: an entry whose data is damaged (the central directory CRC no longer matches the bytes) is refused: EZIP_DATA', { skip: !PY && 'no python3' }, () => {
  const T = T0();
  try {
    const { bin, proj, zip } = delivery(T);
    const buf = readFileSync(zip);
    // flip one byte inside the data of the first STORED or DEFLATED entry named LICENSE: find its local header
    const at = buf.indexOf(Buffer.from('LICENSE')); // first occurrence is the local header's name
    const nl = buf.readUInt16LE(at - 30 + 26), xl = buf.readUInt16LE(at - 30 + 28), start = at - 30 + 30 + nl + xl;
    buf[start + 2] ^= 0xff;
    const bad = join(T, 'damaged.zip'); writeFileSync(bad, buf);
    const v = sh(bin, proj, 'verify-delivery-zip.mjs', bad);
    assert.equal(v.status, 1);
    assert.match(v.stderr, /EZIP_DATA|EBASELINE_MISMATCH/);
    assert.match(v.stderr, /EZIP_DATA/);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

// clear bit 11 in the central directory of every entry (names stay valid UTF-8, so every reader still decodes them)
const clearBit11 = (zip, out) => {
  const buf = Buffer.from(readFileSync(zip));
  const e = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let pos = buf.readUInt32LE(e + 16);
  for (let n = buf.readUInt16LE(e + 10); n > 0; n--) {
    buf.writeUInt16LE(buf.readUInt16LE(pos + 8) & ~0x800, pos + 8);
    pos += 46 + buf.readUInt16LE(pos + 28) + buf.readUInt16LE(pos + 30) + buf.readUInt16LE(pos + 32);
  }
  writeFileSync(out, buf);
};

test('C8.2: the delivery needs bit 11 on non-ASCII names (EUTF8_FLAG); a --against upload without it is fine', { skip: !PY && 'no python3' }, () => {
  const T = T0();
  try {
    const { bin, proj, zip, r } = delivery(T); assert.equal(r.status, 0, r.stderr);
    // the real tree has a non-ASCII name? make sure of it: docs or tests carry "—" or accents in file NAMES only if present; so add one explicitly
    const w = join(proj, 'docs', 'relatório-ação.md'); writeFileSync(w, 'x\n');
    const zip2 = join(T, 'd2.zip');
    assert.equal(sh(bin, proj, 'make-delivery-zip.mjs', zip2).status, 0);
    assert.equal(sh(bin, proj, 'verify-delivery-zip.mjs', zip2).status, 0, 'flagged: ok');
    const noflag = join(T, 'noflag.zip'); clearBit11(zip2, noflag);
    const v = sh(bin, proj, 'verify-delivery-zip.mjs', noflag);
    assert.equal(v.status, 1); assert.match(v.stderr, /EUTF8_FLAG/); assert.match(v.stderr, /relat/);
    // as an --against upload (the old zip of someone else's tool) it is accepted: only the delivery is held to it
    const a = sh(bin, proj, 'verify-delivery-zip.mjs', zip2, '--against', noflag);
    assert.equal(a.status, 0, a.stdout + a.stderr);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

const storedCopy = (zip, out) => rewrite(zip, out, 'for i in zin.infolist():\n    zout.writestr(i, zin.read(i.filename), zipfile.ZIP_STORED)');
const cdEntry = (buf, name) => { // position of the central directory record of `name`
  const e = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let pos = buf.readUInt32LE(e + 16);
  for (let n = buf.readUInt16LE(e + 10); n > 0; n--) {
    const nl = buf.readUInt16LE(pos + 28);
    if (buf.subarray(pos + 46, pos + 46 + nl).toString('utf8') === name) return pos;
    pos += 46 + nl + buf.readUInt16LE(pos + 30) + buf.readUInt16LE(pos + 32);
  }
  throw new Error(`no entry ${name}`);
};

test('C8.2: one flipped byte inside a STORED entry (sizes unchanged) is caught by the crc32: EZIP_DATA', { skip: !PY && 'no python3' }, () => {
  const T = T0();
  try {
    const { bin, proj, zip } = delivery(T);
    const st = join(T, 'stored.zip'); storedCopy(zip, st);
    const buf = Buffer.from(readFileSync(st));
    const lho = buf.readUInt32LE(cdEntry(buf, 'LICENSE') + 42), start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    buf[start + 3] ^= 0x01;
    const bad = join(T, 'flip.zip'); writeFileSync(bad, buf);
    const v = sh(bin, proj, 'verify-delivery-zip.mjs', bad);
    assert.equal(v.status, 1); assert.match(v.stderr, /EZIP_DATA/);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C8.2: a central directory that claims another size than the data holds is refused: EZIP_DATA', { skip: !PY && 'no python3' }, () => {
  const T = T0();
  try {
    const { bin, proj, zip } = delivery(T);
    const st = join(T, 'stored.zip'); storedCopy(zip, st);
    const buf = Buffer.from(readFileSync(st));
    const pos = cdEntry(buf, 'LICENSE');
    buf.writeUInt32LE(buf.readUInt32LE(pos + 24) + 1, pos + 24); // uncompressed size one too big; the stored data still has the real length
    const bad = join(T, 'size.zip'); writeFileSync(bad, buf);
    const v = sh(bin, proj, 'verify-delivery-zip.mjs', bad);
    assert.equal(v.status, 1); assert.match(v.stderr, /EZIP_DATA/);
  } finally { rmSync(T, { recursive: true, force: true }); }
});
