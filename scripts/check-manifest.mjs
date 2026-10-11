#!/usr/bin/env node
// Guard against LOST FILES (what happened in the round 196 session:
// an update replaced lib/devpanel/ with a partial folder and 11
// modules vanished without anyone noticing).
//
//   node scripts/check-manifest.mjs           -> checks (fails if any file is missing)
//   node scripts/check-manifest.mjs --write   -> regenerates FILES.manifest
//
// FILES.manifest lists the path of every source file of the project. The
// check FAILS if a listed path no longer exists (lost file) and
// only WARNS if there is a new file that is not listed (forgot to
// regenerate). Runs on `prebuild`. Regenerate every round, AFTER all
// changes and BEFORE creating the zip.
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MANIFEST = join(ROOT, "FILES.manifest");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "__MACOSX"]);
const SKIP_FILES = new Set([".DS_Store", "tsconfig.tsbuildinfo", "FILES.manifest"]);

// W2 — what NEVER enters the manifest (and therefore never a delivery zip, which is built from the manifest):
//   Python artefacts, .env secrets (not .env.example/.sample),
//   and the PRIVATE corpus: everything under corpus/real-world/ and corpus/huge/ except the .gitkeep files.
// Rules mirrored in verify-delivery-zip.mjs (privateReason); keep both in sync.
const PRIVATE_DIRS = ["corpus/real-world", "corpus/huge"];
const isPrivateFile = (rel) => PRIVATE_DIRS.some((d) => rel.startsWith(d + "/")) && !/(^|\/)\.gitkeep$/.test(rel);
const isSecretEnv = (name) => /^\.env(\..*)?$/.test(name) && !/\.(example|sample)$/.test(name);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) continue;
    const p = join(dir, name);
    const isDir = statSync(p).isDirectory();
    if (isDir && (name === ".venv" || name === "__pycache__")) continue;
    if (!isDir && (/\.pyc$/.test(name) || isSecretEnv(name))) continue;
    if (isDir) { walk(p, out); continue; }
    const rel = relative(ROOT, p).split("\\").join("/");
    if (isPrivateFile(rel)) continue;
    out.push(rel);
  }
  return out;
}

const current = walk(ROOT).sort();

if (process.argv.includes("--write")) {
  writeFileSync(MANIFEST, current.join("\n") + "\n");
  console.log(`✓ FILES.manifest written (${current.length} files)`);
  process.exit(0);
}

if (!existsSync(MANIFEST)) {
  console.warn("⚠ FILES.manifest does not exist — run `node scripts/check-manifest.mjs --write` to create it.");
  process.exit(0);
}

const listed = readFileSync(MANIFEST, "utf8").split("\n").filter(Boolean);
// Round 1r: names are compared in NFC (a manifest written on macOS has NFD; the git checkout on Linux brings NFC).
// Only the COMPARISON is normalised: the names printed and those `--write` writes are the true ones from the disk.
const nfc = (f) => f.normalize("NFC");
const have = new Set(current.map(nfc));
// The status file is renamed every round (CHICLA_PROJECT_STATUS-N.md -> -N+1, instruction 8):
// that is a deliberate rename, not a loss, as long as exactly one status file exists now.
const STATUS_RE = /^CHICLA_PROJECT_STATUS-\d+\.md$/;
const statusNow = current.filter((f) => STATUS_RE.test(f));
const lost = listed.filter((f) => !have.has(nfc(f)) && !(STATUS_RE.test(f) && statusNow.length === 1));
const listedSet = new Set(listed.map(nfc));
const added = current.filter((f) => !listedSet.has(nfc(f)));

if (added.length) console.warn(`⚠ ${added.length} new file(s) outside FILES.manifest (regenerate with node scripts/check-manifest.mjs --write):\n  ${added.slice(0, 15).join("\n  ")}`);
if (lost.length) {
  console.error(`\n✗ ${lost.length} LOST file(s) vs FILES.manifest:\n  ${lost.join("\n  ")}`);
  console.error("\nProbable cause: a folder was replaced by a partial version. Restore these files BEFORE continuing.\n");
  process.exit(1);
}
console.log(`✓ no file lost (${listed.length} in the manifest, ${current.length} on disk)`);
