// C30.5 (D161, D163) — `chicla git-plan --against <previous zip | FILES.manifest> [--root <dir>]`: PRINTS the git commands of a delivery, ready to paste; it reads, writes nothing and runs nothing.
// Input: the FILES.manifest of the delivery (the project root) and the previous one (a delivery zip, whose FILES.manifest is read, or a manifest file). Output, in this order:
//   1. `git rm` of every status file but the newest (D163; safe to repeat, so it is always the first line);
//   2. `git rm` of the files that left (a status file is covered by line 1), in lines of at most 30 names;
//   3. `git add` of the files that entered or changed (a different crc32 or size) and of FILES.manifest (it never lists itself), in lines of at most 30 names;
//   4. one `git commit -m 'round N: <title>'`, from the newest `## Round N — title` heading of CHANGELOG.md; the title loses quotes, backticks, `$` and `\` (D-N).
// No comment, no `chicla` command and no `git push` (D-O). A name with a control character is never printed (it is counted in `skipped`); the others are quoted for a POSIX shell.
// Result: { ok, code, message?, root, round, title, status, left, added, skipped, commands }. Codes: EGITPLAN_USAGE, EGITPLAN_MANIFEST (the root's), EGITPLAN_PREVIOUS, EGITPLAN_STATUS, EGITPLAN_CHANGELOG. Never throws.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseManifest } from "./pinned/manifest.mjs";
import { statusFileAny } from "./integrity.mjs";
import { loadZipkit } from "./zipkit-loader.mjs";

const CHUNK = 30, MAX_MANIFEST = 64 * 1024 * 1024, CONTROL = /[\u0000-\u001f\u007f]/;
// the quoting of verify-delivery's `git rm` hint (D102), kept here on purpose: that file exports no helper, and a name that is not plain is wrapped in single quotes
const shq = (s) => (/^[A-Za-z0-9._\/@%+=:,-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
const num = (f) => Number(f.match(/(\d+)\.md$/)[1]);

export async function gitPlan({ root = ".", against } = {}) {
  const r = { ok: false, code: null, root: resolve(root), round: null, title: null, status: null, left: [], added: [], skipped: 0, commands: [] };
  const stop = (code, message) => { r.code = code; r.message = message; return r; };
  if (typeof against !== "string" || against === "") return stop("EGITPLAN_USAGE", "no previous delivery given: a zip or a FILES.manifest");
  let now, prev;
  try { now = parseManifest(readFileSync(join(r.root, "FILES.manifest"), "utf8")); } catch (e) { return stop("EGITPLAN_MANIFEST", `FILES.manifest of the project cannot be read (${e.code ?? "unreadable"})`); }
  try {
    if (/\.zip$/i.test(against)) { const { readZipFile } = await loadZipkit(); prev = parseManifest(readZipFile(against, "FILES.manifest", { maxBytes: MAX_MANIFEST }).toString("utf8")); }
    else prev = parseManifest(readFileSync(against, "utf8"));
  } catch (e) { return stop("EGITPLAN_PREVIOUS", `the previous manifest cannot be read (${e.code ?? "unreadable"})`); }
  let names; try { names = readdirSync(r.root).filter((f) => statusFileAny.test(f)).sort((a, b) => num(a) - num(b)); } catch { names = []; }
  if (!names.length) return stop("EGITPLAN_STATUS", "no status file in the project root");
  const status = names.at(-1), prefix = status.slice(0, status.indexOf("_PROJECT_STATUS-"));
  let head; try { head = /^## Round ([0-9A-Za-z.]+) — (.+)$/m.exec(readFileSync(join(r.root, "CHANGELOG.md"), "utf8")); } catch { head = null; }
  const title = head ? head[2].replace(/[`'"$\\\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (!head || !title) return stop("EGITPLAN_CHANGELOG", "CHANGELOG.md has no «## Round N — title» heading");

  const before = new Map(prev.map((e) => [e.path, e])), after = new Map(now.map((e) => [e.path, e]));
  r.left = prev.map((e) => e.path).filter((p) => !after.has(p) && !statusFileAny.test(p)).sort();
  // FILES.manifest never lists itself and is rewritten in every round, so it is always added
  r.added = [...new Set([...now.filter((e) => { const o = before.get(e.path); return !o || o.crc32 !== e.crc32 || o.size !== e.size; }).map((e) => e.path), "FILES.manifest"])].sort();
  const lines = (verb, paths) => {
    const safe = paths.filter((p) => !CONTROL.test(p)); r.skipped += paths.length - safe.length;
    const out = []; for (let i = 0; i < safe.length; i += CHUNK) out.push(`${verb} ${safe.slice(i, i + CHUNK).map(shq).join(" ")}`);
    return out;
  };
  r.commands = [
    `git rm -q --ignore-unmatch -- ':(glob)${prefix}_PROJECT_STATUS-*.md' ':(exclude)${status}'`,
    ...lines("git rm -q --ignore-unmatch --", r.left),
    ...lines("git add --", r.added),
    `git commit -m 'round ${head[1]}: ${title}'`,
  ];
  Object.assign(r, { ok: true, round: head[1], title, status });
  return r;
}

/** { out, err } for the CLI: the commands alone on stdout; a failure or the skipped names on stderr. */
export function renderGitPlan(r) {
  if (!r.ok) return { out: "", err: `✗ ${r.code}: ${r.message}\n` };
  return { out: `${r.commands.join("\n")}\n`, err: r.skipped ? `⚠ ${r.skipped} name(s) with a control character are not listed: handle them by hand\n` : "" };
}
