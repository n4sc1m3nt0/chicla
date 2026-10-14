// C8.1 (round 76): make-delivery-zip writes the zip with chicla-zip's writeZip, not the external `zip`.
// Run in a copy of the project with a PATH that has node and `unzip` only, NO `zip`. (`unzip` stays because verify-delivery-zip
// still reads files with it until C8.2.) The finished zip is also read by Python, found by absolute path, never by the code that wrote it. Tests assert exit codes
// and file facts, not wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, chmodSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPinned } from './toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const which = (n) => spawnSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
const UNZIP = which('unzip'), PY = which('python3');

const project = (T, { skip = [] } = {}) => {
  const proj = join(T, 'proj');
  for (const { path: rel } of parseManifest(readFileSync(join(ROOT, 'FILES.manifest'), 'utf8'))) {
    if (!existsSync(join(ROOT, rel)) || skip.includes(rel)) continue;
    mkdirSync(dirname(join(proj, rel)), { recursive: true }); copyFileSync(join(ROOT, rel), join(proj, rel));
  }
  return proj;
};
const bareBin = (T) => { // a PATH with node and unzip, and no zip
  const b = join(T, 'bin'); mkdirSync(b);
  symlinkSync(process.execPath, join(b, 'node'));
  if (UNZIP) symlinkSync(UNZIP, join(b, 'unzip'));
  return b;
};
const make = (proj, bin, zip, ...more) => spawnSync(join(bin, 'node'), [join(proj, 'scripts/make-delivery-zip.mjs'), zip, ...more], { cwd: proj, encoding: 'utf8', env: { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR }, maxBuffer: 1 << 28 });

test('C8.1: the delivery is built with no `zip` on the PATH', () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c81-'));
  try {
    const proj = project(T), bin = bareBin(T), zip = join(T, 'd.zip');
    const r = make(proj, bin, zip);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(existsSync(zip));
    // independent readers
    if (UNZIP) assert.equal(spawnSync(UNZIP, ['-tq', zip]).status, 0, 'unzip -t');
    if (PY) {
      const names = spawnSync(PY, ['-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("\\n".join(z.namelist()))', zip], { encoding: 'utf8' });
      assert.equal(names.status, 0, names.stderr);
      const inZip = names.stdout.split('\n').filter(Boolean).sort();
      const listed = parseManifest(readFileSync(join(proj, 'FILES.manifest'), 'utf8')).map((e) => e.path);
      for (const p of [...listed, 'FILES.manifest', 'FILES.baseline.json']) assert.ok(inZip.includes(p), p);
      assert.equal(inZip.length, new Set([...listed, 'FILES.manifest', 'FILES.baseline.json']).size, 'exactly the manifest, nothing else');
    }
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C8.1: modes and dates of the files survive (an executable script stays executable)', () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c81-'));
  try {
    const proj = project(T), bin = bareBin(T), zip = join(T, 'd.zip');
    chmodSync(join(proj, 'scripts/bump-round.mjs'), 0o755);
    const when = new Date('2026-03-04T05:06:08'); utimesSync(join(proj, 'CLAUDE.md'), when, when);
    assert.equal(make(proj, bin, zip).status, 0);
    if (!PY) return;
    const out = spawnSync(PY, ['-c', 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({i.filename:[i.external_attr>>16,list(i.date_time)] for i in z.infolist()}))', zip], { encoding: 'utf8' });
    const info = JSON.parse(out.stdout);
    assert.equal(info['scripts/bump-round.mjs'][0] & 0o111, 0o111, 'execute bits kept');
    assert.equal(info['CLAUDE.md'][0] & 0o777, statSync(join(proj, 'CLAUDE.md')).mode & 0o777);
    assert.deepEqual(info['CLAUDE.md'][1], [2026, 3, 4, 5, 6, 8], 'mtime kept (local time)');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C8.1: if the chicla-zip module is missing, the delivery is refused (exit 1) and no zip is left', () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c81-'));
  try {
    const proj = project(T, { skip: ['packages/chicla-zip/src/zipkit.mjs'] }), bin = bareBin(T), zip = join(T, 'd.zip');
    const r = make(proj, bin, zip);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(existsSync(zip), false);
  } finally { rmSync(T, { recursive: true, force: true }); }
});
