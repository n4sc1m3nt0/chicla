#!/usr/bin/env node
// EMERGENCY COMMAND (/dump) — dumps the WHOLE working directory into a zip, right now.
//
//   node scripts/emergency-dump.mjs ["short note: what you were doing / what is missing"]
//
// For when the tool limit is hit close to the usage limit: the work is done but unreachable.
// This script is NOT a delivery:
//   - it runs NO guards (check-manifest, check-imports, verify-delivery-zip). A half-done tree
//     would fail them and the zip would never be created — the opposite of what is wanted here.
//   - it does NOT regenerate FILES.manifest and does NOT touch any project file (read only).
//   - it does NOT fail because of the report: any error while generating the report is recorded
//     inside the zip itself and the zip is created anyway. The only possible failure is `zip` itself.
//
// Zip contents (with a `work/` and an `outputs/` folder, on purpose: it does NOT paste onto the project root):
//   RECOVERY_MARKER.json   marker + sha256 of every project file (read by recovery-report.mjs)
//   RECOVERY_REPORT.md     what is in the zip, what changed since the last delivery, the note
//   work/…                 the working directory (/home/claude) as it is
//   outputs/…              files (not .zip) that were already in /mnt/user-data/outputs
// It excludes only what is never work: node_modules, .next, .git, __MACOSX, .DS_Store,
// tsbuildinfo, npm caches, .zip files (deliveries already made), .env / .env.* secrets (not the
// .example/.sample ones) and — W3, the same rules as W2 — .venv/,
// __pycache__/, *.pyc and everything in corpus/real-world/ and corpus/huge/ (except the .gitkeep): the
// private corpus NEVER enters a zip, not even a dump. The report only counts those files, it does not name them.
// Project root = folder with package.json + FILES.manifest. Known limit: in the tar.gz fallback
// (only if `zip` does not exist) the .gitkeep/.env.example of the excluded folders are not put back.
//
// Options (for tests only): --work <dir>  --outdir <dir>  --no-outputs
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (name) => argv.includes(name);
const note = argv.filter((a, i) => !a.startsWith("--") && !["--work", "--outdir"].includes(argv[i - 1])).join(" ").trim();

const SCRIPT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url))); // never URL.pathname (round 198)
const WORK = resolve(opt("--work") ?? (existsSync("/home/claude") ? "/home/claude" : SCRIPT_ROOT));
const OUTDIR = resolve(opt("--outdir") ?? (existsSync("/mnt/user-data/outputs") ? "/mnt/user-data/outputs" : join(WORK, "outputs")));
mkdirSync(OUTDIR, { recursive: true });

const EXCLUDE_DIRS = new Set(["node_modules", ".next", ".git", "__MACOSX", ".npm-global", ".cache", ".npm", ".venv", "__pycache__"]);
const isKeptEnv = (n) => /^\.env(\..*)?$/.test(n) && /\.(example|sample)$/.test(n); // W2 rule: .env.example/.sample are not secrets
const skipFile = (n) => n === ".DS_Store" || n.endsWith(".tsbuildinfo") || n.endsWith(".zip") || n.endsWith(".pyc") || ((n === ".env" || n.startsWith(".env.")) && !isKeptEnv(n)); // secrets never enter a dump
const PRIVATE_RE = /(^|\/)corpus\/(real-world|huge)\//; // private corpus (W2); the .gitkeep stay
const isPrivate = (rel) => PRIVATE_RE.test(rel) && !/(^|\/)\.gitkeep$/.test(rel);
let privateSkipped = 0;
const errors = [];
const safe = (what, fn, fallback) => { try { return fn(); } catch (e) { errors.push(`${what}: ${e.message}`); return fallback; } };

// Walks a tree (without following symlinks), returns [{rel, size, mtime}] and the excluded .zip files.
function walk(root, prefix) {
  const files = [], zips = [];
  const go = (dir) => {
    let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch (e) { errors.push(`read ${dir}: ${e.message}`); return; }
    for (const e of ents) {
      const p = join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (EXCLUDE_DIRS.has(e.name)) continue;
        go(p); continue;
      }
      if (!e.isFile()) continue;
      let st; try { st = statSync(p); } catch { continue; }
      if (e.name.endsWith(".zip")) { zips.push({ rel: relative(root, p), size: st.size }); continue; }
      if (skipFile(e.name)) continue;
      if (isPrivate(relative(root, p))) { privateSkipped++; continue; }
      files.push({ rel: relative(root, p), size: st.size, mtime: st.mtimeMs });
    }
  };
  go(root);
  return { files, zips };
}

const workScan = safe("walk work", () => walk(WORK, "work"), { files: [], zips: [] });
const outScan = flag("--no-outputs") || resolve(OUTDIR).startsWith(WORK + "/") ? { files: [], zips: [] } : safe("walk outputs", () => walk(OUTDIR, "outputs"), { files: [], zips: [] });

// Project root(s): folders (up to 3 levels) with package.json + FILES.manifest. The shallowest / most recent one wins.
const projectRoots = [];
for (const f of workScan.files) {
  if (!f.rel.endsWith("FILES.manifest")) continue;
  const dir = f.rel === "FILES.manifest" ? "" : f.rel.slice(0, -"/FILES.manifest".length);
  if (dir.split("/").length > 3) continue;
  if (workScan.files.some((g) => g.rel === (dir ? `${dir}/package.json` : "package.json"))) projectRoots.push({ dir, depth: dir ? dir.split("/").length : 0, mtime: f.mtime });
}
projectRoots.sort((a, b) => a.depth - b.depth || b.mtime - a.mtime);
const project = projectRoots[0] ?? null;
const inProject = (rel) => project && (project.dir === "" ? true : rel.startsWith(project.dir + "/"));
const projRel = (rel) => (project && project.dir ? rel.slice(project.dir.length + 1) : rel);
const projectFiles = project ? workScan.files.filter((f) => inProject(f.rel)) : [];
const scratchFiles = workScan.files.filter((f) => !inProject(f.rel));

// Hashes (project only; safety limit so a huge folder does not take forever).
const hashes = {};
let hashedBytes = 0;
for (const f of projectFiles) {
  if (hashedBytes > 300e6) break;
  safe(`hash ${f.rel}`, () => { hashes[projRel(f.rel)] = createHash("sha256").update(readFileSync(join(WORK, f.rel))).digest("hex"); hashedBytes += f.size; });
}

// Project metadata.
const readP = (p) => (project ? safe(`read ${p}`, () => readFileSync(join(WORK, project.dir, p), "utf8"), "") : "");
const changelog = readP("CHANGELOG.md");
const afterRound = (changelog.match(/^## Round (\S+)/m) ?? [])[1] ?? "unknown";
const fpSeq = (changelog.split("\n", 1)[0].match(/seq=(\d+)/) ?? [])[1] ?? "?";
const statusFile = projectFiles.map((f) => projRel(f.rel)).find((r) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(r)) ?? "(not found)";
const appVersion = (() => { try { return JSON.parse(readP("package.json")).version ?? "?"; } catch { return "?"; } })(); // app version = "version" in the root package.json (D13)
const manifestPath = project ? join(WORK, project.dir, "FILES.manifest") : null;
const manifestList = manifestPath && existsSync(manifestPath) ? safe("manifest", () => readFileSync(manifestPath, "utf8").split("\n").filter(Boolean), []) : [];
const manifestMtime = manifestPath && existsSync(manifestPath) ? statSync(manifestPath).mtimeMs : 0;
// compare in NFC (macOS manifest = NFD; Linux disk = NFC); print the true names
const nfc = (p) => p.normalize("NFC");
const diskNames = projectFiles.map((f) => projRel(f.rel));
const onDisk = new Set(diskNames.map(nfc));
const manifestSet = new Set(manifestList.map(nfc));
const lostVsManifest = manifestList.filter((p) => !onDisk.has(nfc(p)));
const newVsManifest = diskNames.filter((p) => !manifestSet.has(nfc(p)) && p !== "FILES.manifest");
if (onDisk.size !== diskNames.length) errors.push("names that differ only in NFC/NFD: " + (diskNames.length - onDisk.size) + " collision(s)");
const touched = projectFiles.filter((f) => manifestMtime && f.mtime > manifestMtime + 2000).sort((a, b) => b.mtime - a.mtime);
const newest = [...projectFiles].sort((a, b) => b.mtime - a.mtime).slice(0, 40);

const now = new Date();
const iso = now.toISOString();
const stamp = iso.replace(/[-:]/g, "").replace("T", "-").slice(0, 15); // YYYYMMDD-HHMMSS
const day = iso.slice(0, 10);
const zipName = `chicla-EMERGENCY-afterRound${afterRound}-${day}-${stamp.slice(9)}.zip`;

const cap = (arr, n) => (arr.length > n ? [...arr.slice(0, n), `… (+${arr.length - n})`] : arr);
const kb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const when = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z";

const marker = {
  format: "chicla-recovery-v1",
  created: iso,
  note: note || null,
  workRoot: WORK,
  projectRootRel: project ? project.dir : null,
  afterRound, statusFile, changelogSeq: fpSeq, appVersion,
  projectFileCount: projectFiles.length,
  hashes,
  reportErrors: errors,
};

const report = `# RECOVERY — emergency dump (NOT a delivery)

- Created: ${iso}
- Note from the session that dumped: ${note ? `**${note}**` : "_(no note)_"}
- Project state at the dump: last round in the CHANGELOG = **${afterRound}**, status file \`${statusFile}\`, CHANGELOG seq=${fpSeq}, APP_VERSION ${appVersion}.
- Project: \`work/${project ? project.dir || "(root of work/)" : "?? (no folder with package.json + FILES.manifest)"}\` — ${projectFiles.length} files.

**This zip passed NO guard**, it may hold half-written files and it does NOT paste onto the project root
(it has the \`work/\` and \`outputs/\` folders). To use it: send it to the next session and say "recovery mode"
(item 17 of the status file), ideally together with the LAST good delivery zip.

## Likely changes in this session (mtime later than the last delivery's FILES.manifest)
${touched.length ? cap(touched.map((f) => `- ${projRel(f.rel)}  (${when(f.mtime)}, ${kb(f.size)})`), 80).join("\n") : "- (none — or the clocks do not help; see the lists below)"}

## Files on disk that are NOT in FILES.manifest (new since the last delivery)
${newVsManifest.length ? cap(newVsManifest.map((p) => `- ${p}`), 80).join("\n") : "- (none)"}

## Files in FILES.manifest that are NOT on disk (lost or deleted — review!)
${lostVsManifest.length ? cap(lostVsManifest.map((p) => `- ${p}`), 80).join("\n") : "- (none)"}

## The 40 most recently modified project files
${newest.map((f) => `- ${projRel(f.rel)}  (${when(f.mtime)})`).join("\n") || "- (none)"}

## Outside the project root, inside work/ (scratch files, loose files)
${scratchFiles.length ? cap(scratchFiles.sort((a, b) => b.mtime - a.mtime).map((f) => `- work/${f.rel}  (${kb(f.size)})`), 60).join("\n") : "- (none)"}

## Excluded from the zip (not work)
- .zip inside work/: ${workScan.zips.length ? workScan.zips.map((z) => `${z.rel} (${kb(z.size)})`).join(", ") : "none"}
- .zip inside outputs/: ${outScan.zips.length ? outScan.zips.map((z) => `${z.rel} (${kb(z.size)})`).join(", ") : "none"}
- node_modules, .next, .git, __MACOSX, .DS_Store, tsbuildinfo, npm caches, .venv, __pycache__, *.pyc, .env secrets.
- Private corpus (corpus/real-world, corpus/huge): ${privateSkipped} file(s) deliberately NOT included (only the .gitkeep); names not listed.

## Files in outputs/ included
${outScan.files.length ? cap(outScan.files.map((f) => `- outputs/${f.rel}  (${kb(f.size)})`), 40).join("\n") : "- (none)"}
${errors.length ? `\n## Errors while generating this report (the zip was created anyway)\n${errors.map((e) => `- ${e}`).join("\n")}\n` : ""}`;

// --- Staging with symlinks: the zip gets work/ and outputs/ without copying anything. ---
const stage = mkdtempSync(join(tmpdir(), "chicla-emergency-"));
writeFileSync(join(stage, "RECOVERY_MARKER.json"), JSON.stringify(marker, null, 1));
writeFileSync(join(stage, "RECOVERY_REPORT.md"), report);
symlinkSync(WORK, join(stage, "work"));
const includeOutputs = !flag("--no-outputs") && outScan.files.length > 0;
if (includeOutputs) symlinkSync(OUTDIR, join(stage, "outputs"));

const tmpZip = join(tmpdir(), zipName);
rmSync(tmpZip, { force: true });
const EX = ["*/node_modules/*", "*/.next/*", "*/.git/*", "*/__MACOSX/*", "*/.npm-global/*", "*/.cache/*", "*/.npm/*", "*/.venv/*", "*/__pycache__/*", "*.DS_Store", "*.tsbuildinfo", "*.zip", "*.pyc", "*/.env", "*/.env.*", "*/corpus/real-world/*", "*/corpus/huge/*"];
const members = ["RECOVERY_MARKER.json", "RECOVERY_REPORT.md", "work", ...(includeOutputs ? ["outputs"] : [])];
let r = spawnSync("zip", ["-qr", tmpZip, ...members, "-x", ...EX], { cwd: stage, stdio: ["ignore", "inherit", "inherit"] });
let finalName = zipName;
if (r.status !== 0 && r.status !== 18) { // 18 = some unreadable files; the zip exists anyway
  // Fallback: tar.gz (follows symlinks), in case `zip` does not exist.
  finalName = zipName.replace(/\.zip$/, ".tar.gz");
  const tmpTar = join(tmpdir(), finalName);
  r = spawnSync("tar", ["-czhf", tmpTar, ...EX.filter((x) => !x.startsWith("*.")).map((x) => `--exclude=${x.replace(/^\*\//, "").replace(/\/\*$/, "")}`), "--exclude=*.zip", "--exclude=*.pyc", "--exclude=.DS_Store", "--exclude=.env", "--exclude=.env.*", "-C", stage, ...members], { stdio: "inherit" });
  if (r.status !== 0) { console.error("✗ neither zip nor tar worked — dump NOT created."); rmSync(stage, { recursive: true, force: true }); process.exit(1); }
  copyFileSync(tmpTar, join(OUTDIR, finalName)); rmSync(tmpTar, { force: true });
} else {
  // puts back what -x caught by sweeping but must stay: .gitkeep of the private corpus and .env.example/.sample
  const keep = workScan.files.filter((f) => (PRIVATE_RE.test(f.rel) && /(^|\/)\.gitkeep$/.test(f.rel)) || isKeptEnv(f.rel.split("/").pop())).map((f) => `work/${f.rel}`);
  if (keep.length) spawnSync("zip", ["-q", tmpZip, ...keep], { cwd: stage, stdio: ["ignore", "inherit", "inherit"] });
  copyFileSync(tmpZip, join(OUTDIR, finalName)); rmSync(tmpZip, { force: true });
}
rmSync(stage, { recursive: true, force: true });

const finalPath = join(OUTDIR, finalName);
console.log(`\n✓ EMERGENCY DUMP CREATED (no guards — not a delivery)\n  ${finalPath}  (${kb(statSync(finalPath).size)})`);
console.log(`  project: ${projectFiles.length} files, ${touched.length} dated after the manifest (indicative only: a cp/unzip wipes the dates; recovery-report compares the content), ${newVsManifest.length} new, ${lostVsManifest.length} missing vs manifest.`);
if (errors.length) console.log(`  warnings in the report: ${errors.length} (see RECOVERY_REPORT.md inside the zip)`);
console.log(`\nNOW: present_files with the path above. Nothing else.`);
