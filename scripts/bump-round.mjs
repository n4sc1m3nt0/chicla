#!/usr/bin/env node
// Mechanical close of a round (status file, instructions 8, 11 and 13).
//
//   node scripts/bump-round.mjs               N -> N+1: renames the status file, rewrites the 3 fingerprints
//                                             (APP_FILE line 3, CHANGELOG line 1, "Fingerprint:" paragraph of the status file)
//                                             with recomputed hashes and regenerates FILES.manifest
//   node scripts/bump-round.mjs --dry-run     shows what would change, writes nothing
//   node scripts/bump-round.mjs --refresh     recomputes hashes WITHOUT changing the number (CHANGELOG edited after the bump;
//                                             instruction 8 forbids skipping numbers)
//   node scripts/bump-round.mjs --verify      only checks (instruction 11 a-c); exit 1 if anything does not match
//   --note "text"                             adds a note to the fingerprint comment of the app and of the CHANGELOG
//
// WHEN TO RUN: at step ③/④ of the "closing kit", AFTER the CHANGELOG entry, "Last updated" and any
// app edit are final (the hashes are of the final content) and BEFORE make-delivery-zip.mjs.
// The hashes are computed over BYTES: app = tail -n +4 | sha256sum; CHANGELOG = tail -n +2 | sha256sum (12 hex).
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
// --- Chicla configuration -------------------------------------------------------------------------------
// APP_FILE is the "app leg" of the fingerprint: a small, stable file that changes every round (the version).
// It must carry the STATUS_FILE_FINGERPRINT comment on LINE 3; the hash covers everything from line 4 on.
// `//` comment for .mjs/.js/.ts, `<!-- -->` for .html/.md.
const APP_FILE = "version.mjs";
// ---------------------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const note = has("--note") ? args[args.indexOf("--note") + 1] ?? "" : "";
const MODE = has("--verify") ? "verify" : has("--refresh") ? "refresh" : "bump";
const DRY = has("--dry-run");
const P = (f) => join(ROOT, f);
const fail = (m) => { console.error(`\n✗ ${m}`); process.exit(1); };

// tail -n +n, in bytes (n=1 is the whole file)
const tailFrom = (buf, n) => { let p = 0; for (let i = 1; i < n; i++) { const j = buf.indexOf(10, p); if (j < 0) return Buffer.alloc(0); p = j + 1; } return buf.subarray(p); };
const h12 = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 12);
const lineOf = (buf, n) => tailFrom(buf, n).toString("utf8").split("\n", 1)[0];
const replaceLine = (buf, n, text) => Buffer.concat([buf.subarray(0, buf.length - tailFrom(buf, n).length), Buffer.from(text + "\n"), tailFrom(buf, n + 1)]);

const FP = /seq=(\d+) file=(\S+) app_sha256_12=([0-9a-f]{12}) changelog_sha256_12=([0-9a-f]{12})/;
const PARA = /\*\*Fingerprint:\*\* seq=(\d+) · app=(\S+) ·\s*app_sha256_12=([0-9a-f]{12})[\s\S]*?changelog_sha256_12=([0-9a-f]{12})[\s\S]*?before doing anything else\./g;

function readState() {
  const names = readdirSync(ROOT);
  const st = names.filter((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f));
  const apOk = existsSync(P(APP_FILE));
  if (st.length !== 1) fail(`there must be exactly 1 CHICLA_PROJECT_STATUS-N.md in the root (found ${st.length}).`);
  if (!apOk) fail(`${APP_FILE} is missing (the "app" leg of the fingerprint; see APP_FILE at the top of bump-round.mjs).`);
  if (!names.includes("CHANGELOG.md")) fail("CHANGELOG.md is missing from the root.");
  const s = { statusName: st[0], seq: +st[0].match(/-(\d+)\.md$/)[1], appName: APP_FILE, app: readFileSync(P(APP_FILE)), cl: readFileSync(P("CHANGELOG.md")), stBuf: readFileSync(P(st[0])) };
  s.stTxt = s.stBuf.toString("utf8");
  if (!Buffer.from(s.stTxt, "utf8").equals(s.stBuf)) fail(`${s.statusName} is not valid UTF-8; not rewriting it, to avoid corrupting it.`);
  s.appFp = lineOf(s.app, 3).match(FP); s.clFp = lineOf(s.cl, 1).match(FP);
  const paras = [...s.stTxt.matchAll(PARA)];
  s.stFp = paras.length === 1 ? paras[0] : null;
  if (!s.appFp || !lineOf(s.app, 3).includes("STATUS_FILE_FINGERPRINT")) fail(`${s.appName}: line 3 is not a valid STATUS_FILE_FINGERPRINT.`);
  if (!s.clFp || !lineOf(s.cl, 1).includes("CHANGELOG_FINGERPRINT")) fail("CHANGELOG.md: line 1 is not a valid CHANGELOG_FINGERPRINT.");
  if (!s.stFp) fail(`${s.statusName}: there must be exactly 1 paragraph "**Fingerprint:** … before doing anything else." (found ${paras.length}).`);
  s.hApp = h12(tailFrom(s.app, 4)); s.hCl = h12(tailFrom(s.cl, 2));
  return s;
}

function verify(s) { // instruction 11 a-c
  const eq = (a, b) => a === b;
  return [
    [`app: seq=${s.appFp[1]} = status file -${s.seq}`, eq(+s.appFp[1], s.seq)],
    [`CHANGELOG: seq=${s.clFp[1]} = -${s.seq}`, eq(+s.clFp[1], s.seq)],
    [`status file: seq=${s.stFp[1]} = -${s.seq}`, eq(+s.stFp[1], s.seq)],
    [`file= points to ${s.statusName} (app and CHANGELOG)`, eq(s.appFp[2], s.statusName) && eq(s.clFp[2], s.statusName)],
    [`app=${s.appName} in the status file paragraph`, eq(s.stFp[2], s.appName)],
    [`app hash ${s.hApp} = app, CHANGELOG and status file`, [s.appFp[3], s.clFp[3], s.stFp[3]].every((h) => h === s.hApp)],
    [`CHANGELOG hash ${s.hCl} = app, CHANGELOG and status file`, [s.appFp[4], s.clFp[4], s.stFp[4]].every((h) => h === s.hCl)],
  ];
}
const report = (checks) => { for (const [l, ok] of checks) console.log(`  ${ok ? "✓" : "✗"} ${l}`); return checks.every(([, ok]) => ok); };

const s = readState();
if (MODE === "verify") { console.log(`bump-round --verify (status file -${s.seq}):`); process.exit(report(verify(s)) ? 0 : 1); }

// bump / refresh: the links must be paired BEFORE (11a) — never pair blindly
if (+s.appFp[1] !== s.seq || +s.clFp[1] !== s.seq || +s.stFp[1] !== s.seq)
  fail(`the app says seq=${s.appFp[1]}, the CHANGELOG seq=${s.clFp[1]}, the status file paragraph seq=${s.stFp[1]}, but the status file is -${s.seq} (instruction 11a). I wrote nothing; tell Rodrigo.`);

const seq = MODE === "bump" ? s.seq + 1 : s.seq;
const newName = `CHICLA_PROJECT_STATUS-${seq}.md`;
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
console.log(`  status file        : ${s.statusName}${newName !== s.statusName ? ` → ${newName}` : " (name kept)"}`);
console.log(`  app hash           : ${s.appFp[3]} → ${s.hApp} (${appChanged ? "CHANGED" : "unchanged"})`);
console.log(`  CHANGELOG hash     : ${s.clFp[4]} → ${s.hCl}${s.clFp[4] === s.hCl ? " (unchanged)" : ""}`);
console.log(`  rewritten          : ${s.appName} line 3 · CHANGELOG.md line 1 · "Fingerprint:" paragraph of the status file`);
if (DRY) { console.log("  (dry-run: nothing was written)"); process.exit(0); }

writeFileSync(P(s.appName), newApp);
writeFileSync(P("CHANGELOG.md"), newCl);
writeFileSync(P(s.statusName), newSt);
if (newName !== s.statusName) renameSync(P(s.statusName), P(newName));
const man = spawnSync(process.execPath, [P("scripts/check-manifest.mjs"), "--write"], { cwd: ROOT, encoding: "utf8" });
if (man.status !== 0) fail(`check-manifest --write failed:\n${man.stdout}${man.stderr}`);
console.log(`  ${man.stdout.trim()}`);
console.log("final check (instruction 11 a-c, on what is on disk):");
if (!report(verify(readState()))) fail("the fingerprints did not end up consistent — do NOT deliver; run --verify and investigate.");
console.log(`✓ round closed mechanically: ${newName}. Still to do (by hand): CHANGELOG entry, "Last updated", Backlog, and then make-delivery-zip.mjs.`);
