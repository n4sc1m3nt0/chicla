// Tiny independent zip piece builder (no dependency on chicla), from the PoC package of the second security review (2026-10-19, round 187).
// Pieces are returned separately so a test can lay them out freely and build hostile bytes the writer under test would never produce.
import zlib from 'node:zlib';
const T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
export const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
export const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const DT = u16(0x6000), DD = u16(((2026 - 1980) << 9) | (10 << 5) | 8);
/** local header + data (stored). opts: extra (local extra bytes) */
export const local = (name, data, { extra = Buffer.alloc(0), flags = 0 } = {}) => {
  const n = Buffer.from(name), d = Buffer.from(data);
  return Buffer.concat([u32(0x04034b50), u16(20), u16(flags), u16(0), DT, DD, u32(crc32(d)), u32(d.length), u32(d.length), u16(n.length), u16(extra.length), n, extra, d]);
};
/** central entry for a stored file whose local header is at `offset`. opts: extra, csize/usize overrides */
export const central = (name, data, offset, { extra = Buffer.alloc(0), flags = 0, csize, usize, off32 } = {}) => {
  const n = Buffer.from(name), d = Buffer.from(data);
  return Buffer.concat([u32(0x02014b50), u16((3 << 8) | 20), u16(20), u16(flags), u16(0), DT, DD, u32(crc32(d)), u32(csize ?? d.length), u32(usize ?? d.length),
    u16(n.length), u16(extra.length), u16(0), u16(0), u16(0), u32((0o100644 << 16) >>> 0), u32(off32 ?? offset), n, extra]);
};
export const eocd = ({ total, cdSize, cdOff, comment = Buffer.alloc(0), commentLen }) =>
  Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(total), u16(total), u32(cdSize), u32(cdOff), u16(commentLen ?? comment.length), comment]);
export const eocd64 = ({ total, cdSize, cdOff, at }) => Buffer.concat([
  u32(0x06064b50), u64(44), u16(45), u16(45), u32(0), u32(0), u64(total), u64(total), u64(cdSize), u64(cdOff),
  u32(0x07064b50), u32(0), u64(at), u32(1)]);
