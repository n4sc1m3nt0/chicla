#!/usr/bin/env node
// Cria o zip de entrega pela ÚNICA via segura. Ordem fixa, pára à primeira falha:
//   1. check-manifest  (contra o manifesto ANTERIOR: apanha ficheiros perdidos
//                       ANTES de o manifesto ser regenerado e os "esconder")
//   2. check-build     (node --check em todos os .mjs da árvore)
//   3. regenera FILES.manifest
//   4. zipa EXATAMENTE os ficheiros listados em FILES.manifest (+ o próprio manifesto): as exclusões
//                       (corpus privado, .env, artefactos de Python…) vivem num só sítio, check-manifest
//   5. verify-delivery-zip sobre o zip final (+ --against de cada upload dado)
//
//   node scripts/make-delivery-zip.mjs <saida.zip> [--against <upload.zip> ...] [--allow-removed <caminho> ...]
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [out, ...rest] = process.argv.slice(2);
if (!out || out.startsWith("--")) { console.error("uso: make-delivery-zip.mjs <saida.zip> [--against <zip>] [--allow-removed <caminho>]"); process.exit(2); }
const outPath = resolve(out);
const run = (script, ...a) => {
  const r = spawnSync("node", [resolve(ROOT, "scripts", script), ...a], { stdio: "inherit", cwd: ROOT });
  if (r.status !== 0) {
    // Se o zip já existe (falhou o passo 5), é um zip REPROVADO: apaga-se, para ninguém o entregar por engano.
    const hadZip = existsSync(outPath);
    if (hadZip) rmSync(outPath);
    console.error(`\n✗ ${script} falhou — entrega abortada; ${hadZip ? "o zip reprovado foi apagado." : "nenhum zip foi criado/atualizado."}`);
    process.exit(1);
  }
};

run("check-manifest.mjs");
run("check-build.mjs");
run("check-manifest.mjs", "--write");
if (existsSync(outPath)) rmSync(outPath);
const names = readFileSync(resolve(ROOT, "FILES.manifest"), "utf8").split("\n").filter(Boolean);
if (!names.includes("FILES.manifest")) names.push("FILES.manifest");
try { execFileSync("zip", ["-q", outPath, "-@"], { cwd: ROOT, input: names.join("\n") + "\n", stdio: ["pipe", "inherit", "inherit"] }); } catch (e) { if (existsSync(outPath)) rmSync(outPath); console.error(`\n✗ o comando zip falhou — entrega abortada; zip parcial apagado.`); process.exit(1); }
run("verify-delivery-zip.mjs", outPath, ...rest);
console.log(`\n✓ entrega criada e verificada: ${outPath}`);
