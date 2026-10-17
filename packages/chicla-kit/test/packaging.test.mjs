// C13.5 (round 166): chicla-kit must be packable and must reach chicla-zip by its package name, with the monorepo path as the
// fallback for a bare checkout. Nothing is published (rule 4). Tests assert files, codes and specifiers, never message text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const NPM = process.platform === "win32" ? { shell: true } : {};

const kitDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = join(kitDir, "..", "..");
const zipDir = join(rootDir, "packages", "chicla-zip");
const pkg = JSON.parse(readFileSync(join(kitDir, "package.json"), "utf8"));
const read = (p) => readFileSync(join(kitDir, p), "utf8");

test("package.json: reaches chicla-zip by name, ships an allowlist, names its repository, is not private", () => {
  assert.deepEqual(pkg.dependencies, { "chicla-zip": "^0.1.0" });
  assert.deepEqual(pkg.files, ["src", "templates", "README.md", "LICENSE"]);
  assert.deepEqual(pkg.repository, { type: "git", url: "git+https://github.com/n4sc1m3nt0/chicla.git", directory: "packages/chicla-kit" });
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.license, "Apache-2.0");
});

test("the dependency range accepts the chicla-zip version that is in the tree", () => {
  const zip = JSON.parse(readFileSync(join(zipDir, "package.json"), "utf8")).version;
  const [maj, min] = pkg.dependencies["chicla-zip"].replace("^", "").split(".").map(Number);
  const [zmaj, zmin] = zip.split(".").map(Number);
  assert.ok(zmaj === maj && zmin >= min, `chicla-zip ${zip} does not satisfy ${pkg.dependencies["chicla-zip"]}`);
});

test("the LICENSE inside the kit is the root LICENSE", () => {
  assert.equal(read("LICENSE"), readFileSync(join(rootDir, "LICENSE"), "utf8"));
});

test("npm pack lists the shipped files and nothing of test/", () => {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: kitDir, encoding: "utf8", ...NPM });
  const files = JSON.parse(out)[0].files.map((f) => f.path);
  for (const f of ["LICENSE", "README.md", "package.json", "src/cli.mjs", "src/zipkit-loader.mjs", "src/pinned/recovery-report.mjs", "templates/CLAUDE.md", "templates/AGENTS.md"]) assert.ok(files.includes(f), `missing ${f}`);
  assert.ok(!files.some((f) => f.startsWith("test/")), "tests are in the tarball");
});

test("no source of the kit reaches chicla-zip by a relative path, except the loader (fallback) and the pinned recovery-report", () => {
  const offenders = [];
  const walk = (d) => { for (const e of readdirSync(join(kitDir, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.mjs$/.test(e.name) && /\.\.\/chicla-zip\/src\/zipkit\.mjs/.test(read(p))) offenders.push(p); } };
  walk("src");
  assert.deepEqual(offenders.sort(), ["src/pinned/recovery-report.mjs", "src/zipkit-loader.mjs"]);
});

test("make-delivery and emergency-dump load the writer through the loader", () => {
  for (const f of ["src/make-delivery.mjs", "src/emergency-dump.mjs"]) {
    assert.match(read(f), /zipkit-loader\.mjs/, f);
    assert.doesNotMatch(read(f), /import\(new URL\("\.\.\/\.\.\/chicla-zip/, f);
  }
});

const loader = await import(pathToFileURL(join(kitDir, "src", "zipkit-loader.mjs")).href).catch(() => ({}));
const notFound = (spec) => Object.assign(new Error(`Cannot find package '${spec}' imported from /x/y.mjs`), { code: "ERR_MODULE_NOT_FOUND" });

test("loader: the package name is tried first and its module is returned", async () => {
  const seen = [];
  const mod = await loader.loadZipkit(async (s) => { seen.push(s); return { writeZip: 1 }; });
  assert.deepEqual(seen, ["chicla-zip"]);
  assert.deepEqual(mod, { writeZip: 1 });
});

test("loader: a missing package falls back to the monorepo path, once", async () => {
  const seen = [];
  const mod = await loader.loadZipkit(async (s) => { seen.push(s); if (s === "chicla-zip") throw notFound("chicla-zip"); return { writeZip: 2 }; });
  assert.equal(seen.length, 2);
  assert.match(seen[1], /^file:.*\/packages\/chicla-zip\/src\/zipkit\.mjs$/);
  assert.deepEqual(mod, { writeZip: 2 });
});

test("loader: any other error is not swallowed (a broken chicla-zip must not be hidden by the fallback)", async () => {
  const fails = (err) => async (s) => { if (s === "chicla-zip") throw err; return { fallbackWasUsed: true }; }; // the fallback WOULD work: only a swallowed error shows
  const boom = Object.assign(new Error("syntax"), { code: "ERR_X" });
  await assert.rejects(loader.loadZipkit(fails(boom)), (e) => e === boom);
  const other = notFound("something-else"); // a module of chicla-zip that is missing, not the package
  await assert.rejects(loader.loadZipkit(fails(other)), (e) => e === other);
  const wrongCode = Object.assign(new Error("Cannot find package 'chicla-zip'"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" }); // names the package but is another failure
  await assert.rejects(loader.loadZipkit(fails(wrongCode)), (e) => e === wrongCode);
});

test("loader: when the fallback also fails, that error is the one reported", async () => {
  const last = Object.assign(new Error("gone"), { code: "ENOENT" });
  await assert.rejects(loader.loadZipkit(async (s) => { throw s === "chicla-zip" ? notFound("chicla-zip") : last; }), (e) => e === last);
});

test("installed from the two tarballs into a clean folder, the kit finds chicla-zip by name", { timeout: 120000 }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), "chicla-kit-install-"));
  try {
    const packTo = (cwd) => join(tmp, JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", tmp], { cwd, encoding: "utf8", ...NPM }))[0].filename);
    const zipTgz = packTo(zipDir), kitTgz = packTo(kitDir);
    const proj = join(tmp, "proj");
    execFileSync("node", ["-e", `require("fs").mkdirSync(${JSON.stringify(proj)})`]);
    writeFileSync(join(proj, "package.json"), JSON.stringify({ name: "probe", private: true, type: "module" }));
    execFileSync("npm", ["install", "--offline", "--no-audit", "--no-fund", "--ignore-scripts", zipTgz, kitTgz], { cwd: proj, encoding: "utf8", stdio: "pipe", ...NPM });
    assert.ok(existsSync(join(proj, "node_modules", "chicla-zip", "src", "zipkit.mjs")));
    writeFileSync(join(proj, "probe.mjs"), `import { loadZipkit } from "chicla-kit/src/zipkit-loader.mjs"; const m = await loadZipkit(); process.stdout.write(typeof m.writeZip + " " + typeof m.writeZipStream);`);
    assert.equal(execFileSync("node", ["probe.mjs"], { cwd: proj, encoding: "utf8" }), "function function");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
