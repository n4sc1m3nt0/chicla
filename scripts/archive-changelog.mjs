#!/usr/bin/env node
// CHANGELOG "diet": moves old rounds to CHANGELOG-archive-rounds-<min>-<max>.md.
// Nothing is deleted (status file, instruction 6): the cut is by bytes and is verified before writing.
//
//   node scripts/archive-changelog.mjs --dry-run         shows what it would move (by default keeps the 10 most recent rounds)
//   node scripts/archive-changelog.mjs                   moves
//   node scripts/archive-changelog.mjs --keep 12         keeps the 12 most recent
//
// WHEN TO RUN: in batches, not every round — when the live CHANGELOG passes ~20 rounds, cut it down to 10.
// Run it BEFORE writing the current round's entry (or count that entry in --keep) and AFTER it run node scripts/bump-round.mjs
// (the CHANGELOG hash on line 1 covers the live content; bump-round recomputes it). Line 1 (the fingerprint) is not touched here.
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const KEEP = args.includes("--keep") ? Number(args[args.indexOf("--keep") + 1]) : 10;
const fail = (m) => { console.error(`\n✗ ${m}`); process.exit(1); };
if (!Number.isInteger(KEEP) || KEEP < 3) fail("--keep must be an integer >= 3.");

const path = join(ROOT, "CHANGELOG.md");
const buf = readFileSync(path);
const text = buf.toString("utf8");
if (Buffer.from(text, "utf8").length !== buf.length) fail("CHANGELOG.md is not valid UTF-8; nothing was changed.");
if (!/^<!-- CHANGELOG_FINGERPRINT:/.test(text)) fail("line 1 of the CHANGELOG is not the fingerprint; nothing was changed.");

// Position (in characters) of the start of each "## Round <label>" entry. The label is text (`12`, `1b`, `1c`…, D5): it is never
// compared numerically; the order is that of the entries in the file (most recent first).
const ROUND_RE = /^## Round (\d+[a-z]?)\b/gm;
const roundStarts = [...text.matchAll(ROUND_RE)].map((m) => ({ at: m.index, n: m[1] }));
if (roundStarts.length <= KEEP) { console.log(`✓ only ${roundStarts.length} rounds (${roundStarts.map((r) => r.n).join(", ")}); <= ${KEEP}, nothing to archive.`); process.exit(0); }

const cut = roundStarts[KEEP].at;              // the (KEEP+1)th entry and everything after it goes to the archive
const live = text.slice(0, cut);
const moved = text.slice(cut);
const movedRounds = [...moved.matchAll(ROUND_RE)].map((m) => m[1]);
const hi = movedRounds[0], lo = movedRounds[movedRounds.length - 1]; // by position: the first one moved is the most recent, the last the oldest
const archName = `CHANGELOG-archive-rounds-${lo}-${hi}.md`;
const archPath = join(ROOT, archName);
if (existsSync(archPath)) fail(`${archName} already exists; not overwriting it. Move it or use another --keep.`);

const header = `# Changelog archive — rounds ${lo}-${hi}\n\nMoved out of \`CHANGELOG.md\` verbatim by \`scripts/archive-changelog.mjs\`. Nothing was edited or deleted;\nthis file has no fingerprint and is not part of the fingerprint triple. Find an entry with\n\`grep -n "^## Round 12" CHANGELOG-archive-*.md\`.\n\n`;

// Index line in the live CHANGELOG (before the first entry), maintained by the script.
const idxRe = /^Archived rounds \(nothing deleted\): (.*)$/m;
let newLive = live;
const item = `\`${archName}\``;
if (idxRe.test(newLive)) newLive = newLive.replace(idxRe, (_, rest) => `Archived rounds (nothing deleted): ${rest}, ${item}`);
else newLive = newLive.replace(/^## Round /m, `Archived rounds (nothing deleted): ${item}. References to older rounds elsewhere in the docs ("see CHANGELOG.md's Round N") live there now.\n\n## Round `);

// Check: what gets written must rebuild the original byte for byte.
const rebuilt = live + moved;
if (rebuilt !== text) fail("internal check failed (live + moved != original); nothing was changed.");
const keptRounds = roundStarts.slice(0, KEEP).map((r) => r.n);
console.log(`${DRY ? "[dry-run] " : ""}keep ${KEEP} rounds (${keptRounds[0]} … ${keptRounds[KEEP - 1]}); archive ${movedRounds.length} rounds (${lo}-${hi})`);
console.log(`  CHANGELOG.md: ${buf.length} → ${Buffer.byteLength(newLive)} bytes · ${archName}: ${Buffer.byteLength(header + moved)} bytes`);
if (DRY) process.exit(0);

writeFileSync(archPath, header + moved);
if (readFileSync(archPath, "utf8") !== header + moved) fail("the archive written does not match; undo by deleting it and run again.");
writeFileSync(path, newLive);
console.log(`✓ done. Still to do: node scripts/bump-round.mjs --refresh (or the normal bump) to recompute the CHANGELOG hash.`);
