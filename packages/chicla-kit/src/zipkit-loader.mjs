// C13.5: how the kit reaches chicla-zip. By package name first (an installed kit, `dependencies`); only when that package is not
// installed does it use the monorepo path (a bare checkout, no `npm install`). Any other error is passed on: a broken chicla-zip
// must never be hidden by the fallback. The pinned recovery-report does NOT use this file (it runs alone from a dump).
const FALLBACK = new URL("../../chicla-zip/src/zipkit.mjs", import.meta.url).href;
const missingPackage = (e) => e?.code === "ERR_MODULE_NOT_FOUND" && String(e.message).includes("'chicla-zip'");

/** @param {(specifier: string) => Promise<any>} [importer] injected by the tests */
export async function loadZipkit(importer = (s) => import(s)) {
  try { return await importer("chicla-zip"); }
  catch (e) { if (!missingPackage(e)) throw e; }
  return importer(FALLBACK);
}
