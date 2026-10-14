#!/usr/bin/env node
// Build guard: a delivery does not go out if any .mjs file stopped passing `node --check`.
//
//   node scripts/check-build.mjs   -> prints the result; exit 1 and the failing files named, else 0
//
// C11.1 slice 5a (D84): the work lives in packages/chicla-kit/src/check-build.mjs (`checkBuild({ root })`, which never prints, exits or throws). This file is
// only the wrapper: it re-exports the core (so make-delivery-zip.mjs and the tests import it from here as before) and, when run directly, prints and exits.
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { checkBuild, renderCheckBuild } from "../packages/chicla-kit/src/check-build.mjs";
export { checkBuild, renderCheckBuild };

// Runs only as the entry point, never when make-delivery, the kit CLI or a test imports it. The root is the project this file sits in.
const isEntry = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isEntry) {
  const r = checkBuild({ root: fileURLToPath(new URL("..", import.meta.url)) });
  const { out, err } = renderCheckBuild(r);
  process.stdout.write(out); process.stderr.write(err);
  process.exitCode = r.ok ? 0 : 1;
}
