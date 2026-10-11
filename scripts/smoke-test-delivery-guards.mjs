#!/usr/bin/env node
// W6 — smoke test of the DELIVERY GUARDS, on a fake project in a temporary folder:
//   check-manifest.mjs · check-build.mjs · make-delivery-zip.mjs · baseline.mjs · verify-delivery-zip.mjs · archive-changelog.mjs
//
//   node scripts/smoke-test-delivery-guards.mjs
//
// Cases (plan W6): lost file refused · private file refused · two status files refused ·
// wrong `seq=` refused · round `1b` recognised · `check-build` refuses broken syntax · non-ASCII names (macOS).
//
// Rules of the test:
//  - Hermetic: the scripts run with a PATH that only has `node`, `zip` and `unzip` (symlinks in a folder OUTSIDE the
//    project). So the test only uses what it supplies itself.
//  - Each negative case asserts the guard's specific MESSAGE, not just "exit 1"; and there is a positive control
//    (a clean project passes) so that a negative does not pass for the wrong reason.
//  - It hides no failures: it counts them, prints the detail and exits 1.
import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = ["check-manifest.mjs", "check-build.mjs", "make-delivery-zip.mjs", "baseline.mjs", "verify-delivery-zip.mjs", "archive-changelog.mjs"];
const cleanup = [];
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); cleanup.push(d); return d; };

let failed = 0, passed = 0;
const check = (ok, what, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (ok) passed++; else { failed++; if (detail) console.log(detail.split("\n").map((l) => `      ${l}`).join("\n")); }
};
const note = (what) => console.log(`  ℹ ${what}`);
const section = (t) => console.log(`\n${t}`);

// --- hermetic environment --------------------------------------------------------------------------------------
const realWhich = (bin) => { const r = spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" }); return r.status === 0 ? r.stdout.trim() : null; };
const BIN = tmp("guards-bin-");
for (const [name, target] of [["node", process.execPath], ["zip", realWhich("zip")], ["unzip", realWhich("unzip")]]) {
  if (!target) { console.error(`✗ \`${name}\` is missing in this environment: the test cannot run (this is not a "pass").`); process.exit(1); }
  symlinkSync(target, join(BIN, name));
}
const ENV = { PATH: BIN, HOME: BIN, LANG: "C.UTF-8" };

const run = (root, script, ...args) => spawnSync(process.execPath, [join(root, "scripts", script), ...args], { cwd: root, encoding: "utf8", env: ENV, maxBuffer: 1 << 26 });
const out = (r) => `exit=${r.status}\n--- stdout\n${r.stdout}\n--- stderr\n${r.stderr}`;
const zipList = (z) => spawnSync("unzip", ["-Z1", z], { encoding: "utf8", env: ENV }).stdout.split("\n").filter((l) => l && !l.endsWith("/"));
const zipAdd = (root, z, ...files) => spawnSync("zip", ["-q", z, ...files], { cwd: root, encoding: "utf8", env: ENV });

// --- fake project (the minimal shape of a Chicla repo that the guards accept) -------------------------------------
const FP = (seq) => `seq=${seq} file=CHICLA_PROJECT_STATUS-${seq}.md app_sha256_12=aaaaaaaaaaaa changelog_sha256_12=bbbbbbbbbbbb`;
function makeProject({ seq = 7, clSeq = seq } = {}) {
  const root = tmp("guards-proj-");
  const w = (rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
  mkdirSync(join(root, "scripts"));
  for (const f of SCRIPTS) copyFileSync(join(HERE, f), join(root, "scripts", f));
  w("package.json", '{"name":"fake","private":true,"version":"0.0.1"}\n');
  w("CLAUDE.md", "# rules\n");
  w("README.md", "readme\n");
  w("CHANGELOG.md", `<!-- CHANGELOG_FINGERPRINT: ${FP(clSeq)} -->\n# Changelog\n\n## Round 1 — x\n`);
  w(`CHICLA_PROJECT_STATUS-${seq}.md`, "# status\n");
  w("packages/chicla-kit/src/lib.mjs", "export const a = 1;\n");
  w("packages/chicla-kit/src/extra.mjs", "export const b = 2;\n");
  w("corpus/real-world/.gitkeep", "");
  w("corpus/huge/.gitkeep", "");
  w(".env.example", "KEY=\n");
  const m = run(root, "check-manifest.mjs", "--write");
  if (m.status !== 0) throw new Error("check-manifest --write failed while building the fake project:\n" + out(m));
  return { root, w };
}
// files that must NEVER leave the project
const plantPrivate = (p) => {
  p.w("corpus/real-world/private-statement.pdf", "%PDF-1.4 personal data\n");
  p.w("corpus/huge/big.pdf", "%PDF-1.4 huge\n");
  p.w(".env", "SECRET=1\n");
  p.w("tools/__pycache__/x.pyc", "pyc");
};
const PRIVATE_PATHS = ["corpus/real-world/private-statement.pdf", "corpus/huge/big.pdf", ".env", "tools/__pycache__/x.pyc"];

try {
  console.log("delivery guards — smoke test (W6)");

  // ============================================================================================================
  section("0. Positive control: a clean project is delivered");
  {
    const p = makeProject(), zip = join(tmp("guards-out-"), "ok.zip");
    const r = run(p.root, "make-delivery-zip.mjs", zip);
    check(r.status === 0 && existsSync(zip), "make-delivery-zip: exit 0 and zip created", out(r));
    check(/delivery created and verified/.test(r.stdout), "says \"delivery created and verified\"", out(r));
    const names = existsSync(zip) ? zipList(zip) : [];
    check(["package.json", "CLAUDE.md", "CHANGELOG.md", "CHICLA_PROJECT_STATUS-7.md", "FILES.manifest", "packages/chicla-kit/src/extra.mjs"].every((f) => names.includes(f)), "the zip has the whole tree (package.json at the root, status file, manifest, sources)", names.join("\n"));
    const v = run(p.root, "verify-delivery-zip.mjs", zip);
    check(v.status === 0 && /zip ready to paste over/.test(v.stdout), "verify-delivery-zip approves the same zip independently", out(v));
  }

  // ============================================================================================================
  section("0c. The baseline inside the zip is re-checked against the zip's own files (C9.6, round 61)");
  {
    const p = makeProject(), zip = join(tmp("guards-out-"), "ok.zip");
    const r = run(p.root, "make-delivery-zip.mjs", zip);
    check(r.status === 0 && existsSync(zip), "(control) delivery created", out(r));
    // tampers with the finished zip: unzip, change one thing, zip again (the zip is not rebuilt by make-delivery-zip)
    const tamper = (name, fn) => {
      const X = tmp(`guards-x-${name}-`); spawnSync("unzip", ["-q", zip, "-d", X]); fn(X);
      const z = join(tmp("guards-out-"), `${name}.zip`);
      spawnSync("zip", ["-qr", z, "."], { cwd: X });
      return run(p.root, "verify-delivery-zip.mjs", z);
    };
    const refused = (v, code) => v.status === 1 && v.stderr.includes(code);
    check(refused(tamper("edit-file", (X) => appendFileSync(join(X, "packages/chicla-kit/src/lib.mjs"), "// edited after the baseline\n")), "EBASELINE_MISMATCH"), "a file changed after the baseline was written: refused (EBASELINE_MISMATCH)");
    check(refused(tamper("extra-file", (X) => { writeFileSync(join(X, "packages/chicla-kit/src/extra.mjs"), "export const b = 2;\n"); const m = join(X, "FILES.manifest"); writeFileSync(join(X, "packages/chicla-kit/src/new.mjs"), "x\n"); writeFileSync(m, readFileSync(m, "utf8") + "packages/chicla-kit/src/new.mjs\n"); }), "EBASELINE_MISMATCH"), "a file the baseline does not list: refused (EBASELINE_MISMATCH)");
    check(refused(tamper("cut", (X) => { const f = join(X, "FILES.baseline.json"); const t = readFileSync(f, "utf8"); writeFileSync(f, t.slice(0, t.length >> 1)); }), "EBASELINE_PARSE"), "a cut baseline: refused (EBASELINE_PARSE)");
    check(refused(tamper("seal", (X) => { const f = join(X, "FILES.baseline.json"); writeFileSync(f, readFileSync(f, "utf8").replace(/[0-9a-f]{64}/, "0".repeat(64))); }), "EBASELINE_SEAL"), "an edited baseline: refused (EBASELINE_SEAL)");
    check(refused(tamper("gone", (X) => { rmSync(join(X, "FILES.baseline.json")); const m = join(X, "FILES.manifest"); writeFileSync(m, readFileSync(m, "utf8").split("\n").filter((l) => l && l !== "FILES.baseline.json").join("\n") + "\n"); }), "EBASELINE_MISSING"), "no baseline in the zip: refused (EBASELINE_MISSING)");
  }

  // ============================================================================================================
  section("0b. A zip wrapped in a folder is refused (package.json must be at the root of the zip)");
  {
    const p = makeProject(), dir = tmp("guards-out-");
    const names = readFileSync(join(p.root, "FILES.manifest"), "utf8").split("\n").filter(Boolean);
    const parent = dirname(p.root), wrapper = p.root.split("/").pop();
    const wrapped = join(dir, "wrapped.zip");
    zipAdd(parent, wrapped, ...[...names, "FILES.manifest"].map((n) => `${wrapper}/${n}`));
    const v = run(p.root, "verify-delivery-zip.mjs", wrapped);
    check(v.status === 1 && /package\.json is not at the ROOT of the zip/.test(v.stderr), "verify-delivery-zip: refuses the zip with a wrapper folder and says package.json is not at the root", out(v));
  }

  // ============================================================================================================
  section("1. A lost file is refused");
  {
    const p = makeProject();
    rmSync(join(p.root, "packages/chicla-kit/src/extra.mjs"));
    const c = run(p.root, "check-manifest.mjs");
    check(c.status === 1 && /LOST file\(s\)/.test(c.stderr) && /packages\/chicla-kit\/src\/extra\.mjs/.test(c.stderr), "check-manifest: exit 1 and names the lost file", out(c));

    const zip = join(tmp("guards-out-"), "lost.zip");
    const r = run(p.root, "make-delivery-zip.mjs", zip);
    check(r.status === 1 && /check-manifest\.mjs failed/.test(r.stderr), "make-delivery-zip: aborts at step 1 (check-manifest)", out(r));
    check(!existsSync(zip), "…and creates no zip", `exists: ${zip}`);
  }
  {
    // against the PREVIOUS zip (--against): a "deliberate" removal (manifest regenerated) must also be approved
    const p = makeProject(), dir = tmp("guards-out-"), prev = join(dir, "prev.zip"), next = join(dir, "next.zip");
    const a = run(p.root, "make-delivery-zip.mjs", prev);
    check(a.status === 0, "previous zip created (control)", out(a));
    rmSync(join(p.root, "packages/chicla-kit/src/extra.mjs"));
    run(p.root, "check-manifest.mjs", "--write"); // the manifest no longer lists the file: only --against catches it
    const r = run(p.root, "make-delivery-zip.mjs", next, "--against", prev);
    check(r.status === 1 && /NO LONGER in this zip: packages\/chicla-kit\/src\/extra\.mjs/.test(r.stderr), "--against: refuses the file that existed in the previous zip and disappeared", out(r));
    rmSync(next, { force: true });
    const ok = run(p.root, "make-delivery-zip.mjs", next, "--against", prev, "--allow-removed", "packages/chicla-kit/src/extra.mjs");
    check(ok.status === 0 && existsSync(next), "--allow-removed <path>: the approved removal passes", out(ok));
  }

  // ============================================================================================================
  section("2. A private file is refused");
  {
    const p = makeProject();
    plantPrivate(p);
    run(p.root, "check-manifest.mjs", "--write");
    const manifest = readFileSync(join(p.root, "FILES.manifest"), "utf8").split("\n");
    check(PRIVATE_PATHS.every((f) => !manifest.includes(f)), "check-manifest --write: no private/junk file enters FILES.manifest", manifest.join("\n"));
    check(["corpus/real-world/.gitkeep", "corpus/huge/.gitkeep", ".env.example"].every((f) => manifest.includes(f)), "…but the .gitkeep files and .env.example (public) stay listed", manifest.join("\n"));

    const dir = tmp("guards-out-"), zip = join(dir, "clean.zip");
    const r = run(p.root, "make-delivery-zip.mjs", zip);
    const names = existsSync(zip) ? zipList(zip) : [];
    check(r.status === 0 && PRIVATE_PATHS.every((f) => !names.includes(f)), "make-delivery-zip: the built zip contains none of the 4 planted files", out(r) + "\n" + names.join("\n"));

    // the verifier is the 2nd line of defence: it must refuse a zip that carries them (made by hand, bypassing the manifest)
    const bad = join(dir, "bad.zip");
    copyFileSync(zip, bad);
    zipAdd(p.root, bad, ...PRIVATE_PATHS);
    const v = run(p.root, "verify-delivery-zip.mjs", bad);
    check(v.status === 1 && /must NEVER leave the project/.test(v.stderr), "verify-delivery-zip: refuses the zip with private files", out(v));
    check(/private corpus \(corpus\/real-world\)/.test(v.stderr) && /\.env file \(secrets\)/.test(v.stderr), "…and says why (private corpus, .env)", out(v));
    check(/Python artefact/.test(v.stderr), "…and also Python artefacts (4 planted < 8 of the message's truncated list)", out(v));
  }

  // ============================================================================================================
  section("3. Two status files are refused");
  {
    const p = makeProject(), dir = tmp("guards-out-"), zip = join(dir, "one.zip");
    run(p.root, "make-delivery-zip.mjs", zip);
    const two = join(dir, "two.zip");
    copyFileSync(zip, two);
    p.w("CHICLA_PROJECT_STATUS-8.md", "# status 8\n");
    zipAdd(p.root, two, "CHICLA_PROJECT_STATUS-8.md");
    const v = run(p.root, "verify-delivery-zip.mjs", two);
    check(v.status === 1 && /exactly 1 CHICLA_PROJECT_STATUS-N\.md in the root \(found 2\)/.test(v.stderr), "verify-delivery-zip: refuses a zip with -7 and -8", out(v));

    // and on the full path, with both files in the working tree
    const full = join(dir, "full.zip");
    run(p.root, "check-manifest.mjs", "--write");
    const r = run(p.root, "make-delivery-zip.mjs", full);
    check(r.status === 1 && /exactly 1 CHICLA_PROJECT_STATUS-N\.md in the root \(found 2\)/.test(r.stderr), "make-delivery-zip: with -7 and -8 in the tree, the delivery is refused", out(r));
    check(!existsSync(full), "…and here too the rejected zip does not stay on disk", `stayed: ${full}`);
  }

  // ============================================================================================================
  section("4. A wrong `seq=` is refused");
  {
    const p = makeProject({ seq: 7, clSeq: 6 }), dir = tmp("guards-out-"), zip = join(dir, "seq.zip");
    const r = run(p.root, "make-delivery-zip.mjs", zip);
    check(r.status === 1 && /status file is -7 but the CHANGELOG fingerprint says seq=6/.test(r.stderr), "make-delivery-zip: status -7 with CHANGELOG seq=6 is refused, with the right message", out(r));
    check(!existsSync(zip), "…and the rejected zip does NOT stay on disk (the message \"no zip was created\" is true)", `stayed: ${zip}`);
    check(/delivery aborted/.test(r.stderr) && /deleted/.test(r.stderr), "…and the message says the rejected zip was deleted", out(r));
    // the standalone check of a zip with a wrong seq still refuses it (zip made by hand, without going through make)
    const good = makeProject({ seq: 7, clSeq: 7 }), hand = join(dir, "hand.zip");
    run(good.root, "make-delivery-zip.mjs", hand);
    writeFileSync(join(good.root, "CHANGELOG.md"), `<!-- CHANGELOG_FINGERPRINT: ${FP(6)} -->\n# Changelog\n`);
    spawnSync("zip", ["-q", hand, "CHANGELOG.md"], { cwd: good.root, env: ENV });
    const v = run(good.root, "verify-delivery-zip.mjs", hand);
    check(v.status === 1 && /says seq=6/.test(v.stderr), "verify-delivery-zip, on its own, refuses a hand-made zip with seq=6", out(v));
  }

  section("4b. `zip` itself fails midway: no partial zip is left");
  {
    const p = makeProject(), zip = join(tmp("guards-out-"), "partial.zip");
    const BIN2 = tmp("guards-bin2-");
    for (const n of ["node", "unzip"]) symlinkSync(join(BIN, n), join(BIN2, n));
    writeFileSync(join(BIN2, "zip"), '#!/bin/sh\nprintf partial > "$2"\nexit 1\n', { mode: 0o755 });
    const r = spawnSync(process.execPath, [join(p.root, "scripts/make-delivery-zip.mjs"), zip], { cwd: p.root, encoding: "utf8", env: { ...ENV, PATH: BIN2 } });
    check(r.status === 1 && /the zip command failed/.test(r.stderr), "fake zip that fails: exit 1 and its own message", out(r));
    check(!existsSync(zip), "…and the partial zip is deleted", `stayed: ${zip}`);
  }

  // ============================================================================================================
  section("5. Round `1b` is recognised (archive-changelog)");
  {
    const p = makeProject();
    const entry = (r) => `## Round ${r} — title ${r} (2026-10-07)\n- line of ${r}\n\n`;
    writeFileSync(join(p.root, "CHANGELOG.md"), `<!-- CHANGELOG_FINGERPRINT: ${FP(7)} -->\n# Chicla changelog\n\n${["2", "1b", "1"].map(entry).join("")}`);
    const r = run(p.root, "archive-changelog.mjs", "--dry-run", "--keep", "3");
    check(r.status === 0 && /only 3 rounds \(2, 1b, 1\)/.test(r.stdout), "rounds 2, 1b, 1: all three recognised (1b is not ignored)", out(r));
    writeFileSync(join(p.root, "CHANGELOG.md"), `<!-- CHANGELOG_FINGERPRINT: ${FP(7)} -->\n# Chicla changelog\n\n${["1g", "1f", "1e", "1d", "1c"].map(entry).join("")}`);
    const s = run(p.root, "archive-changelog.mjs", "--dry-run", "--keep", "3");
    check(s.status === 0 && /keep 3 rounds \(1g … 1e\); archive 2 rounds \(1c-1d\)/.test(s.stdout), "suffix-only rounds (1g … 1c), as in the real CHANGELOG: order by position; archives 1d and 1c (name 1c-1d)", out(s));
    check(!existsSync(join(p.root, "CHANGELOG-archive-rounds-1c-1d.md")), "…and --dry-run did not write the archive", "");
  }

  // ============================================================================================================
  section("6. check-build refuses broken syntax");
  {
    const p = makeProject();
    const ok = run(p.root, "check-build.mjs");
    check(ok.status === 0 && /✓ node --check passed/.test(ok.stdout), "check-build on a valid project: exit 0", out(ok));
    p.w("packages/chicla-kit/src/broken.mjs", "export function cortado() {\n  if (true) {\n");
    const r = run(p.root, "check-build.mjs");
    check(r.status === 1 && /packages\/chicla-kit\/src\/broken\.mjs/.test(r.stderr), "check-build with a broken .mjs: exit 1 and names the file", out(r));
    const zip = join(tmp("guards-out-"), "broken.zip");
    const m = run(p.root, "make-delivery-zip.mjs", zip);
    check(m.status === 1 && !existsSync(zip) && /check-build\.mjs failed/.test(m.stderr), "make-delivery-zip: the delivery is aborted and no zip is created", out(m));
  }

  // ============================================================================================================
  section("7. Non-ASCII names with macOS `unzip` (round 1p)");
  {
    // macOS `unzip -Z1` writes every non-ASCII byte as `?`. Here a fake `unzip` does the same (only for -Z1;
    // `-p` and the rest go to the real `unzip`). verify-delivery-zip must not depend on `unzip`'s listing.
    const BIN3 = tmp("guards-bin3-");
    for (const n of ["node", "zip"]) symlinkSync(join(BIN, n), join(BIN3, n));
    const realUnzip = realWhich("unzip");
    const mangle = `process.stdin.on("data",(b)=>process.stdout.write(Buffer.from(b.map((x)=>(x>127?63:x)))))`;
    writeFileSync(join(BIN3, "unzip"), `#!/bin/sh\nif [ "$1" = "-Z1" ]; then ${realUnzip} "$@" | ${process.execPath} -e '${mangle}'; else exec ${realUnzip} "$@"; fi\n`, { mode: 0o755 });
    const ENV3 = { ...ENV, PATH: BIN3 };
    const probe = spawnSync("/bin/sh", ["-c", `printf 'x' > "$0/a.txt" && cd "$0" && zip -q a.zip a.txt && unzip -Z1 a.zip`, tmp("guards-probe-")], { env: ENV3, encoding: "utf8" });
    check(probe.status === 0 && probe.stdout.trim() === "a.txt", "(control) the fake `unzip` starts and lists ASCII names unchanged", out(probe));
    const NAME = "corpus/edge/names/relatório – ação 日本語.pdf";
    const p = makeProject();
    p.w(NAME, "%PDF-1.4 unicode name\n");
    const mw = run(p.root, "check-manifest.mjs", "--write");
    check(mw.status === 0 && readFileSync(join(p.root, "FILES.manifest"), "utf8").split("\n").includes(NAME), "the manifest lists the file with a unicode name", out(mw));

    const dir = tmp("guards-out-");
    const good = join(dir, "unicode.zip");
    const r = spawnSync(process.execPath, [join(p.root, "scripts/make-delivery-zip.mjs"), good], { cwd: p.root, encoding: "utf8", env: ENV3, maxBuffer: 1 << 26 });
    check(r.status === 0 && existsSync(good) && /delivery created and verified/.test(r.stdout), "make-delivery-zip: with the `unzip` that shows `?`, the delivery with a unicode name passes", out(r));
    const v = spawnSync(process.execPath, [join(p.root, "scripts/verify-delivery-zip.mjs"), good], { cwd: p.root, encoding: "utf8", env: ENV3 });
    check(v.status === 0 && !/\?/.test(v.stdout.replace(/\n/g, "")), "verify-delivery-zip, on its own, approves the same zip and prints no names with `?`", out(v));

    // negative control: a zip WITHOUT the unicode file must still be refused, with the right name in the message
    const manifest = readFileSync(join(p.root, "FILES.manifest"), "utf8").split("\n").filter(Boolean);
    const bad = join(dir, "no-unicode.zip");
    zipAdd(p.root, bad, ...manifest.filter((f) => f !== NAME), "FILES.manifest");
    const b = spawnSync(process.execPath, [join(p.root, "scripts/verify-delivery-zip.mjs"), bad], { cwd: p.root, encoding: "utf8", env: ENV3 });
    check(b.status === 1 && b.stderr.includes(`NOT in the zip: ${NAME}`), "…and a zip missing that file is still refused, with the true name (not `?`)", out(b));

    // a previous upload with the name in decomposed form (NFD, as macOS writes it) does not count as a lost file
    const nfd = NAME.normalize("NFD");
    check(nfd !== NAME, "(control) the NFD form of the name really differs in bytes", "");
    const prevRoot = tmp("guards-prev-");
    mkdirSync(join(prevRoot, dirname(nfd)), { recursive: true });
    writeFileSync(join(prevRoot, nfd), "%PDF-1.4 unicode name\n");
    writeFileSync(join(prevRoot, "README.md"), "readme\n"); // a file at the root: otherwise the zip looks like it has a wrapper folder
    const prev = join(dir, "upload-nfd.zip");
    zipAdd(prevRoot, prev, nfd, "README.md");
    const a = spawnSync(process.execPath, [join(p.root, "scripts/verify-delivery-zip.mjs"), good, "--against", prev], { cwd: p.root, encoding: "utf8", env: ENV3 });
    check(a.status === 0 && /nothing lost vs upload-nfd\.zip/.test(a.stdout), "--against: an upload with the name in NFD is not reported as a lost file", out(a));
  }

  section("8. Manifest in NFD, disk in NFC (Linux CI, round 1r)");
  {
    // A `FILES.manifest` written on macOS has the names in NFD; the git checkout on Linux brings the same name in NFC.
    // Before 1r `check-manifest` saw there a "new" file AND a "lost" one and CI failed.
    const NAME = "corpus/edge/names/relatório final (v2) – ação #1 日本語.pdf";
    const nfd = NAME.normalize("NFD");
    check(nfd !== NAME, "(control) NFC and NFD of the name really differ in bytes", "");
    const p = makeProject();
    p.w(NAME, "%PDF-1.4 unicode name\n");
    const man = join(p.root, "FILES.manifest");
    const lines = readFileSync(man, "utf8").split("\n").filter(Boolean).filter((l) => l !== NAME && l !== nfd);
    writeFileSync(man, [...lines, nfd].sort().join("\n") + "\n"); // manifest "from the Mac": name in NFD
    const r = run(p.root, "check-manifest.mjs");
    check(r.status === 0 && /no file lost/.test(r.stdout) && !/new file\(s\)|LOST/.test(r.stdout + r.stderr), "check-manifest: name in NFD in the manifest and NFC on disk passes, without warnings", out(r));
    // negative control: a really lost file still fails, with the true name from the manifest
    writeFileSync(man, readFileSync(man, "utf8") + "docs/really-lost.md\n");
    const l = run(p.root, "check-manifest.mjs");
    check(l.status === 1 && l.stderr.includes("docs/really-lost.md") && !l.stderr.includes("日本語"), "…and a really lost file still fails (and only that one)", out(l));
    // --write stays faithful to the disk (the zip is built from these names)
    const w = run(p.root, "check-manifest.mjs", "--write");
    check(w.status === 0 && readFileSync(man, "utf8").split("\n").includes(NAME), "--write writes the name as it is on disk (NFC here)", out(w));
  }

  console.log(failed ? `\n✗ delivery guards: ${failed} check(s) FAILED, ${passed} passed` : `\n✓ smoke-test-delivery-guards: ${passed} checks passed`);
} finally {
  for (const d of cleanup) rmSync(d, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
