// C5.5 slice a (round 74): chicla-zip must be packable. The tarball is built with `npm pack`, installed into a
// clean folder and used from there; nothing is published (rule 4). Tests assert files and exit codes, not wording.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const NPM = process.platform === "win32" ? { shell: true } : {}; // npm is npm.cmd on Windows (round 145)

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = join(pkgDir, "..", "..");
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

const pack = () => {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: pkgDir, encoding: "utf8", ...NPM });
  return Object.values(JSON.parse(out))[0].files.map((f) => f.path).sort();
};

test("package.json: entry points and allowlist are declared", () => {
  assert.equal(pkg.main, "src/zipkit.mjs");
  assert.deepEqual(pkg.exports, { ".": "./src/zipkit.mjs", "./package.json": "./package.json" });
  assert.deepEqual(pkg.bin, { "chicla-zip": "src/zipkit.mjs" });
  assert.ok(Array.isArray(pkg.files) && pkg.files.length > 0);
  assert.equal(pkg.version, "0.1.0", "the release version of chicla-zip (round 163, G-C6 prepared; Rodrigo publishes)");
  assert.equal(pkg.private, undefined);
});

test("npm pack lists exactly the shipped files (no tests, bench, mutants)", () => {
  const files = pack();
  assert.deepEqual(files, ["LICENSE", "README.md", "package.json", "src/zipkit.mjs"]);
});

test("the LICENSE inside the package is the root LICENSE", () => {
  assert.equal(readFileSync(join(pkgDir, "LICENSE"), "utf8"), readFileSync(join(rootDir, "LICENSE"), "utf8"));
});

test("README exists and names the install, the API entry points and the CLI", () => {
  const r = readFileSync(join(pkgDir, "README.md"), "utf8");
  for (const word of ["openZip", "extractZip", "writeZip", "createZip", "chicla-zip", "Apache-2.0"]) assert.ok(r.includes(word), word);
});

test("a packed tarball installs in a clean folder: import works and the bin runs", () => {
  const tmp = mkdtempSync(join(tmpdir(), "chicla-pack-"));
  try {
    const name = execFileSync("npm", ["pack", "--ignore-scripts", "--pack-destination", tmp, "--json"], { cwd: pkgDir, encoding: "utf8", ...NPM });
    const tgz = join(tmp, Object.values(JSON.parse(name))[0].filename);
    assert.ok(existsSync(tgz));
    const proj = join(tmp, "proj");
    execFileSync("mkdir", [proj]);
    writeFileSync(join(proj, "package.json"), '{"name":"t","version":"1.0.0","type":"module"}');
    execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tgz], { cwd: proj, stdio: "pipe", ...NPM });
    const exportsSeen = execFileSync(process.execPath, ["-e",
      'import("chicla-zip").then(m=>console.log(["openZip","extractZip","writeZip","writeZipStream","createZip","testZip","markUtf8Names","runCli"].filter(k=>typeof m[k]==="function").join(",")))'],
      { cwd: proj, encoding: "utf8" }).trim();
    assert.equal(exportsSeen, "openZip,extractZip,writeZip,writeZipStream,createZip,testZip,markUtf8Names,runCli");
    const bin = join(proj, "node_modules", ".bin", process.platform === "win32" ? "chicla-zip.cmd" : "chicla-zip");
    assert.ok(existsSync(bin));
    execFileSync(bin, ["--help"], { cwd: proj, stdio: "pipe", ...NPM }); // exit 0 (C4.4)
    // and the installed CLI really works on a zip made by the installed library
    writeFileSync(join(proj, "t.mjs"), 'import {writeZip} from "chicla-zip"; await writeZip("a.zip",[{name:"café.txt",data:Buffer.from("hi")}]);');
    execFileSync(process.execPath, ["t.mjs"], { cwd: proj });
    execFileSync("unzip", ["-tq", "a.zip"], { cwd: proj, stdio: "pipe" }); // independent reader
    const ls = JSON.parse(execFileSync(bin, ["ls", "a.zip", "--json"], { cwd: proj, encoding: "utf8", ...NPM }));
    assert.equal(ls.ok, true);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
