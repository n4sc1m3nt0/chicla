#!/usr/bin/env node
// B4 / C2.3: 20 000 small files, extractZip against `unzip`. Not part of `npm test` (timings are noisy); the `bench` job of CI runs it (C5.4).
//   node packages/chicla-zip/bench/small-files.mjs [--files N] [--runs N] [--budget X]
// Prints the best of N runs for each and the ratio; with --budget it exits 1 when the ratio is above X (the roadmap budget is 3, D15). Exit 2: bad usage (an unreadable number never means «no budget»).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { extractZip } from "../src/zipkit.mjs";

const usage = (m) => { console.error(`usage: small-files.mjs [--files N] [--runs N] [--budget X] (${m})`); process.exit(2); };
// strict: a flag with a missing, non-numeric or non-positive value is an error, never a silent default (a bad --budget must not turn the gate off)
const arg = (k, d, int) => { const i = process.argv.indexOf(`--${k}`); if (i < 0) return d; const v = process.argv[i + 1]; if (v === undefined || !/^\d+(\.\d+)?$/.test(v) || !(Number(v) > 0) || (int && !Number.isInteger(Number(v)))) usage(`--${k} needs a positive ${int ? "whole " : ""}number`); return Number(v); };
const files = arg("files", 20000, true), runs = arg("runs", 3, true), budget = arg("budget", 0);
const work = mkdtempSync(join(tmpdir(), "chicla-bench-")), src = join(work, "src"), zip = join(work, "b4.zip");
try {
  const dirs = Math.max(1, Math.round(files / 100));
  for (let d = 0; d < dirs; d++) { mkdirSync(join(src, `d${d}`), { recursive: true }); for (let f = 0; f < files / dirs; f++) writeFileSync(join(src, `d${d}`, `f${f}.txt`), `file ${d}/${f}\n`.repeat(20 + ((d * f) % 30))); }
  const z = spawnSync("zip", ["-qr", zip, "."], { cwd: src }); if (z.status !== 0) { console.error("needs the `zip` command"); process.exit(2); }
  const best = async (fn) => { let b = Infinity; for (let i = 0; i < runs; i++) { const out = join(work, `out${i}`); const t = process.hrtime.bigint(); await fn(out); b = Math.min(b, Number(process.hrtime.bigint() - t) / 1e9); rmSync(out, { recursive: true, force: true }); } return b; };
  const tUnzip = await best((out) => { const r = spawnSync("unzip", ["-q", zip, "-d", out]); if (r.status !== 0) throw new Error("unzip failed"); });
  const tChicla = await best((out) => extractZip(zip, out));
  const ratio = tChicla / tUnzip;
  console.log(`${files} files · unzip ${tUnzip.toFixed(2)} s · extractZip ${tChicla.toFixed(2)} s · ratio ${ratio.toFixed(1)}x (best of ${runs}, node ${process.version})`);
  if (budget && ratio > budget) { console.error(`over the budget of ${budget}x`); process.exitCode = 1; }
} finally { rmSync(work, { recursive: true, force: true }); }
