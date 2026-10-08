#!/usr/bin/env node
// W6 — teste de fumo das GUARDAS DE ENTREGA, num projeto falso em pasta temporária:
//   check-manifest.mjs · check-build.mjs · make-delivery-zip.mjs · verify-delivery-zip.mjs · archive-changelog.mjs
//
//   node scripts/smoke-test-delivery-guards.mjs
//
// Casos (plano W6): ficheiro perdido recusado · ficheiro privado recusado · dois ficheiros de estado recusados ·
// `seq=` errado recusado · ronda `1b` reconhecida · `check-build` recusa sintaxe partida · nomes não-ASCII (macOS).
//
// Regras do teste:
//  - Hermético: os scripts correm com um PATH que só tem `node`, `zip` e `unzip` (symlinks numa pasta FORA do
//    projeto). Assim o teste só usa o que ele próprio fornece.
//  - Cada caso negativo afirma a MENSAGEM específica da guarda, não só "exit 1"; e há um controlo positivo
//    (projeto limpo passa) para que um negativo não passe por a razão errada.
//  - Não esconde falhas: conta-as, imprime o detalhe e sai com 1.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = ["check-manifest.mjs", "check-build.mjs", "make-delivery-zip.mjs", "verify-delivery-zip.mjs", "archive-changelog.mjs"];
const cleanup = [];
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); cleanup.push(d); return d; };

let failed = 0, passed = 0;
const check = (ok, what, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (ok) passed++; else { failed++; if (detail) console.log(detail.split("\n").map((l) => `      ${l}`).join("\n")); }
};
const note = (what) => console.log(`  ℹ ${what}`);
const section = (t) => console.log(`\n${t}`);

// --- ambiente hermético --------------------------------------------------------------------------------------
const realWhich = (bin) => { const r = spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" }); return r.status === 0 ? r.stdout.trim() : null; };
const BIN = tmp("guards-bin-");
for (const [name, target] of [["node", process.execPath], ["zip", realWhich("zip")], ["unzip", realWhich("unzip")]]) {
  if (!target) { console.error(`✗ falta \`${name}\` neste ambiente: o teste não pode correr (não é um "passou").`); process.exit(1); }
  symlinkSync(target, join(BIN, name));
}
const ENV = { PATH: BIN, HOME: BIN, LANG: "C.UTF-8" };

const run = (root, script, ...args) => spawnSync(process.execPath, [join(root, "scripts", script), ...args], { cwd: root, encoding: "utf8", env: ENV, maxBuffer: 1 << 26 });
const out = (r) => `exit=${r.status}\n--- stdout\n${r.stdout}\n--- stderr\n${r.stderr}`;
const zipList = (z) => spawnSync("unzip", ["-Z1", z], { encoding: "utf8", env: ENV }).stdout.split("\n").filter((l) => l && !l.endsWith("/"));
const zipAdd = (root, z, ...files) => spawnSync("zip", ["-q", z, ...files], { cwd: root, encoding: "utf8", env: ENV });

// --- projeto falso (a forma mínima de um repo Cairn que as guardas aceitam) -------------------------------------
const FP = (seq) => `seq=${seq} file=CAIRN_PROJECT_STATUS-${seq}.md app_sha256_12=aaaaaaaaaaaa changelog_sha256_12=bbbbbbbbbbbb`;
function makeProject({ seq = 7, clSeq = seq } = {}) {
  const root = tmp("guards-proj-");
  const w = (rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
  mkdirSync(join(root, "scripts"));
  for (const f of SCRIPTS) copyFileSync(join(HERE, f), join(root, "scripts", f));
  w("package.json", '{"name":"fake","private":true,"version":"0.0.1"}\n');
  w("CLAUDE.md", "# rules\n");
  w("README.md", "readme\n");
  w("CHANGELOG.md", `<!-- CHANGELOG_FINGERPRINT: ${FP(clSeq)} -->\n# Changelog\n\n## Round 1 — x\n`);
  w(`CAIRN_PROJECT_STATUS-${seq}.md`, "# status\n");
  w("packages/cairn-kit/src/lib.mjs", "export const a = 1;\n");
  w("packages/cairn-kit/src/extra.mjs", "export const b = 2;\n");
  w("corpus/real-world/.gitkeep", "");
  w("corpus/huge/.gitkeep", "");
  w(".env.example", "KEY=\n");
  const m = run(root, "check-manifest.mjs", "--write");
  if (m.status !== 0) throw new Error("check-manifest --write falhou ao montar o projeto falso:\n" + out(m));
  return { root, w };
}
// ficheiros que NUNCA podem sair do projeto
const plantPrivate = (p) => {
  p.w("corpus/real-world/private-statement.pdf", "%PDF-1.4 dados pessoais\n");
  p.w("corpus/huge/big.pdf", "%PDF-1.4 enorme\n");
  p.w(".env", "SECRET=1\n");
  p.w("tools/__pycache__/x.pyc", "pyc");
};
const PRIVATE_PATHS = ["corpus/real-world/private-statement.pdf", "corpus/huge/big.pdf", ".env", "tools/__pycache__/x.pyc"];

try {
  console.log("guardas de entrega — smoke test (W6)");

  // ============================================================================================================
  section("0. Controlo positivo: um projeto limpo é entregue");
  {
    const p = makeProject(), zip = join(tmp("guards-out-"), "ok.zip");
    const r = run(p.root, "make-delivery-zip.mjs", zip);
    check(r.status === 0 && existsSync(zip), "make-delivery-zip: exit 0 e zip criado", out(r));
    check(/entrega criada e verificada/.test(r.stdout), "diz \"entrega criada e verificada\"", out(r));
    const names = existsSync(zip) ? zipList(zip) : [];
    check(["package.json", "CLAUDE.md", "CHANGELOG.md", "CAIRN_PROJECT_STATUS-7.md", "FILES.manifest", "packages/cairn-kit/src/extra.mjs"].every((f) => names.includes(f)), "o zip tem a árvore toda (package.json na raiz, estado, manifesto, fontes)", names.join("\n"));
    const v = run(p.root, "verify-delivery-zip.mjs", zip);
    check(v.status === 0 && /zip pronto a colar por cima/.test(v.stdout), "verify-delivery-zip aprova o mesmo zip de forma independente", out(v));
  }

  // ============================================================================================================
  section("0b. Zip embrulhado numa pasta é recusado (package.json tem de estar na raiz do zip)");
  {
    const p = makeProject(), dir = tmp("guards-out-");
    const names = readFileSync(join(p.root, "FILES.manifest"), "utf8").split("\n").filter(Boolean);
    const parent = dirname(p.root), wrapper = p.root.split("/").pop();
    const wrapped = join(dir, "wrapped.zip");
    zipAdd(parent, wrapped, ...[...names, "FILES.manifest"].map((n) => `${wrapper}/${n}`));
    const v = run(p.root, "verify-delivery-zip.mjs", wrapped);
    check(v.status === 1 && /package\.json não está na RAIZ do zip/.test(v.stderr), "verify-delivery-zip: recusa o zip com pasta a envolver e diz que package.json não está na raiz", out(v));
  }

  // ============================================================================================================
  section("1. Ficheiro perdido é recusado");
  {
    const p = makeProject();
    rmSync(join(p.root, "packages/cairn-kit/src/extra.mjs"));
    const c = run(p.root, "check-manifest.mjs");
    check(c.status === 1 && /PERDIDO\(S\)/.test(c.stderr) && /packages\/cairn-kit\/src\/extra\.mjs/.test(c.stderr), "check-manifest: exit 1 e nomeia o ficheiro perdido", out(c));

    const zip = join(tmp("guards-out-"), "lost.zip");
    const r = run(p.root, "make-delivery-zip.mjs", zip);
    check(r.status === 1 && /check-manifest\.mjs falhou/.test(r.stderr), "make-delivery-zip: aborta no passo 1 (check-manifest)", out(r));
    check(!existsSync(zip), "…e não cria nenhum zip", `existe: ${zip}`);
  }
  {
    // face ao zip ANTERIOR (--against): a remoção "deliberada" (manifesto regenerado) também tem de ser aprovada
    const p = makeProject(), dir = tmp("guards-out-"), prev = join(dir, "prev.zip"), next = join(dir, "next.zip");
    const a = run(p.root, "make-delivery-zip.mjs", prev);
    check(a.status === 0, "zip anterior criado (controlo)", out(a));
    rmSync(join(p.root, "packages/cairn-kit/src/extra.mjs"));
    run(p.root, "check-manifest.mjs", "--write"); // o manifesto já não lista o ficheiro: só o --against o apanha
    const r = run(p.root, "make-delivery-zip.mjs", next, "--against", prev);
    check(r.status === 1 && /já NÃO estão neste zip: packages\/cairn-kit\/src\/extra\.mjs/.test(r.stderr), "--against: recusa o ficheiro que existia no zip anterior e desapareceu", out(r));
    rmSync(next, { force: true });
    const ok = run(p.root, "make-delivery-zip.mjs", next, "--against", prev, "--allow-removed", "packages/cairn-kit/src/extra.mjs");
    check(ok.status === 0 && existsSync(next), "--allow-removed <caminho>: a remoção aprovada passa", out(ok));
  }

  // ============================================================================================================
  section("2. Ficheiro privado é recusado");
  {
    const p = makeProject();
    plantPrivate(p);
    run(p.root, "check-manifest.mjs", "--write");
    const manifest = readFileSync(join(p.root, "FILES.manifest"), "utf8").split("\n");
    check(PRIVATE_PATHS.every((f) => !manifest.includes(f)), "check-manifest --write: nenhum ficheiro privado/lixo entra no FILES.manifest", manifest.join("\n"));
    check(["corpus/real-world/.gitkeep", "corpus/huge/.gitkeep", ".env.example"].every((f) => manifest.includes(f)), "…mas os .gitkeep e o .env.example (públicos) continuam listados", manifest.join("\n"));

    const dir = tmp("guards-out-"), zip = join(dir, "clean.zip");
    const r = run(p.root, "make-delivery-zip.mjs", zip);
    const names = existsSync(zip) ? zipList(zip) : [];
    check(r.status === 0 && PRIVATE_PATHS.every((f) => !names.includes(f)), "make-delivery-zip: o zip construído não contém nenhum dos 4 ficheiros plantados", out(r) + "\n" + names.join("\n"));

    // o verificador é a 2.ª linha de defesa: tem de recusar um zip que os traga (feito à mão, contornando o manifesto)
    const bad = join(dir, "bad.zip");
    copyFileSync(zip, bad);
    zipAdd(p.root, bad, ...PRIVATE_PATHS);
    const v = run(p.root, "verify-delivery-zip.mjs", bad);
    check(v.status === 1 && /NUNCA podem sair do projeto/.test(v.stderr), "verify-delivery-zip: recusa o zip com ficheiros privados", out(v));
    check(/corpus privado \(corpus\/real-world\)/.test(v.stderr) && /ficheiro \.env \(segredos\)/.test(v.stderr), "…e diz porquê (corpus privado, .env)", out(v));
    check(/artefacto de Python/.test(v.stderr), "…e também artefactos de Python (4 plantados < 8 da lista truncada da mensagem)", out(v));
  }

  // ============================================================================================================
  section("3. Dois ficheiros de estado são recusados");
  {
    const p = makeProject(), dir = tmp("guards-out-"), zip = join(dir, "one.zip");
    run(p.root, "make-delivery-zip.mjs", zip);
    const two = join(dir, "two.zip");
    copyFileSync(zip, two);
    p.w("CAIRN_PROJECT_STATUS-8.md", "# status 8\n");
    zipAdd(p.root, two, "CAIRN_PROJECT_STATUS-8.md");
    const v = run(p.root, "verify-delivery-zip.mjs", two);
    check(v.status === 1 && /exatamente 1 CAIRN_PROJECT_STATUS-N\.md na raiz \(há 2\)/.test(v.stderr), "verify-delivery-zip: recusa um zip com -7 e -8", out(v));

    // e no caminho completo, com os dois ficheiros na árvore de trabalho
    const full = join(dir, "full.zip");
    run(p.root, "check-manifest.mjs", "--write");
    const r = run(p.root, "make-delivery-zip.mjs", full);
    check(r.status === 1 && /exatamente 1 CAIRN_PROJECT_STATUS-N\.md na raiz \(há 2\)/.test(r.stderr), "make-delivery-zip: com -7 e -8 na árvore, a entrega é recusada", out(r));
    check(!existsSync(full), "…e também aqui o zip reprovado não fica em disco", `ficou: ${full}`);
  }

  // ============================================================================================================
  section("4. `seq=` errado é recusado");
  {
    const p = makeProject({ seq: 7, clSeq: 6 }), dir = tmp("guards-out-"), zip = join(dir, "seq.zip");
    const r = run(p.root, "make-delivery-zip.mjs", zip);
    check(r.status === 1 && /ficheiro de estado é -7 mas o fingerprint do CHANGELOG diz seq=6/.test(r.stderr), "make-delivery-zip: estado -7 com CHANGELOG seq=6 é recusado, com a mensagem certa", out(r));
    check(!existsSync(zip), "…e o zip reprovado NÃO fica em disco (a mensagem \"nenhum zip foi criado\" é verdadeira)", `ficou: ${zip}`);
    check(/entrega abortada/.test(r.stderr) && /apagado/.test(r.stderr), "…e a mensagem diz que o zip reprovado foi apagado", out(r));
    // a verificação autónoma de um zip com seq errado continua a recusá-lo (zip feito à mão, sem passar pelo make)
    const good = makeProject({ seq: 7, clSeq: 7 }), hand = join(dir, "hand.zip");
    run(good.root, "make-delivery-zip.mjs", hand);
    writeFileSync(join(good.root, "CHANGELOG.md"), `<!-- CHANGELOG_FINGERPRINT: ${FP(6)} -->\n# Changelog\n`);
    spawnSync("zip", ["-q", hand, "CHANGELOG.md"], { cwd: good.root, env: ENV });
    const v = run(good.root, "verify-delivery-zip.mjs", hand);
    check(v.status === 1 && /diz seq=6/.test(v.stderr), "verify-delivery-zip, sozinho, recusa um zip feito à mão com seq=6", out(v));
  }

  section("4b. O próprio `zip` falha a meio: não fica zip parcial");
  {
    const p = makeProject(), zip = join(tmp("guards-out-"), "partial.zip");
    const BIN2 = tmp("guards-bin2-");
    for (const n of ["node", "unzip"]) symlinkSync(join(BIN, n), join(BIN2, n));
    writeFileSync(join(BIN2, "zip"), '#!/bin/sh\nprintf partial > "$2"\nexit 1\n', { mode: 0o755 });
    const r = spawnSync(process.execPath, [join(p.root, "scripts/make-delivery-zip.mjs"), zip], { cwd: p.root, encoding: "utf8", env: { ...ENV, PATH: BIN2 } });
    check(r.status === 1 && /o comando zip falhou/.test(r.stderr), "zip falso que falha: exit 1 e mensagem própria", out(r));
    check(!existsSync(zip), "…e o zip parcial é apagado", `ficou: ${zip}`);
  }

  // ============================================================================================================
  section("5. Ronda `1b` é reconhecida (archive-changelog)");
  {
    const p = makeProject();
    const entry = (r) => `## Round ${r} — título ${r} (2026-10-07)\n- linha de ${r}\n\n`;
    writeFileSync(join(p.root, "CHANGELOG.md"), `<!-- CHANGELOG_FINGERPRINT: ${FP(7)} -->\n# Cairn changelog\n\n${["2", "1b", "1"].map(entry).join("")}`);
    const r = run(p.root, "archive-changelog.mjs", "--dry-run", "--keep", "3");
    check(r.status === 0 && /3 rondas \(2, 1b, 1\)/.test(r.stdout), "rondas 2, 1b, 1: as três são reconhecidas (a 1b não é ignorada)", out(r));
    writeFileSync(join(p.root, "CHANGELOG.md"), `<!-- CHANGELOG_FINGERPRINT: ${FP(7)} -->\n# Cairn changelog\n\n${["1g", "1f", "1e", "1d", "1c"].map(entry).join("")}`);
    const s = run(p.root, "archive-changelog.mjs", "--dry-run", "--keep", "3");
    check(s.status === 0 && /manter 3 rondas \(1g … 1e\); arquivar 2 rondas \(1c-1d\)/.test(s.stdout), "rondas só com sufixo (1g … 1c), como no CHANGELOG real: ordem por posição; arquiva 1d e 1c (nome 1c-1d)", out(s));
    check(!existsSync(join(p.root, "CHANGELOG-archive-rounds-1c-1d.md")), "…e o --dry-run não escreveu o arquivo", "");
  }

  // ============================================================================================================
  section("6. check-build recusa sintaxe partida");
  {
    const p = makeProject();
    const ok = run(p.root, "check-build.mjs");
    check(ok.status === 0 && /✓ node --check passou/.test(ok.stdout), "check-build num projeto válido: exit 0", out(ok));
    p.w("packages/cairn-kit/src/partido.mjs", "export function cortado() {\n  if (true) {\n");
    const r = run(p.root, "check-build.mjs");
    check(r.status === 1 && /packages\/cairn-kit\/src\/partido\.mjs/.test(r.stderr), "check-build com um .mjs partido: exit 1 e nomeia o ficheiro", out(r));
    const zip = join(tmp("guards-out-"), "partido.zip");
    const m = run(p.root, "make-delivery-zip.mjs", zip);
    check(m.status === 1 && !existsSync(zip) && /check-build\.mjs falhou/.test(m.stderr), "make-delivery-zip: a entrega é abortada e nenhum zip é criado", out(m));
  }

  // ============================================================================================================
  section("7. Nomes não-ASCII com o `unzip` do macOS (round 1p)");
  {
    // O `unzip -Z1` do macOS escreve cada byte não-ASCII como `?`. Aqui um `unzip` falso faz o mesmo (só no -Z1;
    // `-p` e o resto passam ao `unzip` real). O verify-delivery-zip não pode depender da listagem do `unzip`.
    const BIN3 = tmp("guards-bin3-");
    for (const n of ["node", "zip"]) symlinkSync(join(BIN, n), join(BIN3, n));
    const realUnzip = realWhich("unzip");
    const mangle = `process.stdin.on("data",(b)=>process.stdout.write(Buffer.from(b.map((x)=>(x>127?63:x)))))`;
    writeFileSync(join(BIN3, "unzip"), `#!/bin/sh\nif [ "$1" = "-Z1" ]; then ${realUnzip} "$@" | ${process.execPath} -e '${mangle}'; else exec ${realUnzip} "$@"; fi\n`, { mode: 0o755 });
    const ENV3 = { ...ENV, PATH: BIN3 };
    const probe = spawnSync("/bin/sh", ["-c", `printf 'x' > "$0/a.txt" && cd "$0" && zip -q a.zip a.txt && unzip -Z1 a.zip`, tmp("guards-probe-")], { env: ENV3, encoding: "utf8" });
    check(probe.status === 0 && probe.stdout.trim() === "a.txt", "(controlo) o `unzip` falso arranca e lista nomes ASCII sem os alterar", out(probe));
    const NAME = "corpus/edge/names/relatório – ação 日本語.pdf";
    const p = makeProject();
    p.w(NAME, "%PDF-1.4 nome unicode\n");
    const mw = run(p.root, "check-manifest.mjs", "--write");
    check(mw.status === 0 && readFileSync(join(p.root, "FILES.manifest"), "utf8").split("\n").includes(NAME), "o manifesto lista o ficheiro com nome unicode", out(mw));

    const dir = tmp("guards-out-");
    const good = join(dir, "unicode.zip");
    const r = spawnSync(process.execPath, [join(p.root, "scripts/make-delivery-zip.mjs"), good], { cwd: p.root, encoding: "utf8", env: ENV3, maxBuffer: 1 << 26 });
    check(r.status === 0 && existsSync(good) && /entrega criada e verificada/.test(r.stdout), "make-delivery-zip: com o `unzip` que mostra `?`, a entrega com nome unicode passa", out(r));
    const v = spawnSync(process.execPath, [join(p.root, "scripts/verify-delivery-zip.mjs"), good], { cwd: p.root, encoding: "utf8", env: ENV3 });
    check(v.status === 0 && !/\?/.test(v.stdout.replace(/\n/g, "")), "verify-delivery-zip, sozinho, aprova o mesmo zip e não imprime nomes com `?`", out(v));

    // controlo negativo: um zip SEM o ficheiro unicode tem de continuar a ser recusado, com o nome certo na mensagem
    const manifest = readFileSync(join(p.root, "FILES.manifest"), "utf8").split("\n").filter(Boolean);
    const bad = join(dir, "sem-unicode.zip");
    zipAdd(p.root, bad, ...manifest.filter((f) => f !== NAME), "FILES.manifest");
    const b = spawnSync(process.execPath, [join(p.root, "scripts/verify-delivery-zip.mjs"), bad], { cwd: p.root, encoding: "utf8", env: ENV3 });
    check(b.status === 1 && b.stderr.includes(`NÃO estão no zip: ${NAME}`), "…e um zip a que falta esse ficheiro continua recusado, com o nome verdadeiro (não `?`)", out(b));

    // um upload anterior com o nome em forma decomposta (NFD, como o macOS grava) não conta como ficheiro perdido
    const nfd = NAME.normalize("NFD");
    check(nfd !== NAME, "(controlo) a forma NFD do nome é mesmo diferente em bytes", "");
    const prevRoot = tmp("guards-prev-");
    mkdirSync(join(prevRoot, dirname(nfd)), { recursive: true });
    writeFileSync(join(prevRoot, nfd), "%PDF-1.4 nome unicode\n");
    writeFileSync(join(prevRoot, "README.md"), "readme\n"); // um ficheiro na raiz: senão o zip parece ter uma pasta a envolver
    const prev = join(dir, "upload-nfd.zip");
    zipAdd(prevRoot, prev, nfd, "README.md");
    const a = spawnSync(process.execPath, [join(p.root, "scripts/verify-delivery-zip.mjs"), good, "--against", prev], { cwd: p.root, encoding: "utf8", env: ENV3 });
    check(a.status === 0 && /nada perdido face a upload-nfd\.zip/.test(a.stdout), "--against: um upload com o nome em NFD não é dado como ficheiro perdido", out(a));
  }

  section("8. Manifesto em NFD, disco em NFC (CI Linux, round 1r)");
  {
    // O `FILES.manifest` escrito no macOS tem os nomes em NFD; o checkout do git no Linux traz o mesmo nome em NFC.
    // Antes da 1r o `check-manifest` via aí um ficheiro "novo" E um "perdido" e o CI falhava.
    const NAME = "corpus/edge/names/relatório final (v2) – ação #1 日本語.pdf";
    const nfd = NAME.normalize("NFD");
    check(nfd !== NAME, "(controlo) NFC e NFD do nome são mesmo diferentes em bytes", "");
    const p = makeProject();
    p.w(NAME, "%PDF-1.4 nome unicode\n");
    const man = join(p.root, "FILES.manifest");
    const lines = readFileSync(man, "utf8").split("\n").filter(Boolean).filter((l) => l !== NAME && l !== nfd);
    writeFileSync(man, [...lines, nfd].sort().join("\n") + "\n"); // manifesto "do Mac": nome em NFD
    const r = run(p.root, "check-manifest.mjs");
    check(r.status === 0 && /nenhum ficheiro perdido/.test(r.stdout) && !/novo\(s\)|PERDIDO/.test(r.stdout + r.stderr), "check-manifest: nome em NFD no manifesto e em NFC no disco passa, sem avisos", out(r));
    // controlo negativo: um ficheiro realmente perdido continua a falhar, com o nome verdadeiro do manifesto
    writeFileSync(man, readFileSync(man, "utf8") + "docs/realmente-perdido.md\n");
    const l = run(p.root, "check-manifest.mjs");
    check(l.status === 1 && l.stderr.includes("docs/realmente-perdido.md") && !l.stderr.includes("日本語"), "…e um ficheiro mesmo perdido continua a falhar (e só esse)", out(l));
    // --write continua fiel ao disco (o zip é feito a partir destes nomes)
    const w = run(p.root, "check-manifest.mjs", "--write");
    check(w.status === 0 && readFileSync(man, "utf8").split("\n").includes(NAME), "--write grava o nome tal como está no disco (NFC aqui)", out(w));
  }

  console.log(failed ? `\n✗ guardas de entrega: ${failed} verificação(ões) FALHARAM, ${passed} passaram` : `\n✓ smoke-test-delivery-guards: ${passed} verificações passaram`);
} finally {
  for (const d of cleanup) rmSync(d, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
