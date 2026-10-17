#!/usr/bin/env node
// Smoke test for mutants.mjs (C5.3): a tiny fake package in a tmpdir (does not touch the real tree).
//   node scripts/smoke-test-mutants.mjs
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const T = mkdtempSync(join(tmpdir(), "chicla-mutants-"));
const pkg = join(T, "pkg");
let failed = 0;
const check = (ok, what, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) { failed++; if (detail) console.log(detail); } };
const put = (rel, body) => { mkdirSync(join(T, rel, ".."), { recursive: true }); writeFileSync(join(T, rel), body); };
const out = (r) => `exit=${r.status}\n${r.stdout}\n${r.stderr}`;
const SRC = "export const add = (a, b) => a + b;\nexport const neg = (a) => -a;\n";
const TEST = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../src/m.mjs';\ntest('add', () => assert.equal(add(2, 3), 5));\n";
const KILL = { id: "add-minus", file: "src/m.mjs", find: "a + b", replace: "a - b", tests: ["test/m.test.mjs", "test/tmp.test.mjs"], why: "add adds" };
const LIVE = { id: "neg-id", file: "src/m.mjs", find: "-a", replace: "a", tests: ["test/m.test.mjs"], why: "neg negates" };
const run = (list, ...more) => {
  put("list.mjs", `export default ${JSON.stringify(list)};\n`);
  return spawnSync(process.execPath, [join(ROOT, "scripts/mutants.mjs"), "--pkg", pkg, "--list", join(T, "list.mjs"), "--timeout", "60", ...more], { encoding: "utf8" });
};
put("pkg/src/m.mjs", SRC);
put("pkg/test/m.test.mjs", TEST);
put("pkg/test/tmp.test.mjs", "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { tmpdir } from 'node:os';\ntest('tmpdir is private to the run', () => assert.match(tmpdir(), /chicla-mutants-/));\n");

let r = run([KILL]);
check(r.status === 0 && /RED +add-minus/.test(r.stdout), "a mutant the tests catch: RED, exit 0", out(r));
check(readFileSync(join(pkg, "src/m.mjs"), "utf8") === SRC, "the real package is never modified");

// Progress (round 55): one line per event on STDERR, as it happens; STDOUT (the table and the verdict) stays as it was.
r = run([KILL, LIVE]);
check(/baseline/i.test(r.stderr) && /\[1\/2\] +RED +add-minus +\d/.test(r.stderr) && /\[2\/2\] +SURVIVED +neg-id +\d/.test(r.stderr), "progress on stderr: the baseline, then «[i/n] STATE id seconds» per mutant", out(r));
check(!/\[\d+\/\d+\]/.test(r.stdout) && /RED +add-minus/.test(r.stdout) && /2 mutant\(s\)/.test(r.stdout), "stdout is unchanged: no progress lines, the table and the count at the end", out(r));
put("pkg/test/slow.test.mjs", "import { test } from 'node:test';\nimport { add } from '../src/m.mjs';\ntest('slow only when mutated', async () => { if (add(2, 3) !== 5) await new Promise((r) => setTimeout(r, 2500)); });\n");
put("list.mjs", `export default ${JSON.stringify([KILL, { ...KILL, id: "add-minus-slow", tests: ["test/m.test.mjs", "test/slow.test.mjs"] }])};\n`);
await new Promise((done) => {
  const t0 = Date.now(); let first = null, seen = "";
  const c = spawn(process.execPath, [join(ROOT, "scripts/mutants.mjs"), "--pkg", pkg, "--list", join(T, "list.mjs"), "--timeout", "60"], { stdio: ["ignore", "ignore", "pipe"] });
  c.stderr.on("data", (d) => { seen += d; if (first === null && /\[1\/2\]/.test(seen)) first = Date.now() - t0; });
  c.on("close", () => { const total = Date.now() - t0; check(first !== null && total - first > 1500, `the first progress line arrives while the run is still going (line at ${first} ms, end at ${total} ms)`, seen); done(); });
});
rmSync(join(pkg, "test/slow.test.mjs"));

// Round 169: `onlyOn`. A mutant for another platform is «not run here»: no red, no survivor, exit 0; on this platform it is judged as usual; a bad value is a usage error.
r = run([KILL, { ...LIVE, onlyOn: [process.platform === "linux" ? "win32" : "linux"] }]);
check(r.status === 0 && /not run here +neg-id/.test(r.stdout) && /1 not run on/.test(r.stdout), "onlyOn another platform: «not run here», exit 0", out(r));
r = run([KILL, { ...LIVE, onlyOn: [process.platform] }]);
check(r.status === 1 && /SURVIVED +neg-id/.test(r.stdout), "onlyOn this platform: judged as usual (a survivor is still exit 1)", out(r));
r = run([KILL, { ...LIVE, onlyOn: "linux" }]);
check(r.status === 2 && /onlyOn must be/.test(r.stderr), "onlyOn that is not a list: usage error, exit 2", out(r));

r = run([KILL, LIVE]);
check(r.status === 1 && /SURVIVED +neg-id/.test(r.stdout), "an unexplained survivor: exit 1", out(r));

r = run([KILL, { ...LIVE, survives: "the test does not call neg (on purpose)" }]);
check(r.status === 0 && /survives \(explained\) +neg-id/.test(r.stdout) && /does not call neg/.test(r.stdout), "an explained survivor: reported with its reason, exit 0", out(r));

r = run([{ ...KILL, survives: "wrong: it does die" }]);
check(r.status === 1 && /DIED +add-minus/.test(r.stdout), "an explained survivor that actually dies: exit 1 (the explanation is stale)", out(r));

r = run([KILL, { ...LIVE, id: "neg-deleted", find: "export const neg = (a) => -a;\n", replace: "", survives: "the test never imports neg" }]);
check(r.status === 0 && /survives \(explained\) +neg-deleted/.test(r.stdout), "an empty `replace` (a deletion) is a valid mutant", out(r));

r = run([KILL, { ...LIVE, find: "no such text" }]);
check(r.status === 1 && /STALE +neg-id/.test(r.stdout), "text not found in the file: STALE, exit 1", out(r));

r = run([KILL, { ...LIVE, find: "a", replace: "b" }]);
check(r.status === 1 && /STALE +neg-id/.test(r.stdout) && /3 times|\b[2-9] times/.test(r.stdout), "text found more than once: STALE, exit 1", out(r));

r = run([KILL, { ...LIVE, find: "-a", replace: "-(" }]);
check(r.status === 1 && /INVALID +neg-id/.test(r.stdout), "a mutant that does not even parse: INVALID, exit 1 (a syntax error would be a fake red)", out(r));

r = run([KILL, { ...KILL, id: "add-minus" }]);
check(r.status === 2 && /duplicate id/i.test(r.stderr), "duplicate ids: usage error, exit 2", out(r));

r = run([KILL, LIVE], "--only", "add-minus");
check(r.status === 0 && /add-minus/.test(r.stdout) && !/neg-id/.test(r.stdout), "--only runs just that mutant", out(r));

r = run([KILL, LIVE], "--only", "nope");
check(r.status === 2, "--only with an unknown id: exit 2", out(r));

put("pkg/src/m.mjs", SRC);
put("pkg/test/m.test.mjs", TEST.replace("5)", "6)"));
r = run([KILL]);
check(r.status === 2 && /baseline/i.test(r.stdout + r.stderr), "tests already red without any mutation: exit 2 (a red proves nothing)", out(r));

put("pkg/test/m.test.mjs", "import { test } from 'node:test';\nimport { add } from '../src/m.mjs';\ntest('hang', () => new Promise(() => { setInterval(() => {}, 1000); }));\n");
put("list.mjs", `export default ${JSON.stringify([KILL])};\n`);
r = spawnSync(process.execPath, [join(ROOT, "scripts/mutants.mjs"), "--pkg", pkg, "--list", join(T, "list.mjs"), "--timeout", "3"], { encoding: "utf8" });
check(r.status === 2 && /baseline/i.test(r.stdout + r.stderr), "a baseline that hangs hits the timeout: exit 2", out(r));

rmSync(T, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) failed` : "\nall green");
process.exit(failed ? 1 : 0);
