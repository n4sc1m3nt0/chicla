// C12.1 + C12.7 — `chicla init`: starts a project for the workflow. It writes the instruction files (CLAUDE.md for Claude, AGENTS.md for the other
// agents) and the state files the rest of the kit needs: CHICLA_PROJECT_STATUS-1.md, CHANGELOG.md, version.mjs and FILES.manifest. The fingerprint
// hashes are not computed here: the files are written with placeholder hashes and `bump-round --refresh` (the kit's own code) computes them and the
// manifest, so there is one definition of the fingerprint, not two; then `--verify` must pass or everything is removed again.
// C24.2 (AUDIT-8 F-3, D-283a): it also writes a minimal private package.json (name from the folder, version = the APP_VERSION of the template), because
// make-delivery, verify-delivery and `chicla recovery` all take package.json as the mark of a project root. It is NOT a target: one that exists is kept as it
// is and reported in `kept` (an existing repository adopting the workflow already has its own).
// C26.4 (D151): the status file is <NAME>_PROJECT_STATUS-1.md. NAME is `--name`, else the folder in capitals with every character outside A-Z and 0-9 turned into `_`; a NAME that is not capitals, digits and `_`
// starting with a letter is refused (ENAME), never guessed. The templates keep `CHICLA_PROJECT_STATUS` as their source name and are written as <NAME>_PROJECT_STATUS; CLAUDE.md gets the one line
// `status-prefix: <NAME>` (none for CHICLA, the default). `update` reads the templates through the same `forName`.
// It never overwrites: if any target exists (a file, a folder, a link), or a status file of any prefix exists, nothing is written and the run is
// refused with EEXIST; replacing files is `chicla update` (C11.3, update.mjs). It never prints, never exits and never throws; the CLI renders the result.
import { closeSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, rmdirSync, statSync, writeSync, constants } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { AGENTS, resolveAgents } from "./agents.mjs";
import { bumpRound } from "./bump-round.mjs";
import { checkManifest, renderCheckManifest } from "./check-manifest.mjs";
import { statusFileAny } from "./integrity.mjs";

const TEMPLATES = new URL("../templates/", import.meta.url);
const FILES = ["CLAUDE.md", "AGENTS.md", "CHICLA_PROJECT_STATUS-1.md", "CHANGELOG.md", "version.mjs"]; // the templates; FILES.manifest is generated; the status file is written as <NAME>_PROJECT_STATUS-1.md
const SOURCE_NAME = "CHICLA";
export const NAME_RE = /^[A-Z][A-Z0-9_]*$/;
/** A template as it is written for the project called `name` (C26.4): the source name of the status file is replaced. */
export const forName = (text, name) => text.replaceAll(`${SOURCE_NAME}_PROJECT_STATUS`, `${name}_PROJECT_STATUS`);
const nameFromFolder = (root) => basename(resolve(root)).toUpperCase().replace(/[^A-Z0-9]/g, "_");
// CLAUDE.md of a project not called CHICLA carries the line right after its first line
const withLine = (text, name) => { const i = text.indexOf("\n") + 1; return `${text.slice(0, i)}status-prefix: ${name}\n${text.slice(i)}`; };
const regenerateManifest = (root) => { const m = checkManifest({ root, write: true }); return { ok: m.ok, ...renderCheckManifest(m) }; };
// package.json of a new project: npm-safe name from the folder, the version of the version.mjs template (one version, not two).
const packageJson = (root, templates) => {
  const name = basename(resolve(root)).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+/, "").replace(/-+$/, "") || "chicla-project";
  const version = readFileSync(new URL("version.mjs", templates), "utf8").match(/APP_VERSION = "([^"]+)"/)?.[1] ?? "0.0.1";
  return `${JSON.stringify({ name, version, private: true }, null, 2)}\n`;
};
const present = (p) => { try { lstatSync(p); return true; } catch { return false; } };

/** @param {{ root: string, agents?: string[], name?: string, templates?: URL }} o `name` (C26.4) is the status-file prefix, the folder in capitals when it is not given; `agents` (C12.6) adds the files of those agents of the matrix to the default set; `templates` is a folder URL; only the tests change it (to make a step fail and prove the rollback)
 * @returns {{ ok: true, root: string, created: string[], kept: string[] } | { ok: false, code: "ENOROOT"|"EEXIST"|"EWRITE"|"EAGENT"|"ENAME", root: string, existing?: string[], message: string }} */
export function initProject({ root, agents = [], name, templates = TEMPLATES }) {
  const ra = resolveAgents(agents);
  if (!ra.ok) return { ok: false, code: "EAGENT", root, message: ra.message };
  const extra = ra.agents.filter((k) => !AGENTS[k].default).map((k) => AGENTS[k]); // C12.6: {file, template}; a file may sit in a folder (.github/)
  let isDir = false;
  try { isDir = statSync(root).isDirectory(); } catch { /* missing */ }
  if (!isDir) return { ok: false, code: "ENOROOT", root, message: "the project folder does not exist or is not a folder" };
  const nm = name === undefined ? nameFromFolder(root) : name;
  if (typeof nm !== "string" || !NAME_RE.test(nm)) return { ok: false, code: "ENAME", root, message: `${name === undefined ? `the folder name gives «${nm}»` : `«${String(name).slice(0, 60)}»`} is not a valid status-file name (capital letters, digits and _, starting with a letter); pass --name <NAME>; nothing was written` };
  const targets = [...FILES.map((f) => ({ file: f === "CHICLA_PROJECT_STATUS-1.md" ? `${nm}_PROJECT_STATUS-1.md` : f, template: f })), ...extra];
  const ALL = [...targets.map((t) => t.file), "FILES.manifest"];
  const existing = [...new Set([...ALL.filter((f) => present(join(root, f))), ...readdirSync(root).filter((f) => statusFileAny.test(f))])];
  if (existing.length) return { ok: false, code: "EEXIST", root, existing, message: `${existing.join(", ")} already exist; nothing was written` };
  const made = [];
  const kept = []; // C24.2: package.json when the project already had one
  const madeDirs = []; // folders this run created (.github/), removed again if still empty
  const undo = () => { for (const f of made) { try { rmSync(join(root, f), { force: true }); } catch { /* best effort */ } } for (const d of madeDirs.reverse()) { try { rmdirSync(d); } catch { /* not empty or gone: leave it */ } } };
  try {
    for (const { file: f, template } of targets) {
      let text = forName(readFileSync(new URL(template, templates), "utf8"), nm);
      if (f === "CLAUDE.md" && nm !== SOURCE_NAME) text = withLine(text, nm);
      const dir = dirname(join(root, f));
      if (dir !== root && !present(dir)) { mkdirSync(dir); madeDirs.push(dir); }
      const fd = openSync(join(root, f), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o666); // exclusive: a file that appears meanwhile is never replaced
      made.push(f);
      try { writeSync(fd, text); } finally { closeSync(fd); }
    }
    const pj = "package.json"; // C24.2: written last among the files and before the manifest, so the manifest lists it; exclusive like the others, but a race is «kept», not a failure
    if (present(join(root, pj))) kept.push(pj);
    else {
      let fd;
      try { fd = openSync(join(root, pj), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o666); } catch (e) { if (e.code === "EEXIST") kept.push(pj); else throw e; }
      if (fd !== undefined) { made.push(pj); try { writeSync(fd, packageJson(root, templates)); } finally { closeSync(fd); } }
    }
    made.push("FILES.manifest"); // removed too if a later step fails
    const r = bumpRound({ root, mode: "refresh", regenerateManifest });
    if (!r.ok) throw Object.assign(new Error(r.code ?? "EBUMP"), { code: r.code });
  } catch (e) {
    undo(); // all or nothing
    return { ok: false, code: e.code === "EEXIST" ? "EEXIST" : "EWRITE", root, existing: e.code === "EEXIST" ? ALL.filter((f) => present(join(root, f))) : undefined, message: `could not create the project files (${e.code ?? e.message}); nothing was left behind` };
  }
  return { ok: true, root, created: made, kept };
}

/** @returns {{ out: string, err: string }} */
export function renderInit(r) {
  if (!r.ok) return { out: "", err: `✗ init: ${r.message}\n` };
  const kept = r.kept?.length ? `  kept as it was: ${r.kept.join(", ")} (already there)\n` : "";
  return { out: `✓ created ${r.created.join(", ")} in ${r.root}\n${kept}  next: edit CLAUDE.md and the status file for the project, then run \`chicla bump-round --verify\`\n`, err: "" };
}
