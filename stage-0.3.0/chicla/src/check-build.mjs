// Build guard: a delivery does not go out if any .mjs file stopped passing `node --check`.
//
//   node scripts/check-build.mjs   (the wrapper: prints the result and exits 1 if a file failed, else 0)
//
// - Walks the tree (skipping node_modules, .git, __MACOSX) and runs `node --check` on every .mjs.
// - Exits 1 and names the files that failed; exits 0 if all pass.
// - Does not run the tests: `npm test` and `npm run smoke` remain a step of the round (and of CI).
// Replaces the `cargo check` of the original workflow: Node is always present (the scripts themselves run on it), so
// there is no path of "build NOT verified".
//
// C11.1 slice 5a (D84): this is the CORE, in the kit package; `scripts/check-build.mjs` is a thin wrapper that imports it and prints and exits as the entry point.
// C11.1 slice 3b: the work is `checkBuild({ root })`, which never prints, exits or throws (it still runs `node --check` as a child process per file:
// that is what the check IS); this file never prints or exits, so `make-delivery` and the kit CLI import and run
// the very same code. Importing this file runs nothing. It imports only `node:` modules, so it stands alone.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SKIP = new Set(["node_modules", ".git", "__MACOSX"]);

/**
 * Runs `node --check` on every .mjs of the project at `root`. Returns { ok, code, files, bad, messages }: `code` is null when ok, else EBUILD_FAILED (`bad` lists
 * «path: first error line») or EBUILD_ERROR (the tree could not be walked); `messages` is [{ stream: "out" | "err", text }] in the order the script prints them
 * (see `renderCheckBuild`). Never prints, exits or throws.
 */
export function checkBuild({ root } = {}) {
  const ROOT = resolve(root ?? ".");
  const messages = [];
  const say = (stream, text) => messages.push({ stream, text });
  const result = { ok: true, code: null, files: 0, bad: [], messages };
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink() || SKIP.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".mjs")) files.push(p);
    }
  };
  try { walk(ROOT); } catch (e) { say("err", `\n✗ EBUILD_ERROR: cannot walk the tree (${e.code ?? e.message})`); result.ok = false; result.code = "EBUILD_ERROR"; return result; }

  say("out", `node --check on ${files.length} .mjs files`);
  result.files = files.length;
  const bad = [];
  for (const f of files) {
    const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
    if (r.status !== 0) bad.push(`${relative(ROOT, f).split("\\").join("/")}: ${(r.stderr.split("\n").find((l) => /Error/.test(l)) ?? "").slice(0, 100)}`);
  }
  result.bad = bad;
  if (bad.length) { say("err", `\n✗ node --check failed on ${bad.length} file(s). Delivery aborted.\n  ${bad.join("\n  ")}`); result.ok = false; result.code = "EBUILD_FAILED"; return result; }
  say("out", "✓ node --check passed");
  return result;
}

/** The text the script prints for a result, per stream (one line per message, as console.log/console.error did). */
export function renderCheckBuild(result) {
  const text = (stream) => result.messages.filter((m) => m.stream === stream).map((m) => `${m.text}\n`).join("");
  return { out: text("out"), err: text("err") };
}
