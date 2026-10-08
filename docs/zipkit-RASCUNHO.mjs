#!/usr/bin/env node
// zipkit — ler, verificar, extrair e marcar zips em Node puro (zero dependências, Node 18+). Round 1s.
//
//   node scripts/zipkit.mjs ls <zip>                       lista (nome, tamanho, como o nome foi descodificado)
//   node scripts/zipkit.mjs test <zip>                     descomprime tudo e confere CRC e tamanhos; avisa de nomes inseguros
//   node scripts/zipkit.mjs cat <zip> <nome>               escreve um ficheiro do zip no stdout
//   node scripts/zipkit.mjs extract <zip> <pasta> [--overwrite] [--max-bytes N]
//   node scripts/zipkit.mjs mark <zip>                     liga a flag UTF-8 (bit 11) nos nomes não-ASCII
//
// Porquê existe (ver docs/zip-handling.md): o `unzip` e o `ditto` divergem por sistema e por locale. Um zip com a flag
// UTF-8 extrai em Linux com locale C como `relato#U0301rio…` (e o `-UU` do Info-ZIP não existe no macOS); sem a flag, o
// Python/Java/Windows leem lixo. Um só leitor em Node dá o mesmo resultado em todo o lado, e os testes correm em todo o lado.
//
// Garantias (cada uma tem teste em smoke-test-zipkit.mjs):
//  - Nomes: extra field Unicode Path (0x7075, com CRC) > flag UTF-8 (bit 11) > UTF-8 válido > cp437 (a regra da especificação).
//    `name` é o nome verdadeiro; quem quiser comparar normaliza (NFC) à parte. Nada aqui reescreve nomes.
//  - Extração segura: valida TODAS as entradas antes de escrever uma só; recusa caminhos absolutos, `..`, `\`, NUL, `C:`;
//    nunca cria symlinks nem escreve através de um symlink já existente; cria ficheiros em modo exclusivo (um nome repetido
//    ou uma colisão NFC/NFD num sistema de ficheiros que normaliza falha em vez de sobrescrever em silêncio); não confia
//    nos tamanhos declarados (aborta se o fluxo passar do declarado) e há limites de bytes e de entradas (anti zip-bomb).
//  - Integridade: CRC-32 e tamanho de cada ficheiro conferidos; um ficheiro parcial é apagado se algo falhar.
//  - Suporta: stored e deflate (o que o `zip` produz), zip64, extra fields, modos Unix (sem setuid/setgid), datas.
//    Não suporta, e diz-o com uma mensagem clara: cifra, outros métodos de compressão, zips em várias partes.
//  - Streaming: nada é lido para memória por inteiro (exceto a central directory e, em readZipFile, um ficheiro ≤ maxBytes).
import { chmodSync, closeSync, createReadStream, createWriteStream, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInflateRaw, inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

export class ZipError extends Error { constructor(msg, code = "EZIP") { super(msg); this.name = "ZipError"; this.code = code; } }

// ---------- primitivas ----------
const CP437_HI = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0";
const decodeCp437 = (raw) => { let s = ""; for (const c of raw) s += c < 128 ? String.fromCharCode(c) : CP437_HI[c - 128]; return s; };
const UTF8 = new TextDecoder("utf-8", { fatal: true });
export const isUtf8 = (raw) => { try { UTF8.decode(raw); return true; } catch { return false; } };
const CRC_T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export const crc32 = (buf, prev = 0) => { let c = (prev ^ 0xffffffff) >>> 0; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const u64 = (b, o) => { const v = b.readBigUInt64LE(o); if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError("valor zip64 grande demais para este leitor"); return Number(v); };
const readAt = (fd, pos, len) => {
  const b = Buffer.alloc(len); let got = 0;
  while (got < len) { const n = readSync(fd, b, got, len - got, pos + got); if (n === 0) throw new ZipError("zip truncado (fim do ficheiro antes do esperado)"); got += n; }
  return b;
};
const MAX_CENTRAL = 1 << 30;

// ---------- central directory ----------
const readCentral = (fd, size, label) => {
  const tailLen = Math.min(size, 22 + 65535), tailPos = size - tailLen, tail = readAt(fd, tailPos, tailLen);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) <= tail.length) { e = i; break; }
  if (e < 0) throw new ZipError(`${label}: não é um zip (sem end-of-central-directory)`, "ENOTZIP");
  let total = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
  const disk = tail.readUInt16LE(e + 4), cdDisk = tail.readUInt16LE(e + 6);
  if (total === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
    const loc = tailPos + e - 20;
    if (loc < 0) throw new ZipError(`${label}: zip64 sem localizador`);
    const l = readAt(fd, loc, 20);
    if (l.readUInt32LE(0) !== 0x07064b50) throw new ZipError(`${label}: zip64 sem localizador`);
    const z = readAt(fd, u64(l, 8), 56);
    if (z.readUInt32LE(0) !== 0x06064b50) throw new ZipError(`${label}: registo zip64 inválido`);
    total = u64(z, 32); cdSize = u64(z, 40); cdOff = u64(z, 48);
    if (z.readUInt32LE(16) || z.readUInt32LE(20)) throw new ZipError(`${label}: zips em várias partes não são suportados`);
  } else if ((disk && disk !== 0xffff) || (cdDisk && cdDisk !== 0xffff)) throw new ZipError(`${label}: zips em várias partes não são suportados`);
  if (cdSize > MAX_CENTRAL) throw new ZipError(`${label}: central directory demasiado grande`);
  if (cdOff + cdSize > size) throw new ZipError(`${label}: central directory fora do ficheiro (zip truncado?)`);
  return { cd: readAt(fd, cdOff, cdSize), total };
};
const parseExtra = (extra) => { const f = new Map(); for (let i = 0; i + 4 <= extra.length; ) { const id = extra.readUInt16LE(i), len = extra.readUInt16LE(i + 2); if (i + 4 + len > extra.length) break; if (!f.has(id)) f.set(id, extra.subarray(i + 4, i + 4 + len)); i += 4 + len; } return f; };
const dosDate = (d, t) => { const mo = (d >> 5) & 15, da = d & 31; return mo && da ? new Date(((d >> 9) & 127) + 1980, mo - 1, da, t >> 11, (t >> 5) & 63, (t & 31) * 2) : null; };

const parseEntries = (cd, total, label) => {
  const entries = []; let pos = 0;
  for (let n = 0; n < total; n++) {
    if (pos + 46 > cd.length || cd.readUInt32LE(pos) !== 0x02014b50) throw new ZipError(`${label}: central directory corrompida na entrada ${n}`);
    const hostOs = cd[pos + 5], flags = cd.readUInt16LE(pos + 8), method = cd.readUInt16LE(pos + 10), crc = cd.readUInt32LE(pos + 16);
    let csize = cd.readUInt32LE(pos + 20), usize = cd.readUInt32LE(pos + 24), localOffset = cd.readUInt32LE(pos + 42);
    const nl = cd.readUInt16LE(pos + 28), xl = cd.readUInt16LE(pos + 30), cl = cd.readUInt16LE(pos + 32), extAttr = cd.readUInt32LE(pos + 38);
    if (pos + 46 + nl + xl + cl > cd.length) throw new ZipError(`${label}: central directory corrompida na entrada ${n}`);
    const rawName = cd.subarray(pos + 46, pos + 46 + nl), extra = parseExtra(cd.subarray(pos + 46 + nl, pos + 46 + nl + xl));
    const z64 = extra.get(0x0001);
    if (z64) { let o = 0; if (usize === 0xffffffff) { usize = u64(z64, o); o += 8; } if (csize === 0xffffffff) { csize = u64(z64, o); o += 8; } if (localOffset === 0xffffffff) localOffset = u64(z64, o); }
    const nonAscii = rawName.some((c) => c > 127), utf8Valid = !nonAscii || isUtf8(rawName);
    let name, nameSource = "ascii";
    const up = extra.get(0x7075);
    if (up && up.length > 5 && up[0] === 1 && up.readUInt32LE(1) === crc32(rawName) && isUtf8(up.subarray(5))) { name = up.subarray(5).toString("utf8"); nameSource = "unicode-extra"; }
    else if (!nonAscii) name = rawName.toString("latin1");
    else if (flags & 0x800 && utf8Valid) { name = rawName.toString("utf8"); nameSource = "flag"; }
    else if (utf8Valid) { name = rawName.toString("utf8"); nameSource = "utf8"; }
    else { name = decodeCp437(rawName); nameSource = "cp437"; }
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

// Lista as entradas. Cada uma: { name, rawName, nameSource, flags, method, crc, csize, usize, localOffset, mode, mtime,
//   isDir, isSymlink, isSpecial, encrypted, nonAscii, flagMissing }
export const listZip = (zipPath) => {
  const path = resolve(zipPath), fd = openSync(path, "r");
  try { const size = fstatSync(fd).size, { cd, total } = readCentral(fd, size, path); return { path, size, entries: parseEntries(cd, total, path) }; }
  finally { closeSync(fd); }
};

export const unsafeNameReason = (name) => {
  if (!name) return "nome vazio";
  if (name.includes("\0")) return "contém NUL";
  if (name.includes("\\")) return "contém barra invertida";
  if (name.startsWith("/")) return "caminho absoluto";
  if (/^[A-Za-z]:/.test(name)) return "letra de unidade (Windows)";
  if (name.split("/").some((s) => s === "..")) return "sai da pasta (..)";
  return null;
};
const unsupportedReason = (e) => (e.encrypted ? "está cifrado (não suportado)" : e.method !== 0 && e.method !== 8 ? `método de compressão ${e.method} não suportado (só stored e deflate)` : null);
const dataStart = (fd, size, e, label) => {
  if (e.localOffset + 30 > size) throw new ZipError(`${label}: cabeçalho local de «${e.name}» fora do ficheiro`);
  const h = readAt(fd, e.localOffset, 30);
  if (h.readUInt32LE(0) !== 0x04034b50) throw new ZipError(`${label}: cabeçalho local inválido para «${e.name}»`);
  const start = e.localOffset + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
  if (start + e.csize > size) throw new ZipError(`${label}: os dados de «${e.name}» passam do fim do ficheiro (zip truncado?)`);
  return start;
};
const sameName = (a, b) => a === b || a.normalize("NFC") === b.normalize("NFC");

// Lê UM ficheiro do zip para memória (por nome; NFC e NFD contam como o mesmo nome). Confere CRC e tamanho.
export const readZipFile = (zipPath, name, { maxBytes = 256 * 1024 * 1024 } = {}) => {
  const path = resolve(zipPath), fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size, { cd, total } = readCentral(fd, size, path), entries = parseEntries(cd, total, path);
    const e = entries.find((x) => !x.isDir && x.name === name) ?? entries.find((x) => !x.isDir && sameName(x.name, name));
    if (!e) throw new ZipError(`${path}: «${name}» não está no zip`, "ENOENT");
    const bad = unsupportedReason(e); if (bad) throw new ZipError(`«${e.name}» ${bad}`);
    if (e.usize > maxBytes || e.csize > maxBytes) throw new ZipError(`«${e.name}» tem ${e.usize} bytes, acima do limite de ${maxBytes} para leitura em memória`);
    const comp = e.csize ? readAt(fd, dataStart(fd, size, e, path), e.csize) : Buffer.alloc(0);
    let data;
    if (e.method === 0) data = comp;
    else { try { data = e.usize === 0 && comp.length === 0 ? Buffer.alloc(0) : inflateRawSync(comp, { maxOutputLength: Math.max(1, e.usize) }); } catch (err) { throw new ZipError(`«${e.name}»: dados corrompidos ou maiores que o declarado (${err.code ?? err.message})`); } }
    if (data.length !== e.usize) throw new ZipError(`«${e.name}»: tamanho ${data.length} ≠ ${e.usize} declarado`);
    if (crc32(data) !== e.crc) throw new ZipError(`«${e.name}»: CRC-32 não confere (ficheiro corrompido)`);
    return data;
  } finally { closeSync(fd); }
};

// Transform que conta bytes e CRC e falha se o fluxo não bater certo com o declarado.
const checker = (e) => { let n = 0, crc = 0; return new Transform({
  transform(chunk, _enc, cb) { n += chunk.length; if (n > e.usize) return cb(new ZipError(`«${e.name}»: passa do tamanho declarado (${e.usize}) — zip corrompido ou hostil`)); crc = crc32(chunk, crc); cb(null, chunk); },
  flush(cb) { cb(n !== e.usize ? new ZipError(`«${e.name}»: tamanho ${n} ≠ ${e.usize} declarado`) : crc !== e.crc ? new ZipError(`«${e.name}»: CRC-32 não confere (ficheiro corrompido)`) : null); },
}); };
const streamEntry = (path, size, fd, e, sink) => {
  if (e.csize === 0) { if (e.usize !== 0 || e.crc !== 0) throw new ZipError(`«${e.name}»: sem dados mas declara ${e.usize} bytes`); return pipeline(Transform.from([]), sink); }
  const start = dataStart(fd, size, e, path), src = createReadStream(path, { start, end: start + e.csize - 1 });
  return e.method === 0 ? pipeline(src, checker(e), sink) : pipeline(src, createInflateRaw(), checker(e), sink);
};
const discard = () => new Writable({ write(_c, _e, cb) { cb(); } });

// Descomprime tudo para o vazio, conferindo CRC e tamanhos (o `unzip -t`). Devolve { files, bytes }.
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

// ---------- extração ----------
// extractZip(zip, pasta, { overwrite, maxTotalBytes, maxEntries, filter }) -> { files, dirs, bytes, skipped, collisions }
//  skipped: symlinks e ficheiros especiais (nunca se criam); collisions: grupos de nomes que só diferem em NFC/NFD ou maiúsculas
//  (legítimos em Linux, mas num macOS/Windows um sobrescreveria o outro: o chamador decide o que fazer com o aviso).
export const extractZip = async (zipPath, dest, { overwrite = false, maxTotalBytes = 2 ** 33, maxEntries = 1_000_000, filter } = {}) => {
  const { path, size, entries: all } = listZip(zipPath);
  if (all.length > maxEntries) throw new ZipError(`${path}: ${all.length} entradas, acima do limite de ${maxEntries}`);
  const entries = filter ? all.filter(filter) : all, problems = [], skipped = [], seen = new Set(), groups = new Map();
  let declared = 0;
  for (const e of entries) {
    const unsafe = unsafeNameReason(e.name.replace(/\/+$/, "") || (e.name ? "/" : "")); if (unsafe) { problems.push(`«${e.name}»: ${unsafe}`); continue; }
    if (e.isSymlink || e.isSpecial) { skipped.push({ name: e.name, reason: e.isSymlink ? "symlink (nunca se cria)" : "ficheiro especial" }); continue; }
    if (!e.isDir) { const bad = unsupportedReason(e); if (bad) problems.push(`«${e.name}» ${bad}`); if (seen.has(e.name)) problems.push(`«${e.name}»: nome repetido no zip`); seen.add(e.name); declared += e.usize; }
    const k = e.name.normalize("NFC").toLowerCase(); (groups.get(k) ?? groups.set(k, new Set()).get(k)).add(e.name);
  }
  if (declared > maxTotalBytes) problems.push(`tamanho total declarado ${declared} bytes, acima do limite de ${maxTotalBytes}`);
  if (problems.length) throw new ZipError(`${path}: extração recusada (nada foi escrito):\n  - ${problems.slice(0, 10).join("\n  - ")}${problems.length > 10 ? `\n  … e mais ${problems.length - 10}` : ""}`, "EUNSAFE");
  const collisions = [...groups.values()].filter((s) => s.size > 1).map((s) => [...s]);

  mkdirSync(dest, { recursive: true });
  const root = realpathSync(dest), made = new Set(), late = [], fd = openSync(path, "r");
  let files = 0, dirs = 0, bytes = 0;
  const ensureDir = (segs) => { // desce pasta a pasta, recusando symlinks e ficheiros no caminho
    let cur = root;
    for (const s of segs) {
      cur = join(cur, s);
      let st = null; try { st = lstatSync(cur); } catch { /* não existe */ }
      if (st?.isSymbolicLink()) throw new ZipError(`«${segs.join("/")}»: o caminho atravessa um symlink (${cur})`, "EUNSAFE");
      if (st && !st.isDirectory()) throw new ZipError(`«${segs.join("/")}»: ${cur} existe e não é uma pasta`, "EEXIST");
      if (!st) { mkdirSync(cur); dirs++; }
    }
    return cur;
  };
  try {
    for (const e of entries) {
      if (e.isSymlink || e.isSpecial) continue;
      const segs = e.name.split("/").filter((s) => s && s !== ".");
      if (e.isDir) { const d = ensureDir(segs); late.push([d, e]); continue; }
      if (!segs.length) continue;
      const dir = ensureDir(segs.slice(0, -1)), target = join(dir, segs[segs.length - 1]);
      let st = null; try { st = lstatSync(target); } catch { /* não existe */ }
      if (st) {
        if (made.has(`${st.dev}:${st.ino}`)) throw new ZipError(`«${e.name}»: colide com um ficheiro já extraído deste zip (nomes equivalentes neste sistema de ficheiros)`, "ECOLLISION");
        if (!overwrite) throw new ZipError(`«${e.name}»: já existe em ${dir} (usar overwrite)`, "EEXIST");
        if (st.isDirectory()) throw new ZipError(`«${e.name}»: já existe como pasta`, "EEXIST");
        unlinkSync(target);
      }
      if (e.csize === 0) { if (e.usize !== 0 || e.crc !== 0) throw new ZipError(`«${e.name}»: sem dados mas declara ${e.usize} bytes`); writeFileSync(target, "", { flag: "wx", mode: 0o600 }); }
      else {
        try { await streamEntry(path, size, fd, e, createWriteStream(target, { flags: "wx", mode: 0o600 })); }
        catch (err) { rmSync(target, { force: true }); throw err instanceof ZipError ? err : new ZipError(`«${e.name}»: ${err.message}`); }
      }
      const s2 = statSync(target); made.add(`${s2.dev}:${s2.ino}`);
      chmodSync(target, ((e.mode & 0o777) || 0o644) | 0o600);
      if (e.mtime) utimesSync(target, e.mtime, e.mtime);
      files++; bytes += e.usize;
    }
    for (const [d, e] of late.reverse()) { if (e.mode & 0o777) chmodSync(d, (e.mode & 0o777) | 0o700); if (e.mtime) utimesSync(d, e.mtime, e.mtime); }
  } finally { closeSync(fd); }
  return { files, dirs, bytes, skipped, collisions };
};

// ---------- flag UTF-8 ----------
// O `zip` do Info-ZIP (Linux e macOS) grava nomes UTF-8 SEM o bit 11 e sem Unicode Path (nem `-UN=UTF8` nem um locale
// UTF-8 mudam isso). Isto liga o bit 11 nas entradas cujo nome não-ASCII é UTF-8 válido: 2 bytes por entrada (cabeçalho
// local e central); dados, tamanhos e CRC ficam iguais. Idempotente. Nomes ASCII e nomes que não são UTF-8 não se tocam.
export const markUtf8Names = (zipPath) => {
  const path = resolve(zipPath), fd = openSync(path, "r+");
  try {
    const size = fstatSync(fd).size, { cd, total } = readCentral(fd, size, path), entries = parseEntries(cd, total, path); let patched = 0;
    const setBit = (pos) => { const b = readAt(fd, pos, 2); b.writeUInt16LE(b.readUInt16LE(0) | 0x800, 0); writeSync(fd, b, 0, 2, pos); };
    for (const e of entries) {
      if (!e.flagMissing) continue;
      if (e.localOffset + 30 > size || readAt(fd, e.localOffset, 4).readUInt32LE(0) !== 0x04034b50) throw new ZipError(`${path}: cabeçalho local inválido para «${e.name}»`);
      setBit(e.localOffset + 6); setBit(e.cdPos + 8); patched++;
    }
    return { patched, total: entries.length };
  } finally { closeSync(fd); }
};

// ---------- linha de comandos ----------
const cli = async (argv) => {
  const [cmd, zip, arg] = argv, flag = (n) => argv.includes(n), val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const usage = () => { console.error("uso: zipkit.mjs ls|test|mark <zip> · cat <zip> <nome> · extract <zip> <pasta> [--overwrite] [--max-bytes N]"); process.exit(2); };
  if (!cmd || !zip) usage();
  if (cmd === "ls") { for (const e of listZip(zip).entries) console.log(`${String(e.usize).padStart(10)}  ${e.name}${e.nameSource === "ascii" ? "" : `   [nome: ${e.nameSource}${e.flagMissing ? ", SEM flag UTF-8" : ""}]`}`); }
  else if (cmd === "test") {
    const { entries } = listZip(zip), bad = entries.filter((e) => unsafeNameReason(e.name.replace(/\/+$/, "") || "/")), noFlag = entries.filter((e) => e.flagMissing), r = await testZip(zip);
    console.log(`✓ ${r.files} ficheiro(s), ${r.bytes} bytes: CRC e tamanhos conferem.`);
    if (bad.length) console.log(`! ${bad.length} nome(s) inseguro(s) (a extração recusa-os): ${bad.slice(0, 5).map((e) => e.name).join(", ")}`);
    if (noFlag.length) console.log(`! ${noFlag.length} nome(s) não-ASCII sem a flag UTF-8: ${noFlag.slice(0, 5).map((e) => e.name).join(", ")} (zipkit.mjs mark corrige)`);
  }
  else if (cmd === "cat") { if (!arg) usage(); process.stdout.write(readZipFile(zip, arg)); }
  else if (cmd === "mark") { const r = markUtf8Names(zip); console.log(`✓ ${zip}: ${r.patched} de ${r.total} entrada(s) marcada(s) com a flag UTF-8`); }
  else if (cmd === "extract") {
    if (!arg || arg.startsWith("--")) usage();
    const mb = val("--max-bytes"), r = await extractZip(zip, arg, { overwrite: flag("--overwrite"), ...(mb ? { maxTotalBytes: Number(mb) } : {}) });
    console.log(`✓ ${r.files} ficheiro(s), ${r.dirs} pasta(s) criada(s), ${r.bytes} bytes → ${arg}`);
    for (const s of r.skipped) console.log(`! ignorado: ${s.name} (${s.reason})`);
    for (const c of r.collisions) console.log(`! nomes equivalentes (NFC/maiúsculas) no zip: ${c.join(" ≈ ")}`);
  } else usage();
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli(process.argv.slice(2)).catch((e) => { console.error(`✗ ${e instanceof ZipError ? e.message : e.stack}`); process.exit(1); });
