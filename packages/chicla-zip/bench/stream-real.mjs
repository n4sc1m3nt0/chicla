// C3.7: the check the unit tests cannot afford: a real streamed entry above 4 GiB (its size is only known at the end, so the data descriptor holds
// 8-byte sizes), written through writeZipStream with the data never in memory, and read back by independent tools. Memory is sampled while it runs.
//   node bench/stream-real.mjs [--stored] [--gib N]       (default N = 4.1; --stored uses level 0, so the zip itself is above 4 GiB and needs about N + 1 GiB of disk)
// ASCII names on purpose: Info-ZIP unzip 6.00 in a non-UTF-8 locale warns about UTF-8 names in zip64 entries (a quirk of that tool).
import { writeZipStream, testZip, listZip } from '../src/zipkit.mjs';
import { mkdtempSync, rmSync, statSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import zlib from 'node:zlib';

const stored = process.argv.includes('--stored'), gi = process.argv.indexOf('--gib'), n = Math.round((gi > 0 ? Number(process.argv[gi + 1]) : 4.1) * 2 ** 30);
const dir = mkdtempSync(join(tmpdir(), 'chicla-stream-real-')), p = join(dir, 'big.zip'); let bad = 0, peak = 0;
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) bad++; };
const blk = Buffer.alloc(2 ** 26); // 64 MiB of zeros, the same block over and over: the writer, not the source, is what is measured
async function* big() { for (let o = 0; o < n; o += blk.length) { peak = Math.max(peak, process.memoryUsage().rss); yield blk.subarray(0, Math.min(blk.length, n - o)); } }
try {
  const t0 = Date.now(), r = await writeZipStream(createWriteStream(p), [{ name: 'big.bin', stream: big() }, { name: 'after.txt', data: Buffer.from('tail') }], { level: stored ? 0 : 1 });
  console.log(`written ${statSync(p).size} bytes in ${((Date.now() - t0) / 1000).toFixed(1)} s; peak RSS ${(peak / 2 ** 20) | 0} MiB`);
  let crc = 0; for (let o = 0; o < n; o += blk.length) crc = zlib.crc32(blk.subarray(0, Math.min(blk.length, n - o)), crc);
  check(r.entries[0].crc32 === crc && r.entries[0].size === n, 'writer returned the size and the CRC computed independently');
  check(peak < 700 * 2 ** 20, `memory stayed flat (peak RSS ${(peak / 2 ** 20) | 0} MiB for ${(n / 2 ** 30).toFixed(1)} GiB of data)`);
  const u = spawnSync('unzip', ['-t', p], { encoding: 'utf8' }); check(u.status === 0 && /No errors detected/.test(u.stdout), 'unzip -t');
  const py = spawnSync('python3', ['-c', 'import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nassert z.getinfo("big.bin").file_size==int(sys.argv[2])\nassert z.read("after.txt")==b"tail"', p, String(n)], { encoding: 'utf8' });
  check(py.status === 0, `Python zipfile: testzip, size and tail${py.status ? ' (' + py.stderr.trim().split('\n').pop() + ')' : ''}`);
  const t = await testZip(p); check(t.files === 2 && t.bytes === n + 4, 'Chicla testZip: sizes and CRC match');
  const e = listZip(p).entries; check(!stored || e[1].localOffset > 2 ** 32, stored ? 'the second entry sits above 4 GiB' : 'listZip reads both entries');
} finally { rmSync(dir, { recursive: true, force: true }); }
process.exit(bad ? 1 : 0);
