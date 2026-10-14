#!/usr/bin/env node
// Guard against LOST FILES (an update replaced a folder with a partial one and modules vanished without anyone noticing).
//
//   node scripts/check-manifest.mjs           -> checks (fails if any file is missing)
//   node scripts/check-manifest.mjs --write   -> regenerates FILES.manifest (v2: path, crc32, size)
//   chicla check-manifest [--write] [--json] [--root <dir>]   -> the same code, through the kit CLI (C11.1)
//
// C11.1 slice 5b (D84): the work lives in packages/chicla-kit/src/check-manifest.mjs (`checkManifest({ root, write })`, which never prints, exits or throws).
// This file is only the wrapper: it re-exports the core (so make-delivery-zip.mjs, the CLI and the tests import it from here as before) and, when run directly, prints and exits.
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { checkManifest, renderCheckManifest } from "../packages/chicla-kit/src/check-manifest.mjs";
export { checkManifest, renderCheckManifest };

// Runs only as the entry point, never when the kit CLI or a test imports it. The root is the project this file sits in.
const isEntry = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isEntry) {
  const r = checkManifest({ root: fileURLToPath(new URL("..", import.meta.url)), write: process.argv.includes("--write") });
  const { out, err } = renderCheckManifest(r);
  process.stdout.write(out); process.stderr.write(err);
  process.exitCode = r.ok ? 0 : 1;
}
