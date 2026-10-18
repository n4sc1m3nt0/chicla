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
// It never prints, exits or throws, imports only `node:` modules and does not know where it sits: the project is always the `root` it is given. The script
// `scripts/bump-round.mjs` is a thin wrapper (flags, print, exit) and `chicla bump-round` imports the same code, so both run one implementation.
// WHEN TO RUN: at step 5 of the "closing kit", AFTER the CHANGELOG entry, "Last updated" and any app edit are final (the hashes are of the final content)
// and BEFORE make-delivery-zip.mjs. The hashes are computed over BYTES: app = tail -n +4 | sha256sum; CHANGELOG = tail -n +2 | sha256sum (12 hex).
// The manifest step of a bump runs `regenerateManifest(root)` -> { ok, out, err }; the default spawns `<root>/scripts/check-manifest.mjs --write` (which works through the wrapper).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
// C9.4a: the recovery toolchain pinned in CLAUDE.md (`toolchain-digest: <hex>`); same definition as recovery-report.mjs and the shell: sha256 of `sha256sum RECOVER/*.mjs`.
const TOOLCHAIN = { "baseline.mjs": "packages/chicla-kit/src/pinned/baseline.mjs", "manifest.mjs": "packages/chicla-kit/src/pinned/manifest.mjs", "policy.mjs": "packages/chicla-kit/src/pinned/policy.mjs", "recovery-report.mjs": "packages/chicla-kit/src/pinned/recovery-report.mjs", "zipkit.mjs": "packages/chicla-zip/src/zipkit.mjs" };
const PIN_RE = /toolchain-digest: ([0-9a-f]{64})/;

// --- Chicla configuration -------------------------------------------------------------------------------
// APP_FILE is the "app leg" of the fingerprint: a small, stable file that changes every round (the version).
// It must carry the STATUS_FILE_FINGERPRINT comment on LINE 3; the hash covers everything from line 4 on.
// `//` comment for .mjs/.js/.ts, `<!-- -->` for .html/.md.
const APP_FILE = "version.mjs";
// ---------------------------------------------------------------------------------------------------------

// tail -n +n, in bytes (n=1 is the whole file)
const tailFrom = (buf, n) => { let p = 0; for (let i = 1; i < n; i++) { const j = buf.indexOf(10, p); if (j < 0) return Buffer.alloc(0); p = j + 1; } return buf.subarray(p); };
const h12 = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 12);
const lineOf = (buf, n) => tailFrom(buf, n).toString("utf8").split("\n", 1)[0];
const replaceLine = (buf, n, text) => Buffer.concat([buf.subarray(0, buf.length - tailFrom(buf, n).length), Buffer.from(text + "\n"), tailFrom(buf, n + 1)]);

const FP = /seq=(\d+) file=(\S+) app_sha256_12=([0-9a-f]{12}) changelog_sha256_12=([0-9a-f]{12})/;
const PARA = /\*\*Fingerprint:\*\* seq=(\d+) · app=(\S+) ·\s*app_sha256_12=([0-9a-f]{12})[\s\S]*?changelog_sha256_12=([0-9a-f]{12})[\s\S]*?before doing anything else\./g;

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
  const st = names.filter((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f));
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

const toolchainDigest = (P) => createHash("sha256").update(Object.keys(TOOLCHAIN).sort().map((n) => `${createHash("sha256").update(readFileSync(P(TOOLCHAIN[n]))).digest("hex")}  RECOVER/${n}\n`).join("")).digest("hex");
const pinned = (P) => (existsSync(P("CLAUDE.md")) ? (readFileSync(P("CLAUDE.md"), "utf8").match(PIN_RE) ?? [])[1] : undefined);
const pinCheck = (P) => { if (!pinned(P) || !Object.values(TOOLCHAIN).every((f) => existsSync(P(f)))) return []; const d = toolchainDigest(P); return [[`toolchain digest ${d.slice(0, 12)} = the pin in CLAUDE.md (${pinned(P).slice(0, 12)})`, d === pinned(P)]]; };
function verify(s, P) { // instruction 11 a-c (and the toolchain pin)
  const eq = (a, b) => a === b;
  return [...pinCheck(P),
    [`app: seq=${s.appFp[1]} = status file -${s.seq}`, eq(+s.appFp[1], s.seq)],
    [`CHANGELOG: seq=${s.clFp[1]} = -${s.seq}`, eq(+s.clFp[1], s.seq)],
    [`status file: seq=${s.stFp[1]} = -${s.seq}`, eq(+s.stFp[1], s.seq)],
    [`file= points to ${s.statusName} (app and CHANGELOG)`, eq(s.appFp[2], s.statusName) && eq(s.clFp[2], s.statusName)],
    [`app=${s.appName} in the status file paragraph`, eq(s.stFp[2], s.appName)],
    [`app hash ${s.hApp} = app, CHANGELOG and status file`, [s.appFp[3], s.clFp[3], s.stFp[3]].every((h) => h === s.hApp)],
    [`CHANGELOG hash ${s.hCl} = app, CHANGELOG and status file`, [s.appFp[4], s.clFp[4], s.stFp[4]].every((h) => h === s.hCl)],
  ];
}

/**
 * The mechanical close of a round for the project at `root`. `mode`: "bump" (default), "refresh" or "verify"; `dry` shows without writing; `note` is added to
 * the fingerprint comments; `regenerateManifest(root)` -> { ok, out, err } is the manifest step of a bump (default: runs `<root>/scripts/check-manifest.mjs --write`
 * as a process; the kit CLI passes `checkManifest` in-process, so it works on a project without `scripts/`). Returns { ok, code, mode, dry, seq, statusFile, nextSeq, checks?, messages }: `code` is null when ok, else EBUMP_USAGE, EBUMP_STATE,
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
