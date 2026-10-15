#!/usr/bin/env node
// zipkit: read, verify, extract, mark and write zips in plain Node (zero dependencies, Node 18+). Round 1s.
//
//   node packages/chicla-zip/src/zipkit.mjs ls <zip> [--json]             lists entries (name, size, how the name was decoded)
//   node packages/chicla-zip/src/zipkit.mjs test <zip> [--json]           decompresses everything and checks CRC and sizes; warns about unsafe names
//   node packages/chicla-zip/src/zipkit.mjs cat <zip> <name>               writes one file of the zip to stdout
//   node packages/chicla-zip/src/zipkit.mjs extract <zip> <folder> [--overwrite] [--max-bytes N]
//   node packages/chicla-zip/src/zipkit.mjs mark <zip>                     sets the UTF-8 flag (bit 11) on non-ASCII names
//   Exit codes 0 ok, 1 failed, 2 usage, 3 internal; `--json` prints one JSON line (command line section below, C4.2a). `create` and `--json` for
//   extract and mark are C4.2b. The library functions (writeZip, createZip, …) are exported.
//
// Why it exists (see docs/zip-handling.md): `unzip` and `ditto` differ by system and by locale. A zip with the UTF-8 flag
// extracts on Linux with a C locale as `relato#U0301rio…` (and Info-ZIP's `-UU` does not exist on macOS); without the flag,
// Python/Java/Windows read garbage. One reader in Node gives the same result everywhere, and the tests run everywhere.
//
// Guarantees (each one has a test; see packages/chicla-zip/test/):
//  - Names: Unicode Path extra field (0x7075, with CRC) > UTF-8 flag (bit 11) > valid UTF-8 > cp437 (the spec's rule).
//    `name` is the real name; whoever compares normalises (NFC) separately. Nothing here rewrites names.
//  - Safe extraction: validates ALL entries before writing a single one; refuses absolute paths, `..`, `\`, NUL, `C:`;
//    never creates symlinks nor writes through an existing one; creates files in exclusive mode (a repeated name, or an
//    NFC/NFD collision on a normalising file system, fails instead of silently overwriting); does not trust the declared
//    sizes (aborts if the stream goes past the declared size) and has limits on bytes and entries (anti zip-bomb).
//  - Integrity: CRC-32 and size of each file are checked; a partial file is deleted if anything fails.
//  - Supports: stored and deflate (what `zip` produces), zip64, extra fields, Unix modes (no setuid/setgid), dates.
//    Does not support, and says so with a clear message: encryption, other compression methods, multi-part zips.
//  - Writer (writeZip, C3.2): names exactly as given, bit 11 on non-ASCII ones, stored or deflate (deflate only where it shrinks the data;
//    empty files are stored), sizes and CRC in the local header (no data descriptor), written to `<out>.partial`, fsync, atomic rename;
//    refuses unsafe or repeated names before writing. zip64 (C3.3): records only where a value does not fit (65 535+ entries, 4 GiB-1+ sizes or
//    offsets), or for everything with zip64: true; zip64: false refuses with EZIP64. Determinism (C3.4): `deterministic: true` gives the same bytes on any machine, day and time zone (dates in UTC from `epoch`, SOURCE_DATE_EPOCH or the
//    source's mtime, clamped to 1980..2107; modes 0644/0755; order kept as given). Tree walk (C3.5): `createZip(out, root, { exclude, symlinks, stream })` (C3.7b: `stream: true` or a Writable reads in slices). Streaming output to a Writable: writeZipStream (C3.7).
//  - Streaming: nothing is read into memory whole, except the central directory, readZipFile (a file <= maxBytes) and, in extraction,
//    entries of at most 256 KiB (compressed and declared), which skip the stream pipeline for speed (C2.3).
import { chmodSync, closeSync, constants, copyFileSync, linkSync, createReadStream, createWriteStream, existsSync, fchmodSync, fstatSync, fsyncSync, futimesSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync, writeSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { open as fsOpen } from "node:fs/promises";
import { Readable, Transform, Writable } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import { once } from "node:events";
import { createHash } from "node:crypto";
import zlib, { createInflateRaw, inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

export class ZipError extends Error { constructor(msg, code = "EZIP", opts) { super(msg, opts); this.name = "ZipError"; this.code = code; } }

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
// CHICLA_ZIP_JS_CRC=1 forces the JS path, so tests and CI can exercise it on a Node that has the native one.
export const makeCrc32 = (native) => (typeof native === "function"
  ? { source: "native", crc32: (buf, prev = 0) => native(buf, prev) }
  : { source: "js", crc32: crc32Js });
export const { crc32, source: crc32Source } = makeCrc32(process.env.CHICLA_ZIP_JS_CRC ? undefined : zlib.crc32);
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
// M14 (D96, D97): Windows name safety, PURE functions (data in, codes out; no I/O, no platform check), here so that zipkit.mjs stays the one shipped file. They only DETECT and
// REPORT: a name is never renamed or corrected (D6). C14.2: with `windowsNames: true` (default: true only on win32) the extractor and the writers refuse a hit with EUNSAFE before writing. Long paths are C14.3.
/** The problem codes, in the order `windowsNameProblems` reports them. */
export const WIN_CODES = Object.freeze(["EWIN_BACKSLASH", "EWIN_DRIVE", "EWIN_UNC", "EWIN_RESERVED", "EWIN_CHAR", "EWIN_TRAILING", "EWIN_STREAM"]);

const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]|CONIN\$|CONOUT\$)$/i; // device names, also with an extension or a colon after them
const FORBIDDEN = /[\u0000-\u001f<>"|?*]/;                                          // the colon is a stream, a slash is a separator

/**
 * The codes (a new array, no duplicates, in `WIN_CODES` order) of the Windows problems of one entry name; `[]` when there is none.
 * EWIN_BACKSLASH `\` anywhere · EWIN_DRIVE a drive letter first (`C:foo`, `C:\x`) · EWIN_UNC two leading separators (`\\server\share`, `\\?\`, `//server`) ·
 * EWIN_RESERVED a segment whose name before the first `.` or `:` is CON, PRN, AUX, NUL, COM1-9, LPT1-9 (also ¹²³), CONIN$ or CONOUT$ · EWIN_CHAR `< > " | ? *` or a control character ·
 * EWIN_TRAILING a segment ending in a dot or a space (the segments «.» and «..» are not this check's business) · EWIN_STREAM a colon in a segment (`name:stream`), after the drive letter.
 * `/` and `\` both separate segments. A name that is not a string is a TypeError.
 */
export function windowsNameProblems(path) {
  if (typeof path !== "string") throw new TypeError("name must be a string");
  const hit = new Set(), drive = /^[A-Za-z]:/.test(path);
  if (path.includes("\\")) hit.add("EWIN_BACKSLASH");
  if (drive) hit.add("EWIN_DRIVE");
  if (/^[\\/]{2}/.test(path)) hit.add("EWIN_UNC");
  path.split(/[\\/]+/).filter((s) => s !== "").forEach((seg, i) => {
    const rest = i === 0 && drive ? seg.slice(2) : seg; // the drive letter's own colon is not a stream
    if (RESERVED.test(seg.split(/[.:]/)[0].trimEnd())) hit.add("EWIN_RESERVED");
    if (FORBIDDEN.test(rest)) hit.add("EWIN_CHAR");
    if (seg !== "." && seg !== ".." && /[. ]$/.test(seg)) hit.add("EWIN_TRAILING");
    if (rest.includes(":")) hit.add("EWIN_STREAM");
  });
  return WIN_CODES.filter((c) => hit.has(c));
}
// `windowsNames` option: true, false, or undefined (= are we on win32); anything else is EARG. One place for the extractor and the writers.
const winFlag = (v) => { if (v === undefined) return process.platform === "win32"; if (typeof v !== "boolean") throw new ZipError("windowsNames must be true or false", "EARG"); return v; };
const winWhy = (name) => { const c = windowsNameProblems(name); return c.length ? `not valid on Windows (${c.join(", ")})` : null; };
const unsupportedReason = (e) => (e.encrypted ? "is encrypted (not supported)" : e.method === 8 && e.csize === 0 ? "is a deflate entry with no data (a deflate stream is never empty; unzip refuses it too)" : e.method !== 0 && e.method !== 8 ? `compression method ${e.method} not supported (only stored and deflate)` : null);
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
  const legacy = legacyDecoder(legacyEncoding), path = resolve(zipPath); let fd, size, cdOff, entries;
  // A system error on the zip itself (ENOENT, EACCES, EISDIR...) is a ZipError with the same code; the original stays in `cause`.
  const sys = (err) => err instanceof ZipError || typeof err?.syscall !== "string" || typeof err.code !== "string" ? err : new ZipError(`${path}: ${err.message}`, err.code, { cause: err });
  try { fd = openSync(path, "r"); } catch (err) { throw sys(err); }
  try { const st = fstatSync(fd); if (st.isDirectory()) throw Object.assign(new Error("illegal operation on a directory"), { code: "EISDIR", syscall: "read" }); size = st.size; const c = readCentral(fd, size, path); cdOff = c.cdOff; entries = parseEntries(c.cd, c.total, path, legacy); }
  catch (err) { closeSync(fd); throw sys(err); }
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
    else { try { data = inflateRawSync(comp, { maxOutputLength: Math.max(1, e.usize) }); } catch (err) { throw new ZipError(`«${e.name}»: corrupted data or larger than declared (${err.code ?? err.message})`); } }
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
  if (e.method === 0) return pipeline(src, checker(e), sink);
  // C5.1: a corrupt deflate stream fails inside zlib with a raw error (code Z_*); the caller always gets a ZipError. Errors of the source or the sink stay as they are.
  return pipeline(src, createInflateRaw(), checker(e), sink).catch((err) => { throw typeof err?.code === "string" && err.code.startsWith("Z_") ? new ZipError(`«${e.name}»: corrupted data (${err.code})`, "EZIP", { cause: err }) : err; });
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
// extractZip(zip, dest, { overwrite, maxTotalBytes, maxEntries, filter, legacyEncoding }) -> { files, dirs, bytes, skipped, collisions }
//  skipped: symlinks and special files (never created); collisions: groups of PATHS (files, folder entries and the folders implied by a
//  file's path; folders spelled with a trailing «/») that differ only in NFC/NFD or case (legitimate on Linux, but on macOS/Windows one
//  would overwrite the other: the caller decides what to do with the warning). Folders that exist only because files sit inside them
//  merge without loss, so a group made only of those is not reported (C2.5).
const pathSegs = (name) => name.split("/").filter((x) => x && x !== ".");

// C2.5: the key under which two paths count as the same name on a normalising or case-insensitive file system. Upper then lower
// folds what toLowerCase alone misses (Greek final sigma); plain ASCII, the common case, skips the normalisation. Advisory only.
const foldName = (s) => (/^[\x20-\x7e]*$/.test(s) ? s.toLowerCase() : s.normalize("NFC").toUpperCase().toLowerCase().normalize("NFC"));
const noteName = (groups, path, spelled, real) => {
  const k = foldName(path); let g = groups.get(k); if (!g) groups.set(k, g = { names: new Set(), real: false });
  g.names.add(spelled); if (real) g.real = true; // real: a file or an explicit folder entry, not just a parent folder
};

// C3.9 (D32): the same report for the WRITER. `list` holds { name, dir } for every entry given; names were already vetted (no empty or «.» segment,
// no duplicates), so a plain split is enough. Same groups as extractZip: files, explicit folders and implied parent folders, folders spelled with a
// trailing «/», a group reported when it has two or more spellings and at least one real entry. Advisory only: the writer never refuses for it.
const collisionsOf = (list) => {
  const groups = new Map(), implied = new Set();
  for (const { name, dir } of list) {
    const segs = name.split("/").filter(Boolean);
    for (let i = 1; i < segs.length; i++) { const d = segs.slice(0, i).join("/"); if (!implied.has(d)) { implied.add(d); noteName(groups, d, `${d}/`, false); } }
    const key = segs.join("/"); noteName(groups, key, dir ? `${key}/` : key, true);
  }
  return [...groups.values()].filter((g) => g.real && g.names.size > 1).map((g) => [...g.names]);
};

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

// C2.7 (AUDIT-1, A-4): moves the planned items into the existing destination and, if one move fails, undoes the ones already done, so the
// destination ends as it was: new items go back to the temp folder, a replaced file is restored from a backup made just before it was replaced
// (a hard link, so the replacing rename stays atomic; a copy where links are impossible). If the undo fails too, the error is EPARTIAL with
// `leftBehind` (paths still holding the new content) and `backupDir` (kept, with the originals). `canRetry`: an EXDEV before anything moved
// returns "retry" so the caller can redo the extraction with the temp folder inside the destination (C2.8). Every move goes through `rn`.
const mergeMove = (plan, real, rn, canRetry) => {
  const done = []; let bakDir = null; const dropBackups = () => { if (bakDir) rmSync(bakDir, { recursive: true, force: true }); };
  for (const [from, to] of plan) {
    let saved = null;
    try {
      let st = null; try { st = lstatSync(to); } catch { /* new */ }
      if (st) { bakDir ??= mkdtempSync(join(real, ".chicla-bak-")); saved = join(bakDir, String(done.length)); try { linkSync(to, saved); } catch { copyFileSync(to, saved); } }
      rn(from, to);
    } catch (err) {
      if (saved) rmSync(saved, { force: true });
      if (err.code === "EXDEV" && !done.length && canRetry) { dropBackups(); return "retry"; }
      const left = [];
      for (const o of done.reverse()) { try { if (o.saved) rn(o.saved, o.to); else rn(o.to, o.from); } catch { left.push(o.to); } }
      if (!left.length) { dropBackups(); throw err; }
      throw Object.assign(new ZipError(`the merge failed (${err.code ?? "fs"}: ${err.message}) and could not be fully undone: ${left.length} item(s) are left in ${real}; originals saved in ${bakDir}`, "EPARTIAL", { cause: err }), { leftBehind: left, backupDir: bakDir });
    }
    done.push({ from, to, saved });
  }
  dropBackups();
};

export const extractZip = async (zipPath, dest, { overwrite = false, maxTotalBytes = 2 ** 33, maxEntries = 1_000_000, filter, legacyEncoding, windowsNames, _rename = renameSync } = {}) => { // _rename: test-only hook (C2.8)
  const win = winFlag(windowsNames);
  const { path, size, entries: all } = listZip(zipPath, { legacyEncoding }); // C2.6: how names without bit 11 / Unicode Path / UTF-8 are decoded
  if (all.length > maxEntries) throw new ZipError(`${path}: ${all.length} entries, above the limit of ${maxEntries}`);
  const entries = filter ? all.filter(filter) : all, problems = [], skipped = [], seen = new Set(), dirKeys = new Set(), groups = new Map();
  let declared = 0;
  for (const e of entries) {
    const unsafe = unsafeNameReason(e.name.replace(/\/+$/, "") || (e.name ? "/" : "")); if (unsafe) { problems.push(`«${e.name}»: ${unsafe}`); continue; }
    if (e.isSymlink || e.isSpecial) { skipped.push({ name: e.name, reason: e.isSymlink ? "symlink (never created)" : "special file" }); continue; }
    const segs = pathSegs(e.name);
    if (!segs.length) { skipped.push({ name: e.name, reason: "the destination folder itself (never written to)" }); continue; }
    if (win) { const w = winWhy(e.name.replace(/\/+$/, "")); if (w) { problems.push(`«${e.name}»: ${w}`); continue; } }
    for (let i = 1; i < segs.length; i++) { const d = segs.slice(0, i).join("/"); if (!dirKeys.has(d)) { dirKeys.add(d); noteName(groups, d, `${d}/`, false); } }
    const key = segs.join("/");
    if (e.isDir) { dirKeys.add(key); noteName(groups, key, `${key}/`, true); }
    else { const bad = unsupportedReason(e); if (bad) problems.push(`«${e.name}» ${bad}`); if (seen.has(key)) problems.push(`«${e.name}»: duplicate name in the zip`); seen.add(key); declared += e.usize; noteName(groups, key, key, true); }
  }
  for (const k of seen) if (dirKeys.has(k)) problems.push(`«${k}»: is a file and a folder at the same time`);
  if (declared > maxTotalBytes) problems.push(`total declared size ${declared} bytes, above the limit of ${maxTotalBytes}`);
  if (problems.length) throw new ZipError(`${path}: extraction refused (nothing was written):\n  - ${problems.slice(0, 10).join("\n  - ")}${problems.length > 10 ? `\n  … and ${problems.length - 10} more` : ""}`, "EUNSAFE");
  const collisions = [...groups.values()].filter((g) => g.real && g.names.size > 1).map((g) => [...g.names]);

  // C2.1: everything is extracted into a fresh temp folder next to the destination (same volume) and only moved in once every
  // file is written and verified, so a bad zip never changes the destination. A new destination appears with one rename;
  // an existing one is merged by renames after a full conflict check (an OS error during those renames is undone by mergeMove, C2.7).
  let real = null; // the existing destination, resolved; null if it does not exist yet
  try { real = realpathSync(dest); } catch (err) { if (err.code !== "ENOENT") throw new ZipError(`${dest}: ${err.message}`, "EEXIST"); }
  let lst = null; try { lst = lstatSync(dest); } catch { /* absent */ }
  if (real ? !statSync(real).isDirectory() : lst) throw new ZipError(`${dest}: exists and is not a folder you can extract into`, "EEXIST");
  const target = resolve(dest); let tmp = null, why;
  let base = target; while (!real && !existsSync(base)) base = dirname(base);
  // Next to the destination keeps it untouched, but only on the same volume: if the destination is the root of a mount (a USB drive, a Docker
  // volume) its parent is on another device and `rename` would fail with EXDEV, so the temp folder goes inside it (AUDIT-1, A-1).
  const sameVolume = (a, b) => { try { return statSync(a).dev === statSync(b).dev; } catch { return false; } };
  // C2.8 (AUDIT-1, A-6): a bind mount has the same `dev` as its parent and still fails with EXDEV, so the check above cannot see it. Each place is
  // an attempt: if the FIRST rename of the merge reports EXDEV (nothing moved yet) the whole extraction is redone in the next place (inside the
  // destination). A later EXDEV, and any other error, are not retried. The body below is not re-indented, to keep the diff small.
  const wheres = real ? (sameVolume(dirname(real), real) ? [dirname(real), real] : [real]) : [base];
  attempts: for (let at = 0; at < wheres.length; at++) {
  const lastAttempt = at === wheres.length - 1; tmp = null;
  try { tmp = mkdtempSync(join(wheres[at], ".chicla-tmp-")); } catch (err) { why = err; if (lastAttempt) throw new ZipError(`${dest}: cannot create a temporary folder next to it (${why.message})`, "EEXIST"); continue; }
  chmodSync(tmp, 0o700); // mkdtemp honours the umask: under 0o277 the owner could not even write here (AUDIT-1, A-2); the final mode is set at the end
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
    if (!real) { mkdirSync(dirname(target), { recursive: true }); _rename(tmp, target); tmp = null; }
    else if (mergeMove(mergePlan(tmp, real, overwrite), real, _rename, !lastAttempt) === "retry") continue attempts; // the finally below removes this temp folder
  } catch (err) { // C2.4: whatever the file system throws (name too long, no space, permissions) reaches the caller as a ZipError, never raw
    if (err instanceof ZipError) throw err;
    throw new ZipError(`${path}: extraction failed, nothing was kept (${err.code ?? "fs"}: ${err.message})`, "EZIP", { cause: err });
  } finally { if (fd !== null) closeSync(fd); if (tmp) rmSync(tmp, { recursive: true, force: true }); }
  return { files, dirs, bytes, skipped, collisions };
  }
};

// ---------- UTF-8 flag ----------
// Info-ZIP's `zip` (Linux and macOS) writes UTF-8 names WITHOUT bit 11 and without Unicode Path (neither `-UN=UTF8` nor a
// UTF-8 locale changes that). This sets bit 11 on the entries whose non-ASCII name is valid UTF-8: 2 bytes per entry (local
// and central header); data, sizes and CRC stay the same. Idempotent. ASCII names and names that are not UTF-8 are left alone.
export const markUtf8Names = (zipPath) => {
  const path = resolve(zipPath), fd = openSync(path, "r+");
  try {
    const size = fstatSync(fd).size, { cd, total, cdOff } = readCentral(fd, size, path), entries = parseEntries(cd, total, path), todo = [];
    // C4.1 (ROADMAP B1): `cdPos` is relative to the central directory, so the file position adds `cdOff`. Everything is checked BEFORE the first byte is
    // written, so a bad entry leaves the file as it was.
    for (const e of entries) {
      if (!e.flagMissing) continue;
      if (e.localOffset + 30 > size || readAt(fd, e.localOffset, 4).readUInt32LE(0) !== 0x04034b50) throw new ZipError(`${path}: invalid local header for «${e.name}»`);
      todo.push(e.localOffset + 6, cdOff + e.cdPos + 8);
    }
    for (const pos of todo) { const b = readAt(fd, pos, 2); b.writeUInt16LE(b.readUInt16LE(0) | 0x800, 0); writeSync(fd, b, 0, 2, pos); }
    return { patched: todo.length / 2, total: entries.length };
  } finally { closeSync(fd); }
};

// ---------- writer (C3.2) ----------
// writeZip(outPath, sources, { level = 6 }) -> { entries: [{ name, method, size, csize, crc32 }], bytes }
// sources: [{ name, data, mtime?, mode? }] for files, [{ name: "dir/", mtime?, mode? }] for folders. The data is in memory (streams come with C3.7).
const NO_DEFLATE = /\.(zip|gz|tgz|bz2|xz|zst|7z|rar|jar|apk|jpe?g|png|gif|webp|heic|mp[34]|m4a|aac|ogg|flac|mov|mkv|webm|avi|pdf|woff2?|docx|xlsx|pptx)$/i;
// DOS dates have no time zone: tools read them as local time, so the default is local time. `utc` (deterministic output) uses UTC, so the bytes
// do not depend on the machine's zone. Range 1980-01-01 00:00:00 .. 2107-12-31 23:59:58 (2 s resolution; odd seconds round down).
const dosStamp = (d, utc = false) => {
  const t = d.getTime(); if (!Number.isFinite(t)) throw new ZipError("invalid modification time", "EARG");
  const [Y, M, D, h, m, sec] = utc ? [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()] : [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()];
  if (Y < 1980) return { date: (1 << 5) | 1, time: 0 };
  if (Y > 2107) return { date: (127 << 9) | (12 << 5) | 31, time: (23 << 11) | (59 << 5) | 29 };
  return { date: ((Y - 1980) << 9) | ((M + 1) << 5) | D, time: (h << 11) | (m << 5) | (sec >> 1) };
};
// A whole number of seconds since 1970 (a number or a string of digits, as SOURCE_DATE_EPOCH is). Anything else is refused, never ignored.
const parseEpoch = (v, what) => {
  const ok = typeof v === "number" ? Number.isSafeInteger(v) && v >= 0 : typeof v === "string" && /^[0-9]{1,15}$/.test(v);
  if (!ok || Number(v) > 8.64e12) throw new ZipError(`${what} must be a whole number of seconds since 1970`, "EARG");
  return new Date(Number(v) * 1000);
};
const DOS_START = new Date(Date.UTC(1980, 0, 1));
// C3.8: the extended timestamp extra (UT, 0x5455: flags 1 = mtime, then seconds since 1970 as a signed 32-bit number, as Info-ZIP writes it) carries the
// exact time (the DOS fields have 2-second steps, no zone and are clamped to 1980..2107). Only with `extendedTime: true` (off by default: with any extra
// present, Info-ZIP 6.00 in a non-UTF-8 locale extracts non-ASCII names as «caf#U00e9», so default bytes stay as they were). A time that does not fit
// 32 bits gets none: readers use the DOS stamp.
const utSecs = (d) => { const t = Math.floor(d.getTime() / 1000); return t >= -0x80000000 && t <= 0x7fffffff ? t : undefined; };
const utBlock = (t) => { const x = Buffer.alloc(9); x.writeUInt16LE(0x5455, 0); x.writeUInt16LE(5, 2); x[4] = 1; x.writeInt32LE(t, 5); return x; };
// Node'"'"'s one-shot zlib calls silently truncate an input of 4 GiB or more (the length wraps modulo 2^32: found by writing a 4.4 GB file, whose
// zip still passed `unzip -t` and Python), and `fs.writeSync` refuses more than 2 GiB per call. So big data is compressed and checksummed in
// blocks, and written in slices. `_limits.chunk` lowers the block size so tests can reach those paths with small data.
// One pass: each block feeds the crc32 and (when asked, C3.6) the SHA-256 together, so the data is walked once and both describe the same bytes.
const digest = (data, chunk, wantSha) => { const h = wantSha ? createHash("sha256") : null; let c = 0; for (let o = 0; o < data.length; o += chunk) { const b = data.subarray(o, o + chunk); c = crc32(b, c); h?.update(b); } return { crc: c, sha256: h ? h.digest("hex") : undefined }; };
const deflateChunks = async (data, level, chunk) => { // resolves to null as soon as the output cannot be smaller than the input
  const d = zlib.createDeflateRaw({ level }), parts = []; let total = 0, giveUp = false;
  d.on("data", (b) => { total += b.length; if (total >= data.length) giveUp = true; else parts.push(b); }); d.on("error", () => {});
  const ended = once(d, "end");
  for (let o = 0; o < data.length && !giveUp; o += chunk) if (!d.write(data.subarray(o, o + chunk))) await Promise.race([once(d, "drain"), ended]);
  d.end(); d.resume(); await ended; return giveUp ? null : Buffer.concat(parts);
};
// 0xFFFF and 0xFFFFFFFF are the zip64 "look in the extra field" markers, so the largest plain values are one less.
// `zip64`: "auto" (default) writes zip64 records only where a value does not fit; true writes them for every entry and the end of the
// archive (readers must cope; handy to test them); false refuses with EZIP64 whatever needs them (for readers that cannot cope).
// `_limits` replaces the thresholds so tests can reach the automatic switch without 4 GiB of data. It is not part of the API.
const needsZip64 = (what) => new ZipError(`${what} needs zip64, which was turned off (zip64: false)`, "EZIP64");
// Shared by writeZip and writeZipStream (C3.7): the option checks, the name checks and the Unix attribute word. Same rules, same codes, one place.
const checkOpts = ({ level, zip64, deterministic, epoch, sha256, extendedTime }) => {
  if (!Number.isInteger(level) || level < 0 || level > 9) throw new ZipError("level must be an integer from 0 to 9", "EARG");
  if (zip64 !== "auto" && zip64 !== true && zip64 !== false) throw new ZipError('zip64 must be "auto", true or false', "EARG");
  if (typeof sha256 !== "boolean") throw new ZipError("sha256 must be true or false", "EARG");
  if (typeof extendedTime !== "boolean") throw new ZipError("extendedTime must be true or false", "EARG");
  if (typeof deterministic !== "boolean") throw new ZipError("deterministic must be true or false", "EARG");
  if (epoch !== undefined && !deterministic) throw new ZipError("epoch needs deterministic: true", "EARG");
  return !deterministic ? undefined : epoch !== undefined ? parseEpoch(epoch, "epoch") : process.env.SOURCE_DATE_EPOCH !== undefined ? parseEpoch(process.env.SOURCE_DATE_EPOCH, "SOURCE_DATE_EPOCH") : undefined;
};
// AUDIT-2 A-1: `<out>.partial` is never followed. Whatever sits there (a stale file, a symlink planted in a shared folder) is removed first (a link is
// removed, not its target), then the file is created exclusively and without following links; a race that recreates it in between is EEXIST, not an overwrite.
const openPartial = (tmp) => { rmSync(tmp, { force: true }); return openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o666); };
const dropPartial = (tmp) => { try { rmSync(tmp, { force: true }); } catch { /* already failing */ } };
// AUDIT-2 A-2: after the rename, the folder entry is made durable too (best effort: not possible on every platform). One place for writeZip and createZip.
const syncDir = (out) => { try { const d = openSync(dirname(out), "r"); try { fsyncSync(d); } finally { closeSync(d); } } catch { /* best effort */ } };
const vetName = (s, seen, win) => {
  const name = s?.name; if (typeof name !== "string") throw new ZipError("a source has no name", "EARG");
  const dir = name.endsWith("/"), why = unsafeNameReason(dir ? name.replace(/\/+$/, "") : name);
  if (why) throw new ZipError(`unsafe name «${name}»: ${why}`, "EUNSAFE");
  const wwhy = win ? winWhy(dir ? name.replace(/\/+$/, "") : name) : null; if (wwhy) throw new ZipError(`unsafe name «${name}»: ${wwhy}`, "EUNSAFE");
  // AUDIT-2 A-3 (D31): the WRITER refuses an empty or «.» segment («./x», «a//b», «a/./b», «a//»): «x» and «./x» in one zip pass `unzip -t`, are a duplicate for
  // Chicla's extractor and for `unzip` the last one wins. The reader and extractor still accept such names from other tools.
  if ((dir ? name.slice(0, -1) : name).split("/").some((g) => g === "" || g === ".")) throw new ZipError(`unsafe name «${name}»: empty or «.» path segment`, "EUNSAFE");
  if (seen.has(name)) throw new ZipError(`name given twice: «${name}»`, "EDUP"); seen.add(name);
  const nameBytes = Buffer.from(name, "utf8"); if (nameBytes.length > 0xffff) throw new ZipError(`name too long (${nameBytes.length} bytes)`, "EARG");
  return { name, nameBytes, dir };
};
const attrOf = (s, dir, deterministic) => (((deterministic ? (dir || (s.mode ?? 0) & 0o100 ? 0o755 : 0o644) : (s.mode ?? (dir ? 0o755 : 0o644)) & 0o777) | (dir ? 0o040000 : 0o100000)) << 16 | (dir ? 0x10 : 0)) >>> 0;
// `deterministic: true` (C3.4): the same sources give the same bytes on any machine, day and time zone. Dates are read in UTC from `epoch` (seconds),
// else from the SOURCE_DATE_EPOCH environment variable, else from each source's `mtime` (none: 1980-01-01 00:00); modes become 0644 (0755 for
// folders and files with the owner execute bit). The order of `sources` is kept as given. Without it: local-time dates, "now" for a source with no
// `mtime`, modes as given. `epoch` without `deterministic: true` is refused, and an invalid epoch is an error, never silently ignored.
export const writeZip = async (outPath, sources, { level = 6, zip64 = "auto", deterministic = false, epoch, sha256 = false, extendedTime = false, windowsNames, _limits } = {}) => {
  const L = { max32: 0xfffffffe, max16: 0xfffe, chunk: 1 << 30, ..._limits };
  if (!Array.isArray(sources)) throw new ZipError("sources must be an array", "EARG");
  const fixed = checkOpts({ level, zip64, deterministic, epoch, sha256, extendedTime }), win = winFlag(windowsNames);
  const refuse = (what) => { if (zip64 === false) throw needsZip64(what); };
  if (sources.length > L.max16) refuse(`${sources.length} entries`);
  const now = new Date(), seen = new Set(), items = [];
  for (const s of sources) {
    const { name, nameBytes, dir } = vetName(s, seen, win);
    let data = Buffer.alloc(0);
    if (dir) { if (s.data?.length) throw new ZipError(`«${name}» is a folder and has data`, "EARG"); }
    else if (Buffer.isBuffer(s.data)) data = s.data;
    else if (s.data instanceof Uint8Array) data = Buffer.from(s.data.buffer, s.data.byteOffset, s.data.byteLength);
    else throw new ZipError(`«${name}» has no data (a Buffer or Uint8Array)`, "EARG");
    const when = deterministic ? fixed ?? s.mtime ?? DOS_START : s.mtime ?? now;
    let method = 0, body = data;
    const blocks = data.length > L.chunk;
    if (data.length && level > 0 && !NO_DEFLATE.test(name)) { const c = blocks ? await deflateChunks(data, level, L.chunk) : zlib.deflateRawSync(data, { level }); if (c && c.length < data.length) { method = 8; body = c; } }
    const dg = dir ? { crc: 0 } : digest(data, L.chunk, sha256);
    const z64 = zip64 === true || data.length > L.max32 || body.length > L.max32; if (z64 && zip64 !== true) refuse(`«${name}» (${data.length} bytes)`);
    items.push({ name, nameBytes, dir, method, body, size: data.length, crc: dg.crc, sha256: dg.sha256, stamp: dosStamp(when, deterministic), ut: extendedTime && utSecs(when) !== undefined ? 9 : 0, utv: utSecs(when), flags: /^[\x00-\x7f]*$/.test(name) ? 0 : 0x800, z64,
      attr: attrOf(s, dir, deterministic) });
  }
  let pos = 0; // layout first (nothing is opened yet, so a refusal leaves no file): local headers with their zip64 extra, then the central directory
  for (const it of items) {
    it.offset = pos; pos += 30 + it.nameBytes.length + (it.z64 ? 20 : 0) + it.ut + it.body.length;
    it.offMark = it.offset > L.max32; if (it.offMark) refuse(`the offset of «${it.name}»`);
    it.cx = it.z64 || it.offMark ? 4 + 8 * ((it.z64 ? 2 : 0) + (it.offMark ? 1 : 0)) : 0; // central zip64 extra: usize, csize (together), offset
    it.need = it.z64 || it.offMark ? 45 : it.method === 8 || it.dir ? 20 : 10;
  }
  const cdOff = pos, cdSize = items.reduce((n, it) => n + 46 + it.nameBytes.length + it.cx + it.ut, 0), eocd64 = zip64 === true || items.length > L.max16 || cdSize > L.max32 || cdOff > L.max32;
  if (eocd64 && zip64 === false) throw needsZip64("the end of the archive");
  const out = resolve(outPath), tmp = `${out}.partial`; let fd, closed = false; pos = 0;
  const put = (buf) => { for (let o = 0; o < buf.length; ) o += writeSync(fd, buf, o, Math.min(buf.length - o, 1 << 30)); pos += buf.length; };
  const big = (v, o, b) => b.writeBigUInt64LE(BigInt(v), o);
  try {
    fd = openPartial(tmp);
    for (const it of items) {
      const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(it.need, 4); h.writeUInt16LE(it.flags, 6); h.writeUInt16LE(it.method, 8);
      h.writeUInt16LE(it.stamp.time, 10); h.writeUInt16LE(it.stamp.date, 12); h.writeUInt32LE(it.crc, 14);
      h.writeUInt32LE(it.z64 ? 0xffffffff : it.body.length, 18); h.writeUInt32LE(it.z64 ? 0xffffffff : it.size, 22); h.writeUInt16LE(it.nameBytes.length, 26); h.writeUInt16LE((it.z64 ? 20 : 0) + it.ut, 28);
      put(h); put(it.nameBytes);
      if (it.z64) { const x = Buffer.alloc(20); x.writeUInt16LE(1, 0); x.writeUInt16LE(16, 2); big(it.size, 4, x); big(it.body.length, 12, x); put(x); }
      if (it.ut) put(utBlock(it.utv));
      put(it.body);
    }
    for (const it of items) {
      const h = Buffer.alloc(46); h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE((3 << 8) | 45, 4); h.writeUInt16LE(it.need, 6); h.writeUInt16LE(it.flags, 8); h.writeUInt16LE(it.method, 10);
      h.writeUInt16LE(it.stamp.time, 12); h.writeUInt16LE(it.stamp.date, 14); h.writeUInt32LE(it.crc, 16);
      h.writeUInt32LE(it.z64 ? 0xffffffff : it.body.length, 20); h.writeUInt32LE(it.z64 ? 0xffffffff : it.size, 24);
      h.writeUInt16LE(it.nameBytes.length, 28); h.writeUInt16LE(it.cx + it.ut, 30); h.writeUInt32LE(it.attr, 38); h.writeUInt32LE(it.offMark ? 0xffffffff : it.offset, 42);
      put(h); put(it.nameBytes);
      if (it.cx) { const x = Buffer.alloc(it.cx); x.writeUInt16LE(1, 0); x.writeUInt16LE(it.cx - 4, 2); let o = 4; if (it.z64) { big(it.size, o, x); big(it.body.length, o + 8, x); o += 16; } if (it.offMark) big(it.offset, o, x); put(x); }
      if (it.ut) put(utBlock(it.utv));
    }
    if (eocd64) {
      const at = pos, z = Buffer.alloc(56); z.writeUInt32LE(0x06064b50, 0); big(44, 4, z); z.writeUInt16LE((3 << 8) | 45, 12); z.writeUInt16LE(45, 14); big(items.length, 24, z); big(items.length, 32, z); big(cdSize, 40, z); big(cdOff, 48, z);
      const l = Buffer.alloc(20); l.writeUInt32LE(0x07064b50, 0); big(at, 8, l); l.writeUInt32LE(1, 16); put(z); put(l);
    }
    const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0);
    e.writeUInt16LE(items.length > L.max16 ? 0xffff : items.length, 8); e.writeUInt16LE(items.length > L.max16 ? 0xffff : items.length, 10);
    e.writeUInt32LE(cdSize > L.max32 ? 0xffffffff : cdSize, 12); e.writeUInt32LE(cdOff > L.max32 ? 0xffffffff : cdOff, 16);
    put(e); fsyncSync(fd); closeSync(fd); closed = true; renameSync(tmp, out);
    syncDir(out);
    return { entries: items.map((it) => ({ name: it.name, method: it.method, size: it.size, csize: it.body.length, crc32: it.crc, ...(it.sha256 ? { sha256: it.sha256 } : {}) })), bytes: pos, collisions: collisionsOf(items) };
  } catch (err) {
    if (fd !== undefined && !closed) { try { closeSync(fd); } catch { /* already failing */ } }
    dropPartial(tmp);
    throw err instanceof ZipError ? err : new ZipError(`${out}: ${err.message}`, err.code ?? "EZIP", { cause: err });
  }
};

// ---------- streaming output (C3.7) ----------
// writeZipStream(sink, sources, opts) -> Promise<{ entries, bytes }>: the zip goes to a Writable (file, socket, stdout, pipe), and the data of a file never
// has to be in memory whole. Sources: { name, data } (Buffer / Uint8Array), { name, stream } (an async or sync iterable of Buffer / Uint8Array chunks, a
// Readable, or a function returning one, called only when the writer reaches the entry) and folders { name: "dir/" }; `mtime` and `mode` as in writeZip.
// Every FILE is streamed: bit 3, a local header with crc and sizes 0 and a zero zip64 extra, deflate always (level 0 and already-compressed names use
// deflate with stored blocks: a stored entry with a data descriptor cannot be streamed), then a 24-byte descriptor (signature, crc32, csize u64, usize
// u64). Sizes are unknown up front, so files are zip64 and `zip64: false` refuses them with EZIP64 (D29). Folders are plain. The central directory is
// written last, from metadata only. Options as writeZip (level, zip64, deterministic, epoch, sha256, extendedTime; `_limits` is for tests).
// The sink is ENDED and awaited on success and DESTROYED on any failure (so a half zip never looks finished). Errors: EARG, EUNSAFE, EDUP, EZIP64
// before one byte is written (one exception: a folder offset or central directory past 4 GiB with zip64: false is found while writing), ESOURCE (a
// source failed; `cause` kept) and EZIP (the sink failed or was closed). Backpressure is honoured: nothing is read ahead of a slow sink beyond the
// stream buffers. No `.partial` file and no rename: there is no file here (a caller that wants one writes to `<out>.partial` and renames).
const SLICE = 1 << 30, ZERO64 = Buffer.concat([Buffer.from([1, 0, 16, 0]), Buffer.alloc(16)]);
const srcError = (e) => (e instanceof ZipError ? e : new ZipError(`a source stream failed: ${e?.message ?? e}`, "ESOURCE", { cause: e }));
const streamLike = (v) => typeof v === "function" || (v !== null && typeof v === "object" && (typeof v[Symbol.asyncIterator] === "function" || typeof v[Symbol.iterator] === "function"));
const closeStream = (st) => new Promise((r) => { if (st.closed) return r(); st.once("close", r); st.destroy(); });
async function* tapChunks(s, st) { // what the source gives, checked, cut to at most 1 GiB, and counted (crc32, size, sha256) on its way to the compressor
  let src; try { src = s.data !== undefined ? [s.data] : typeof s.stream === "function" ? s.stream() : s.stream; } catch (e) { throw srcError(e); }
  try {
    for await (const c of src) {
      if (!(c instanceof Uint8Array)) throw new ZipError("a source chunk is not a Buffer or Uint8Array", "EARG");
      const b = Buffer.isBuffer(c) ? c : Buffer.from(c.buffer, c.byteOffset, c.byteLength);
      for (let o = 0; o < b.length; o += SLICE) { const p = b.subarray(o, o + SLICE); st.crc = crc32(p, st.crc); st.h?.update(p); st.size += p.length; yield p; }
    }
  } catch (e) { throw srcError(e); }
}
export const writeZipStream = async (sink, sources, { level = 6, zip64 = "auto", deterministic = false, epoch, sha256 = false, extendedTime = false, windowsNames, _limits } = {}) => {
  if (!sink || typeof sink.write !== "function" || typeof sink.end !== "function" || typeof sink.on !== "function") throw new ZipError("sink must be a Writable stream", "EARG");
  const L = { max32: 0xfffffffe, max16: 0xfffe, ..._limits };
  let dead = null, pos = 0; sink.on("error", (e) => { dead ??= e; });
  const closed = new Promise((res) => sink.once("close", res));
  const shut = () => dead ?? new ZipError("the sink was closed", "EZIP");
  const put = async (b) => { if (dead || sink.destroyed) throw shut(); pos += b.length; if (!sink.write(b)) await Promise.race([once(sink, "drain"), closed]); if (dead || sink.destroyed) throw shut(); };
  const big = (v, o, b) => b.writeBigUInt64LE(BigInt(v), o);
  try {
    if (!Array.isArray(sources)) throw new ZipError("sources must be an array", "EARG");
    const fixed = checkOpts({ level, zip64, deterministic, epoch, sha256, extendedTime }), win = winFlag(windowsNames);
    if (zip64 === false && sources.length > L.max16) throw needsZip64(`${sources.length} entries`);
    const now = new Date(), seen = new Set(), items = [];
    for (const s of sources) {
      const { name, nameBytes, dir } = vetName(s, seen, win);
      if (dir) { if (s.data?.length || s.stream !== undefined) throw new ZipError(`«${name}» is a folder and has data`, "EARG"); }
      else {
        if ((s.data === undefined) === (s.stream === undefined)) throw new ZipError(`«${name}» needs exactly one of data and stream`, "EARG");
        if (s.data !== undefined && !(s.data instanceof Uint8Array)) throw new ZipError(`«${name}» has no data (a Buffer or Uint8Array)`, "EARG");
        if (s.stream !== undefined && !streamLike(s.stream)) throw new ZipError(`«${name}» has a stream that is not iterable`, "EARG");
        if (zip64 === false) throw needsZip64(`«${name}» (streamed: its size is not known up front)`);
      }
      const when = deterministic ? fixed ?? s.mtime ?? DOS_START : s.mtime ?? now;
      items.push({ name, nameBytes, dir, s, stamp: dosStamp(when, deterministic), ut: extendedTime && utSecs(when) !== undefined ? 9 : 0, utv: utSecs(when), flags: /^[\x00-\x7f]*$/.test(name) ? 0 : 0x800, attr: attrOf(s, dir, deterministic), crc: 0, csize: 0, usize: 0 });
    }
    for (const it of items) {
      it.offset = pos; it.offMark = pos > L.max32; if (it.offMark && zip64 === false) throw needsZip64(`the offset of «${it.name}»`);
      const file = !it.dir, h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(file || it.offMark ? 45 : 20, 4); h.writeUInt16LE(it.flags | (file ? 8 : 0), 6); h.writeUInt16LE(file ? 8 : 0, 8);
      h.writeUInt16LE(it.stamp.time, 10); h.writeUInt16LE(it.stamp.date, 12); h.writeUInt16LE(it.nameBytes.length, 26); h.writeUInt16LE((file ? 20 : 0) + it.ut, 28);
      await put(h); await put(it.nameBytes); if (file) await put(ZERO64); if (it.ut) await put(utBlock(it.utv));
      if (!file) continue;
      const st = { crc: 0, size: 0, h: sha256 ? createHash("sha256") : null }, d = zlib.createDeflateRaw({ level: level === 0 || NO_DEFLATE.test(it.name) ? 0 : level }), input = Readable.from(tapChunks(it.s, st));
      input.on("error", (e) => d.destroy(e)); input.pipe(d);
      try { for await (const c of d) { it.csize += c.length; await put(c); } } finally { d.destroy(); await closeStream(input); }
      it.crc = st.crc; it.usize = st.size; it.sha = st.h?.digest("hex");
      const t = Buffer.alloc(24); t.writeUInt32LE(0x08074b50, 0); t.writeUInt32LE(it.crc, 4); big(it.csize, 8, t); big(it.usize, 16, t); await put(t);
    }
    const cdOff = pos;
    for (const it of items) {
      const z64 = !it.dir, cx = z64 || it.offMark ? 4 + 8 * ((z64 ? 2 : 0) + (it.offMark ? 1 : 0)) : 0;
      const h = Buffer.alloc(46); h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE((3 << 8) | 45, 4); h.writeUInt16LE(z64 || it.offMark ? 45 : 20, 6); h.writeUInt16LE(it.flags | (z64 ? 8 : 0), 8); h.writeUInt16LE(z64 ? 8 : 0, 10);
      h.writeUInt16LE(it.stamp.time, 12); h.writeUInt16LE(it.stamp.date, 14); h.writeUInt32LE(it.crc, 16); h.writeUInt32LE(z64 ? 0xffffffff : 0, 20); h.writeUInt32LE(z64 ? 0xffffffff : 0, 24);
      h.writeUInt16LE(it.nameBytes.length, 28); h.writeUInt16LE(cx + it.ut, 30); h.writeUInt32LE(it.attr, 38); h.writeUInt32LE(it.offMark ? 0xffffffff : it.offset, 42);
      await put(h); await put(it.nameBytes);
      if (cx) { const x = Buffer.alloc(cx); x.writeUInt16LE(1, 0); x.writeUInt16LE(cx - 4, 2); let o = 4; if (z64) { big(it.usize, o, x); big(it.csize, o + 8, x); o += 16; } if (it.offMark) big(it.offset, o, x); await put(x); }
      if (it.ut) await put(utBlock(it.utv));
    }
    const cdSize = pos - cdOff, eocd64 = zip64 === true || items.length > L.max16 || cdSize > L.max32 || cdOff > L.max32;
    if (eocd64 && zip64 === false) throw needsZip64("the end of the archive");
    if (eocd64) {
      const at = pos, z = Buffer.alloc(56); z.writeUInt32LE(0x06064b50, 0); big(44, 4, z); z.writeUInt16LE((3 << 8) | 45, 12); z.writeUInt16LE(45, 14); big(items.length, 24, z); big(items.length, 32, z); big(cdSize, 40, z); big(cdOff, 48, z);
      const l = Buffer.alloc(20); l.writeUInt32LE(0x07064b50, 0); big(at, 8, l); l.writeUInt32LE(1, 16); await put(z); await put(l);
    }
    const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0);
    e.writeUInt16LE(items.length > L.max16 ? 0xffff : items.length, 8); e.writeUInt16LE(items.length > L.max16 ? 0xffff : items.length, 10);
    e.writeUInt32LE(cdSize > L.max32 ? 0xffffffff : cdSize, 12); e.writeUInt32LE(cdOff > L.max32 ? 0xffffffff : cdOff, 16);
    await put(e); sink.end(); await finished(sink);
    return { entries: items.map((it) => ({ name: it.name, method: it.dir ? 0 : 8, size: it.usize, csize: it.csize, crc32: it.crc, ...(it.sha ? { sha256: it.sha } : {}) })), bytes: pos, collisions: collisionsOf(items) };
  } catch (err) {
    sink.destroy();
    throw err instanceof ZipError ? err : new ZipError(`stream output failed: ${err.message}`, "EZIP", { cause: err });
  }
};

// ---------- tree walk (C3.5) ----------
// createZip(outPath, root, { exclude, symlinks = "skip", ...writeZipOptions }) -> { entries, bytes, skipped: [{ name, reason }] }
// Walks `root` depth first, siblings sorted by the bytes of their names, a folder before its contents (the order of readdir never shows), and
// writes it with writeZip (so `level`, `zip64`, `deterministic` and `epoch` pass through). `exclude(rel, { isDir })` true leaves it out (an
// excluded folder is not entered). Symlinks are never followed: "skip" reports them, "error" refuses with ESYMLINK. Sockets, FIFOs and devices
// are skipped as "special" and never read. The output may not be inside `root` (ERECURSE, symlinks resolved). Files are read whole, unless
// `stream: true` (to `<out>.partial`, then rename) or `outPath` is a Writable: then nothing is read at listing time and each file is opened when the writer
// reaches it and read in slices through writeZipStream (C3.7b, D30; ECHANGED after each slice; a Writable is always streamed and destroyed on failure).
const realish = (p) => { // realpath of the nearest existing ancestor + the rest, so a folder that does not exist yet is still placed correctly
  const rest = []; let d = p;
  for (;;) { try { return join(realpathSync(d), ...rest.reverse()); } catch { const up = dirname(d); if (up === d) return p; rest.push(basename(d)); d = up; } }
};
// C3.6: the file must be the one that was listed (`st`, from lstat) and must not move while it is read: size, mtime, ctime and inode are compared at the
// listing, at the open and after the read, and the bytes read must be as many as the size said; otherwise ECHANGED (a zip of a half-written file would
// look fine to every reader). Limit: a rewrite of the same size within the clock's resolution of the mtime is not seen. `after` is a test hook.
const sameFile = (a, b) => a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.ino === b.ino && a.dev === b.dev;
const readNoFollow = (abs, name, st, after) => { // O_NOFOLLOW: a file swapped for a symlink after it was listed is not followed; O_NONBLOCK: a FIFO cannot block the open
  const changed = () => new ZipError(`«${name}» changed while it was being read; run it again when nothing is writing to it`, "ECHANGED");
  let fd; try { fd = openSync(abs, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)); } catch (e) { if (e.code === "ELOOP") return { skip: "symlink" }; throw e; }
  try {
    const a = fstatSync(fd); if (!a.isFile()) return { skip: "special" };
    if (!sameFile(a, st)) throw changed();
    const data = readFileSync(fd); after?.(abs);
    if (data.length !== a.size || !sameFile(a, fstatSync(fd))) throw changed();
    return { data };
  } finally { closeSync(fd); }
};
// C3.7b: the streaming read. Opened when the writer reaches the entry (one descriptor at a time), read in slices of at most `slice` bytes (a slice is a
// fresh Buffer: the compressor still holds the last one), and checked as in readNoFollow but after EACH slice, so a file that grows or moves is refused
// early. The listing already fixed the entry, so a file that vanished, became a symlink or stopped being a regular file is ECHANGED here, not skipped (D30).
async function* sliceFile(abs, name, st, slice, after) {
  const changed = () => new ZipError(`«${name}» changed while it was being read; run it again when nothing is writing to it`, "ECHANGED");
  let fh; try { fh = await fsOpen(abs, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)); } catch (e) { if (e.code === "ELOOP" || e.code === "ENOENT") throw changed(); throw e; }
  try {
    const a = await fh.stat(); if (!a.isFile() || !sameFile(a, st)) throw changed();
    let done = 0;
    for (;;) {
      const buf = Buffer.allocUnsafe(Math.min(slice, a.size - done + 1)), { bytesRead } = await fh.read(buf, 0, buf.length, null); // one byte more than the size: growth shows
      if (bytesRead === 0) break;
      done += bytesRead; after?.(abs);
      if (done > a.size || !sameFile(a, await fh.stat())) throw changed();
      yield bytesRead === buf.length ? buf : buf.subarray(0, bytesRead);
    }
    if (done !== a.size || !sameFile(a, await fh.stat())) throw changed();
  } finally { await fh.close(); }
}
const isSink = (v) => v !== null && typeof v === "object" && typeof v.write === "function" && typeof v.end === "function";
// createZip(outPath | Writable, root, { stream, ... }): see the tests of C3.7b (D30). A Writable is always streamed and is destroyed on any failure.
export const createZip = async (outPath, root, opts = {}) => {
  try { return await buildZip(outPath, root, opts); } catch (e) { if (isSink(outPath)) outPath.destroy?.(); throw e; }
};
const buildZip = async (outPath, root, { exclude, symlinks = "skip", stream, _afterRead, _slice = 1 << 20, ...writeOpts } = {}) => {
  const sink = isSink(outPath) ? outPath : null;
  if (!sink && typeof outPath !== "string") throw new ZipError("out must be the path of the zip or a Writable stream", "EARG");
  if (stream !== undefined && typeof stream !== "boolean") throw new ZipError("stream must be true or false", "EARG");
  if (sink && stream === false) throw new ZipError("a Writable output is always streamed: stream cannot be false", "EARG");
  const streaming = sink !== null || stream === true;
  if (typeof root !== "string" || !root) throw new ZipError("root must be the path of a folder", "EARG");
  if (exclude !== undefined && typeof exclude !== "function") throw new ZipError("exclude must be a function", "EARG");
  if (symlinks !== "skip" && symlinks !== "error") throw new ZipError('symlinks must be "skip" or "error"', "EARG");
  let top; try { top = realpathSync(root); if (!statSync(top).isDirectory()) throw new Error("not a folder"); } catch (e) { throw new ZipError(`«${root}» is not a readable folder`, "EARG", { cause: e }); }
  const where = sink ? sink.path : outPath; // a Writable that is not a file stream has no path to check
  if (typeof where === "string") {
    const out = join(realish(dirname(resolve(where))), basename(where)), inside = top.endsWith(sep) ? top : top + sep;
    if (out === top || out.startsWith(inside)) throw new ZipError(`the output «${where}» is inside the folder being read`, "ERECURSE");
  }
  const sources = [], skipped = [], fail = (where, e) => e instanceof ZipError ? e : new ZipError(`${where}: ${e.message}`, e.code ?? "EZIP", { cause: e });
  const walk = (dirAbs, rel) => {
    let raw; try { raw = readdirSync(dirAbs, { encoding: "buffer" }); } catch (e) { throw fail(dirAbs, e); }
    raw.sort(Buffer.compare);
    for (const b of raw) {
      const nm = b.toString("utf8"), name = rel + nm, abs = join(dirAbs, nm);
      if (!Buffer.from(nm, "utf8").equals(b)) throw new ZipError(`unsafe name «${name}»: not valid UTF-8`, "EUNSAFE");
      let st; try { st = lstatSync(abs); } catch (e) { throw fail(abs, e); }
      const isDir = st.isDirectory();
      if (exclude && exclude(name, { isDir })) continue;
      const why = unsafeNameReason(name); if (why) throw new ZipError(`unsafe name «${name}»: ${why}`, "EUNSAFE");
      const skip = (reason) => { if (reason === "symlink" && symlinks === "error") throw new ZipError(`«${name}» is a symlink`, "ESYMLINK"); skipped.push({ name, reason }); };
      if (st.isSymbolicLink()) { skip("symlink"); continue; }
      const meta = { mtime: st.mtime, mode: st.mode & 0o777 };
      if (isDir) { sources.push({ name: `${name}/`, ...meta }); walk(abs, `${name}/`); continue; }
      if (!st.isFile()) { skip("special"); continue; }
      if (streaming) { sources.push({ name, stream: () => sliceFile(abs, name, st, _slice, _afterRead), ...meta }); continue; }
      let r; try { r = readNoFollow(abs, name, st, _afterRead); } catch (e) { throw fail(abs, e); }
      if (r.skip) skip(r.skip); else sources.push({ name, data: r.data, ...meta });
    }
  };
  walk(top, "");
  if (!streaming) return { ...(await writeZip(outPath, sources, writeOpts)), skipped };
  if (sink) return { ...(await writeZipStream(sink, sources, writeOpts)), skipped };
  const final = resolve(outPath), tmp = `${final}.partial`; // a path: <out>.partial, fsync, atomic rename; the old output stays until the end
  try {
    const r = await writeZipStream(createWriteStream(tmp, { fd: openPartial(tmp) }), sources, writeOpts); // the stream owns its descriptor (a FileHandle stream with autoClose: false hangs fh.close() on Node 22); opened here so a bad folder is ENOENT as in writeZip
    const fh = await fsOpen(tmp, "r+"); try { await fh.sync(); } finally { await fh.close(); } // fsync works on the file, so a second descriptor does; it must be able to write ("r" gives EPERM on Windows, round 143)
    renameSync(tmp, final); syncDir(final);
    return { ...r, skipped };
  } catch (err) {
    dropPartial(tmp);
    throw err instanceof ZipError ? err : new ZipError(`${final}: ${err.message}`, err.code ?? "EZIP", { cause: err });
  }
};

// ---------- command line (C4.2a, D34) ----------
// Exit codes: 0 ok · 1 the command ran and failed (any ZipError, or a system error such as ENOENT on the zip) · 2 usage · 3 internal error (anything that is not a ZipError).
// `--json` (every command but cat): exactly one line of JSON on stdout, { ok: true, command, ... } or { ok: false, error: { code, message } }, stderr empty.
// Without it, failures go to stderr as «✗ message» and stdout stays empty. `cat` writes the raw bytes only, so it has no `--json` (a usage error).
// Warnings never change the exit code. `runCli` never ends the process. C4.2b added `create` and `--json` on extract and mark.
const USAGE = "usage: zipkit.mjs ls|test|mark <zip> [--json] · cat <zip> <name> · extract <zip> <folder> [--overwrite] [--max-bytes N] [--json] · create <out.zip> <folder> [--exclude GLOB]... [--stream] [--deterministic] [--overwrite] [--json] · --help";
const CMDS = { ls: { pos: 1, json: true }, test: { pos: 1, json: true }, cat: { pos: 2 }, mark: { pos: 1, json: true }, extract: { pos: 2, json: true, bool: ["--overwrite"], val: ["--max-bytes"] }, create: { pos: 2, json: true, bool: ["--stream", "--deterministic", "--overwrite"], multi: ["--exclude"] } };
// --exclude GLOB: without «/» it matches a file or folder NAME at any depth; with «/» the whole path from the folder. «*» and «?» never cross «/»; everything else is literal.
const globRe = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")}$`);
const excluder = (globs) => { const res = globs.map((g) => ({ re: globRe(g), whole: g.includes("/") })); return (rel) => res.some(({ re, whole }) => (whole ? re.test(rel) : re.test(rel.slice(rel.lastIndexOf("/") + 1)))); };
class UsageError extends Error {}
// Names from a zip are hostile: in text output control, escape, C1 and bidi characters are shown as \xNN / \uNNNN, so a name can never move the cursor, retitle the window or fake a line (AUDIT-3 A-3). JSON keeps the real names.
const esc = (t) => t.replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, (c) => { const h = c.charCodeAt(0).toString(16); return c.charCodeAt(0) < 256 ? `\\x${h.padStart(2, "0")}` : `\\u${h.padStart(4, "0")}`; });
const optEnd = (argv) => { const i = argv.indexOf("--"); return i < 0 ? argv.length : i; }; // «--» ends the options: what follows is a zip or a name, even if it starts with «--» (A-2)
const parseCli = (argv) => {
  const dd = optEnd(argv), cmd = argv.slice(0, dd).find((a) => !a.startsWith("--")), spec = CMDS[Object.hasOwn(CMDS, cmd) ? cmd : ""];
  if (!spec) throw new UsageError(cmd ? `unknown command «${cmd}»` : "no command");
  const pos = [], flags = {}; let skipped = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (i === dd) continue;
    if (i > dd) pos.push(a);
    else if (!a.startsWith("--")) { if (!skipped && a === cmd) skipped = true; else pos.push(a); }
    else if (a === "--json") { if (!spec.json) throw new UsageError(`«${cmd}» has no --json`); flags.json = true; }
    else if (spec.multi?.includes(a)) { if (i + 1 >= argv.length) throw new UsageError(`${a} needs a value`); (flags[a] ??= []).push(argv[++i]); }
    else if (spec.bool?.includes(a)) flags[a] = true;
    else if (spec.val?.includes(a)) { if (i + 1 >= argv.length) throw new UsageError(`${a} needs a value`); flags[a] = argv[++i]; }
    else throw new UsageError(`unknown option «${a}»`);
  }
  if (pos.length !== spec.pos) throw new UsageError(`«${cmd}» takes ${spec.pos} argument(s), got ${pos.length}`);
  return { cmd, pos, flags };
};
export const runCli = async (argv, { out = process.stdout, err = process.stderr } = {}) => {
  const json = argv.slice(0, optEnd(argv)).includes("--json"), say = (o) => out.write(`${JSON.stringify(o)}\n`);
  const fail = (code, e, exit) => { // json: one line on stdout; text: «✗» (or the usage line) on stderr
    if (json) { try { say({ ok: false, error: { code, message: e.message } }); return exit; } catch { /* stdout is the broken part: fall through to stderr */ } }
    err.write(exit === 2 ? `${esc(e.message)}\n${USAGE}\n` : `✗ ${exit === 3 ? (e.stack ?? e.message).split("\n").map(esc).join("\n") : esc(e.message)}\n`); return exit;
  };
  try {
    if (argv.slice(0, optEnd(argv)).includes("--help") || argv[0] === "-h") { if (json) say({ ok: true, command: "help", usage: USAGE }); else out.write(`${USAGE}\n`); return 0; } // `-h` only as the first argument: elsewhere it can be a name (C4.4)
    const { cmd, pos: [zip, arg], flags } = parseCli(argv);
    if (cmd === "ls") {
      const { entries } = listZip(zip);
      if (json) say({ ok: true, command: "ls", entries: entries.map((e) => ({ name: e.name, size: e.usize, csize: e.csize, method: e.method, crc32: e.crc.toString(16).padStart(8, "0"), isDir: e.isDir, isSymlink: e.isSymlink, nameSource: e.nameSource, flagMissing: e.flagMissing, mtime: e.mtime && !Number.isNaN(+e.mtime) ? e.mtime.toISOString() : null })) });
      else for (const e of entries) out.write(`${String(e.usize).padStart(10)}  ${esc(e.name)}${e.nameSource === "ascii" ? "" : `   [name: ${e.nameSource}${e.flagMissing ? ", NO UTF-8 flag" : ""}]`}\n`);
    } else if (cmd === "test") {
      const { entries } = listZip(zip), bad = entries.filter((e) => unsafeNameReason(e.name.replace(/\/+$/, "") || "/")), noFlag = entries.filter((e) => e.flagMissing), r = await testZip(zip);
      if (json) say({ ok: true, command: "test", files: r.files, bytes: r.bytes, warnings: { unsafeNames: bad.map((e) => e.name), missingUtf8Flag: noFlag.map((e) => e.name) } });
      else {
        out.write(`✓ ${r.files} file(s), ${r.bytes} bytes: CRC and sizes match.\n`);
        if (bad.length) out.write(`! ${bad.length} unsafe name(s) (extraction refuses them): ${esc(bad.slice(0, 5).map((e) => e.name).join(", "))}\n`);
        if (noFlag.length) out.write(`! ${noFlag.length} non-ASCII name(s) without the UTF-8 flag: ${esc(noFlag.slice(0, 5).map((e) => e.name).join(", "))} (zipkit.mjs mark fixes it)\n`);
      }
    } else if (cmd === "cat") out.write(readZipFile(zip, arg));
    else if (cmd === "mark") { const r = markUtf8Names(zip); if (json) say({ ok: true, command: "mark", patched: r.patched, total: r.total }); else out.write(`✓ ${esc(zip)}: ${r.patched} of ${r.total} entry(ies) marked with the UTF-8 flag\n`); }
    else if (cmd === "create") {
      if (!flags["--overwrite"] && (() => { try { lstatSync(resolve(zip)); return true; } catch { return false; } })()) throw new ZipError(`${zip} already exists (use --overwrite to replace it)`, "EEXIST"); // D35: same rule as extract; lstat, so a dangling link counts
      const r = await createZip(zip, arg, { ...(flags["--exclude"] ? { exclude: excluder(flags["--exclude"]) } : {}), ...(flags["--stream"] ? { stream: true } : {}), ...(flags["--deterministic"] ? { deterministic: true } : {}) });
      if (json) say({ ok: true, command: "create", entries: r.entries.length, bytes: r.bytes, skipped: r.skipped, collisions: r.collisions });
      else {
        out.write(`✓ ${r.entries.length} entry(ies), ${r.bytes} bytes → ${esc(zip)}\n`);
        for (const k of r.skipped) out.write(`! skipped: ${esc(k.name)} (${k.reason})\n`);
        for (const c of r.collisions) out.write(`! equivalent names (NFC/case) in the folder: ${esc(c.join(" ≈ "))}\n`);
      }
    } else {
      const mb = flags["--max-bytes"]; if (mb !== undefined && !/^\d{1,15}$/.test(mb)) throw new UsageError("--max-bytes needs a whole number of bytes (digits only)");
      const r = await extractZip(zip, arg, { overwrite: !!flags["--overwrite"], ...(mb !== undefined ? { maxTotalBytes: Number(mb) } : {}) });
      if (json) say({ ok: true, command: "extract", files: r.files, dirs: r.dirs, bytes: r.bytes, skipped: r.skipped, collisions: r.collisions });
      else {
        out.write(`✓ ${r.files} file(s), ${r.dirs} folder(s) created, ${r.bytes} bytes → ${esc(arg)}\n`);
        for (const k of r.skipped) out.write(`! skipped: ${esc(k.name)} (${k.reason})\n`);
        for (const c of r.collisions) out.write(`! equivalent names (NFC/case) in the zip: ${esc(c.join(" ≈ "))}\n`);
      }
    }
    return 0;
  } catch (e) {
    return e instanceof UsageError ? fail("EUSAGE", e, 2) : e instanceof ZipError || (typeof e?.syscall === "string" && typeof e.code === "string") ? fail(e.code, e, 1) : fail("EINTERNAL", e, 3); // a system error (ENOENT, EACCES, EISDIR…) is the caller's file, not a bug
  }
};
const isMain = () => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } }; // realpath: an installed bin is a symlink in node_modules/.bin (round 74)
if (isMain()) {
  for (const s of [process.stdout, process.stderr]) s.on("error", (e) => { if (e.code === "EPIPE") process.exit(1); throw e; }); // the reader closed the pipe (`ls | head`): stop quietly, not with a stack trace (A-1)
  process.exitCode = await runCli(process.argv.slice(2));
}
