#!/usr/bin/env node
// C16.6 (AUDIT-4 P-1): run a PART of the test suite.
//   node scripts/run-tests.mjs fast         everything `npm test` runs except the slow integration files (SLOW below)
//   node scripts/run-tests.mjs slow         only those
//   node scripts/run-tests.mjs all          the whole set, same files as `npm test` (`node --test` with no arguments)
//   add --list to print the files and run nothing; --root <dir> to use another project folder.
// `npm run test:fast` and `npm run test:slow` call this. `npm test` stays plain `node --test` and is what the CI runs: the split is for the rounds
// (fast while coding, `npm test` once per round, item 20 of the status file). Which files are slow was measured (item 20), and a test checks that
// every name below still exists, so a rename cannot hide a slow file in the fast set.
import { readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SLOW = [
  "packages/chicla-kit/test/cli-make-delivery.test.mjs",
  "packages/chicla-kit/test/core-git-rm-hint.test.mjs",
  "packages/chicla-kit/test/core-make-delivery.test.mjs",
  "packages/chicla-kit/test/core-verify-delivery.test.mjs",
  "test/baseline.test.mjs",
  "test/make-delivery-nozip.test.mjs",
  "test/verify-against.test.mjs",
];

// The files `node --test` runs when it is given no arguments (Node 22): every .js/.cjs/.mjs under a `test` folder, and anywhere the names
// *.test.*, *-test.*, *_test.*, test-*.* and test.*; node_modules and dot folders are not searched. Sorted, with `/` in every system.
const NAMED = [/\.test\.(c|m)?js$/, /-test\.(c|m)?js$/, /_test\.(c|m)?js$/, /(^|\/)test-[^/]*\.(c|m)?js$/, /(^|\/)test\.(c|m)?js$/];
export function discover(root) {
  const out = [];
  (function walk(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
      const p = join(dir, ent.name);
      if (ent.isDirectory()) { walk(p); continue; }
      const rel = relative(root, p).split(sep).join("/");
      if (/(^|\/)test\/.*\.(c|m)?js$/.test(rel) || NAMED.some((re) => re.test(rel))) out.push(rel);
    }
  })(resolve(root));
  return out.sort();
}
export function split(all) { const slow = all.filter((f) => SLOW.includes(f)); return { fast: all.filter((f) => !SLOW.includes(f)), slow }; }

function main(argv) {
  const usage = () => { console.error("usage: node scripts/run-tests.mjs fast|slow|all [--list] [--root <dir>]"); return 1; };
  const rest = [...argv]; const which = rest.shift();
  if (!["fast", "slow", "all"].includes(which)) return usage();
  let list = false, root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  while (rest.length) { const a = rest.shift(); if (a === "--list") list = true; else if (a === "--root" && rest.length) root = resolve(rest.shift()); else return usage(); }
  const all = discover(root); const { fast, slow } = split(all);
  const files = which === "fast" ? fast : which === "slow" ? slow : all;
  if (list) { if (files.length) console.log(files.join("\n")); return 0; }
  console.log(`test:${which}: ${files.length} files (of ${all.length} that \`npm test\` runs)`);
  if (!files.length) return 0;
  const r = spawnSync(process.execPath, ["--test", ...files], { cwd: root, stdio: "inherit" });
  return r.status === 0 ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
