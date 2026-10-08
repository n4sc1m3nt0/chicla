#!/usr/bin/env node
// Teste de fumo do W3: sessão simulada -> /dump -> recovery. A secção 7 (ronda 1s, T1 a T4) cobre nomes em NFC/NFD. Corre numa CÓPIA em tmpdir (nunca toca na árvore real).
//   node scripts/smoke-test-emergency.mjs
// Planta ficheiros que NUNCA podem entrar no despejo, faz mudanças conhecidas contra um zip de base, e confere
// (inspecionando o zip à parte, com unzip -l e uma procura do marcador secreto nos bytes) que o despejo está limpo
// e que o recovery aponta modificados, novos e em falta. Sai com 1 se algo falhar.
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const T = mkdtempSync(join(tmpdir(), "cairn-w3-"));
const work = join(T, "work"), proj = join(work, "cairn"), outdir = join(T, "out");
const SECRET = ["PRIVATE", "MARKER", "9f3a"].join("-"); // montado em runtime: o literal não pode existir neste ficheiro, que faz parte da cópia despejada
let failed = 0;
const check = (ok, what, detail) => { console.log(`${ok ? "✓" : "✗"} ${what}${!ok && detail ? `\n    obtido: ${detail}` : ""}`); if (!ok) failed++; };
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
const put = (rel, text = "x\n") => { const p = join(proj, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };

// 1. cópia do projeto (só ficheiros do manifesto que existem) + um rascunho fora da raiz do projeto
for (const rel of readFileSync(join(ROOT, "FILES.manifest"), "utf8").split("\n").filter(Boolean)) {
  if (!existsSync(join(ROOT, rel))) continue;
  mkdirSync(dirname(join(proj, rel)), { recursive: true }); copyFileSync(join(ROOT, rel), join(proj, rel));
}
copyFileSync(join(ROOT, "FILES.manifest"), join(proj, "FILES.manifest")); // o manifesto não se lista a si próprio
put("../scratch-note.txt", "rascunho fora do projeto\n");
// 2. zip de base = estado "última entrega"
const baseline = join(T, "baseline.zip");
const names = readFileSync(join(proj, "FILES.manifest"), "utf8").split("\n").filter(Boolean).filter((n) => existsSync(join(proj, n)));
const z = spawnSync("zip", ["-q", baseline, "-@"], { cwd: proj, input: names.join("\n") + "\n" });
check(z.status === 0 && existsSync(baseline), "zip de base criado");

// 3. mudanças da "sessão": modificado, novo, truncado, em falta
appendFileSync(join(proj, "ROADMAP.md"), "\nlinha nova da sessão\n");
put("packages/cairn-kit/src/new_mod.mjs", "export const ok = true;\n");
put("packages/cairn-kit/src/broken.mjs", "export function cortado() {\n    if (true) {\n");
rmSync(join(proj, "packages/cairn-zip/package.json"));
// 4. coisas que NUNCA podem entrar no despejo
put("corpus/real-world/extrato.pdf", SECRET); put("corpus/huge/big.pdf", SECRET);
put(".env", `TOKEN=${SECRET}\n`); put(".venv/lib/x.py", SECRET);
put("tools/corpus/__pycache__/a.pyc", SECRET);
// ...e coisas que têm de ficar
put(".env.example", "TOKEN=\n"); put("corpus/real-world/.gitkeep", "");

// 5. despejo
const d = run("node", [join(ROOT, "scripts/emergency-dump.mjs"), "--work", work, "--outdir", outdir, "--no-outputs", "nota de teste"], ROOT);
const dumpZip = existsSync(outdir) ? readdirSync(outdir).find((f) => f.endsWith(".zip")) : undefined;
check(d.status === 0 && !!dumpZip, "emergency-dump criou o zip");
const dumpPath = join(outdir, dumpZip ?? "nao-existe.zip");
const listing = run("unzip", ["-l", dumpPath]).stdout ?? "";
const NEVER = { "corpus/real-world/extrato.pdf": /real-world\/extrato\.pdf/, "corpus/huge/big.pdf": /huge\/big\.pdf/, ".env": /\/\.env$/m, ".venv/": /\.venv\//, "__pycache__ / *.pyc": /__pycache__|\.pyc$/m };
for (const [what, re] of Object.entries(NEVER)) check(!re.test(listing), `fora do zip: ${what}`);
check(/work\/cairn\/\.env\.example$/m.test(listing), "dentro do zip: .env.example");
check(/work\/cairn\/corpus\/real-world\/\.gitkeep$/m.test(listing), "dentro do zip: corpus/real-world/.gitkeep");
check(listing.includes("work/scratch-note.txt"), "dentro do zip: rascunho fora da raiz do projeto");
const ex = join(T, "unz"); run("unzip", ["-q", dumpPath, "-d", ex]);
const leaked = run("grep", ["-rl", SECRET, ex]).stdout.trim();
check(leaked === "", `marcador secreto ausente dos bytes do zip${leaked ? ` (apareceu em: ${leaked})` : ""}`);
check(/APP_VERSION|CHANGELOG seq=\d+/.test(readFileSync(join(ex, "RECOVERY_REPORT.md"), "utf8")) && JSON.parse(readFileSync(join(ex, "RECOVERY_MARKER.json"), "utf8")).appVersion === JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version, "versão lida de package.json no marcador");

// 6. recovery, com e sem baseline
const rec = (extra, name) => { const o = join(T, name); const r = run("node", [join(ROOT, "scripts/recovery-report.mjs"), dumpPath, "--out", o, ...extra], ROOT); return { r, diff: existsSync(join(o, "RECOVERY_DIFF.md")) ? readFileSync(join(o, "RECOVERY_DIFF.md"), "utf8") : "" }; };
const section = (diff, title) => (diff.split(/^### /m).find((s) => s.startsWith(title)) ?? "");
const a = rec(["--baseline", baseline], "rec-baseline");
check(a.r.status === 0, "recovery-report correu (com baseline)");
check(section(a.diff, "Modificados").includes("ROADMAP.md"), "baseline: ROADMAP.md aparece como modificado");
check(section(a.diff, "Novos").includes("packages/cairn-kit/src/new_mod.mjs"), "baseline: new_mod.mjs aparece como novo");
check(section(a.diff, "EM FALTA").includes("packages/cairn-zip/package.json"), "baseline: packages/cairn-zip/package.json aparece em falta");
check(/broken\.mjs: possivelmente CORTADO/.test(a.diff), "baseline: broken.mjs sinalizado como possivelmente cortado");
check(!/extrato\.pdf|big\.pdf|\.venv|__pycache__|\.env\b(?!\.example)/.test(a.diff), "baseline: nada de privado no relatório");
check(a.diff.includes("conferem com o sha256"), "integridade sha256 do despejo confere");
const b = rec([], "rec-manifest");
check(b.r.status === 0 && b.diff.includes("packages/cairn-zip/package.json") && b.diff.includes("new_mod.mjs"), "sem baseline: usa o manifesto (em falta + novos)");

// 7. NFC/NFD nos nomes (ronda 1s, T1 a T4): o manifesto/baseline do macOS vem em NFD, o disco do Linux em NFC.
// Cada cenário usa um projeto mínimo próprio, para controlar a forma exata dos nomes de cada lado.
const ACC_NFC = "corpus/edge/names/relatório final (v2) – ação #1 日本語.pdf";
const ACC_NFD = ACC_NFC.normalize("NFD");
check(ACC_NFD !== ACC_NFC, "(controlo) NFC e NFD do nome são mesmo diferentes em bytes");
const mini = (tag, extra = {}) => {
  const S = join(T, `nfc-${tag}`), w = join(S, "work"), p = join(w, "cairn"), o = join(S, "out");
  const files = { "package.json": "{\"version\":\"0.0.1\"}\n", "CHANGELOG.md": "<!-- CHANGELOG_FINGERPRINT: seq=1 -->\n## Round 1a\n", "CAIRN_PROJECT_STATUS-1.md": "# estado\n", "README.md": "readme\n", [ACC_NFC]: "%PDF-1.4 acentuado\n", ...extra };
  for (const [rel, text] of Object.entries(files)) { const f = join(p, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); }
  return { S, w, p, o, names: Object.keys(files) };
};
const asNfd = (names) => names.map((n) => (n === ACC_NFC ? ACC_NFD : n)); // manifesto "do Mac": só o nome acentuado em NFD
const setManifest = (p, names) => writeFileSync(join(p, "FILES.manifest"), [...names].sort().join("\n") + "\n");
const dumpMini = (m) => {
  const r = run("node", [join(ROOT, "scripts/emergency-dump.mjs"), "--work", m.w, "--outdir", m.o, "--no-outputs", "nota nfc"], ROOT);
  const z = existsSync(m.o) ? readdirSync(m.o).find((f) => f.endsWith(".zip")) : undefined;
  return { r, path: z ? join(m.o, z) : null, report: z ? (run("unzip", ["-p", join(m.o, z), "RECOVERY_REPORT.md"]).stdout ?? "") : "" };
};
const recZip = (zipPath, extra, name) => { const o = join(T, name); const r = run("node", [join(ROOT, "scripts/recovery-report.mjs"), zipPath, "--out", o, ...extra], ROOT); return { r, diff: existsSync(join(o, "RECOVERY_DIFF.md")) ? readFileSync(join(o, "RECOVERY_DIFF.md"), "utf8") : "" }; };
const mdSection = (md, title) => md.split(/^## /m).find((x) => x.startsWith(title)) ?? "";

// T1 — manifesto NFD, disco NFC, sem baseline: nem o despejo nem o recovery-report veem "novo" ou "em falta"
{
  const m = mini("t1"); setManifest(m.p, asNfd(m.names));
  const d = dumpMini(m);
  check(d.r.status === 0 && !!d.path, "T1: emergency-dump criou o zip");
  check(/, 0 novos, 0 em falta vs manifesto/.test(d.r.stdout ?? ""), "T1: emergency-dump (manifesto NFD, disco NFC): resumo diz 0 novos e 0 em falta", (d.r.stdout ?? "").split("\n").find((l) => /vs manifesto/.test(l)));
  check(mdSection(d.report, "Ficheiros no disco que NÃO").includes("(nenhum)") && mdSection(d.report, "Ficheiros do FILES.manifest que NÃO").includes("(nenhum)"), "T1: RECOVERY_REPORT.md não lista o ficheiro acentuado nem como novo nem como em falta");
  const a = d.path ? recZip(d.path, [], "t1-rec") : { r: { status: 1 }, diff: "" };
  check(/^Novos \(0\)/.test(section(a.diff, "Novos")) && /^EM FALTA face à base \(0\)/.test(section(a.diff, "EM FALTA")), "T1: recovery-report sem baseline: Novos (0) e EM FALTA (0)", `${section(a.diff, "Novos").split("\n")[0]} | ${section(a.diff, "EM FALTA").split("\n")[0]}`);
}

// T2 — --baseline em NFD, despejo em NFC, ficheiro acentuado modificado: tem de aparecer em Modificados
{
  const m = mini("t2"); setManifest(m.p, asNfd(m.names));
  const B = join(T, "nfc-t2-base"); // "último zip de entrega" feito no Mac: nome acentuado em NFD, conteúdo original
  for (const n of [...asNfd(m.names), "FILES.manifest"]) { const f = join(B, n); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, n === "FILES.manifest" ? readFileSync(join(m.p, "FILES.manifest")) : n === ACC_NFD ? "%PDF-1.4 acentuado\n" : readFileSync(join(m.p, n))); }
  const bz = join(T, "nfc-t2-baseline.zip");
  const zb = spawnSync("zip", ["-q", bz, "-@"], { cwd: B, input: [...asNfd(m.names), "FILES.manifest"].join("\n") + "\n" });
  check(zb.status === 0 && existsSync(bz), "T2: zip de base (nome em NFD) criado");
  appendFileSync(join(m.p, ACC_NFC), "linha alterada na sessão\n");
  const d = dumpMini(m);
  const a = d.path ? recZip(d.path, ["--baseline", bz], "t2-rec") : { r: { status: 1 }, diff: "" };
  const head = (t) => section(a.diff, t).split("\n")[0];
  check(/^Modificados \(1\)/.test(section(a.diff, "Modificados")) && section(a.diff, "Modificados").normalize("NFC").includes(ACC_NFC), "T2: --baseline NFD: o ficheiro acentuado alterado aparece em Modificados", `${head("Modificados")} | ${head("Novos")} | ${head("EM FALTA")}`);
  check(/^Novos \(0\)/.test(section(a.diff, "Novos")) && /^EM FALTA face à base \(0\)/.test(section(a.diff, "EM FALTA")), "T2: --baseline NFD: Novos (0) e EM FALTA (0)", `${head("Novos")} | ${head("EM FALTA")}`);
}

// T3 — integridade: chaves de hashes do marcador em NFD, extração em NFC: sem falso alerta de corrupção
{
  const m = mini("t3"); setManifest(m.p, m.names);
  const d = dumpMini(m);
  check(!!d.path, "T3: emergency-dump criou o zip");
  if (d.path) {
    const X = join(T, "nfc-t3-x"); run("unzip", ["-q", d.path, "-d", X]);
    const mk = JSON.parse(readFileSync(join(X, "RECOVERY_MARKER.json"), "utf8"));
    check(Object.keys(mk.hashes).includes(ACC_NFC), "T3: (controlo) o marcador tem a chave do ficheiro acentuado em NFC");
    mk.hashes = Object.fromEntries(Object.entries(mk.hashes).map(([k, v]) => [k.normalize("NFD"), v])); // "extraído num sistema que renormaliza nomes"
    writeFileSync(join(X, "RECOVERY_MARKER.json"), JSON.stringify(mk, null, 1));
    const tz = join(T, "nfc-t3-marker-nfd.zip");
    const zt = run("zip", ["-qr", tz, "."], X);
    check(zt.status === 0 && existsSync(tz), "T3: zip com marcador em NFD criado");
    const a = recZip(tz, [], "t3-rec");
    check(a.diff.includes("conferem com o sha256") && !/diferem do que foi despejado/.test(a.diff), "T3: chaves NFD no marcador, ficheiro em NFC: «ficheiros conferem», sem falso alerta de corrupção", (a.diff.split("\n").find((l) => /^[✓✗] .*(conferem|diferem)/.test(l)) ?? "").slice(0, 120));
  }
}

// T4 — colisão: dois ficheiros que só diferem em NFC/NFD: aviso (nos dois scripts) e o zip cria-se na mesma
{
  const A = "docs/café.txt", Bn = A.normalize("NFD");
  const m = mini("t4", { [A]: "a\n", [Bn]: "b\n" });
  if (readdirSync(join(m.p, "docs")).length !== 2) console.log("⚠ T4 saltado: este sistema de ficheiros normaliza nomes (testar a função de deteção isoladamente)");
  else {
    setManifest(m.p, m.names);
    const d = dumpMini(m);
    check(d.r.status === 0 && !!d.path, "T4: emergency-dump cria o zip mesmo com colisão");
    check(/só diferem em NFC\/NFD/.test(d.report), "T4: RECOVERY_REPORT.md avisa da colisão (secção de erros)");
    const a = d.path ? recZip(d.path, [], "t4-rec") : { r: { status: 1 }, diff: "" };
    check(a.r.status === 0 && /NFC\/NFD/.test(a.diff), "T4: recovery-report corre e avisa da colisão", (a.diff.match(/.*NFC\/NFD.*/) ?? ["(sem aviso)"])[0].slice(0, 120));
  }
}

rmSync(T, { recursive: true, force: true });
console.log(failed ? `\n✗ ${failed} verificação(ões) falharam` : "\n✓ smoke-test-emergency: tudo passou");
process.exit(failed ? 1 : 0);
