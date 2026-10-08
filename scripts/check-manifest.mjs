#!/usr/bin/env node
// Guarda contra FICHEIROS PERDIDOS (o que aconteceu na sessão da ronda 196:
// uma atualização substituiu lib/devpanel/ por uma pasta parcial e 11
// módulos desapareceram sem ninguém reparar).
//
//   node scripts/check-manifest.mjs           -> verifica (falha se faltar algum ficheiro)
//   node scripts/check-manifest.mjs --write   -> regenera FILES.manifest
//
// FILES.manifest lista o caminho de cada ficheiro-fonte do projeto. A
// verificação FALHA se um caminho listado já não existe (ficheiro perdido) e
// só AVISA se existir um ficheiro novo que não está listado (esquecimento de
// regenerar). Corre no `prebuild`. Regenerar a cada ronda, DEPOIS de todas as
// alterações e ANTES de criar o zip.
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MANIFEST = join(ROOT, "FILES.manifest");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "__MACOSX"]);
const SKIP_FILES = new Set([".DS_Store", "tsconfig.tsbuildinfo", "FILES.manifest"]);

// W2 — what NEVER enters the manifest (and therefore never a delivery zip, which is built from the manifest):
//   Python artefacts, .env secrets (not .env.example/.sample),
//   and the PRIVATE corpus: everything under corpus/real-world/ and corpus/huge/ except the .gitkeep files.
// Rules mirrored in verify-delivery-zip.mjs (privateReason); keep both in sync.
const PRIVATE_DIRS = ["corpus/real-world", "corpus/huge"];
const isPrivateFile = (rel) => PRIVATE_DIRS.some((d) => rel.startsWith(d + "/")) && !/(^|\/)\.gitkeep$/.test(rel);
const isSecretEnv = (name) => /^\.env(\..*)?$/.test(name) && !/\.(example|sample)$/.test(name);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) continue;
    const p = join(dir, name);
    const isDir = statSync(p).isDirectory();
    if (isDir && (name === ".venv" || name === "__pycache__")) continue;
    if (!isDir && (/\.pyc$/.test(name) || isSecretEnv(name))) continue;
    if (isDir) { walk(p, out); continue; }
    const rel = relative(ROOT, p).split("\\").join("/");
    if (isPrivateFile(rel)) continue;
    out.push(rel);
  }
  return out;
}

const current = walk(ROOT).sort();

if (process.argv.includes("--write")) {
  writeFileSync(MANIFEST, current.join("\n") + "\n");
  console.log(`✓ FILES.manifest escrito (${current.length} ficheiros)`);
  process.exit(0);
}

if (!existsSync(MANIFEST)) {
  console.warn("⚠ FILES.manifest não existe — corre `node scripts/check-manifest.mjs --write` para o criar.");
  process.exit(0);
}

const listed = readFileSync(MANIFEST, "utf8").split("\n").filter(Boolean);
// Round 1r: os nomes comparam-se em NFC (o manifesto escrito no macOS tem NFD; o checkout do git no Linux traz NFC).
// Só a COMPARAÇÃO é normalizada: os nomes impressos e os que `--write` grava são os verdadeiros do disco.
const nfc = (f) => f.normalize("NFC");
const have = new Set(current.map(nfc));
// The status file is renamed every round (CAIRN_PROJECT_STATUS-N.md -> -N+1, instruction 8):
// that is a deliberate rename, not a loss, as long as exactly one status file exists now.
const STATUS_RE = /^CAIRN_PROJECT_STATUS-\d+\.md$/;
const statusNow = current.filter((f) => STATUS_RE.test(f));
const lost = listed.filter((f) => !have.has(nfc(f)) && !(STATUS_RE.test(f) && statusNow.length === 1));
const listedSet = new Set(listed.map(nfc));
const added = current.filter((f) => !listedSet.has(nfc(f)));

if (added.length) console.warn(`⚠ ${added.length} ficheiro(s) novo(s) fora de FILES.manifest (regenera com node scripts/check-manifest.mjs --write):\n  ${added.slice(0, 15).join("\n  ")}`);
if (lost.length) {
  console.error(`\n✗ ${lost.length} ficheiro(s) PERDIDO(S) face a FILES.manifest:\n  ${lost.join("\n  ")}`);
  console.error("\nProvável causa: uma pasta foi substituída por uma versão parcial. Repõe estes ficheiros ANTES de continuar.\n");
  process.exit(1);
}
console.log(`✓ nenhum ficheiro perdido (${listed.length} no manifesto, ${current.length} no disco)`);
