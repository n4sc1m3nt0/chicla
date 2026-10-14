// FILES.baseline.json (C9.6): the state of the last delivery, carried INSIDE the delivery (and so inside every dump),
// so recovery-report no longer needs the previous delivery zip.
//
//   { format: "chicla-baseline-v1", created, seal, files: [{ path, size, sha256 }, …] }   (files sorted by path)
//
// `seal` = sha256 of the canonical JSON of `files`: it catches a file that was cut, truncated or edited by accident
// (it is NOT a signature: someone who edits the list and the seal together is not defended against; the zip is
// not a trust boundary here). The baseline never lists itself. Errors carry a stable `code`; tests assert the codes.
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const BASELINE_FILE = "FILES.baseline.json";
export const BASELINE_FORMAT = "chicla-baseline-v1";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const fail = (code, message) => Object.assign(new Error(message), { code });
const sealOf = (files) => sha256(JSON.stringify(files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 }))));
const unsafePath = (p) => typeof p !== "string" || p === "" || p.includes("\0") || p.includes("\\") || p.startsWith("/") || /^[A-Za-z]:/.test(p) || p.split("/").some((s) => s === "" || s === "." || s === "..");

/** Builds the baseline of `names` (paths relative to `root`, "/" separated); skips the baseline file itself. */
export function buildBaseline(root, names, { now = new Date() } = {}) {
  const files = [...new Set(names)].filter((n) => n !== BASELINE_FILE).sort().map((path) => {
    const bytes = readFileSync(join(root, path));
    return { path, size: statSync(join(root, path)).size, sha256: sha256(bytes) };
  });
  return { format: BASELINE_FORMAT, created: now.toISOString(), seal: sealOf(files), files };
}

export const serializeBaseline = (b) => JSON.stringify(b, null, 1) + "\n";

/** Parses and checks a baseline. Throws an Error with `.code`: EBASELINE_PARSE, EBASELINE_FORMAT or EBASELINE_SEAL. */
export function parseBaseline(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw fail("EBASELINE_PARSE", "the baseline is not valid JSON (cut or damaged?)"); }
  if (o === null || typeof o !== "object" || Array.isArray(o)) throw fail("EBASELINE_PARSE", "the baseline is not an object");
  if (o.format !== BASELINE_FORMAT) throw fail("EBASELINE_FORMAT", `unknown baseline format: ${String(o.format)}`);
  if (!Array.isArray(o.files)) throw fail("EBASELINE_PARSE", "the baseline has no file list");
  for (const f of o.files) {
    if (f === null || typeof f !== "object" || unsafePath(f.path) || !Number.isSafeInteger(f.size) || f.size < 0 || !/^[0-9a-f]{64}$/.test(f.sha256 ?? "")) throw fail("EBASELINE_PARSE", "a baseline entry is malformed or has an unsafe path");
  }
  if (typeof o.seal !== "string" || o.seal !== sealOf(o.files)) throw fail("EBASELINE_SEAL", "the baseline seal does not match its list (edited or cut)");
  return o;
}
