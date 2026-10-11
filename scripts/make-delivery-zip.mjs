#!/usr/bin/env node
// Creates the delivery zip by the ONLY safe route. Fixed order, stops at the first failure:
//   1. check-manifest  (against the PREVIOUS manifest: catches lost files
//                       BEFORE the manifest is regenerated and "hides" them)
//   2. check-build     (node --check on every .mjs of the tree)
//   3. regenerates FILES.manifest
//   4. writes FILES.baseline.json (C9.6: path, size, sha256 of every manifest file, from the final tree), which
//                       travels in the zip and in every later dump: recovery needs no previous zip
//   5. zips EXACTLY the files listed in FILES.manifest (+ the manifest itself): the exclusions
//                       (private corpus, .env, Python artefacts…) live in one place, check-manifest
//   6. verify-delivery-zip on the final zip (+ --against for each upload given)
//
//   node scripts/make-delivery-zip.mjs <out.zip> [--against <upload.zip> ...] [--allow-removed <path> ...]
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASELINE_FILE, buildBaseline, serializeBaseline } from "./baseline.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [out, ...rest] = process.argv.slice(2);
if (!out || out.startsWith("--")) { console.error("usage: make-delivery-zip.mjs <out.zip> [--against <zip>] [--allow-removed <path>]"); process.exit(2); }
const outPath = resolve(out);
const run = (script, ...a) => {
  const r = spawnSync("node", [resolve(ROOT, "scripts", script), ...a], { stdio: "inherit", cwd: ROOT });
  if (r.status !== 0) {
    // If the zip already exists (step 5 failed), it is a REJECTED zip: it is deleted so nobody delivers it by mistake.
    const hadZip = existsSync(outPath);
    if (hadZip) rmSync(outPath);
    console.error(`\n✗ ${script} failed — delivery aborted; ${hadZip ? "the rejected zip was deleted." : "no zip was created/updated."}`);
    process.exit(1);
  }
};

run("check-manifest.mjs");
run("check-build.mjs");
// the manifest must list the baseline: a placeholder makes the first delivery pick it up; the real content comes after
if (!existsSync(resolve(ROOT, BASELINE_FILE))) writeFileSync(resolve(ROOT, BASELINE_FILE), "{}\n");
run("check-manifest.mjs", "--write");
if (existsSync(outPath)) rmSync(outPath);
const names = readFileSync(resolve(ROOT, "FILES.manifest"), "utf8").split("\n").filter(Boolean);
if (!names.includes("FILES.manifest")) names.push("FILES.manifest");
if (!names.includes(BASELINE_FILE)) names.push(BASELINE_FILE);
// from the FINAL tree (manifest included); never lists itself. A failure here aborts the delivery like any other step.
try { writeFileSync(resolve(ROOT, BASELINE_FILE), serializeBaseline(buildBaseline(ROOT, names))); } catch (e) { console.error(`\n✗ could not write ${BASELINE_FILE}: ${e.message} — delivery aborted; no zip was created/updated.`); process.exit(1); }
try { execFileSync("zip", ["-q", outPath, "-@"], { cwd: ROOT, input: names.join("\n") + "\n", stdio: ["pipe", "inherit", "inherit"] }); } catch (e) { if (existsSync(outPath)) rmSync(outPath); console.error(`\n✗ the zip command failed — delivery aborted; partial zip deleted.`); process.exit(1); }
run("verify-delivery-zip.mjs", outPath, ...rest);
console.log(`\n✓ delivery created and verified: ${outPath}`);
