// C9.3 (round 81): names that differ only in NFC/NFD are reported at the TOP of the dump's report, on the console and in the marker, and the dump still comes out.
// Python reads the zip. Tests assert exit codes, the marker data and where things sit in the report, not wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const which = (n) => spawnSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
const PY = which('python3');
const NFC = 'docs/café.txt', NFD = NFC.normalize('NFD');

const run = (T, files) => {
  const work = join(T, 'work'), proj = join(work, 'chicla');
  for (const [rel, text] of Object.entries({ 'package.json': '{"version":"0.0.1"}\n', 'CHANGELOG.md': '## Round 1\n', 'FILES.manifest': 'a.txt\n', 'a.txt': 'a\n', ...files })) {
    mkdirSync(dirname(join(proj, rel)), { recursive: true }); writeFileSync(join(proj, rel), text);
  }
  const outdir = join(T, 'out');
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/emergency-dump.mjs'), '--work', work, '--outdir', outdir, '--no-outputs', 'c93'], { encoding: 'utf8' });
  const z = existsSync(outdir) ? readdirSync(outdir).find((f) => f.endsWith('.zip')) : undefined;
  const get = (n) => spawnSync(PY, ['-c', 'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())', join(outdir, z), n], { encoding: 'utf8' }).stdout;
  return { r, zip: z, marker: z && JSON.parse(get('RECOVERY_MARKER.json')), report: z && get('RECOVERY_REPORT.md'), disk: readdirSync(join(proj, 'docs')).length };
};

test('C9.3: an NFC/NFD collision is at the top of the report, in the marker and on the console; the dump still comes out', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c93-'));
  try {
    const d = run(T, { [NFC]: 'one\n', [NFD]: 'two\n' });
    if (d.disk !== 2) return; // this file system folds the names; nothing to test here
    assert.equal(d.r.status, 0, d.r.stderr);
    assert.ok(d.zip, 'a zip');
    assert.deepEqual(d.marker.collisions, [[NFC, NFD].sort()].map((g) => g), 'one group with both true names');
    const at = d.report.indexOf(NFC), atD = d.report.indexOf(NFD);
    assert.ok(at >= 0 && atD >= 0, 'both names are in the report');
    assert.ok(Math.min(at, atD) < d.report.indexOf('## Likely changes'), 'before the first regular section');
    assert.ok(d.r.stdout.includes(NFC) && d.r.stdout.includes(NFD), 'both names on the console');
    assert.ok(!d.marker.reportErrors.some((e) => /NFC/.test(e)), 'a collision is not an «error while generating the report»');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('C9.3: no collision, no section: marker.collisions is empty', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c93-'));
  try {
    const d = run(T, { [NFC]: 'one\n' });
    assert.equal(d.r.status, 0, d.r.stderr);
    assert.deepEqual(d.marker.collisions, []);
    assert.ok(!/NFC\/NFD/.test(d.report));
    assert.ok(!/NFC\/NFD/.test(d.r.stdout));
  } finally { rmSync(T, { recursive: true, force: true }); }
});
