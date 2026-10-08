#!/usr/bin/env node
// B4 / C2.3: 20 000 small files, extractZip against `unzip`. Not part of `npm test` (timings are noisy); C5.4 will wire it into CI.
//   node packages/cairn-zip/bench/small-files.mjs [--files N] [--runs N] [--budget X]
// Prints the best of N runs for each and the ratio; with --budget it exits 1 when the ratio is above X (the roadmap budget is 2).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { extractZip } from "../src/zipkit.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const files = arg("files", 20000), runs = arg("runs", 3), budget = arg("budget", 0);
const work = mkdtempSync(join(tmpdir(), "cairn-bench-")), src = join(work, "src"), zip = join(work, "b4.zip");
try {
  const dirs = Math.max(1, Math.round(files / 100));
  for (let d = 0; d < dirs; d++) { mkdirSync(join(src, `d${d}`), { recursive: true }); for (let f = 0; f < files / dirs; f++) writeFileSync(join(src, `d${d}`, `f${f}.txt`), `file ${d}/${f}\n`.repeat(20 + ((d * f) % 30))); }
  const z = spawnSync("zip", ["-qr", zip, "."], { cwd: src }); if (z.status !== 0) { console.error("needs the `zip` command"); process.exit(2); }
  const best = async (fn) => { let b = Infinity; for (let i = 0; i < runs; i++) { const out = join(work, `out${i}`); const t = process.hrtime.bigint(); await fn(out); b = Math.min(b, Number(process.hrtime.bigint() - t) / 1e9); rmSync(out, { recursive: true, force: true }); } return b; };
  const tUnzip = await best((out) => { const r = spawnSync("unzip", ["-q", zip, "-d", out]); if (r.status !== 0) throw new Error("unzip failed"); });
  const tCairn = await best((out) => extractZip(zip, out));
  const ratio = tCairn / tUnzip;
  console.log(`${files} files · unzip ${tUnzip.toFixed(2)} s · extractZip ${tCairn.toFixed(2)} s · ratio ${ratio.toFixed(1)}x (best of ${runs}, node ${process.version})`);
  if (budget && ratio > budget) { console.error(`over the budget of ${budget}x`); process.exitCode = 1; }
} finally { rmSync(work, { recursive: true, force: true }); }
