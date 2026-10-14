#!/usr/bin/env node
// Smoke test of scripts/bump-round.mjs (adapted to the Chicla layout).
// Runs the script AS A PROCESS in a fake project in a temporary folder (copies bump-round.mjs + check-manifest.mjs + manifest.mjs
// to <tmp>/scripts), as in production. The "app" leg of the fingerprint is version.mjs
// (APP_FILE at the top of bump-round.mjs); the fake project reproduces that path and the JS comment format.
//   node scripts/smoke-test-bump-round.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { CHECK_MANIFEST_COPY, copyFiles, importPinned } from "../test/toolchain-files.mjs";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { parseManifest } = await importPinned("manifest");

const HERE = dirname(fileURLToPath(import.meta.url));
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

// hash INDEPENDENT of the script (strings + split, not Buffers)
const hashFrom = (text, fromLine) => createHash("sha256").update(text.split("\n").slice(fromLine - 1).join("\n"), "utf8").digest("hex").slice(0, 12);

const PARA = (seq, app, hApp, hCl) => `**Fingerprint:** seq=${seq} · app=${app} ·
app_sha256_12=${hApp} (of everything below the app file's own
fingerprint comment; unchanged since round 1) ·
changelog=CHANGELOG.md ·
changelog_sha256_12=${hCl} (hash of \`CHANGELOG.md\` below its own
fingerprint line; recomputed fresh this round) · matches the
\`STATUS_FILE_FINGERPRINT\` comment on line 2–3 of the app file and the
\`CHANGELOG_FINGERPRINT\` comment on line 1 of \`CHANGELOG.md\`. If any of
these three don't match what you're looking at, stop and see
instructions item 11 above before doing anything else.`;

function makeProject({ seq = 5, appSeq = seq, extraStatus = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "bump-round-"));
  copyFiles(join(HERE, ".."), root, [...CHECK_MANIFEST_COPY, "scripts/bump-round.mjs", "packages/chicla-kit/src/bump-round.mjs"]); // wrappers, their cores in the kit and the pinned files
  const appName = "version.mjs";
  const appBody = "export const APP_VERSION = \"0.0.1\"; // Accents — ç ã é · ✓\n";
  const clBody = "# Changelog\n\n## Round 1 — entry with accents: ç ã\n";
  const hApp = hashFrom("L1\nL2\nL3\n" + appBody, 4), hCl = hashFrom("X\n" + clBody, 2);
  const core = (s) => `seq=${s} file=CHICLA_PROJECT_STATUS-${s}.md app_sha256_12=${hApp} changelog_sha256_12=${hCl}`;
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fake", private: true, version: "0.0.1" }) + "\n");
  writeFileSync(join(root, appName), `//! Chicla app version (fake)\n//! (line 3 = fingerprint)\n// STATUS_FILE_FINGERPRINT: ${core(appSeq)} (old note)\n` + appBody);
  writeFileSync(join(root, "CHANGELOG.md"), `<!-- CHANGELOG_FINGERPRINT: ${core(seq)} (old note) -->\n` + clBody);
  const stBody = `# Status\n\nsee the "Fingerprint:" line below, mentioned before the real one.\n\n${PARA(seq, appName, hApp, hCl)}\n\n**Last updated (round 1):** 2026-10-02 (text with $& and $1 specials).\n`;
  writeFileSync(join(root, `CHICLA_PROJECT_STATUS-${seq}.md`), stBody);
  if (extraStatus) writeFileSync(join(root, `CHICLA_PROJECT_STATUS-${seq + 1}.md`), stBody);
  writeFileSync(join(root, "README.md"), "readme\n");
  spawnSync(process.execPath, [join(root, "scripts/check-manifest.mjs"), "--write"], { cwd: root });
  return { root, appName, appBody, clBody, hApp, hCl };
}
const run = (p, ...a) => spawnSync(process.execPath, [join(p.root, "scripts/bump-round.mjs"), ...a], { cwd: p.root, encoding: "utf8" });
const rd = (p, f) => readFileSync(join(p.root, f), "utf8");
const snapshot = (p) => ["CHANGELOG.md", p.appName, "CHICLA_PROJECT_STATUS-5.md"].map((f) => (existsSync(join(p.root, f)) ? rd(p, f) : null));
const cleanup = [];
const proj = (o) => { const p = makeProject(o); cleanup.push(p.root); return p; };

try {
  console.log("bump-round smoke test");

  t("--verify passes on a consistent project", () => {
    const r = run(proj(), "--verify");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /✓ CHANGELOG hash/);
  });

  t("--verify fails (exit 1) when CHANGELOG was edited after the fingerprint", () => {
    const p = proj();
    writeFileSync(join(p.root, "CHANGELOG.md"), rd(p, "CHANGELOG.md") + "## Round 2\n");
    const r = run(p, "--verify");
    assert.equal(r.status, 1);
    assert.match(r.stdout, /✗ CHANGELOG hash/);
  });

  t("--dry-run reports the bump and writes nothing", () => {
    const p = proj(); const before = snapshot(p);
    const r = run(p, "--dry-run");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /seq 5 → 6/);
    assert.deepEqual(snapshot(p), before);
    assert.ok(!existsSync(join(p.root, "CHICLA_PROJECT_STATUS-6.md")));
  });

  const p = proj();
  const appBefore = rd(p, p.appName), stBefore = rd(p, "CHICLA_PROJECT_STATUS-5.md");
  writeFileSync(join(p.root, "CHANGELOG.md"), rd(p, "CHANGELOG.md") + "\n## Round 2 — new entry\n"); // CHANGELOG edited, as in a real round
  const newClBody = p.clBody + "\n## Round 2 — new entry\n";
  const hCl2 = hashFrom("X\n" + newClBody, 2);

  t("bump: renames status 5 → 6 and verifies itself", () => {
    const r = run(p, "--note", "round X");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.ok(existsSync(join(p.root, "CHICLA_PROJECT_STATUS-6.md")));
    assert.ok(!existsSync(join(p.root, "CHICLA_PROJECT_STATUS-5.md")));
    assert.match(r.stdout, /✓ round closed/);
  });

  t("bump: app line 3 has the new seq/file/hashes, rest of the app is byte-identical", () => {
    const app = rd(p, p.appName), lines = app.split("\n");
    assert.equal(lines[0], "//! Chicla app version (fake)");
    assert.equal(lines[1], appBefore.split("\n")[1]);
    assert.ok(lines[2].startsWith("// STATUS_FILE_FINGERPRINT: "));
    assert.ok(lines[2].includes(`seq=6 file=CHICLA_PROJECT_STATUS-6.md app_sha256_12=${p.hApp} changelog_sha256_12=${hCl2}`));
    assert.ok(lines[2].includes("app hash unchanged") && lines[2].includes("round X"));
    assert.equal(lines.slice(3).join("\n"), appBefore.split("\n").slice(3).join("\n"));
  });

  t("bump: CHANGELOG line 1 rewritten, body untouched, hash matches the independent computation", () => {
    const cl = rd(p, "CHANGELOG.md");
    assert.ok(cl.split("\n")[0].includes(`seq=6 file=CHICLA_PROJECT_STATUS-6.md app_sha256_12=${p.hApp} changelog_sha256_12=${hCl2}`));
    assert.equal(cl.split("\n").slice(1).join("\n"), newClBody);
    assert.equal(hashFrom(cl, 2), hCl2);
  });

  t("bump: only the Fingerprint paragraph of the status file changed ($ specials survive)", () => {
    const st = rd(p, "CHICLA_PROJECT_STATUS-6.md");
    assert.ok(st.includes(`**Fingerprint:** seq=6 · app=${p.appName} ·\napp_sha256_12=${p.hApp}`));
    assert.ok(st.includes(`changelog_sha256_12=${hCl2}`));
    assert.equal(st.replace(/\*\*Fingerprint:\*\* seq=6[\s\S]*?before doing anything else\./, "PARA"), stBefore.replace(/\*\*Fingerprint:\*\* seq=5[\s\S]*?before doing anything else\./, "PARA"));
    assert.ok(st.includes("$& and $1 specials"));
  });

  t("bump: FILES.manifest lists -6 and no longer -5", () => {
    const m = parseManifest(rd(p, "FILES.manifest")).map((e) => e.path); // v2 since C7.1 slice b
    assert.ok(m.includes("CHICLA_PROJECT_STATUS-6.md") && !m.includes("CHICLA_PROJECT_STATUS-5.md"));
  });

  t("--verify passes after the bump", () => assert.equal(run(p, "--verify").status, 0));

  t("--refresh after a late CHANGELOG edit keeps seq 6 and fixes the hash", () => {
    writeFileSync(join(p.root, "CHANGELOG.md"), rd(p, "CHANGELOG.md") + "late edit\n");
    assert.equal(run(p, "--verify").status, 1);
    const r = run(p, "--refresh");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.ok(existsSync(join(p.root, "CHICLA_PROJECT_STATUS-6.md")) && !existsSync(join(p.root, "CHICLA_PROJECT_STATUS-7.md")));
    assert.equal(run(p, "--verify").status, 0);
    assert.ok(rd(p, "CHANGELOG.md").includes(`changelog_sha256_12=${hashFrom(rd(p, "CHANGELOG.md"), 2)}`));
  });

  t("refuses (exit 1, nothing written) when app seq does not match the status file (11a)", () => {
    const q = proj({ seq: 5, appSeq: 4 }); const before = snapshot(q);
    const r = run(q);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /instruction 11a/);
    assert.deepEqual(snapshot(q), before);
  });

  t("refuses (exit 1) with two status files in the root", () => {
    const r = run(proj({ extraStatus: true }));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /exactly 1 CHICLA_PROJECT_STATUS/);
  });

  console.log(`✓ bump-round: ${passed} checks passed`);
} finally {
  for (const d of cleanup) rmSync(d, { recursive: true, force: true });
}
