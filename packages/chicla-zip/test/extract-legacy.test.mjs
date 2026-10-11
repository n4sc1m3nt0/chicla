// C2.6 (AUDIT-1, A-5): `extractZip` takes the same `legacyEncoding` as `openZip` and `listZip`, so names without bit 11, Unicode Path
// or valid UTF-8 are written to disk with the name the caller chose to decode them with. Default stays cp437.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-xlegacy-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (entries) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buildZip(entries)); return p; };
const parent = () => { const p = join(dir, `case${n++}`); mkdirSync(p); return p; };
const cafeE9 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x2e, 0x74, 0x78, 0x74]); // "caf" 0xE9 ".txt": not UTF-8; cp437 says Θ, windows-1252 says é
const sjis = Buffer.from([0x83, 0x41, 0x2e, 0x74, 0x78, 0x74]); // Shift_JIS ア + ".txt"

test('the default is cp437 and the chosen legacy encoding decides the name on disk (small and large entries)', async () => {
  for (const [opts, want] of [[undefined, 'cafΘ.txt'], [{}, 'cafΘ.txt'], [{ legacyEncoding: 'cp437' }, 'cafΘ.txt'], [{ legacyEncoding: 'windows-1252' }, 'café.txt']]) {
    for (const data of ['x', 'y'.repeat(300000)]) {
      const dest = join(parent(), 'out');
      await extractZip(put([{ name: cafeE9, data, method: 8 }]), dest, opts);
      assert.deepEqual(readdirSync(dest), [want], JSON.stringify(opts));
    }
  }
});

test('a multi-byte legacy encoding names folders as well as files', async () => {
  const dest = join(parent(), 'out');
  await extractZip(put([{ name: Buffer.concat([sjis, Buffer.from('/in.txt')]), data: 'x' }]), dest, { legacyEncoding: 'shift_jis' });
  assert.deepEqual(readdirSync(dest), ['ア.txt']);
  assert.deepEqual(readdirSync(join(dest, 'ア.txt')), ['in.txt']);
});

test('an unknown or Unicode legacyEncoding is refused with EBADARG before anything is created, new or existing destination', async () => {
  for (const legacyEncoding of ['no-such-encoding', 'utf-8', 5]) {
    const p = parent(), dest = join(p, 'out'), z = put([{ name: cafeE9, data: 'x' }]);
    await assert.rejects(extractZip(z, dest, { legacyEncoding }), (err) => err instanceof ZipError && err.code === 'EBADARG', String(legacyEncoding));
    assert.deepEqual(readdirSync(p), []);
    const old = join(parent(), 'old'); mkdirSync(old);
    await assert.rejects(extractZip(z, old, { legacyEncoding }), (err) => err instanceof ZipError && err.code === 'EBADARG');
    assert.deepEqual(readdirSync(old), []);
  }
});
