// C3.3: the check the unit tests cannot afford: a real data entry above 4 GiB, written and read back by independent tools.
//   node bench/zip64-real.mjs [--stored] [--gib N]       (needs about N + 1 GiB of free memory and disk; default N = 4.1)
// Default: zeros, deflated (the zip stays a few MB): proves sizes above 4 GiB, which a one-shot zlib call silently truncated before round 21.
// --stored: the data is stored, so the zip itself is above 4 GiB and the entries after it need zip64 offsets and a zip64 end record.
// ASCII names on purpose: Info-ZIP unzip 6.00 in a non-UTF-8 locale warns about UTF-8 names in zip64 entries (a quirk of that tool).
import { writeZip, listZip, testZip } from '../src/zipkit.mjs';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import zlib from 'node:zlib';

const stored = process.argv.includes('--stored'), gi = process.argv.indexOf('--gib'), n = Math.round((gi > 0 ? Number(process.argv[gi + 1]) : 4.1) * 2 ** 30);
const dir = mkdtempSync(join(tmpdir(), 'chicla-zip64-real-')), p = join(dir, 'big.zip'); let bad = 0;
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) bad++; };
try {
  const t0 = Date.now(), r = await writeZip(p, [{ name: 'big.bin', data: Buffer.alloc(n) }, { name: 'after.txt', data: Buffer.from('tail') }], { level: stored ? 0 : 6 });
  console.log(`written ${statSync(p).size} bytes in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  let crc = 0; const blk = Buffer.alloc(2 ** 26); for (let o = 0; o < n; o += blk.length) crc = zlib.crc32(blk.subarray(0, Math.min(blk.length, n - o)), crc);
  check(r.entries[0].crc32 === crc && r.entries[0].size === n, 'writer returned the size and the CRC computed independently');
  const u = spawnSync('unzip', ['-t', p], { encoding: 'utf8' }); check(u.status === 0 && /No errors detected/.test(u.stdout), 'unzip -t');
  const py = spawnSync('python3', ['-c', 'import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nassert z.getinfo("big.bin").file_size==int(sys.argv[2])\nassert z.read("after.txt")==b"tail"', p, String(n)]); check(py.status === 0, 'Python zipfile (testzip, size, read after the big entry)');
  const t = await testZip(p); check(t.files === 2 && t.bytes === n + 4, 'Chicla testZip: sizes and CRC match');
  const e = listZip(p).entries; check(!stored || e[1].localOffset > 2 ** 32, stored ? 'the second entry sits above 4 GiB' : 'listZip reads both entries');
} finally { rmSync(dir, { recursive: true, force: true }); }
process.exit(bad ? 1 : 0);
