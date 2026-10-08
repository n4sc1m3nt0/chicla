#!/usr/bin/env node
// Teste de fumo do W5: archive-changelog com rondas de sufixo (1, 1b, 1c, 2, 2b), numa cópia em tmpdir.
//   node scripts/smoke-test-archive-changelog.mjs
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const T = mkdtempSync(join(tmpdir(), "cairn-w5-"));
mkdirSync(join(T, "scripts"));
copyFileSync(join(ROOT, "scripts/archive-changelog.mjs"), join(T, "scripts/archive-changelog.mjs"));
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failed++; };
const run = (...a) => spawnSync(process.execPath, [join(T, "scripts/archive-changelog.mjs"), ...a], { encoding: "utf8" });
const entry = (r) => `## Round ${r} — título ${r} (2026-10-07)\n- linha de ${r}\n\n`;
const write = (labels) => { const t = `<!-- CHANGELOG_FINGERPRINT: seq=1 -->\n# Cairn changelog\n\n${labels.map(entry).join("")}`; writeFileSync(join(T, "CHANGELOG.md"), t); return t; };

// 1. rondas 1, 1b, 2 (o exemplo do plano): as três são reconhecidas
write(["2", "1b", "1"]);
let r = run("--dry-run", "--keep", "3");
check(r.status === 0 && /3 rondas \(2, 1b, 1\)/.test(r.stdout), "1, 1b, 2: as três reconhecidas");
// 2. cinco rondas mistas, --keep 3: dry-run não escreve; arquivar move as duas mais antigas por POSIÇÃO
const original = write(["2b", "2", "1c", "1b", "1"]);
r = run("--dry-run", "--keep", "3");
check(r.status === 0 && /manter 3 rondas \(2b … 1c\); arquivar 2 rondas \(1-1b\)/.test(r.stdout), "dry-run: mantém 2b,2,1c; arquiva 1b e 1 (nome 1-1b)");
check(readFileSync(join(T, "CHANGELOG.md"), "utf8") === original && !readdirSync(T).some((f) => f.startsWith("CHANGELOG-archive")), "dry-run não escreveu nada");
r = run("--keep", "3");
const arch = join(T, "CHANGELOG-archive-rounds-1-1b.md");
check(r.status === 0 && existsSync(arch), "arquivo CHANGELOG-archive-rounds-1-1b.md criado");
const live = readFileSync(join(T, "CHANGELOG.md"), "utf8"), moved = readFileSync(arch, "utf8");
check(!/^## Round (1b|1)\b/m.test(live) && /^## Round 1c\b/m.test(live) && /Archived rounds \(nothing deleted\): `CHANGELOG-archive-rounds-1-1b\.md`/.test(live), "CHANGELOG vivo só tem 2b, 2, 1c e a linha de índice");
const liveNoIndex = live.replace(/^Archived rounds .*\n\n/m, ""), body = moved.slice(moved.search(/^## Round 1b\b/m)); // (o cabeçalho do arquivo também contém o texto "## Round " num exemplo)
check(liveNoIndex + body === original, "vivo (sem índice) + arquivo (sem cabeçalho) reconstitui o original byte a byte");
check(run("--keep", "3").status === 0 && readdirSync(T).filter((f) => f.startsWith("CHANGELOG-archive")).length === 1, "segunda corrida: nada a arquivar, nada sobrescrito");
rmSync(T, { recursive: true, force: true });
console.log(failed ? `\n✗ ${failed} verificação(ões) falharam` : "\n✓ smoke-test-archive-changelog: tudo passou");
process.exit(failed ? 1 : 0);
