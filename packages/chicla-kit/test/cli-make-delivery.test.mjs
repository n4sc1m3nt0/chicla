// C11.1, slice 3b — `check-build` and `make-delivery` as cores (`checkBuild({ root })`, `makeDelivery({ out, against, allowRemoved, root })`: never print, exit
// or throw) and `chicla make-delivery <out.zip> [--against <zip>]... [--allow-removed <path>]... [--json] [--root <dir>]`. The delivery now runs its
// steps (manifest check, build check, manifest write, zip, verify) in-process, so it works on a project with no `scripts/` folder; the zip writer comes
// from this kit. Tests assert codes, steps, exit statuses and file names; the only text compared is the script's own output against the core's and the
// CLI's (parity). Every project here is a copy in a temp folder: the real tree is never touched.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { findPython } from './python-probe.mjs';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned } from '../../../test/toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI = join(ROOT, 'packages/chicla-kit/src/cli.mjs');
const PY = findPython(); // C14.7: no `sh`, see python-probe.mjs
const skip = !PY && 'no python3';
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const { checkBuild, renderCheckBuild } = await imp('scripts/check-build.mjs');
const { makeDelivery, renderMakeDelivery } = await imp('scripts/make-delivery-zip.mjs');
const { verifyDelivery } = await imp('scripts/verify-delivery-zip.mjs');
const { checkManifest } = await imp('scripts/check-manifest.mjs');
const { main } = await imp('packages/chicla-kit/src/cli.mjs');

const T = mkdtempSync(join(tmpdir(), 'chicla-c111d-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
/** A copy of this tree (the files FILES.manifest lists) in a temp folder: a full project, scripts included. */
const tree = () => {
  const proj = join(T, `tree${n++}`);
  // the manifest does not list itself, so it is copied apart (a project that has made a delivery before has both it and the baseline)
  const rels = [...parseManifest(readFileSync(join(ROOT, 'FILES.manifest'), 'utf8')).map((e) => e.path), 'FILES.manifest'];
  for (const rel of rels) {
    if (!existsSync(join(ROOT, rel))) continue;
    mkdirSync(dirname(join(proj, rel)), { recursive: true }); copyFileSync(join(ROOT, rel), join(proj, rel));
  }
  return proj;
};
/** A minimal project with NO scripts/ folder (what `--root` may point at): enough for a delivery to verify. */
const small = ({ broken = false } = {}) => {
  const proj = join(T, `small${n++}`); mkdirSync(proj, { recursive: true });
  const w = (f, t) => writeFileSync(join(proj, f), t);
  w('package.json', '{"name":"small","private":true,"version":"0.0.1"}\n'); w('CLAUDE.md', '# small\n'); w('README.md', 'readme\n'); w('a.mjs', broken ? 'export const = ;\n' : 'export const a = 1;\n');
  w('CHANGELOG.md', '<!-- CHANGELOG_FINGERPRINT: seq=1 file=CHICLA_PROJECT_STATUS-1.md app_sha256_12=000000000000 changelog_sha256_12=000000000000 -->\n# Changelog\n');
  w('CHICLA_PROJECT_STATUS-1.md', '# Status\n');
  checkManifest({ root: proj, write: true });
  return proj;
};
const run = async (args, cwd = T) => {
  let out = '', err = '';
  const status = await main(args, { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd });
  return { status, out, err };
};
/** An older upload: every file of `zip` plus `extra` empty-ish entries (made with Python, never by the code under test). */
const previous = (zip, out, extra) => {
  const code = 'import zipfile,sys,json\nzin=zipfile.ZipFile(sys.argv[1]);zout=zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED)\nfor i in zin.infolist(): zout.writestr(i.filename, zin.read(i.filename))\nfor n in json.loads(sys.argv[3]): zout.writestr(n, "x")\nzout.close()';
  const r = spawnSync(PY, ['-c', code, zip, out, JSON.stringify(extra)], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return out;
};

// ---- check-build ----

test('check-build core: a clean tree is ok with the file count; a syntax error is EBUILD_FAILED and names the file; nothing is thrown', () => {
  const ok = small(), bad = small({ broken: true });
  const a = checkBuild({ root: ok }); assert.equal(a.ok, true); assert.equal(a.code, null); assert.equal(a.files, 1); assert.match(renderCheckBuild(a).out, /node --check passed/);
  const b = checkBuild({ root: bad }); assert.equal(b.ok, false); assert.equal(b.code, 'EBUILD_FAILED'); assert.ok(b.bad.some((x) => x.startsWith('a.mjs')));
  assert.match(renderCheckBuild(b).err, /Delivery aborted/);
});

test('check-build core: parity: the script as a process and the core print the same, clean and broken', () => {
  for (const broken of [false, true]) {
    const p = small({ broken }); mkdirSync(join(p, 'scripts')); copyFileSync(join(ROOT, 'scripts/check-build.mjs'), join(p, 'scripts/check-build.mjs'));
    mkdirSync(join(p, 'packages/chicla-kit/src'), { recursive: true }); copyFileSync(join(ROOT, 'packages/chicla-kit/src/check-build.mjs'), join(p, 'packages/chicla-kit/src/check-build.mjs'));
    const s = spawnSync(process.execPath, [join(p, 'scripts/check-build.mjs')], { cwd: p, encoding: 'utf8' });
    const { out, err } = renderCheckBuild(checkBuild({ root: p }));
    assert.equal(s.status, broken ? 1 : 0); assert.equal(s.stdout, out); assert.equal(s.stderr, err);
  }
});

test('importing check-build and make-delivery-zip runs nothing (no output, no exit): the modules only export', () => {
  for (const [f, fn] of [['check-build.mjs', 'checkBuild'], ['make-delivery-zip.mjs', 'makeDelivery']]) {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(join(ROOT, 'scripts', f)).href)}).then((m) => console.log(typeof m.${fn}))`], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), 'function', f);
  }
});

// ---- the make-delivery core ----

test('core: a delivery is made in-process, passes the independent verifier, and prints every step in order', async () => {
  const proj = tree(), out = join(T, 'ok.zip');
  const r = await makeDelivery({ out, root: proj });
  assert.equal(r.ok, true, JSON.stringify(r.messages)); assert.equal(r.code, null); assert.equal(r.out, out); assert.ok(existsSync(out)); assert.ok(r.files > 100);
  assert.equal(verifyDelivery({ zip: out, root: proj }).ok, true);
  const text = renderMakeDelivery(r).out, at = (re) => text.search(re);
  assert.ok(at(/no file lost/) >= 0 && at(/no file lost/) < at(/node --check passed/) && at(/node --check passed/) < at(/FILES\.manifest written/) && at(/FILES\.manifest written/) < at(/zip ready to paste over/) && at(/zip ready to paste over/) < at(/delivery created and verified/));
});

test('core: usage: no output path, or one that looks like an option, is EDELIVERY_USAGE (nothing written)', async () => {
  for (const out of [undefined, '', '--against']) { const r = await makeDelivery({ out, root: tree() }); assert.equal(r.ok, false); assert.equal(r.code, 'EDELIVERY_USAGE'); assert.match(renderMakeDelivery(r).err, /usage:/); }
});

test('core: a lost file stops step 1 (EDELIVERY_STEP, step check-manifest.mjs, cause EMANIFEST_LOST); no zip is created and the tree is not rewritten', async () => {
  const proj = tree(), out = join(T, 'lost.zip'); rmSync(join(proj, 'LICENSE'));
  const manifest = readFileSync(join(proj, 'FILES.manifest'), 'utf8');
  const r = await makeDelivery({ out, root: proj });
  assert.equal(r.ok, false); assert.equal(r.code, 'EDELIVERY_STEP'); assert.equal(r.step, 'check-manifest.mjs'); assert.equal(r.cause, 'EMANIFEST_LOST');
  assert.ok(!existsSync(out)); assert.equal(readFileSync(join(proj, 'FILES.manifest'), 'utf8'), manifest); assert.match(renderMakeDelivery(r).err, /delivery aborted; no zip was created/);
});

test('core: a build break stops step 2 (step check-build.mjs, cause EBUILD_FAILED), before the manifest is rewritten', async () => {
  const proj = small({ broken: true }), out = join(T, 'broken.zip'), manifest = readFileSync(join(proj, 'FILES.manifest'), 'utf8');
  const r = await makeDelivery({ out, root: proj });
  assert.equal(r.ok, false); assert.equal(r.code, 'EDELIVERY_STEP'); assert.equal(r.step, 'check-build.mjs'); assert.equal(r.cause, 'EBUILD_FAILED');
  assert.ok(!existsSync(out)); assert.equal(readFileSync(join(proj, 'FILES.manifest'), 'utf8'), manifest);
});

test('core: --against: a lost file of the previous zip rejects the finished zip, which is DELETED (step verify-delivery-zip.mjs); --allow-removed releases it', { skip }, async () => {
  const proj = tree(), first = join(T, 'first.zip'), out = join(T, 'second.zip');
  assert.equal((await makeDelivery({ out: first, root: proj })).ok, true);
  const prev = previous(first, join(T, 'prev.zip'), ['old/gone.txt']);
  const bad = await makeDelivery({ out, against: [prev], root: proj });
  assert.equal(bad.ok, false); assert.equal(bad.code, 'EDELIVERY_STEP'); assert.equal(bad.step, 'verify-delivery-zip.mjs'); assert.equal(bad.cause, 'EVERIFY_FAILED');
  assert.ok(!existsSync(out), 'the rejected zip must not stay'); assert.match(renderMakeDelivery(bad).err, /old\/gone\.txt/); assert.match(renderMakeDelivery(bad).err, /the rejected zip was deleted/);
  const ok = await makeDelivery({ out, against: [prev], allowRemoved: ['old/gone.txt'], root: proj });
  assert.equal(ok.ok, true, JSON.stringify(ok.messages)); assert.ok(existsSync(out));
});

test('core: parity: the script as a process and the core print the same on the same project and the same output path', async () => {
  const proj = tree(), out = join(T, 'parity.zip');
  const s = spawnSync(process.execPath, [join(proj, 'scripts/make-delivery-zip.mjs'), out], { cwd: proj, encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(s.status, 0, s.stdout + s.stderr);
  const { out: o, err: e } = renderMakeDelivery(await makeDelivery({ out, root: proj }));
  assert.equal(s.stdout, o); assert.equal(s.stderr, e);
  const s2 = spawnSync(process.execPath, [join(proj, 'scripts/make-delivery-zip.mjs')], { cwd: proj, encoding: 'utf8' });
  assert.equal(s2.status, 2); assert.match(s2.stderr, /usage:/);
});

// ---- the CLI ----

test('cli: make-delivery works on a project with NO scripts/ folder (--root): the zip is made, verified, and carries the baseline', async () => {
  const proj = small(), out = join(T, 'small.zip');
  assert.ok(!existsSync(join(proj, 'scripts')));
  const r = await run(['make-delivery', out, '--root', proj]);
  assert.equal(r.status, 0, r.out + r.err); assert.match(r.out, /delivery created and verified/); assert.ok(existsSync(out));
  assert.equal(verifyDelivery({ zip: out, root: proj }).ok, true); assert.ok(existsSync(join(proj, 'FILES.baseline.json')));
});

test('cli: --json is ONE object on stdout (ok, code, out, files), the human text on stderr; a relative output path is resolved from the CLI cwd', async () => {
  const proj = small(), out = join(T, 'rel.zip');
  const r = await run(['make-delivery', 'rel.zip', '--json', '--root', proj], T); const o = JSON.parse(r.out);
  assert.equal(r.status, 0, r.err); assert.equal(o.command, 'make-delivery'); assert.equal(o.ok, true); assert.equal(o.code, null); assert.equal(o.out, out); assert.ok(o.files >= 5); assert.match(r.err, /delivery created and verified/); assert.equal(r.out.trim().split('\n').length, 1); assert.ok(existsSync(out));
});

test('cli: a failing step is exit 1 with EDELIVERY_STEP, the step and the cause in JSON, and no zip', async () => {
  const proj = small({ broken: true }), out = join(T, 'cli-broken.zip');
  const r = await run(['make-delivery', out, '--json', '--root', proj]); const o = JSON.parse(r.out);
  assert.equal(r.status, 1); assert.equal(o.ok, false); assert.equal(o.code, 'EDELIVERY_STEP'); assert.equal(o.step, 'check-build.mjs'); assert.equal(o.cause, 'EBUILD_FAILED'); assert.ok(!existsSync(out)); assert.match(r.err, /✗/);
});

test('cli: --against and --allow-removed (each may repeat) behave as in the script', { skip }, async () => {
  const proj = small(), first = join(T, 'cli-first.zip'), out = join(T, 'cli-second.zip');
  assert.equal((await run(['make-delivery', first, '--root', proj])).status, 0);
  const prev = previous(first, join(T, 'cli-prev.zip'), ['old/gone.txt', 'old/other.txt']);
  const bad = await run(['make-delivery', out, '--against', prev, '--root', proj]); assert.equal(bad.status, 1); assert.match(bad.err, /old\/gone\.txt/); assert.ok(!existsSync(out));
  const ok = await run(['make-delivery', out, '--against', prev, '--allow-removed', 'old/gone.txt', '--allow-removed', 'old/other.txt', '--root', proj]);
  assert.equal(ok.status, 0, ok.err); assert.ok(existsSync(out));
});

test('cli: parity: `chicla make-delivery` and the script print the same on the same project and output path', async () => {
  const proj = tree(), out = join(T, 'cli-parity.zip');
  const s = spawnSync(process.execPath, [join(proj, 'scripts/make-delivery-zip.mjs'), out], { cwd: proj, encoding: 'utf8', maxBuffer: 1 << 28 });
  const c = await run(['make-delivery', out, '--root', proj]);
  assert.equal(c.status, s.status); assert.equal(c.out, s.stdout); assert.equal(c.err, s.stderr);
});

test('cli: usage errors are exit 2 with EUSAGE: no output path, two paths, an option without its value, an unknown option', async () => {
  for (const a of [[], ['--json'], ['a.zip', 'b.zip'], ['a.zip', '--against'], ['a.zip', '--against', '--json'], ['a.zip', '--allow-removed'], ['a.zip', '--root'], ['a.zip', '--bogus'], ['a.zip', '--verify']]) {
    const r = await run(['make-delivery', ...a, '--json']); assert.equal(r.status, 2, a.join(' ')); assert.equal(JSON.parse(r.out).code, 'EUSAGE', a.join(' '));
  }
});

test('cli: --help lists make-delivery and no longer calls it unbuilt', async () => {
  const r = await run(['--help']); assert.equal(r.status, 0); assert.match(r.out, /make-delivery/);
  assert.doesNotMatch(r.out, /Not built yet:[^\n]*make-delivery/);
});
