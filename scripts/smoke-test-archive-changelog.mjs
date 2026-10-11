#!/usr/bin/env node
// Smoke test (W5): archive-changelog with suffixed rounds (1, 1b, 1c, 2, 2b), run on a copy in a tmpdir.
//   node scripts/smoke-test-archive-changelog.mjs
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const T = mkdtempSync(join(tmpdir(), "chicla-w5-"));
mkdirSync(join(T, "scripts"));
copyFileSync(join(ROOT, "scripts/archive-changelog.mjs"), join(T, "scripts/archive-changelog.mjs"));
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failed++; };
const run = (...a) => spawnSync(process.execPath, [join(T, "scripts/archive-changelog.mjs"), ...a], { encoding: "utf8" });
const entry = (r) => `## Round ${r} — title ${r} (2026-10-07)\n- line of ${r}\n\n`;
const write = (labels) => { const t = `<!-- CHANGELOG_FINGERPRINT: seq=1 -->\n# Chicla changelog\n\n${labels.map(entry).join("")}`; writeFileSync(join(T, "CHANGELOG.md"), t); return t; };

// 1. rounds 1, 1b, 2 (the example in the plan): all three are recognised
write(["2", "1b", "1"]);
let r = run("--dry-run", "--keep", "3");
check(r.status === 0 && /only 3 rounds \(2, 1b, 1\)/.test(r.stdout), "1, 1b, 2: all three recognised");
// 2. five mixed rounds, --keep 3: dry-run writes nothing; archiving moves the two oldest by POSITION
const original = write(["2b", "2", "1c", "1b", "1"]);
r = run("--dry-run", "--keep", "3");
check(r.status === 0 && /keep 3 rounds \(2b … 1c\); archive 2 rounds \(1-1b\)/.test(r.stdout), "dry-run: keeps 2b, 2, 1c; archives 1b and 1 (name 1-1b)");
check(readFileSync(join(T, "CHANGELOG.md"), "utf8") === original && !readdirSync(T).some((f) => f.startsWith("CHANGELOG-archive")), "dry-run wrote nothing");
r = run("--keep", "3");
const arch = join(T, "CHANGELOG-archive-rounds-1-1b.md");
check(r.status === 0 && existsSync(arch), "archive CHANGELOG-archive-rounds-1-1b.md created");
const live = readFileSync(join(T, "CHANGELOG.md"), "utf8"), moved = readFileSync(arch, "utf8");
check(!/^## Round (1b|1)\b/m.test(live) && /^## Round 1c\b/m.test(live) && /Archived rounds \(nothing deleted\): `CHANGELOG-archive-rounds-1-1b\.md`/.test(live), "live CHANGELOG has only 2b, 2, 1c and the index line");
const liveNoIndex = live.replace(/^Archived rounds .*\n\n/m, ""), body = moved.slice(moved.search(/^## Round 1b\b/m)); // (the archive header also contains the text "## Round " in an example)
check(liveNoIndex + body === original, "live (without index) + archive (without header) rebuilds the original byte for byte");
check(run("--keep", "3").status === 0 && readdirSync(T).filter((f) => f.startsWith("CHANGELOG-archive")).length === 1, "second run: nothing to archive, nothing overwritten");
rmSync(T, { recursive: true, force: true });
console.log(failed ? `\n✗ ${failed} check(s) failed` : "\n✓ smoke-test-archive-changelog: all passed");
process.exit(failed ? 1 : 0);
