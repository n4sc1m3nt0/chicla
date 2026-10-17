#!/usr/bin/env node
// C5.3 — the mutants that must stay red. For each entry of the list: change ONE piece of the source in a COPY of the package,
// run only the test files named in the entry, and require them to fail. A mutant the tests do not catch is a promise broken.
//   node scripts/mutants.mjs [--pkg <dir>] [--list <file>] [--only <id>] [--timeout <seconds per run>]
// List entry: { id, file, find, replace, tests: [files], why, survives?, onlyOn? }. `find` must occur exactly once in `file`;
// `survives` (a reason) marks a survivor that is understood and accepted; if it then dies, the reason is stale and the run fails.
// `onlyOn` (a list of process.platform values) marks a mutant whose tests can go red only there (the case-folding and invalid-UTF-8 names of the collision tests need a case-sensitive file system: Linux); elsewhere it is reported as «not run here» and is neither red nor a survivor (round 169).
// Anything the tests create through os.tmpdir() lands in a private folder that is removed at the end; a path hard-coded outside it (a mount like /dev/shm) is not covered, so a mutant that leaks there must not name that test file.
// Progress goes to STDERR as it happens (the baseline, then one line «[i/n] STATE id seconds» per mutant: a full run takes minutes); STDOUT holds only the final table and the count.
// Exit 0: every mutant behaved as listed. 1: a survivor, a stale or invalid entry, or a stale explanation. 2: usage, or the
// tests are already red (or hang) without any mutation, which would make every red meaningless.
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const usage = (msg) => { console.error(`mutants: ${msg}`); process.exit(2); };
const opt = (name, dflt) => { const i = process.argv.indexOf(name); if (i < 0) return dflt; if (i + 1 >= process.argv.length) usage(`${name} needs a value`); return process.argv[i + 1]; };

const pkg = resolve(opt("--pkg", join(ROOT, "packages/chicla-zip")));
const listFile = resolve(opt("--list", join(pkg, "mutants/list.mjs")));
const only = opt("--only", null);
const timeout = Number(opt("--timeout", "300")) * 1000;
if (!(timeout > 0)) usage("--timeout must be a positive number of seconds");

let list;
try { list = (await import(pathToFileURL(listFile).href)).default; } catch (e) { usage(`cannot load ${listFile}: ${e.message}`); }
if (!Array.isArray(list) || list.length === 0) usage("the list is empty or not an array");
const seen = new Set();
for (const m of list) {
  for (const k of ["id", "file", "find", "replace", "why"]) if (typeof m[k] !== "string" || (!m[k] && k !== "replace")) usage(`entry ${m.id ?? "?"}: missing ${k}`); // `replace` may be empty: a deletion
  if (!Array.isArray(m.tests) || !m.tests.length) usage(`entry ${m.id}: missing tests`);
  if (seen.has(m.id)) usage(`duplicate id ${m.id}`);
  seen.add(m.id);
  if (m.find === m.replace) usage(`entry ${m.id}: find and replace are the same`);
  if (m.onlyOn !== undefined && !(Array.isArray(m.onlyOn) && m.onlyOn.length && m.onlyOn.every((x) => typeof x === "string" && x))) usage(`entry ${m.id}: onlyOn must be a non-empty list of platform names`);
}
const todo = only ? list.filter((m) => m.id === only) : list;
const here = (m) => !m.onlyOn || m.onlyOn.includes(process.platform);
if (!todo.length) usage(`no mutant with id ${only}`);

const T = mkdtempSync(join(tmpdir(), "chicla-mutants-"));
const work = join(T, "pkg"), priv = join(T, "tmp");
mkdirSync(priv);
cpSync(pkg, work, { recursive: true, filter: (p) => !/(^|[\\/])node_modules([\\/]|$)/.test(p) });
const runTests = (files) => spawnSync(process.execPath, ["--test", ...files], { cwd: work, encoding: "utf8", timeout, killSignal: "SIGKILL", env: { ...process.env, CHICLA_MUTANT_RUN: "1", TMPDIR: priv, TMP: priv, TEMP: priv } }); // a private TMPDIR: a mutant that leaks temp files (A1) leaks them into the folder removed at the end
const finish = (code) => { rmSync(T, { recursive: true, force: true }); process.exit(code); };

// Baseline: the same tests, nothing changed. Red here means the run proves nothing.
const files = [...new Set(todo.filter(here).flatMap((m) => m.tests))];
const progress = (line) => console.error(`mutants: ${line}`);
progress(`baseline: ${files.length} test file(s), ${todo.length} mutant(s) to judge`);
const t0 = Date.now(), base = runTests(files);
if (base.status !== 0) {
  console.log(`baseline FAILED (${base.error ? base.error.code ?? base.error.message : `exit ${base.status}`}): the tests are red or hang without any mutation; nothing was judged.`);
  console.log((base.stdout + base.stderr).split("\n").slice(-25).join("\n"));
  finish(2);
}
progress(`baseline ok (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

let bad = 0, i = 0;
const rows = [];
for (const m of todo) {
  const started = Date.now(); i++;
  const target = join(work, m.file);
  const original = readFileSync(target, "utf8");
  const n = original.split(m.find).length - 1;
  const row = (state, extra = "") => { rows.push(`${state.padEnd(22)}${m.id}  ${m.why}${extra}`); progress(`[${i}/${todo.length}] ${state.split(" ")[0].padEnd(8)} ${m.id}  ${((Date.now() - started) / 1000).toFixed(1)}s`); };
  if (!here(m)) { row("not run here", ` — only on ${m.onlyOn.join("/")} (this is ${process.platform}): its tests cannot go red on this file system`); continue; }
  if (n !== 1) { bad++; row("STALE", ` — «find» found ${n} times in ${m.file}, must be exactly once`); continue; }
  try {
    writeFileSync(target, original.replace(m.find, () => m.replace));
    const chk = spawnSync(process.execPath, ["--check", target], { encoding: "utf8" });
    if (chk.status !== 0) { bad++; row("INVALID", " — the mutated file does not parse (a syntax error is a fake red)"); continue; }
    const r = runTests(m.tests);
    const died = r.status !== 0; // a non-zero exit, or killed by the timeout: the tests noticed
    const how = r.error ? " (timeout)" : "";
    if (died && !m.survives) row("RED", how);
    else if (died) { bad++; row("DIED", ` — listed as surviving («${m.survives}»): the explanation is stale, remove it`); }
    else if (m.survives) row("survives (explained)", ` — ${m.survives}`);
    else { bad++; row("SURVIVED", " — no test went red"); }
  } finally { writeFileSync(target, original); }
}
console.log(rows.join("\n"));
const skipped = todo.filter((m) => !here(m)).length;
console.log(`\n${todo.length} mutant(s): ${bad ? `${bad} not as listed` : "all as listed"}${skipped ? ` (${skipped} not run on ${process.platform})` : ""}`);
finish(bad ? 1 : 0);
