#!/usr/bin/env node
// C24.3 (AUDIT-8 F-4): install the packed `chicla` tarball ALONE (offline, in an empty folder, nothing else) and drive it as a user would:
// init, bump-round --verify, make-delivery, verify-delivery, dump, the RECOVER/ files in the dump, recovery, chicla-zip, and `import "chicla/zip"`.
// It never publishes and never touches the repository: everything happens in a temp folder, removed at the end.
//   node scripts/smoke-test-tarball.mjs [--tarball <file.tgz>] [--json]
// With no --tarball it builds and packs the package of this tree (build-chicla.mjs, pack-release.mjs). Every step runs even if an earlier one failed, so one
// run shows all that is broken. Exit 0 all steps ok · 1 a step failed or the tarball could not be made or read · 2 usage. With --json stdout is exactly one line.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { failureReason } from "./failure-reason.mjs";
import { winLine } from "./win-quote.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const WIN = process.platform === "win32";
const argv = process.argv.slice(2);
const json = argv.includes("--json");
const finish = (code, obj, text) => { process.stdout.write(json ? `${JSON.stringify(obj)}\n` : text); process.exit(code); };
const usage = (m) => finish(2, { ok: false, error: { code: "EUSAGE", message: m } }, `✗ ${m}\nusage: smoke-test-tarball.mjs [--tarball <file.tgz>] [--json]\n`);
const refuse = (code, m) => finish(1, { ok: false, error: { code, message: m } }, `✗ ${code}: ${m}\n`);

let tarball;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--json") continue;
  if (a === "--tarball") { tarball = argv[++i]; if (!tarball || tarball.startsWith("--")) usage("--tarball needs a file"); }
  else usage(`unknown option ${a}`);
}

const T = mkdtempSync(join(tmpdir(), "chicla-tarball-"));
process.on("exit", () => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 })); // finish() ends the process
const sh = { cmd: true }; // npm and the .bin shims are .cmd files: on Windows only a shell starts them (C25.1)
// With `sh` on Windows ONE quoted command line goes to the shell (winLine); an argument array with shell: true is not quoted by Node, so a path with a space split (AUDIT-9 F-1).
const run = (cmd, args, cwd, opts = {}) => (opts.cmd && WIN ? spawnSync(winLine(cmd, args), { cwd, encoding: "utf8", maxBuffer: 1 << 26, shell: true }) : spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 26 }));
const node = (args, cwd) => run(process.execPath, args, cwd);
const reason = (r) => { try { const e = JSON.parse(String(r.stdout).trim().split("\n").pop()).error; if (e?.code) return `${e.code}: ${e.message}`; } catch { /* not JSON: say what failed, from what it printed */ } return failureReason(r.stderr || r.stdout || r.error?.message); };

if (tarball) {
  tarball = resolve(tarball);
  if (!existsSync(tarball)) refuse("ETARBALL", `no such file: ${tarball}`);
} else {
  const b = node([join(ROOT, "scripts", "build-chicla.mjs"), "--out", join(T, "stage")], ROOT);
  if (b.status !== 0) refuse("ETARBALL", `build-chicla failed (exit ${b.status}): ${reason(b)}`);
  const p = node([join(ROOT, "scripts", "pack-release.mjs"), join(T, "stage", "chicla"), "--out", join(T, "dist"), "--json"], ROOT);
  if (p.status !== 0) refuse("ETARBALL", `pack-release failed (exit ${p.status}): ${reason(p)}`);
  tarball = join(T, "dist", JSON.parse(p.stdout).file);
}

// An empty project folder with nothing but the tarball installed in it, offline.
const proj = join(T, "proj");
mkdirSync(proj);
run("npm", ["init", "-y"], proj, sh);
const inst = run("npm", ["install", "--offline", "--no-audit", "--no-fund", "--ignore-scripts", tarball], proj, sh);
if (inst.status !== 0) refuse("EINSTALL", `npm install of the tarball failed (exit ${inst.status}): ${failureReason(inst.stderr || inst.stdout || inst.error?.message)}`);
const installed = readdirSync(join(proj, "node_modules")).filter((n) => !n.startsWith("."));
const bin = (n, args, cwd = proj) => run(join(proj, "node_modules", ".bin", n + (WIN ? ".cmd" : "")), args, cwd, sh);

const fresh = join(T, "fresh"), outDir = join(T, "out"), dumpDir = join(outDir, "dump");
mkdirSync(fresh);
mkdirSync(dumpDir, { recursive: true });
const steps = [];
const step = (name, fn) => {
  let ok = false, why = "";
  try { const r = fn(); ok = r === true; why = ok ? "" : String(r); } catch (e) { why = String(e?.message ?? e).split("\n")[0]; }
  steps.push({ name, ok, ...(ok ? {} : { why }) });
};
const exit0 = (r, what) => (r.status === 0 ? true : `${what} exited ${r.status}: ${failureReason(r.stderr || r.stdout || r.error?.message)}`);
const dumpZip = () => { const z = readdirSync(dumpDir).filter((f) => f.endsWith(".zip")); return z.length === 1 ? join(dumpDir, z[0]) : null; };

step("init", () => { const r = bin("chicla", ["init", "--root", fresh]); return r.status !== 0 ? exit0(r, "init") : existsSync(join(fresh, "CLAUDE.md")) && existsSync(join(fresh, "FILES.manifest")) && existsSync(join(fresh, "package.json")) ? true : "init wrote no CLAUDE.md, FILES.manifest or package.json"; });
step("bump-round-verify", () => exit0(bin("chicla", ["bump-round", "--verify", "--root", fresh]), "bump-round --verify"));
const delivery = join(outDir, "fresh-delivery.zip");
step("make-delivery", () => exit0(bin("chicla", ["make-delivery", delivery, "--root", fresh]), "make-delivery"));
step("verify-delivery", () => exit0(bin("chicla", ["verify-delivery", delivery, "--root", fresh]), "verify-delivery"));
step("dump", () => { const r = bin("chicla", ["dump", "--outdir", dumpDir, "smoke"], fresh); return r.status !== 0 ? exit0(r, "dump") : dumpZip() ? true : "no single dump zip"; });
step("dump-has-recover", () => {
  const z = dumpZip();
  if (!z) return "no dump zip";
  const x = join(outDir, "dump-extracted");
  const r = bin("chicla-zip", ["extract", z, x]);
  if (r.status !== 0) return exit0(r, "chicla-zip extract");
  const names = Object.keys(JSON.parse(readFileSync(join(x, "RECOVERY_MARKER.json"), "utf8")).toolchain ?? {});
  if (names.length < 5) return `the marker lists ${names.length} toolchain files, not 5`;
  const gone = names.filter((n) => !existsSync(join(x, n)));
  return gone.length ? `not in the dump: ${gone.join(", ")}` : true; // the 0.2.0 dump had no RECOVER/ at all (F-2)
});
step("recovery", () => {
  const z = dumpZip();
  if (!z) return "no dump zip";
  const rec = join(outDir, "recovered");
  const r = bin("chicla", ["recovery", z, "--out", rec], fresh);
  if (r.status !== 0) return exit0(r, "recovery"); // 0.2.0: ECOMMAND_LOAD, ERR_MODULE_NOT_FOUND (F-1)
  return existsSync(join(rec, "work", "CLAUDE.md")) ? true : "recovery restored no project root";
});
step("chicla-zip", () => {
  const z = join(outDir, "fresh.zip");
  const c = bin("chicla-zip", ["create", z, fresh]);
  if (c.status !== 0) return exit0(c, "chicla-zip create");
  const l = bin("chicla-zip", ["ls", z, "--json"]);
  return l.status === 0 && l.stdout.includes("CLAUDE.md") ? true : "chicla-zip ls does not list the project";
});
step("chicla-zip-library", () => {
  writeFileSync(join(proj, "probe.mjs"), 'import * as z from "chicla/zip"; process.stdout.write([typeof z.writeZip, typeof z.extractZip].join(" "));');
  const r = node(["probe.mjs"], proj);
  return r.status === 0 && r.stdout === "function function" ? true : `import "chicla/zip": ${failureReason(r.stderr || r.stdout)}`;
});

const ok = steps.every((s) => s.ok);
finish(ok ? 0 : 1, { ok, tarball: basename(tarball), installed, steps }, `${steps.map((s) => `${s.ok ? "✓" : "✗"} ${s.name}${s.ok ? "" : `: ${s.why}`}`).join("\n")}\n${ok ? "tarball smoke: ok" : "tarball smoke: FAILED"} (${basename(tarball)}, installed alone: ${installed.join(", ")})\n`);
