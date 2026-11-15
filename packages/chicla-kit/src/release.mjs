// C32.1 (D167, M32) — `chicla release check`: READS ONLY. It says whether the package of this repository may be released: four checks, in this order, none skipped (a failure never hides the next one):
//   npm-version-free  `npm view <name>@<version> version`: E404 = free; an answer with the version = already published; anything else = the check cannot tell, so it fails;
//   tree-clean        `git status --porcelain` is empty (the lines are counted);
//   tag-absent        `git tag --list <name>-v<version>` lists nothing (the LOCAL tags; the remote is not asked);
//   ci-green          `git rev-parse HEAD`, then `gh run list --commit <sha> ...`: at least one run, every run completed with `success` (skipped, cancelled, neutral and running all fail).
// The package is `packages/chicla/package.json` of the root (the single package, D148); its name and version must be plain (no scope, no leading dash) before any command runs.
// `git`, `gh` and `npm` run through ONE function, `run(cmd, args, { cwd })` -> { status, stdout, stderr }; `runTool` is the real one and the only place that starts a process; tests pass a fake, so no test can touch git, GitHub or the registry.
// Result: { ok, code?, root, name, version, tag, commit, checks: [{ id, ok, level: "pass" | "fail", detail, ... }] } (`npm-version-free` also has `published`: true, false, or null when npm could not say; `tree-clean` has `count`; `ci-green` has `runs`, `running`, `failing`). Codes: ENOROOT, ERELEASE_NOPACKAGE, ERELEASE_FAILED. Never throws.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const RUNID = /^[1-9][0-9]{0,19}$/;
const NAME = /^[a-z0-9][a-z0-9._-]*$/, VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/, SHA = /^[0-9a-f]{40}$/;

/** The real `run`: never throws (a missing tool is status null with the reason in stderr). */
export function runTool(cmd, args, { cwd, timeout } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: timeout ?? 60_000, maxBuffer: 16 * 1024 * 1024 });
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

// C32.2 (D167, D169) — `chicla release prepare --run <id> [--out <dir>]`: the CI tarball of a run into a NEW folder, checked, never published. Five checks, in this order; it STOPS at the first that fails (each needs the one before):
//   run-is-head    `git rev-parse HEAD`, `gh run view <id> --json headSha,status,conclusion`: the run is of HEAD, completed, success;
//   download       `gh run download <id> -n chicla-tarball -D <folder>`: the folder holds exactly `<name>-<version>.tgz` and `<name>-<version>.tgz.sha256`;
//   sha256         the sha256 computed here equals the one in the `.sha256` file (one `sha256sum` line that names this tarball);
//   tarball-smoke  `node <root>/scripts/smoke-test-tarball.mjs --tarball <file> --json` (installs it ALONE in an empty folder, offline, and drives it) exits 0;
//   notes          `notes-<name>-<version>.md` in the folder, with the CI's numbers (written only when the four before passed).
// The run id is plain digits (the real one, never `<42>`); the folder is `--out` or `<root>/dist-<version>` and must NOT exist (`gh run download` refuses an existing one); nothing is written outside it. It publishes nothing and tags nothing.
// Result: { ok, code?, message?, root, name, version, tag, commit, run, out, file, sha256, bytes, checks: [{ id, ok, level, detail }] }. Codes: ENOROOT, ERELEASE_NOPACKAGE, ERELEASE_RUN, ERELEASE_OUT_EXISTS, ERELEASE_FAILED. Never throws.
/** @param {{ root?: string, run?: typeof runTool, runId?: string, out?: string }} o */
export function releasePrepare({ root = ".", run = runTool, runId, out } = {}) {
  const res = { ok: false, root, name: null, version: null, tag: null, commit: null, run: null, out: null, file: null, sha256: null, bytes: null };
  const stop = (code, message) => ({ ...res, code, message });
  let isDir = false; try { isDir = statSync(root).isDirectory(); } catch { /* missing */ }
  if (!isDir) return stop("ENOROOT", "the project folder does not exist or is not a folder");
  let pkg; try { pkg = JSON.parse(readFileSync(join(root, "packages", "chicla", "package.json"), "utf8")); } catch { pkg = null; }
  if (!(typeof pkg?.name === "string" && typeof pkg?.version === "string" && NAME.test(pkg.name) && VERSION.test(pkg.version))) return stop("ERELEASE_NOPACKAGE", "packages/chicla/package.json is missing, or its name or version is not plain");
  const { name, version } = pkg, file = `${name}-${version}.tgz`;
  res.name = name; res.version = version; res.tag = `${name}-v${version}`;
  if (typeof runId !== "string" || !RUNID.test(runId)) return stop("ERELEASE_RUN", "the run id is digits only: the real one from `gh run list`, without angle brackets");
  res.run = runId; const dir = resolve(root, out ?? `dist-${version}`); res.out = dir;
  if (existsSync(dir)) return stop("ERELEASE_OUT_EXISTS", "the folder already exists: give a new one with --out (`gh run download` would refuse it, and nothing here overwrites)");

  const call = (cmd, args, timeout) => { // one call; whatever the function does, the answer has the three fields
    let r; try { r = run(cmd, args, { cwd: root, timeout }); } catch { r = null; }
    return { status: typeof r?.status === "number" ? r.status : null, stdout: typeof r?.stdout === "string" ? r.stdout : "", stderr: typeof r?.stderr === "string" ? r.stderr : "" };
  };
  const checks = [];
  const step = (id, ok, detail) => { checks.push({ id, ok, level: ok ? "pass" : "fail", detail }); return ok; };
  const failed = () => ({ ...res, code: "ERELEASE_FAILED", checks });

  const head = call("git", ["rev-parse", "HEAD"]), sha = head.stdout.trim();
  let view = null;
  if (head.status === 0 && SHA.test(sha)) {
    res.commit = sha;
    const g = call("gh", ["run", "view", runId, "--json", "headSha,status,conclusion"]);
    if (g.status === 0) { try { view = JSON.parse(g.stdout); } catch { view = null; } }
  }
  if (!step("run-is-head", view !== null && typeof view === "object" && view.headSha === res.commit && view.status === "completed" && view.conclusion === "success",
    res.commit === null ? "git could not name the commit (HEAD)" : view === null ? `gh could not read run ${runId}` : view.headSha !== res.commit ? `run ${runId} is not of HEAD ${res.commit.slice(0, 12)}` : `run ${runId} did not end in success (${view.status}, ${view.conclusion})`)) return failed();
  checks[0].detail = `run ${runId} is of ${res.commit.slice(0, 12)} and ended in success`;

  const dl = call("gh", ["run", "download", runId, "-n", "chicla-tarball", "-D", dir]);
  let names = []; try { names = readdirSync(dir).sort(); } catch { /* nothing downloaded */ }
  if (!step("download", dl.status === 0 && names.length === 2 && names[0] === file && names[1] === `${file}.sha256`, dl.status !== 0 ? `gh could not download the artifact of run ${runId} (exit ${dl.status ?? "none"})` : `the folder must hold exactly ${file} and ${file}.sha256, it holds ${names.length} file${names.length === 1 ? "" : "s"}`)) return failed();
  checks[1].detail = `${file} and its .sha256 are in the new folder`;

  let bytes = null, want = null;
  try {
    bytes = readFileSync(join(dir, file));
    const m = /^([0-9a-fA-F]{64}) [ *](\S+)\n?$/.exec(readFileSync(join(dir, `${file}.sha256`), "utf8"));
    if (m && m[2] === file) want = m[1].toLowerCase();
  } catch { /* unreadable */ }
  const got = bytes === null ? null : createHash("sha256").update(bytes).digest("hex");
  if (!step("sha256", want !== null && got === want, want === null ? `${file}.sha256 is not one sha256 line that names ${file}` : `the sha256 of ${file} is not the one in ${file}.sha256`)) return failed();
  res.file = file; res.sha256 = got; res.bytes = bytes.length; checks[2].detail = `sha256 ${got} matches ${file}.sha256 (${bytes.length} bytes)`;

  const sm = call("node", [join(root, "scripts", "smoke-test-tarball.mjs"), "--tarball", join(dir, file), "--json"], 600_000);
  if (!step("tarball-smoke", sm.status === 0, `the smoke test of the tarball exited ${sm.status ?? "none"}: it installs ${file} alone in an empty folder`)) return failed();
  checks[3].detail = `${file} installed alone in an empty folder and every smoke step passed`;

  const notes = [`## ${name} ${version}`, "", "| File | Size | sha256 |", "| --- | --- | --- |", `| \`${file}\` | ${bytes.length} bytes | \`${got}\` |`, "", `Tag \`${res.tag}\` · commit \`${res.commit}\` · CI run ${runId} (success)`, ""].join("\n");
  let wrote = true; try { writeFileSync(join(dir, `notes-${name}-${version}.md`), notes); } catch { wrote = false; }
  if (!step("notes", wrote, wrote ? `notes-${name}-${version}.md has the CI's size and sha256` : "the notes could not be written")) return failed();
  return { ...res, ok: true, checks };
}

/** @returns {{ out: string, err: string }} one line per check that ran: ✓ passed, ✗ failed */
export function renderReleasePrepare(r) {
  if (!r.checks) return { out: "", err: `✗ ${r.code}: ${r.message}\n` };
  const lines = r.checks.map((c) => `  ${c.ok ? "✓" : "✗"} ${c.id}: ${c.detail}\n`).join("");
  if (!r.ok) return { out: lines, err: `✗ ${r.code}: ${r.checks.find((c) => !c.ok)?.id} failed, the later checks did not run (${r.name} ${r.version}, run ${r.run})\n` };
  return { out: `✓ release prepare: ${r.checks.length} checks, none failed (${r.name} ${r.version}, run ${r.run})\n${lines}  folder: ${r.out}\n  ${r.file}: ${r.bytes} bytes, sha256 ${r.sha256}\n`, err: "" };
}
