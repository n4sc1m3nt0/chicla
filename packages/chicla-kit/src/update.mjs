// C11.3 — `chicla update`: compares the instruction files of a project (CLAUDE.md, AGENTS.md, and the file of every other agent the project has or the caller
// names) with the templates of the installed kit, and shows the difference. It writes NOTHING by itself (always manual, D12): a file is replaced only when its
// exact name is in `apply`, which is the confirmation. The state files (status file, CHANGELOG.md, version.mjs, FILES.manifest) are the project's, are never
// compared and never named in `apply`. An apply writes each file through a temp file and a rename, then runs the kit's own `bump-round --refresh` (manifest and
// fingerprint, one definition); if anything fails every file goes back to the bytes it had (or is removed again if it was new). One bad name refuses the whole run.
// It never prints, never exits and never throws; the CLI renders the result.
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync, writeSync, constants } from "node:fs";
import { dirname, join } from "node:path";
import { AGENTS, resolveAgents } from "./agents.mjs";
import { bumpRound } from "./bump-round.mjs";
import { checkManifest, renderCheckManifest } from "./check-manifest.mjs";

const TEMPLATES = new URL("../templates/", import.meta.url);
const MAX_DIFF_LINES = 2000; // the templates are about 60 lines; a file far bigger than that is not an instruction file worth a quadratic diff
const regenerateManifest = (root) => { const m = checkManifest({ root, write: true }); return { ok: m.ok, ...renderCheckManifest(m) }; };
const kind = (p) => { try { const s = lstatSync(p); return s.isFile() ? "file" : "other"; } catch { return "none"; } };
const lines = (s) => s.replace(/\r\n/g, "\n").split("\n");

/** Lines only the project has are `-`, lines only the template has are `+`, in file order; no context lines. @returns {string | null} null when a file is too big to diff */
export function lineDiff(mine, theirs) {
  const a = lines(mine), b = lines(theirs);
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) return null;
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push(`-${a[i++]}`);
    else out.push(`+${b[j++]}`);
  }
  while (i < n) out.push(`-${a[i++]}`);
  while (j < m) out.push(`+${b[j++]}`);
  return out.join("\n");
}

/** @param {{ root: string, agents?: string[], apply?: string[], templates?: URL }} o `templates` is a folder URL; only the tests change it
 * @returns {{ ok: true, root: string, files: { file: string, state: "same"|"differs"|"missing"|"applied", diff?: string | null }[], applied: string[] } | { ok: false, code: "ENOROOT"|"EAGENT"|"ENOPROJECT"|"EAPPLY"|"ENOFILE"|"EWRITE", root: string, message: string }} */
export function updateProject({ root, agents = [], apply = [], templates = TEMPLATES }) {
  const fail = (code, message) => ({ ok: false, code, root, message });
  let isDir = false;
  try { isDir = statSync(root).isDirectory(); } catch { /* missing */ }
  if (!isDir) return fail("ENOROOT", "the project folder does not exist or is not a folder");
  const ra = resolveAgents(agents);
  if (!ra.ok) return fail("EAGENT", ra.message);
  const set = Object.entries(AGENTS).filter(([k, a]) => a.default || ra.agents.includes(k) || kind(join(root, a.file)) !== "none").map(([, a]) => a); // matrix order
  if (!set.some((a) => kind(join(root, a.file)) !== "none") && !readdirSync(root).some((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f))) return fail("ENOPROJECT", "no chicla project here (no instruction file and no status file); `chicla init` starts one");
  const bad = apply.filter((f) => !set.some((a) => a.file === f));
  if (bad.length) return fail("EAPPLY", `cannot apply ${bad.map((f) => `«${String(f).slice(0, 60)}»`).join(", ")}: only the instruction files of ${set.map((a) => a.file).join(", ")} can be replaced`);
  const other = set.filter((a) => kind(join(root, a.file)) === "other").map((a) => a.file);
  if (other.length) return fail("ENOFILE", `${other.join(", ")} exists but is not a regular file; nothing was changed`);

  const files = [];
  for (const a of set) {
    const tpl = readFileSync(new URL(a.template, templates), "utf8");
    const p = join(root, a.file);
    if (kind(p) === "none") { files.push({ file: a.file, state: "missing", tpl }); continue; }
    const mine = readFileSync(p, "utf8");
    if (lines(mine).join("\n") === lines(tpl).join("\n")) files.push({ file: a.file, state: "same", tpl });
    else files.push({ file: a.file, state: "differs", diff: lineDiff(mine, tpl), tpl });
  }

  const todo = files.filter((f) => apply.includes(f.file) && f.state !== "same");
  const applied = [];
  if (todo.length) {
    const was = []; // { file, bytes | null } in the order written, for the rollback
    const madeDirs = [];
    const undo = () => {
      for (const w of was.reverse()) { try { if (w.bytes === null) rmSync(join(root, w.file), { force: true }); else writeFileSync(join(root, w.file), w.bytes); } catch { /* best effort */ } }
      for (const d of madeDirs.reverse()) { try { rmdirSync(d); } catch { /* not empty or gone */ } }
    };
    try {
      for (const f of todo) {
        const p = join(root, f.file), dir = dirname(p), tmp = `${p}.chicla-update.tmp`;
        if (dir !== root) { try { lstatSync(dir); } catch { mkdirSync(dir); madeDirs.push(dir); } }
        let bytes = null; try { bytes = readFileSync(p); } catch { /* new file */ }
        const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o666);
        try { writeSync(fd, f.tpl); } finally { closeSync(fd); }
        try { renameSync(tmp, p); } catch (e) { rmSync(tmp, { force: true }); throw e; }
        was.push({ file: f.file, bytes });
        applied.push(f.file);
      }
      const r = bumpRound({ root, mode: "refresh", regenerateManifest });
      if (!r.ok) throw Object.assign(new Error(r.code ?? "EBUMP"), { code: r.code });
    } catch (e) {
      undo(); // all or nothing
      return fail("EWRITE", `could not replace the files (${e.code ?? e.message}); nothing was left changed`);
    }
  }
  return { ok: true, root, files: files.map(({ tpl, ...f }) => (applied.includes(f.file) ? { file: f.file, state: "applied" } : f)), applied };
}

/** @returns {{ out: string, err: string }} */
export function renderUpdate(r) {
  if (!r.ok) return { out: "", err: `✗ update: ${r.message}\n` };
  const changed = r.files.filter((f) => f.state === "differs" || f.state === "missing");
  const head = r.applied.length
    ? `✓ updated ${r.applied.join(", ")} in ${r.root}; the manifest and the fingerprint were refreshed\n`
    : changed.length ? `✓ ${changed.length} of ${r.files.length} instruction files differ from the templates of this kit; nothing was written\n` : `✓ the ${r.files.length} instruction files match the templates of this kit\n`;
  const body = r.files.map((f) => {
    const mark = f.state === "same" ? "=" : f.state === "applied" ? "→" : f.state === "missing" ? "+" : "≠";
    const note = f.state === "same" ? "up to date" : f.state === "applied" ? "replaced with the template" : f.state === "missing" ? "not in the project (the template would create it)" : "differs from the template (- yours, + the template)";
    const diff = f.state === "differs" ? (f.diff === null ? "    (too big to diff)\n" : f.diff ? `${f.diff.split("\n").map((l) => `    ${l}`).join("\n")}\n` : "") : "";
    return `  ${mark} ${f.file}: ${note}\n${diff}`;
  }).join("");
  const how = changed.length ? `  to take a template as it is: \`chicla update --apply <file>\` (repeatable); it replaces the whole file, so your local edits in it are lost\n` : "";
  return { out: head + body + how, err: "" };
}
