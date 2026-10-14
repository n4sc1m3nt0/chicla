#!/usr/bin/env node
// RECOVERY MODE — first step of the session that receives an emergency dump.
//
//   node scripts/recovery-report.mjs <chicla-EMERGENCY-….zip> [--baseline <last-delivery-zip.zip>] [--out <dir>] [--toolchain-digest <hex> [--trust-toolchain]]
//   chicla recovery <dump.zip> [--baseline <zip>] [--out <dir>] [--json]
//
// C11.1 slice 6b (D91): the work lives in packages/chicla-kit/src/pinned/recovery-report.mjs (`recoveryReport`, `renderRecoveryReport`; never prints, exits or throws), one of the five
// PINNED files that a dump carries in RECOVER/, where it still runs alone (the start line of status item 17 runs THAT copy, not this wrapper). This file only re-exports the core
// (so the CLI and the tests import it from here as before) and, when run directly, parses the flags, prints and exits (0 ok, 1 no recovery, 2 usage, 3 EHASH_TOOLCHAIN).
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { recoveryReport, renderRecoveryReport } from "../packages/chicla-kit/src/pinned/recovery-report.mjs";
export { recoveryReport, renderRecoveryReport };

// Runs only as the entry point (`node scripts/recovery-report.mjs`), never when the kit CLI or a test imports it.
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
