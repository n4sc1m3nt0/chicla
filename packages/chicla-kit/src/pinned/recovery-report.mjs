#!/usr/bin/env node
// RECOVERY MODE — first step of the session that receives an emergency dump.
//
//   node scripts/recovery-report.mjs <chicla-EMERGENCY-….zip> [--baseline <last-delivery-zip.zip>] [--out <dir>] [--toolchain-digest <hex> [--trust-toolchain]]
//   chicla recovery <dump.zip> [--baseline <zip>] [--out <dir>] [--json]      (C11.1 slice 4b, D82)
//
// The logic is the exported core `recoveryReport({ dump, baseline, out, toolchainDigest, trustToolchain })` (never prints, exits or throws; see its comment for the result and the
// codes) and `renderRecoveryReport`; the script runs ONLY as the entry point (exit 0 ok, 1 no recovery, 2 usage, 3 EHASH_TOOLCHAIN). It is one of the five PINNED RECOVER files:
// it imports only baseline.mjs, manifest.mjs, policy.mjs and zipkit.mjs, so it still runs alone, copied into a dump (D82 (2)).
//
// It does, in this order, without changing anything in the original dump:
//   1. extracts the dump to <out> (default /home/claude/recovered; if it exists, appends -2, -3 …);
//   2. confirms it is a dump (RECOVERY_MARKER.json) and that it was not corrupted on the way (sha256 of each file);
//   3. compares the project root with --baseline (the last good delivery zip); without it, with the FILES.baseline.json
//      the last delivery carried inside the dump (C9.6: no zip needed; refused if it was cut or edited); without
//      either, with FILES.manifest (names only: does not detect MODIFIED files);
//   4. cheap checks on the touched files: valid JSON, `node --check` on .mjs/.js, .py syntax (ast),
//      empty file, unbalanced braces/parentheses in .rs/.ts/.js/.css (warning of a possibly TRUNCATED file);
//   5. runs check-manifest and check-build INSIDE the recovered root (read only);
//   6. writes <out>/RECOVERY_DIFF.md (outside the project root, so as not to pollute it) and prints the summary.
// It creates NO delivery. After this: finish what is missing and deliver with make-delivery-zip.mjs.
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { BASELINE_FILE, parseBaseline } from "./baseline.mjs";
import { parseManifest, leaf } from "./manifest.mjs";
import { SKIP_NAMES, PYTHON_DIRS, isJunkName, NO_POLICY, loadPolicy, policySkips, policyAllows } from "./policy.mjs"; // C6.1 slice b: the rules live in policy.mjs (beside this file in RECOVER/)
// C9.4b: zips are read by chicla-zip, never by the external unzip tool. In RECOVER/ it sits beside this file (zipkit.mjs); in the tree it is under packages/.
const zipkitUrl = existsSync(fileURLToPath(new URL("./zipkit.mjs", import.meta.url))) ? new URL("./zipkit.mjs", import.meta.url) : new URL("../../../chicla-zip/src/zipkit.mjs", import.meta.url);
const { extractZip } = await import(zipkitUrl.href);

const USAGE = "usage: recovery-report.mjs <dump.zip> [--baseline <delivery-zip>] [--out <dir>] [--toolchain-digest <hex> [--trust-toolchain]]";

// C9.1: kept for `tar` and the other tools; extraction of zips no longer depends on the locale (C9.4b: chicla-zip reads bit 11 itself).
const sh = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 28, env: { ...process.env, LC_ALL: "C.UTF-8" } });
// W3: same exclusions as W2 / the dump (scripts/policy.mjs): .env secrets (not .example/.sample), *.pyc

// Round 1s: compare names in NFC (macOS = NFD, Linux = NFC); always print the true name from disk.
const nfc = (p) => p.normalize("NFC");

// Returns { h: {NFC name -> sha256}, names: {NFC name -> true name}, collisions: ["a ≈ b", …], collideKeys: Set }.
function hashTree(root, policy = NO_POLICY) {
  const res = {}, names = {}, collisions = [], collideKeys = new Set();
  const go = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (policySkips(relative(root, p).split("\\").join("/"), policy)) continue; // C6.1 d2b: what the project's chicla.policy.json lists
      if (e.isDirectory()) { if (!SKIP_NAMES.has(e.name) && !PYTHON_DIRS.has(e.name)) go(p); continue; }
      if (e.isFile() && !isJunkName(e.name)) {
        const real = relative(root, p), k = nfc(real);
        if (k in res) { collisions.push(`${names[k]} ≈ ${real}`); collideKeys.add(k); continue; } // the first one stays; the warning lists both
        res[k] = createHash("sha256").update(readFileSync(p)).digest("hex"); names[k] = real;
      }
    }
  };
  go(root);
  return { h: res, names, collisions, collideKeys };
}

const HERE = resolve(fileURLToPath(new URL(".", import.meta.url)));

/**
 * Recovers an emergency dump: extracts it to `out` (default /home/claude/recovered, then -2, -3 ...), checks it, compares it with `baseline` (a delivery zip), the
 * baseline the dump carries, or FILES.manifest, and writes <out>/RECOVERY_DIFF.md. Never prints, exits or throws; the text is in `messages`.
 * Returns { ok, code, out, root, report, note, afterRound, against, changedInTransit, modified, added, removed, held, problems, collisions, guards, messages }; `code` is null,
 * EUSAGE (no dump given), EHASH_TOOLCHAIN (run from a RECOVER/ folder whose files do not hash to `toolchainDigest`, unless `trustToolchain`; NOTHING was run), ERECOVERY_EXTRACT,
 * ENOT_DUMP (no RECOVERY_MARKER.json), ENO_PROJECT (the dump found no project root), EBASELINE, EBASELINE_EXTRACT or ERECOVERY_ERROR (anything unexpected).
 */
export async function recoveryReport(opts = {}) {
  const messages = [];
  const put = (stream, text) => messages.push({ stream, text });
  let r;
  try { r = await recover(opts ?? {}, put); }
  catch (e) { put("err", `✗ ERECOVERY_ERROR: ${e.code ? `${e.code}: ` : ""}${e.message}`); r = { ok: false, code: "ERECOVERY_ERROR" }; }
  return { ...r, messages };
}

/** The text the script prints for a result, per stream (one line per message, as console.log/console.error did). */
export function renderRecoveryReport(result) {
  const text = (stream) => result.messages.filter((m) => m.stream === stream).map((m) => `${m.text}\n`).join("");
  return { out: text("out"), err: text("err") };
}

async function recover(o, put) {
  const zip = o.dump, toolchainDigest = o.toolchainDigest, trustToolchain = o.trustToolchain === true;
  const fail = (code, text) => { put("err", text); return { ok: false, code }; };
  if (!zip) return fail("EUSAGE", USAGE);
  if (leaf(HERE) === "RECOVER") {
    const names = readdirSync(HERE).filter((n) => n.endsWith(".mjs")).sort();
    const mine = createHash("sha256").update(names.map((n) => `${createHash("sha256").update(readFileSync(join(HERE, n))).digest("hex")}  RECOVER/${n}\n`).join("")).digest("hex");
    const given = toolchainDigest;
    if (given !== mine) {
      if (!trustToolchain) return fail("EHASH_TOOLCHAIN", `✗ EHASH_TOOLCHAIN: the files in RECOVER/ hash to ${mine}, the pinned digest is ${given ?? "(not given)"}. Nothing was run. Only if Rodrigo says so: --trust-toolchain.`);
      put("err", `⚠ EHASH_TOOLCHAIN ignored by --trust-toolchain (${mine} vs ${given ?? "(not given)"}).`);
    }
  }
  const baselineZip = o.baseline;
  let out = resolve(o.out ?? "/home/claude/recovered");
  for (let n = 2; existsSync(out); n++) out = resolve(o.out ?? "/home/claude/recovered") + `-${n}`;

  // 1. Extract
  mkdirSync(out, { recursive: true });
  if (zip.endsWith(".tar.gz")) { const r = sh("tar", ["-xzf", resolve(zip), "-C", out]); if (r.status !== 0 && r.status !== 1) { return fail("ERECOVERY_EXTRACT", `✗ could not extract ${zip}:\n${r.stderr}`); } }
  else { try { await extractZip(resolve(zip), out); } catch (e) { return fail("ERECOVERY_EXTRACT", `✗ could not extract ${zip}: ${e.code ?? "EZIP"}: ${e.message}`); } }

  // 2. Marker
  const markerPath = join(out, "RECOVERY_MARKER.json");
  if (!existsSync(markerPath)) return fail("ENOT_DUMP", "✗ this is NOT an emergency dump (RECOVERY_MARKER.json is missing). If it is a normal delivery, use the normal flow (item 11).");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  if (marker.format !== "chicla-recovery-v1") put("err", `! unknown marker format: ${marker.format}`);
  if (marker.projectRootRel === null || marker.projectRootRel === undefined) { return fail("ENO_PROJECT", "✗ the dump found no project root (package.json + FILES.manifest). See RECOVERY_REPORT.md; the files are in " + join(out, "work")); }
  const root = join(out, "work", marker.projectRootRel);
  const lines = [];
  const say = (s = "") => { lines.push(s); put("out", s); };

  say(`# RECOVERY DIFF — ${new Date().toISOString()}`);
  say(`- Dump: ${leaf(zip)} (created ${marker.created})`);
  say(`- Note from the previous session: ${marker.note ? `**${marker.note}**` : "(no note)"}`);
  say(`- Declared state: last round in the CHANGELOG ${marker.afterRound}, ${marker.statusFile}, APP_VERSION ${marker.appVersion}`);
  say(`- Recovered project root: ${root}`);
  say(`- Extracted to: ${out}`);

  // C6.1 d2b (D67): the recovered project's own chicla.policy.json. A recovery never stops because of it: without a usable policy the files it lists show in the diff.
  let POLICY = NO_POLICY;
  try { POLICY = loadPolicy(root); } catch (e) { say(`\n! ${e.code ?? "EPOLICY"}: chicla.policy.json is not applied to this comparison (${e.message}); files it lists may show as New.`); }

  // 2b. Transport integrity
  const nowT = hashTree(root, POLICY);
  const now = nowT.h;
  // marker keys in NFC (a system that renormalizes names must not give a false "corrupted zip"); collisions stay out of this check
  const mh = {}, mNames = {}, mCollide = new Set();
  for (const [k, v] of Object.entries(marker.hashes)) { const nk = nfc(k); if (nk in mh) mCollide.add(nk); else { mh[nk] = v; mNames[nk] = k; } }
  const skipInt = (k) => mCollide.has(k) || nowT.collideKeys.has(k);
  const changedInTransit = Object.keys(mh).filter((p) => !skipInt(p) && !policySkips(p, POLICY) && now[p] !== mh[p]);
  const unhashed = Object.keys(now).filter((p) => !(p in mh));
  say(`\n## Zip integrity`);
  say(changedInTransit.length ? `✗ ${changedInTransit.length} file(s) differ from what was dumped (zip corrupted or edited): ${changedInTransit.slice(0, 15).map((k) => nowT.names[k] ?? mNames[k]).join(", ")}` : `✓ ${Object.keys(marker.hashes).length} files match the dump's sha256.`);
  if (unhashed.length) say(`  (${unhashed.length} file(s) without a hash in the marker — normal if the hash limit was reached)`);

  // 3. Comparison
  let added = [], modified = [], removed = [];
  let against;
  let baseCollisions = [];
  const isStatus = (p) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(p);
  // embedded baseline (C9.6), read from the dump itself; only used when no --baseline zip was given
  let embedded = null;
  if (!baselineZip && existsSync(join(root, BASELINE_FILE))) {
    try { embedded = parseBaseline(readFileSync(join(root, BASELINE_FILE), "utf8")); }
    catch (e) { return fail("EBASELINE", `✗ ${e.code ?? "EBASELINE"}: ${BASELINE_FILE} in the dump is not trustworthy (${e.message}). Pass --baseline <last delivery zip> instead, or delete it to compare with FILES.manifest only.`); }
  }
  // compares `now` with a base ({ NFC name -> sha256 }, { NFC name -> true name }); the baseline file itself is never a change
  const compare = (bh, bNames) => {
    const nowK = Object.keys(now).filter((p) => p !== nfc(BASELINE_FILE));
    added = nowK.filter((p) => !(p in bh)).map((k) => nowT.names[k]);
    modified = nowK.filter((p) => p in bh && bh[p] !== now[p]).map((k) => nowT.names[k]);
    removed = Object.keys(bh).filter((p) => p !== nfc(BASELINE_FILE) && !(p in now) && !isStatus(p)).map((k) => bNames[k]);
  };
  if (baselineZip) {
    const tmp = mkdtempSync(join(tmpdir(), "chicla-baseline-"));
    try { await extractZip(resolve(baselineZip), tmp); } catch (e) { rmSync(tmp, { recursive: true, force: true }); return fail("EBASELINE_EXTRACT", `✗ could not extract the baseline: ${e.code ?? "EZIP"}: ${e.message}`); }
    let base = tmp;
    const top = readdirSync(tmp).filter((n) => n !== "__MACOSX");
    if (!existsSync(join(tmp, "package.json")) && top.length === 1 && statSync(join(tmp, top[0])).isDirectory()) base = join(tmp, top[0]); // wrapped zip
    const baseT = hashTree(base, POLICY);
    baseCollisions = baseT.collisions;
    rmSync(tmp, { recursive: true, force: true });
    // the keys are NFC; the lists carry the true name (from the dump for new/modified, from the baseline for the missing ones)
    compare(baseT.h, baseT.names);
    against = `baseline ${leaf(baselineZip)} (${Object.keys(baseT.h).length} files)`;
  } else if (embedded) {
    const bh = {}, bNames = {};
    for (const f of embedded.files) { const k = nfc(f.path); if (!(k in bh)) { bh[k] = f.sha256; bNames[k] = f.path; } }
    compare(bh, bNames);
    against = `${BASELINE_FILE} carried by the dump (the last delivery, ${embedded.created}; ${embedded.files.length} files; no zip needed)`;
  } else {
    let man = [], manErr = null;
    try { if (existsSync(join(root, "FILES.manifest"))) man = parseManifest(readFileSync(join(root, "FILES.manifest"), "utf8")).map((e) => e.path); } // v1 or v2
    catch (e) { manErr = e; }
    const ms = new Set(man.map(nfc));
    if (!manErr) {
      added = Object.keys(now).filter((p) => !ms.has(p) && p !== "FILES.manifest").map((k) => nowT.names[k]);
      removed = man.filter((p) => !(nfc(p) in now));
    } // a manifest that cannot be read is no base: nothing is called new or missing, and the report says why
    against = manErr ? `NO USABLE BASE: ${manErr.code ?? "EMANIFEST"}: FILES.manifest cannot be read (${manErr.message}); pass --baseline <last delivery zip>` : "recovered FILES.manifest (no baseline: does not detect MODIFIED files — pass --baseline <last delivery zip>)";
  }
  // C6.3 slice c2 (D77 (5), D78): files the dump left out because of what is INSIDE them (marker.secretsHeld: path + kind, never the match) are «held back», not «missing».
  // A file the recovered project's policy allows is not held back: an older dump held it anyway, so it stays in MISSING. A marker without the key, or a malformed one, changes nothing.
  const heldPrefix = nfc(marker.projectRootRel ? `work/${marker.projectRootRel}/` : "work/");
  const heldRel = (h) => (nfc(h.path).startsWith(heldPrefix) ? nfc(h.path).slice(heldPrefix.length) : null); // null: outside the project root (scratch, outputs/)
  const heldBack = (Array.isArray(marker.secretsHeld) ? marker.secretsHeld : []).filter((h) => h && typeof h.path === "string" && typeof h.kind === "string").filter((h) => { const r = heldRel(h); return r === null || !policyAllows(r, POLICY); });
  const heldKeys = new Set(heldBack.map(heldRel).filter((r) => r !== null));
  removed = removed.filter((p) => !heldKeys.has(nfc(p)));
  const plain = (x) => String(x).replace(/[^\x20-\x7e\u00a0-\uffff]/g, "?").slice(0, 200);
  const list = (arr) => (arr.length ? arr.slice(0, 120).map((p) => `- ${p}`).join("\n") + (arr.length > 120 ? `\n- … (+${arr.length - 120})` : "") : "- (none)");
  say(`\n## Comparison with ${against}`);
  say(`### Modified (${modified.length})\n${list(modified)}`);
  say(`### New (${added.length})\n${list(added)}`);
  say(`### MISSING vs the base (${removed.length}) — review one by one: deleted on purpose or lost?\n${list(removed)}`);
  if (heldBack.length) say(`### Held back by the dump (${heldBack.length}) — left out because of what is inside them (looks like a secret); name and kind only. Not lost: they are not in this zip, take them from the original\n${list(heldBack.map((h) => `${plain(h.path)}  [${plain(h.kind)}]`))}`);
  const collisions = [...nowT.collisions.map((c) => `dump: ${c}`), ...baseCollisions.map((c) => `baseline: ${c}`)];
  if (collisions.length) say(`\n## ⚠ Names that differ only in NFC/NFD (${collisions.length} collision(s))\nEach pair counts as a single file in the comparisons above (only the first was compared); review by hand.\n${list(collisions)}`);

  // 4. Cheap checks on the touched files
  say(`\n## Cheap checks on the new/modified files`);
  const problems = [];
  for (const p of [...modified, ...added]) {
    const full = join(root, p);
    let text; try { text = readFileSync(full, "utf8"); } catch { continue; }
    if (text.length === 0) { problems.push(`${p}: EMPTY file`); continue; }
    if (p.endsWith(".json")) { try { JSON.parse(text); } catch (e) { problems.push(`${p}: invalid JSON (${e.message.slice(0, 60)})`); } }
    if (/\.(mjs|js)$/.test(p) && !p.startsWith("public/")) { const c = sh("node", ["--check", full]); if (c.status !== 0) problems.push(`${p}: node --check failed (${(c.stderr.split("\n").find((l) => /Error/.test(l)) ?? "").slice(0, 80)})`); }
    if (p.endsWith(".py")) { const c = sh("python3", ["-c", "import ast,sys; ast.parse(open(sys.argv[1], encoding='utf-8').read())", full]); if (c.error) { /* no python3: no check */ } else if (c.status !== 0) problems.push(`${p}: invalid Python syntax (${(c.stderr.trim().split("\n").pop() ?? "").slice(0, 80)})`); }
    if (/\.(rs|ts|tsx|mjs|js|css)$/.test(p)) {
      const count = (re) => (text.match(re) ?? []).length;
      const d = [["{", "}", count(/\{/g) - count(/\}/g)], ["(", ")", count(/\(/g) - count(/\)/g)], ["[", "]", count(/\[/g) - count(/\]/g)]].filter((x) => x[2] !== 0);
      if (d.length) problems.push(`${p}: possibly TRUNCATED — ${d.map((x) => `${x[0]}${x[1]} unbalanced (${x[2] > 0 ? "+" : ""}${x[2]})`).join(", ")} (heuristic: may be a false alarm)`);
    }
  }
  say(problems.length ? problems.map((x) => `- ⚠ ${x}`).join("\n") : "- ✓ nothing suspicious (JSON, node --check, braces).");

  // 5. Project guards (read only)
  say(`\n## Project guards, run in the recovered root`);
  const guards = [];
  for (const s of ["check-manifest.mjs", "check-build.mjs"]) {
    if (!existsSync(join(root, "scripts", s))) { say(`- ${s}: not in the dump`); guards.push({ script: s, status: "absent" }); continue; }
    const g = sh("node", [join(root, "scripts", s)], root);
    guards.push({ script: s, status: g.status === 0 ? "passed" : "failed" });
    const outp = ((g.stdout ?? "") + (g.stderr ?? "")).trim().split("\n").slice(-12).join("\n");
    say(`- ${s}: ${g.status === 0 ? "✓ passed" : "✗ FAILED (expected if the work was left half-done — the list says what is missing)"}\n\`\`\`\n${outp}\n\`\`\``);
  }

  writeFileSync(join(out, "RECOVERY_DIFF.md"), lines.join("\n") + "\n");
  put("out", `\n✓ full report: ${join(out, "RECOVERY_DIFF.md")}\n✓ recovered project root (work here): ${root}`);
  put("out", `\nNEXT: read the note above, finish only what was left half-done, then\n  cd "${root}" && node scripts/make-delivery-zip.mjs <out.zip> --against <last delivery zip>\n(item 17: DELIVER first; do not start new tasks in this session.)`);
  return { ok: true, code: null, out, root, report: join(out, "RECOVERY_DIFF.md"), note: marker.note ?? null, afterRound: marker.afterRound ?? null, against, changedInTransit: changedInTransit.map((k) => nowT.names[k] ?? mNames[k]), modified, added, removed, held: heldBack.map((h) => ({ path: h.path, kind: h.kind })), problems, collisions: collisions.length, guards };
}

// Runs only as the entry point (`node scripts/recovery-report.mjs`, or from a dump's RECOVER/ folder), never when the kit CLI or a test imports it.
const isEntry = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isEntry) {
  const argv = process.argv.slice(2);
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const dump = argv.find((a, i) => !a.startsWith("--") && !["--baseline", "--out", "--toolchain-digest"].includes(argv[i - 1]));
  const r = await recoveryReport({ dump, baseline: opt("--baseline"), out: opt("--out"), toolchainDigest: opt("--toolchain-digest"), trustToolchain: argv.includes("--trust-toolchain") });
  const { out, err } = renderRecoveryReport(r);
  process.stdout.write(out); process.stderr.write(err);
  process.exitCode = r.ok ? 0 : r.code === "EUSAGE" ? 2 : r.code === "EHASH_TOOLCHAIN" ? 3 : 1;
}
