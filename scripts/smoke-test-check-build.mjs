#!/usr/bin/env node
// Teste de fumo de check-build: projeto falso em tmpdir (não toca na árvore real).
//   node scripts/smoke-test-check-build.mjs
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const T = mkdtempSync(join(tmpdir(), "cairn-check-build-"));
const proj = join(T, "proj");
mkdirSync(join(proj, "scripts"), { recursive: true });
copyFileSync(join(ROOT, "scripts/check-build.mjs"), join(proj, "scripts/check-build.mjs"));
let failed = 0;
const check = (ok, what, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) { failed++; if (detail) console.log(detail); } };
const put = (rel, body) => { mkdirSync(join(proj, rel, ".."), { recursive: true }); writeFileSync(join(proj, rel), body); };
const run = () => spawnSync(process.execPath, [join(proj, "scripts/check-build.mjs")], { encoding: "utf8" });
const out = (r) => `exit=${r.status}\n${r.stdout}\n${r.stderr}`;

put("packages/a/src/ok.mjs", "export const a = 1;\n");
put("packages/b/src/também-ok.mjs", "export function b() { return 'acentuação ç'; }\n");
let r = run();
check(r.status === 0 && /node --check em 3 ficheiros/.test(r.stdout) && /✓ node --check passou/.test(r.stdout), "tudo válido: exit 0 e conta os ficheiros (inclui o próprio script)", out(r));

put("packages/a/src/partido.mjs", "export function cortado() {\n  if (true) {\n");
r = run();
check(r.status === 1 && /falhou em 1 ficheiro/.test(r.stderr) && /packages\/a\/src\/partido\.mjs/.test(r.stderr) && /Entrega abortada/.test(r.stderr), "ficheiro com sintaxe partida: exit 1 e nomeia-o", out(r));
check(!/ok\.mjs/.test(r.stderr), "…e não acusa os ficheiros válidos", out(r));

rmSync(join(proj, "packages/a/src/partido.mjs"));
put("node_modules/dep/index.mjs", "isto não é javascript válido (\n");
put(".git/hooks/x.mjs", "((\n");
r = run();
check(r.status === 0, "node_modules e .git são ignorados mesmo com ficheiros inválidos", out(r));

put("packages/a/src/nao-mjs.js", "((\n");
r = run();
check(r.status === 0, "só verifica .mjs (um .js inválido não é lido)", out(r));

rmSync(T, { recursive: true, force: true });
console.log(failed ? `\n✗ ${failed} verificação(ões) falharam` : "\n✓ smoke-test-check-build: tudo passou");
process.exit(failed ? 1 : 0);
