#!/usr/bin/env node
// RECOVERY MODE — first step of the session that receives an emergency dump.
//
//   node scripts/recovery-report.mjs <chicla-EMERGENCY-….zip> [--baseline <last-delivery-zip.zip>] [--out <dir>]
//
// It does, in this order, without changing anything in the original dump:
//   1. extracts the dump to <out> (default /home/claude/recovered; if it exists, appends -2, -3 …);
//   2. confirms it is a dump (RECOVERY_MARKER.json) and that it was not corrupted on the way (sha256 of each file);
//   3. compares the project root with --baseline (the last good delivery zip); without it, with the FILES.baseline.json
//      the last delivery carried inside the dump (C9.6: no zip needed; refused if it was cut or edited); without
//      either, with FILES.manifest (names only: does not detect MODIFIED files);
//   4. cheap checks on the touched files: valid JSON, `node --check` on .mjs/.js, .py syntax (ast),
//      empty file, unbalanced braces/parentheses in .rs/.ts/.js/.css (warning of a possibly TRUNCATED file);
//   5. runs check-manifest and check-build INSIDE the recovered root (read only);
//   6. writes <out>/RECOVERY_DIFF.md (outside the project root, so as not to pollute it) and prints the summary.
// It creates NO delivery. After this: finish what is missing and deliver with make-delivery-zip.mjs.
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { BASELINE_FILE, parseBaseline } from "./baseline.mjs";

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const zip = argv.find((a, i) => !a.startsWith("--") && !["--baseline", "--out"].includes(argv[i - 1]));
if (!zip) { console.error("usage: recovery-report.mjs <dump.zip> [--baseline <delivery-zip>] [--out <dir>]"); process.exit(2); }
const baselineZip = opt("--baseline");
let out = resolve(opt("--out") ?? "/home/claude/recovered");
for (let n = 2; existsSync(out); n++) out = resolve(opt("--out") ?? "/home/claude/recovered") + `-${n}`;
void fileURLToPath; // (kept for consistency with the other scripts: never use URL.pathname)

const sh = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
const JUNK_DIRS = new Set(["node_modules", ".next", ".git", "__MACOSX", ".venv", "__pycache__"]);
// W3: same exclusions as W2 / the dump — .env secrets (not .example/.sample), *.pyc, private corpus (except .gitkeep)
const isJunk = (n) => n === ".DS_Store" || n.endsWith(".tsbuildinfo") || n.endsWith(".pyc") || (/^\.env(\..*)?$/.test(n) && !/\.(example|sample)$/.test(n));
const isPrivate = (rel) => /(^|\/)corpus\/(real-world|huge)\//.test(rel) && !/(^|\/)\.gitkeep$/.test(rel);

// Round 1s: compare names in NFC (macOS = NFD, Linux = NFC); always print the true name from disk.
const nfc = (p) => p.normalize("NFC");

// Returns { h: {NFC name -> sha256}, names: {NFC name -> true name}, collisions: ["a ≈ b", …], collideKeys: Set }.
function hashTree(root) {
  const res = {}, names = {}, collisions = [], collideKeys = new Set();
  const go = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!JUNK_DIRS.has(e.name)) go(p); continue; }
      if (e.isFile() && !isJunk(e.name) && !isPrivate(relative(root, p))) {
        const real = relative(root, p), k = nfc(real);
        if (k in res) { collisions.push(`${names[k]} ≈ ${real}`); collideKeys.add(k); continue; } // the first one stays; the warning lists both
        res[k] = createHash("sha256").update(readFileSync(p)).digest("hex"); names[k] = real;
      }
    }
  };
  go(root);
  return { h: res, names, collisions, collideKeys };
}

// 1. Extract
mkdirSync(out, { recursive: true });
let r = zip.endsWith(".tar.gz") ? sh("tar", ["-xzf", resolve(zip), "-C", out]) : sh("unzip", ["-q", resolve(zip), "-d", out]);
if (r.status !== 0 && r.status !== 1) { console.error(`✗ could not extract ${zip}:\n${r.stderr}`); process.exit(1); }

// 2. Marker
const markerPath = join(out, "RECOVERY_MARKER.json");
if (!existsSync(markerPath)) { console.error("✗ this is NOT an emergency dump (RECOVERY_MARKER.json is missing). If it is a normal delivery, use the normal flow (item 11)."); process.exit(1); }
const marker = JSON.parse(readFileSync(markerPath, "utf8"));
if (marker.format !== "chicla-recovery-v1") console.warn(`! unknown marker format: ${marker.format}`);
if (marker.projectRootRel === null || marker.projectRootRel === undefined) { console.error("✗ the dump found no project root (package.json + FILES.manifest). See RECOVERY_REPORT.md; the files are in " + join(out, "work")); process.exit(1); }
const root = join(out, "work", marker.projectRootRel);
const lines = [];
const say = (s = "") => { lines.push(s); console.log(s); };

say(`# RECOVERY DIFF — ${new Date().toISOString()}`);
say(`- Dump: ${zip.split("/").pop()} (created ${marker.created})`);
say(`- Note from the previous session: ${marker.note ? `**${marker.note}**` : "(no note)"}`);
say(`- Declared state: last round in the CHANGELOG ${marker.afterRound}, ${marker.statusFile}, APP_VERSION ${marker.appVersion}`);
say(`- Recovered project root: ${root}`);
say(`- Extracted to: ${out}`);

// 2b. Transport integrity
const nowT = hashTree(root);
const now = nowT.h;
// marker keys in NFC (a system that renormalizes names must not give a false "corrupted zip"); collisions stay out of this check
const mh = {}, mNames = {}, mCollide = new Set();
for (const [k, v] of Object.entries(marker.hashes)) { const nk = nfc(k); if (nk in mh) mCollide.add(nk); else { mh[nk] = v; mNames[nk] = k; } }
const skipInt = (k) => mCollide.has(k) || nowT.collideKeys.has(k);
const changedInTransit = Object.keys(mh).filter((p) => !skipInt(p) && now[p] !== mh[p]);
const unhashed = Object.keys(now).filter((p) => !(p in mh));
say(`\n## Zip integrity`);
say(changedInTransit.length ? `✗ ${changedInTransit.length} file(s) differ from what was dumped (zip corrupted or edited): ${changedInTransit.slice(0, 15).map((k) => nowT.names[k] ?? mNames[k]).join(", ")}` : `✓ ${Object.keys(marker.hashes).length} files match the dump's sha256.`);
if (unhashed.length) say(`  (${unhashed.length} file(s) without a hash in the marker — normal if the hash limit was reached)`);

// 3. Comparison
let added = [], modified = [], removed = [];
let against;
let baseCollisions = [];
const isStatus = (p) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(p);
// embedded baseline (C9.6), read from the dump itself; only used when no --baseline zip was given
let embedded = null;
if (!baselineZip && existsSync(join(root, BASELINE_FILE))) {
  try { embedded = parseBaseline(readFileSync(join(root, BASELINE_FILE), "utf8")); }
  catch (e) { console.error(`✗ ${e.code ?? "EBASELINE"}: ${BASELINE_FILE} in the dump is not trustworthy (${e.message}). Pass --baseline <last delivery zip> instead, or delete it to compare with FILES.manifest only.`); process.exit(1); }
}
// compares `now` with a base ({ NFC name -> sha256 }, { NFC name -> true name }); the baseline file itself is never a change
const compare = (bh, bNames) => {
  const nowK = Object.keys(now).filter((p) => p !== nfc(BASELINE_FILE));
  added = nowK.filter((p) => !(p in bh)).map((k) => nowT.names[k]);
  modified = nowK.filter((p) => p in bh && bh[p] !== now[p]).map((k) => nowT.names[k]);
  removed = Object.keys(bh).filter((p) => p !== nfc(BASELINE_FILE) && !(p in now) && !isStatus(p)).map((k) => bNames[k]);
};
if (baselineZip) {
  const tmp = mkdtempSync(join(tmpdir(), "chicla-baseline-"));
  const ub = sh("unzip", ["-q", resolve(baselineZip), "-d", tmp]);
  if (ub.status !== 0 && ub.status !== 1) { console.error(`✗ could not extract the baseline:\n${ub.stderr}`); process.exit(1); }
  let base = tmp;
  const top = readdirSync(tmp).filter((n) => n !== "__MACOSX");
  if (!existsSync(join(tmp, "package.json")) && top.length === 1 && statSync(join(tmp, top[0])).isDirectory()) base = join(tmp, top[0]); // wrapped zip
  const baseT = hashTree(base);
  baseCollisions = baseT.collisions;
  rmSync(tmp, { recursive: true, force: true });
  // the keys are NFC; the lists carry the true name (from the dump for new/modified, from the baseline for the missing ones)
  compare(baseT.h, baseT.names);
  against = `baseline ${baselineZip.split("/").pop()} (${Object.keys(baseT.h).length} files)`;
} else if (embedded) {
  const bh = {}, bNames = {};
  for (const f of embedded.files) { const k = nfc(f.path); if (!(k in bh)) { bh[k] = f.sha256; bNames[k] = f.path; } }
  compare(bh, bNames);
  against = `${BASELINE_FILE} carried by the dump (the last delivery, ${embedded.created}; ${embedded.files.length} files; no zip needed)`;
} else {
  const man = existsSync(join(root, "FILES.manifest")) ? readFileSync(join(root, "FILES.manifest"), "utf8").split("\n").filter(Boolean) : [];
  const ms = new Set(man.map(nfc));
  added = Object.keys(now).filter((p) => !ms.has(p) && p !== "FILES.manifest").map((k) => nowT.names[k]);
  removed = man.filter((p) => !(nfc(p) in now));
  against = "recovered FILES.manifest (no baseline: does not detect MODIFIED files — pass --baseline <last delivery zip>)";
}
const list = (arr) => (arr.length ? arr.slice(0, 120).map((p) => `- ${p}`).join("\n") + (arr.length > 120 ? `\n- … (+${arr.length - 120})` : "") : "- (none)");
say(`\n## Comparison with ${against}`);
say(`### Modified (${modified.length})\n${list(modified)}`);
say(`### New (${added.length})\n${list(added)}`);
say(`### MISSING vs the base (${removed.length}) — review one by one: deleted on purpose or lost?\n${list(removed)}`);
const collisions = [...nowT.collisions.map((c) => `dump: ${c}`), ...baseCollisions.map((c) => `baseline: ${c}`)];
if (collisions.length) say(`\n## ⚠ Names that differ only in NFC/NFD (${collisions.length} collision(s))\nEach pair counts as a single file in the comparisons above (only the first was compared); review by hand.\n${list(collisions)}`);

// 4. Cheap checks on the touched files
say(`\n## Cheap checks on the new/modified files`);
const problems = [];
for (const p of [...modified, ...added]) {
  const full = join(root, p);
  let text; try { text = readFileSync(full, "utf8"); } catch { continue; }
  if (text.length === 0) { problems.push(`${p}: EMPTY file`); continue; }
  if (p.endsWith(".json")) { try { JSON.parse(text); } catch (e) { problems.push(`${p}: invalid JSON (${e.message.slice(0, 60)})`); } }
  if (/\.(mjs|js)$/.test(p) && !p.startsWith("public/")) { const c = sh("node", ["--check", full]); if (c.status !== 0) problems.push(`${p}: node --check failed (${(c.stderr.split("\n").find((l) => /Error/.test(l)) ?? "").slice(0, 80)})`); }
  if (p.endsWith(".py")) { const c = sh("python3", ["-c", "import ast,sys; ast.parse(open(sys.argv[1], encoding='utf-8').read())", full]); if (c.error) { /* no python3: no check */ } else if (c.status !== 0) problems.push(`${p}: invalid Python syntax (${(c.stderr.trim().split("\n").pop() ?? "").slice(0, 80)})`); }
  if (/\.(rs|ts|tsx|mjs|js|css)$/.test(p)) {
    const count = (re) => (text.match(re) ?? []).length;
    const d = [["{", "}", count(/\{/g) - count(/\}/g)], ["(", ")", count(/\(/g) - count(/\)/g)], ["[", "]", count(/\[/g) - count(/\]/g)]].filter((x) => x[2] !== 0);
    if (d.length) problems.push(`${p}: possibly TRUNCATED — ${d.map((x) => `${x[0]}${x[1]} unbalanced (${x[2] > 0 ? "+" : ""}${x[2]})`).join(", ")} (heuristic: may be a false alarm)`);
  }
}
say(problems.length ? problems.map((x) => `- ⚠ ${x}`).join("\n") : "- ✓ nothing suspicious (JSON, node --check, braces).");

// 5. Project guards (read only)
say(`\n## Project guards, run in the recovered root`);
for (const s of ["check-manifest.mjs", "check-build.mjs"]) {
  if (!existsSync(join(root, "scripts", s))) { say(`- ${s}: not in the dump`); continue; }
  const g = sh("node", [join(root, "scripts", s)], root);
  const outp = ((g.stdout ?? "") + (g.stderr ?? "")).trim().split("\n").slice(-12).join("\n");
  say(`- ${s}: ${g.status === 0 ? "✓ passed" : "✗ FAILED (expected if the work was left half-done — the list says what is missing)"}\n\`\`\`\n${outp}\n\`\`\``);
}

writeFileSync(join(out, "RECOVERY_DIFF.md"), lines.join("\n") + "\n");
console.log(`\n✓ full report: ${join(out, "RECOVERY_DIFF.md")}\n✓ recovered project root (work here): ${root}`);
console.log(`\nNEXT: read the note above, finish only what was left half-done, then\n  cd "${root}" && node scripts/make-delivery-zip.mjs <out.zip> --against <last delivery zip>\n(item 17: DELIVER first; do not start new tasks in this session.)`);
