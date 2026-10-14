// Guard against LOST FILES (what happened in the round 196 session:
// an update replaced lib/devpanel/ with a partial folder and 11
// modules vanished without anyone noticing).
//
//   node scripts/check-manifest.mjs           -> checks (fails if any file is missing)   [the wrapper over this core]
//   node scripts/check-manifest.mjs --write   -> regenerates FILES.manifest (v2: path, crc32, size)
//   chicla check-manifest [--write] [--json] [--root <dir>]   -> the same code, through the kit CLI (C11.1)
//
// FILES.manifest lists the path of every source file of the project. The
// check FAILS if a listed path no longer exists (lost file) and
// only WARNS if there is a new file that is not listed (forgot to
// regenerate). Runs on `prebuild`. Regenerate every round, AFTER all
// changes and BEFORE creating the zip.
//
// C11.1 slice 5b (D84): this is the CORE, in the kit package; scripts/check-manifest.mjs is a thin wrapper that imports it and prints and exits as the entry point.
// It reads the two pinned files, src/pinned/manifest.mjs and src/pinned/policy.mjs, by relative path (they move in the last slice).
// C11.1 slice 1: the work is `checkManifest({ root, write })`, which never prints, exits or throws; this file never prints or exits,
// so the kit CLI imports and runs the very same code (no child process).
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { crc32, parseManifest, serializeManifest } from "./pinned/manifest.mjs";
import { SKIP_NAMES, PYTHON_DIRS, isSecretEnv, isSecretFileName, loadPolicy, policyAllows, policySkips, scanFile } from "./pinned/policy.mjs";

const SKIP_FILES = new Set([".DS_Store", "tsconfig.tsbuildinfo", "FILES.manifest"]);
const STATUS_RE = /^CHICLA_PROJECT_STATUS-\d+\.md$/;
const nfc = (f) => f.normalize("NFC");

// W2 — what NEVER enters the manifest (and therefore never a delivery zip, which is built from the manifest): the rules live in src/pinned/policy.mjs (C6.1),
// shared with verify-delivery-zip.mjs.

/**
 * Checks (or, with `write`, regenerates) FILES.manifest of the project at `root`.
 * Returns { ok, code, mode, messages, ... }: `code` is null when ok, else a stable code (EPOLICY_*, EMANIFEST_COLLISION, EMANIFEST_LOST, EMANIFEST_*);
 * `messages` is [{ stream: "out" | "err", text }] in the order the script prints them (see `renderCheckManifest`). Never prints, exits or throws.
 */
export function checkManifest({ root, write = false } = {}) {
  const ROOT = resolve(root ?? ".");
  const MANIFEST = join(ROOT, "FILES.manifest");
  const messages = [];
  const say = (stream, text) => messages.push({ stream, text });
  const result = { ok: true, code: null, mode: write ? "write" : "check", root: ROOT, messages };
  const stop = (code, text) => { say("err", text); result.ok = false; result.code = code; return result; };

  // C6.1 d2 (D66): the optional chicla.policy.json adds to them. A policy that cannot be used stops the check and `--write` alike (failing open would leak).
  let POLICY;
  try { POLICY = loadPolicy(ROOT); } catch (e) { return stop(e.code ?? "EPOLICY", `\n✗ ${e.code ?? "EPOLICY"}: ${e.message}`); }

  const detected = []; // C6.3 b (D73): [rel, kind] of files left out because their CONTENT looks like a secret (the kind only, never the match)
  function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
      if (SKIP_NAMES.has(name) || SKIP_FILES.has(name)) continue;
      const p = join(dir, name);
      const isDir = statSync(p).isDirectory();
      if (isDir && PYTHON_DIRS.has(name)) continue;
      if (!isDir && (/\.pyc$/.test(name) || isSecretEnv(name) || isSecretFileName(name))) continue; // (the .ssh and .aws folders are in SKIP_NAMES)
      const rel = relative(ROOT, p).split("\\").join("/");
      if (policySkips(rel, POLICY)) continue;
      if (isDir) { walk(p, out); continue; }
      const kind = policyAllows(rel, POLICY) ? null : scanFile(p); // C6.3 c: an `allow`ed file is not scanned
      if (kind) { detected.push([rel, kind]); continue; }
      out.push(rel);
    }
    return out;
  }

  const current = walk(ROOT).sort();
  result.files = current.length;
  result.detected = detected.sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([file, kind]) => ({ file, kind }));
  if (detected.length) say("err", `⚠ ${detected.length} file(s) left out of the manifest (and so of a delivery) because their content looks like a secret (name and kind only):\n  ${detected.map(([f, k]) => `${f}  [${k}]`).join("\n  ")}`);

  // C7.3 (D56): two files on disk whose names differ only in NFC/NFD. The NFC comparison below would put them under one key and a lost file
  // could hide behind its look-alike, so this stops the check and `--write` alike.
  {
    const by = new Map(), pairs = [];
    for (const f of current) { const k = nfc(f), first = by.get(k); if (first === undefined) by.set(k, f); else pairs.push(`${first}  ≈  ${f}`); }
    if (pairs.length) { result.collisions = pairs; return stop("EMANIFEST_COLLISION", `\n✗ EMANIFEST_COLLISION: ${pairs.length} pair(s) of files differ only in NFC/NFD (rename one of each pair):\n  ${pairs.slice(0, 15).join("\n  ")}`); }
  }

  if (write) {
    // v2 (C7.1 slice b): path, crc32 and size read from the disk now; the sha256 stays in FILES.baseline.json (D43)
    let text;
    try { text = serializeManifest(current.map((rel) => { const b = readFileSync(join(ROOT, rel)); return { path: rel, crc32: crc32(b), size: b.length }; })); }
    catch (e) { return stop(e.code ?? "EMANIFEST", `\n✗ ${e.code ?? "EMANIFEST"}: FILES.manifest was NOT written (${e.message})`); }
    writeFileSync(MANIFEST, text);
    result.written = current.length;
    say("out", `✓ FILES.manifest written (${current.length} files, v2: crc32 and size)`);
    return result;
  }

  if (!existsSync(MANIFEST)) {
    result.manifestMissing = true;
    say("err", "⚠ FILES.manifest does not exist — run `node scripts/check-manifest.mjs --write` to create it.");
    return result;
  }

  // v1 (paths) or v2 (path, crc32, size): one parser (C7.1). A corrupt manifest fails the check, it never passes it.
  let listed;
  try { listed = parseManifest(readFileSync(MANIFEST, "utf8")).map((e) => e.path); }
  catch (e) { return stop(e.code ?? "EMANIFEST", `\n✗ ${e.code ?? "EMANIFEST"}: FILES.manifest cannot be read (${e.message})`); }
  // Round 1r: names are compared in NFC (a manifest written on macOS has NFD; the git checkout on Linux brings NFC).
  // Only the COMPARISON is normalised: the names printed and those `--write` writes are the true ones from the disk.
  const have = new Set(current.map(nfc));
  // The status file is renamed every round (CHICLA_PROJECT_STATUS-N.md -> -N+1, instruction 8):
  // that is a deliberate rename, not a loss, as long as exactly one status file exists now.
  const statusNow = current.filter((f) => STATUS_RE.test(f));
  const lost = listed.filter((f) => !have.has(nfc(f)) && !(STATUS_RE.test(f) && statusNow.length === 1));
  const listedSet = new Set(listed.map(nfc));
  const added = current.filter((f) => !listedSet.has(nfc(f)));
  result.listed = listed.length; result.lost = lost; result.added = added;

  if (added.length) say("err", `⚠ ${added.length} new file(s) outside FILES.manifest (regenerate with node scripts/check-manifest.mjs --write):\n  ${added.slice(0, 15).join("\n  ")}`);
  if (lost.length) {
    say("err", `\n✗ ${lost.length} LOST file(s) vs FILES.manifest:\n  ${lost.join("\n  ")}`);
    const nowSecret = detected.filter(([f]) => lost.some((l) => nfc(l) === nfc(f))).map(([f]) => f);
    if (nowSecret.length) say("err", `\n  Not lost, held back: ${nowSecret.join(", ")} now look(s) like a secret (see above). Remove the secret from the file; or, if it must go, run --write (and name it with --allow-removed when a delivery is built against a zip that carries it).`);
    say("err", "\nProbable cause: a folder was replaced by a partial version. Restore these files BEFORE continuing.\n");
    result.ok = false; result.code = "EMANIFEST_LOST";
    return result;
  }
  say("out", `✓ no file lost (${listed.length} in the manifest, ${current.length} on disk)`);
  return result;
}

/** The text the script prints for a result, per stream (one line per message, as console.log/warn/error did). */
export function renderCheckManifest(result) {
  const text = (stream) => result.messages.filter((m) => m.stream === stream).map((m) => `${m.text}\n`).join("");
  return { out: text("out"), err: text("err") };
}
