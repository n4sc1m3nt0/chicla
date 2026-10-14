#!/usr/bin/env node
// Smoke test for check-build: fake project in a tmpdir (does not touch the real tree).
//   node scripts/smoke-test-check-build.mjs
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const T = mkdtempSync(join(tmpdir(), "chicla-check-build-"));
const proj = join(T, "proj");
mkdirSync(join(proj, "scripts"), { recursive: true });
copyFileSync(join(ROOT, "scripts/check-build.mjs"), join(proj, "scripts/check-build.mjs"));
mkdirSync(join(proj, "packages/chicla-kit/src"), { recursive: true }); // C11.1 5a: the script is a wrapper over the core in the kit
copyFileSync(join(ROOT, "packages/chicla-kit/src/check-build.mjs"), join(proj, "packages/chicla-kit/src/check-build.mjs"));
let failed = 0;
const check = (ok, what, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) { failed++; if (detail) console.log(detail); } };
const put = (rel, body) => { mkdirSync(join(proj, rel, ".."), { recursive: true }); writeFileSync(join(proj, rel), body); };
const run = () => spawnSync(process.execPath, [join(proj, "scripts/check-build.mjs")], { encoding: "utf8" });
const out = (r) => `exit=${r.status}\n${r.stdout}\n${r.stderr}`;

put("packages/a/src/ok.mjs", "export const a = 1;\n");
put("packages/b/src/também-ok.mjs", "export function b() { return 'acentuação ç'; }\n");
let r = run();
check(r.status === 0 && /node --check on 4 \.mjs files/.test(r.stdout) && /✓ node --check passed/.test(r.stdout), "all valid: exit 0 and counts the files (including the wrapper and its core)", out(r));

put("packages/a/src/partido.mjs", "export function cortado() {\n  if (true) {\n");
r = run();
check(r.status === 1 && /failed on 1 file/.test(r.stderr) && /packages\/a\/src\/partido\.mjs/.test(r.stderr) && /Delivery aborted/.test(r.stderr), "file with broken syntax: exit 1 and names it", out(r));
check(!/ok\.mjs/.test(r.stderr), "…and does not accuse the valid files", out(r));

rmSync(join(proj, "packages/a/src/partido.mjs"));
put("node_modules/dep/index.mjs", "this is not valid javascript (\n");
put(".git/hooks/x.mjs", "((\n");
r = run();
check(r.status === 0, "node_modules and .git are ignored even with invalid files", out(r));

put("packages/a/src/nao-mjs.js", "((\n");
r = run();
check(r.status === 0, "only checks .mjs (an invalid .js is not read)", out(r));

rmSync(T, { recursive: true, force: true });
console.log(failed ? `\n✗ ${failed} check(s) failed` : "\n✓ smoke-test-check-build: all passed");
process.exit(failed ? 1 : 0);
