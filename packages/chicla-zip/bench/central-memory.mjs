#!/usr/bin/env node
// C15.4 (D126): what does openZip cost in memory and time for a big central directory? Not part of `npm test` (noisy, big files); run by hand.
//   node packages/chicla-zip/bench/central-memory.mjs [N ...]     (default: 100000 500000 1000000 2000000 entries)
// For each N it writes a zip of N empty stored files (names f0, f1, ... so ~52 bytes per central record) in a temp folder, then opens it in a FRESH child
// process and prints: central directory size, peak RSS, V8 heap used after opening, seconds. Extrapolates bytes per entry to MAX_CENTRAL (64 MiB since D128; it was 1 GiB).
import { mkdtempSync, openSync, writeSync, closeSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url), SRC = new URL("../src/zipkit.mjs", import.meta.url).href;
if (process.env.CHICLA_CM_CHILD) {
  const { openZip } = await import(SRC); const t = process.hrtime.bigint();
  const z = openZip(process.env.CHICLA_CM_CHILD); const sec = Number(process.hrtime.bigint() - t) / 1e9;
  if (global.gc) global.gc();
  console.log(JSON.stringify({ entries: z.entries.length, sec, rssMB: process.resourceUsage().maxRSS / 1024, heapMB: process.memoryUsage().heapUsed / 1048576 }));
  z.close(); process.exit(0);
}
const u16 = (b, o, v) => b.writeUInt16LE(v, o), u32 = (b, o, v) => b.writeUInt32LE(v >>> 0, o);
const CHUNK = 20000; // entries per write: the builder itself must never hold the whole directory in memory
const build = (path, n) => {
  const fd = openSync(path, "w"); let off = 0, size = 0;
  for (let from = 0; from < n; from += CHUNK) { // local headers
    const parts = []; for (let i = from; i < Math.min(n, from + CHUNK); i++) { const name = Buffer.from(`f${i}`), l = Buffer.alloc(30); u32(l, 0, 0x04034b50); u16(l, 4, 10); u16(l, 26, name.length); parts.push(l, name); off += 30 + name.length; }
    writeSync(fd, Buffer.concat(parts));
  }
  const cdOff = off; let at = 0;
  for (let from = 0; from < n; from += CHUNK) { // central directory
    const parts = []; for (let i = from; i < Math.min(n, from + CHUNK); i++) { const name = Buffer.from(`f${i}`), c = Buffer.alloc(46); u32(c, 0, 0x02014b50); u16(c, 4, 20); u16(c, 6, 10); u16(c, 28, name.length); u32(c, 38, (0o100644 << 16)); u32(c, 42, at); parts.push(c, name); at += 30 + name.length; size += 46 + name.length; }
    writeSync(fd, Buffer.concat(parts));
  }
  const e = Buffer.alloc(22); u32(e, 0, 0x06054b50);
  if (n >= 0xffff) { // more than 65534 entries: the zip64 record and locator, and the plain record says 0xffff / 0xffffffff
    const r = Buffer.alloc(56), l = Buffer.alloc(20); at = cdOff + size; u32(r, 0, 0x06064b50); r.writeBigUInt64LE(44n, 4); u16(r, 12, 45); u16(r, 14, 45);
    r.writeBigUInt64LE(BigInt(n), 24); r.writeBigUInt64LE(BigInt(n), 32); r.writeBigUInt64LE(BigInt(size), 40); r.writeBigUInt64LE(BigInt(cdOff), 48);
    u32(l, 0, 0x07064b50); l.writeBigUInt64LE(BigInt(at), 8); u32(l, 16, 1); writeSync(fd, r); writeSync(fd, l);
    u16(e, 8, 0xffff); u16(e, 10, 0xffff); u32(e, 12, 0xffffffff); u32(e, 16, 0xffffffff);
  } else { u16(e, 8, n); u16(e, 10, n); u32(e, 12, size); u32(e, 16, cdOff); }
  writeSync(fd, e); closeSync(fd); return size;
};
const ns = process.argv.slice(2).map(Number).filter((x) => x > 0), list = ns.length ? ns : [100000, 500000, 1000000, 2000000];
const dir = mkdtempSync(join(tmpdir(), "chicla-cm-")); let last;
try {
  for (const n of list) {
    const p = join(dir, `c${n}.zip`), cd = build(p, n);
    const r = spawnSync(process.execPath, [SELF], { env: { ...process.env, CHICLA_CM_CHILD: p }, encoding: "utf8", maxBuffer: 1 << 20 });
    if (r.status !== 0) { console.log(`${n} entries · central ${(cd / 1048576).toFixed(0)} MiB · FAILED (exit ${r.status}${r.signal ? " " + r.signal : ""}) ${(r.stderr || "").split("\n").find((l) => /error|heap/i.test(l)) ?? ""}`); rmSync(p); continue; }
    const o = JSON.parse(r.stdout); last = { ...o, cd };
    console.log(`${n} entries · central ${(cd / 1048576).toFixed(0)} MiB (${(cd / n).toFixed(0)} B each) · peak RSS ${o.rssMB.toFixed(0)} MiB (${(o.rssMB * 1048576 / n).toFixed(0)} B each) · heap after ${o.heapMB.toFixed(0)} MiB · ${o.sec.toFixed(2)} s`);
    rmSync(p);
  }
  if (last) { const per = last.rssMB * 1048576 / last.entries, full = (64 << 20) / (last.cd / last.entries); console.log(`at MAX_CENTRAL (64 MiB) that is about ${(full / 1e6).toFixed(1)} million entries and ${(full * per / 1073741824).toFixed(2)} GiB of RSS (linear extrapolation of the last line; this machine: node ${process.version})`); }
} finally { rmSync(dir, { recursive: true, force: true }); }
