#!/usr/bin/env node
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
//
// C11.1 slice 5f (D84, D89): the work lives in packages/chicla-kit/src/emergency-dump.mjs (`emergencyDump`, which never prints, exits or throws). This file is only the wrapper:
// it re-exports the core (so the CLI and the tests import it from here as before) and, when run directly, parses the flags, prints and exits.
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { emergencyDump, renderEmergencyDump } from "../packages/chicla-kit/src/emergency-dump.mjs";
export { emergencyDump, renderEmergencyDump };

// Runs only as the entry point (`node scripts/emergency-dump.mjs`), never when the kit CLI or a test imports it.
const isEntry = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isEntry) {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const note = argv.filter((a, i) => !a.startsWith("--") && !["--work", "--outdir", "--hash-limit"].includes(argv[i - 1])).join(" ");
  const r = await emergencyDump({ work: opt("--work"), outdir: opt("--outdir"), note, projectOnly: argv.includes("--project-only"), noOutputs: argv.includes("--no-outputs"), hashLimit: opt("--hash-limit") });
  const { out, err } = renderEmergencyDump(r);
  process.stdout.write(out); process.stderr.write(err);
  process.exitCode = r.ok ? 0 : 1;
}
