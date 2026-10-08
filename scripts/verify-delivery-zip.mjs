#!/usr/bin/env node
// Verifica o ARTEFACTO entregue (o .zip), não a árvore de trabalho.
// Garante que o zip pode ser colado por cima da raiz do projeto, mesmo com
// "Substituir" de pastas, sem apagar nada: contém a árvore INTEIRA.
//
//   node scripts/verify-delivery-zip.mjs <ficheiro.zip> [--against <zip-anterior.zip> ...]
//
// Falha (exit 1) se:
//   1. o zip tiver pasta a envolver (package.json tem de estar na raiz do zip);
//   2. faltar algum ficheiro listado em FILES.manifest (do próprio zip);
//   3. o FILES.manifest do zip não coincidir com a lista real de ficheiros;
//   4. contiver lixo (node_modules, .next, .git, __MACOSX, .DS_Store, tsbuildinfo);
//   5. faltar CLAUDE.md ou o CAIRN_PROJECT_STATUS-N.md, ou o N do ficheiro
//      de estado não coincidir com seq= no fingerprint do CHANGELOG.md;
//   5b. o zip contiver ficheiros que NUNCA podem sair do projeto: o corpus privado
//      (corpus/real-world, corpus/huge, salvo .gitkeep), .env com segredos, artefactos de Python;
//   6. com --against: algum ficheiro do zip anterior não estiver neste zip
//      (as remoções deliberadas têm de ser aprovadas com --allow-removed <caminho>).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const zip = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--against" && args[args.indexOf(a) - 1] !== "--allow-removed");
const against = args.flatMap((a, i) => (args[i - 1] === "--against" ? [a] : []));
const allowRemoved = new Set(args.flatMap((a, i) => (args[i - 1] === "--allow-removed" ? [a.normalize("NFC")] : [])));
if (!zip) { console.error("uso: verify-delivery-zip.mjs <zip> [--against <zip>] [--allow-removed <caminho>]"); process.exit(2); }

const JUNK = /(^|\/)(node_modules|\.next|\.git|__MACOSX)\/|(^|\/)\.DS_Store$|tsconfig\.tsbuildinfo$/;
// Os nomes lêem-se da central directory do zip, em Node, e NÃO do `unzip -Z1`: o `unzip` do macOS escreve cada byte
// não-ASCII como `?`, o que fazia um nome como "relatório – ação 日本語.pdf" parecer perdido (round 1p).
// Nomes: extra field Unicode Path (0x7075, com CRC) > flag UTF-8 (bit 11) > UTF-8 válido > latin1.
// Todos os nomes são comparados em NFC (o macOS grava NFD); os que se imprimem são os nomes verdadeiros.
const CRC_T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC_T[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const decodeName = (raw, flags, extra) => {
  for (let i = 0; i + 4 <= extra.length; ) {
    const id = extra.readUInt16LE(i), len = extra.readUInt16LE(i + 2), d = extra.subarray(i + 4, i + 4 + len);
    if (id === 0x7075 && d.length > 5 && d[0] === 1 && d.readUInt32LE(1) === crc32(raw)) return d.subarray(5).toString("utf8");
    i += 4 + len;
  }
  if (flags & 0x800) return raw.toString("utf8");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(raw); } catch { return raw.toString("latin1"); }
};
const zipEntries = (z) => {
  const buf = readFileSync(resolve(z));
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error(`${z}: não é um zip (sem end-of-central-directory)`);
  const total = buf.readUInt16LE(e + 10), size = buf.readUInt32LE(e + 12);
  let pos = buf.readUInt32LE(e + 16);
  if (total === 0xffff || pos === 0xffffffff || size === 0xffffffff) throw new Error(`${z}: zip64 não é suportado por este verificador`);
  const names = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error(`${z}: central directory corrompida na entrada ${n}`);
    const flags = buf.readUInt16LE(pos + 8), nl = buf.readUInt16LE(pos + 28), xl = buf.readUInt16LE(pos + 30), cl = buf.readUInt16LE(pos + 32);
    const raw = buf.subarray(pos + 46, pos + 46 + nl), extra = buf.subarray(pos + 46 + nl, pos + 46 + nl + xl);
    names.push(decodeName(raw, flags, extra).normalize("NFC"));
    pos += 46 + nl + xl + cl;
  }
  return names;
};
const rawList = (z) => zipEntries(z).filter((l) => l && !l.endsWith("/"));
// Used for the --against uploads only: a partial zip that arrived wrapped in a single
// folder (e.g. "m3-inicio/...") is compared by its inner paths. The delivery zip itself is
// never unwrapped: a wrapper there is an error (rule 1 above).
const listUnwrapped = (z) => {
  const fs = rawList(z).filter((f) => !f.startsWith("__MACOSX/"));
  const top = new Set(fs.map((f) => f.split("/")[0]));
  const everyNested = fs.length > 0 && fs.every((f) => f.includes("/"));
  return everyNested && top.size === 1 ? fs.map((f) => f.slice(f.indexOf("/") + 1)) : fs;
};
const list = rawList;
const read = (z, f) => execFileSync("unzip", ["-p", resolve(z), f], { encoding: "utf8", maxBuffer: 1 << 28 });

// W2 — never-ship rules. Mirrors check-manifest.mjs (which keeps these files out of FILES.manifest, from which
// the delivery zip is built); this is the independent check on the finished artifact.
const privateReason = (f, has) => {
  if (/(^|\/)\.venv\//.test(f) || /(^|\/)__pycache__\//.test(f) || /\.pyc$/.test(f)) return "artefacto de Python";
  if (/(^|\/)\.env(\.[^/]*)?$/.test(f) && !/\.(example|sample)$/.test(f)) return "ficheiro .env (segredos)";
  const m = f.match(/^(corpus\/(?:real-world|huge))\/(.+)$/);
  if (m && !/(^|\/)\.gitkeep$/.test(m[2])) return `corpus privado (${m[1]})`;
  return null;
};

const files = list(zip);
const set = new Set(files);
const problems = [];

if (!set.has("package.json")) problems.push("package.json não está na RAIZ do zip (pasta a envolver? o zip tem de colar diretamente na raiz do projeto).");
const junk = files.filter((f) => JUNK.test(f));
const priv = files.map((f) => [f, privateReason(f, (x) => set.has(x))]).filter(([, r]) => r);
if (priv.length) problems.push(`ficheiros que NUNCA podem sair do projeto (${priv.length}): ${priv.slice(0, 8).map(([f, r]) => `${f} [${r}]`).join(", ")}${priv.length > 8 ? " …" : ""}`);
if (junk.length) problems.push(`lixo dentro do zip (${junk.length}): ${junk.slice(0, 5).join(", ")}${junk.length > 5 ? " …" : ""}`);

if (!set.has("FILES.manifest")) problems.push("falta FILES.manifest no zip.");
else {
  const listed = read(zip, "FILES.manifest").split("\n").filter(Boolean).map((f) => f.normalize("NFC"));
  const missing = listed.filter((f) => !set.has(f));
  if (missing.length) problems.push(`${missing.length} ficheiro(s) do FILES.manifest NÃO estão no zip: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? " …" : ""}`);
  const listedSet = new Set(listed);
  const extra = files.filter((f) => f !== "FILES.manifest" && !listedSet.has(f));
  if (extra.length) problems.push(`${extra.length} ficheiro(s) no zip fora do FILES.manifest (regenerar o manifesto antes de zipar): ${extra.slice(0, 15).join(", ")}`);
}

for (const must of ["CLAUDE.md", "CHANGELOG.md"]) if (!set.has(must)) problems.push(`falta ${must} no zip.`);
const status = files.filter((f) => /^CAIRN_PROJECT_STATUS-\d+\.md$/.test(f));
if (status.length !== 1) problems.push(`tem de haver exatamente 1 CAIRN_PROJECT_STATUS-N.md na raiz (há ${status.length}).`);
else if (set.has("CHANGELOG.md")) {
  const n = status[0].match(/-(\d+)\.md$/)[1];
  const m = read(zip, "CHANGELOG.md").split("\n", 1)[0].match(/seq=(\d+)/);
  if (!m || m[1] !== n) problems.push(`o ficheiro de estado é -${n} mas o fingerprint do CHANGELOG diz seq=${m ? m[1] : "?"}.`);
}

for (const prev of against) {
  const prevFiles = listUnwrapped(prev), prevSet = new Set(prevFiles);
  const lost = prevFiles.filter((f) => !JUNK.test(f) && !privateReason(f, (x) => prevSet.has(x)) && !set.has(f) && !allowRemoved.has(f));
  const real = lost.filter((f) => !/^CAIRN_PROJECT_STATUS-\d+\.md$/.test(f));
  if (real.length) problems.push(`${real.length} ficheiro(s) que existiam em ${prev.split("/").pop()} e já NÃO estão neste zip: ${real.slice(0, 15).join(", ")}${real.length > 15 ? " …" : ""}`);
  else console.log(`✓ nada perdido face a ${prev.split("/").pop()}`);
}

if (problems.length) {
  console.error(`\n✗ ZIP NÃO ESTÁ PRONTO (${problems.length} problema(s)):\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`✓ zip pronto a colar por cima: ${files.length} ficheiros, raiz correta, manifesto completo, sem lixo.`);
