// AUDIT-1 (end of M2): guarantees that the mutation pass showed to be unprotected, plus one real bug.
//  1. setuid / setgid / sticky are stripped from files (fast and slow path) and folders (ROADMAP §5, "retira setuid/setgid").
//  2. An entry with no data that declares bytes is refused by extractZip itself (the inline check was never exercised).
//  3. Extracting into the ROOT of a mounted volume works: the temp folder must live on the same volume as the destination
//     (found by probe: `/dev/shm` inside `/dev` failed with EXDEV; same shape as a Docker volume or a USB drive).
// Assertions use error classes and file system state, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync, accessSync, constants, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';
const WIN = process.platform === 'win32';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-audit1-')); mkdirSync(join(dir, 'zips')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (entries) => { const p = join(dir, 'zips', `z${n++}.zip`); writeFileSync(p, buildZip(entries)); return p; };
const parent = () => { const p = join(dir, `case${n++}`); mkdirSync(p); return p; };
const text = (len) => Buffer.from('chicla '.repeat(Math.ceil(len / 7)).slice(0, len));

const SPECIAL = 0o7000;
test('setuid, setgid and sticky bits are never applied: small file, large file and folder', async () => {
  for (const special of [0o4000, 0o2000, 0o1000, 0o7000]) {
    const dest = join(parent(), 'out');
    await extractZip(put([
      { name: 'small.bin', data: 'x', mode: 0o100000 | special | 0o755 },
      { name: 'small-deflate.txt', data: text(500), method: 8, mode: 0o100000 | special | 0o755 },
      { name: 'large.bin', data: text(300000), method: 8, mode: 0o100000 | special | 0o755 }, // above the fast-path threshold
      { name: 'large-stored.bin', data: text(300000), method: 0, mode: 0o100000 | special | 0o755 },
      { name: 'dir/', dir: true, mode: 0o040000 | special | 0o755 },
      { name: 'dir/inner.txt', data: 'y', mode: 0o100000 | special | 0o644 },
    ]), dest);
    for (const f of ['small.bin', 'small-deflate.txt', 'large.bin', 'large-stored.bin', 'dir', 'dir/inner.txt'])
      assert.equal(statSync(join(dest, f)).mode & SPECIAL, 0, `${f} kept special bits (${special.toString(8)})`);
    if (!WIN) assert.equal(statSync(join(dest, 'small.bin')).mode & 0o777, 0o755); // the ordinary bits are still honoured (Windows has no mode bits)
  }
});

test('an entry with no data that declares bytes or a CRC is refused up front or at write time, and nothing is left', async () => {
  const cases = {
    'declares 5 bytes, has none': { name: 'bad.bin', data: '', method: 0, usize: 5, csize: 0 },
    'declares a CRC, has no data': { name: 'bad.bin', data: '', method: 0, crc: 0x12345678, csize: 0 },
  };
  for (const [label, bad] of Object.entries(cases)) {
    const p = parent(), dest = join(p, 'out');
    await assert.rejects(extractZip(put([{ name: 'ok.txt', data: 'fine' }, bad]), dest), (err) => err instanceof ZipError, label);
    assert.deepEqual(readdirSync(p), [], `${label}: destination or temp folder left behind`);
    const existing = join(parent(), 'out'); mkdirSync(existing); writeFileSync(join(existing, 'keep.txt'), 'mine');
    await assert.rejects(extractZip(put([{ name: 'ok.txt', data: 'fine' }, bad]), existing), (err) => err instanceof ZipError, label);
    assert.deepEqual(readdirSync(existing), ['keep.txt'], `${label}: existing destination changed`);
  }
});

// A mount point is found, not created (that needs root and a platform): a folder whose parent is on another device and where
// this user can write to both. On Linux as root that is /dev/shm (tmpfs inside devtmpfs); as a normal user, or on a machine
// without such a pair, the test is skipped and says so. G-C3 (a real Mac with a second volume) is where it is checked there.
const mountPair = () => {
  for (const mount of ['/dev/shm', '/Volumes/Macintosh HD']) {
    try { const up = join(mount, '..'); if (statSync(mount).dev !== statSync(up).dev) { accessSync(mount, constants.W_OK); accessSync(up, constants.W_OK); return mount; } } catch { /* next */ }
  }
  return null;
};
test('extracting into the root of a mounted volume works (temp folder on the same volume as the destination)', async (t) => {
  const mount = mountPair();
  if (!mount) return t.skip('no mount point whose parent is on another device and writable by this user (root on Linux has /dev/shm)');
  const tag = `chicla-audit1-${process.pid}-${n++}`, files = [`${tag}-a.txt`, tag];
  try {
    const r = await extractZip(put([{ name: `${tag}-a.txt`, data: 'hi' }, { name: `${tag}/b.txt`, data: 'there' }]), mount);
    assert.equal(r.files, 2);
    assert.equal(readFileSync(join(mount, `${tag}-a.txt`), 'utf8'), 'hi');
    assert.equal(readFileSync(join(mount, tag, 'b.txt'), 'utf8'), 'there');
    assert.deepEqual(readdirSync(join(mount, '..')).filter((x) => x.startsWith('.chicla-tmp-')), [], 'temp folder left in the parent');
    assert.deepEqual(readdirSync(mount).filter((x) => x.startsWith('.chicla-tmp-')), [], 'temp folder left in the mount');
  } finally { for (const f of files) rmSync(join(mount, f), { recursive: true, force: true }); }
  assert.equal(existsSync(join(mount, tag)), false);
});
