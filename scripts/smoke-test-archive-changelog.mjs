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

// 3. C16.4: the status-file mode (--status): «Previous» blocks to docs/, verbatim, one index paragraph, the cold-start text unchanged
{
  const blk = (n) => `**Previous (round ${n}):** text of ${n}.\n\n`;
  const head = "# Status\n\n**Fingerprint:** seq=3 ·\napp=x\n\n**Last updated (round 9):** now.\n\n", tail = "## Snapshot\n\n- Done.\n";
  const sText = head + ["8", "7", "6", "5"].map(blk).join("") + tail;
  mkdirSync(join(T, "docs"), { recursive: true });
  writeFileSync(join(T, "CHICLA_PROJECT_STATUS-3.md"), sText);
  const before = readFileSync(join(T, "CHANGELOG.md"), "utf8");
  r = run("--status", "--dry-run", "--keep-previous", "2");
  check(r.status === 0 && /archive 2 blocks \(5-6\)/.test(r.stdout) && readFileSync(join(T, "CHICLA_PROJECT_STATUS-3.md"), "utf8") === sText, "--status --dry-run: would archive 6 and 5, wrote nothing");
  r = run("--status", "--keep-previous", "2");
  const sArch = join(T, "docs/status-archive-previous-5-6.md");
  const sLive = readFileSync(join(T, "CHICLA_PROJECT_STATUS-3.md"), "utf8");
  check(r.status === 0 && existsSync(sArch) && readFileSync(sArch, "utf8").endsWith(blk("6") + blk("5")), "--status: docs/status-archive-previous-5-6.md holds blocks 6 and 5 verbatim");
  check(sLive.replace(/^\*\*Archived «Previous» blocks.*\n\n/m, "") === head + blk("8") + blk("7") + tail, "the status file keeps 8 and 7 and the rest byte for byte (index paragraph aside)");
  check(sLive.slice(sLive.indexOf("**Fingerprint:**"), sLive.indexOf("**Last updated")) === sText.slice(sText.indexOf("**Fingerprint:**"), sText.indexOf("**Last updated")), "the cold-start text is unchanged");
  check(readFileSync(join(T, "CHANGELOG.md"), "utf8") === before, "--status left CHANGELOG.md alone");
}

// 4. C18.2: --rolling keeps the newest clauses of «Current version» and «Open decisions», archives the rest verbatim, one pointer in each
{
  const cvc = ["round 9: a", "round 8: b (x; round y)", "round 7: c", "round 6: d"], ode = ["(round 9: a)", "(round 8: b (c))", "(round 7: c)", "(round 6: d)"];
  const mk = (cv, od) => `# Status\n\n**Current version:** v1 (${cv.join("; ")}).\n\n## Next up\n\n**Open decisions:** ${od.join(" ")}\n`;
  const sText = mk(cvc, ode);
  writeFileSync(join(T, "CHICLA_PROJECT_STATUS-3.md"), sText);
  r = run("--rolling", "--dry-run", "--keep-clauses", "2");
  check(r.status === 0 && /archive 2 clauses/.test(r.stdout) && /archive 2 entries/.test(r.stdout) && readFileSync(join(T, "CHICLA_PROJECT_STATUS-3.md"), "utf8") === sText, "--rolling --dry-run: would archive 2 clauses and 2 entries, wrote nothing");
  r = run("--rolling", "--keep-clauses", "2");
  const ra = join(T, "docs/status-archive-rolling-6-7.md"), live2 = readFileSync(join(T, "CHICLA_PROJECT_STATUS-3.md"), "utf8");
  check(r.status === 0 && existsSync(ra) && readFileSync(ra, "utf8").includes("- round 7: c\n- round 6: d\n") && readFileSync(ra, "utf8").includes("- (round 7: c)\n- (round 6: d)\n"), "--rolling: docs/status-archive-rolling-6-7.md holds clauses 7 and 6 and entries 7 and 6 verbatim");
  check(live2 === mk([...cvc.slice(0, 2)], ode.slice(0, 2)).replace(").\n\n## Next up", "; older rounds archived (nothing deleted): `docs/status-archive-rolling-6-7.md`).\n\n## Next up").replace(/\n$/, " (earlier rounds: archived verbatim, nothing deleted: `docs/status-archive-rolling-6-7.md`)\n"), "the two paragraphs keep 9 and 8 plus one pointer each; the rest is as before");
}
// 5. C19.1: an unknown argument is an error and changes nothing; --help prints the usage
{
  const before = readFileSync(join(T, "CHANGELOG.md"), "utf8");
  r = run("--help-me");
  check(r.status === 2 && readFileSync(join(T, "CHANGELOG.md"), "utf8") === before, "an unknown option exits 2 and leaves CHANGELOG.md alone");
  r = run("--help");
  check(r.status === 0 && r.stdout.includes("usage") && readFileSync(join(T, "CHANGELOG.md"), "utf8") === before, "--help prints the usage, exits 0 and changes nothing");
}
rmSync(T, { recursive: true, force: true });
console.log(failed ? `\n✗ ${failed} check(s) failed` : "\n✓ smoke-test-archive-changelog: all passed");
process.exit(failed ? 1 : 0);
