#!/usr/bin/env node
// `chicla`, the CLI of the kit (C11.1). Slices 1 to 4b: the dispatcher and SIX subcommands, `check-manifest`, `bump-round`, `verify-delivery`, `make-delivery`, `dump` and `recovery`; each runs the same
// code as its script in scripts/ (the script imports nothing from here; this file imports the script's core). Zero dependencies (D3).
//
//   chicla init [--agent <name>]... [--json] [--root <dir>]   (C12.1, C12.6, C12.7: starts a project: CLAUDE.md, AGENTS.md, the status file, CHANGELOG.md, version.mjs, FILES.manifest; never overwrites)
//   chicla update [--agent <name>]... [--apply <file>]... [--json] [--root <dir>]   (C11.3: compares the instruction files with the kit's templates and shows the diff; writes only the files named with --apply)
//   chicla check-manifest [--write] [--json] [--root <dir>]
//   chicla bump-round [--verify | [--refresh] [--dry-run] [--note <text>]] [--json] [--root <dir>]
//        no flag = the bump (N -> N+1, WRITES); --verify only checks; --refresh keeps the number; --dry-run shows and writes nothing;
//        --verify cannot be combined with the others (EUSAGE). The manifest step runs in-process (`checkManifest`), so `--root` may be a project without scripts/.
//   chicla verify-delivery <zip> [--against <zip>]... [--allow-removed <path>]... [--json] [--root <dir>]
//        --root is the project whose chicla.policy.json applies; relative zip paths are read from the current folder.
//   chicla make-delivery <out.zip> [--against <zip>]... [--allow-removed <path>]... [--json] [--root <dir>]
//        runs every step in-process (manifest check, build check, manifest write, zip, verify): the project in --root needs no scripts/ folder.
//   chicla dump [note...] [--note <text>] [--project-only] [--outdir <dir>] [--json] [--root <dir>]
//        --root is the WORKING DIRECTORY that is dumped (default: the current folder), no guards, never touches a project file; --outdir is where the zip goes
//        (default: /mnt/user-data/outputs if it exists, else <root>/outputs). Exit 0 when a dump was created (warnings never change that), 1 when none was
//        (EDUMP_NO_PROJECT: --project-only and no project root; EDUMP_FAILED), 2 for a usage error.
//   chicla recovery <dump.zip> [--baseline <zip>] [--out <dir>] [--toolchain-digest <hex>] [--trust-toolchain] [--json]
//        extracts an emergency dump (default <out>: /home/claude/recovered, then -2, -3 ...), checks it, compares it with --baseline (a delivery zip), the baseline inside the dump
//        or FILES.manifest, and writes <out>/RECOVERY_DIFF.md. It has no --root: relative paths come from the current folder. Exit 3 = EHASH_TOOLCHAIN, which the core only raises
//        when it runs from a dump's RECOVER/ folder (the kit's own copy is never checked); `--toolchain-digest` and `--trust-toolchain` are for that case.
//   chicla --help
//
// --json   ONE object on stdout ({ ok, command, code, ... }); the human text still goes to stderr.
// --root   the project folder (default: the current folder).
// Exit codes: 0 ok · 1 the check failed (for `dump`: no dump was made) · 2 usage error (EUSAGE, ECOMMAND_UNKNOWN) · 3 EHASH_TOOLCHAIN (`recovery`).
// Every planned subcommand is built. The human output is styled (marks only) on an interactive terminal by ui.mjs (C11.5 slice b, D93).
//
// NOTE (round 112, updated in round 135): every core lives in src/ (the four pinned ones in src/pinned/) and this CLI imports them from there, so the kit no longer needs scripts/ (C11.1 slices 5 to 7, D84, D91, D92);
// only `bump-round` still spawns scripts/check-manifest.mjs, when its caller gives no in-process manifest step. The kit still needs the sibling package chicla-zip (the zip writer), so it cannot be published alone yet.
// Nothing is published before 0.1 (CLAUDE.md product rule 4).
import { fileURLToPath, pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { shouldStyle, styleSummary } from "./ui.mjs";

const SRC = new URL("./", import.meta.url); // C11.1 slice 7 (D92): every core is imported from the kit itself, never through scripts/
const CORES = { "check-manifest": "check-manifest.mjs", "bump-round": "bump-round.mjs", "verify-delivery": "verify-delivery.mjs", "make-delivery": "make-delivery.mjs", dump: "emergency-dump.mjs", recovery: "pinned/recovery-report.mjs", init: "init.mjs", update: "update.mjs" };
const HELP = `chicla: the kit CLI

Usage: chicla <command> [options]

Commands:
  check-manifest   check FILES.manifest against the disk (--write regenerates it)
  make-delivery    build the delivery .zip of a project (checks, manifest, baseline, zip, verify; --against, --allow-removed)
  verify-delivery  check a delivery .zip: the whole tree, the manifest, no junk or secrets (--against, --allow-removed)
  dump             emergency zip of the whole working directory, no guards (note words, --note, --project-only, --outdir <dir>)
  recovery         recover an emergency dump: extract, verify, compare, write RECOVERY_DIFF.md (<dump.zip>, --baseline <zip>, --out <dir>)
  update           compare the instruction files of a project with this kit's templates and show the diff; writes nothing unless --apply <file> names a file (--agent <name>, --apply <file>)
  init             start a project: CLAUDE.md, AGENTS.md, the status file, CHANGELOG.md, version.mjs and FILES.manifest, consistent; refuses if any exists, never overwrites
  bump-round       close a round: bump N -> N+1 (default), --refresh (keep N), --dry-run (write nothing), --verify (only check), --note <text>

Options:
  --json           one JSON object on stdout; the human text goes to stderr
  --root <dir>     the project folder (default: the current folder); for dump, the working directory that is dumped
  --project-only, --outdir <dir>   (dump) take only the project root; where the zip goes
  --out <dir>, --baseline <zip>, --toolchain-digest <hex>, --trust-toolchain   (recovery) where to extract; the last delivery zip; the pinned digest and the override for a RECOVER/ copy
  --verify         (bump-round) only check, write nothing; not combinable with --refresh, --dry-run, --note
  --refresh, --dry-run, --note <text>   (bump-round) see above; --note also gives the note of a dump
  --agent <name>   (init, update) also write (update: also compare) the instruction file of an agent of the matrix: gemini (GEMINI.md), copilot (.github/copilot-instructions.md); claude and codex are in the default set; repeatable
  --apply <file>   (update) replace that instruction file with the template (the confirmation; a missing one is created); repeatable; state files cannot be named
  --against <zip>, --allow-removed <path>   (verify-delivery, make-delivery) a previous zip that must lose nothing (repeatable); a removal that is approved
  --help           this text

Exit codes: 0 ok, 1 check failed (dump: no dump was made; recovery: nothing recovered), 2 usage error, 3 EHASH_TOOLCHAIN (recovery).
`;

/** Runs the CLI. `io` = { stdout, stderr, cwd } (each stream has `write`); returns the exit status and never throws. */
export async function main(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout, stderr = io.stderr ?? process.stderr, cwd = io.cwd ?? process.cwd();
  const args = [...argv];
  const json = args.includes("--json");
  const fail = (command, code, message) => {
    if (json) stdout.write(`${JSON.stringify({ ok: false, command, code })}\n`);
    stderr.write(`✗ ${code}: ${message}\n`);
    return 2;
  };

  if (args.includes("--help") || args.includes("-h")) { stdout.write(HELP); return 0; }
  // C11.5 slice c (D93): no arguments at all on an interactive terminal (stdout AND stdin are TTYs, same `shouldStyle` rules) opens the read-only panel; anything else keeps the usage error below
  if (args.length === 0 && shouldStyle({ isTTY: stdout.isTTY === true && (io.stdin ?? process.stdin).isTTY === true, env: io.env ?? process.env })) {
    let mod; try { mod = await import(new URL("panel.mjs", SRC).href); } catch { mod = null; }
    if (mod) return mod.runPanel({ stdin: io.stdin ?? process.stdin, stdout, root: cwd, env: io.env ?? process.env });
  }
  const command = args.find((a) => !a.startsWith("--"));
  if (command === undefined) { stderr.write(HELP); return fail(null, "EUSAGE", "no command given"); }
  if (!(command in CORES)) return fail(command, "ECOMMAND_UNKNOWN", `unknown command «${command.slice(0, 40)}»`);

  // the options: --json and the command word are common; each command knows its own
  const opts = { root: cwd, write: false, verify: false, refresh: false, dry: false, note: "", zip: undefined, against: [], allowRemoved: [], projectOnly: false, outdir: undefined, words: [], out: undefined, baseline: undefined, digest: undefined, trust: false };
  const at = args.indexOf(command), takesZip = command === "verify-delivery" || command === "make-delivery" || command === "recovery";
  opts.agents = []; opts.apply = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (i === at || a === "--json") continue;
    if (a === "--root" && command === "recovery") return fail(command, "EUSAGE", "recovery has no --root (use --out for where to extract)");
    if (a === "--root") { const v = args[++i]; if (v === undefined || v.startsWith("--")) return fail(command, "EUSAGE", "--root needs a folder"); opts.root = resolve(cwd, v); continue; }
    if (takesZip && (a === "--against" || a === "--allow-removed")) { const v = args[++i]; if (v === undefined || v.startsWith("--")) return fail(command, "EUSAGE", `${a} needs a value`); (a === "--against" ? opts.against : opts.allowRemoved).push(v); continue; }
    if (takesZip && !a.startsWith("--")) { if (opts.zip !== undefined) return fail(command, "EUSAGE", "only one zip may be given"); opts.zip = a; continue; }
    if (command === "recovery" && (a === "--out" || a === "--baseline" || a === "--toolchain-digest")) { const v = args[++i]; if (v === undefined || v.startsWith("--")) return fail(command, "EUSAGE", `${a} needs a value`); if (a === "--out") opts.out = resolve(cwd, v); else if (a === "--baseline") opts.baseline = resolve(cwd, v); else opts.digest = v; continue; }
    if (command === "recovery" && a === "--trust-toolchain") { opts.trust = true; continue; }
    if (command === "dump" && a === "--project-only") { opts.projectOnly = true; continue; }
    if (command === "dump" && a === "--outdir") { const v = args[++i]; if (v === undefined || v.startsWith("--")) return fail(command, "EUSAGE", "--outdir needs a folder"); opts.outdir = resolve(cwd, v); continue; }
    if (command === "dump" && !a.startsWith("--")) { opts.words.push(a); continue; }
    if ((command === "init" || command === "update") && a === "--agent") { const v = args[++i]; if (v === undefined || v.startsWith("--")) return fail(command, "EUSAGE", "--agent needs a name"); opts.agents.push(v); continue; }
    if (command === "update" && a === "--apply") { const v = args[++i]; if (v === undefined || v.startsWith("--")) return fail(command, "EUSAGE", "--apply needs a file name"); opts.apply.push(v); continue; }
    if (command === "check-manifest" && a === "--write") { opts.write = true; continue; }
    if (command === "bump-round" && a === "--verify") { opts.verify = true; continue; }
    if (command === "bump-round" && a === "--refresh") { opts.refresh = true; continue; }
    if (command === "bump-round" && a === "--dry-run") { opts.dry = true; continue; }
    if ((command === "bump-round" || command === "dump") && a === "--note") { const v = args[++i]; if (v === undefined || v.startsWith("--")) return fail(command, "EUSAGE", "--note needs a text"); opts.note = v; continue; }
    return fail(command, "EUSAGE", `unknown option or argument «${a.slice(0, 40)}»`);
  }
  if (command === "bump-round" && opts.verify && (opts.refresh || opts.dry || opts.note)) return fail(command, "EUSAGE", "--verify only checks; it cannot be combined with --refresh, --dry-run or --note");

  if (takesZip && opts.zip === undefined) return fail(command, "EUSAGE", command === "make-delivery" ? "no output zip given" : command === "recovery" ? "no dump zip given" : "no zip given");

  const file = CORES[command];
  let mod;
  try { mod = await import(new URL(file, SRC).href); }
  catch (e) { if (json) stdout.write(`${JSON.stringify({ ok: false, command, code: "ECOMMAND_LOAD" })}\n`); stderr.write(`✗ ECOMMAND_LOAD: cannot load ${file} (${e.code ?? e.message})\n`); return 1; }
  let r;
  if (command === "check-manifest") r = mod.checkManifest({ root: opts.root, write: opts.write });
  else if (command === "init") r = mod.initProject({ root: opts.root, agents: opts.agents });
  else if (command === "update") r = mod.updateProject({ root: opts.root, agents: opts.agents, apply: opts.apply });
  else if (command === "recovery") r = await mod.recoveryReport({ dump: resolve(cwd, opts.zip), baseline: opts.baseline, out: opts.out, toolchainDigest: opts.digest, trustToolchain: opts.trust });
  else if (command === "dump") r = await mod.emergencyDump({ work: opts.root, outdir: opts.outdir, note: opts.note || opts.words.join(" "), projectOnly: opts.projectOnly });
  else if (command === "make-delivery") r = await mod.makeDelivery({ out: resolve(cwd, opts.zip), against: opts.against.map((a) => resolve(cwd, a)), allowRemoved: opts.allowRemoved, root: opts.root });
  else if (command === "verify-delivery") r = mod.verifyDelivery({ zip: resolve(cwd, opts.zip), against: opts.against.map((a) => resolve(cwd, a)), allowRemoved: opts.allowRemoved, root: opts.root });
  else {
    // the manifest step of a bump runs in-process, with the same core `check-manifest` uses (no scripts/ needed in the project or in the kit)
    let cm; try { cm = await import(new URL("check-manifest.mjs", SRC).href); } catch (e) { if (json) stdout.write(`${JSON.stringify({ ok: false, command, code: "ECOMMAND_LOAD" })}\n`); stderr.write(`✗ ECOMMAND_LOAD: cannot load check-manifest.mjs (${e.code ?? e.message})\n`); return 1; }
    const regenerateManifest = (root) => { const m = cm.checkManifest({ root, write: true }); return { ok: m.ok, ...cm.renderCheckManifest(m) }; };
    r = mod.bumpRound({ root: opts.root, mode: opts.verify ? "verify" : opts.refresh ? "refresh" : "bump", dry: opts.dry, note: opts.note, regenerateManifest });
  }
  const { out, err } = command === "check-manifest" ? mod.renderCheckManifest(r) : command === "verify-delivery" ? mod.renderVerifyDelivery(r) : command === "make-delivery" ? mod.renderMakeDelivery(r) : command === "dump" ? mod.renderEmergencyDump(r) : command === "recovery" ? mod.renderRecoveryReport(r) : command === "init" ? mod.renderInit(r) : command === "update" ? mod.renderUpdate(r) : mod.renderBumpRound(r);
  if (json) {
    const { messages, ...data } = r;
    stdout.write(`${JSON.stringify({ command, ...data })}\n`);
    stderr.write(out + err); // the human text, on stderr
  } else {
    // C11.5 slice b (D93): the marks of the summary lines are painted only on an interactive terminal; each stream is judged on its own, the environment is io.env (tests) or process.env
    const env = io.env ?? process.env;
    stdout.write(styleSummary(out, shouldStyle({ isTTY: stdout.isTTY === true, env })));
    stderr.write(styleSummary(err, shouldStyle({ isTTY: stderr.isTTY === true, env })));
  }
  return r.ok ? 0 : r.code === "EHASH_TOOLCHAIN" ? 3 : r.code === "EAGENT" ? 2 : 1;
}

const isEntry = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isEntry) process.exitCode = await main(process.argv.slice(2));
