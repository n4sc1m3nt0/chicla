// C30.4 (D-E) — `chicla doctor`: reads a project and says what is wrong; it writes NOTHING and never throws. Four checks, in this order:
//   instruction-files  at least one instruction file of the agent matrix is there and none is a folder; one of the two default files missing is a note (a project may serve one agent);
//   fingerprint        what `chicla bump-round --verify` checks (the three-way fingerprint, the pin, the line endings);
//   templates          the instruction files that differ from this kit's templates: a NOTE (level "note"), never a failure, because a project may edit its rules (`chicla update` shows the diff);
//   scripts-refs       an instruction file or the newest status file names a `scripts/<file>` that is not in the project (the bug of D160: text that tells the user to run what is not there).
// The result is { ok, code?, root, checks: [{ id, ok, level: "pass" | "note" | "fail", detail, ... }] }; `ok` is false when a check failed. Codes: ENOROOT, EDOCTOR_NOPROJECT, EDOCTOR_FAILED.
import { lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { AGENTS } from "./agents.mjs";
import { bumpRound } from "./bump-round.mjs";
import { statusFileAny } from "./integrity.mjs";
import { updateProject } from "./update.mjs";

const DEFAULTS = Object.values(AGENTS).filter((a) => a.default).map((a) => a.file); // what `chicla init` writes for everybody
const kind = (p) => { try { const s = lstatSync(p); return s.isFile() ? "file" : "other"; } catch { return "none"; } };
const newestStatus = (root) => readdirSync(root).filter((f) => statusFileAny.test(f)).sort((a, b) => Number(a.match(/(\d+)\.md$/)[1]) - Number(b.match(/(\d+)\.md$/)[1])).pop();
// `scripts/<name>`, not part of a longer path, and not a pattern (`scripts/*.mjs`, `scripts/<name>`): a trailing dot or hyphen is punctuation, not the name
const DIR = "scripts"; // built, never written out: the guard test of C30.2 forbids that word-and-slash anywhere in what the package ships
const REF = new RegExp(`(?<![A-Za-z0-9_./-])(?:\\./)?(${DIR}/[A-Za-z0-9._-]+)`, "g");
const refsOf = (text) => {
  const out = [];
  for (const m of text.matchAll(REF)) {
    if (/[*<{[]/.test(text[m.index + m[0].length] ?? "")) continue;
    const ref = m[1].replace(/[.\-_]+$/, "");
    if (ref !== `${DIR}/` && !out.includes(ref)) out.push(ref);
  }
  return out;
};

/** @param {{ root: string }} o @returns {{ ok: boolean, code?: "ENOROOT"|"EDOCTOR_NOPROJECT"|"EDOCTOR_FAILED", root: string, message?: string, checks?: object[] }} */
export function doctor({ root }) {
  let isDir = false;
  try { isDir = statSync(root).isDirectory(); } catch { /* missing */ }
  if (!isDir) return { ok: false, code: "ENOROOT", root, message: "the project folder does not exist or is not a folder" };
  const all = Object.values(AGENTS).map((a) => a.file);
  const status = newestStatus(root);
  if (!all.some((f) => kind(join(root, f)) !== "none") && status === undefined) return { ok: false, code: "EDOCTOR_NOPROJECT", root, message: "no chicla project here (no instruction file and no status file); `chicla init` starts one" };

  const checks = [];
  const present = all.filter((f) => kind(join(root, f)) === "file"), broken = all.filter((f) => kind(join(root, f)) === "other");
  const absent = DEFAULTS.filter((f) => kind(join(root, f)) === "none");
  const bad = !present.length || broken.length > 0;
  checks.push({ id: "instruction-files", ok: !bad, level: bad ? "fail" : absent.length ? "note" : "pass", files: bad ? (broken.length ? broken : DEFAULTS) : absent, detail: broken.length ? `not a regular file: ${broken.join(", ")}` : !present.length ? "no instruction file (`chicla init` writes CLAUDE.md and AGENTS.md)" : absent.length ? `${absent.join(", ")} not in the project (fine if no agent reads it)` : `${present.join(", ")} are there` });

  let fp;
  try { fp = bumpRound({ root, mode: "verify" }); } catch { fp = { ok: false, code: "EBUMP_ERROR" }; }
  checks.push({ id: "fingerprint", ok: fp.ok === true, level: fp.ok ? "pass" : "fail", code: fp.ok ? null : fp.code ?? null, detail: fp.ok ? "the fingerprints, the pin and the line endings agree (`chicla bump-round --verify`)" : `\`chicla bump-round --verify\` fails (${fp.code ?? "unknown"}); run it for the details` });

  let up;
  try { up = updateProject({ root }); } catch { up = { ok: false, code: "EWRITE" }; }
  if (!up.ok) checks.push({ id: "templates", ok: false, level: "fail", files: [], detail: `the instruction files could not be compared with the templates (${up.code})` });
  else {
    const differs = up.files.filter((f) => f.state === "differs").map((f) => f.file);
    checks.push({ id: "templates", ok: true, level: differs.length ? "note" : "pass", files: differs, detail: differs.length ? `${differs.join(", ")} ${differs.length > 1 ? "differ" : "differs"} from the templates of this kit (\`chicla update\` shows how; edits of your own are allowed)` : "the instruction files match the templates of this kit" });
  }

  const refs = [];
  for (const f of [...new Set([...all.filter((f) => kind(join(root, f)) === "file"), ...(status ? [status] : [])])]) {
    let text = ""; try { text = readFileSync(join(root, f), "utf8"); } catch { continue; }
    for (const ref of refsOf(text)) if (kind(join(root, ref)) === "none") refs.push({ file: f, ref });
  }
  checks.push({ id: "scripts-refs", ok: refs.length === 0, level: refs.length ? "fail" : "pass", refs, detail: refs.length ? `named but not in the project: ${refs.slice(0, 8).map((r) => `${r.ref} (${r.file})`).join(", ")}${refs.length > 8 ? `, and ${refs.length - 8} more` : ""}` : "no instruction file or status file names a file of the scripts folder that is missing" });

  const failed = checks.filter((c) => !c.ok).length;
  return failed ? { ok: false, code: "EDOCTOR_FAILED", root, checks } : { ok: true, root, checks };
}
/** @returns {{ out: string, err: string }} one line per check: ✓ passed, ! a note (not a failure), ✗ failed */
export function renderDoctor(r) {
  if (!r.checks) return { out: "", err: `✗ ${r.code}: ${r.message}\n` };
  const mark = { pass: "✓", note: "!", fail: "✗" };
  const out = r.checks.map((c) => `  ${mark[c.level]} ${c.id}: ${c.detail}\n`).join("");
  const failed = r.checks.filter((c) => !c.ok).length;
  return r.ok ? { out: `✓ doctor: ${r.checks.length} checks, none failed${r.checks.some((c) => c.level === "note") ? " (see the notes)" : ""}\n${out}`, err: "" } : { out, err: `✗ ${r.code}: ${failed} of ${r.checks.length} checks failed\n` };
}
