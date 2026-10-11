#!/usr/bin/env node
// Verifies the delivered ARTEFACT (the .zip), not the working tree.
// Guarantees the zip can be pasted over the project root, even with
// folder "Replace", without deleting anything: it contains the WHOLE tree.
//
//   node scripts/verify-delivery-zip.mjs <file.zip> [--against <previous-zip.zip> ...]
//
// Fails (exit 1) if:
//   1. the zip has a wrapper folder (package.json must be at the root of the zip);
//   2. any file listed in FILES.manifest (of the zip itself) is missing;
//   3. the zip's FILES.manifest does not match the real list of files;
//   4. it contains junk (node_modules, .next, .git, __MACOSX, .DS_Store, tsbuildinfo);
//   5. CLAUDE.md or CHICLA_PROJECT_STATUS-N.md is missing, or the N of the status
//      file does not match seq= in the fingerprint of CHANGELOG.md;
//   5b. the zip contains files that must NEVER leave the project: the private corpus
//      (corpus/real-world, corpus/huge, except .gitkeep), .env with secrets, Python artefacts;
//   5c. FILES.baseline.json (C9.6) is present, parses, its seal holds, and it matches the zip's own files
//      (same list, size and sha256 of each); codes EBASELINE_MISSING / _PARSE / _FORMAT / _SEAL / _MISMATCH;
//   6. with --against: any file of the previous zip is not in this zip
//      (deliberate removals must be approved with --allow-removed <path>).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASELINE_FILE, parseBaseline } from "./baseline.mjs";

const args = process.argv.slice(2);
const zip = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--against" && args[args.indexOf(a) - 1] !== "--allow-removed");
const against = args.flatMap((a, i) => (args[i - 1] === "--against" ? [a] : []));
const allowRemoved = new Set(args.flatMap((a, i) => (args[i - 1] === "--allow-removed" ? [a.normalize("NFC")] : [])));
if (!zip) { console.error("usage: verify-delivery-zip.mjs <zip> [--against <zip>] [--allow-removed <path>]"); process.exit(2); }

const JUNK = /(^|\/)(node_modules|\.next|\.git|__MACOSX)\/|(^|\/)\.DS_Store$|tsconfig\.tsbuildinfo$/;
// Names are read from the zip's central directory, in Node, and NOT from `unzip -Z1`: macOS `unzip` writes every
// non-ASCII byte as `?`, which made a name like "relatório – ação 日本語.pdf" look lost (round 1p).
// Names: Unicode Path extra field (0x7075, with CRC) > UTF-8 flag (bit 11) > valid UTF-8 > latin1.
// All names are compared in NFC (macOS writes NFD); the ones printed are the true names.
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
  if (e < 0) throw new Error(`${z}: not a zip (no end-of-central-directory)`);
  const total = buf.readUInt16LE(e + 10), size = buf.readUInt32LE(e + 12);
  let pos = buf.readUInt32LE(e + 16);
  if (total === 0xffff || pos === 0xffffffff || size === 0xffffffff) throw new Error(`${z}: zip64 is not supported by this verifier`);
  const names = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error(`${z}: central directory corrupted at entry ${n}`);
    const flags = buf.readUInt16LE(pos + 8), nl = buf.readUInt16LE(pos + 28), xl = buf.readUInt16LE(pos + 30), cl = buf.readUInt16LE(pos + 32);
    const raw = buf.subarray(pos + 46, pos + 46 + nl), extra = buf.subarray(pos + 46 + nl, pos + 46 + nl + xl);
    names.push(decodeName(raw, flags, extra).normalize("NFC"));
    pos += 46 + nl + xl + cl;
  }
  return names;
};
const rawList = (z) => zipEntries(z).filter((l) => l && !l.endsWith("/"));
// Used for the --against uploads only: a partial zip that arrived wrapped in a single
// folder (e.g. "m3-start/...") is compared by its inner paths. The delivery zip itself is
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
  if (/(^|\/)\.venv\//.test(f) || /(^|\/)__pycache__\//.test(f) || /\.pyc$/.test(f)) return "Python artefact";
  if (/(^|\/)\.env(\.[^/]*)?$/.test(f) && !/\.(example|sample)$/.test(f)) return ".env file (secrets)";
  const m = f.match(/^(corpus\/(?:real-world|huge))\/(.+)$/);
  if (m && !/(^|\/)\.gitkeep$/.test(m[2])) return `private corpus (${m[1]})`;
  return null;
};

const files = list(zip);
const set = new Set(files);
const problems = [];

if (!set.has("package.json")) problems.push("package.json is not at the ROOT of the zip (wrapper folder? the zip must paste directly onto the project root).");
const junk = files.filter((f) => JUNK.test(f));
const priv = files.map((f) => [f, privateReason(f, (x) => set.has(x))]).filter(([, r]) => r);
if (priv.length) problems.push(`files that must NEVER leave the project (${priv.length}): ${priv.slice(0, 8).map(([f, r]) => `${f} [${r}]`).join(", ")}${priv.length > 8 ? " …" : ""}`);
if (junk.length) problems.push(`junk inside the zip (${junk.length}): ${junk.slice(0, 5).join(", ")}${junk.length > 5 ? " …" : ""}`);

if (!set.has("FILES.manifest")) problems.push("FILES.manifest is missing from the zip.");
else {
  const listed = read(zip, "FILES.manifest").split("\n").filter(Boolean).map((f) => f.normalize("NFC"));
  const missing = listed.filter((f) => !set.has(f));
  if (missing.length) problems.push(`${missing.length} file(s) of FILES.manifest are NOT in the zip: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? " …" : ""}`);
  const listedSet = new Set(listed);
  const extra = files.filter((f) => f !== "FILES.manifest" && !listedSet.has(f));
  if (extra.length) problems.push(`${extra.length} file(s) in the zip outside FILES.manifest (regenerate the manifest before zipping): ${extra.slice(0, 15).join(", ")}`);
}

// 5c. the baseline the zip carries must describe the zip itself (read apart from the code that wrote it: bytes out of `unzip -p`)
if (!set.has(BASELINE_FILE)) problems.push(`EBASELINE_MISSING: ${BASELINE_FILE} is not in the zip (a dump of this delivery could not be recovered without the zip).`);
else {
  let base = null;
  try { base = parseBaseline(read(zip, BASELINE_FILE)); } catch (e) { problems.push(`${e.code ?? "EBASELINE_PARSE"}: ${BASELINE_FILE} is not trustworthy (${e.message}).`); }
  if (base) {
    const bytesOf = (f) => execFileSync("unzip", ["-p", resolve(zip), f.replace(/[\\*?[\]]/g, "\\$&")], { maxBuffer: 1 << 28 });
    const want = new Map(base.files.map((f) => [f.path.normalize("NFC"), f]));
    const have = files.filter((f) => f !== BASELINE_FILE);
    const bad = [];
    for (const f of have) {
      const e = want.get(f);
      if (!e) { bad.push(`${f} (not in the baseline)`); continue; }
      let b; try { b = bytesOf(f); } catch { bad.push(`${f} (unreadable)`); continue; }
      if (b.length !== e.size || createHash("sha256").update(b).digest("hex") !== e.sha256) bad.push(`${f} (differs from the baseline)`);
    }
    const haveSet = new Set(have);
    for (const k of want.keys()) if (!haveSet.has(k)) bad.push(`${k} (in the baseline, not in the zip)`);
    if (bad.length) problems.push(`EBASELINE_MISMATCH: ${BASELINE_FILE} does not match the zip in ${bad.length} file(s): ${bad.slice(0, 8).join(", ")}${bad.length > 8 ? " …" : ""}`);
  }
}

for (const must of ["CLAUDE.md", "CHANGELOG.md"]) if (!set.has(must)) problems.push(`${must} is missing from the zip.`);
const status = files.filter((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f));
if (status.length !== 1) problems.push(`there must be exactly 1 CHICLA_PROJECT_STATUS-N.md in the root (found ${status.length}).`);
else if (set.has("CHANGELOG.md")) {
  const n = status[0].match(/-(\d+)\.md$/)[1];
  const m = read(zip, "CHANGELOG.md").split("\n", 1)[0].match(/seq=(\d+)/);
  if (!m || m[1] !== n) problems.push(`the status file is -${n} but the CHANGELOG fingerprint says seq=${m ? m[1] : "?"}.`);
}

for (const prev of against) {
  const prevFiles = listUnwrapped(prev), prevSet = new Set(prevFiles);
  const lost = prevFiles.filter((f) => !JUNK.test(f) && !privateReason(f, (x) => prevSet.has(x)) && !set.has(f) && !allowRemoved.has(f));
  const real = lost.filter((f) => !/^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f));
  if (real.length) problems.push(`${real.length} file(s) that existed in ${prev.split("/").pop()} and are NO LONGER in this zip: ${real.slice(0, 15).join(", ")}${real.length > 15 ? " …" : ""}`);
  else console.log(`✓ nothing lost vs ${prev.split("/").pop()}`);
}

if (problems.length) {
  console.error(`\n✗ ZIP IS NOT READY (${problems.length} problem(s)):\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`✓ zip ready to paste over: ${files.length} files, correct root, complete manifest, no junk.`);
