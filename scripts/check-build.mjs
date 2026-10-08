#!/usr/bin/env node
// Guarda de compilação: uma entrega não sai se algum ficheiro .mjs deixou de passar `node --check`.
//
//   node scripts/check-build.mjs
//
// - Percorre a árvore (sem node_modules, .git, __MACOSX) e corre `node --check` em cada .mjs.
// - Sai com 1 e nomeia os ficheiros que falharam; sai com 0 se todos passam.
// - Não corre os testes: `npm test` e `npm run smoke` continuam a ser um passo da ronda (e da CI).
// Substitui o `cargo check` do workflow original: Node está sempre presente (os próprios scripts correm nele), por isso
// não há caminho de «compilação NÃO verificada».
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

console.log(`node --check em ${files.length} ficheiros .mjs`);
const bad = [];
for (const f of files) {
  const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
  if (r.status !== 0) bad.push(`${relative(ROOT, f).split("\\").join("/")}: ${(r.stderr.split("\n").find((l) => /Error/.test(l)) ?? "").slice(0, 100)}`);
}
if (bad.length) { console.error(`\n✗ node --check falhou em ${bad.length} ficheiro(s). Entrega abortada.\n  ${bad.join("\n  ")}`); process.exit(1); }
console.log("✓ node --check passou");
