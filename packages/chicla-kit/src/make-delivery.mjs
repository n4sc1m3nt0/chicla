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
// C11.1 slice 3b: the work is `makeDelivery({ out, against, allowRemoved, root })` (async), which never prints, exits or throws; the steps run IN-PROCESS
// (the cores of check-manifest, check-build and verify-delivery, no child processes), so the kit CLI (`chicla make-delivery`) runs the very same code
// on a project that has no scripts/ folder.
// C11.1 slice 5e (D84, D88): this is the CORE, in the kit package. It imports only `node:` modules, the two PINNED files (src/pinned/baseline.mjs and src/pinned/manifest.mjs, by
// relative path: they stay where they are until the last slice) and its three siblings here in src/ DIRECTLY (not through the script wrappers), and has no entry point.
// `scripts/make-delivery-zip.mjs` is a thin wrapper (flags, print, exit) and `chicla make-delivery` imports the same code.
// The zip writer is this kit's own (packages/chicla-zip, two folders up from this file), wherever `root` is.
import { existsSync, lstatSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASELINE_FILE, buildBaseline, serializeBaseline } from "./pinned/baseline.mjs";
import { parseManifest } from "./pinned/manifest.mjs";
import { checkManifest, renderCheckManifest } from "./check-manifest.mjs";
import { checkBuild, renderCheckBuild } from "./check-build.mjs";
import { verifyDelivery, renderVerifyDelivery } from "./verify-delivery.mjs";
import { loadZipkit } from "./zipkit-loader.mjs";

const USAGE = "usage: make-delivery-zip.mjs <out.zip> [--against <zip>] [--allow-removed <path>]";

/**
 * Makes the delivery zip `out` for the project at `root`; `against` = previous zips that must lose nothing (absolute paths), `allowRemoved` = approved removals.
 * Returns { ok, code, out, step, cause, files, problems, messages }: `code` is null when ok, else EDELIVERY_USAGE (no output path), EDELIVERY_STEP (`step` = the
 * script that failed: check-manifest.mjs, check-build.mjs or verify-delivery-zip.mjs; `cause` = its own code, e.g. EMANIFEST_LOST, EBUILD_FAILED, EVERIFY_FAILED;
 * a rejected zip is deleted), the code of an unreadable FILES.manifest (EMANIFEST*), EBASELINE_WRITE or EZIP_WRITE; `messages` is [{ stream: "out" | "err", text }] in
 * the order the script prints them (see `renderMakeDelivery`). Never prints, exits or throws.
 */
export async function makeDelivery({ out, against = [], allowRemoved = [], root } = {}) {
  const ROOT = resolve(root ?? ".");
  const messages = [];
  const say = (stream, text) => messages.push({ stream, text });
  const relay = ({ out: o, err: e }) => { for (const [stream, text] of [["out", o], ["err", e]]) if (text) for (const line of text.replace(/\n$/, "").split("\n")) say(stream, line); };
  const result = { ok: true, code: null, out, step: null, cause: null, files: 0, problems: [], messages };
  const stop = (code, text) => { say("err", text); result.ok = false; result.code = code; return result; };
  if (!out || out.startsWith("--")) { say("err", USAGE); result.ok = false; result.code = "EDELIVERY_USAGE"; return result; }
  const outPath = resolve(out);
  result.out = outPath;
  // A step that fails: if the zip already exists (step 5 failed, or the verifier rejected it), it is a REJECTED zip: it is deleted so nobody delivers it by mistake.
  const stepFailed = (script, r) => {
    const hadZip = existsSync(outPath);
    if (hadZip) rmSync(outPath);
    result.step = script; result.cause = r.code;
    return stop("EDELIVERY_STEP", `\n✗ ${script} failed — delivery aborted; ${hadZip ? "the rejected zip was deleted." : "no zip was created/updated."}`);
  };
  try {
    const m1 = checkManifest({ root: ROOT }); relay(renderCheckManifest(m1)); if (!m1.ok) return stepFailed("check-manifest.mjs", m1);
    const b = checkBuild({ root: ROOT }); relay(renderCheckBuild(b)); if (!b.ok) return stepFailed("check-build.mjs", b);
    // the manifest must list the baseline: a placeholder makes the first delivery pick it up; the real content comes after
    if (!existsSync(resolve(ROOT, BASELINE_FILE))) writeFileSync(resolve(ROOT, BASELINE_FILE), "{}\n");
    const m2 = checkManifest({ root: ROOT, write: true }); relay(renderCheckManifest(m2)); if (!m2.ok) return stepFailed("check-manifest.mjs", m2);
    if (existsSync(outPath)) rmSync(outPath);
    let names;
    try { names = parseManifest(readFileSync(resolve(ROOT, "FILES.manifest"), "utf8")).map((e) => e.path); } // v1 or v2 (C7.1)
    catch (e) { return stop(e.code ?? "EMANIFEST", `\n✗ ${e.code ?? "EMANIFEST"}: FILES.manifest cannot be read (${e.message}) — delivery aborted; no zip was created/updated.`); }
    if (!names.includes("FILES.manifest")) names.push("FILES.manifest");
    if (!names.includes(BASELINE_FILE)) names.push(BASELINE_FILE);
    // from the FINAL tree (manifest included); never lists itself. A failure here aborts the delivery like any other step.
    try { writeFileSync(resolve(ROOT, BASELINE_FILE), serializeBaseline(buildBaseline(ROOT, names))); }
    catch (e) { return stop("EBASELINE_WRITE", `\n✗ could not write ${BASELINE_FILE}: ${e.message} — delivery aborted; no zip was created/updated.`); }
    // C8.1: the zip is written by chicla-zip (writeZip), not by the external `zip`. Whole tree in memory: a delivery is small. Modes and mtimes are kept;
    // a name that is not a regular file (a link, a folder) is refused, as the manifest only lists files.
    try {
      const { writeZip } = await loadZipkit();
      const sources = names.map((name) => {
        const abs = resolve(ROOT, name), st = lstatSync(abs);
        if (!st.isFile()) throw new Error(`${name} is not a regular file`);
        return { name, data: readFileSync(abs), mtime: st.mtime, mode: st.mode & 0o777 };
      });
      await writeZip(outPath, sources);
    } catch (e) { if (existsSync(outPath)) rmSync(outPath); return stop("EZIP_WRITE", `\n✗ could not write the zip with chicla-zip (${e.code ?? "error"}: ${e.message}) — delivery aborted; partial zip deleted.`); }
    const v = verifyDelivery({ zip: outPath, against, allowRemoved, root: ROOT });
    relay(renderVerifyDelivery(v));
    result.files = v.files; result.problems = v.problems;
    if (!v.ok) return stepFailed("verify-delivery-zip.mjs", v);
    say("out", `\n✓ delivery created and verified: ${outPath}`);
  } catch (e) {
    if (existsSync(outPath)) rmSync(outPath);
    return stop("EDELIVERY_ERROR", `\n✗ EDELIVERY_ERROR: ${e.code ? `${e.code}: ` : ""}${e.message} — delivery aborted; no zip was created/updated.`);
  }
  return result;
}

/** The text the script prints for a result, per stream (one line per message, as console.log/console.error did). */
export function renderMakeDelivery(result) {
  const text = (stream) => result.messages.filter((m) => m.stream === stream).map((m) => `${m.text}\n`).join("");
  return { out: text("out"), err: text("err") };
}
