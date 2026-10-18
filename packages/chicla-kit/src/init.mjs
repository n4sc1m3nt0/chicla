// C12.1 + C12.7 — `chicla init`: starts a project for the workflow. It writes the instruction files (CLAUDE.md for Claude, AGENTS.md for the other
// agents) and the state files the rest of the kit needs: CHICLA_PROJECT_STATUS-1.md, CHANGELOG.md, version.mjs and FILES.manifest. The fingerprint
// hashes are not computed here: the files are written with placeholder hashes and `bump-round --refresh` (the kit's own code) computes them and the
// manifest, so there is one definition of the fingerprint, not two; then `--verify` must pass or everything is removed again.
// It never overwrites: if any target exists (a file, a folder, a link), or any CHICLA_PROJECT_STATUS-N.md exists, nothing is written and the run is
// refused with EEXIST; replacing files is `chicla update` (C11.3, update.mjs). It never prints, never exits and never throws; the CLI renders the result.
import { closeSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, rmdirSync, statSync, writeSync, constants } from "node:fs";
import { dirname, join } from "node:path";
import { AGENTS, resolveAgents } from "./agents.mjs";
import { bumpRound } from "./bump-round.mjs";
import { checkManifest, renderCheckManifest } from "./check-manifest.mjs";

const TEMPLATES = new URL("../templates/", import.meta.url);
const FILES = ["CLAUDE.md", "AGENTS.md", "CHICLA_PROJECT_STATUS-1.md", "CHANGELOG.md", "version.mjs"]; // from templates; FILES.manifest is generated
const regenerateManifest = (root) => { const m = checkManifest({ root, write: true }); return { ok: m.ok, ...renderCheckManifest(m) }; };
const present = (p) => { try { lstatSync(p); return true; } catch { return false; } };

/** @param {{ root: string, agents?: string[], templates?: URL }} o `agents` (C12.6) adds the files of those agents of the matrix to the default set; `templates` is a folder URL; only the tests change it (to make a step fail and prove the rollback)
 * @returns {{ ok: true, root: string, created: string[] } | { ok: false, code: "ENOROOT"|"EEXIST"|"EWRITE"|"EAGENT", root: string, existing?: string[], message: string }} */
export function initProject({ root, agents = [], templates = TEMPLATES }) {
  const ra = resolveAgents(agents);
  if (!ra.ok) return { ok: false, code: "EAGENT", root, message: ra.message };
  const extra = ra.agents.filter((k) => !AGENTS[k].default).map((k) => AGENTS[k]); // C12.6: {file, template}; a file may sit in a folder (.github/)
  const targets = [...FILES.map((f) => ({ file: f, template: f })), ...extra];
  const ALL = [...targets.map((t) => t.file), "FILES.manifest"];
  let isDir = false;
  try { isDir = statSync(root).isDirectory(); } catch { /* missing */ }
  if (!isDir) return { ok: false, code: "ENOROOT", root, message: "the project folder does not exist or is not a folder" };
  const existing = [...new Set([...ALL.filter((f) => present(join(root, f))), ...readdirSync(root).filter((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f))])];
  if (existing.length) return { ok: false, code: "EEXIST", root, existing, message: `${existing.join(", ")} already exist; nothing was written` };
  const made = [];
  const madeDirs = []; // folders this run created (.github/), removed again if still empty
  const undo = () => { for (const f of made) { try { rmSync(join(root, f), { force: true }); } catch { /* best effort */ } } for (const d of madeDirs.reverse()) { try { rmdirSync(d); } catch { /* not empty or gone: leave it */ } } };
  try {
    for (const { file: f, template } of targets) {
      const text = readFileSync(new URL(template, templates), "utf8");
      const dir = dirname(join(root, f));
      if (dir !== root && !present(dir)) { mkdirSync(dir); madeDirs.push(dir); }
      const fd = openSync(join(root, f), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o666); // exclusive: a file that appears meanwhile is never replaced
      made.push(f);
      try { writeSync(fd, text); } finally { closeSync(fd); }
    }
    made.push("FILES.manifest"); // removed too if a later step fails
    const r = bumpRound({ root, mode: "refresh", regenerateManifest });
    if (!r.ok) throw Object.assign(new Error(r.code ?? "EBUMP"), { code: r.code });
  } catch (e) {
    undo(); // all or nothing
    return { ok: false, code: e.code === "EEXIST" ? "EEXIST" : "EWRITE", root, existing: e.code === "EEXIST" ? ALL.filter((f) => present(join(root, f))) : undefined, message: `could not create the project files (${e.code ?? e.message}); nothing was left behind` };
  }
  return { ok: true, root, created: made };
}

/** @returns {{ out: string, err: string }} */
export function renderInit(r) {
  if (!r.ok) return { out: "", err: `✗ init: ${r.message}\n` };
  return { out: `✓ created ${r.created.join(", ")} in ${r.root}\n  next: edit CLAUDE.md and the status file for the project, then run \`chicla bump-round --verify\`\n`, err: "" };
}
