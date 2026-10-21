// C11.1, slice 5c (D84 (1)) — the `bump-round` core moves from scripts/ into packages/chicla-kit/src/bump-round.mjs and scripts/bump-round.mjs becomes a
// THIN WRAPPER (re-exports the core; as the entry point it parses the flags, prints and exits with the project root as `root`). The core imports only `node:`
// modules; it still spawns `<root>/scripts/check-manifest.mjs --write` for the manifest step unless the caller passes `regenerateManifest` (which the kit CLI does).
// The toolchain pin does NOT move: bump-round is not one of the 5 pinned files. Behaviour is pinned by the older tests; these pin WHERE the code lives.
// Every project is a temp folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned } from '../../../test/toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CORE = 'packages/chicla-kit/src/bump-round.mjs';
const WRAPPER = 'scripts/bump-round.mjs';
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const T = mkdtempSync(join(tmpdir(), 'chicla-c111-5c-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
/** A copy of the real project (every file the manifest lists), so the fingerprints, the pin and the manifest step are the real ones. `core: false` leaves the core out. */
const project = ({ core = true } = {}) => {
  const p = join(T, `p${n++}`);
  for (const { path: rel } of parseManifest(read('FILES.manifest'))) {
    if (!core && rel === CORE) continue;
    mkdirSync(dirname(join(p, rel)), { recursive: true });
    try { copyFileSync(join(ROOT, rel), join(p, rel)); } catch { /* listed but not on disk */ }
  }
  copyFileSync(join(ROOT, 'FILES.manifest'), join(p, 'FILES.manifest'));
  return p;
};
const run = (p, cwd, ...a) => spawnSync(process.execPath, [join(p, WRAPPER), ...a], { cwd, encoding: 'utf8' });
const code = (src) => src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));

test('the core is in the kit package: it exports bumpRound and renderBumpRound and importing it runs nothing', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(join(ROOT, CORE)).href)}).then((m) => console.log(typeof m.bumpRound, typeof m.renderBumpRound))`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), 'function function'); assert.equal(r.stderr, '');
});

test('the core imports only `node:` modules and has no entry point (it never prints or exits, and does not read its own arguments)', () => {
  const src = read(CORE);
  const specs = [...src.matchAll(/^import\s+(?:[^;]*?\bfrom\s+)?"([^"]+)"/gm)].map((m) => m[1]); // `import x from "y"` and the bare `import "y"`
  assert.ok(specs.length > 0);
  for (const s of specs) assert.ok(s.startsWith('node:'), `import ${s}`);
  assert.equal([...src.matchAll(/^import\b/gm)].length, specs.length, 'every import statement was read');
  assert.doesNotMatch(src, /\bimport\s*\(|\brequire\s*\(/, 'no dynamic import or require');
  assert.doesNotMatch(src, /process\.(exit|exitCode|stdout|stderr|argv)/);
  assert.doesNotMatch(src, /import\.meta/, 'the core does not know where it sits: the root is always given');
});

test('the script is a thin wrapper: it imports the core by its relative path, holds no logic, and re-exports the SAME functions', async () => {
  const src = read(WRAPPER);
  assert.match(src, /from "\.\.\/packages\/chicla-kit\/src\/bump-round\.mjs"/);
  assert.doesNotMatch(src, /createHash|readFileSync|writeFileSync|renameSync|readdirSync|spawnSync|STATUS_FILE_FINGERPRINT|TOOLCHAIN/);
  assert.ok(code(src).length <= 24, `the wrapper has ${code(src).length} lines of code`);
  const [w, c] = [await imp(WRAPPER), await imp(CORE)];
  assert.equal(w.bumpRound, c.bumpRound); assert.equal(w.renderBumpRound, c.renderBumpRound);
});

test('the wrapper as a process: --verify prints what the core renders and exits 0; the root is the file\'s place, whatever the cwd', async () => {
  const { bumpRound, renderBumpRound } = await imp(CORE);
  const p = project();
  const v = run(p, T, '--verify');
  assert.equal(v.status, 0, v.stderr + v.stdout);
  assert.equal(v.stdout, renderBumpRound(bumpRound({ root: p, mode: 'verify' })).out);
  assert.match(v.stdout, /bump-round --verify/);
});

test('the wrapper passes its flags on: --dry-run writes nothing, --refresh --note keeps the number and writes the note, a stale pin or fingerprint exits 1', () => {
  const p = project();
  const before = readFileSync(join(p, 'version.mjs'), 'utf8');
  const d = run(p, T, '--dry-run', '--note', 'dry note');
  assert.equal(d.status, 0, d.stderr); assert.match(d.stdout, /dry-run: nothing was written/);
  assert.equal(readFileSync(join(p, 'version.mjs'), 'utf8'), before);
  const statusOf = (d) => readdirSync(d).filter((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f));
  const names = statusOf(p); assert.equal(names.length, 1);
  const r = run(p, T, '--refresh', '--note', 'five-c note');
  assert.equal(r.status, 0, r.stderr + r.stdout); assert.match(r.stdout, /round closed mechanically/);
  assert.deepEqual(statusOf(p), names, '--refresh keeps the number');
  assert.match(readFileSync(join(p, 'version.mjs'), 'utf8').split('\n')[2], /five-c note/);
  writeFileSync(join(p, 'CHANGELOG.md'), readFileSync(join(p, 'CHANGELOG.md'), 'utf8') + '\nedited\n');
  const bad = run(p, T, '--verify');
  assert.equal(bad.status, 1); assert.match(bad.stdout, /✗/);
  rmSync(join(p, names[0]));
  const lost = run(p, T, '--verify');
  assert.equal(lost.status, 1); assert.notEqual(lost.stderr, '', 'a refusal reaches stderr');
});

test('the wrapper without the core does not pass: a project that lost packages/chicla-kit/src/bump-round.mjs fails loudly, never a silent ok', () => {
  const p = project({ core: false });
  const s = run(p, T, '--verify');
  assert.notEqual(s.status, 0); assert.doesNotMatch(s.stdout, /✓ app: seq/);
});
