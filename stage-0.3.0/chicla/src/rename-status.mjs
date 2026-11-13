// C26.5 (D151) — `chicla rename-status <NAME>`: renames the status file of a project that already exists, from <OLD>_PROJECT_STATUS-N.md to <NAME>_PROJECT_STATUS-N.md.
// It rewrites, and nothing else: the name of the status file, the `file=` of the two fingerprint lines (the first line of CHANGELOG.md and version.mjs),
// the one `status-prefix:` line of CLAUDE.md (none for CHICLA, the default: C26.1), the old name in the text of the instruction files that exist (CLAUDE.md, AGENTS.md, GEMINI.md,
// .github/copilot-instructions.md), the old name in the PROCESS BLOCK of the status file and the manifest (through `bump-round --refresh`, the kit's own code, which must then verify).
// The process block is everything above the `**Current version:**` line of the status file: the session-start command and the name of the file are live instructions, not history
// (D-C265a, amended in round 303). From that line down (Snapshot, Previous, Done, Gates) the status file keeps its bytes, and so do the CHANGELOG body and the archives: history is
// not rewritten. A status file with no such line gets no rewrite at all (where the block ends is unknown). All or nothing: every file it may touch is read first and put back if any step fails (EWRITE).
// The same name is not an error: nothing is done and the result says `already` (D-C265b). An invalid NAME is ENAME (the rule of `init`, C26.4), never guessed.
// A project the tool cannot read as one is ESTATE and nothing is written: not exactly one status file of its prefix (or any status file of another prefix), an invalid or conflicting
// `status-prefix:` line, no CLAUDE.md, or a fingerprint line without its `file=`. ENOROOT: the folder does not exist. It never prints, never exits and never throws; the CLI renders the result.
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AGENTS } from "./agents.mjs";
import { bumpRound } from "./bump-round.mjs";
import { checkManifest, renderCheckManifest } from "./check-manifest.mjs";
import { NAME_RE } from "./init.mjs";
import { statusFileAny, statusFileRe, statusPrefix } from "./integrity.mjs";

const defaultRegenerate = (root) => { const m = checkManifest({ root, write: true }); return { ok: m.ok, ...renderCheckManifest(m) }; };
const lines = (s) => s.replace(/\r\n/g, "\n").split("\n");
const isPrefixLine = (l) => /^status-prefix:/.test(l);
/** CLAUDE.md with its `status-prefix:` line(s) turned into the one line of `name` (none for CHICLA); a project that had none gets it after the first line. */
const withLine = (text, name) => {
  const ls = lines(text), at = ls.findIndex(isPrefixLine), rest = ls.filter((l) => !isPrefixLine(l));
  if (name === "CHICLA") return rest.join("\n");
  rest.splice(at === -1 ? 1 : at, 0, `status-prefix: ${name}`);
  return rest.join("\n");
};
const fail = (root, code, message, extra = {}) => ({ ok: false, code, root, message, ...extra });

/** @param {{ root: string, name: string, regenerateManifest?: (root: string) => { ok: boolean } }} o */
export function renameStatus({ root, name, regenerateManifest = defaultRegenerate }) {
  let isDir = false;
  try { isDir = statSync(root).isDirectory(); } catch { /* missing */ }
  if (!isDir) return fail(root, "ENOROOT", "the project folder does not exist or is not a folder");
  if (typeof name !== "string" || !NAME_RE.test(name)) return fail(root, "ENAME", `«${String(name).slice(0, 60)}» is not a valid status-file name (capital letters, digits and _, starting with a letter); nothing was written`);

  const names = readdirSync(root);
  const view = { names, read: (f) => { try { return readFileSync(join(root, f)); } catch { return null; } } };
  const old = statusPrefix(view);
  if (old === null) return fail(root, "ESTATE", "the status-prefix line of CLAUDE.md is not valid (or two lines disagree); nothing was written");
  if (!existsSync(join(root, "CLAUDE.md"))) return fail(root, "ESTATE", "CLAUDE.md is missing: the new name has nowhere to be written; nothing was written");
  const all = names.filter((f) => statusFileAny.test(f)), mine = names.filter((f) => statusFileRe(old).test(f));
  if (mine.length !== 1 || all.length !== 1) return fail(root, "ESTATE", `expected exactly one status file, of the prefix ${old}; found ${all.length} (${mine.length} of that prefix); nothing was written`);
  if (old === name) return { ok: true, root, from: old, to: name, already: true, file: mine[0], changed: [] };

  const oldFile = mine[0], newFile = oldFile.replace(`${old}_PROJECT_STATUS`, `${name}_PROJECT_STATUS`);
  const text = (f) => readFileSync(join(root, f), "utf8");
  const target = new Map(); // file -> new text
  // the two fingerprint lines: the first line of CHANGELOG.md, the first `file=` of version.mjs
  for (const f of ["CHANGELOG.md", "version.mjs"]) {
    if (!existsSync(join(root, f))) return fail(root, "ESTATE", `${f} is missing; nothing was written`);
    const t = text(f), at = f === "CHANGELOG.md" ? t.indexOf("\n") : t.length, head = t.slice(0, at === -1 ? t.length : at);
    if (!head.includes(`file=${oldFile}`)) return fail(root, "ESTATE", `the fingerprint line of ${f} does not carry file=${oldFile}; nothing was written`);
    target.set(f, head.replace(`file=${oldFile}`, `file=${newFile}`) + t.slice(head.length));
  }
  // the old name, as a whole name (never the end of a longer one)
  const oldRe = new RegExp(`(?<![A-Z0-9_])${old}_PROJECT_STATUS`, "g");
  // the status file: only its process block, the part above the `**Current version:**` line (live instructions); the rest is history and keeps its bytes
  const st = text(oldFile), cut = st.search(/^\*\*Current version:\*\*/m);
  if (cut > 0) target.set(oldFile, st.slice(0, cut).replace(oldRe, `${name}_PROJECT_STATUS`) + st.slice(cut));
  // the old name in the text of the instruction files that exist; CLAUDE.md also gets the line
  for (const f of new Set(["CLAUDE.md", ...Object.values(AGENTS).map((a) => a.file)])) {
    if (!existsSync(join(root, f))) continue;
    let t = text(f).replace(oldRe, `${name}_PROJECT_STATUS`);
    if (f === "CLAUDE.md") t = withLine(t, name);
    target.set(f, t);
  }

  // all or nothing: everything that may change is kept as bytes first
  const keep = [...target.keys(), oldFile, "FILES.manifest"].filter((f) => existsSync(join(root, f)));
  const backup = new Map(keep.map((f) => [f, readFileSync(join(root, f))]));
  const restore = () => {
    try { if (existsSync(join(root, newFile)) && newFile !== oldFile) rmSync(join(root, newFile), { force: true }); } catch { /* best effort */ }
    for (const [f, bytes] of backup) { try { writeFileSync(join(root, f), bytes); } catch { /* best effort */ } }
    if (!backup.has("FILES.manifest")) { try { rmSync(join(root, "FILES.manifest"), { force: true }); } catch { /* best effort */ } }
  };
  try {
    for (const [f, t] of target) { if (t !== text(f)) writeFileSync(join(root, f), t); }
    renameSync(join(root, oldFile), join(root, newFile));
    const r = bumpRound({ root, mode: "refresh", regenerateManifest });
    if (!r.ok) throw Object.assign(new Error(r.code ?? "EBUMP"), { code: r.code });
  } catch (e) {
    restore();
    return fail(root, "EWRITE", `could not rename the status file (${e.code ?? e.message}); every file is as it was`);
  }
  const now = (f) => (f === oldFile ? newFile : f); // the status file was written under its old name and then renamed
  return { ok: true, root, from: old, to: name, file: newFile, oldFile, changed: [...target.keys()].filter((f) => backup.get(f) && !backup.get(f).equals(readFileSync(join(root, now(f))))).map(now) };
}

/** @returns {{ out: string, err: string }} */
export function renderRenameStatus(r) {
  if (!r.ok) return { out: "", err: `✗ rename-status: ${r.message}\n` };
  if (r.already) return { out: `✓ the status file is already ${r.file} (the name ${r.to}); nothing was changed\n`, err: "" };
  return { out: `✓ renamed ${r.oldFile} -> ${r.file}; changed: ${r.changed.join(", ") || "(only the name of the status file)"}; the manifest is regenerated and \`chicla bump-round --verify\` passes\n`, err: "" };
}
