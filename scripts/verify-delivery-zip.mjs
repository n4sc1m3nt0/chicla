#!/usr/bin/env node
// Verifies the delivered ARTEFACT (the .zip), not the working tree.
// Guarantees the zip can be pasted over the project root, even with
// folder "Replace", without deleting anything: it contains the WHOLE tree.
//
//   node scripts/verify-delivery-zip.mjs <file.zip> [--against <previous-zip.zip> ...]
//
// Fails (exit 1) if:
//   1. the zip has a wrapper folder (package.json must be at the root of the zip);
//   2. any file listed in FILES.manifest (of the zip itself) is missing;
//   3. the zip's FILES.manifest does not match the real list of files;
//   3b. a v2 manifest (C7.1/C7.2): the crc32 and size of a listed file differ from the zip's CENTRAL DIRECTORY (read, not
//      decompressed): EMANIFEST_SIZE (checked first) / EMANIFEST_CRC32. FILES.baseline.json is exempt (it hashes the manifest, so the manifest cannot hold
//      its crc; its seal and 5c cover it). A v1 manifest has no crc32/size: only paths are compared;
//   4. it contains junk (node_modules, .next, .git, __MACOSX, .DS_Store, tsbuildinfo);
//   5. CLAUDE.md or CHICLA_PROJECT_STATUS-N.md is missing, or the N of the status
//      file does not match seq= in the fingerprint of CHANGELOG.md;
//   5b. the zip contains files that must NEVER leave the project: .env with secrets, Python artefacts (packages/chicla-kit/src/pinned/policy.mjs);
//   3c. (C8.2) every entry decodes (stored or deflate, read here, no `unzip`) and matches the central directory's size and crc32: EZIP_DATA; a non-ASCII
//      name without the UTF-8 flag (bit 11) is EUTF8_FLAG, in the delivery only (--against uploads are never held to it);
//   5c. FILES.baseline.json (C9.6) is present, parses, its seal holds, and it matches the zip's own files
//      (same list, size and sha256 of each); codes EBASELINE_MISSING / _PARSE / _FORMAT / _SEAL / _MISMATCH;
//   6. with --against: any file of the previous zip is not in this zip
//      (deliberate removals must be approved with --allow-removed <path>).
//
// C11.1 slice 5d (D84, D87): the work lives in packages/chicla-kit/src/verify-delivery.mjs (`verifyDelivery({ zip, against, allowRemoved, root })`, which never prints,
// exits or throws). This file is only the wrapper: it re-exports the core (so make-delivery-zip.mjs, the CLI and the tests import it from here as before) and, when run
// directly, parses the flags, prints and exits. `chicla verify-delivery` runs the same code through the kit CLI.
// `root` is the project whose chicla.policy.json (C6.1) adds to the never-leaves rules.
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { verifyDelivery, renderVerifyDelivery } from "../packages/chicla-kit/src/verify-delivery.mjs";
export { verifyDelivery, renderVerifyDelivery };

// Runs only as the entry point (`node scripts/verify-delivery-zip.mjs`), never when the kit CLI or a test imports it.
const isEntry = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isEntry) {
  const args = process.argv.slice(2);
  const zip = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--against" && args[args.indexOf(a) - 1] !== "--allow-removed");
  const against = args.flatMap((a, i) => (args[i - 1] === "--against" ? [a] : []));
  const allowRemoved = args.flatMap((a, i) => (args[i - 1] === "--allow-removed" ? [a] : []));
  const r = verifyDelivery({ zip, against, allowRemoved, root: fileURLToPath(new URL("..", import.meta.url)) });
  const { out, err } = renderVerifyDelivery(r);
  process.stdout.write(out); process.stderr.write(err);
  process.exitCode = r.code === "EVERIFY_USAGE" ? 2 : r.ok ? 0 : 1;
}
