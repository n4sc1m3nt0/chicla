// C11.1, slice 5f (D84; D89 confirmed by Rodrigo, round 125: «next») — the `emergency-dump` core moves from scripts/ into
// packages/chicla-kit/src/emergency-dump.mjs and scripts/emergency-dump.mjs becomes a THIN WRAPPER (re-exports the core; as the entry point it parses the flags, prints
// and exits). The file is not one of the five pinned RECOVER files, but the core keeps the old promise: it imports NOTHING outside the pinned ones (src/pinned/manifest.mjs
// statically; src/pinned/policy.mjs, guarded, and packages/chicla-zip/src/zipkit.mjs dynamically), and it still hashes the five pinned files into the marker. The dump
// must keep working with a broken policy or zip writer (older tests); these pin WHERE the code lives and that the wrapper passes its flags on. Every project is a temp folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readZipFile } from '../../chicla-zip/src/zipkit.mjs';
import { TOOLCHAIN_SOURCES, ZIPKIT, pinnedSpec, specFrom } from '../../../test/toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CORE = 'packages/chicla-kit/src/emergency-dump.mjs';
const WRAPPER = 'scripts/emergency-dump.mjs';
const TOOL = [WRAPPER, CORE, ...Object.values(TOOLCHAIN_SOURCES)];
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const T = mkdtempSync(join(tmpdir(), 'chicla-c111-5f-'));
after(() => rmSync(T, { recursive: true, force: true }));
let n = 0;
/** A copy of the tool (only what a dump needs, `core: false` leaves the core out) and a small work folder with a project in it. */
const setup = ({ core = true } = {}) => {
  const d = join(T, `d${n++}`), tool = join(d, 'tool'), work = join(d, 'work'), outdir = join(d, 'out');
  for (const f of TOOL) { if (f === CORE && !core) continue; if (!existsSync(join(ROOT, f))) continue; mkdirSync(dirname(join(tool, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(tool, f)); }
  mkdirSync(join(work, 'proj'), { recursive: true }); mkdirSync(outdir);
  writeFileSync(join(work, 'proj/package.json'), '{"version":"0.0.1"}\n'); writeFileSync(join(work, 'proj/FILES.manifest'), 'a.txt\n'); writeFileSync(join(work, 'proj/a.txt'), 'a\n');
  writeFileSync(join(work, 'scratch.txt'), 's\n');
  return { tool, work, outdir };
};
const run = (s, cwd, ...a) => spawnSync(process.execPath, [join(s.tool, WRAPPER), '--work', s.work, '--outdir', s.outdir, '--no-outputs', ...a], { cwd, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 100000 });
const zips = (s) => readdirSync(s.outdir).filter((f) => f.endsWith('.zip'));
const code = (src) => src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));

test('the core is in the kit package: it exports emergencyDump and renderEmergencyDump and importing it dumps nothing', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(join(ROOT, CORE)).href)}).then((m) => console.log(typeof m.emergencyDump, typeof m.renderEmergencyDump))`], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), 'function function'); assert.equal(r.stderr, '');
});

test('the core imports nothing outside the pinned files: `node:` modules and the manifest library statically, the policy library and the zip writer dynamically; no entry point', () => {
  const src = read(CORE);
  const specs = [...src.matchAll(/^import\s+(?:[^;]*?\bfrom\s+)?"([^"]+)"/gm)].map((m) => m[1]);
  for (const s of specs) assert.ok(s.startsWith('node:') || s === pinnedSpec(CORE, 'manifest'), `import ${s}`);
  assert.ok(specs.includes(pinnedSpec(CORE, 'manifest')));
  assert.equal([...src.matchAll(/^import\b/gm)].length, specs.length, 'every import statement was read');
  assert.doesNotMatch(src, /\brequire\s*\(/);
  const dyn = [...src.matchAll(/\bimport\s*\(\s*new URL\(\s*"([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(dyn, [pinnedSpec(CORE, 'policy'), specFrom(CORE, ZIPKIT)].sort(), 'the only dynamic imports are the policy (guarded) and the zip writer');
  assert.equal([...src.matchAll(/\bimport\s*\(/g)].length, 2);
  assert.doesNotMatch(src, /process\.(exit|exitCode|stdout|stderr|argv)/);
  assert.doesNotMatch(src, /\.\/(check-manifest|check-build|verify-delivery|make-delivery|bump-round|cli)\.mjs/, 'it does not lean on its siblings: the dump must work when they are broken');
});

test('the script is a thin wrapper: it imports the core by its relative path, holds no dump logic, and re-exports the SAME functions', async () => {
  const src = read(WRAPPER);
  assert.match(src, /from "\.\.\/packages\/chicla-kit\/src\/emergency-dump\.mjs"/);
  assert.doesNotMatch(code(src).join('\n'), /createHash|spawnSync|writeZipStream|parseManifest|readFileSync|readdirSync|detectSecret/, 'no dump logic in the code (the header comments may talk about it)');
  assert.ok(code(src).length <= 24, `the wrapper has ${code(src).length} lines of code`);
  const [w, c] = [await imp(WRAPPER), await imp(CORE)];
  assert.equal(w.emergencyDump, c.emergencyDump); assert.equal(w.renderEmergencyDump, c.renderEmergencyDump);
});

test('the wrapper as a process: a dump is created (exit 0, the path on stdout), whatever the cwd, and the marker carries the note and the hashes of the five pinned files', () => {
  const s = setup(), r = run(s, T, 'half', 'done,', 'a', 'b');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(zips(s).length, 1);
  const zip = join(s.outdir, zips(s)[0]);
  assert.ok(r.stdout.includes(zip), r.stdout);
  const marker = JSON.parse(readZipFile(zip, 'RECOVERY_MARKER.json').toString('utf8'));
  assert.equal(marker.note, 'half done, a b', 'the words become one note');
  assert.deepEqual(Object.keys(marker.toolchain).sort(), ['RECOVER/baseline.mjs', 'RECOVER/manifest.mjs', 'RECOVER/policy.mjs', 'RECOVER/recovery-report.mjs', 'RECOVER/zipkit.mjs']);
  assert.equal(marker.projectOnly, false);
});

test('the wrapper passes its flags on: --project-only with no project root makes no dump (exit 1), --work and --outdir are honoured, --no-outputs is accepted', () => {
  const s = setup();
  rmSync(join(s.work, 'proj'), { recursive: true });
  const none = run(s, T, '--project-only');
  assert.equal(none.status, 1, none.stdout + none.stderr); assert.equal(zips(s).length, 0, 'no dump');
  const s2 = setup(), ok = run(s2, T, '--project-only', 'x');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr); assert.equal(zips(s2).length, 1);
  assert.equal(JSON.parse(readZipFile(join(s2.outdir, zips(s2)[0]), 'RECOVERY_MARKER.json').toString('utf8')).projectOnly, true);
});

test('the wrapper without the core does not pass: a tool that lost packages/chicla-kit/src/emergency-dump.mjs fails loudly and makes no dump', () => {
  const s = setup({ core: false }), r = run(s, T, 'x');
  assert.notEqual(r.status, 0); assert.equal(zips(s).length, 0);
});
