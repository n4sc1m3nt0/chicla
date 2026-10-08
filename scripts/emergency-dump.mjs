#!/usr/bin/env node
// COMANDO DE EMERGÊNCIA (/dump) — despeja o diretório de trabalho INTEIRO num zip, já.
//
//   node scripts/emergency-dump.mjs ["nota curta: o que estava a fazer / o que falta"]
//
// Para quando o limite de ferramentas é atingido perto do limite de utilização: o trabalho
// já está feito mas inacessível. Este script NÃO é uma entrega:
//   - NÃO corre guardas (check-manifest, check-imports, verify-delivery-zip). Uma árvore a
//     meio falharia nelas e o zip nunca seria criado — o oposto do que se quer aqui.
//   - NÃO regenera o FILES.manifest, NÃO toca em nenhum ficheiro do projeto (só lê).
//   - NÃO falha por causa do relatório: qualquer erro ao gerar o relatório é registado dentro
//     do próprio zip e o zip é criado na mesma. A única falha possível é o próprio `zip`.
//
// Conteúdo do zip (com pasta `work/` e `outputs/`, de propósito: NÃO cola na raiz do projeto):
//   RECOVERY_MARKER.json   marcador + sha256 de cada ficheiro do projeto (lido por recovery-report.mjs)
//   RECOVERY_REPORT.md     o que está no zip, o que mudou desde a última entrega, a nota
//   work/…                 o diretório de trabalho (/home/claude) tal como está
//   outputs/…              ficheiros (não .zip) que já estavam em /mnt/user-data/outputs
// Exclui apenas o que nunca é trabalho: node_modules, .next, .git, __MACOSX, .DS_Store,
// tsbuildinfo, caches npm, ficheiros .zip (entregas já feitas), segredos .env / .env.* (não os
// .example/.sample) e — W3, as mesmas regras do W2 — .venv/,
// __pycache__/, *.pyc e tudo em corpus/real-world/ e corpus/huge/ (menos os .gitkeep): o corpus
// privado NUNCA entra num zip, nem de despejo. O relatório só conta esses ficheiros, não os nomeia.
// Raiz do projeto = pasta com package.json + FILES.manifest. Limite conhecido: no fallback tar.gz
// (só se o `zip` não existir) os .gitkeep/.env.example das pastas excluídas não são repostos.
//
// Opções (só para testes): --work <dir>  --outdir <dir>  --no-outputs
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (name) => argv.includes(name);
const note = argv.filter((a, i) => !a.startsWith("--") && !["--work", "--outdir"].includes(argv[i - 1])).join(" ").trim();

const SCRIPT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url))); // nunca URL.pathname (round 198)
const WORK = resolve(opt("--work") ?? (existsSync("/home/claude") ? "/home/claude" : SCRIPT_ROOT));
const OUTDIR = resolve(opt("--outdir") ?? (existsSync("/mnt/user-data/outputs") ? "/mnt/user-data/outputs" : join(WORK, "outputs")));
mkdirSync(OUTDIR, { recursive: true });

const EXCLUDE_DIRS = new Set(["node_modules", ".next", ".git", "__MACOSX", ".npm-global", ".cache", ".npm", ".venv", "__pycache__"]);
const isKeptEnv = (n) => /^\.env(\..*)?$/.test(n) && /\.(example|sample)$/.test(n); // regra do W2: .env.example/.sample não são segredos
const skipFile = (n) => n === ".DS_Store" || n.endsWith(".tsbuildinfo") || n.endsWith(".zip") || n.endsWith(".pyc") || ((n === ".env" || n.startsWith(".env.")) && !isKeptEnv(n)); // segredos nunca entram num despejo
const PRIVATE_RE = /(^|\/)corpus\/(real-world|huge)\//; // corpus privado (W2); os .gitkeep ficam
const isPrivate = (rel) => PRIVATE_RE.test(rel) && !/(^|\/)\.gitkeep$/.test(rel);
let privateSkipped = 0;
const errors = [];
const safe = (what, fn, fallback) => { try { return fn(); } catch (e) { errors.push(`${what}: ${e.message}`); return fallback; } };

// Percorre uma árvore (sem seguir symlinks), devolve [{rel, size, mtime}] e os .zip excluídos.
function walk(root, prefix) {
  const files = [], zips = [];
  const go = (dir) => {
    let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch (e) { errors.push(`ler ${dir}: ${e.message}`); return; }
    for (const e of ents) {
      const p = join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (EXCLUDE_DIRS.has(e.name)) continue;
        go(p); continue;
      }
      if (!e.isFile()) continue;
      let st; try { st = statSync(p); } catch { continue; }
      if (e.name.endsWith(".zip")) { zips.push({ rel: relative(root, p), size: st.size }); continue; }
      if (skipFile(e.name)) continue;
      if (isPrivate(relative(root, p))) { privateSkipped++; continue; }
      files.push({ rel: relative(root, p), size: st.size, mtime: st.mtimeMs });
    }
  };
  go(root);
  return { files, zips };
}

const workScan = safe("walk work", () => walk(WORK, "work"), { files: [], zips: [] });
const outScan = flag("--no-outputs") || resolve(OUTDIR).startsWith(WORK + "/") ? { files: [], zips: [] } : safe("walk outputs", () => walk(OUTDIR, "outputs"), { files: [], zips: [] });

// Raiz(es) de projeto: pastas (até 3 níveis) com package.json + FILES.manifest. Fica a mais rasa / mais recente.
const projectRoots = [];
for (const f of workScan.files) {
  if (!f.rel.endsWith("FILES.manifest")) continue;
  const dir = f.rel === "FILES.manifest" ? "" : f.rel.slice(0, -"/FILES.manifest".length);
  if (dir.split("/").length > 3) continue;
  if (workScan.files.some((g) => g.rel === (dir ? `${dir}/package.json` : "package.json"))) projectRoots.push({ dir, depth: dir ? dir.split("/").length : 0, mtime: f.mtime });
}
projectRoots.sort((a, b) => a.depth - b.depth || b.mtime - a.mtime);
const project = projectRoots[0] ?? null;
const inProject = (rel) => project && (project.dir === "" ? true : rel.startsWith(project.dir + "/"));
const projRel = (rel) => (project && project.dir ? rel.slice(project.dir.length + 1) : rel);
const projectFiles = project ? workScan.files.filter((f) => inProject(f.rel)) : [];
const scratchFiles = workScan.files.filter((f) => !inProject(f.rel));

// Hashes (só do projeto; limite de segurança para não demorar numa pasta enorme).
const hashes = {};
let hashedBytes = 0;
for (const f of projectFiles) {
  if (hashedBytes > 300e6) break;
  safe(`hash ${f.rel}`, () => { hashes[projRel(f.rel)] = createHash("sha256").update(readFileSync(join(WORK, f.rel))).digest("hex"); hashedBytes += f.size; });
}

// Metadados do projeto.
const readP = (p) => (project ? safe(`ler ${p}`, () => readFileSync(join(WORK, project.dir, p), "utf8"), "") : "");
const changelog = readP("CHANGELOG.md");
const afterRound = (changelog.match(/^## Round (\S+)/m) ?? [])[1] ?? "desconhecido";
const fpSeq = (changelog.split("\n", 1)[0].match(/seq=(\d+)/) ?? [])[1] ?? "?";
const statusFile = projectFiles.map((f) => projRel(f.rel)).find((r) => /^CAIRN_PROJECT_STATUS-\d+\.md$/.test(r)) ?? "(não encontrado)";
const appVersion = (() => { try { return JSON.parse(readP("package.json")).version ?? "?"; } catch { return "?"; } })(); // versão da app = "version" do package.json da raiz (D13)
const manifestPath = project ? join(WORK, project.dir, "FILES.manifest") : null;
const manifestList = manifestPath && existsSync(manifestPath) ? safe("manifest", () => readFileSync(manifestPath, "utf8").split("\n").filter(Boolean), []) : [];
const manifestMtime = manifestPath && existsSync(manifestPath) ? statSync(manifestPath).mtimeMs : 0;
// comparar em NFC (manifesto do macOS = NFD; disco do Linux = NFC); imprimir os nomes verdadeiros
const nfc = (p) => p.normalize("NFC");
const diskNames = projectFiles.map((f) => projRel(f.rel));
const onDisk = new Set(diskNames.map(nfc));
const manifestSet = new Set(manifestList.map(nfc));
const lostVsManifest = manifestList.filter((p) => !onDisk.has(nfc(p)));
const newVsManifest = diskNames.filter((p) => !manifestSet.has(nfc(p)) && p !== "FILES.manifest");
if (onDisk.size !== diskNames.length) errors.push("nomes que só diferem em NFC/NFD: " + (diskNames.length - onDisk.size) + " colisão(ões)");
const touched = projectFiles.filter((f) => manifestMtime && f.mtime > manifestMtime + 2000).sort((a, b) => b.mtime - a.mtime);
const newest = [...projectFiles].sort((a, b) => b.mtime - a.mtime).slice(0, 40);

const now = new Date();
const iso = now.toISOString();
const stamp = iso.replace(/[-:]/g, "").replace("T", "-").slice(0, 15); // YYYYMMDD-HHMMSS
const day = iso.slice(0, 10);
const zipName = `cairn-EMERGENCY-afterRound${afterRound}-${day}-${stamp.slice(9)}.zip`;

const cap = (arr, n) => (arr.length > n ? [...arr.slice(0, n), `… (+${arr.length - n})`] : arr);
const kb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const when = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z";

const marker = {
  format: "cairn-recovery-v1",
  created: iso,
  note: note || null,
  workRoot: WORK,
  projectRootRel: project ? project.dir : null,
  afterRound, statusFile, changelogSeq: fpSeq, appVersion,
  projectFileCount: projectFiles.length,
  hashes,
  reportErrors: errors,
};

const report = `# RECOVERY — despejo de emergência (NÃO é uma entrega)

- Criado: ${iso}
- Nota da sessão que despejou: ${note ? `**${note}**` : "_(sem nota)_"}
- Estado do projeto no despejo: última ronda no CHANGELOG = **${afterRound}**, ficheiro de estado \`${statusFile}\`, CHANGELOG seq=${fpSeq}, APP_VERSION ${appVersion}.
- Projeto: \`work/${project ? project.dir || "(raiz de work/)" : "?? (nenhuma pasta com package.json + FILES.manifest)"}\` — ${projectFiles.length} ficheiros.

**Este zip NÃO passou por nenhuma guarda**, pode ter ficheiros a meio e NÃO se cola na raiz do projeto
(tem as pastas \`work/\` e \`outputs/\`). Para o usar: enviar à sessão seguinte e dizer "recovery mode"
(instrução 17 do ficheiro de estado), idealmente junto com o ÚLTIMO zip de entrega bom.

## Mudanças prováveis desta sessão (mtime posterior ao FILES.manifest da última entrega)
${touched.length ? cap(touched.map((f) => `- ${projRel(f.rel)}  (${when(f.mtime)}, ${kb(f.size)})`), 80).join("\n") : "- (nenhum — ou os relógios não ajudam; ver as listas abaixo)"}

## Ficheiros no disco que NÃO estão no FILES.manifest (novos desde a última entrega)
${newVsManifest.length ? cap(newVsManifest.map((p) => `- ${p}`), 80).join("\n") : "- (nenhum)"}

## Ficheiros do FILES.manifest que NÃO estão no disco (perdidos ou apagados — rever!)
${lostVsManifest.length ? cap(lostVsManifest.map((p) => `- ${p}`), 80).join("\n") : "- (nenhum)"}

## Os 40 ficheiros do projeto modificados mais recentemente
${newest.map((f) => `- ${projRel(f.rel)}  (${when(f.mtime)})`).join("\n") || "- (nenhum)"}

## Fora da raiz do projeto, dentro de work/ (rascunhos, ficheiros soltos)
${scratchFiles.length ? cap(scratchFiles.sort((a, b) => b.mtime - a.mtime).map((f) => `- work/${f.rel}  (${kb(f.size)})`), 60).join("\n") : "- (nenhum)"}

## Excluídos do zip (não são trabalho)
- .zip dentro de work/: ${workScan.zips.length ? workScan.zips.map((z) => `${z.rel} (${kb(z.size)})`).join(", ") : "nenhum"}
- .zip dentro de outputs/: ${outScan.zips.length ? outScan.zips.map((z) => `${z.rel} (${kb(z.size)})`).join(", ") : "nenhum"}
- node_modules, .next, .git, __MACOSX, .DS_Store, tsbuildinfo, caches npm, .venv, __pycache__, *.pyc, segredos .env.
- Corpus privado (corpus/real-world, corpus/huge): ${privateSkipped} ficheiro(s) NÃO incluídos de propósito (só os .gitkeep); nomes não listados.

## Ficheiros em outputs/ incluídos
${outScan.files.length ? cap(outScan.files.map((f) => `- outputs/${f.rel}  (${kb(f.size)})`), 40).join("\n") : "- (nenhum)"}
${errors.length ? `\n## Erros ao gerar este relatório (o zip foi criado na mesma)\n${errors.map((e) => `- ${e}`).join("\n")}\n` : ""}`;

// --- Staging com symlinks: o zip fica com work/ e outputs/ sem copiar nada. ---
const stage = mkdtempSync(join(tmpdir(), "cairn-emergency-"));
writeFileSync(join(stage, "RECOVERY_MARKER.json"), JSON.stringify(marker, null, 1));
writeFileSync(join(stage, "RECOVERY_REPORT.md"), report);
symlinkSync(WORK, join(stage, "work"));
const includeOutputs = !flag("--no-outputs") && outScan.files.length > 0;
if (includeOutputs) symlinkSync(OUTDIR, join(stage, "outputs"));

const tmpZip = join(tmpdir(), zipName);
rmSync(tmpZip, { force: true });
const EX = ["*/node_modules/*", "*/.next/*", "*/.git/*", "*/__MACOSX/*", "*/.npm-global/*", "*/.cache/*", "*/.npm/*", "*/.venv/*", "*/__pycache__/*", "*.DS_Store", "*.tsbuildinfo", "*.zip", "*.pyc", "*/.env", "*/.env.*", "*/corpus/real-world/*", "*/corpus/huge/*"];
const members = ["RECOVERY_MARKER.json", "RECOVERY_REPORT.md", "work", ...(includeOutputs ? ["outputs"] : [])];
let r = spawnSync("zip", ["-qr", tmpZip, ...members, "-x", ...EX], { cwd: stage, stdio: ["ignore", "inherit", "inherit"] });
let finalName = zipName;
if (r.status !== 0 && r.status !== 18) { // 18 = alguns ficheiros ilegíveis; o zip existe na mesma
  // Fallback: tar.gz (segue symlinks), por se o `zip` não existir.
  finalName = zipName.replace(/\.zip$/, ".tar.gz");
  const tmpTar = join(tmpdir(), finalName);
  r = spawnSync("tar", ["-czhf", tmpTar, ...EX.filter((x) => !x.startsWith("*.")).map((x) => `--exclude=${x.replace(/^\*\//, "").replace(/\/\*$/, "")}`), "--exclude=*.zip", "--exclude=*.pyc", "--exclude=.DS_Store", "--exclude=.env", "--exclude=.env.*", "-C", stage, ...members], { stdio: "inherit" });
  if (r.status !== 0) { console.error("✗ nem zip nem tar funcionaram — despejo NÃO criado."); rmSync(stage, { recursive: true, force: true }); process.exit(1); }
  copyFileSync(tmpTar, join(OUTDIR, finalName)); rmSync(tmpTar, { force: true });
} else {
  // repõe o que o -x apanhou por arrastamento mas é para ficar: .gitkeep do corpus privado e .env.example/.sample
  const keep = workScan.files.filter((f) => (PRIVATE_RE.test(f.rel) && /(^|\/)\.gitkeep$/.test(f.rel)) || isKeptEnv(f.rel.split("/").pop())).map((f) => `work/${f.rel}`);
  if (keep.length) spawnSync("zip", ["-q", tmpZip, ...keep], { cwd: stage, stdio: ["ignore", "inherit", "inherit"] });
  copyFileSync(tmpZip, join(OUTDIR, finalName)); rmSync(tmpZip, { force: true });
}
rmSync(stage, { recursive: true, force: true });

const finalPath = join(OUTDIR, finalName);
console.log(`\n✓ DESPEJO DE EMERGÊNCIA CRIADO (sem guardas — não é uma entrega)\n  ${finalPath}  (${kb(statSync(finalPath).size)})`);
console.log(`  projeto: ${projectFiles.length} ficheiros, ${touched.length} com data posterior ao manifesto (só indicativo: um cp/unzip apaga as datas; o recovery-report compara o conteúdo), ${newVsManifest.length} novos, ${lostVsManifest.length} em falta vs manifesto.`);
if (errors.length) console.log(`  avisos no relatório: ${errors.length} (ver RECOVERY_REPORT.md dentro do zip)`);
console.log(`\nAGORA: present_files com o caminho acima. Nada mais.`);
