// FILES.manifest, two formats, read by ONE parser (C7.1).
//   v1: one path per line (every delivery so far).
//   v2: first line `# chicla-manifest v2`, then `path<TAB>crc32<TAB>size[<TAB>sha256]` (crc32: 8 lowercase hex digits; sha256: 64).
// A file is v2 only if its first line is EXACTLY the header, so a v1 path that starts with «#» stays a path.
// Errors carry a stable `code`: EMANIFEST_FORMAT, EMANIFEST_DUPLICATE, EMANIFEST_UNSAFE, EMANIFEST_COLLISION (C7.3: two different paths that are the same name in NFC, e.g. «café» composed and decomposed). The manifest is input like any other: a path
// that leaves the root, is absolute or has an empty segment is refused. `check-manifest --write` writes v2 (slice b of C7.1, without sha256).
import * as zlib from "node:zlib";
export const MANIFEST_V2_HEADER = "# chicla-manifest v2";

const fail = (code, message) => Object.assign(new Error(message), { code });
/** Throws EMANIFEST_COLLISION when two DIFFERENT paths fold to the same NFC name (C7.3, D56): such a manifest cannot be restored reliably on APFS. */
const noCollision = (paths) => {
  const by = new Map();
  for (const p of paths) { const k = p.normalize("NFC"), first = by.get(k); if (first === undefined) by.set(k, p); else if (first !== p) throw fail("EMANIFEST_COLLISION", `two paths differ only in NFC/NFD: «${first.slice(0, 60)}» and «${p.slice(0, 60)}»`); }
};
const unsafe = (p) => typeof p !== "string" || p === "" || p.includes("\0") || p.includes("\\") || p.startsWith("/") || /^[A-Za-z]:/.test(p) || p.split("/").some((s) => s === "" || s === "." || s === "..");

/** Parses a manifest (v1 or v2) into [{ path, crc32?, size?, sha256? }]; v1 entries have only `path`. */
export function parseManifest(text) {
  const lines = String(text).split("\n");
  const v2 = lines[0] === MANIFEST_V2_HEADER;
  const entries = [], seen = new Set();
  for (const raw of v2 ? lines.slice(1) : lines) {
    if (raw === "") continue;
    let e;
    if (v2) {
      const f = raw.split("\t");
      if (f.length < 3 || f.length > 4) throw fail("EMANIFEST_FORMAT", `a v2 line needs 3 or 4 tab-separated fields: «${raw.slice(0, 60)}»`);
      if (!/^[0-9a-f]{8}$/.test(f[1])) throw fail("EMANIFEST_FORMAT", `crc32 must be 8 lowercase hex digits: «${f[0].slice(0, 60)}»`);
      if (!/^\d{1,15}$/.test(f[2])) throw fail("EMANIFEST_FORMAT", `size must be a whole number: «${f[0].slice(0, 60)}»`);
      if (f[3] !== undefined && !/^[0-9a-f]{64}$/.test(f[3])) throw fail("EMANIFEST_FORMAT", `sha256 must be 64 lowercase hex digits: «${f[0].slice(0, 60)}»`);
      e = { path: f[0], crc32: parseInt(f[1], 16), size: Number(f[2]), ...(f[3] !== undefined ? { sha256: f[3] } : {}) };
    } else e = { path: raw };
    if (unsafe(e.path)) throw fail("EMANIFEST_UNSAFE", `unsafe path in the manifest: «${e.path.slice(0, 60)}»`);
    if (seen.has(e.path)) throw fail("EMANIFEST_DUPLICATE", `a path is listed twice: «${e.path.slice(0, 60)}»`);
    seen.add(e.path); entries.push(e);
  }
  noCollision(entries.map((e) => e.path));
  return entries;
}

/** Text of a manifest: all entries plain (v1) or all with crc32 and size (v2); anything half-filled or mixed is refused. */
export function serializeManifest(entries) {
  for (const e of entries) if (/[\t\n]/.test(e.path)) throw fail("EMANIFEST_UNSAFE", "a path with a tab or a newline cannot be listed");
  noCollision(entries.map((e) => e.path));
  const v2 = entries.filter((e) => e.crc32 !== undefined || e.size !== undefined);
  if (v2.length === 0) return entries.map((e) => `${e.path}\n`).join("");
  if (v2.length !== entries.length || entries.some((e) => !Number.isInteger(e.crc32) || e.crc32 < 0 || e.crc32 > 0xffffffff || !Number.isSafeInteger(e.size) || e.size < 0)) throw fail("EMANIFEST_FORMAT", "v2 entries need crc32 and size, all of them");
  return `${MANIFEST_V2_HEADER}\n` + entries.map((e) => `${e.path}\t${e.crc32.toString(16).padStart(8, "0")}\t${e.size}${e.sha256 !== undefined ? `\t${e.sha256}` : ""}\n`).join("");
}

const CRC_T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
/** crc32 of a Buffer as an unsigned 32-bit integer: `zlib.crc32` when this Node has it (22.2+), else a table in JS. */
export const crc32 = (buf) => {
  if (typeof zlib.crc32 === "function") return zlib.crc32(buf) >>> 0;
  let c = 0xffffffff; for (const x of buf) c = CRC_T[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
