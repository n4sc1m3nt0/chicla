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
//   3b. a v2 manifest (C7.1/C7.2): the crc32 and size of a listed file differ from the zip's CENTRAL DIRECTORY (read, not
//      decompressed): EMANIFEST_SIZE (checked first) / EMANIFEST_CRC32. FILES.baseline.json is exempt (it hashes the manifest, so the manifest cannot hold
//      its crc; its seal and 5c cover it). A v1 manifest has no crc32/size: only paths are compared;
//   4. it contains junk (node_modules, .next, .git, __MACOSX, .DS_Store, tsbuildinfo);
//   5. CLAUDE.md or CHICLA_PROJECT_STATUS-N.md is missing, or the N of the status
//      file does not match seq= in the fingerprint of CHANGELOG.md;
//   5b. the zip contains files that must NEVER leave the project: .env with secrets, Python artefacts (src/pinned/policy.mjs);
//   3c. (C8.2) every entry decodes (stored or deflate, read here, no `unzip`) and matches the central directory's size and crc32: EZIP_DATA; a non-ASCII
//      name without the UTF-8 flag (bit 11) is EUTF8_FLAG, in the delivery only (--against uploads are never held to it);
//   5c. FILES.baseline.json (C9.6) is present, parses, its seal holds, and it matches the zip's own files
//      (same list, size and sha256 of each); codes EBASELINE_MISSING / _PARSE / _FORMAT / _SEAL / _MISMATCH;
//   5d. (C17.2, D140) the shared rules of integrity.mjs, read by this script's own reader: CRLF in an instruction or state file (EINTEGRITY_LF), a toolchain pin that does not match the five files (_PIN),
//      a stale three-way fingerprint (_FINGERPRINT), not exactly one status file (_STATE); a rule whose file is not in the zip is skipped;
//   6. with --against: any file of the previous zip is not in this zip
//      (deliberate removals must be approved with --allow-removed <path>).
//
// C11.1 slice 3a: the work is `verifyDelivery({ zip, against, allowRemoved, root })`, which never prints, exits or throws.
// C11.1 slice 5d (D84, D87): this is the CORE, in the kit package. It imports only `node:` modules, the three PINNED files (src/pinned/baseline.mjs, manifest.mjs and
// policy.mjs, by relative path: they stay where they are until the last slice) and its sibling `integrity.mjs` (C17.2) and has no entry point. `scripts/verify-delivery-zip.mjs` is a thin wrapper
// (flags, print, exit) and `chicla verify-delivery` imports the same code.
// `root` is the project whose chicla.policy.json (C6.1) adds to the never-leaves rules.
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASELINE_FILE, parseBaseline } from "./pinned/baseline.mjs";
import { neverShipReason as neverShip, loadPolicy, policyAllows, detectSecret } from "./pinned/policy.mjs";
import { parseManifest, leaf } from "./pinned/manifest.mjs";
import { STATUS_FILE_RE, checkIntegrity } from "./integrity.mjs";

const JUNK = /(^|\/)(node_modules|\.next|\.git|__MACOSX)\/|(^|\/)\.DS_Store$|\.tsbuildinfo$/;
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
  const names = [], info = new Map(), seenNfc = new Map(), collisions = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error(`${z}: central directory corrupted at entry ${n}`);
    const flags = buf.readUInt16LE(pos + 8), nl = buf.readUInt16LE(pos + 28), xl = buf.readUInt16LE(pos + 30), cl = buf.readUInt16LE(pos + 32);
    const raw = buf.subarray(pos + 46, pos + 46 + nl), extra = buf.subarray(pos + 46 + nl, pos + 46 + nl + xl);
    const trueName = decodeName(raw, flags, extra), key = trueName.normalize("NFC"), prior = seenNfc.get(key); // C7.3: two different names, one NFC key
    if (prior === undefined) seenNfc.set(key, trueName); else if (prior !== trueName) collisions.push(`${prior}  ≈  ${trueName}`);
    names.push(key);
    info.set(names.at(-1), { crc32: buf.readUInt32LE(pos + 16), size: buf.readUInt32LE(pos + 24), csize: buf.readUInt32LE(pos + 20), method: buf.readUInt16LE(pos + 10), lho: buf.readUInt32LE(pos + 42), flags, nonAscii: raw.some((x) => x > 0x7f) }); // as the central directory claims
    pos += 46 + nl + xl + cl;
  }
  names.info = info; names.buf = buf; names.collisions = collisions;
  return names;
};
// C8.2: the bytes of one entry, read by this script (no `unzip`, and NOT chicla-zip: the verifier is the independent check of what the
// writer made). Stored and deflate only; the sizes and the crc32 come from the CENTRAL directory and the result must match them: EZIP_DATA.
// The cache lives in one `verifyDelivery` call (a zip rewritten at the same path between two calls must be read again).
const makeReader = () => {
  const zipCache = new Map();
  const zipOf = (z) => { const k = resolve(z); if (!zipCache.has(k)) { const names = zipEntries(k); zipCache.set(k, { buf: names.buf, info: names.info, bytes: new Map() }); } return zipCache.get(k); };
  return (z, name) => {
    const Z = zipOf(z), e = Z.info.get(name.normalize("NFC")), bad = (m) => Object.assign(new Error(`${name}: ${m}`), { code: "EZIP_DATA" });
    if (!e) throw bad("not in the zip");
    if (Z.bytes.has(e)) return Z.bytes.get(e);
    const { buf } = Z, h = e.lho;
    if (h + 30 > buf.length || buf.readUInt32LE(h) !== 0x04034b50) throw bad("local header not found");
    const start = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28);
    if (start + e.csize > buf.length) throw bad("data runs past the end of the zip");
    const raw = buf.subarray(start, start + e.csize);
    let out;
    if (e.method === 0) out = raw;
    else if (e.method === 8) { try { out = inflateRawSync(raw); } catch { throw bad("deflate data is corrupt"); } }
    else throw bad(`compression method ${e.method} is not supported by this verifier`);
    if (out.length !== e.size) throw bad(`size ${out.length}, central directory says ${e.size}`);
    if (crc32(out) !== e.crc32) throw bad("crc32 differs from the central directory");
    Z.bytes.set(e, out);
    return out;
  };
};
const list = (z) => zipEntries(z).filter((l) => l && !l.endsWith("/"));
// Used for the --against uploads only: a partial zip that arrived wrapped in a single
// folder (e.g. "m3-start/...") is compared by its inner paths. The delivery zip itself is
// never unwrapped: a wrapper there is an error (rule 1 above).
const listUnwrapped = (z) => {
  const fs = list(z).filter((f) => !f.startsWith("__MACOSX/"));
  const top = new Set(fs.map((f) => f.split("/")[0]));
  const everyNested = fs.length > 0 && fs.every((f) => f.includes("/"));
  return everyNested && top.size === 1 ? fs.map((f) => f.slice(f.indexOf("/") + 1)) : fs;
};

// D102: the `git rm` hint. The names come from ANOTHER zip, so every one is quoted for a POSIX shell, `--` comes first, a name with a control character is never printed
// (a newline would fake a second command) and more than 30 names make no command at all. Returns { line, note }: both null when there is nothing to say.
const GIT_RM_MAX = 30, CONTROL = /[\u0000-\u001f\u007f]/;
const shq = (s) => (/^[A-Za-z0-9._\/@%+=:,-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
export function gitRmLine(paths) {
  const all = [...new Set(paths)].sort();
  if (!all.length) return { line: null, note: null };
  const safe = all.filter((p) => !CONTROL.test(p)), hidden = all.length - safe.length;
  if (all.length > GIT_RM_MAX) return { line: null, note: `${all.length} file(s) left the zip: too many for one command, compare the two zips by hand` };
  return {
    line: safe.length ? `git rm -- ${safe.map(shq).join(" ")}` : null,
    note: hidden ? `${hidden} name(s) with a control character not listed: remove them by hand` : null,
  };
}

/**
 * Verifies the delivered ARTEFACT (the .zip) as the rules above say. `zip` = the delivery; `against` = previous zips (any number); `allowRemoved` = paths
 * whose removal is approved; `root` = the project whose chicla.policy.json applies. Returns { ok, code, zip, files, problems, left, messages } (`left` = the files of the `against` zips that are not in this one, sorted, [] when the zip is rejected: D102): `code` is null
 * when ok, else EVERIFY_FAILED (`problems` lists them, each starting with its own code where it has one), EVERIFY_USAGE (no zip), EZIP_UNREADABLE (not a zip,
 * missing, zip64, a broken central directory) or the code of a policy that cannot be used (EPOLICY*); `messages` is [{ stream: "out" | "err", text }] in the
 * order the script prints them (see `renderVerifyDelivery`). Never prints, exits or throws.
 */
export function verifyDelivery({ zip, against = [], allowRemoved = [], root } = {}) {
  const messages = [];
  const say = (stream, text) => messages.push({ stream, text });
  const result = { ok: true, code: null, zip, files: 0, problems: [], left: [], messages };
  if (!zip) { say("err", "usage: verify-delivery-zip.mjs <zip> [--against <zip>] [--allow-removed <path>]"); result.ok = false; result.code = "EVERIFY_USAGE"; return result; }
  // C6.1 d2 (D66): the project's own chicla.policy.json adds to the never-leaves rules; a policy that cannot be used stops the check.
  let POLICY;
  try { POLICY = loadPolicy(resolve(root ?? ".")); } catch (e) { say("err", `\n✗ ${e.code ?? "EPOLICY"}: ${e.message}`); result.ok = false; result.code = e.code ?? "EPOLICY"; return result; }
  const neverShipReason = (rel) => neverShip(rel, POLICY);
  const allowSet = new Set(allowRemoved.map((a) => a.normalize("NFC")));
  const bytesOf = makeReader();
  const read = (z, f) => bytesOf(z, f).toString("utf8");
  try {
    const files = list(zip);
    const set = new Set(files);
    const problems = [];
    // C7.3 (D56): names in the zip that differ only in NFC/NFD (they share one key below, so one could hide the other)
    { const c = zipEntries(zip).collisions; if (c.length) problems.push(`EZIP_COLLISION: ${c.length} pair(s) of names differ only in NFC/NFD: ${c.slice(0, 8).join("; ")}${c.length > 8 ? " …" : ""}`); }

    if (!set.has("package.json")) problems.push("package.json is not at the ROOT of the zip (wrapper folder? the zip must paste directly onto the project root).");
    const junk = files.filter((f) => JUNK.test(f));
    const priv = files.map((f) => [f, neverShipReason(f)]).filter(([, r]) => r);
    if (priv.length) problems.push(`files that must NEVER leave the project (${priv.length}): ${priv.slice(0, 8).map(([f, r]) => `${f} [${r}]`).join(", ")}${priv.length > 8 ? " …" : ""}`);
    if (junk.length) problems.push(`junk inside the zip (${junk.length}): ${junk.slice(0, 5).join(", ")}${junk.length > 5 ? " …" : ""}`);

    // 3c. (C8.2) every entry of the DELIVERY decodes and matches the central directory's size and crc32; non-ASCII names carry the UTF-8 flag (bit 11).
    // --against uploads are only listed, never held to either rule: they come from other tools.
    const dataBad = [], flagBad = [], secretBad = [];
    for (const [name, e] of zipEntries(zip).info) {
      if (name.endsWith("/")) continue;
      try { const kind = policyAllows(name, POLICY) ? null : detectSecret(bytesOf(zip, name)); if (kind) secretBad.push(`${name} [${kind}]`); } catch (x) { dataBad.push(x.message); } // C6.3 b (D73): the content detector, on the delivery only; C6.3 c: an `allow`ed file is released
      if (e.nonAscii && !(e.flags & 0x800)) flagBad.push(name);
    }
    if (dataBad.length) problems.push(`EZIP_DATA: ${dataBad.length} entr${dataBad.length > 1 ? "ies" : "y"} of the zip cannot be read back or differ from the central directory: ${dataBad.slice(0, 5).join("; ")}${dataBad.length > 5 ? " …" : ""}`);
    if (secretBad.length) problems.push(`ESECRET_CONTENT: ${secretBad.length} file(s) hold something that looks like a secret (name and kind only; remove it, or release a false positive with the "allow" key of chicla.policy.json): ${secretBad.slice(0, 8).join(", ")}${secretBad.length > 8 ? " …" : ""}`);
    if (flagBad.length) problems.push(`EUTF8_FLAG: ${flagBad.length} non-ASCII name(s) without the UTF-8 flag (bit 11) in the delivery: ${flagBad.slice(0, 5).join(", ")}${flagBad.length > 5 ? " …" : ""}`);

    if (!set.has("FILES.manifest")) problems.push("FILES.manifest is missing from the zip.");
    else {
      let listed = [], parsed = [];
      try { parsed = parseManifest(read(zip, "FILES.manifest")); listed = parsed.map((e) => e.path.normalize("NFC")); } // v1 or v2 (C7.1)
      catch (e) { problems.push(`${e.code ?? "EMANIFEST"}: FILES.manifest in the zip cannot be read (${e.message})`); }
      const missing = listed.filter((f) => !set.has(f));
      if (missing.length) problems.push(`${missing.length} file(s) of FILES.manifest are NOT in the zip: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? " …" : ""}`);
      // 3b. v2: crc32 and size of each listed file against the zip's central directory (no decompression)
      const cd = zipEntries(zip).info, badSize = [], badCrc = [], hex = (n) => n.toString(16).padStart(8, "0");
      for (const e of parsed) {
        const name = e.path.normalize("NFC"), z = cd.get(name);
        if (e.crc32 === undefined || name === BASELINE_FILE || !z) continue; // v1 entry, the exempt baseline, or already reported as missing
        if (z.size !== e.size) badSize.push(`${name} (zip ${z.size}, manifest ${e.size})`);
        else if (z.crc32 !== e.crc32) badCrc.push(`${name} (zip ${hex(z.crc32)}, manifest ${hex(e.crc32)})`);
      }
      for (const [code, bad] of [["EMANIFEST_SIZE", badSize], ["EMANIFEST_CRC32", badCrc]]) if (bad.length) problems.push(`${code}: ${bad.length} file(s) differ from FILES.manifest (read from the zip's central directory): ${bad.slice(0, 8).join(", ")}${bad.length > 8 ? " …" : ""}`);
      const listedSet = new Set(listed);
      const extra = files.filter((f) => f !== "FILES.manifest" && !listedSet.has(f));
      if (extra.length) problems.push(`${extra.length} file(s) in the zip outside FILES.manifest (regenerate the manifest before zipping): ${extra.slice(0, 15).join(", ")}`);
    }

    // 5c. the baseline the zip carries must describe the zip itself (read apart from the code that wrote it: by this script's own reader, C8.2)
    if (!set.has(BASELINE_FILE)) problems.push(`EBASELINE_MISSING: ${BASELINE_FILE} is not in the zip (a dump of this delivery could not be recovered without the zip).`);
    else {
      let base = null;
      try { base = parseBaseline(read(zip, BASELINE_FILE)); } catch (e) { problems.push(`${e.code ?? "EBASELINE_PARSE"}: ${BASELINE_FILE} is not trustworthy (${e.message}).`); }
      if (base) {
        const want = new Map(base.files.map((f) => [f.path.normalize("NFC"), f]));
        const have = files.filter((f) => f !== BASELINE_FILE);
        const bad = [];
        for (const f of have) {
          const e = want.get(f);
          if (!e) { bad.push(`${f} (not in the baseline)`); continue; }
          let b; try { b = bytesOf(zip, f); } catch { bad.push(`${f} (unreadable)`); continue; }
          if (b.length !== e.size || createHash("sha256").update(b).digest("hex") !== e.sha256) bad.push(`${f} (differs from the baseline)`);
        }
        const haveSet = new Set(have);
        for (const k of want.keys()) if (!haveSet.has(k)) bad.push(`${k} (in the baseline, not in the zip)`);
        if (bad.length) problems.push(`EBASELINE_MISMATCH: ${BASELINE_FILE} does not match the zip in ${bad.length} file(s): ${bad.slice(0, 8).join(", ")}${bad.length > 8 ? " …" : ""}`);
      }
    }

    for (const must of ["CLAUDE.md", "CHANGELOG.md"]) if (!set.has(must)) problems.push(`${must} is missing from the zip.`);
    // C17.2 (D140, D-242b): the state, pin and LF rules are the shared ones (integrity.mjs), read through THIS script's own reader of the zip (C8.2), never through the code that wrote it.
    // A rule whose file is not in the zip is skipped (D-242c); a failing row becomes a problem that starts with EINTEGRITY_<ID>. The --against uploads are never held to them.
    const view = { names: files, read: (f) => { try { return bytesOf(zip, f); } catch { return null; } } }; // an unreadable entry is already EZIP_DATA above
    for (const r of checkIntegrity(view, { sha256: (b) => createHash("sha256").update(b).digest("hex") })) if (!r.ok) problems.push(`EINTEGRITY_${r.id.toUpperCase()}: ${r.label}${r.file ? ` [${r.file}]` : ""}`);
    const status = files.filter((f) => STATUS_FILE_RE.test(f));
    if (status.length === 1 && set.has("CHANGELOG.md")) {
      const n = status[0].match(/-(\d+)\.md$/)[1];
      let first = ""; try { first = read(zip, "CHANGELOG.md").split("\n", 1)[0]; } catch { /* reported as EZIP_DATA above */ }
      const m = first.match(/seq=(\d+)/);
      if (!m || m[1] !== n) problems.push(`the status file is -${n} but the CHANGELOG fingerprint says seq=${m ? m[1] : "?"}.`);
    }

    const leftAll = new Set(); // D102: every file of a previous zip that is not in this one (approved removals and old status files included)
    for (const prev of against) {
      const prevFiles = listUnwrapped(prev), prevSet = new Set(prevFiles);
      for (const f of prevFiles) if (!JUNK.test(f) && !neverShipReason(f) && !set.has(f)) leftAll.add(f);
      const lost = prevFiles.filter((f) => !JUNK.test(f) && !neverShipReason(f) && !set.has(f) && !allowSet.has(f));
      const real = lost.filter((f) => !STATUS_FILE_RE.test(f));
      if (real.length) problems.push(`${real.length} file(s) that existed in ${leaf(prev)} and are NO LONGER in this zip: ${real.slice(0, 15).join(", ")}${real.length > 15 ? " …" : ""}`);
      else say("out", `✓ nothing lost vs ${leaf(prev)}`);
    }
    if (!problems.length && leftAll.size) { // D102: only for a zip that is going to be delivered
      result.left = [...leftAll].sort();
      const { line, note } = gitRmLine(result.left);
      say("out", `! ${result.left.length} file(s) of the previous zip are not in this one; remove them from the repository too:`);
      if (line) say("out", `  ${line}`);
      if (note) say("out", `  (${note})`);
    }


    result.files = files.length; result.problems = problems;
    if (problems.length) {
      say("err", `\n✗ ZIP IS NOT READY (${problems.length} problem(s)):\n`);
      for (const p of problems) say("err", `  - ${p}`);
      result.ok = false; result.code = "EVERIFY_FAILED";
      return result;
    }
    say("out", `✓ zip ready to paste over: ${files.length} files, correct root, complete manifest, no junk.`);
  } catch (e) {
    result.ok = false; result.code = "EZIP_UNREADABLE";
    say("err", `\n✗ EZIP_UNREADABLE: ${e.code ? `${e.code}: ` : ""}${e.message}`);
  }
  return result;
}

/** The text the script prints for a result, per stream (one line per message, as console.log/console.error did). */
export function renderVerifyDelivery(result) {
  const text = (stream) => result.messages.filter((m) => m.stream === stream).map((m) => `${m.text}\n`).join("");
  return { out: text("out"), err: text("err") };
}
