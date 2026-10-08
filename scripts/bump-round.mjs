#!/usr/bin/env node
// Fecho mecânico de uma ronda (instruções 8, 11 e 13 do ficheiro de estado).
//
//   node scripts/bump-round.mjs               N -> N+1: renomeia o ficheiro de estado, reescreve os 3 fingerprints
//                                             (APP_FILE linha 3, CHANGELOG linha 1, parágrafo "Fingerprint:" do estado)
//                                             com hashes recalculados e regenera FILES.manifest
//   node scripts/bump-round.mjs --dry-run     mostra o que mudaria, não escreve nada
//   node scripts/bump-round.mjs --refresh     recalcula hashes SEM mudar o número (CHANGELOG editado depois do bump;
//                                             a instrução 8 proíbe saltar números)
//   node scripts/bump-round.mjs --verify      só verifica (instrução 11 a-c); exit 1 se algo não bater
//   --note "texto"                            acrescenta uma nota ao comentário de fingerprint do app e do CHANGELOG
//
// QUANDO CORRER: no passo ③/④ do "closing kit", DEPOIS de a entrada do CHANGELOG, a "Last updated" e qualquer
// edição do app estarem finais (os hashes são do conteúdo final) e ANTES de make-delivery-zip.mjs.
// Os hashes são calculados sobre BYTES: app = tail -n +4 | sha256sum; CHANGELOG = tail -n +2 | sha256sum (12 hex).
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
// --- Configuração do Cairn -------------------------------------------------------------------------------
// APP_FILE é a "perna app" do fingerprint: um ficheiro pequeno e estável que muda a cada ronda (a versão).
// Tem de ter o comentário STATUS_FILE_FINGERPRINT na LINHA 3; o hash cobre tudo da linha 4 em diante.
// Comentário `//` para .mjs/.js/.ts, `<!-- -->` para .html/.md.
const APP_FILE = "version.mjs";
// ---------------------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const note = has("--note") ? args[args.indexOf("--note") + 1] ?? "" : "";
const MODE = has("--verify") ? "verify" : has("--refresh") ? "refresh" : "bump";
const DRY = has("--dry-run");
const P = (f) => join(ROOT, f);
const fail = (m) => { console.error(`\n✗ ${m}`); process.exit(1); };

// tail -n +n, em bytes (n=1 é o ficheiro inteiro)
const tailFrom = (buf, n) => { let p = 0; for (let i = 1; i < n; i++) { const j = buf.indexOf(10, p); if (j < 0) return Buffer.alloc(0); p = j + 1; } return buf.subarray(p); };
const h12 = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 12);
const lineOf = (buf, n) => tailFrom(buf, n).toString("utf8").split("\n", 1)[0];
const replaceLine = (buf, n, text) => Buffer.concat([buf.subarray(0, buf.length - tailFrom(buf, n).length), Buffer.from(text + "\n"), tailFrom(buf, n + 1)]);

const FP = /seq=(\d+) file=(\S+) app_sha256_12=([0-9a-f]{12}) changelog_sha256_12=([0-9a-f]{12})/;
const PARA = /\*\*Fingerprint:\*\* seq=(\d+) · app=(\S+) ·\s*app_sha256_12=([0-9a-f]{12})[\s\S]*?changelog_sha256_12=([0-9a-f]{12})[\s\S]*?before doing anything else\./g;

function readState() {
  const names = readdirSync(ROOT);
  const st = names.filter((f) => /^CAIRN_PROJECT_STATUS-\d+\.md$/.test(f));
  const apOk = existsSync(P(APP_FILE));
  if (st.length !== 1) fail(`tem de haver exatamente 1 CAIRN_PROJECT_STATUS-N.md na raiz (há ${st.length}).`);
  if (!apOk) fail(`falta ${APP_FILE} (a perna "app" do fingerprint; ver APP_FILE no topo de bump-round.mjs).`);
  if (!names.includes("CHANGELOG.md")) fail("falta CHANGELOG.md na raiz.");
  const s = { statusName: st[0], seq: +st[0].match(/-(\d+)\.md$/)[1], appName: APP_FILE, app: readFileSync(P(APP_FILE)), cl: readFileSync(P("CHANGELOG.md")), stBuf: readFileSync(P(st[0])) };
  s.stTxt = s.stBuf.toString("utf8");
  if (!Buffer.from(s.stTxt, "utf8").equals(s.stBuf)) fail(`${s.statusName} não é UTF-8 válido; não o reescrevo para não o corromper.`);
  s.appFp = lineOf(s.app, 3).match(FP); s.clFp = lineOf(s.cl, 1).match(FP);
  const paras = [...s.stTxt.matchAll(PARA)];
  s.stFp = paras.length === 1 ? paras[0] : null;
  if (!s.appFp || !lineOf(s.app, 3).includes("STATUS_FILE_FINGERPRINT")) fail(`${s.appName}: a linha 3 não é um STATUS_FILE_FINGERPRINT válido.`);
  if (!s.clFp || !lineOf(s.cl, 1).includes("CHANGELOG_FINGERPRINT")) fail("CHANGELOG.md: a linha 1 não é um CHANGELOG_FINGERPRINT válido.");
  if (!s.stFp) fail(`${s.statusName}: tem de haver exatamente 1 parágrafo "**Fingerprint:** … before doing anything else." (há ${paras.length}).`);
  s.hApp = h12(tailFrom(s.app, 4)); s.hCl = h12(tailFrom(s.cl, 2));
  return s;
}

function verify(s) { // instrução 11 a-c
  const eq = (a, b) => a === b;
  return [
    [`app: seq=${s.appFp[1]} = ficheiro de estado -${s.seq}`, eq(+s.appFp[1], s.seq)],
    [`CHANGELOG: seq=${s.clFp[1]} = -${s.seq}`, eq(+s.clFp[1], s.seq)],
    [`estado: seq=${s.stFp[1]} = -${s.seq}`, eq(+s.stFp[1], s.seq)],
    [`file= aponta para ${s.statusName} (app e CHANGELOG)`, eq(s.appFp[2], s.statusName) && eq(s.clFp[2], s.statusName)],
    [`app=${s.appName} no parágrafo do estado`, eq(s.stFp[2], s.appName)],
    [`hash do app ${s.hApp} = app, CHANGELOG e estado`, [s.appFp[3], s.clFp[3], s.stFp[3]].every((h) => h === s.hApp)],
    [`hash do CHANGELOG ${s.hCl} = app, CHANGELOG e estado`, [s.appFp[4], s.clFp[4], s.stFp[4]].every((h) => h === s.hCl)],
  ];
}
const report = (checks) => { for (const [l, ok] of checks) console.log(`  ${ok ? "✓" : "✗"} ${l}`); return checks.every(([, ok]) => ok); };

const s = readState();
if (MODE === "verify") { console.log(`bump-round --verify (ficheiro de estado -${s.seq}):`); process.exit(report(verify(s)) ? 0 : 1); }

// bump / refresh: as ligações têm de estar emparelhadas ANTES (11a) — nunca emparelhar às cegas
if (+s.appFp[1] !== s.seq || +s.clFp[1] !== s.seq || +s.stFp[1] !== s.seq)
  fail(`o app diz seq=${s.appFp[1]}, o CHANGELOG seq=${s.clFp[1]}, o parágrafo do estado seq=${s.stFp[1]}, mas o ficheiro de estado é -${s.seq} (instrução 11a). Não escrevi nada; diz ao Rodrigo.`);

const seq = MODE === "bump" ? s.seq + 1 : s.seq;
const newName = `CAIRN_PROJECT_STATUS-${seq}.md`;
const appChanged = s.hApp !== s.appFp[3];
const core = `seq=${seq} file=${newName} app_sha256_12=${s.hApp} changelog_sha256_12=${s.hCl}`;
const tag = `(bump-round.mjs: app hash ${appChanged ? "CHANGED" : "unchanged"}, changelog hash recomputed${note ? "; " + note : ""})`;
const cmt = (t) => (/\.(html|md)$/.test(APP_FILE) ? `<!-- ${t} -->` : `// ${t}`);
const newApp = replaceLine(s.app, 3, cmt(`STATUS_FILE_FINGERPRINT: ${core} ${tag}`));
const newCl = replaceLine(s.cl, 1, `<!-- CHANGELOG_FINGERPRINT: ${core} ${tag} -->`);
const para = `**Fingerprint:** seq=${seq} · app=${s.appName} ·
app_sha256_12=${s.hApp} (of everything below the app file's own
fingerprint comment; ${appChanged ? "CHANGED" : "unchanged"} at this seq — rewritten by \`scripts/bump-round.mjs\`) ·
changelog=CHANGELOG.md ·
changelog_sha256_12=${s.hCl} (hash of \`CHANGELOG.md\` below its own
fingerprint line; recomputed by \`scripts/bump-round.mjs\` at seq ${seq}) · matches the
\`STATUS_FILE_FINGERPRINT\` comment on line 2–3 of the app file and the
\`CHANGELOG_FINGERPRINT\` comment on line 1 of \`CHANGELOG.md\`. If any of
these three don't match what you're looking at, stop and see
instructions item 11 above before doing anything else.`;
const newSt = s.stTxt.replace(PARA, () => para);

console.log(`bump-round ${MODE}${DRY ? " --dry-run" : ""}: seq ${s.seq} → ${seq}`);
console.log(`  ficheiro de estado : ${s.statusName}${newName !== s.statusName ? ` → ${newName}` : " (mantém o nome)"}`);
console.log(`  hash do app        : ${s.appFp[3]} → ${s.hApp} (${appChanged ? "MUDOU" : "inalterado"})`);
console.log(`  hash do CHANGELOG  : ${s.clFp[4]} → ${s.hCl}${s.clFp[4] === s.hCl ? " (inalterado)" : ""}`);
console.log(`  reescrito          : ${s.appName} linha 3 · CHANGELOG.md linha 1 · parágrafo "Fingerprint:" do estado`);
if (DRY) { console.log("  (dry-run: nada foi escrito)"); process.exit(0); }

writeFileSync(P(s.appName), newApp);
writeFileSync(P("CHANGELOG.md"), newCl);
writeFileSync(P(s.statusName), newSt);
if (newName !== s.statusName) renameSync(P(s.statusName), P(newName));
const man = spawnSync(process.execPath, [P("scripts/check-manifest.mjs"), "--write"], { cwd: ROOT, encoding: "utf8" });
if (man.status !== 0) fail(`check-manifest --write falhou:\n${man.stdout}${man.stderr}`);
console.log(`  ${man.stdout.trim()}`);
console.log("verificação final (instrução 11 a-c, sobre o que ficou em disco):");
if (!report(verify(readState()))) fail("os fingerprints não ficaram coerentes — NÃO entregar; corre --verify e investiga.");
console.log(`✓ ronda fechada mecanicamente: ${newName}. Falta (à mão): entrada do CHANGELOG, "Last updated", Backlog, e depois make-delivery-zip.mjs.`);
