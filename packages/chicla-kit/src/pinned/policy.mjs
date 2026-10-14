// C6.1 (slice a): the «never leaves» rules in ONE place. Pure rules and no dependencies; the only I/O is loadPolicy() (C6.1 d2).
// Read by check-manifest.mjs (what enters FILES.manifest, so a delivery zip) and verify-delivery-zip.mjs (the independent check on the finished zip).
// Also read by recovery-report.mjs (slice b; the file travels in RECOVER/ and is covered by the toolchain pin, C9.4). NOT read by emergency-dump.mjs: the dump must not
// depend on an import that can break (D7), so it keeps its own copy and test/dump-policy.test.mjs ties that copy to this file (slice c). The corpus folders inherited from the previous project are gone (D64, slice d1):
// Chicla has no project-specific rule; presets and a policy file come in the next slices.
// Paths are project-relative with "/" as separator.
// C6.1 slice d2 (D65, D66): an OPTIONAL chicla.policy.json at the project root ADDS rules (never removes one). The only I/O in this file is loadPolicy().
import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { join } from "node:path";
// C6.3 slice a (D73): folders that hold credentials are never walked either, at any depth. Built-in: no policy key can release them.
export const SECRET_DIRS = new Set([".ssh", ".aws"]);
export const SKIP_NAMES = new Set(["node_modules", ".next", ".git", "__MACOSX", ...SECRET_DIRS]); // never walked, never shipped, at any depth
export const PYTHON_DIRS = new Set([".venv", "__pycache__"]);

export const isSecretEnv = (name) => /^\.env(\..*)?$/.test(name) && !/\.(example|sample)$/.test(name); // .env.example / .env.sample are not secrets
// C6.3 slice a (D73): file names that hold credentials, in any folder: .npmrc, .netrc, .git-credentials, *.pem, id_rsa*. Compared in lower case (a Mac keeps the
// case you typed). Over-excluding is the safe side: id_rsa.pub (a public key) goes too, and a project that needs a real .npmrc ships it by hand.
export const isSecretFileName = (name) => { const l = name.toLowerCase(); return l === ".npmrc" || l === ".netrc" || l === ".git-credentials" || l.endsWith(".pem") || l.startsWith("id_rsa"); };
// File names never hashed, shipped or kept in a recovered tree, whatever the folder (recovery-report, C6.1 slice b).
export const isJunkName = (name) => name === ".DS_Store" || name.endsWith(".tsbuildinfo") || name.endsWith(".pyc") || isSecretEnv(name) || isSecretFileName(name);

// Why a project-relative path must never leave the project, or null.
export function neverShipReason(rel, policy = NO_POLICY) {
  const parts = rel.split("/");
  if (parts.slice(0, -1).some((d) => PYTHON_DIRS.has(d)) || /\.pyc$/.test(rel)) return "Python artefact";
  if (isSecretEnv(parts[parts.length - 1])) return ".env file (secrets)";
  if (parts.some((d) => SECRET_DIRS.has(d))) return "credentials folder (.ssh, .aws)";
  if (isSecretFileName(parts[parts.length - 1])) return "credentials file name (.npmrc, .netrc, .git-credentials, *.pem, id_rsa*)";
  if (policySkips(rel, policy)) return `listed in ${POLICY_FILE}`;
  return null;
}

// ---- the optional policy file (D66) ----
// { "version": 1, "presets": ["cargo"], "names": ["dist"], "paths": ["secrets/", "docs/private"] }
//   names: a file or folder name, skipped at any depth. paths: a file or folder from the project root, with everything below it.
//   allow (C6.3 c, D73 (3)): exact files from the project root that the CONTENT detector wrongly catches (a false positive) are released. It is the only key that
//   loosens anything, and only that one rule: a path the name rules, the folders or the Python/.env rules refuse is EPOLICY_PATH, never a silent no-op.
//   presets (C6.1 d3, D69): ready-made lists of NAMES for a kind of project, expanded into `names` here, so every reader gets them. A preset only adds.
// Nothing here can remove a built-in rule: the keys only add. Errors carry a stable code: EPOLICY_READ (cannot be read; NOT the same as absent),
// EPOLICY_PARSE (not JSON, not an object), EPOLICY_FORMAT (version, unknown key, wrong type), EPOLICY_PATH (an unsafe name or path).
export const POLICY_FILE = "chicla.policy.json";
export const NO_POLICY = Object.freeze({ names: new Set(), paths: Object.freeze([]), presets: Object.freeze([]), allow: new Set() });
export const PRESETS = Object.freeze({
  cargo: Object.freeze(["target"]),
  node: Object.freeze(["dist", "build", "coverage", ".turbo"]),
  python: Object.freeze([".pytest_cache", ".mypy_cache", ".ruff_cache", ".tox", ".eggs", "build", "dist"]),
});
const perr = (code, message) => Object.assign(new Error(message), { code });
const nfc = (s) => s.normalize("NFC"); // macOS stores names decomposed; compare composed

export function parsePolicy(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { throw perr("EPOLICY_PARSE", `${POLICY_FILE} is not valid JSON (${e.message})`); }
  if (o === null || typeof o !== "object" || Array.isArray(o)) throw perr("EPOLICY_PARSE", `${POLICY_FILE} must hold one JSON object`);
  if (o.version !== 1) throw perr("EPOLICY_FORMAT", `${POLICY_FILE}: "version" must be 1`);
  for (const k of Object.keys(o)) if (!["version", "presets", "names", "paths", "allow"].includes(k)) throw perr("EPOLICY_FORMAT", `${POLICY_FILE}: unknown key "${k}" (the policy adds rules: "presets", "names", "paths"; "allow" releases a content false positive)`);
  const list = (k) => {
    if (o[k] === undefined) return [];
    if (!Array.isArray(o[k]) || o[k].some((x) => typeof x !== "string")) throw perr("EPOLICY_FORMAT", `${POLICY_FILE}: "${k}" must be a list of strings`);
    return o[k];
  };
  const bad = (x, what) => { throw perr("EPOLICY_PATH", `${POLICY_FILE}: unsafe ${what} ${JSON.stringify(x)}`); };
  const names = new Set(), paths = [], presets = [];
  for (const k of list("presets")) {
    if (!Object.hasOwn(PRESETS, k)) throw perr("EPOLICY_FORMAT", `${POLICY_FILE}: unknown preset ${JSON.stringify(k)} (known: ${Object.keys(PRESETS).join(", ")})`);
    if (!presets.includes(k)) presets.push(k);
    for (const n of PRESETS[k]) names.add(nfc(n));
  }
  for (const n of list("names")) {
    if (n === "" || n === "." || n === ".." || /[\/\0\\]/.test(n) || n === POLICY_FILE) bad(n, "name");
    names.add(nfc(n));
  }
  for (const raw of list("paths")) {
    const x = raw.replace(/\/$/, "");
    if (x === "" || x === POLICY_FILE || /[\0\\]/.test(x) || x.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) bad(raw, "path");
    paths.push(nfc(x));
  }
  const allow = new Set();
  for (const raw of list("allow")) { // exact files; the content rule is the only one that can be released
    if (raw === "" || raw === POLICY_FILE || /[\0\\]/.test(raw) || raw.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) bad(raw, "allow path");
    if (neverShipReason(raw) || raw.split("/").some((seg) => SKIP_NAMES.has(seg))) throw perr("EPOLICY_PATH", `${POLICY_FILE}: "allow" releases only the content detector, and ${JSON.stringify(raw)} is refused by a name or folder rule`);
    allow.add(nfc(raw));
  }
  return { names, paths, presets, allow };
}

// The policy of a project: NO_POLICY when the file does not exist, an error when it exists and cannot be used (failing open would leak).
export function loadPolicy(root) {
  let text;
  try { text = readFileSync(join(root, POLICY_FILE), "utf8"); }
  catch (e) { if (e.code === "ENOENT") return NO_POLICY; throw perr("EPOLICY_READ", `${POLICY_FILE} cannot be read (${e.code ?? e.message})`); }
  return parsePolicy(text);
}

// True when the policy skips this project-relative path (a file or a folder): a listed name in any segment, or a listed path or what is below it.
export function policySkips(rel, policy = NO_POLICY) {
  const r = nfc(rel);
  return r.split("/").some((seg) => policy.names.has(seg)) || policy.paths.some((x) => r === x || r.startsWith(x + "/"));
}

// True when the policy releases this exact file from the content detector (C6.3 c): the caller then skips the scan for it, and ONLY the scan.
export const policyAllows = (rel, policy = NO_POLICY) => policy.allow?.has(nfc(rel)) === true;

// ---- the content detector (C6.3 slice b, D73) ----
// Looks INSIDE a file for what only a secret looks like: a private-key header, an AWS access key id, a GitHub token (ghp_ or github_pat_), an npm token (npm_).
// Built-in, never switched off by the policy file. It returns the KIND and nothing else: callers print the file name and the kind, never the match.
// A file over SCAN_LIMIT or with a NUL byte (binary; UTF-16 too) is not scanned: a known limit, not a guarantee. The `allow` key (slice c) releases single files; the callers decide, with policyAllows().
export const SCAN_LIMIT = 1048576; // 1 MiB
const DETECTORS = [
  ["private key", /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/],
  ["AWS access key", /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/],
  ["GitHub token", /(?<![A-Za-z0-9])(?:ghp_[A-Za-z0-9]{36}(?![A-Za-z0-9])|github_pat_[A-Za-z0-9_]{22,})/],
  ["npm token", /(?<![A-Za-z0-9])npm_[A-Za-z0-9]{36}(?![A-Za-z0-9])/],
];
export function detectSecret(buf) {
  if (buf.length === 0 || buf.length > SCAN_LIMIT || buf.includes(0)) return null;
  const text = buf.toString("latin1");
  for (const [kind, re] of DETECTORS) if (re.test(text)) return kind;
  return null;
}
// The kind for a file on disk, or null (not a regular file, too big, unreadable, nothing found). Unreadable is null: a file that cannot be read cannot be shipped either.
export function scanFile(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > SCAN_LIMIT) return null;
    const b = Buffer.alloc(st.size);
    let n = 0;
    while (n < st.size) { const r = readSync(fd, b, n, st.size - n, n); if (!r) break; n += r; }
    return detectSecret(b.subarray(0, n));
  } catch { return null; } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* nothing to do */ } }
}
