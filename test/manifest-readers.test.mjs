// C7.1, slice a2 — the rest of the scripts read FILES.manifest through src/pinned/manifest.mjs (v1 and v2). The dump must never fail
// because of a bad manifest (it records the error and still makes the zip); the recovery says so instead of crashing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINNED, importPinned, pinnedFile } from './toolchain-files.mjs';
const { MANIFEST_V2_HEADER } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });

test('no script reads FILES.manifest by splitting lines: they all go through parseManifest', () => {
  const offenders = [];
  for (const f of readdirSync(join(ROOT, 'scripts')).filter((n) => n.endsWith('.mjs') && !n.startsWith('smoke-test') && `scripts/${n}` !== PINNED.manifest)) {
    readFileSync(join(ROOT, 'scripts', f), 'utf8').split('\n').forEach((l, i) => { if (/FILES\.manifest/.test(l) && /\.split\(\s*"\\n"\s*\)/.test(l) && !/^\s*\/\//.test(l)) offenders.push(`${f}:${i + 1}`); });
  }
  { const f = 'packages/chicla-kit/src/check-manifest.mjs'; readFileSync(join(ROOT, f), 'utf8').split('\n').forEach((l, i) => { if (/FILES\.manifest/.test(l) && /\.split\(\s*"\\n"\s*\)/.test(l) && !/^\s*\/\//.test(l)) offenders.push(`${f}:${i + 1}`); }); } // C11.1 5b: the core
  assert.deepEqual(offenders, []);
});

const mini = (manifestText) => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c71a2-')), work = join(T, 'work'), proj = join(work, 'chicla');
  for (const [rel, text] of Object.entries({ 'package.json': '{"version":"0.0.1"}\n', 'CHANGELOG.md': '<!-- CHANGELOG_FINGERPRINT: seq=1 -->\n## Round 1a\n', 'CHICLA_PROJECT_STATUS-1.md': '# s\n', 'kept.txt': 'k\n', 'new-one.txt': 'n\n' })) { mkdirSync(dirname(join(proj, rel)), { recursive: true }); writeFileSync(join(proj, rel), text); }
  writeFileSync(join(proj, 'FILES.manifest'), manifestText);
  return { T, work, outdir: join(T, 'out') };
};
const v2 = (...paths) => `${MANIFEST_V2_HEADER}\n${paths.map((p) => `${p}\t00000000\t0`).join('\n')}\n`;
const dump = (m) => {
  const r = run('node', [join(ROOT, 'scripts/emergency-dump.mjs'), '--work', m.work, '--outdir', m.outdir, '--no-outputs', 'c71a2'], ROOT);
  const z = existsSync(m.outdir) ? readdirSync(m.outdir).find((f) => f.endsWith('.zip')) : undefined;
  return { r, zip: z ? join(m.outdir, z) : null, report: z ? run('unzip', ['-p', join(m.outdir, z), 'RECOVERY_REPORT.md']).stdout : '' };
};
const recover = (zip, T) => { const o = join(T, 'rec'); const r = run('node', [pinnedFile(ROOT, 'recovery-report'), zip, '--out', o], ROOT); return { r, diff: existsSync(join(o, 'RECOVERY_DIFF.md')) ? readFileSync(join(o, 'RECOVERY_DIFF.md'), 'utf8') : '' }; };
const section = (md, t) => md.split(/^#{2,3} /m).find((x) => x.startsWith(t)) ?? '';
const LIST = ['CHANGELOG.md', 'CHICLA_PROJECT_STATUS-1.md', 'kept.txt', 'package.json', 'ghost.txt'];

test('emergency-dump with a v2 manifest: new and lost files are told by path, not by the v2 columns', () => {
  const m = mini(v2(...LIST));
  try {
    const d = dump(m);
    assert.equal(d.r.status, 0, d.r.stdout + d.r.stderr);
    assert.ok(d.zip, 'the zip was created');
    assert.ok(section(d.report, 'Files on disk that are NOT').includes('new-one.txt'), 'new-one.txt is new');
    assert.ok(section(d.report, 'Files in FILES.manifest that are NOT').includes('ghost.txt'), 'ghost.txt is lost');
    assert.ok(!section(d.report, 'Files in FILES.manifest that are NOT').includes('kept.txt'), 'kept.txt is not lost');
    assert.doesNotMatch(d.report, /00000000/, 'no v2 column leaks into the report');
  } finally { rmSync(m.T, { recursive: true, force: true }); }
});

test('emergency-dump with a CORRUPT manifest still makes the zip and records the error code', () => {
  const m = mini(`${MANIFEST_V2_HEADER}\nkept.txt\tnot-a-crc\t1\n`);
  try {
    const d = dump(m);
    assert.equal(d.r.status, 0, d.r.stdout + d.r.stderr);
    assert.ok(d.zip, 'the dump is never refused because of a bad manifest');
    assert.match(d.report, /EMANIFEST_FORMAT/);
  } finally { rmSync(m.T, { recursive: true, force: true }); }
});

test('recovery-report without a baseline reads a v2 manifest (new, missing by path)', () => {
  const m = mini(v2(...LIST));
  try {
    const d = dump(m); assert.ok(d.zip);
    const a = recover(d.zip, m.T);
    assert.equal(a.r.status, 0, a.r.stdout + a.r.stderr);
    assert.ok(section(a.diff, 'New').includes('new-one.txt'));
    assert.ok(section(a.diff, 'MISSING').includes('ghost.txt'));
    assert.ok(!section(a.diff, 'MISSING').includes('kept.txt'));
  } finally { rmSync(m.T, { recursive: true, force: true }); }
});

test('recovery-report with a corrupt manifest says so (code) and does not crash or invent «new» files', () => {
  const m = mini(`${MANIFEST_V2_HEADER}\nkept.txt\tzz\t1\n`);
  try {
    const d = dump(m); assert.ok(d.zip);
    const a = recover(d.zip, m.T);
    assert.equal(a.r.status, 0, a.r.stdout + a.r.stderr);
    assert.match(a.diff, /EMANIFEST_FORMAT/);
    assert.match(section(a.diff, 'New'), /^New \(0\)/, 'with no usable base nothing is reported as new');
  } finally { rmSync(m.T, { recursive: true, force: true }); }
});
