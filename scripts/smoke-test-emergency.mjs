#!/usr/bin/env node
// W3 smoke test: simulated session -> /dump -> recovery. Section 7 (round 1s, T1 to T4) covers NFC/NFD names. Runs on a COPY in tmpdir (never touches the real tree).
//   node scripts/smoke-test-emergency.mjs
// Plants files that must NEVER enter the dump, makes known changes against a base zip, and checks
// (inspecting the zip separately, with unzip -l and a search for the secret marker in the bytes) that the dump is clean
// and that the recovery reports modified, new and missing files. Exits 1 if anything fails.
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const T = mkdtempSync(join(tmpdir(), "chicla-w3-"));
const work = join(T, "work"), proj = join(work, "chicla"), outdir = join(T, "out");
const SECRET = ["PRIVATE", "MARKER", "9f3a"].join("-"); // assembled at runtime: the literal must not exist in this file, which is part of the dumped copy
let failed = 0;
const check = (ok, what, detail) => { console.log(`${ok ? "✓" : "✗"} ${what}${!ok && detail ? `\n    got: ${detail}` : ""}`); if (!ok) failed++; };
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
const put = (rel, text = "x\n") => { const p = join(proj, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };

// 1. copy of the project (only manifest files that exist) + a scratch file outside the project root
for (const rel of readFileSync(join(ROOT, "FILES.manifest"), "utf8").split("\n").filter(Boolean)) {
  if (!existsSync(join(ROOT, rel))) continue;
  mkdirSync(dirname(join(proj, rel)), { recursive: true }); copyFileSync(join(ROOT, rel), join(proj, rel));
}
copyFileSync(join(ROOT, "FILES.manifest"), join(proj, "FILES.manifest")); // the manifest does not list itself
put("../scratch-note.txt", "scratch outside the project\n");
// 2. base zip = the "last delivery" state
const baseline = join(T, "baseline.zip");
const names = readFileSync(join(proj, "FILES.manifest"), "utf8").split("\n").filter(Boolean).filter((n) => existsSync(join(proj, n)));
const z = spawnSync("zip", ["-q", baseline, "-@"], { cwd: proj, input: names.join("\n") + "\n" });
check(z.status === 0 && existsSync(baseline), "base zip created");

// 3. "session" changes: modified, new, truncated, missing
appendFileSync(join(proj, "ROADMAP.md"), "\nnew line from the session\n");
put("packages/chicla-kit/src/new_mod.mjs", "export const ok = true;\n");
put("packages/chicla-kit/src/broken.mjs", "export function cortado() {\n    if (true) {\n");
rmSync(join(proj, "packages/chicla-zip/package.json"));
// 4. things that must NEVER enter the dump
put("corpus/real-world/extrato.pdf", SECRET); put("corpus/huge/big.pdf", SECRET);
put(".env", `TOKEN=${SECRET}\n`); put(".venv/lib/x.py", SECRET);
put("tools/corpus/__pycache__/a.pyc", SECRET);
// ...and things that must stay
put(".env.example", "TOKEN=\n"); put("corpus/real-world/.gitkeep", "");

// 5. dump
const d = run("node", [join(ROOT, "scripts/emergency-dump.mjs"), "--work", work, "--outdir", outdir, "--no-outputs", "test note"], ROOT);
const dumpZip = existsSync(outdir) ? readdirSync(outdir).find((f) => f.endsWith(".zip")) : undefined;
check(d.status === 0 && !!dumpZip, "emergency-dump created the zip");
const dumpPath = join(outdir, dumpZip ?? "does-not-exist.zip");
const listing = run("unzip", ["-l", dumpPath]).stdout ?? "";
const NEVER = { "corpus/real-world/extrato.pdf": /real-world\/extrato\.pdf/, "corpus/huge/big.pdf": /huge\/big\.pdf/, ".env": /\/\.env$/m, ".venv/": /\.venv\//, "__pycache__ / *.pyc": /__pycache__|\.pyc$/m };
for (const [what, re] of Object.entries(NEVER)) check(!re.test(listing), `outside the zip: ${what}`);
check(/work\/chicla\/\.env\.example$/m.test(listing), "inside the zip: .env.example");
check(/work\/chicla\/corpus\/real-world\/\.gitkeep$/m.test(listing), "inside the zip: corpus/real-world/.gitkeep");
check(listing.includes("work/scratch-note.txt"), "inside the zip: scratch file outside the project root");
const ex = join(T, "unz"); run("unzip", ["-q", dumpPath, "-d", ex]);
const leaked = run("grep", ["-rl", SECRET, ex]).stdout.trim();
check(leaked === "", `secret marker absent from the zip bytes${leaked ? ` (appeared in: ${leaked})` : ""}`);
check(/APP_VERSION|CHANGELOG seq=\d+/.test(readFileSync(join(ex, "RECOVERY_REPORT.md"), "utf8")) && JSON.parse(readFileSync(join(ex, "RECOVERY_MARKER.json"), "utf8")).appVersion === JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version, "version read from package.json in the marker");

// 6. recovery, with and without baseline
const rec = (extra, name) => { const o = join(T, name); const r = run("node", [join(ROOT, "scripts/recovery-report.mjs"), dumpPath, "--out", o, ...extra], ROOT); return { r, diff: existsSync(join(o, "RECOVERY_DIFF.md")) ? readFileSync(join(o, "RECOVERY_DIFF.md"), "utf8") : "" }; };
const section = (diff, title) => (diff.split(/^### /m).find((s) => s.startsWith(title)) ?? "");
const a = rec(["--baseline", baseline], "rec-baseline");
check(a.r.status === 0, "recovery-report ran (with baseline)");
check(section(a.diff, "Modified").includes("ROADMAP.md"), "baseline: ROADMAP.md shows up as modified");
check(section(a.diff, "New").includes("packages/chicla-kit/src/new_mod.mjs"), "baseline: new_mod.mjs shows up as new");
check(section(a.diff, "MISSING").includes("packages/chicla-zip/package.json"), "baseline: packages/chicla-zip/package.json shows up as missing");
check(/broken\.mjs: possibly TRUNCATED/.test(a.diff), "baseline: broken.mjs flagged as possibly truncated");
check(!/extrato\.pdf|big\.pdf|\.venv|__pycache__|\.env\b(?!\.example)/.test(a.diff), "baseline: nothing private in the report");
check(a.diff.includes("match the dump's sha256"), "sha256 integrity of the dump matches");
const b = rec([], "rec-manifest");
check(b.r.status === 0 && b.diff.includes("packages/chicla-zip/package.json") && b.diff.includes("new_mod.mjs"), "no baseline: uses the manifest (missing + new)");

// 7. NFC/NFD in names (round 1s, T1 to T4): the macOS manifest/baseline comes in NFD, the Linux disk in NFC.
// Each scenario uses its own minimal project, to control the exact form of the names on each side.
const ACC_NFC = "corpus/edge/names/relatório final (v2) – ação #1 日本語.pdf";
const ACC_NFD = ACC_NFC.normalize("NFD");
check(ACC_NFD !== ACC_NFC, "(control) NFC and NFD of the name really differ in bytes");
const mini = (tag, extra = {}) => {
  const S = join(T, `nfc-${tag}`), w = join(S, "work"), p = join(w, "chicla"), o = join(S, "out");
  const files = { "package.json": "{\"version\":\"0.0.1\"}\n", "CHANGELOG.md": "<!-- CHANGELOG_FINGERPRINT: seq=1 -->\n## Round 1a\n", "CHICLA_PROJECT_STATUS-1.md": "# status\n", "README.md": "readme\n", [ACC_NFC]: "%PDF-1.4 accented\n", ...extra };
  for (const [rel, text] of Object.entries(files)) { const f = join(p, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); }
  return { S, w, p, o, names: Object.keys(files) };
};
const asNfd = (names) => names.map((n) => (n === ACC_NFC ? ACC_NFD : n)); // manifest "from the Mac": only the accented name in NFD
const setManifest = (p, names) => writeFileSync(join(p, "FILES.manifest"), [...names].sort().join("\n") + "\n");
const dumpMini = (m) => {
  const r = run("node", [join(ROOT, "scripts/emergency-dump.mjs"), "--work", m.w, "--outdir", m.o, "--no-outputs", "nfc note"], ROOT);
  const z = existsSync(m.o) ? readdirSync(m.o).find((f) => f.endsWith(".zip")) : undefined;
  return { r, path: z ? join(m.o, z) : null, report: z ? (run("unzip", ["-p", join(m.o, z), "RECOVERY_REPORT.md"]).stdout ?? "") : "" };
};
const recZip = (zipPath, extra, name) => { const o = join(T, name); const r = run("node", [join(ROOT, "scripts/recovery-report.mjs"), zipPath, "--out", o, ...extra], ROOT); return { r, diff: existsSync(join(o, "RECOVERY_DIFF.md")) ? readFileSync(join(o, "RECOVERY_DIFF.md"), "utf8") : "" }; };
const mdSection = (md, title) => md.split(/^## /m).find((x) => x.startsWith(title)) ?? "";

// T1 — manifest NFD, disk NFC, no baseline: neither the dump nor recovery-report sees "new" or "missing"
{
  const m = mini("t1"); setManifest(m.p, asNfd(m.names));
  const d = dumpMini(m);
  check(d.r.status === 0 && !!d.path, "T1: emergency-dump created the zip");
  check(/, 0 new, 0 missing vs manifest/.test(d.r.stdout ?? ""), "T1: emergency-dump (manifest NFD, disk NFC): summary says 0 new and 0 missing", (d.r.stdout ?? "").split("\n").find((l) => /vs manifest/.test(l)));
  check(mdSection(d.report, "Files on disk that are NOT").includes("(none)") && mdSection(d.report, "Files in FILES.manifest that are NOT").includes("(none)"), "T1: RECOVERY_REPORT.md lists the accented file neither as new nor as missing");
  const a = d.path ? recZip(d.path, [], "t1-rec") : { r: { status: 1 }, diff: "" };
  check(/^New \(0\)/.test(section(a.diff, "New")) && /^MISSING vs the base \(0\)/.test(section(a.diff, "MISSING")), "T1: recovery-report without baseline: New (0) and MISSING (0)", `${section(a.diff, "New").split("\n")[0]} | ${section(a.diff, "MISSING").split("\n")[0]}`);
}

// T2 — --baseline in NFD, dump in NFC, accented file modified: must appear in Modified
{
  const m = mini("t2"); setManifest(m.p, asNfd(m.names));
  const B = join(T, "nfc-t2-base"); // "last delivery zip" made on the Mac: accented name in NFD, original content
  for (const n of [...asNfd(m.names), "FILES.manifest"]) { const f = join(B, n); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, n === "FILES.manifest" ? readFileSync(join(m.p, "FILES.manifest")) : n === ACC_NFD ? "%PDF-1.4 accented\n" : readFileSync(join(m.p, n))); }
  const bz = join(T, "nfc-t2-baseline.zip");
  const zb = spawnSync("zip", ["-q", bz, "-@"], { cwd: B, input: [...asNfd(m.names), "FILES.manifest"].join("\n") + "\n" });
  check(zb.status === 0 && existsSync(bz), "T2: base zip (name in NFD) created");
  appendFileSync(join(m.p, ACC_NFC), "line changed in the session\n");
  const d = dumpMini(m);
  const a = d.path ? recZip(d.path, ["--baseline", bz], "t2-rec") : { r: { status: 1 }, diff: "" };
  const head = (t) => section(a.diff, t).split("\n")[0];
  check(/^Modified \(1\)/.test(section(a.diff, "Modified")) && section(a.diff, "Modified").normalize("NFC").includes(ACC_NFC), "T2: --baseline NFD: the changed accented file appears in Modified", `${head("Modified")} | ${head("New")} | ${head("MISSING")}`);
  check(/^New \(0\)/.test(section(a.diff, "New")) && /^MISSING vs the base \(0\)/.test(section(a.diff, "MISSING")), "T2: --baseline NFD: New (0) and MISSING (0)", `${head("New")} | ${head("MISSING")}`);
}

// T3 — integrity: marker hash keys in NFD, extraction in NFC: no false corruption alert
{
  const m = mini("t3"); setManifest(m.p, m.names);
  const d = dumpMini(m);
  check(!!d.path, "T3: emergency-dump created the zip");
  if (d.path) {
    const X = join(T, "nfc-t3-x"); run("unzip", ["-q", d.path, "-d", X]);
    const mk = JSON.parse(readFileSync(join(X, "RECOVERY_MARKER.json"), "utf8"));
    check(Object.keys(mk.hashes).includes(ACC_NFC), "T3: (control) the marker has the accented file key in NFC");
    mk.hashes = Object.fromEntries(Object.entries(mk.hashes).map(([k, v]) => [k.normalize("NFD"), v])); // "extracted on a system that renormalizes names"
    writeFileSync(join(X, "RECOVERY_MARKER.json"), JSON.stringify(mk, null, 1));
    const tz = join(T, "nfc-t3-marker-nfd.zip");
    const zt = run("zip", ["-qr", tz, "."], X);
    check(zt.status === 0 && existsSync(tz), "T3: zip with NFD marker created");
    const a = recZip(tz, [], "t3-rec");
    check(a.diff.includes("match the dump's sha256") && !/differ from what was dumped/.test(a.diff), "T3: NFD keys in the marker, file in NFC: «files match», no false corruption alert", (a.diff.split("\n").find((l) => /^[✓✗] .*(match|differ)/.test(l)) ?? "").slice(0, 120));
  }
}

// T4 — collision: two files that differ only in NFC/NFD: warning (in both scripts) and the zip is still created
{
  const A = "docs/café.txt", Bn = A.normalize("NFD");
  const m = mini("t4", { [A]: "a\n", [Bn]: "b\n" });
  if (readdirSync(join(m.p, "docs")).length !== 2) console.log("⚠ T4 skipped: this file system normalizes names (test the detection function in isolation)");
  else {
    setManifest(m.p, m.names);
    const d = dumpMini(m);
    check(d.r.status === 0 && !!d.path, "T4: emergency-dump creates the zip even with a collision");
    check(/differ only in NFC\/NFD/.test(d.report), "T4: RECOVERY_REPORT.md warns about the collision (errors section)");
    const a = d.path ? recZip(d.path, [], "t4-rec") : { r: { status: 1 }, diff: "" };
    check(a.r.status === 0 && /differ only in NFC\/NFD/.test(a.diff), "T4: recovery-report runs and warns about the collision", (a.diff.match(/.*NFC\/NFD.*/) ?? ["(no warning)"])[0].slice(0, 120));
  }
}

rmSync(T, { recursive: true, force: true });
console.log(failed ? `\n✗ ${failed} check(s) failed` : "\n✓ smoke-test-emergency: all passed");
process.exit(failed ? 1 : 0);
