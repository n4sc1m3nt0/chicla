#!/usr/bin/env node
// Creates the delivery zip by the ONLY safe route. Fixed order, stops at the first failure:
//   1. check-manifest  (against the PREVIOUS manifest: catches lost files
//                       BEFORE the manifest is regenerated and "hides" them)
//   2. check-build     (node --check on every .mjs of the tree)
//   3. regenerates FILES.manifest
//   4. writes FILES.baseline.json (C9.6: path, size, sha256 of every manifest file, from the final tree), which
//                       travels in the zip and in every later dump: recovery needs no previous zip
//   5. zips (with chicla-zip, no external `zip`: C8.1) EXACTLY the files listed in FILES.manifest (+ the manifest itself): the exclusions
//                       (.env, Python artefacts…) live in one place, check-manifest
//   6. verify-delivery-zip on the final zip (+ --against for each upload given)
//
//   node scripts/make-delivery-zip.mjs <out.zip> [--against <upload.zip> ...] [--allow-removed <path> ...]
//
// C11.1 slice 5e (D84, D88): the work lives in packages/chicla-kit/src/make-delivery.mjs (`makeDelivery({ out, against, allowRemoved, root })`, async, which never prints,
// exits or throws). This file is only the wrapper: it re-exports the core (so the CLI and the tests import it from here as before) and, when run directly, parses the
// flags, prints and exits. `chicla make-delivery` runs the same code through the kit CLI.
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { makeDelivery, renderMakeDelivery } from "../packages/chicla-kit/src/make-delivery.mjs";
export { makeDelivery, renderMakeDelivery };

// Runs only as the entry point (`node scripts/make-delivery-zip.mjs`), never when the kit CLI or a test imports it.
const isEntry = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isEntry) {
  const [out, ...rest] = process.argv.slice(2);
  const against = rest.flatMap((a, i) => (rest[i - 1] === "--against" ? [resolve(a)] : []));
  const allowRemoved = rest.flatMap((a, i) => (rest[i - 1] === "--allow-removed" ? [a] : []));
  const r = await makeDelivery({ out, against, allowRemoved, root: fileURLToPath(new URL("..", import.meta.url)) });
  const { out: o, err } = renderMakeDelivery(r);
  process.stdout.write(o); process.stderr.write(err);
  process.exitCode = r.code === "EDELIVERY_USAGE" ? 2 : r.ok ? 0 : 1;
}
