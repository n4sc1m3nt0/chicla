// Three robustness fixes (reported by Rodrigo, 2026-10-22):
//  1. `chicla check-manifest --root <folder that does not exist>` died with an ENOENT stack instead of a clean error (the core promises never to throw).
//  2. `chicla recovery` without `--out` defaulted to /home/claude/recovered, which on Windows becomes C:\home\claude\recovered (and on macOS cannot be created).
//  3. `CLAUDE.md` saved with CRLF passed `bump-round --verify` (the pin regex does not care); only a hash of a pinned or fingerprinted file caught CRLF.
// Tests assert codes and statuses, never message text (CLAUDE.md product rule 6).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned } from '../../../test/toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const { checkManifest } = await imp('packages/chicla-kit/src/check-manifest.mjs');
const { bumpRound } = await imp('packages/chicla-kit/src/bump-round.mjs');
const { main } = await imp('packages/chicla-kit/src/cli.mjs');
const { parseManifest } = await importPinned('manifest');
const rec = await importPinned('recovery-report');

const T = mkdtempSync(join(tmpdir(), 'chicla-r233-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
const sink = () => { let s = ''; return { write: (x) => { s += x; return true; }, get text() { return s; } }; };

// ---- 1. check-manifest on a root that does not exist ----------------------------------------------------------------------------------------------------
test('check-manifest: a root that does not exist is a clean EMANIFEST_ROOT, never a throw (check and --write alike), and nothing is created', () => {
  const missing = join(T, 'nope', 'deeper');
  for (const write of [false, true]) {
    let r;
    assert.doesNotThrow(() => { r = checkManifest({ root: missing, write }); });
    assert.equal(r.ok, false); assert.equal(r.code, 'EMANIFEST_ROOT');
    assert.equal(r.messages.every((m) => m.stream === 'err'), true);
  }
  assert.equal(existsSync(join(T, 'nope')), false, 'nothing was created');
});

test('check-manifest: a root that is a file is the same clean error', () => {
  const f = join(T, 'afile.txt'); writeFileSync(f, 'x');
  const r = checkManifest({ root: f });
  assert.equal(r.ok, false); assert.equal(r.code, 'EMANIFEST_ROOT');
});

test('chicla check-manifest --root <missing>: exit 1, --json carries the code, no ENOENT on any stream', async () => {
  const missing = join(T, 'gone');
  const out = sink(), err = sink();
  const status = await main(['check-manifest', '--root', missing, '--json'], { stdout: out, stderr: err, cwd: T });
  assert.equal(status, 1);
  const j = JSON.parse(out.text);
  assert.equal(j.ok, false); assert.equal(j.code, 'EMANIFEST_ROOT');
  assert.equal(/ENOENT/.test(out.text + err.text), false);
});

// ---- 2. the default folder of `recovery` (round 233; C16.1 made the fallback a fresh mkdtemp folder, see recovery-hardening.test.mjs) ----------------------------
test('recovery: recoveryOutPlan keeps /home/claude/recovered where /home/claude exists on a POSIX system', () => {
  assert.equal(typeof rec.recoveryOutPlan, 'function');
  assert.deepEqual(rec.recoveryOutPlan({ platform: 'linux', exists: (p) => p === '/home/claude', tmp: '/t' }), { base: '/home/claude/recovered', fresh: false });
});

test('recovery: recoveryOutPlan never uses /home/claude on Windows, and falls back to a fresh folder in the temp folder when /home/claude is absent (macOS, CI)', () => {
  const tmp = join(T, 'tmp');
  const want = { base: join(tmp, 'chicla-recovered-'), fresh: true };
  assert.deepEqual(rec.recoveryOutPlan({ platform: 'win32', exists: () => true, tmp }), want);
  assert.deepEqual(rec.recoveryOutPlan({ platform: 'darwin', exists: () => false, tmp }), want);
  assert.deepEqual(rec.recoveryOutPlan({ platform: 'linux', exists: () => false, tmp }), want);
});

// ---- 3. CLAUDE.md in CRLF ---------------------------------------------------------------------------------------------------------------------------------
let n = 0;
/** A copy of the real project (every file the manifest lists): the fingerprints and the pin are the real ones. */
const project = () => {
  const p = join(T, `p${n++}`);
  for (const { path: rel } of parseManifest(readFileSync(join(ROOT, 'FILES.manifest'), 'utf8'))) {
    mkdirSync(dirname(join(p, rel)), { recursive: true });
    try { copyFileSync(join(ROOT, rel), join(p, rel)); } catch { /* listed but not on disk */ }
  }
  return p;
};

test('bump-round --verify: the copy of the project with LF passes (control)', () => {
  const p = project();
  const r = bumpRound({ root: p, mode: 'verify' });
  assert.equal(r.ok, true, JSON.stringify(r.checks?.filter((c) => !c.ok)));
});

test('bump-round --verify: CLAUDE.md saved with CRLF fails with EBUMP_VERIFY and names the file, even though the pin still matches', () => {
  const p = project();
  const f = join(p, 'CLAUDE.md');
  writeFileSync(f, readFileSync(f, 'utf8').replace(/\r?\n/g, '\r\n'));
  const r = bumpRound({ root: p, mode: 'verify' });
  assert.equal(r.ok, false); assert.equal(r.code, 'EBUMP_VERIFY');
  const bad = r.checks.filter((c) => !c.ok);
  assert.equal(bad.length, 1, 'only the line-ending check fails: the pin, the seqs and the hashes are untouched');
  assert.match(bad[0].label, /CLAUDE\.md/);
});

test('bump-round --verify: one stray CRLF line is enough, and a bare CR inside a line is not mistaken for it', () => {
  const p = project();
  const f = join(p, 'CLAUDE.md'), lf = readFileSync(f, 'utf8');
  writeFileSync(f, lf.replace('\n', '\r\n'));
  assert.equal(bumpRound({ root: p, mode: 'verify' }).code, 'EBUMP_VERIFY');
  writeFileSync(f, lf.replace('\n', ' \r \n').replace(' \r \n', '\n')); // back to LF, nothing left of the edit
  assert.equal(bumpRound({ root: p, mode: 'verify' }).ok, true);
});
