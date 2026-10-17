// C11.1, slice 5e (D84; D88 confirmed by Rodrigo, round 124) — the `make-delivery` core moves from scripts/ into
// packages/chicla-kit/src/make-delivery.mjs and scripts/make-delivery-zip.mjs becomes a THIN WRAPPER (re-exports the core; as the entry point it parses the flags,
// prints and exits with the project root as `root`). The core imports only `node:` modules, the two PINNED files (src/pinned/baseline.mjs and manifest.mjs, by relative
// path: they stay where they are until the last slice) and its three siblings in src/ (check-manifest, check-build, verify-delivery) DIRECTLY, never through the script
// wrappers. It loads the zip writer from packages/chicla-zip next to itself. Behaviour is pinned by the older tests; these pin WHERE the code lives and that the wrapper
// passes its flags on. Every project is a temp folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned, pinnedSpec } from '../../../test/toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CORE = 'packages/chicla-kit/src/make-delivery.mjs';
const WRAPPER = 'scripts/make-delivery-zip.mjs';
const IMPORTS_OK = [pinnedSpec(CORE, 'baseline'), pinnedSpec(CORE, 'manifest'), './check-manifest.mjs', './check-build.mjs', './verify-delivery.mjs', './zipkit-loader.mjs'];
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const T = mkdtempSync(join(tmpdir(), 'chicla-c111-5e-'));
after(() => rmSync(T, { recursive: true, force: true }));
let n = 0;
/** A copy of the real project (every file the manifest lists, plus the core, which the manifest only lists once it is regenerated). `core: false` leaves the core out; `extra` adds a file. */
const project = ({ core = true, extra } = {}) => {
  const p = join(T, `p${n++}`);
  for (const { path: rel } of parseManifest(read('FILES.manifest'))) {
    if (rel === CORE) continue;
    mkdirSync(dirname(join(p, rel)), { recursive: true });
    try { copyFileSync(join(ROOT, rel), join(p, rel)); } catch { /* listed but not on disk */ }
  }
  copyFileSync(join(ROOT, 'FILES.manifest'), join(p, 'FILES.manifest'));
  if (core && existsSync(join(ROOT, CORE))) { mkdirSync(dirname(join(p, CORE)), { recursive: true }); copyFileSync(join(ROOT, CORE), join(p, CORE)); }
  if (extra) { mkdirSync(dirname(join(p, extra)), { recursive: true }); writeFileSync(join(p, extra), 'x\n'); }
  return p;
};
const node = (p, cwd, script, ...a) => spawnSync(process.execPath, [join(p, script), ...a], { cwd, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 100000 });
const code = (src) => src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));

test('the core is in the kit package: it exports makeDelivery and renderMakeDelivery and importing it builds nothing', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(join(ROOT, CORE)).href)}).then((m) => console.log(typeof m.makeDelivery, typeof m.renderMakeDelivery))`], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), 'function function'); assert.equal(r.stderr, '');
});

test('the core imports only `node:` modules, the two pinned files and its three siblings in src/ (never the script wrappers), and has no entry point (it never prints or exits)', () => {
  const src = read(CORE);
  const specs = [...src.matchAll(/^import\s+(?:[^;]*?\bfrom\s+)?"([^"]+)"/gm)].map((m) => m[1]);
  assert.ok(specs.length > 0);
  for (const s of specs) assert.ok(s.startsWith('node:') || IMPORTS_OK.includes(s), `import ${s}`);
  for (const s of IMPORTS_OK) assert.ok(specs.includes(s), `imports ${s}`);
  assert.equal([...src.matchAll(/^import\b/gm)].length, specs.length, 'every import statement was read');
  assert.doesNotMatch(src, /\brequire\s*\(/);
  assert.deepEqual([...src.matchAll(/\bimport\s*\(\s*new URL\(\s*"([^"]+)"/g)].map((m) => m[1]), [], 'no dynamic import by path: the zip writer comes through the loader (C13.5)');
  assert.equal([...src.matchAll(/\bimport\s*\(/g)].length, 0);
  assert.match(src, /await loadZipkit\(\)/);
  assert.doesNotMatch(src, /process\.(exit|exitCode|stdout|stderr|argv)/);
  assert.doesNotMatch(src, /scripts\/(check-manifest|check-build|verify-delivery-zip)/);
});

test('the script is a thin wrapper: it imports the core by its relative path, holds no delivery logic, and re-exports the SAME functions', async () => {
  const src = read(WRAPPER);
  assert.match(src, /from "\.\.\/packages\/chicla-kit\/src\/make-delivery\.mjs"/);
  assert.doesNotMatch(src, /writeZip|buildBaseline|parseManifest|checkManifest|checkBuild|verifyDelivery|readFileSync|rmSync/);
  assert.ok(code(src).length <= 24, `the wrapper has ${code(src).length} lines of code`);
  const [w, c] = [await imp(WRAPPER), await imp(CORE)];
  assert.equal(w.makeDelivery, c.makeDelivery); assert.equal(w.renderMakeDelivery, c.renderMakeDelivery);
});

test('the wrapper as a process: no output path is a usage error (exit 2, stderr), a good delivery exits 0, prints the final line and writes the zip, whatever the cwd', () => {
  const p = project(), zip = join(T, 'good.zip');
  const ok = node(p, T, WRAPPER, zip);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.ok(existsSync(zip));
  assert.ok(ok.stdout.trimEnd().endsWith(`✓ delivery created and verified: ${zip}`), ok.stdout);
  const usage = node(p, T, WRAPPER);
  assert.equal(usage.status, 2); assert.notEqual(usage.stderr, '', 'a refusal reaches stderr'); assert.equal(usage.stdout, '');
});

test('the wrapper passes --against and --allow-removed on: a file the previous zip had is refused, unless it is allowed by name', () => {
  const p = project(), prevP = project({ extra: 'old/gone.txt' });
  const prev = join(T, 'prev.zip'); assert.equal(node(prevP, prevP, WRAPPER, prev).status, 0);
  const lost = node(p, T, WRAPPER, join(T, 'cur.zip'), '--against', prev);
  assert.equal(lost.status, 1); assert.match(lost.stdout + lost.stderr, /old\/gone\.txt/);
  assert.equal(existsSync(join(T, 'cur.zip')), false, 'a refused delivery leaves no zip');
  const allowed = node(p, T, WRAPPER, join(T, 'cur2.zip'), '--against', prev, '--allow-removed', 'old/gone.txt');
  assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);
  const other = node(p, T, WRAPPER, join(T, 'cur3.zip'), '--against', prev, '--allow-removed', 'old/other.txt');
  assert.equal(other.status, 1, 'allowing another name releases nothing');
});

test('the wrapper\'s root is the project it sits in: it builds THAT project\'s zip and reads that project\'s chicla.policy.json (a file it now bans counts as lost: refused, no zip), whatever the cwd', () => {
  const p = project({ extra: 'secrets/a.txt' }), plain = join(T, 'plain.zip'), banned = join(T, 'banned.zip');
  assert.equal(node(p, T, WRAPPER, plain).status, 0);
  assert.match(readFileSync(join(p, 'FILES.manifest'), 'utf8'), /secrets\/a\.txt/, 'without a policy the file is listed');
  writeFileSync(join(p, 'chicla.policy.json'), JSON.stringify({ version: 1, paths: ['secrets'] }));
  const r = node(p, T, WRAPPER, banned);
  assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stdout + r.stderr, /secrets\/a\.txt/);
  assert.equal(existsSync(banned), false, 'the policy of THIS project refused the delivery: no zip');
});

test('the wrapper without the core does not pass: a project that lost packages/chicla-kit/src/make-delivery.mjs fails loudly and builds no zip', () => {
  const p = project({ core: false }), zip = join(T, 'nocore.zip');
  const s = node(p, T, WRAPPER, zip);
  assert.notEqual(s.status, 0); assert.equal(existsSync(zip), false);
});
