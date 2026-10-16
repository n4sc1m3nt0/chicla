// EMERGENCY COMMAND (/dump) — dumps the WHOLE working directory into a zip, right now.
//
//   node scripts/emergency-dump.mjs [--project-only] ["short note: what you were doing / what is missing"]
//   chicla dump [note...] [--note <text>] [--project-only] [--outdir <dir>] [--json] [--root <dir>]      (C11.1 slice 4a, D82)
//
// The logic is the exported core `emergencyDump({ work, outdir, note, projectOnly, noOutputs, hashLimit })`: it never prints, exits or throws, and returns
// { ok, code, path, name, bytes, project, projectFiles, touched, newVsManifest, lostVsManifest, collisions, unhashed, projectOnly, held, policyError, warnings, messages }
// (`messages` = [{ stream: "out" | "err", text }], rendered by `renderEmergencyDump`). `code` is null, EDUMP_NO_PROJECT (--project-only and no project root: no dump),
// EDUMP_FAILED (neither the chicla-zip writer, zip nor tar worked) or EDUMP_ERROR (anything unexpected). The script below runs ONLY as the entry point; exit 0 = a dump
// was created (warnings never change that), 1 = none was. The core imports nothing outside the pinned RECOVER files (policy.mjs only through the guarded import).
//
// --project-only (C6.2, D70): takes ONLY the project root (the folder with package.json + FILES.manifest), the marker, the report and RECOVER/; the rest of
// work/ and outputs/ stay out. Opt-in: the default keeps the notes and scratch files beside the project, which a recovery may need (D59). With no project root
// it refuses (exit 1, no dump): an explicit option is never silently widened to the whole directory.
//
// For when the tool limit is hit close to the usage limit: the work is done but unreachable.
// This script is NOT a delivery:
//   - it runs NO guards (check-manifest, check-imports, verify-delivery-zip). A half-done tree
//     would fail them and the zip would never be created — the opposite of what is wanted here.
//   - it does NOT regenerate FILES.manifest and does NOT touch any project file (read only).
//   - it does NOT fail because of the report: any error while generating the report is recorded
//     inside the zip itself and the zip is created anyway. The only possible failure is `zip` itself.
//
// Zip contents (with a `work/` and an `outputs/` folder, on purpose: it does NOT paste onto the project root):
//   RECOVERY_MARKER.json   marker + sha256 of every project file (read by recovery-report.mjs)
//   RECOVER/…              the recovery toolchain (C9.2): recovery-report.mjs + baseline.mjs + manifest.mjs + zipkit.mjs; sha256 in the marker
//   RECOVERY_REPORT.md     what is in the zip, what changed since the last delivery, the note
//   work/…                 the working directory (/home/claude) as it is
//   outputs/…              files (not .zip) that were already in /mnt/user-data/outputs
// It excludes only what is never work: node_modules, .next, .git, __MACOSX, .DS_Store,
// tsbuildinfo, npm caches, .zip files (deliveries already made), .env / .env.* secrets (not the
// .example/.sample ones) and — W3, the same rules as W2 — .venv/,
// __pycache__/ and *.pyc (no project-specific folder: D64).
// C6.3 slice b2 (D73, D76): a file whose CONTENT looks like a secret (private-key header, AWS access key id, GitHub ghp_ / github_pat_, npm npm_) stays out too,
// in the stream, the external zip and the tar path; the marker (`secretsHeld`), the report and the console name the file and the KIND, never the match.
// Project root = folder with package.json + FILES.manifest. Known limit: in the tar.gz fallback
// (only if `zip` does not exist) the .env.example/.sample files are not put back.
//
// Options (for tests only): --work <dir>  --outdir <dir>  --no-outputs  --hash-limit <bytes>   (--project-only is for users; `chicla dump` takes --root and --outdir)
// C9.1: the zip is written by chicla-zip (writeZipStream) with no external `zip`; each file is hashed (sha256) in the same pass that
// streams it into the zip, and the marker and the report are written LAST (they need the hashes). Past the hash limit (default 300 MB)
// files still go in, unhashed, and the marker says so. If the writer fails for any reason, the old `zip` / `tar` path below runs (D7).
// C11.1 slice 5f (D84, D89): this is the CORE, in the kit package. It imports only `node:` modules and the PINNED files, by relative path (src/pinned/manifest.mjs statically,
// src/pinned/policy.mjs through the guarded import, packages/chicla-zip/src/zipkit.mjs for the writer), never its siblings in src/, and has no entry point: the dump must keep
// working when anything else is broken. `scripts/emergency-dump.mjs` is a thin wrapper (flags, print, exit) and `chicla dump` imports the same code. The project root, where the
// five pinned RECOVER files are read from, is three folders up from this file.
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
// C14.7 (D113): every `rel` of the scan is made here, with «/» whatever the platform: the rest of the core compares and splits it with «/» (project root, `dir.split("/")`, `projRel`), and on win32 `path.relative` gives backslashes (round 156 CI log). `pm` lets a Linux test take the win32 branch; on POSIX a backslash in a name is a name character and is left alone.
export const relPosix = (root, p, pm = { relative, sep }) => pm.relative(root, p).split(pm.sep).join("/");
import { tmpdir } from "node:os";
import { parseManifest } from "./pinned/manifest.mjs";

const SCRIPT_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url))); // never URL.pathname (round 198)

const EXCLUDE_DIRS = new Set(["node_modules", ".next", ".git", "__MACOSX", ".npm-global", ".cache", ".npm", ".venv", "__pycache__", ".ssh", ".aws"]);
const isKeptEnv = (n) => /^\.env(\..*)?$/.test(n) && /\.(example|sample)$/.test(n); // W2 rule: .env.example/.sample are not secrets
// C6.3 slice a (D73): the dump's OWN copy (D7) of policy.mjs's credential names: the folders .ssh and .aws (above) and the file names .npmrc, .netrc, .git-credentials, *.pem,
// id_rsa* in any case. test/secret-names.test.mjs ties it to the policy. `ci` makes a glob case-insensitive for the zip/tar path.
const secretFile = (n) => { const l = n.toLowerCase(); return l === ".npmrc" || l === ".netrc" || l === ".git-credentials" || l.endsWith(".pem") || l.startsWith("id_rsa"); };
const ci = (g) => g.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
const SECRET_EX = ["*/.ssh/*", "*/.aws/*", `*/${ci(".npmrc")}`, `*/${ci(".netrc")}`, `*/${ci(".git-credentials")}`, `*.${ci("pem")}`, `*/${ci("id_rsa")}*`];
const skipFile = (n) => secretFile(n) || n === ".DS_Store" || n.endsWith(".tsbuildinfo") || n.endsWith(".zip") || n.endsWith(".pyc") || ((n === ".env" || n.startsWith(".env.")) && !isKeptEnv(n)); // secrets never enter a dump
// C9.8: tool and home-directory noise at the TOP of work/ (the 60 MB `uv` binary, an `.npmrc` that can hold a registry token) stays out and is named
// in the report and the marker. Only the top level, and never when work/ is itself the project root (then those names are the project's own work).
// `recovered*` is NOT skipped on purpose: a recovery session works inside `recovered/work/<project>` (D59).
// C6.3 slice b2 (D73, D76): the dump's OWN copy (D7) of policy.mjs's content detector; test/dump-secret-content.test.mjs ties it to detectSecret by behaviour.
// A file over 1 MiB, empty, with a NUL byte (binary, UTF-16) or that cannot be read is not scanned: a known limit, never a reason to stop the dump.
const SCAN_LIMIT = 1048576;
const DETECTORS = [
  ["private key", /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/],
  ["AWS access key", /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/],
  ["GitHub token", /(?<![A-Za-z0-9])(?:ghp_[A-Za-z0-9]{36}(?![A-Za-z0-9])|github_pat_[A-Za-z0-9_]{22,})/],
  ["npm token", /(?<![A-Za-z0-9])npm_[A-Za-z0-9]{36}(?![A-Za-z0-9])/],
];
const scanKind = (path, size) => {
  if (size === 0 || size > SCAN_LIMIT) return null;
  try { const b = readFileSync(path); if (b.length === 0 || b.length > SCAN_LIMIT || b.includes(0)) return null; const t = b.toString("latin1"); for (const [kind, re] of DETECTORS) if (re.test(t)) return kind; } catch { /* unreadable: not scanned */ }
  return null;
};
const HOME_NOISE = [".local", ".config", ".npmrc", ".wget-hsts"];

// C9.2: RECOVER/ = the recovery toolchain, ASCII names, taken from THIS tree (the scripts that ran), with its sha256 in the marker.
const TOOLCHAIN = { "RECOVER/recovery-report.mjs": "packages/chicla-kit/src/pinned/recovery-report.mjs", "RECOVER/baseline.mjs": "packages/chicla-kit/src/pinned/baseline.mjs", "RECOVER/manifest.mjs": "packages/chicla-kit/src/pinned/manifest.mjs", "RECOVER/policy.mjs": "packages/chicla-kit/src/pinned/policy.mjs", "RECOVER/zipkit.mjs": "packages/chicla-zip/src/zipkit.mjs" };

/**
 * Dumps the working directory `work` into a zip in `outdir` (defaults: /home/claude or this tree; /mnt/user-data/outputs or work/outputs). Never prints, exits or throws:
 * every line it would have printed is in `messages`. See the header for the result.
 */
export async function emergencyDump(opts = {}) {
  const messages = [];
  const say = (stream, text) => messages.push({ stream, text });
  let r;
  try { r = await dump(opts ?? {}, say); }
  catch (e) { say("err", `✗ EDUMP_ERROR: ${e.code ? `${e.code}: ` : ""}${e.message} — dump NOT created.`); r = { ok: false, code: "EDUMP_ERROR", path: null }; }
  return { ...r, messages };
}

/** The text the script prints for a result, per stream (one line per message, as console.log/console.error did). */
export function renderEmergencyDump(result) {
  const text = (stream) => result.messages.filter((m) => m.stream === stream).map((m) => `${m.text}\n`).join("");
  return { out: text("out"), err: text("err") };
}

async function dump(o, say) {
  const { projectOnly = false, noOutputs = false, hashLimit } = o;
  const note = String(o.note ?? "").trim();
  const WORK = resolve(o.work ?? (existsSync("/home/claude") ? "/home/claude" : SCRIPT_ROOT));
  const OUTDIR = resolve(o.outdir ?? (existsSync("/mnt/user-data/outputs") ? "/mnt/user-data/outputs" : join(WORK, "outputs")));
  mkdirSync(OUTDIR, { recursive: true });
  const fail = (code, text) => { say("err", text); return { ok: false, code, path: null }; };
  const relay = (r) => { const t = String(r.stderr ?? "").trim(); if (t) for (const l of t.split("\n")) say("err", l); }; // what the external zip/tar said
  const held = []; // { base: "work" | "outputs", rel, kind }: files left out because of what is inside them (name and kind only; the match is never kept)
  const skipHome = !existsSync(join(WORK, "FILES.manifest"));
  const homeSkipped = new Set();
  const errors = [];
  const safe = (what, fn, fallback) => { try { return fn(); } catch (e) { errors.push(`${what}: ${e.code ? `${e.code}: ` : ""}${e.message}`); return fallback; } };

  const toolchain = {}, toolData = {};
  for (const [name, src] of Object.entries(TOOLCHAIN)) safe(`toolchain ${src}`, () => { const b = readFileSync(join(SCRIPT_ROOT, src)); toolData[name] = b; toolchain[name] = createHash("sha256").update(b).digest("hex"); });

  // Walks a tree (without following symlinks), returns [{rel, size, mtime}] and the excluded .zip files.
  function walk(root, prefix) {
    const files = [], zips = [];
    const go = (dir) => {
      let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch (e) { errors.push(`read ${dir}: ${e.message}`); return; }
      for (const e of ents) {
        const p = join(dir, e.name);
        if (e.isSymbolicLink()) continue;
        if (prefix === "work" && skipHome && dir === root && HOME_NOISE.includes(e.name)) { homeSkipped.add(e.name); continue; }
        if (e.isDirectory()) {
          if (EXCLUDE_DIRS.has(e.name)) continue;
          go(p); continue;
        }
        if (!e.isFile()) continue;
        let st; try { st = statSync(p); } catch { continue; }
        if (e.name.endsWith(".zip")) { zips.push({ rel: relPosix(root, p), size: st.size }); continue; }
        if (skipFile(e.name)) continue;
        const kind = scanKind(p, st.size);
        const file = { rel: relPosix(root, p), size: st.size, mtime: st.mtimeMs, mode: st.mode & 0o7777 };
        if (kind) { held.push({ base: prefix, rel: file.rel, kind, file }); continue; } // `file` kept: the project's `allow` may release it below (C6.3 c2)
        files.push(file);
      }
    };
    go(root);
    return { files, zips };
  }

  const workScan = safe("walk work", () => walk(WORK, "work"), { files: [], zips: [] });
  const outScan = noOutputs || projectOnly || resolve(OUTDIR).startsWith(WORK + "/") ? { files: [], zips: [] } : safe("walk outputs", () => walk(OUTDIR, "outputs"), { files: [], zips: [] });

  // Project root(s): folders (up to 3 levels) with package.json + FILES.manifest. The shallowest / most recent one wins.
  const projectRoots = [];
  for (const f of workScan.files) {
    if (!f.rel.endsWith("FILES.manifest")) continue;
    const dir = f.rel === "FILES.manifest" ? "" : f.rel.slice(0, -"/FILES.manifest".length);
    if (dir.split("/").length > 3) continue;
    if (workScan.files.some((g) => g.rel === (dir ? `${dir}/package.json` : "package.json"))) projectRoots.push({ dir, depth: dir ? dir.split("/").length : 0, mtime: f.mtime });
  }
  projectRoots.sort((a, b) => a.depth - b.depth || b.mtime - a.mtime);
  const project = projectRoots[0] ?? null;
  const inProject = (rel) => project && (project.dir === "" ? true : rel.startsWith(project.dir + "/"));
  const projRel = (rel) => (project && project.dir ? rel.slice(project.dir.length + 1) : rel);
  // C6.1 d2b (D67): the project's chicla.policy.json ADDS rules. The dump keeps its own built-in rules (D7) and reads policy.mjs through a GUARDED import: if it is
  // missing or broken, or the file cannot be used, the dump is still made, without the policy, and says why (marker, report, summary). Never a reason to stop.
  const policyState = { applied: false, dropped: 0, error: null };
  let POLICY_EX = []; // the same rules as patterns for the external zip/tar path
  if (project && existsSync(join(WORK, project.dir, "chicla.policy.json"))) {
    let mod = null;
    try { mod = await import(new URL("./pinned/policy.mjs", import.meta.url).href); } catch (e) { policyState.error = "EPOLICY_IMPORT"; errors.push(`chicla.policy.json NOT applied: EPOLICY_IMPORT: ${e.message}`); }
    if (mod) {
      try {
        const pol = mod.loadPolicy(join(WORK, project.dir)), before = workScan.files.length;
        workScan.files = workScan.files.filter((f) => !(inProject(f.rel) && mod.policySkips(projRel(f.rel), pol)));
        policyState.applied = true; policyState.dropped = before - workScan.files.length;
        // C6.3 slice c2 (D78): the dump's OWN copy of the `allow` rule (D7; test/dump-allow-held.test.mjs ties it to policyAllows() by behaviour): an exact project path, compared in NFC.
        // A released file goes in like any other, silently (not «held back»), unless the same policy also lists it. Only reached when the policy loaded: otherwise nothing is released.
        if (pol.allow instanceof Set) for (let i = held.length - 1; i >= 0; i--) {
          const h = held[i];
          if (h.base !== "work" || !inProject(h.rel) || !pol.allow.has(projRel(h.rel).normalize("NFC"))) continue;
          held.splice(i, 1);
          if (!mod.policySkips(projRel(h.rel), pol)) workScan.files.push(h.file);
        }
        const g = (x) => x.replace(/[*?[\]]/g, "?"); // glob characters in a listed name stand for themselves: «?» matches the literal one (over-excludes, never leaks)
        const pd = project.dir ? `${project.dir}/` : "";
        POLICY_EX = [...pol.paths.flatMap((x) => [`work/${g(pd + x)}`, `work/${g(pd + x)}/*`]), ...[...pol.names].flatMap((n) => [`*/${g(n)}`, `*/${g(n)}/*`])];
      } catch (e) { policyState.error = e.code ?? "EPOLICY_READ"; errors.push(`chicla.policy.json NOT applied: ${policyState.error}: ${e.message}`); }
    }
  }
  // C6.2 (D70, D71): --project-only keeps only the project's files (outputs/ was already left out above).
  if (projectOnly) {
    if (!project) { return fail("EDUMP_NO_PROJECT", "✗ --project-only: no project root found in the working directory (a folder with package.json + FILES.manifest). No dump was created. Run /dump without the option to take the whole working directory."); }
    workScan.files = workScan.files.filter((f) => inProject(f.rel));
    for (let i = held.length - 1; i >= 0; i--) if (held[i].base !== "work" || !inProject(held[i].rel)) held.splice(i, 1); // outside the option's scope: not in the dump, so not «held back»
  }
  const heldList = held.map((h) => ({ path: `${h.base}/${h.rel}`, kind: h.kind })).sort((a, b) => (a.path < b.path ? -1 : 1));
  const projectFiles = project ? workScan.files.filter((f) => inProject(f.rel)) : [];
  const scratchFiles = workScan.files.filter((f) => !inProject(f.rel));

  // Hashes (project only), filled while the files are streamed into the zip (or by hashAllSync in the fallback). Past HASH_LIMIT bytes files are not hashed.
  const hashes = {};
  let hashedBytes = 0, unhashed = 0;
  const HASH_LIMIT = (() => { const v = hashLimit; if (v === undefined) return 300e6; if (/^\d+$/.test(String(v))) return Number(v); errors.push(`--hash-limit "${v}" is not a whole number of bytes; using the default`); return 300e6; })();
  const wantsHash = (f) => { if (!inProject(f.rel)) return false; if (hashedBytes >= HASH_LIMIT) { unhashed++; return false; } hashedBytes += f.size; return true; };
  const hashAllSync = () => { for (const f of projectFiles) if (wantsHash(f)) safe(`hash ${f.rel}`, () => { hashes[projRel(f.rel)] = createHash("sha256").update(readFileSync(join(WORK, f.rel))).digest("hex"); }); };

  // Project metadata.
  const readP = (p) => (project ? safe(`read ${p}`, () => readFileSync(join(WORK, project.dir, p), "utf8"), "") : "");
  const changelog = readP("CHANGELOG.md");
  const afterRound = (changelog.match(/^## Round (\S+)/m) ?? [])[1] ?? "unknown";
  const fpSeq = (changelog.split("\n", 1)[0].match(/seq=(\d+)/) ?? [])[1] ?? "?";
  const statusFile = projectFiles.map((f) => projRel(f.rel)).find((r) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(r)) ?? "(not found)";
  const appVersion = (() => { try { return JSON.parse(readP("package.json")).version ?? "?"; } catch { return "?"; } })(); // app version = "version" in the root package.json (D13)
  const manifestPath = project ? join(WORK, project.dir, "FILES.manifest") : null;
  const manifestList = manifestPath && existsSync(manifestPath) ? safe("manifest", () => parseManifest(readFileSync(manifestPath, "utf8")).map((e) => e.path), []) /* v1 or v2; a bad manifest is recorded, never fatal */ : [];
  const manifestMtime = manifestPath && existsSync(manifestPath) ? statSync(manifestPath).mtimeMs : 0;
  // compare in NFC (macOS manifest = NFD; Linux disk = NFC); print the true names
  const nfc = (p) => p.normalize("NFC");
  const diskNames = projectFiles.map((f) => projRel(f.rel));
  const onDisk = new Set(diskNames.map(nfc));
  const manifestSet = new Set(manifestList.map(nfc));
  const heldInProject = new Set(heldList.filter((h) => project && h.path.normalize("NFC").startsWith(nfc(project.dir ? `work/${project.dir}/` : "work/"))).map((h) => nfc(h.path).slice(nfc(project.dir ? `work/${project.dir}/` : "work/").length))); // D79 (4): a held file is «held back» (own section), not «lost»
  const lostVsManifest = manifestList.filter((p) => !onDisk.has(nfc(p)) && !heldInProject.has(nfc(p)));
  const newVsManifest = diskNames.filter((p) => !manifestSet.has(nfc(p)) && p !== "FILES.manifest");
  const collisions = (() => { const g = new Map(); for (const n of diskNames) g.set(nfc(n), [...(g.get(nfc(n)) ?? []), n]); return [...g.values()].filter((v) => v.length > 1).map((v) => v.sort()).sort((a, b) => (a[0] < b[0] ? -1 : 1)); })(); // C9.3: groups of true names that differ only in NFC/NFD
  const touched = projectFiles.filter((f) => manifestMtime && f.mtime > manifestMtime + 2000).sort((a, b) => b.mtime - a.mtime);
  const newest = [...projectFiles].sort((a, b) => b.mtime - a.mtime).slice(0, 40);

  const now = new Date();
  const iso = now.toISOString();
  const stamp = iso.replace(/[-:]/g, "").replace("T", "-").slice(0, 15); // YYYYMMDD-HHMMSS
  const day = iso.slice(0, 10);
  const zipName = `chicla-EMERGENCY-afterRound${afterRound}-${day}-${stamp.slice(9)}.zip`;

  const cap = (arr, n) => (arr.length > n ? [...arr.slice(0, n), `… (+${arr.length - n})`] : arr);
  const kb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
  const when = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z";

  const buildMarker = () => ({
    format: "chicla-recovery-v1",
    created: iso,
    note: note || null,
    workRoot: WORK,
    projectRootRel: project ? project.dir : null,
    afterRound, statusFile, changelogSeq: fpSeq, appVersion,
    projectFileCount: projectFiles.length,
    hashes,
    toolchain, collisions, homeSkipped: [...homeSkipped].sort(),
    hashLimit: HASH_LIMIT, hashLimitReached: unhashed > 0, unhashed,
    projectOnly,
    policy: policyState,
    secretsHeld: heldList,
    reportErrors: errors,
  });

  const buildReport = () => `# RECOVERY — emergency dump (NOT a delivery)
${collisions.length ? `\n## ⚠ Names that differ only in NFC/NFD (${collisions.length} group(s))\nEach group is one file on a Mac or in a manifest; here they are separate files. Compare them by hand.\n${collisions.map((g) => `- ${g.join("  ≈  ")}`).join("\n")}\n` : ""}

- Created: ${iso}
- Note from the session that dumped: ${note ? `**${note}**` : "_(no note)_"}
- Project state at the dump: last round in the CHANGELOG = **${afterRound}**, status file \`${statusFile}\`, CHANGELOG seq=${fpSeq}, APP_VERSION ${appVersion}.
- Project: \`work/${project ? project.dir || "(root of work/)" : "?? (no folder with package.json + FILES.manifest)"}\` — ${projectFiles.length} files.

**This zip passed NO guard**, it may hold half-written files and it does NOT paste onto the project root
(it has the \`work/\` and \`outputs/\` folders). To use it: send it to the next session and say "recovery mode"
(item 17 of the status file). The baseline travels inside the dump (FILES.baseline.json), so nothing else has to come with it.

## Likely changes in this session (mtime later than the last delivery's FILES.manifest)
${touched.length ? cap(touched.map((f) => `- ${projRel(f.rel)}  (${when(f.mtime)}, ${kb(f.size)})`), 80).join("\n") : "- (none — or the clocks do not help; see the lists below)"}

## Files on disk that are NOT in FILES.manifest (new since the last delivery)
${newVsManifest.length ? cap(newVsManifest.map((p) => `- ${p}`), 80).join("\n") : "- (none)"}

## Files in FILES.manifest that are NOT on disk (lost or deleted — review!)
${lostVsManifest.length ? cap(lostVsManifest.map((p) => `- ${p}`), 80).join("\n") : "- (none)"}

## The 40 most recently modified project files
${newest.map((f) => `- ${projRel(f.rel)}  (${when(f.mtime)})`).join("\n") || "- (none)"}

## Outside the project root, inside work/ (scratch files, loose files)
${scratchFiles.length ? cap(scratchFiles.sort((a, b) => b.mtime - a.mtime).map((f) => `- work/${f.rel}  (${kb(f.size)})`), 60).join("\n") : "- (none)"}

## Held back: content looks like a secret (${heldList.length})
${heldList.length ? `${cap(heldList.map((h) => `- ${h.path}  [${h.kind}]`), 80).join("\n")}\nName and kind only, never the match. Not scanned: files over 1 MiB, binary files, files that cannot be read.` : "- (none)"}

## Excluded from the zip (not work)
- .zip inside work/: ${workScan.zips.length ? workScan.zips.map((z) => `${z.rel} (${kb(z.size)})`).join(", ") : "none"}
- .zip inside outputs/: ${outScan.zips.length ? outScan.zips.map((z) => `${z.rel} (${kb(z.size)})`).join(", ") : "none"}
- node_modules, .next, .git, __MACOSX, .DS_Store, tsbuildinfo, npm caches, .venv, __pycache__, *.pyc, .env secrets, and credentials (.ssh, .aws, .npmrc, .netrc, .git-credentials, *.pem, id_rsa*).
- Scope: ${projectOnly ? "PROJECT ONLY (--project-only): the rest of work/ and outputs/ are NOT in this dump" : "the whole working directory"}.
- chicla.policy.json: ${policyState.applied ? `${policyState.dropped} file(s) deliberately NOT included; names not listed` : policyState.error ? `NOT APPLIED (${policyState.error}): what it lists may be in this dump` : "none"}.
- Home-directory noise at the top of work/: ${homeSkipped.size ? [...homeSkipped].sort().join(", ") : "none"}.

## Files in outputs/ included
${outScan.files.length ? cap(outScan.files.map((f) => `- outputs/${f.rel}  (${kb(f.size)})`), 40).join("\n") : "- (none)"}
${errors.length ? `\n## Errors while generating this report (the zip was created anyway)\n${errors.map((e) => `- ${e}`).join("\n")}\n` : ""}`;

  // --- The zip, written by chicla-zip. Order: files, then marker and report (they need the hashes and the errors). ---
  const includeOutputs = !noOutputs && !projectOnly && outScan.files.length > 0;
  const HOME_EX = skipHome ? HOME_NOISE.flatMap((n) => [`work/${n}`, `work/${n}/*`]) : []; // the external zip/tar path skips the same names
  const HELD_EX = heldList.map((h) => h.path.replace(/[*?[\]]/g, "?")); // a glob character in a held name stands for itself: «?» matches the literal one (may over-exclude, never leaks)
  const EX = ["*/node_modules/*", "*/.next/*", "*/.git/*", "*/__MACOSX/*", "*/.npm-global/*", "*/.cache/*", "*/.npm/*", "*/.venv/*", "*/__pycache__/*", "*.DS_Store", "*.tsbuildinfo", "*.zip", "*.pyc", "*/.env", "*/.env.*", ...SECRET_EX, ...POLICY_EX, ...HELD_EX];
  let finalName = zipName;
  const viaWriter = async () => {
    const { writeZipStream } = await import(new URL("../../chicla-zip/src/zipkit.mjs", import.meta.url).href);
    const fileSource = (base, root, f) => ({
      name: `${base}/${f.rel}`, mtime: new Date(f.mtime), mode: f.mode,
      stream: async function* () { // a file that fails mid-read ends here, is recorded, and the dump goes on
        const h = base === "work" && wantsHash(f) ? createHash("sha256") : null;
        try { for await (const c of createReadStream(join(root, f.rel))) { h?.update(c); yield c; } if (h) hashes[projRel(f.rel)] = h.digest("hex"); }
        catch (e) { errors.push(`read ${f.rel}: ${e.code ? `${e.code}: ` : ""}${e.message} (cut short in the zip)`); }
      },
    });
    const sources = [...Object.entries(toolData).map(([name, data]) => ({ name, data })), ...workScan.files.map((f) => fileSource("work", WORK, f)), ...(includeOutputs ? outScan.files.map((f) => fileSource("outputs", OUTDIR, f)) : []),
      { name: "RECOVERY_MARKER.json", stream: async function* () { yield Buffer.from(JSON.stringify(buildMarker(), null, 1)); } },
      { name: "RECOVERY_REPORT.md", stream: async function* () { yield Buffer.from(buildReport()); } }];
    const part = join(OUTDIR, zipName + ".partial");
    try { await writeZipStream(createWriteStream(part, { flags: "wx" }), sources); renameSync(part, join(OUTDIR, zipName)); }
    catch (e) { rmSync(part, { force: true }); throw e; }
  };
  try { await viaWriter(); }
  catch (e) {
    // D7: the dump never fails because of Chicla. Reset what the failed run filled in and use the old external path.
    errors.push(`chicla-zip writer failed (${e.code ?? "error"}: ${e.message}); used zip/tar`);
    for (const k of Object.keys(hashes)) delete hashes[k];
    hashedBytes = 0; unhashed = 0; hashAllSync();
    const stage = mkdtempSync(join(tmpdir(), "chicla-emergency-"));
    writeFileSync(join(stage, "RECOVERY_MARKER.json"), JSON.stringify(buildMarker(), null, 1));
    writeFileSync(join(stage, "RECOVERY_REPORT.md"), buildReport());
    if (projectOnly && project.dir) { // only the project folder, at the same place inside work/ (the marker's projectRootRel must still be right)
      const parts = project.dir.split("/");
      mkdirSync(join(stage, "work", ...parts.slice(0, -1)), { recursive: true });
      symlinkSync(join(WORK, project.dir), join(stage, "work", ...parts));
    } else symlinkSync(WORK, join(stage, "work"));
    mkdirSync(join(stage, "RECOVER")); for (const [name, data] of Object.entries(toolData)) writeFileSync(join(stage, name), data);
    if (includeOutputs) symlinkSync(OUTDIR, join(stage, "outputs"));
    const tmpZip = join(tmpdir(), zipName);
    rmSync(tmpZip, { force: true });
    const members = ["RECOVERY_MARKER.json", "RECOVERY_REPORT.md", "RECOVER", "work", ...(includeOutputs ? ["outputs"] : [])];
    let r = spawnSync("zip", ["-qr", tmpZip, ...members, "-x", ...EX, ...HOME_EX], { cwd: stage, stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" }); relay(r);
    if (r.status !== 0 && r.status !== 18) { // 18 = some unreadable files; the zip exists anyway
      finalName = zipName.replace(/\.zip$/, ".tar.gz"); // fallback: tar.gz (follows symlinks), in case `zip` does not exist
      const tmpTar = join(tmpdir(), finalName);
      r = spawnSync("tar", ["-czhf", tmpTar, ...EX.filter((x) => !x.startsWith("*.")).map((x) => `--exclude=${x.replace(/^\*\//, "").replace(/\/\*$/, "")}`), "--exclude=*.zip", "--exclude=*.pyc", `--exclude=*.${ci("pem")}`, "--exclude=*.tsbuildinfo", "--exclude=.DS_Store", "--exclude=.env", "--exclude=.env.*", ...(skipHome ? HOME_NOISE.map((n) => `--exclude=work/${n}`) : []), "-C", stage, ...members], { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" }); relay(r);
      if (r.status !== 0) { rmSync(stage, { recursive: true, force: true }); return fail("EDUMP_FAILED", "✗ neither the chicla-zip writer, zip nor tar worked — dump NOT created."); }
      copyFileSync(tmpTar, join(OUTDIR, finalName)); rmSync(tmpTar, { force: true });
    } else {
      // puts back what -x caught by sweeping but must stay: .env.example/.sample
      const keep = workScan.files.filter((f) => isKeptEnv(f.rel.split("/").pop())).map((f) => `work/${f.rel}`);
      if (keep.length) relay(spawnSync("zip", ["-q", tmpZip, ...keep], { cwd: stage, stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" }));
      copyFileSync(tmpZip, join(OUTDIR, finalName)); rmSync(tmpZip, { force: true });
    }
    rmSync(stage, { recursive: true, force: true });
  }

  const finalPath = join(OUTDIR, finalName);
  say("out", `\n✓ EMERGENCY DUMP CREATED (no guards — not a delivery)\n  ${finalPath}  (${kb(statSync(finalPath).size)})`);
  say("out", `  project: ${projectFiles.length} files, ${touched.length} dated after the manifest (indicative only: a cp/unzip wipes the dates; recovery-report compares the content), ${newVsManifest.length} new, ${lostVsManifest.length} missing vs manifest.`);
  if (collisions.length) say("out", `  ⚠ ${collisions.length} group(s) of names that differ only in NFC/NFD:\n${collisions.map((g) => `    ${g.join("  ≈  ")}`).join("\n")}`);
  if (unhashed) say("out", `  hash limit reached: ${unhashed} project file(s) not hashed (see the marker).`);
  if (projectOnly) say("out", `  scope: PROJECT ONLY (${project.dir || "."}); the rest of work/ and outputs/ are not in the dump.`);
  if (heldList.length) say("out", `  ⚠ ${heldList.length} file(s) held back, content looks like a secret (name and kind only, never the match):\n${cap(heldList.map((h) => `    ${h.path}  [${h.kind}]`), 10).join("\n")}`);
  if (policyState.error) say("out", `  ⚠ chicla.policy.json NOT applied (${policyState.error}): what it lists may be in this dump.`);
  if (errors.length) say("out", `  warnings in the report: ${errors.length} (see RECOVERY_REPORT.md inside the zip)`);
  say("out", `\nNOW: present_files with the path above. Nothing else.`);
  return { ok: true, code: null, path: finalPath, name: finalName, bytes: statSync(finalPath).size, project: project ? project.dir : null, projectFiles: projectFiles.length, touched: touched.length, newVsManifest: newVsManifest.length, lostVsManifest: lostVsManifest.length, collisions, unhashed, projectOnly, held: heldList, policyError: policyState.error, warnings: errors.length };
}

// Runs only as the entry point (`node scripts/emergency-dump.mjs`), never when the kit CLI or a test imports it.
