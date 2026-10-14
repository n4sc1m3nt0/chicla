// C11.1, slice 5b (D84 (1); D86 confirmed by Rodrigo: «d85 d86 sim. avança») — the `check-manifest` core moves from scripts/ into
// packages/chicla-kit/src/check-manifest.mjs and scripts/check-manifest.mjs becomes a THIN WRAPPER (re-exports the core; as the entry point it prints and
// exits with the project root as `root`). The core still reads the two PINNED files, src/pinned/manifest.mjs and src/pinned/policy.mjs, by relative path: they
// stay where they are until the last slice. Behaviour is pinned by the older tests; these pin WHERE the code lives. Every project is a temp folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHECK_MANIFEST_COPY, copyFiles, pinnedSpec } from '../../../test/toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CORE = 'packages/chicla-kit/src/check-manifest.mjs';
const WRAPPER = 'scripts/check-manifest.mjs';
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const T = mkdtempSync(join(tmpdir(), 'chicla-c111-5b-'));
after(() => rmSync(T, { recursive: true, force: true }));
let n = 0;
/** A project that mirrors the real layout: wrapper, core and the two pinned files, plus a file to list. */
const project = ({ core = true } = {}) => {
  const p = join(T, `p${n++}`);
  copyFiles(ROOT, p, CHECK_MANIFEST_COPY, { omit: core ? [] : [CORE] });
  writeFileSync(join(p, 'a.txt'), 'a\n');
  return p;
};
const run = (p, cwd, ...a) => spawnSync(process.execPath, [join(p, WRAPPER), ...a], { cwd, encoding: 'utf8' });
const code = (src) => src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));

test('the core is in the kit package: it exports checkManifest and renderCheckManifest and importing it checks nothing', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(join(ROOT, CORE)).href)}).then((m) => console.log(typeof m.checkManifest, typeof m.renderCheckManifest))`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), 'function function'); assert.equal(r.stderr, '');
});

test('the core imports only `node:` modules and the two pinned files (by relative path), and has no entry point (it never prints or exits)', () => {
  const src = read(CORE);
  const specs = [...src.matchAll(/^import\s+(?:[^;]*?\bfrom\s+)?"([^"]+)"/gm)].map((m) => m[1]); // `import x from "y"` and the bare `import "y"` (D87 (2), round 123)
  assert.equal([...src.matchAll(/^import\b/gm)].length, specs.length, 'every import statement was read');
  assert.doesNotMatch(src, /\bimport\s*\(|\brequire\s*\(/, 'no dynamic import or require');
  assert.ok(specs.length > 0);
  for (const s of specs) assert.ok(s.startsWith('node:') || s === pinnedSpec(CORE, 'manifest') || s === pinnedSpec(CORE, 'policy'), `import ${s}`);
  assert.ok(specs.includes(pinnedSpec(CORE, 'manifest')) && specs.includes(pinnedSpec(CORE, 'policy')));
  assert.doesNotMatch(src, /process\.(exit|exitCode|stdout|stderr|argv)/);
});

test('the script is a thin wrapper: it imports the core by its relative path, holds no logic, and re-exports the SAME functions', async () => {
  const src = read(WRAPPER);
  assert.match(src, /from "\.\.\/packages\/chicla-kit\/src\/check-manifest\.mjs"/);
  assert.doesNotMatch(src, /readdirSync|statSync|writeFileSync|parseManifest|loadPolicy/);
  assert.ok(code(src).length <= 16, `the wrapper has ${code(src).length} lines of code`);
  const [w, c] = [await imp(WRAPPER), await imp(CORE)];
  assert.equal(w.checkManifest, c.checkManifest); assert.equal(w.renderCheckManifest, c.renderCheckManifest);
});

test('the wrapper as a process: --write lists the project, a check passes, a lost file exits 1 naming it; the root is the file\'s place, whatever the cwd', async () => {
  const { checkManifest, renderCheckManifest } = await imp(CORE);
  const p = project();
  const w = run(p, T, '--write');
  assert.equal(w.status, 0); assert.match(readFileSync(join(p, 'FILES.manifest'), 'utf8'), /^a\.txt\t/m);
  assert.equal(w.stdout, renderCheckManifest(checkManifest({ root: p, write: true })).out);
  assert.equal(run(p, T).status, 0);
  rmSync(join(p, 'a.txt'));
  const bad = run(p, T);
  assert.equal(bad.status, 1); assert.match(bad.stderr, /a\.txt/);
  assert.equal(bad.stderr, renderCheckManifest(checkManifest({ root: p })).err);
});

test('the wrapper without the core does not pass: a project that lost packages/chicla-kit/src/check-manifest.mjs fails loudly, never a silent ok', () => {
  const p = project({ core: false });
  const s = run(p, T, '--write');
  assert.notEqual(s.status, 0); assert.doesNotMatch(s.stdout, /written/);
});
