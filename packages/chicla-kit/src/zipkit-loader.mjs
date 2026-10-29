// C13.5, C23.1: how the kit reaches chicla-zip. Order: (1) a zipkit.mjs BESIDE this file (the single package `chicla` ships it there, D148); (2) the package
// by name (a kit installed with its `dependencies`); (3) only when that package is not installed, the monorepo path (a bare checkout, no `npm install`).
// Any other error is passed on, from any step: a broken zip module must never be hidden by the next step. The pinned recovery-report does NOT use this file
// (it runs alone from a dump).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const SIBLING = new URL("./zipkit.mjs", import.meta.url);
const FALLBACK = new URL("../../chicla-zip/src/zipkit.mjs", import.meta.url).href;
const missingPackage = (e) => e?.code === "ERR_MODULE_NOT_FOUND" && String(e.message).includes("'chicla-zip'");

/**
 * @param {(specifier: string) => Promise<any>} [importer] injected by the tests
 * @param {() => boolean} [hasSibling] injected by the tests: is there a zipkit.mjs beside this file
 */
export async function loadZipkit(importer = (s) => import(s), hasSibling = () => existsSync(fileURLToPath(SIBLING))) {
  if (hasSibling()) return importer(SIBLING.href);
  try { return await importer("chicla-zip"); }
  catch (e) { if (!missingPackage(e)) throw e; }
  return importer(FALLBACK);
}
