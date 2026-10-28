#!/usr/bin/env node
// Mechanical close of a round (status file, instructions 8, 11 and 13).
//
//   node scripts/bump-round.mjs               N -> N+1: renames the status file, rewrites the 3 fingerprints
//                                             (APP_FILE line 3, CHANGELOG line 1, "Fingerprint:" paragraph of the status file)
//                                             with recomputed hashes and regenerates FILES.manifest
//   node scripts/bump-round.mjs --dry-run     shows what would change, writes nothing
//   node scripts/bump-round.mjs --refresh     recomputes hashes WITHOUT changing the number (CHANGELOG edited after the bump;
//                                             instruction 8 forbids skipping numbers)
//   node scripts/bump-round.mjs --verify      only checks (instruction 11 a-c); exit 1 if anything does not match
//   --note "text"                             adds a note to the fingerprint comment of the app and of the CHANGELOG
//   chicla bump-round [...]                   the same code, through the kit CLI (C11.1)
//
// C11.1 slice 5c (D84): the work lives in packages/chicla-kit/src/bump-round.mjs (`bumpRound({ root, mode, dry, note })`, which never prints, exits or throws).
// This file is only the wrapper: it re-exports the core (so the CLI and the tests import it from here as before) and, when run directly, prints and exits.
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { bumpRound, renderBumpRound, parseBumpArgs, BUMP_USAGE } from "../packages/chicla-kit/src/bump-round.mjs";
export { bumpRound, renderBumpRound };

// Runs only as the entry point, never when the kit CLI or a test imports it. The root is the project this file sits in.
const isEntry = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isEntry) {
  const args = process.argv.slice(2);
  // C20.1 (AUDIT-7 F-1): the arguments are checked by the core (`parseBumpArgs`) before anything is written: an unknown one is an error, never «bump for real».
  const a = parseBumpArgs(args);
  if (a.help) { console.log(BUMP_USAGE); process.exit(0); }
  if (a.error) { console.error(BUMP_USAGE); process.exit(2); }
  const { mode, dry, note } = a;
  const r = bumpRound({ root: fileURLToPath(new URL("..", import.meta.url)), mode, dry, note });
  const { out, err } = renderBumpRound(r);
  process.stdout.write(out); process.stderr.write(err);
  process.exitCode = r.ok ? 0 : 1;
}
