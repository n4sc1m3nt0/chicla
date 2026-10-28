// Mechanical close of a round (status file, instructions 8, 11 and 13): the CORE of `bump-round` (C11.1 slice 5c, D84).
//
//   bumpRound({ root, mode, dry, note, regenerateManifest })   mode "bump" (N -> N+1: renames the status file, rewrites the 3 fingerprints
//                                                             APP_FILE line 3, CHANGELOG line 1 and the "Fingerprint:" paragraph of the status file with
//                                                             recomputed hashes, rewrites the toolchain pin in CLAUDE.md and regenerates FILES.manifest),
//                                                             "refresh" (recomputes the hashes WITHOUT changing the number: CHANGELOG edited after the bump;
//                                                             instruction 8 forbids skipping numbers) or "verify" (only checks, instruction 11 a-c and the pin);
//                                                             `dry` shows what would change and writes nothing; `note` is added to the fingerprint comments.
//   renderBumpRound(result) -> { out, err }                   the text the script prints.
//
// It never prints, exits or throws, imports only `node:` modules and its sibling `integrity.mjs` (C17.1: the LF rule and the status-file regex) and does not know where it sits: the project is always the `root` it is given. The script
// `scripts/bump-round.mjs` is a thin wrapper (flags, print, exit) and `chicla bump-round` imports the same code, so both run one implementation.
// WHEN TO RUN: at step 5 of the "closing kit", AFTER the CHANGELOG entry, "Last updated" and any app edit are final (the hashes are of the final content)
// and BEFORE make-delivery-zip.mjs. The hashes are computed over BYTES: app = tail -n +4 | sha256sum; CHANGELOG = tail -n +2 | sha256sum (12 hex).
// The manifest step of a bump runs `regenerateManifest(root)` -> { ok, out, err }; the default spawns `<root>/scripts/check-manifest.mjs --write` (which works through the wrapper).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { FP, LF_FILES, PARA, PIN_RE, STATUS_FILE_RE, TOOLCHAIN, checkIntegrity, lineOf, tailFrom, toolchainDigest as digestOf } from "./integrity.mjs";

// --- Chicla configuration -------------------------------------------------------------------------------
// APP_FILE is the "app leg" of the fingerprint: a small, stable file that changes every round (the version).
// It must carry the STATUS_FILE_FINGERPRINT comment on LINE 3; the hash covers everything from line 4 on.
// `//` comment for .mjs/.js/.ts, `<!-- -->` for .html/.md.
const APP_FILE = "version.mjs";
// ---------------------------------------------------------------------------------------------------------

// C17.2: `tailFrom`, `lineOf`, the fingerprint regexes (FP, PARA) and the TOOLCHAIN map live in integrity.mjs; this file only brings the reader (the disk) and `sha256`.
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const h12 = (buf) => sha256(buf).slice(0, 12);
const replaceLine = (buf, n, text) => Buffer.concat([buf.subarray(0, buf.length - tailFrom(buf, n).length), Buffer.from(text + "\n"), tailFrom(buf, n + 1)]);

// C20.1 (AUDIT-7 F-1): the arguments of `scripts/bump-round.mjs`, checked before anything is written. Pure: it returns, never prints or exits (the wrapper does). An option it does not know,
// a stray word, `--note` with no text (or followed by an option) and `--verify` with another mode are errors, not «bump for real»; `--help` / `-h` ask for the usage.
export const BUMP_USAGE = "usage: node scripts/bump-round.mjs [--verify | [--refresh] [--dry-run] [--note <text>]]   (no option: bump N to N+1; --help prints this)";
export function parseBumpArgs(args) {
  if (args.includes("--help") || args.includes("-h")) return { help: true };
  const KNOWN = new Set(["--verify", "--refresh", "--dry-run", "--note"]);
  let bad = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--note") { if (args[i + 1] === undefined || args[i + 1].startsWith("--")) bad = true; else i++; }
    else if (!KNOWN.has(args[i])) bad = true;
  }
  if (args.includes("--verify") && args.length > 1) bad = true;
  if (bad) return { error: true };
  const has = (f) => args.includes(f);
  return { mode: has("--verify") ? "verify" : has("--refresh") ? "refresh" : "bump", dry: has("--dry-run"), note: has("--note") ? args[args.indexOf("--note") + 1] : "" };
}

/** A refusal with a stable code; caught inside `bumpRound` and returned, never thrown to the caller. */
class Stop extends Error { constructor(code, message) { super(message); this.code = code; } }
const stop = (code, m) => { throw new Stop(code, m); };

// C10.5 (docs/state-file.md): the parts a status file must have before `bump` or `--refresh` writes anything; each counts only at the start of a line, outside a fenced block.
// Instructions and Current version only have to exist (the template and this project order them differently); from the Fingerprint paragraph on, the order is fixed
// because the cold-start command of the instructions cuts the file at those lines.
const PARTS = [["## Instructions", /^## Instructions\b/m], ["**Current version:**", /^\*\*Current version:\*\*/m], ["**Last updated (round N):**", /^\*\*Last updated \(round [^)\n]+\):\*\*/m], ["## Snapshot", /^## Snapshot[ \t]*$/m], ["## Next up", /^## Next up[ \t]*$/m], ["## Gates", /^## Gates[ \t]*$/m]];
function statusProblem(s) {
  const t = s.stTxt.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, (m) => m.replace(/[^\n]/g, " ")); // fenced blocks blanked, offsets kept
  const at = PARTS.map(([, re]) => t.search(re)), missing = PARTS.filter((_, i) => at[i] < 0).map(([name]) => name);
  if (missing.length) return `${s.statusName} is incomplete, it lacks: ${missing.join(", ")} (see docs/state-file.md). I wrote nothing.`;
  const chain = [s.stFp.index, at[2], at[3], at[4], at[5]];
  if (chain.some((x, i) => i && x < chain[i - 1])) return `${s.statusName}: the parts are out of order; they must come as Fingerprint, Last updated, Snapshot, Next up, Gates (see docs/state-file.md). I wrote nothing.`;
  return null;
}

function readState(ROOT, P) {
  const names = readdirSync(ROOT);
  const st = names.filter((f) => STATUS_FILE_RE.test(f));
  const apOk = existsSync(P(APP_FILE));
  if (st.length !== 1) stop("EBUMP_STATE", `there must be exactly 1 CHICLA_PROJECT_STATUS-N.md in the root (found ${st.length}).`);
  if (!apOk) stop("EBUMP_STATE", `${APP_FILE} is missing (the "app" leg of the fingerprint; see APP_FILE at the top of packages/chicla-kit/src/bump-round.mjs).`);
  if (!names.includes("CHANGELOG.md")) stop("EBUMP_STATE", "CHANGELOG.md is missing from the root.");
  const s = { statusName: st[0], seq: +st[0].match(/-(\d+)\.md$/)[1], appName: APP_FILE, app: readFileSync(P(APP_FILE)), cl: readFileSync(P("CHANGELOG.md")), stBuf: readFileSync(P(st[0])) };
  s.stTxt = s.stBuf.toString("utf8");
  if (!Buffer.from(s.stTxt, "utf8").equals(s.stBuf)) stop("EBUMP_STATE", `${s.statusName} is not valid UTF-8; not rewriting it, to avoid corrupting it.`);
  s.appFp = lineOf(s.app, 3).match(FP); s.clFp = lineOf(s.cl, 1).match(FP);
  const paras = [...s.stTxt.matchAll(PARA)];
  s.stFp = paras.length === 1 ? paras[0] : null;
  if (!s.appFp || !lineOf(s.app, 3).includes("STATUS_FILE_FINGERPRINT")) stop("EBUMP_STATE", `${s.appName}: line 3 is not a valid STATUS_FILE_FINGERPRINT.`);
  if (!s.clFp || !lineOf(s.cl, 1).includes("CHANGELOG_FINGERPRINT")) stop("EBUMP_STATE", "CHANGELOG.md: line 1 is not a valid CHANGELOG_FINGERPRINT.");
  if (!s.stFp) stop("EBUMP_STATE", `${s.statusName}: there must be exactly 1 paragraph "**Fingerprint:** … before doing anything else." (found ${paras.length}).`);
  s.hApp = h12(tailFrom(s.app, 4)); s.hCl = h12(tailFrom(s.cl, 2));
  return s;
}

// C19.2 (AUDIT-6 F-1): the archive limits of instruction 6, REPORTED at the close, never run (the same numbers as test/audit5-archive.test.mjs, which used to be the first to say it).
// One entry per limit that the status file or the CHANGELOG passes: { id, line }; `line` names the command. A file within the limits gives nothing.
const LIMITS = { previous: 5, done: 10, rounds: 21, bytes: 4096 };
function archiveLimits(s) {
  const out = [], over = (id, what, n, limit, cmd, file) => out.push({ id, line: `  ! ${n} ${what} in ${file} (limit ${limit}): run ${cmd}, then node scripts/bump-round.mjs --refresh` });
  const rows = s.stTxt.split("\n"), snapAt = rows.findIndex((l) => /^## Snapshot[ \t]*$/.test(l)), nextAt = rows.findIndex((l, i) => i > snapAt && /^## Next up[ \t]*$/.test(l));
  const previous = rows.filter((l) => l.startsWith("**Previous (round ")).length;
  const done = snapAt < 0 ? 0 : rows.slice(snapAt, nextAt < 0 ? rows.length : nextAt).filter((l) => l.startsWith("- Done:")).length;
  if (previous > LIMITS.previous) over("previous", "«Previous» blocks", previous, LIMITS.previous, "node scripts/archive-changelog.mjs --status", s.statusName);
  if (done > LIMITS.done) over("done", "«Done» lines", done, LIMITS.done, "node scripts/archive-changelog.mjs --snapshot", s.statusName);
  for (const [id, head] of [["current-version", "**Current version:**"], ["open-decisions", "**Open decisions:**"]]) {
    const row = rows.find((l) => l.startsWith(head)), bytes = row === undefined ? 0 : Buffer.byteLength(row);
    if (bytes > LIMITS.bytes) over(id, "bytes", bytes, LIMITS.bytes, "node scripts/archive-changelog.mjs --rolling", `the «${head.slice(2, -3)}» line of ${s.statusName}`);
  }
  const rounds = s.cl.toString("utf8").split("\n").filter((l) => /^## Round /.test(l)).length;
  if (rounds > LIMITS.rounds) over("changelog", "rounds", rounds, LIMITS.rounds, "node scripts/archive-changelog.mjs", "CHANGELOG.md");
  return out;
}

// A view of the disk for the shared rules (integrity.mjs): the names that exist among the ones the rules read, and a reader that never throws.
const diskView = (P) => {
  const names = [...new Set([...LF_FILES, ...Object.values(TOOLCHAIN), APP_FILE, ...readdirSync(P(".")).filter((f) => STATUS_FILE_RE.test(f))])].filter((f) => existsSync(P(f)));
  return { names, read: (f) => { try { return readFileSync(P(f)); } catch { return null; } } };
};
const toolchainDigest = (P) => digestOf(diskView(P), sha256) ?? stop("EBUMP_STATE", "a file the toolchain pin covers is missing or unreadable; I cannot rewrite the pin.");
const pinned = (P) => (existsSync(P("CLAUDE.md")) ? (readFileSync(P("CLAUDE.md"), "utf8").match(PIN_RE) ?? [])[1] : undefined);
// CLAUDE.md is in no hash (the pin reads one line of it), so CRLF in it would pass every other check; the status file, CHANGELOG and version.mjs are hashed, so CRLF there already fails.
// C17.1/C17.2: every rule is the shared one (integrity.mjs). The CLAUDE.md LF row is always printed, last (the table of docs/fingerprint.md); the other LF rows print only when they fail.
function verify(_s, P) { // instruction 11 a-c (and the toolchain pin, and the line endings)
  const rows = checkIntegrity(diskView(P), { sha256, appFile: APP_FILE }), lf = (r) => r.id === "lf";
  return [...rows.filter((r) => !lf(r) || (!r.ok && r.file !== "CLAUDE.md")), ...rows.filter((r) => lf(r) && r.file === "CLAUDE.md")].map((r) => [r.label, r.ok]);
}

/**
 * The mechanical close of a round for the project at `root`. `mode`: "bump" (default), "refresh" or "verify"; `dry` shows without writing; `note` is added to
 * the fingerprint comments; `regenerateManifest(root)` -> { ok, out, err } is the manifest step of a bump (default: runs `<root>/scripts/check-manifest.mjs --write`
 * as a process; the kit CLI passes `checkManifest` in-process, so it works on a project without `scripts/`). Returns { ok, code, mode, dry, seq, statusFile, nextSeq, checks?, limits? (C19.2: archive limits passed, reported only), messages }: `code` is null when ok, else EBUMP_USAGE, EBUMP_STATE,
 * EBUMP_UNPAIRED (11a), EBUMP_STATUS (C10.5, bump and refresh only), EBUMP_VERIFY, EBUMP_MANIFEST, EBUMP_FINAL or EBUMP_ERROR (anything unexpected); `messages` is [{ stream: "out" | "err", text }] in the order
 * the script prints them (see `renderBumpRound`). Never prints, exits or throws.
 */
export function bumpRound({ root, mode = "bump", dry = false, note = "", regenerateManifest } = {}) {
  const ROOT = resolve(root ?? ".");
  const P = (f) => join(ROOT, f);
  const messages = [];
  const say = (stream, text) => messages.push({ stream, text });
  const result = { ok: true, code: null, mode, dry, messages };
  const report = (checks) => { for (const [l, ok] of checks) say("out", `  ${ok ? "✓" : "✗"} ${l}`); return checks.every(([, ok]) => ok); };
  try {
    if (!["bump", "refresh", "verify"].includes(mode)) stop("EBUMP_USAGE", `unknown mode «${String(mode).slice(0, 40)}»`);
    const s = readState(ROOT, P);
    result.seq = s.seq; result.statusFile = s.statusName;
    if (mode === "verify") {
      say("out", `bump-round --verify (status file -${s.seq}):`);
      const checks = verify(s, P);
      result.checks = checks.map(([label, ok]) => ({ label, ok }));
      if (!report(checks)) { result.ok = false; result.code = "EBUMP_VERIFY"; }
      return result;
    }

    // bump / refresh: the links must be paired BEFORE (11a) — never pair blindly
    if (+s.appFp[1] !== s.seq || +s.clFp[1] !== s.seq || +s.stFp[1] !== s.seq)
      stop("EBUMP_UNPAIRED", `the app says seq=${s.appFp[1]}, the CHANGELOG seq=${s.clFp[1]}, the status file paragraph seq=${s.stFp[1]}, but the status file is -${s.seq} (instruction 11a). I wrote nothing; tell Rodrigo.`);

    const bad = statusProblem(s); // C10.5: an incomplete status file is refused before anything is written (dry-run too)
    if (bad) stop("EBUMP_STATUS", bad);

    const seq = mode === "bump" ? s.seq + 1 : s.seq;
    result.nextSeq = seq;
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

    say("out", `bump-round ${mode}${dry ? " --dry-run" : ""}: seq ${s.seq} → ${seq}`);
    say("out", `  status file        : ${s.statusName}${newName !== s.statusName ? ` → ${newName}` : " (name kept)"}`);
    say("out", `  app hash           : ${s.appFp[3]} → ${s.hApp} (${appChanged ? "CHANGED" : "unchanged"})`);
    say("out", `  CHANGELOG hash     : ${s.clFp[4]} → ${s.hCl}${s.clFp[4] === s.hCl ? " (unchanged)" : ""}`);
    say("out", `  rewritten          : ${s.appName} line 3 · CHANGELOG.md line 1 · "Fingerprint:" paragraph of the status file`);
    result.limits = archiveLimits(s); // C19.2: reported, never run, never part of `ok`
    for (const l of result.limits) say("out", l.line);
    if (dry) { say("out", "  (dry-run: nothing was written)"); return result; }

    writeFileSync(P(s.appName), newApp);
    writeFileSync(P("CHANGELOG.md"), newCl);
    writeFileSync(P(s.statusName), newSt);
    if (pinned(P)) writeFileSync(P("CLAUDE.md"), readFileSync(P("CLAUDE.md"), "utf8").replace(PIN_RE, () => `toolchain-digest: ${toolchainDigest(P)}`));
    if (newName !== s.statusName) renameSync(P(s.statusName), P(newName));
    const regen = regenerateManifest ?? ((r) => { const m = spawnSync(process.execPath, [join(r, "scripts/check-manifest.mjs"), "--write"], { cwd: r, encoding: "utf8" }); return { ok: m.status === 0, out: m.stdout, err: m.stderr }; });
    const man = regen(ROOT);
    if (!man.ok) stop("EBUMP_MANIFEST", `check-manifest --write failed:\n${man.out}${man.err}`);
    say("out", `  ${man.out.trim()}`);
    say("out", "final check (instruction 11 a-c, on what is on disk):");
    if (!report(verify(readState(ROOT, P), P))) stop("EBUMP_FINAL", "the fingerprints did not end up consistent — do NOT deliver; run --verify and investigate.");
    say("out", `✓ round closed mechanically: ${newName}. Still to do (by hand): CHANGELOG entry, "Last updated", Backlog, and then make-delivery-zip.mjs.`);
  } catch (e) {
    result.ok = false; result.code = e instanceof Stop ? e.code : "EBUMP_ERROR";
    say("err", `\n✗ ${e instanceof Stop ? e.message : `unexpected error: ${e.code ?? e.message}`}`);
  }
  return result;
}

/** The text the script prints for a result, per stream (one line per message, as console.log/console.error did). */
export function renderBumpRound(result) {
  const text = (stream) => result.messages.filter((m) => m.stream === stream).map((m) => `${m.text}\n`).join("");
  return { out: text("out"), err: text("err") };
}
