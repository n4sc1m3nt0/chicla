// C11.1, slice 5d (D84; D87 confirmed by Rodrigo: «confirmo tudo. avança») — the `verify-delivery` core moves from scripts/ into
// packages/chicla-kit/src/verify-delivery.mjs and scripts/verify-delivery-zip.mjs becomes a THIN WRAPPER (re-exports the core; as the entry point it parses the flags,
// prints and exits with the project root as `root`). The core imports only `node:` modules and the three PINNED files (src/pinned/baseline.mjs, manifest.mjs, policy.mjs,
// by relative path: they stay where they are until the last slice). Behaviour is pinned by the older tests; these pin WHERE the code lives and that the wrapper passes
// its flags on. Every project is a temp folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned, pinnedSpec } from '../../../test/toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CORE = 'packages/chicla-kit/src/verify-delivery.mjs';
const WRAPPER = 'scripts/verify-delivery-zip.mjs';
const PINNED = ['baseline', 'manifest', 'policy'].map((n) => pinnedSpec(CORE, n));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const T = mkdtempSync(join(tmpdir(), 'chicla-c111-5d-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
/** A copy of the real project (every file the manifest lists). `core: false` leaves the core out; `extra` adds a file that the manifest will list. */
const project = ({ core = true, extra } = {}) => {
  const p = join(T, `p${n++}`);
  for (const { path: rel } of parseManifest(read('FILES.manifest'))) {
    if (!core && rel === CORE) continue;
    mkdirSync(dirname(join(p, rel)), { recursive: true });
    try { copyFileSync(join(ROOT, rel), join(p, rel)); } catch { /* listed but not on disk */ }
  }
  copyFileSync(join(ROOT, 'FILES.manifest'), join(p, 'FILES.manifest'));
  if (extra) { mkdirSync(dirname(join(p, extra)), { recursive: true }); writeFileSync(join(p, extra), 'x\n'); }
  return p;
};
const node = (p, cwd, script, ...a) => spawnSync(process.execPath, [join(p, script), ...a], { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
/** A delivery zip of the project `p`, built by its own make-delivery-zip (which uses the core in-process). */
const deliver = (p, name) => {
  const zip = join(T, name), r = node(p, p, 'scripts/make-delivery-zip.mjs', zip);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return zip;
};
const code = (src) => src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));

test('the core is in the kit package: it exports verifyDelivery and renderVerifyDelivery and importing it verifies nothing', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(join(ROOT, CORE)).href)}).then((m) => console.log(typeof m.verifyDelivery, typeof m.renderVerifyDelivery))`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), 'function function'); assert.equal(r.stderr, '');
});

test('the core imports only `node:` modules and the three pinned files (by relative path), and has no entry point (it never prints or exits, and does not know where it sits)', () => {
  const src = read(CORE);
  const specs = [...src.matchAll(/^import\s+(?:[^;]*?\bfrom\s+)?"([^"]+)"/gm)].map((m) => m[1]); // `import x from "y"` and the bare `import "y"`
  assert.ok(specs.length > 0);
  for (const s of specs) assert.ok(s.startsWith('node:') || PINNED.includes(s), `import ${s}`);
  for (const s of PINNED) assert.ok(specs.includes(s), `imports ${s}`);
  assert.equal([...src.matchAll(/^import\b/gm)].length, specs.length, 'every import statement was read');
  assert.doesNotMatch(src, /\bimport\s*\(|\brequire\s*\(/, 'no dynamic import or require');
  assert.doesNotMatch(src, /process\.(exit|exitCode|stdout|stderr|argv)/);
  assert.doesNotMatch(src, /import\.meta/);
});

test('the script is a thin wrapper: it imports the core by its relative path, holds no verification logic, and re-exports the SAME functions', async () => {
  const src = read(WRAPPER);
  assert.match(src, /from "\.\.\/packages\/chicla-kit\/src\/verify-delivery\.mjs"/);
  assert.doesNotMatch(src, /inflateRawSync|createHash|parseManifest|parseBaseline|loadPolicy|detectSecret|neverShip|readFileSync/);
  assert.ok(code(src).length <= 24, `the wrapper has ${code(src).length} lines of code`);
  const [w, c] = [await imp(WRAPPER), await imp(CORE)];
  assert.equal(w.verifyDelivery, c.verifyDelivery); assert.equal(w.renderVerifyDelivery, c.renderVerifyDelivery);
});

test('the wrapper as a process: no zip is a usage error (exit 2, stderr), a good delivery passes (exit 0) and prints what the core renders, whatever the cwd', async () => {
  const { verifyDelivery, renderVerifyDelivery } = await imp(CORE);
  const p = project(), zip = deliver(p, 'good.zip');
  const ok = node(p, T, WRAPPER, zip);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(ok.stdout, renderVerifyDelivery(verifyDelivery({ zip, root: p })).out);
  const usage = node(p, T, WRAPPER);
  assert.equal(usage.status, 2); assert.notEqual(usage.stderr, '', 'a refusal reaches stderr');
  const missing = node(p, T, WRAPPER, join(T, 'nope.zip'));
  assert.equal(missing.status, 1); assert.notEqual(missing.stderr, '');
});

test('the wrapper passes --against and --allow-removed on: a file the previous zip had is refused, unless it is allowed by name', () => {
  const p = project(), prevP = project({ extra: 'old/gone.txt' });
  const zip = deliver(p, 'cur.zip'), prev = deliver(prevP, 'prev.zip');
  const lost = node(p, T, WRAPPER, zip, '--against', prev);
  assert.equal(lost.status, 1); assert.match(lost.stdout + lost.stderr, /old\/gone\.txt/);
  const allowed = node(p, T, WRAPPER, zip, '--against', prev, '--allow-removed', 'old/gone.txt');
  assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);
  const other = node(p, T, WRAPPER, zip, '--against', prev, '--allow-removed', 'old/other.txt');
  assert.equal(other.status, 1, 'allowing another name releases nothing');
});

test('the wrapper\'s root is the project it sits in: that project\'s chicla.policy.json refuses a zip that carries a file it bans, whatever the cwd', () => {
  const p = project({ extra: 'secrets/a.txt' }), zip = deliver(p, 'withsecret.zip');
  assert.equal(node(p, T, WRAPPER, zip).status, 0, 'no policy file: the zip is fine');
  writeFileSync(join(p, 'chicla.policy.json'), JSON.stringify({ version: 1, paths: ['secrets'] }));
  const r = node(p, T, WRAPPER, zip);
  assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stdout + r.stderr, /secrets\/a\.txt/);
});

test('the wrapper without the core does not pass: a project that lost packages/chicla-kit/src/verify-delivery.mjs fails loudly, never a silent ok', () => {
  const p = project({ core: false });
  const s = node(p, T, WRAPPER, join(T, 'good.zip'));
  assert.notEqual(s.status, 0); assert.doesNotMatch(s.stdout, /zip ready to paste over/);
});
