#!/usr/bin/env node
// Build guard: a delivery does not go out if any .mjs file stopped passing `node --check`.
//
//   node scripts/check-build.mjs
//
// - Walks the tree (skipping node_modules, .git, __MACOSX) and runs `node --check` on every .mjs.
// - Exits 1 and names the files that failed; exits 0 if all pass.
// - Does not run the tests: `npm test` and `npm run smoke` remain a step of the round (and of CI).
// Replaces the `cargo check` of the original workflow: Node is always present (the scripts themselves run on it), so
// there is no path of "build NOT verified".
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SKIP = new Set(["node_modules", ".git", "__MACOSX"]);
const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink() || SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && e.name.endsWith(".mjs")) files.push(p);
  }
};
walk(ROOT);

console.log(`node --check on ${files.length} .mjs files`);
const bad = [];
for (const f of files) {
  const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
  if (r.status !== 0) bad.push(`${relative(ROOT, f).split("\\").join("/")}: ${(r.stderr.split("\n").find((l) => /Error/.test(l)) ?? "").slice(0, 100)}`);
}
if (bad.length) { console.error(`\n✗ node --check failed on ${bad.length} file(s). Delivery aborted.\n  ${bad.join("\n  ")}`); process.exit(1); }
console.log("✓ node --check passed");
