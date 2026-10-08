#!/usr/bin/env node
// zipkit: read, verify, extract and mark zips in plain Node (zero dependencies, Node 18+). Round 1s.
//
//   node packages/cairn-zip/src/zipkit.mjs ls <zip>                       lists entries (name, size, how the name was decoded)
//   node packages/cairn-zip/src/zipkit.mjs test <zip>                     decompresses everything and checks CRC and sizes; warns about unsafe names
//   node packages/cairn-zip/src/zipkit.mjs cat <zip> <name>               writes one file of the zip to stdout
//   node packages/cairn-zip/src/zipkit.mjs extract <zip> <folder> [--overwrite] [--max-bytes N]
//   node packages/cairn-zip/src/zipkit.mjs mark <zip>                     sets the UTF-8 flag (bit 11) on non-ASCII names
//
// Why it exists (see docs/zip-handling.md): `unzip` and `ditto` differ by system and by locale. A zip with the UTF-8 flag
// extracts on Linux with a C locale as `relato#U0301rio…` (and Info-ZIP's `-UU` does not exist on macOS); without the flag,
// Python/Java/Windows read garbage. One reader in Node gives the same result everywhere, and the tests run everywhere.
//
// Guarantees (each one has a test; see packages/cairn-zip/test/):
//  - Names: Unicode Path extra field (0x7075, with CRC) > UTF-8 flag (bit 11) > valid UTF-8 > cp437 (the spec's rule).
//    `name` is the real name; whoever compares normalises (NFC) separately. Nothing here rewrites names.
//  - Safe extraction: validates ALL entries before writing a single one; refuses absolute paths, `..`, `\`, NUL, `C:`;
//    never creates symlinks nor writes through an existing one; creates files in exclusive mode (a repeated name, or an
//    NFC/NFD collision on a normalising file system, fails instead of silently overwriting); does not trust the declared
//    sizes (aborts if the stream goes past the declared size) and has limits on bytes and entries (anti zip-bomb).
//  - Integrity: CRC-32 and size of each file are checked; a partial file is deleted if anything fails.
//  - Supports: stored and deflate (what `zip` produces), zip64, extra fields, Unix modes (no setuid/setgid), dates.
//    Does not support, and says so with a clear message: encryption, other compression methods, multi-part zips.
//  - Streaming: nothing is read into memory whole, except the central directory, readZipFile (a file <= maxBytes) and, in extraction,
//    entries of at most 256 KiB (compressed and declared), which skip the stream pipeline for speed (C2.3).
import { chmodSync, closeSync, createReadStream, createWriteStream, existsSync, fchmodSync, fstatSync, futimesSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib, { createInflateRaw, inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

export class ZipError extends Error { constructor(msg, code = "EZIP") { super(msg); this.name = "ZipError"; this.code = code; } }

// ---------- primitives ----------
const CP437_HI = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0";
const decodeCp437 = (raw) => { let s = ""; for (const c of raw) s += c < 128 ? String.fromCharCode(c) : CP437_HI[c - 128]; return s; };
// Legacy name decoding (the last step of the name precedence). Default cp437, as the zip spec says. Any other label goes
// through TextDecoder (windows-1252, shift_jis, gbk, ...); Unicode encodings make no sense here and are refused.
// windows-1252 (WHATWG table): 0x00-0x7F and 0xA0-0xFF are latin1; 0x80-0x9F below, the 5 undefined ones map to the same C1 code point.
const CP1252_80_9F = "\u20ac\x81\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\x8d\u017d\x8f\x90\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\x9d\u017e\u0178";
const decodeCp1252 = (raw) => { let s = ""; for (const c of raw) s += c >= 0x80 && c < 0xa0 ? CP1252_80_9F[c - 0x80] : String.fromCharCode(c); return s; };
const CP437 = { source: "cp437", decode: decodeCp437 };
const legacyDecoder = (label = "cp437") => {
  if (typeof label !== "string") throw new ZipError("legacyEncoding must be a string", "EBADARG");
  const l = label.trim().toLowerCase();
  if (l === "cp437" || l === "ibm437") return CP437;
  let td; try { td = new TextDecoder(l); } catch { throw new ZipError(`unknown legacyEncoding «${label}»`, "EBADARG"); }
  if (td.encoding.startsWith("utf")) throw new ZipError(`legacyEncoding «${label}» is a Unicode encoding; use it only for legacy names`, "EBADARG");
  if (td.encoding === "windows-1252") return { source: "legacy", decode: decodeCp1252 }; // not TextDecoder: some Node builds decode it as latin1
  return { source: "legacy", decode: (raw) => td.decode(raw) };
};
const UTF8 = new TextDecoder("utf-8", { fatal: true });
export const isUtf8 = (raw) => { try { UTF8.decode(raw); return true; } catch { return false; } };
const CRC_T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export const crc32Js = (buf, prev = 0) => { let c = (prev ^ 0xffffffff) >>> 0; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
// CRC-32 uses zlib.crc32 where Node has it (22.2+ and 20.15+; not 18) and the JS version above everywhere else. Same
// contract either way: crc32(buf, prev = 0), where prev is the result for the data before buf (incremental use).
// CAIRN_ZIP_JS_CRC=1 forces the JS path, so tests and CI can exercise it on a Node that has the native one.
export const makeCrc32 = (native) => (typeof native === "function"
  ? { source: "native", crc32: (buf, prev = 0) => native(buf, prev) }
  : { source: "js", crc32: crc32Js });
export const { crc32, source: crc32Source } = makeCrc32(process.env.CAIRN_ZIP_JS_CRC ? undefined : zlib.crc32);
const u64 = (b, o) => { const v = b.readBigUInt64LE(o); if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError("zip64 value too large for this reader"); return Number(v); };
const readAt = (fd, pos, len) => {
  const b = Buffer.allocUnsafe(len); let got = 0; // every byte is overwritten or the call throws, so no zero-fill
  while (got < len) { const n = readSync(fd, b, got, len - got, pos + got); if (n === 0) throw new ZipError("truncated zip (end of file before expected)"); got += n; }
  return b;
};
const MAX_CENTRAL = 1 << 30;

// ---------- central directory ----------
const readCentral = (fd, size, label) => {
  const tailLen = Math.min(size, 22 + 65535), tailPos = size - tailLen, tail = readAt(fd, tailPos, tailLen);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) <= tail.length) { e = i; break; }
  if (e < 0) throw new ZipError(`${label}: not a zip (no end-of-central-directory record)`, "ENOTZIP");
  let total = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
  const disk = tail.readUInt16LE(e + 4), cdDisk = tail.readUInt16LE(e + 6);
  if (total === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
    const loc = tailPos + e - 20;
    if (loc < 0) throw new ZipError(`${label}: zip64 without locator`);
    const l = readAt(fd, loc, 20);
    if (l.readUInt32LE(0) !== 0x07064b50) throw new ZipError(`${label}: zip64 without locator`);
    if (l.readUInt32LE(4) > 0 || l.readUInt32LE(16) > 1) throw new ZipError(`${label}: multi-part zips are not supported`);
    const z = readAt(fd, u64(l, 8), 56);
    if (z.readUInt32LE(0) !== 0x06064b50 || u64(z, 4) < 44) throw new ZipError(`${label}: invalid zip64 record`);
    total = u64(z, 32); cdSize = u64(z, 40); cdOff = u64(z, 48);
    if (z.readUInt32LE(16) || z.readUInt32LE(20)) throw new ZipError(`${label}: multi-part zips are not supported`);
  } else if ((disk && disk !== 0xffff) || (cdDisk && cdDisk !== 0xffff)) throw new ZipError(`${label}: multi-part zips are not supported`);
  if (cdSize > MAX_CENTRAL) throw new ZipError(`${label}: central directory too large`);
  if (total * 46 > cdSize) throw new ZipError(`${label}: impossible entry count (${total} entries do not fit in ${cdSize} bytes)`);
  if (cdOff + cdSize > size) throw new ZipError(`${label}: central directory outside the file (truncated zip?)`);
  return { cd: readAt(fd, cdOff, cdSize), total, cdOff };
};
const parseExtra = (extra) => { const f = new Map(); for (let i = 0; i + 4 <= extra.length; ) { const id = extra.readUInt16LE(i), len = extra.readUInt16LE(i + 2); if (i + 4 + len > extra.length) break; if (!f.has(id)) f.set(id, extra.subarray(i + 4, i + 4 + len)); i += 4 + len; } return f; };
const dosDate = (d, t) => { const mo = (d >> 5) & 15, da = d & 31; return mo && da ? new Date(((d >> 9) & 127) + 1980, mo - 1, da, t >> 11, (t >> 5) & 63, (t & 31) * 2) : null; };

const parseEntries = (cd, total, label, legacy = CP437) => {
  const entries = []; let pos = 0;
  for (let n = 0; n < total; n++) {
    if (pos + 46 > cd.length || cd.readUInt32LE(pos) !== 0x02014b50) throw new ZipError(`${label}: corrupted central directory at entry ${n}`);
    const hostOs = cd[pos + 5], flags = cd.readUInt16LE(pos + 8), method = cd.readUInt16LE(pos + 10), crc = cd.readUInt32LE(pos + 16);
    let csize = cd.readUInt32LE(pos + 20), usize = cd.readUInt32LE(pos + 24), localOffset = cd.readUInt32LE(pos + 42);
    const nl = cd.readUInt16LE(pos + 28), xl = cd.readUInt16LE(pos + 30), cl = cd.readUInt16LE(pos + 32), extAttr = cd.readUInt32LE(pos + 38);
    if (pos + 46 + nl + xl + cl > cd.length) throw new ZipError(`${label}: corrupted central directory at entry ${n}`);
    const rawName = cd.subarray(pos + 46, pos + 46 + nl), extra = parseExtra(cd.subarray(pos + 46 + nl, pos + 46 + nl + xl));
    if (usize === 0xffffffff || csize === 0xffffffff || localOffset === 0xffffffff) { // zip64: the real values are in extra 0x0001, in this order
      const z64 = extra.get(0x0001); let o = 0;
      const next = () => { if (!z64 || o + 8 > z64.length) throw new ZipError(`${label}: entry ${n} needs a zip64 extra field that is missing or too short`); const v = u64(z64, o); o += 8; return v; };
      if (usize === 0xffffffff) usize = next(); if (csize === 0xffffffff) csize = next(); if (localOffset === 0xffffffff) localOffset = next();
    }
    const nonAscii = rawName.some((c) => c > 127), utf8Valid = !nonAscii || isUtf8(rawName);
    let name, nameSource = "ascii";
    const up = extra.get(0x7075);
    if (up && up.length > 5 && up[0] === 1 && up.readUInt32LE(1) === crc32(rawName) && isUtf8(up.subarray(5))) { name = up.subarray(5).toString("utf8"); nameSource = "unicode-extra"; }
    else if (!nonAscii) name = rawName.toString("latin1");
    else if (flags & 0x800 && utf8Valid) { name = rawName.toString("utf8"); nameSource = "flag"; }
    else if (utf8Valid) { name = rawName.toString("utf8"); nameSource = "utf8"; }
    else { name = legacy.decode(rawName); nameSource = legacy.source; }
    const mode = hostOs === 3 ? extAttr >>> 16 : 0, type = mode & 0o170000, ut = extra.get(0x5455);
    const mtime = ut && ut.length >= 5 && ut[0] & 1 ? new Date(ut.readInt32LE(1) * 1000) : dosDate(cd.readUInt16LE(pos + 14), cd.readUInt16LE(pos + 12));
    entries.push({
      name, rawName, nameSource, flags, method, crc, csize, usize, localOffset, cdPos: pos, hostOs, mode, mtime,
      isDir: name.endsWith("/") || type === 0o040000, isSymlink: type === 0o120000, isSpecial: type !== 0 && type !== 0o100000 && type !== 0o040000 && type !== 0o120000,
      encrypted: !!(flags & 0x41), nonAscii, flagMissing: nonAscii && utf8Valid && !(flags & 0x800),
    });
    pos += 46 + nl + xl + cl;
  }
  return entries;
};

// Lists the entries. Each one: { name, rawName, nameSource, flags, method, crc, csize, usize, localOffset, mode, mtime,
//   isDir, isSymlink, isSpecial, encrypted, nonAscii, flagMissing }
export const listZip = (zipPath, opts) => {
  const z = openZip(zipPath, opts);
  try { return { path: z.path, size: z.size, entries: z.entries }; }
  finally { z.close(); }
};

export const unsafeNameReason = (name) => {
  if (!name) return "empty name";
  if (name.includes("\0")) return "contains NUL";
  if (name.includes("\\")) return "contains a backslash";
  if (name.startsWith("/")) return "absolute path";
  if (/^[A-Za-z]:/.test(name)) return "drive letter (Windows)";
  if (name.split("/").some((s) => s === "..")) return "escapes the folder (..)";
  return null;
};
const unsupportedReason = (e) => (e.encrypted ? "is encrypted (not supported)" : e.method !== 0 && e.method !== 8 ? `compression method ${e.method} not supported (only stored and deflate)` : null);
const dataStart = (fd, size, e, label) => {
  if (e.localOffset + 30 > size) throw new ZipError(`${label}: local header of «${e.name}» outside the file`);
  const h = readAt(fd, e.localOffset, 30);
  if (h.readUInt32LE(0) !== 0x04034b50) throw new ZipError(`${label}: invalid local header for «${e.name}»`);
  const start = e.localOffset + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
  if (start + e.csize > size) throw new ZipError(`${label}: the data of «${e.name}» runs past the end of the file (truncated zip?)`);
  return start;
};
const sameName = (a, b) => a === b || a.normalize("NFC") === b.normalize("NFC");

// Opens a zip ONCE: the central directory is read and parsed a single time, here. The handle keeps one descriptor open
// until close(). openZip(path, { legacyEncoding = "cp437" }) -> { path, size, cdOff (where the central directory starts),
// entries, read(name, { maxBytes }), close() }
export const openZip = (zipPath, { legacyEncoding } = {}) => {
  const legacy = legacyDecoder(legacyEncoding), path = resolve(zipPath); let fd = openSync(path, "r"), size, cdOff, entries;
  try { size = fstatSync(fd).size; const c = readCentral(fd, size, path); cdOff = c.cdOff; entries = parseEntries(c.cd, c.total, path, legacy); }
  catch (err) { closeSync(fd); throw err; }
  const live = () => { if (fd === null) throw new ZipError(`${path}: the zip handle is closed`, "ECLOSED"); return fd; };
  // Reads ONE file into memory (by name; NFC and NFD count as the same name). Checks CRC and size.
  const read = (name, { maxBytes = 256 * 1024 * 1024 } = {}) => {
    const f = live();
    const e = entries.find((x) => !x.isDir && x.name === name) ?? entries.find((x) => !x.isDir && sameName(x.name, name));
    if (!e) throw new ZipError(`${path}: «${name}» is not in the zip`, "ENOENT");
    const bad = unsupportedReason(e); if (bad) throw new ZipError(`«${e.name}» ${bad}`);
    if (e.usize > maxBytes || e.csize > maxBytes) throw new ZipError(`«${e.name}» is ${e.usize} bytes, above the limit of ${maxBytes} for reading into memory`);
    const comp = e.csize ? readAt(f, dataStart(f, size, e, path), e.csize) : Buffer.alloc(0);
    let data;
    if (e.method === 0) data = comp;
    else { try { data = e.usize === 0 && comp.length === 0 ? Buffer.alloc(0) : inflateRawSync(comp, { maxOutputLength: Math.max(1, e.usize) }); } catch (err) { throw new ZipError(`«${e.name}»: corrupted data or larger than declared (${err.code ?? err.message})`); } }
    if (data.length !== e.usize) throw new ZipError(`«${e.name}»: size ${data.length} ≠ ${e.usize} declared`);
    if (crc32(data) !== e.crc) throw new ZipError(`«${e.name}»: CRC-32 mismatch (corrupted file)`);
    return data;
  };
  const close = () => { if (fd !== null) { const f = fd; fd = null; closeSync(f); } };
  return { path, size, cdOff, entries, read, close };
};

// One-shot convenience: open, read one file, close.
export const readZipFile = (zipPath, name, { maxBytes, legacyEncoding } = {}) => {
  const z = openZip(zipPath, { legacyEncoding });
  try { return z.read(name, { maxBytes }); } finally { z.close(); }
};

// Transform that counts bytes and CRC and fails if the stream does not match what was declared.
const checker = (e) => { let n = 0, crc = 0; return new Transform({
  transform(chunk, _enc, cb) { n += chunk.length; if (n > e.usize) return cb(new ZipError(`«${e.name}»: goes past the declared size (${e.usize}): corrupted or hostile zip`)); crc = crc32(chunk, crc); cb(null, chunk); },
  flush(cb) { cb(n !== e.usize ? new ZipError(`«${e.name}»: size ${n} ≠ ${e.usize} declared`) : crc !== e.crc ? new ZipError(`«${e.name}»: CRC-32 mismatch (corrupted file)`) : null); },
}); };
const streamEntry = (path, size, fd, e, sink) => {
  if (e.csize === 0) { if (e.usize !== 0 || e.crc !== 0) throw new ZipError(`«${e.name}»: has no data but declares ${e.usize} bytes`); return pipeline(Readable.from([]), sink); }
  const start = dataStart(fd, size, e, path), src = createReadStream(path, { start, end: start + e.csize - 1 });
  return e.method === 0 ? pipeline(src, checker(e), sink) : pipeline(src, createInflateRaw(), checker(e), sink);
};
const discard = () => new Writable({ write(_c, _e, cb) { cb(); } });

// C2.3: an entry whose compressed AND declared sizes are both <= SMALL_ENTRY skips the stream pipeline: one read, one synchronous
// inflate bounded by the declared size, size and CRC checked, one write. Per-file streams (read + inflate + checker + write, all
// asynchronous) were what made 20 000 small files 14x to 24x slower than `unzip`. Memory stays bounded by SMALL_ENTRY.
const SMALL_ENTRY = 256 * 1024;
const isSmall = (e) => e.csize > 0 && e.csize <= SMALL_ENTRY && e.usize <= SMALL_ENTRY;
const smallData = (fd, size, e, path) => { // verified in memory BEFORE any file exists, so a bad entry creates nothing
  const comp = readAt(fd, dataStart(fd, size, e, path), e.csize);
  let data = comp;
  if (e.method !== 0) { try { data = inflateRawSync(comp, { maxOutputLength: Math.max(1, e.usize) }); } catch (err) { throw new ZipError(`«${e.name}»: corrupted data or larger than declared (${err.code ?? err.message})`); } }
  if (data.length !== e.usize) throw new ZipError(`«${e.name}»: size ${data.length} ≠ ${e.usize} declared`);
  if (crc32(data) !== e.crc) throw new ZipError(`«${e.name}»: CRC-32 mismatch (corrupted file)`);
  return data;
};
// Creates `target` exclusively (throws EEXIST, nothing changed), writes, then sets mode and date through the descriptor
// (fewer path lookups than chmod/utimes by name). Returns the file's "dev:ino" for the collision check.
const writeSmall = (target, data, e) => {
  const h = openSync(target, "wx", 0o600);
  try { writeFileSync(h, data); const st = fstatSync(h); fchmodSync(h, ((e.mode & 0o777) || 0o644) | 0o600); if (e.mtime) futimesSync(h, e.mtime, e.mtime); return `${st.dev}:${st.ino}`; }
  finally { closeSync(h); }
};

// Decompresses everything into the void, checking CRC and sizes (the `unzip -t`). Returns { files, bytes }.
export const testZip = async (zipPath) => {
  const { path, size, entries } = listZip(zipPath), fd = openSync(path, "r"); let files = 0, bytes = 0;
  try {
    for (const e of entries) {
      if (e.isDir || e.isSymlink || e.isSpecial) continue;
      const bad = unsupportedReason(e); if (bad) throw new ZipError(`«${e.name}» ${bad}`);
      await streamEntry(path, size, fd, e, discard()); files++; bytes += e.usize;
    }
  } finally { closeSync(fd); }
  return { files, bytes };
};

// ---------- extraction ----------
// extractZip(zip, dest, { overwrite, maxTotalBytes, maxEntries, filter }) -> { files, dirs, bytes, skipped, collisions }
//  skipped: symlinks and special files (never created); collisions: groups of names that differ only in NFC/NFD or case
//  (legitimate on Linux, but on macOS/Windows one would overwrite the other: the caller decides what to do with the warning).
const pathSegs = (name) => name.split("/").filter((x) => x && x !== ".");

// Moves what was extracted in `src` into the existing folder `dst`: first a plan (every conflict is found before anything moves),
// then the renames. Existing folders are merged, new subtrees move whole, and a file/folder mismatch is always refused.
const mergePlan = (src, dst, overwrite, ops = []) => {
  for (const name of readdirSync(src)) {
    const a = join(src, name), b = join(dst, name); let st = null; try { st = lstatSync(b); } catch { /* new */ }
    if (!st) ops.push([a, b]);
    else if (st.isSymbolicLink()) throw new ZipError(`«${name}»: ${b} is a symlink in the destination`, "EUNSAFE");
    else if (lstatSync(a).isDirectory() && st.isDirectory()) mergePlan(a, b, overwrite, ops);
    else if (lstatSync(a).isDirectory() || st.isDirectory()) throw new ZipError(`«${name}»: file and folder clash with ${b}`, "EEXIST");
    else if (!overwrite) throw new ZipError(`«${name}»: already exists in ${dst} (use overwrite)`, "EEXIST");
    else ops.push([a, b]);
  }
  return ops;
};

export const extractZip = async (zipPath, dest, { overwrite = false, maxTotalBytes = 2 ** 33, maxEntries = 1_000_000, filter } = {}) => {
  const { path, size, entries: all } = listZip(zipPath);
  if (all.length > maxEntries) throw new ZipError(`${path}: ${all.length} entries, above the limit of ${maxEntries}`);
  const entries = filter ? all.filter(filter) : all, problems = [], skipped = [], seen = new Set(), dirKeys = new Set(), groups = new Map();
  let declared = 0;
  for (const e of entries) {
    const unsafe = unsafeNameReason(e.name.replace(/\/+$/, "") || (e.name ? "/" : "")); if (unsafe) { problems.push(`«${e.name}»: ${unsafe}`); continue; }
    if (e.isSymlink || e.isSpecial) { skipped.push({ name: e.name, reason: e.isSymlink ? "symlink (never created)" : "special file" }); continue; }
    const segs = pathSegs(e.name);
    if (!segs.length) { skipped.push({ name: e.name, reason: "the destination folder itself (never written to)" }); continue; }
    for (let i = 1; i < segs.length; i++) dirKeys.add(segs.slice(0, i).join("/"));
    const key = segs.join("/");
    if (e.isDir) dirKeys.add(key);
    else { const bad = unsupportedReason(e); if (bad) problems.push(`«${e.name}» ${bad}`); if (seen.has(key)) problems.push(`«${e.name}»: duplicate name in the zip`); seen.add(key); declared += e.usize; }
    const k = e.name.normalize("NFC").toLowerCase(); (groups.get(k) ?? groups.set(k, new Set()).get(k)).add(e.name);
  }
  for (const k of seen) if (dirKeys.has(k)) problems.push(`«${k}»: is a file and a folder at the same time`);
  if (declared > maxTotalBytes) problems.push(`total declared size ${declared} bytes, above the limit of ${maxTotalBytes}`);
  if (problems.length) throw new ZipError(`${path}: extraction refused (nothing was written):\n  - ${problems.slice(0, 10).join("\n  - ")}${problems.length > 10 ? `\n  … and ${problems.length - 10} more` : ""}`, "EUNSAFE");
  const collisions = [...groups.values()].filter((s) => s.size > 1).map((s) => [...s]);

  // C2.1: everything is extracted into a fresh temp folder next to the destination (same volume) and only moved in once every
  // file is written and verified, so a bad zip never changes the destination. A new destination appears with one rename;
  // an existing one is merged by renames after a full conflict check (only an OS error during those renames can leave it half-done).
  let real = null; // the existing destination, resolved; null if it does not exist yet
  try { real = realpathSync(dest); } catch (err) { if (err.code !== "ENOENT") throw new ZipError(`${dest}: ${err.message}`, "EEXIST"); }
  let lst = null; try { lst = lstatSync(dest); } catch { /* absent */ }
  if (real ? !statSync(real).isDirectory() : lst) throw new ZipError(`${dest}: exists and is not a folder you can extract into`, "EEXIST");
  const target = resolve(dest); let tmp = null, why;
  let base = target; while (!real && !existsSync(base)) base = dirname(base);
  for (const where of real ? [dirname(real), real] : [base]) { try { tmp = mkdtempSync(join(where, ".cairn-tmp-")); break; } catch (err) { why = err; } }
  if (!tmp) throw new ZipError(`${dest}: cannot create a temporary folder next to it (${why.message})`, "EEXIST");
  const root = realpathSync(tmp), made = new Set(), late = [], known = new Set(); // known: folders of the temp tree already checked or created (only this function creates folders in it, and it never removes one)
  let files = 0, dirs = 0, bytes = 0, fd = null;
  const ensureDir = (segs) => { // walks down folder by folder, refusing symlinks and files in the path
    let cur = root;
    for (const s of segs) {
      cur = join(cur, s);
      if (known.has(cur)) continue;
      let st = null; try { st = lstatSync(cur); } catch { /* does not exist */ }
      if (st?.isSymbolicLink()) throw new ZipError(`«${segs.join("/")}»: the path goes through a symlink (${cur})`, "EUNSAFE");
      if (st && !st.isDirectory()) throw new ZipError(`«${segs.join("/")}»: ${cur} exists and is not a folder`, "EEXIST");
      if (!st) { mkdirSync(cur); dirs++; }
      known.add(cur);
    }
    return cur;
  };
  try {
    fd = openSync(path, "r");
    for (const e of entries) {
      if (e.isSymlink || e.isSpecial) continue;
      const segs = pathSegs(e.name);
      if (!segs.length) continue;
      if (e.isDir) { const d = ensureDir(segs); late.push([d, e]); continue; }
      const dir = ensureDir(segs.slice(0, -1)), target = join(dir, segs[segs.length - 1]);
      if (isSmall(e)) { // fast path; on EEXIST nothing was created and the full diagnosis below decides which error it is
        const data = smallData(fd, size, e, path);
        try { made.add(writeSmall(target, data, e)); files++; bytes += e.usize; continue; }
        catch (err) { if (err.code !== "EEXIST") { rmSync(target, { force: true }); throw err instanceof ZipError ? err : new ZipError(`«${e.name}»: ${err.message}`); } }
      }
      let st = null; try { st = lstatSync(target); } catch { /* does not exist */ }
      if (st) {
        if (made.has(`${st.dev}:${st.ino}`)) throw new ZipError(`«${e.name}»: collides with a file already extracted from this zip (equivalent names on this file system)`, "ECOLLISION");
        if (!overwrite) throw new ZipError(`«${e.name}»: already exists in ${dir} (use overwrite)`, "EEXIST");
        if (st.isDirectory()) throw new ZipError(`«${e.name}»: already exists as a folder`, "EEXIST");
        unlinkSync(target);
      }
      if (e.csize === 0) { if (e.usize !== 0 || e.crc !== 0) throw new ZipError(`«${e.name}»: has no data but declares ${e.usize} bytes`); writeFileSync(target, "", { flag: "wx", mode: 0o600 }); }
      else {
        try { dataStart(fd, size, e, path); /* before the sink exists: a throw here must not leave a write stream opening a file later */ await streamEntry(path, size, fd, e, createWriteStream(target, { flags: "wx", mode: 0o600 })); }
        catch (err) { rmSync(target, { force: true }); throw err instanceof ZipError ? err : new ZipError(`«${e.name}»: ${err.message}`); }
      }
      const s2 = statSync(target); made.add(`${s2.dev}:${s2.ino}`);
      chmodSync(target, ((e.mode & 0o777) || 0o644) | 0o600);
      if (e.mtime) utimesSync(target, e.mtime, e.mtime);
      files++; bytes += e.usize;
    }
    for (const [d, e] of late.reverse()) { if (e.mode & 0o777) chmodSync(d, (e.mode & 0o777) | 0o700); if (e.mtime) utimesSync(d, e.mtime, e.mtime); }
    let um = 0o022; try { um = process.umask(); } catch { /* worker thread */ }
    chmodSync(tmp, 0o777 & ~um);
    if (!real) { mkdirSync(dirname(target), { recursive: true }); renameSync(tmp, target); tmp = null; }
    else { for (const [from, to] of mergePlan(tmp, real, overwrite)) /* rename replaces a file atomically */ renameSync(from, to); }
  } finally { if (fd !== null) closeSync(fd); if (tmp) rmSync(tmp, { recursive: true, force: true }); }
  return { files, dirs, bytes, skipped, collisions };
};

// ---------- UTF-8 flag ----------
// Info-ZIP's `zip` (Linux and macOS) writes UTF-8 names WITHOUT bit 11 and without Unicode Path (neither `-UN=UTF8` nor a
// UTF-8 locale changes that). This sets bit 11 on the entries whose non-ASCII name is valid UTF-8: 2 bytes per entry (local
// and central header); data, sizes and CRC stay the same. Idempotent. ASCII names and names that are not UTF-8 are left alone.
export const markUtf8Names = (zipPath) => {
  const path = resolve(zipPath), fd = openSync(path, "r+");
  try {
    const size = fstatSync(fd).size, { cd, total } = readCentral(fd, size, path), entries = parseEntries(cd, total, path); let patched = 0;
    const setBit = (pos) => { const b = readAt(fd, pos, 2); b.writeUInt16LE(b.readUInt16LE(0) | 0x800, 0); writeSync(fd, b, 0, 2, pos); };
    for (const e of entries) {
      if (!e.flagMissing) continue;
      if (e.localOffset + 30 > size || readAt(fd, e.localOffset, 4).readUInt32LE(0) !== 0x04034b50) throw new ZipError(`${path}: invalid local header for «${e.name}»`);
      setBit(e.localOffset + 6); setBit(e.cdPos + 8); patched++;
    }
    return { patched, total: entries.length };
  } finally { closeSync(fd); }
};

// ---------- command line ----------
const cli = async (argv) => {
  const [cmd, zip, arg] = argv, flag = (n) => argv.includes(n), val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const usage = () => { console.error("usage: zipkit.mjs ls|test|mark <zip> · cat <zip> <name> · extract <zip> <folder> [--overwrite] [--max-bytes N]"); process.exit(2); };
  if (!cmd || !zip) usage();
  if (cmd === "ls") { for (const e of listZip(zip).entries) console.log(`${String(e.usize).padStart(10)}  ${e.name}${e.nameSource === "ascii" ? "" : `   [name: ${e.nameSource}${e.flagMissing ? ", NO UTF-8 flag" : ""}]`}`); }
  else if (cmd === "test") {
    const { entries } = listZip(zip), bad = entries.filter((e) => unsafeNameReason(e.name.replace(/\/+$/, "") || "/")), noFlag = entries.filter((e) => e.flagMissing), r = await testZip(zip);
    console.log(`✓ ${r.files} file(s), ${r.bytes} bytes: CRC and sizes match.`);
    if (bad.length) console.log(`! ${bad.length} unsafe name(s) (extraction refuses them): ${bad.slice(0, 5).map((e) => e.name).join(", ")}`);
    if (noFlag.length) console.log(`! ${noFlag.length} non-ASCII name(s) without the UTF-8 flag: ${noFlag.slice(0, 5).map((e) => e.name).join(", ")} (zipkit.mjs mark fixes it)`);
  }
  else if (cmd === "cat") { if (!arg) usage(); process.stdout.write(readZipFile(zip, arg)); }
  else if (cmd === "mark") { const r = markUtf8Names(zip); console.log(`✓ ${zip}: ${r.patched} of ${r.total} entry(ies) marked with the UTF-8 flag`); }
  else if (cmd === "extract") {
    if (!arg || arg.startsWith("--")) usage();
    const mb = val("--max-bytes"), r = await extractZip(zip, arg, { overwrite: flag("--overwrite"), ...(mb ? { maxTotalBytes: Number(mb) } : {}) });
    console.log(`✓ ${r.files} file(s), ${r.dirs} folder(s) created, ${r.bytes} bytes → ${arg}`);
    for (const s of r.skipped) console.log(`! skipped: ${s.name} (${s.reason})`);
    for (const c of r.collisions) console.log(`! equivalent names (NFC/case) in the zip: ${c.join(" ≈ ")}`);
  } else usage();
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli(process.argv.slice(2)).catch((e) => { console.error(`✗ ${e instanceof ZipError ? e.message : e.stack}`); process.exit(1); });
