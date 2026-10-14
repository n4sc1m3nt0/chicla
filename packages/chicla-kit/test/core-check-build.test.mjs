// C11.1, slice 5a (D84 (1), confirmed by Rodrigo) — the `check-build` core moves from scripts/ into packages/chicla-kit/src/check-build.mjs, and
// scripts/check-build.mjs becomes a THIN WRAPPER: it imports the core, re-exports it and, only as the entry point, prints and exits with the project root
// as `root`. The behaviour does not change (cli-make-delivery.test.mjs and the smoke tests keep pinning it); these tests pin WHERE the code lives.
// Every project here is a temp folder; the real tree is never touched.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CORE = 'packages/chicla-kit/src/check-build.mjs';
const WRAPPER = 'scripts/check-build.mjs';
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const T = mkdtempSync(join(tmpdir(), 'chicla-c111-5a-'));
after(() => rmSync(T, { recursive: true, force: true }));
let n = 0;
/** A project that mirrors the real layout: the wrapper and the core, plus one source file (valid or with a syntax error). */
const project = ({ broken = false, core = true } = {}) => {
  const p = join(T, `p${n++}`);
  mkdirSync(join(p, 'scripts'), { recursive: true }); mkdirSync(join(p, 'packages/chicla-kit/src'), { recursive: true });
  copyFileSync(join(ROOT, WRAPPER), join(p, WRAPPER));
  if (core) copyFileSync(join(ROOT, CORE), join(p, CORE));
  writeFileSync(join(p, 'a.mjs'), broken ? 'export const x = ;\n' : 'export const x = 1;\n');
  return p;
};
const code = (src) => src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));

test('the core is in the kit package: it exports checkBuild and renderCheckBuild and importing it runs nothing', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(join(ROOT, CORE)).href)}).then((m) => console.log(typeof m.checkBuild, typeof m.renderCheckBuild))`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), 'function function'); assert.equal(r.stderr, '');
});

test('the core stands alone: only `node:` imports, and no entry point of its own (it never prints or exits)', () => {
  const src = read(CORE);
  const specs = [...src.matchAll(/^import\s+(?:[^;]*?\bfrom\s+)?"([^"]+)"/gm)].map((m) => m[1]); // `import x from "y"` and the bare `import "y"` (D87 (2), round 123)
  assert.equal([...src.matchAll(/^import\b/gm)].length, specs.length, 'every import statement was read');
  assert.doesNotMatch(src, /\bimport\s*\(|\brequire\s*\(/, 'no dynamic import or require');
  assert.ok(specs.length > 0);
  for (const s of specs) assert.ok(s.startsWith('node:'), `import ${s}`);
  assert.doesNotMatch(src, /process\.(exit|exitCode|stdout|stderr|argv)/);
});

test('the script is a thin wrapper: it imports the core by its relative path, holds no logic, and re-exports the SAME functions', async () => {
  const src = read(WRAPPER);
  assert.match(src, /from "\.\.\/packages\/chicla-kit\/src\/check-build\.mjs"/);
  assert.doesNotMatch(src, /spawnSync|readdirSync|statSync/);
  assert.ok(code(src).length <= 15, `the wrapper has ${code(src).length} lines of code`);
  const [w, c] = [await imp(WRAPPER), await imp(CORE)];
  assert.equal(w.checkBuild, c.checkBuild); assert.equal(w.renderCheckBuild, c.renderCheckBuild);
});

test('the wrapper as a process: a clean project exits 0 and a broken one exits 1 naming the file; the output is the core\'s, whatever the cwd', async () => {
  const { checkBuild, renderCheckBuild } = await imp(CORE);
  for (const broken of [false, true]) {
    const p = project({ broken });
    const s = spawnSync(process.execPath, [join(p, WRAPPER)], { cwd: T, encoding: 'utf8' }); // cwd is NOT the project: the root comes from the file's place
    const { out, err } = renderCheckBuild(checkBuild({ root: p }));
    assert.equal(s.status, broken ? 1 : 0); assert.equal(s.stdout, out); assert.equal(s.stderr, err);
    if (broken) assert.match(s.stderr, /a\.mjs/);
  }
});

test('the wrapper without the core does not pass: a project that lost packages/chicla-kit/src/check-build.mjs fails loudly (exit not 0), never a silent ok', () => {
  const p = project({ core: false });
  const s = spawnSync(process.execPath, [join(p, WRAPPER)], { cwd: T, encoding: 'utf8' });
  assert.notEqual(s.status, 0); assert.doesNotMatch(s.stdout, /passed/);
});
