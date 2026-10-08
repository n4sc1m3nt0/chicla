#!/usr/bin/env node
// RECOVERY MODE — primeiro passo da sessão que recebe um despejo de emergência.
//
//   node scripts/recovery-report.mjs <cairn-EMERGENCY-….zip> [--baseline <último-zip-de-entrega.zip>] [--out <dir>]
//
// Faz, por esta ordem, sem alterar nada no despejo original:
//   1. extrai o despejo para <out> (por omissão /home/claude/recovered; se existir, acrescenta -2, -3 …);
//   2. confirma que é um despejo (RECOVERY_MARKER.json) e que não se corrompeu no caminho (sha256 de cada ficheiro);
//   3. compara a raiz do projeto com --baseline (o último zip de entrega bom). Sem baseline, usa o FILES.manifest;
//   4. verificações baratas dos ficheiros mexidos: JSON válido, `node --check` nos .mjs/.js, sintaxe dos .py (ast),
//      ficheiro vazio, chavetas/parêntesis desequilibrados em .rs/.ts/.js/.css (aviso de ficheiro possivelmente CORTADO);
//   5. corre check-manifest e check-build DENTRO da raiz recuperada (só lê);
//   6. escreve <out>/RECOVERY_DIFF.md (fora da raiz do projeto, para não a poluir) e imprime o resumo.
// NÃO cria nenhuma entrega. Depois disto: terminar o que falta e entregar com make-delivery-zip.mjs.
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const zip = argv.find((a, i) => !a.startsWith("--") && !["--baseline", "--out"].includes(argv[i - 1]));
if (!zip) { console.error("uso: recovery-report.mjs <despejo.zip> [--baseline <zip-de-entrega>] [--out <dir>]"); process.exit(2); }
const baselineZip = opt("--baseline");
let out = resolve(opt("--out") ?? "/home/claude/recovered");
for (let n = 2; existsSync(out); n++) out = resolve(opt("--out") ?? "/home/claude/recovered") + `-${n}`;
void fileURLToPath; // (mantido por consistência com os outros scripts: nunca usar URL.pathname)

const sh = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
const JUNK_DIRS = new Set(["node_modules", ".next", ".git", "__MACOSX", ".venv", "__pycache__"]);
// W3: mesmas exclusões do W2 / do despejo — segredos .env (não .example/.sample), *.pyc, corpus privado (menos .gitkeep)
const isJunk = (n) => n === ".DS_Store" || n.endsWith(".tsbuildinfo") || n.endsWith(".pyc") || (/^\.env(\..*)?$/.test(n) && !/\.(example|sample)$/.test(n));
const isPrivate = (rel) => /(^|\/)corpus\/(real-world|huge)\//.test(rel) && !/(^|\/)\.gitkeep$/.test(rel);

// Ronda 1s: comparar nomes em NFC (macOS = NFD, Linux = NFC); imprimir sempre o nome verdadeiro do disco.
const nfc = (p) => p.normalize("NFC");

// Devolve { h: {nome NFC -> sha256}, names: {nome NFC -> nome verdadeiro}, collisions: ["a ≈ b", …], collideKeys: Set }.
function hashTree(root) {
  const res = {}, names = {}, collisions = [], collideKeys = new Set();
  const go = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!JUNK_DIRS.has(e.name)) go(p); continue; }
      if (e.isFile() && !isJunk(e.name) && !isPrivate(relative(root, p))) {
        const real = relative(root, p), k = nfc(real);
        if (k in res) { collisions.push(`${names[k]} ≈ ${real}`); collideKeys.add(k); continue; } // fica o primeiro; o aviso lista os dois
        res[k] = createHash("sha256").update(readFileSync(p)).digest("hex"); names[k] = real;
      }
    }
  };
  go(root);
  return { h: res, names, collisions, collideKeys };
}

// 1. Extrair
mkdirSync(out, { recursive: true });
let r = zip.endsWith(".tar.gz") ? sh("tar", ["-xzf", resolve(zip), "-C", out]) : sh("unzip", ["-q", resolve(zip), "-d", out]);
if (r.status !== 0 && r.status !== 1) { console.error(`✗ não consegui extrair ${zip}:\n${r.stderr}`); process.exit(1); }

// 2. Marcador
const markerPath = join(out, "RECOVERY_MARKER.json");
if (!existsSync(markerPath)) { console.error("✗ isto NÃO é um despejo de emergência (falta RECOVERY_MARKER.json). Se for uma entrega normal, usar o fluxo normal (instrução 11)."); process.exit(1); }
const marker = JSON.parse(readFileSync(markerPath, "utf8"));
if (marker.format !== "cairn-recovery-v1") console.warn(`! formato de marcador desconhecido: ${marker.format}`);
if (marker.projectRootRel === null || marker.projectRootRel === undefined) { console.error("✗ o despejo não encontrou nenhuma raiz de projeto (package.json + FILES.manifest). Ver RECOVERY_REPORT.md; os ficheiros estão em " + join(out, "work")); process.exit(1); }
const root = join(out, "work", marker.projectRootRel);
const lines = [];
const say = (s = "") => { lines.push(s); console.log(s); };

say(`# RECOVERY DIFF — ${new Date().toISOString()}`);
say(`- Despejo: ${zip.split("/").pop()} (criado ${marker.created})`);
say(`- Nota da sessão anterior: ${marker.note ? `**${marker.note}**` : "(sem nota)"}`);
say(`- Estado declarado: última ronda no CHANGELOG ${marker.afterRound}, ${marker.statusFile}, APP_VERSION ${marker.appVersion}`);
say(`- Raiz do projeto recuperada: ${root}`);
say(`- Extraído para: ${out}`);

// 2b. Integridade do transporte
const nowT = hashTree(root);
const now = nowT.h;
// chaves do marcador em NFC (um sistema que renormaliza nomes não pode dar falso "zip corrompido"); colisões ficam fora desta verificação
const mh = {}, mNames = {}, mCollide = new Set();
for (const [k, v] of Object.entries(marker.hashes)) { const nk = nfc(k); if (nk in mh) mCollide.add(nk); else { mh[nk] = v; mNames[nk] = k; } }
const skipInt = (k) => mCollide.has(k) || nowT.collideKeys.has(k);
const changedInTransit = Object.keys(mh).filter((p) => !skipInt(p) && now[p] !== mh[p]);
const unhashed = Object.keys(now).filter((p) => !(p in mh));
say(`\n## Integridade do zip`);
say(changedInTransit.length ? `✗ ${changedInTransit.length} ficheiro(s) diferem do que foi despejado (zip corrompido ou editado): ${changedInTransit.slice(0, 15).map((k) => nowT.names[k] ?? mNames[k]).join(", ")}` : `✓ ${Object.keys(marker.hashes).length} ficheiros conferem com o sha256 do despejo.`);
if (unhashed.length) say(`  (${unhashed.length} ficheiro(s) sem hash no marcador — normal se o limite de hash foi atingido)`);

// 3. Comparação
let added = [], modified = [], removed = [];
let against;
let baseCollisions = [];
if (baselineZip) {
  const tmp = mkdtempSync(join(tmpdir(), "cairn-baseline-"));
  const ub = sh("unzip", ["-q", resolve(baselineZip), "-d", tmp]);
  if (ub.status !== 0 && ub.status !== 1) { console.error(`✗ não consegui extrair o baseline:\n${ub.stderr}`); process.exit(1); }
  let base = tmp;
  const top = readdirSync(tmp).filter((n) => n !== "__MACOSX");
  if (!existsSync(join(tmp, "package.json")) && top.length === 1 && statSync(join(tmp, top[0])).isDirectory()) base = join(tmp, top[0]); // zip embrulhado
  const baseT = hashTree(base);
  const bh = baseT.h;
  baseCollisions = baseT.collisions;
  rmSync(tmp, { recursive: true, force: true });
  const isStatus = (p) => /^CAIRN_PROJECT_STATUS-\d+\.md$/.test(p);
  // as chaves são NFC; as listas levam o nome verdadeiro (do despejo para novos/modificados, do baseline para os em falta)
  added = Object.keys(now).filter((p) => !(p in bh)).map((k) => nowT.names[k]);
  modified = Object.keys(now).filter((p) => p in bh && bh[p] !== now[p]).map((k) => nowT.names[k]);
  removed = Object.keys(bh).filter((p) => !(p in now) && !isStatus(p)).map((k) => baseT.names[k]);
  against = `baseline ${baselineZip.split("/").pop()} (${Object.keys(bh).length} ficheiros)`;
} else {
  const man = existsSync(join(root, "FILES.manifest")) ? readFileSync(join(root, "FILES.manifest"), "utf8").split("\n").filter(Boolean) : [];
  const ms = new Set(man.map(nfc));
  added = Object.keys(now).filter((p) => !ms.has(p) && p !== "FILES.manifest").map((k) => nowT.names[k]);
  removed = man.filter((p) => !(nfc(p) in now));
  against = "FILES.manifest recuperado (sem baseline: não deteta ficheiros MODIFICADOS — passar --baseline <último zip de entrega>)";
}
const list = (arr) => (arr.length ? arr.slice(0, 120).map((p) => `- ${p}`).join("\n") + (arr.length > 120 ? `\n- … (+${arr.length - 120})` : "") : "- (nenhum)");
say(`\n## Comparação com ${against}`);
say(`### Modificados (${modified.length})\n${list(modified)}`);
say(`### Novos (${added.length})\n${list(added)}`);
say(`### EM FALTA face à base (${removed.length}) — rever um a um: apagados de propósito ou perdidos?\n${list(removed)}`);
const collisions = [...nowT.collisions.map((c) => `despejo: ${c}`), ...baseCollisions.map((c) => `baseline: ${c}`)];
if (collisions.length) say(`\n## ⚠ Nomes que só diferem em NFC/NFD (${collisions.length} colisão(ões))\nCada par conta como um só ficheiro nas comparações acima (só o primeiro foi comparado); rever à mão.\n${list(collisions)}`);

// 4. Verificações baratas dos ficheiros mexidos
say(`\n## Verificações baratas dos ficheiros novos/modificados`);
const problems = [];
for (const p of [...modified, ...added]) {
  const full = join(root, p);
  let text; try { text = readFileSync(full, "utf8"); } catch { continue; }
  if (text.length === 0) { problems.push(`${p}: ficheiro VAZIO`); continue; }
  if (p.endsWith(".json")) { try { JSON.parse(text); } catch (e) { problems.push(`${p}: JSON inválido (${e.message.slice(0, 60)})`); } }
  if (/\.(mjs|js)$/.test(p) && !p.startsWith("public/")) { const c = sh("node", ["--check", full]); if (c.status !== 0) problems.push(`${p}: node --check falhou (${(c.stderr.split("\n").find((l) => /Error/.test(l)) ?? "").slice(0, 80)})`); }
  if (p.endsWith(".py")) { const c = sh("python3", ["-c", "import ast,sys; ast.parse(open(sys.argv[1], encoding='utf-8').read())", full]); if (c.error) { /* sem python3: sem verificação */ } else if (c.status !== 0) problems.push(`${p}: sintaxe Python inválida (${(c.stderr.trim().split("\n").pop() ?? "").slice(0, 80)})`); }
  if (/\.(rs|ts|tsx|mjs|js|css)$/.test(p)) {
    const count = (re) => (text.match(re) ?? []).length;
    const d = [["{", "}", count(/\{/g) - count(/\}/g)], ["(", ")", count(/\(/g) - count(/\)/g)], ["[", "]", count(/\[/g) - count(/\]/g)]].filter((x) => x[2] !== 0);
    if (d.length) problems.push(`${p}: possivelmente CORTADO — ${d.map((x) => `${x[0]}${x[1]} desequilibrado (${x[2] > 0 ? "+" : ""}${x[2]})`).join(", ")} (heurística: pode ser falso alarme)`);
  }
}
say(problems.length ? problems.map((x) => `- ⚠ ${x}`).join("\n") : "- ✓ nada suspeito (JSON, node --check, chavetas).");

// 5. Guardas do projeto (só leem)
say(`\n## Guardas do projeto, corridas na raiz recuperada`);
for (const s of ["check-manifest.mjs", "check-build.mjs"]) {
  if (!existsSync(join(root, "scripts", s))) { say(`- ${s}: não existe no despejo`); continue; }
  const g = sh("node", [join(root, "scripts", s)], root);
  const outp = ((g.stdout ?? "") + (g.stderr ?? "")).trim().split("\n").slice(-12).join("\n");
  say(`- ${s}: ${g.status === 0 ? "✓ passou" : "✗ FALHOU (esperado se o trabalho ficou a meio — a lista diz o que falta)"}\n\`\`\`\n${outp}\n\`\`\``);
}

writeFileSync(join(out, "RECOVERY_DIFF.md"), lines.join("\n") + "\n");
console.log(`\n✓ relatório completo: ${join(out, "RECOVERY_DIFF.md")}\n✓ raiz do projeto recuperada (trabalhar aqui): ${root}`);
console.log(`\nPRÓXIMO: ler a nota acima, concluir só o que ficou a meio, depois\n  cd "${root}" && node scripts/make-delivery-zip.mjs <saida.zip> --against <último zip de entrega>\n(instrução 17: ENTREGAR primeiro; não começar tarefas novas nesta sessão.)`);
