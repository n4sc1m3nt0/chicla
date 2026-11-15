// C32.1 (D167, M32) — `chicla release check`: READS ONLY. It says whether the package of this repository may be released: four checks, in this order, none skipped (a failure never hides the next one):
//   npm-version-free  `npm view <name>@<version> version`: E404 = free; an answer with the version = already published; anything else = the check cannot tell, so it fails;
//   tree-clean        `git status --porcelain` is empty (the lines are counted);
//   tag-absent        `git tag --list <name>-v<version>` lists nothing (the LOCAL tags; the remote is not asked);
//   ci-green          `git rev-parse HEAD`, then `gh run list --commit <sha> ...`: at least one run, every run completed with `success` (skipped, cancelled, neutral and running all fail).
// The package is `packages/chicla/package.json` of the root (the single package, D148); its name and version must be plain (no scope, no leading dash) before any command runs.
// `git`, `gh` and `npm` run through ONE function, `run(cmd, args, { cwd })` -> { status, stdout, stderr }; `runTool` is the real one and the only place that starts a process; tests pass a fake, so no test can touch git, GitHub or the registry.
// Result: { ok, code?, root, name, version, tag, commit, checks: [{ id, ok, level: "pass" | "fail", detail, ... }] } (`npm-version-free` also has `published`: true, false, or null when npm could not say; `tree-clean` has `count`; `ci-green` has `runs`, `running`, `failing`). Codes: ENOROOT, ERELEASE_NOPACKAGE, ERELEASE_FAILED. Never throws.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const NAME = /^[a-z0-9][a-z0-9._-]*$/, VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/, SHA = /^[0-9a-f]{40}$/;

/** The real `run`: never throws (a missing tool is status null with the reason in stderr). */
export function runTool(cmd, args, { cwd } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? (r.error ? String(r.error.code ?? r.error.message) : "") };
}

/** @param {{ root?: string, run?: typeof runTool }} o */
export function releaseCheck({ root = ".", run = runTool } = {}) {
  const res = { ok: false, root, name: null, version: null, tag: null, commit: null };
  const stop = (code, message) => ({ ...res, code, message });
  let isDir = false; try { isDir = statSync(root).isDirectory(); } catch { /* missing */ }
  if (!isDir) return stop("ENOROOT", "the project folder does not exist or is not a folder");
  let pkg; try { pkg = JSON.parse(readFileSync(join(root, "packages", "chicla", "package.json"), "utf8")); } catch { pkg = null; }
  if (typeof pkg?.name !== "string" || typeof pkg?.version !== "string" || !NAME.test(pkg.name) || !VERSION.test(pkg.version)) return stop("ERELEASE_NOPACKAGE", "packages/chicla/package.json is missing, or its name or version is not plain (a name without a scope, a version like 1.2.3)");
  res.name = pkg.name; res.version = pkg.version; res.tag = `${pkg.name}-v${pkg.version}`;

  const ask = (cmd, args) => { // one call; whatever the function does, the answer has the three fields
    let r; try { r = run(cmd, args, { cwd: root }); } catch { r = null; }
    return { status: typeof r?.status === "number" ? r.status : null, stdout: typeof r?.stdout === "string" ? r.stdout : "", stderr: typeof r?.stderr === "string" ? r.stderr : "" };
  };
  const checks = [];
  const add = (id, ok, detail, extra = {}) => checks.push({ id, ok, level: ok ? "pass" : "fail", detail, ...extra });

  const spec = `${res.name}@${res.version}`, npm = ask("npm", ["view", spec, "version"]);
  if (npm.status === 0 && npm.stdout.trim() === res.version) add("npm-version-free", false, `${spec} is already on npm`, { published: true });
  else if (npm.status !== 0 && npm.status !== null && /E404/.test(npm.stderr)) add("npm-version-free", true, `${spec} is not on npm yet`, { published: false });
  else add("npm-version-free", false, `npm could not say whether ${spec} exists (exit ${npm.status ?? "none"})`, { published: null });

  const st = ask("git", ["status", "--porcelain"]), dirty = st.stdout.split("\n").filter((l) => l !== "").length;
  if (st.status !== 0) add("tree-clean", false, "git could not read the tree");
  else add("tree-clean", dirty === 0, dirty === 0 ? "the tree is clean" : `${dirty} path${dirty > 1 ? "s" : ""} changed or untracked (commit or remove them)`, { count: dirty });

  const tg = ask("git", ["tag", "--list", res.tag]);
  if (tg.status !== 0) add("tag-absent", false, "git could not list the tags");
  else { const has = tg.stdout.split("\n").includes(res.tag); add("tag-absent", !has, has ? `the tag ${res.tag} already exists` : `the tag ${res.tag} does not exist yet (local tags)`); }

  const head = ask("git", ["rev-parse", "HEAD"]), sha = head.stdout.trim();
  if (head.status !== 0 || !SHA.test(sha)) add("ci-green", false, "git could not name the commit (HEAD)");
  else {
    res.commit = sha;
    const gh = ask("gh", ["run", "list", "--commit", sha, "--json", "databaseId,name,status,conclusion", "--limit", "50"]);
    let list = null; if (gh.status === 0) { try { list = JSON.parse(gh.stdout); } catch { list = null; } }
    if (!Array.isArray(list)) add("ci-green", false, `gh could not list the CI runs of ${sha.slice(0, 12)} (exit ${gh.status ?? "none"})`);
    else if (list.length === 0) add("ci-green", false, `no CI run for ${sha.slice(0, 12)} (push the commit and wait for the CI)`, { runs: 0 });
    else {
      const running = list.filter((x) => x?.status !== "completed").length, failing = list.filter((x) => x?.status === "completed" && x?.conclusion !== "success").length;
      add("ci-green", running === 0 && failing === 0, running ? `${running} of ${list.length} CI runs of ${sha.slice(0, 12)} not finished` : failing ? `${failing} of ${list.length} CI runs of ${sha.slice(0, 12)} did not end in success` : `${list.length} CI run${list.length > 1 ? "s" : ""} of ${sha.slice(0, 12)} ended in success`, { runs: list.length, running, failing });
    }
  }

  const failed = checks.filter((c) => !c.ok).length;
  return failed ? { ...res, code: "ERELEASE_FAILED", checks } : { ...res, ok: true, checks };
}

/** @returns {{ out: string, err: string }} one line per check: ✓ passed, ✗ failed */
export function renderReleaseCheck(r) {
  if (!r.checks) return { out: "", err: `✗ ${r.code}: ${r.message}\n` };
  const lines = r.checks.map((c) => `  ${c.ok ? "✓" : "✗"} ${c.id}: ${c.detail}\n`).join("");
  const failed = r.checks.filter((c) => !c.ok).length;
  return r.ok ? { out: `✓ release check: ${r.checks.length} checks, none failed (${r.name} ${r.version})\n${lines}`, err: "" } : { out: lines, err: `✗ ${r.code}: ${failed} of ${r.checks.length} checks failed (${r.name} ${r.version})\n` };
}
