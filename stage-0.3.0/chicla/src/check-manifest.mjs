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
// regenerate), EXCEPT a file git tracks (C27.2: a `.git` is present and `git ls-files` lists it): that fails with EMANIFEST_TRACKED. Runs on `prebuild`. Regenerate every round, AFTER all
// changes and BEFORE creating the zip.
//
// C11.1 slice 5b (D84): this is the CORE, in the kit package; scripts/check-manifest.mjs is a thin wrapper that imports it and prints and exits as the entry point.
// It reads the two pinned files, src/pinned/manifest.mjs and src/pinned/policy.mjs, by relative path (they move in the last slice).
// C11.1 slice 1: the work is `checkManifest({ root, write })`, which never prints, exits or throws; this file never prints or exits,
// so the kit CLI imports and runs the very same code (no child process).
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, openSync, fstatSync, closeSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { crc32, parseManifest, serializeManifest } from "./pinned/manifest.mjs";
import { SKIP_NAMES, PYTHON_DIRS, isSecretEnv, isSecretFileName, loadPolicy, policyAllows, policySkips, detectSecret, SCAN_LIMIT } from "./pinned/policy.mjs";
import { checkLf, statusFileAny, statusFileRe, statusPrefix } from "./integrity.mjs"; // C17.1: the status-file name and the LF rule are shared (docs/plan-a1-integrity.md); C26.1: the name carries the prefix of CLAUDE.md

const SKIP_FILES = new Set([".DS_Store", "FILES.manifest"]); // and every `*.tsbuildinfo` (D-245a, as `isJunkName` in policy.mjs)
const nfc = (f) => f.normalize("NFC");

// W2 — what NEVER enters the manifest (and therefore never a delivery zip, which is built from the manifest): the rules live in src/pinned/policy.mjs (C6.1),
// shared with verify-delivery-zip.mjs.

// C27.2 (D153): the files git tracks, read with `git ls-files -z` (NUL-separated and unquoted, so «ç» and spaces arrive as they are). Only called when the project has a `.git`.
// A git that is missing or fails (not a repository, `safe.directory`, a broken worktree pointer) is a SKIPPED check, never a failure: the guard must not break a machine that cannot ask.
function gitTracked(root, bin) {
  const env = { ...process.env }; for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[k]; // a hook's variables must not point git elsewhere
  const r = spawnSync(bin, ["-c", "core.quotepath=off", "ls-files", "-z"], { cwd: root, env, encoding: "buffer", maxBuffer: 256 * 1024 * 1024, timeout: 30000 });
  if (r.error) return { state: "unavailable" };
  if (r.status !== 0) return { state: "error" };
  return { state: "ok", files: r.stdout.toString("utf8").split("\0").filter(Boolean) };
}

// C29.1 (AUDIT-11 F-1): the files git tracks outside the manifest, GROUPED, and one ready `git rm` line. A FOLDER is named when every tracked file under it that exists is outside the manifest
// (the top-most such folder); a GLOB `dir/prefix*ext` when two or more of the rest share the directory, the text before the first digit and the extension AND no other tracked file that exists
// matches it (git's `*` also crosses `/`, so the test is made with `.*`); every other file is named. The command stops tracking (`--cached`: the files stay on disk) and is cut at about CMD_MAX
// characters (`complete: false`: run the check again for the rest). Pure: it reads nothing but `onDisk`.
const CMD_PREFIX = "git rm -r -q --cached --ignore-unmatch --", CMD_MAX = 3000;
const shq = (x) => (/^[A-Za-z0-9_.\/+@%=-]+$/.test(x) ? x : `'${x.replace(/'/g, `'\\''`)}'`);
const globRe = (g) => new RegExp(`^${g.split("*").map((q) => q.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
function groupTracked(outside, tracked, onDisk) {
  const out = new Set(outside), dirs = new Map();
  for (const f of tracked) {
    if (!onDisk(f)) continue;
    const segs = f.split("/");
    for (let i = 1; i < segs.length; i++) { const d = segs.slice(0, i).join("/"), e = dirs.get(d) ?? { all: 0, out: 0 }; e.all++; if (out.has(f)) e.out++; dirs.set(d, e); }
  }
  const whole = [...dirs].filter(([, e]) => e.out === e.all).map(([d]) => d).sort((a, b) => a.split("/").length - b.split("/").length || (a < b ? -1 : 1));
  const top = []; for (const d of whole) if (!top.some((t) => d.startsWith(`${t}/`))) top.push(d);
  const groups = top.map((d) => ({ path: d, kind: "folder", files: outside.filter((f) => f.startsWith(`${d}/`)).length }));
  let rest = outside.filter((f) => !top.some((t) => f.startsWith(`${t}/`)));
  const cand = new Map();
  for (const f of rest) {
    const i = f.lastIndexOf("/"), base = f.slice(i + 1), dot = base.lastIndexOf("."), m = /[0-9]/.exec(base);
    if (!m || dot < 0 || m.index > dot) continue; // a digit before the extension, or no glob
    const key = `${f.slice(0, i + 1)}${base.slice(0, m.index)}*${base.slice(dot)}`;
    cand.set(key, (cand.get(key) ?? 0) + 1);
  }
  for (const [glob, n] of [...cand].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (n < 2) continue;
    const re = globRe(glob);
    if (!tracked.every((f) => !re.test(f) || out.has(f) || !onDisk(f))) continue; // it would take a listed file: no glob, the names stay
    const hit = rest.filter((f) => re.test(f));
    groups.push({ path: glob, kind: "glob", files: hit.length });
    rest = rest.filter((f) => !re.test(f));
  }
  for (const f of rest) groups.push({ path: f, kind: "file", files: 1 });
  groups.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  let command = `${CMD_PREFIX}`, used = 0;
  for (const g of groups) { const part = ` ${shq(g.path)}`; if (used > 0 && command.length + part.length > CMD_MAX) break; command += part; used++; }
  return { groups, command: groups.length ? command : null, complete: used === groups.length };
}

/**
 * Checks (or, with `write`, regenerates) FILES.manifest of the project at `root`.
 * `git` (C27.2, a binary name; default `git`) is only for the tests.
 * Returns { ok, code, mode, messages, ... }: `code` is null when ok, else a stable code (EPOLICY_*, EMANIFEST_COLLISION, EMANIFEST_LOST, EMANIFEST_*);
 * `messages` is [{ stream: "out" | "err", text }] in the order the script prints them (see `renderCheckManifest`). Never prints, exits or throws.
 */
export function checkManifest({ root, write = false, git = "git" } = {}) {
  const ROOT = resolve(root ?? ".");
  const MANIFEST = join(ROOT, "FILES.manifest");
  const messages = [];
  const say = (stream, text) => messages.push({ stream, text });
  const result = { ok: true, code: null, mode: write ? "write" : "check", root: ROOT, messages, git: { state: "none" }, trackedOutside: [], trackedGroups: [], trackedCommand: null, trackedCommandComplete: true };
  const stop = (code, text) => { say("err", text); result.ok = false; result.code = code; return result; };

  // A root that is missing or is not a folder is a clean error, not an ENOENT from the walk (and `--write` must not create anything there).
  let rootIsDir = false; try { rootIsDir = statSync(ROOT).isDirectory(); } catch { /* missing or unreadable */ }
  if (!rootIsDir) return stop("EMANIFEST_ROOT", `\n✗ EMANIFEST_ROOT: the project folder does not exist or is not a folder: ${ROOT}`);

  // C6.1 d2 (D66): the optional chicla.policy.json adds to them. A policy that cannot be used stops the check and `--write` alike (failing open would leak).
  let POLICY;
  try { POLICY = loadPolicy(ROOT); } catch (e) { return stop(e.code ?? "EPOLICY", `\n✗ ${e.code ?? "EPOLICY"}: ${e.message}`); }

  // C16.6 (AUDIT-4 P-2): ONE read per file. The bytes that are scanned for a secret are the bytes that are hashed for `--write`; before, the scan opened every
  // file and `--write` read it again. A file over the scan limit is read only for `--write` (check mode has nothing to scan and nothing to hash), an `allow`ed file
  // is not scanned. A read error is kept for `--write` (it stops there with the same error as before) and means "no secret found" for the scan, as before.
  const sums = new Map(); // rel -> { crc32, size } | { err }; a missing entry (a file that is not a regular file) is read at write time, as before
  function inspect(p, rel, scan) {
    if (!write && !scan) return null;
    let fd;
    try {
      fd = openSync(p, "r");
      const st = fstatSync(fd);
      if (!st.isFile() || (st.size > SCAN_LIMIT && !write)) return null;
      const bytes = readFileSync(fd);
      if (write) sums.set(rel, { crc32: crc32(bytes), size: bytes.length });
      return scan ? detectSecret(bytes) : null;
    } catch (err) { if (write) sums.set(rel, { err }); return null; } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* nothing to do */ } }
  }

  const detected = []; // C6.3 b (D73): [rel, kind] of files left out because their CONTENT looks like a secret (the kind only, never the match)
  function walk(dir, out = []) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) { // C16.6: the entry already says what it is; only a symlink needs a stat (does it point to a folder?)
      const name = ent.name;
      if (SKIP_NAMES.has(name) || SKIP_FILES.has(name) || name.endsWith(".tsbuildinfo")) continue;
      const p = join(dir, name);
      const isDir = ent.isSymbolicLink() ? statSync(p).isDirectory() : ent.isDirectory();
      if (isDir && PYTHON_DIRS.has(name)) continue;
      if (!isDir && (/\.pyc$/.test(name) || isSecretEnv(name) || isSecretFileName(name))) continue; // (the .ssh and .aws folders are in SKIP_NAMES)
      const rel = relative(ROOT, p).split("\\").join("/");
      if (policySkips(rel, POLICY)) continue;
      if (isDir) { walk(p, out); continue; }
      const kind = inspect(p, rel, !policyAllows(rel, POLICY)); // C6.3 c: an `allow`ed file is not scanned
      if (kind) { detected.push([rel, kind]); continue; }
      out.push(rel);
    }
    return out;
  }

  const current = walk(ROOT).sort();
  result.files = current.length;
  result.detected = detected.sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([file, kind]) => ({ file, kind }));
  if (detected.length) say("err", `⚠ ${detected.length} file(s) left out of the manifest (and so of a delivery) because their content looks like a secret (name and kind only):\n  ${detected.map(([f, k]) => `${f}  [${k}]`).join("\n  ")}`);

  // C17.1 (D140): the LF rule of integrity.mjs. FILES.manifest is not in `current` (SKIP_FILES) but is one of the files that must be LF; a `--write` is about to regenerate it and the baseline, so it skips both.
  {
    const names = existsSync(MANIFEST) ? [...current, "FILES.manifest"] : current;
    const bad = checkLf({ names, read: (f) => { try { return readFileSync(join(ROOT, f)); } catch { return null; } } }, { skip: write ? ["FILES.manifest", "FILES.baseline.json"] : [] }).filter((r) => !r.ok).map((r) => r.file);
    if (bad.length) { result.crlf = bad; return stop("EINTEGRITY_LF", `\n✗ EINTEGRITY_LF: ${bad.length} file(s) have CRLF line endings, they must be LF only (see .gitattributes):\n  ${bad.join("\n  ")}`); }
  }

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
    try {
      text = serializeManifest(current.map((rel) => {
        let sum = sums.get(rel);
        if (!sum) { const b = readFileSync(join(ROOT, rel)); sum = { crc32: crc32(b), size: b.length }; }
        if (sum.err) throw sum.err;
        return { path: rel, crc32: sum.crc32, size: sum.size };
      }));
    }
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
  // The status file is renamed every round (<PREFIX>_PROJECT_STATUS-N.md -> -N+1, instruction 8):
  // that is a deliberate rename, not a loss, as long as exactly one status file exists now. A LISTED name may carry another prefix (C26.1: the project changed it), so it is matched by shape.
  const claudeView = { names: current.includes("CLAUDE.md") ? ["CLAUDE.md"] : [], read: (f) => { try { return readFileSync(join(ROOT, f)); } catch { return null; } } };
  const statusNow = current.filter((f) => statusFileRe(statusPrefix(claudeView)).test(f));
  const lost = listed.filter((f) => !have.has(nfc(f)) && !(statusFileAny.test(f) && statusNow.length === 1));
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
  // C27.2 (D153): git hygiene. Only in check mode and only when the project has a `.git` (a delivery zip or a copy has none: nothing is checked there).
  // A file git TRACKS that is on the disk and not in the manifest is a mistake the warning above never stopped (round 303: `ci/package/` and `stage2/`, build output
  // committed by mistake). A tracked file that is gone from the disk (a pending `git rm`, the old status file) is not flagged.
  if (existsSync(join(ROOT, ".git"))) {
    const g = gitTracked(ROOT, git);
    result.git = { state: g.state };
    if (g.state === "ok") {
      result.git.tracked = g.files.length;
      const inManifest = (f) => listedSet.has(nfc(f)); // (its own name: the K-CMN-15 anchor above must stay unique)
      const isFile = (f) => { try { return statSync(join(ROOT, f)).isFile(); } catch { return false; } };
      result.trackedOutside = g.files.filter((f) => f !== "FILES.manifest" && !inManifest(f) && isFile(f)).sort(); // the manifest never lists itself (SKIP_FILES)
      if (result.trackedOutside.length) {
        const t = result.trackedOutside;
        const grp = groupTracked(t, g.files, isFile);
        result.trackedGroups = grp.groups; result.trackedCommand = grp.command; result.trackedCommandComplete = grp.complete;
        const few = t.length <= 15; // up to 15 files are named as before; more are summarised by group
        const list = few ? t : grp.groups.slice(0, 15).map((x) => `${x.files} × ${x.path}${x.kind === "folder" ? "/" : ""}`);
        const more = !few && grp.groups.length > 15 ? `\n  … and ${grp.groups.length - 15} more group(s)` : "";
        return stop("EMANIFEST_TRACKED", `\n✗ EMANIFEST_TRACKED: ${t.length} file(s) tracked by git are not in FILES.manifest${few ? "" : `, in ${grp.groups.length} group(s)`}:\n  ${list.join("\n  ")}${more}\n  To stop tracking them (they stay on disk), run:\n    ${grp.command}${grp.complete ? "" : "\n  (that line covers the first groups only: run the check again for the rest)"}\n  A stale copy of something that moved (an old status file, an archive now under docs/archive/)? Delete it instead: the same line without --cached. Build output committed by mistake? Name the folder in .gitignore. A real source file? regenerate with node scripts/check-manifest.mjs --write.`);
      }
    }
  }
  say("out", `✓ no file lost (${listed.length} in the manifest, ${current.length} on disk)`);
  return result;
}

/** The text the script prints for a result, per stream (one line per message, as console.log/warn/error did). */
export function renderCheckManifest(result) {
  const text = (stream) => result.messages.filter((m) => m.stream === stream).map((m) => `${m.text}\n`).join("");
  return { out: text("out"), err: text("err") };
}
