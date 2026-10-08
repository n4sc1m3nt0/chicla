#!/usr/bin/env node
// "Dieta" do CHANGELOG: move as rondas antigas para CHANGELOG-archive-rounds-<min>-<max>.md.
// Nada é apagado (instrução 6 do ficheiro de estado): o corte é por bytes e é verificado antes de escrever.
//
//   node scripts/archive-changelog.mjs --dry-run         mostra o que moveria (por omissão mantém as 10 rondas mais recentes)
//   node scripts/archive-changelog.mjs                   move
//   node scripts/archive-changelog.mjs --keep 12         mantém as 12 mais recentes
//
// QUANDO CORRER: em lotes, não todas as rondas — quando o CHANGELOG vivo passar de ~20 rondas, reduzir a 10.
// Corre ANTES de escrever a entrada da ronda atual (ou conta com ela em --keep) e DEPOIS corre node scripts/bump-round.mjs
// (o hash do CHANGELOG na linha 1 cobre o conteúdo vivo; bump-round recalcula-o). A linha 1 (fingerprint) não se toca aqui.
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const KEEP = args.includes("--keep") ? Number(args[args.indexOf("--keep") + 1]) : 10;
const fail = (m) => { console.error(`\n✗ ${m}`); process.exit(1); };
if (!Number.isInteger(KEEP) || KEEP < 3) fail("--keep tem de ser um inteiro >= 3.");

const path = join(ROOT, "CHANGELOG.md");
const buf = readFileSync(path);
const text = buf.toString("utf8");
if (Buffer.from(text, "utf8").length !== buf.length) fail("CHANGELOG.md não é UTF-8 válido; nada foi alterado.");
if (!/^<!-- CHANGELOG_FINGERPRINT:/.test(text)) fail("a linha 1 do CHANGELOG não é o fingerprint; nada foi alterado.");

// Posição (em caracteres) do início de cada entrada "## Round <rótulo>". O rótulo é texto (`12`, `1b`, `1c`…, D5): nunca
// se compara numericamente; a ordem é a das entradas no ficheiro (a mais recente primeiro).
const ROUND_RE = /^## Round (\d+[a-z]?)\b/gm;
const roundStarts = [...text.matchAll(ROUND_RE)].map((m) => ({ at: m.index, n: m[1] }));
if (roundStarts.length <= KEEP) { console.log(`✓ só há ${roundStarts.length} rondas (${roundStarts.map((r) => r.n).join(", ")}); <= ${KEEP}, nada a arquivar.`); process.exit(0); }

const cut = roundStarts[KEEP].at;              // a (KEEP+1)-ª entrada e tudo o que vem depois vai para o arquivo
const live = text.slice(0, cut);
const moved = text.slice(cut);
const movedRounds = [...moved.matchAll(ROUND_RE)].map((m) => m[1]);
const hi = movedRounds[0], lo = movedRounds[movedRounds.length - 1]; // por posição: a primeira movida é a mais recente, a última a mais antiga
const archName = `CHANGELOG-archive-rounds-${lo}-${hi}.md`;
const archPath = join(ROOT, archName);
if (existsSync(archPath)) fail(`${archName} já existe; não vou sobrescrever. Move-o ou usa outro --keep.`);

const header = `# Changelog archive — rounds ${lo}-${hi}\n\nMoved out of \`CHANGELOG.md\` verbatim by \`scripts/archive-changelog.mjs\`. Nothing was edited or deleted;\nthis file has no fingerprint and is not part of the fingerprint triple. Find an entry with\n\`grep -n "^## Round 12" CHANGELOG-archive-*.md\`.\n\n`;

// Linha de índice no CHANGELOG vivo (antes da primeira entrada), mantida pelo script.
const idxRe = /^Archived rounds \(nothing deleted\): (.*)$/m;
let newLive = live;
const item = `\`${archName}\``;
if (idxRe.test(newLive)) newLive = newLive.replace(idxRe, (_, rest) => `Archived rounds (nothing deleted): ${rest}, ${item}`);
else newLive = newLive.replace(/^## Round /m, `Archived rounds (nothing deleted): ${item}. References to older rounds elsewhere in the docs ("see CHANGELOG.md's Round N") live there now.\n\n## Round `);

// Verificação: o que se escreve tem de reconstituir o original byte a byte.
const rebuilt = live + moved;
if (rebuilt !== text) fail("verificação interna falhou (live + movido != original); nada foi alterado.");
const keptRounds = roundStarts.slice(0, KEEP).map((r) => r.n);
console.log(`${DRY ? "[dry-run] " : ""}manter ${KEEP} rondas (${keptRounds[0]} … ${keptRounds[KEEP - 1]}); arquivar ${movedRounds.length} rondas (${lo}-${hi})`);
console.log(`  CHANGELOG.md: ${buf.length} → ${Buffer.byteLength(newLive)} bytes · ${archName}: ${Buffer.byteLength(header + moved)} bytes`);
if (DRY) process.exit(0);

writeFileSync(archPath, header + moved);
if (readFileSync(archPath, "utf8") !== header + moved) fail("o arquivo escrito não confere; reverte apagando-o e repete.");
writeFileSync(path, newLive);
console.log(`✓ feito. Falta: node scripts/bump-round.mjs --refresh (ou o bump normal) para recalcular o hash do CHANGELOG.`);
