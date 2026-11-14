#!/usr/bin/env node
// C30.1 (D160, D-A): the work lives in packages/chicla-kit/src/archive-changelog.mjs (one source, shipped in the npm package `chicla`; `chicla archive` runs it).
// This file only runs it on the project it sits in, with the same arguments (`node scripts/archive-changelog.mjs --help` says what they are).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const core = fileURLToPath(new URL("../packages/chicla-kit/src/archive-changelog.mjs", import.meta.url));
const r = spawnSync(process.execPath, [core, "--root", fileURLToPath(new URL("..", import.meta.url)), ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
