// Test helper (not a test): builds zip files byte by byte so tests can fabricate hostile or odd archives.
// Deliberately independent of src/: it has its own CRC-32 and never imports the code under test.
import { deflateRawSync } from 'node:zlib';

const TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const DOS_TIME = 0x6000; // 12:00:00
const DOS_DATE = ((2026 - 1980) << 9) | (10 << 5) | 8; // 2026-10-08

/** Unicode Path extra field (0x7075): version 1, CRC-32 of the raw name, UTF-8 name. */
export const unicodePathExtra = (rawName, utf8Name, { crc, version = 1 } = {}) => {
  const name = Buffer.from(utf8Name, 'utf8');
  return Buffer.concat([u16(0x7075), u16(5 + name.length), Buffer.from([version]), u32(crc ?? crc32(rawName)), name]);
};

/**
 * entries: [{ name: string|Buffer, data?: string|Buffer, method?: 0|8, flags?: number, extra?: Buffer,
 *             mode?: number, dir?: boolean,
 *             crc?, usize?, csize?: override what the central directory (and local header) declare,
 *             methodField?: override the method number written (data stays as built by `method`),
 *             rawData?: bytes stored as-is instead of the (de)compressed data }]
 *             zip64?: { fields?: ['usize','csize','offset'] (which central fields hold 0xffffffff, default all three),
 *                       values?: { usize, csize, offset } (what the zip64 extra says instead of the real value; BigInt ok),
 *                       noExtra?: leave the 0x0001 extra out, rawExtra?: Buffer used as the whole extra field }
 * opts: { eocd: { disk, cdDisk, cdOff } } overrides for the end-of-central-directory record.
 *       zip64Eocd?: true | { total, cdSize, cdOff, disk, cdDisk, recSize, sig, locSig, locOffset, locDisk, locDisks, noLocator }
 *         writes a zip64 end-of-central-directory record and locator and sets 0xffff / 0xffffffff in the plain record.
 */
export const buildZip = (entries, opts = {}) => {
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const rawName = Buffer.isBuffer(e.name) ? e.name : Buffer.from(e.name, 'utf8');
    const data = e.dir ? Buffer.alloc(0) : Buffer.from(e.data ?? '');
    const method = e.method ?? 0;
    const comp = e.rawData ?? (method === 8 ? deflateRawSync(data) : data); // an empty deflate entry is the 2-byte stream a real writer emits, never 0 bytes (C3.1 found unzip rejects 0)
    const crc = e.crc ?? crc32(data), usize = e.usize ?? data.length, csize = e.csize ?? comp.length;
    const flags = e.flags ?? 0, extra = e.extra ?? Buffer.alloc(0), mfield = e.methodField ?? method, lExtra = e.localExtra ?? extra; // localExtra: a local-header extra field that differs from the central one (real zips do this)
    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(flags), u16(mfield), u16(DOS_TIME), u16(DOS_DATE),
      u32(crc), u32(csize), u32(usize), u16(rawName.length), u16(lExtra.length), rawName, lExtra, comp]);
    const mode = e.mode ?? (e.dir ? 0o040755 : 0o100644);
    let cExtra = extra, cCsize = csize, cUsize = usize, cOff = offset;
    if (e.zip64) {
      const z = e.zip64, f = z.fields ?? ['usize', 'csize', 'offset'], real = { usize, csize, offset }, vals = { ...real, ...z.values };
      if (f.includes('usize')) cUsize = 0xffffffff;
      if (f.includes('csize')) cCsize = 0xffffffff;
      if (f.includes('offset')) cOff = 0xffffffff;
      const body = Buffer.concat(['usize', 'csize', 'offset'].filter((k) => f.includes(k)).map((k) => u64(vals[k])));
      const z64 = z.rawExtra ?? (z.noExtra ? Buffer.alloc(0) : Buffer.concat([u16(0x0001), u16(body.length), body]));
      cExtra = Buffer.concat([extra, z64]);
    }
    centrals.push(Buffer.concat([u32(0x02014b50), u16((3 << 8) | 20), u16(20), u16(flags), u16(mfield), u16(DOS_TIME), u16(DOS_DATE),
      u32(crc), u32(cCsize), u32(cUsize), u16(rawName.length), u16(cExtra.length), u16(0), u16(0), u16(0),
      u32((mode << 16) >>> 0), u32(cOff), rawName, cExtra]));
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals), eo = opts.eocd ?? {};
  let z64 = Buffer.alloc(0), total = entries.length, cdSize = cd.length, cdOff = eo.cdOff ?? offset;
  if (opts.zip64Eocd) {
    const z = opts.zip64Eocd === true ? {} : opts.zip64Eocd, recAt = offset + cd.length;
    const rec = Buffer.concat([u32(z.sig ?? 0x06064b50), u64(z.recSize ?? 44), u16(45), u16(45), u32(z.disk ?? 0), u32(z.cdDisk ?? 0),
      u64(z.total ?? entries.length), u64(z.total ?? entries.length), u64(z.cdSize ?? cd.length), u64(z.cdOff ?? offset)]);
    const loc = z.noLocator ? Buffer.alloc(0) : Buffer.concat([u32(z.locSig ?? 0x07064b50), u32(z.locDisk ?? 0), u64(z.locOffset ?? recAt), u32(z.locDisks ?? 1)]);
    z64 = Buffer.concat([rec, loc]); total = 0xffff; cdSize = 0xffffffff; cdOff = 0xffffffff;
  }
  const eocd = Buffer.concat([u32(0x06054b50), u16(eo.disk ?? 0), u16(eo.cdDisk ?? 0), u16(total), u16(total),
    u32(cdSize), u32(cdOff), u16(0)]);
  return Buffer.concat([...locals, cd, z64, eocd]);
};
