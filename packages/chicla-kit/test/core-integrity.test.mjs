// C17.1 (round 243, D140; plan in docs/plan-a1-integrity.md §5): the shared integrity module `src/integrity.mjs` with the LF rule and the one status-file regex, called by
// `bump-round --verify` and `check-manifest`. Written before the code; red until it exists. Tests assert codes and ids, never message text (CLAUDE.md product rule 6).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned } from '../../../test/toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const I = await imp('packages/chicla-kit/src/integrity.mjs');
const { checkManifest } = await imp('packages/chicla-kit/src/check-manifest.mjs');
const { bumpRound } = await imp('packages/chicla-kit/src/bump-round.mjs');
const { parseManifest } = await importPinned('manifest');
const text = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const T = mkdtempSync(join(tmpdir(), 'chicla-c171-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
const view = (files) => ({ names: Object.keys(files), read: (f) => (f in files ? Buffer.from(files[f]) : null) });
const LF = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.github/copilot-instructions.md', 'CHANGELOG.md', 'version.mjs', 'FILES.manifest', 'FILES.baseline.json'];

// ---- the pure module ----
test('integrity.mjs: exports the status-file regex and the one LF list of the plan', () => {
  assert.equal(I.STATUS_FILE_RE.test('CHICLA_PROJECT_STATUS-247.md'), true);
  for (const bad of ['CHICLA_PROJECT_STATUS-.md', 'CHICLA_PROJECT_STATUS-1.md.bak', 'x/CHICLA_PROJECT_STATUS-1.md', 'CHICLA_PROJECT_STATUS-1a.md']) assert.equal(I.STATUS_FILE_RE.test(bad), false, bad);
  assert.deepEqual([...I.LF_FILES], LF);
});

test('integrity.mjs: it is pure (no import, no I/O) and not part of the pinned recovery toolchain', () => {
  const src = text('packages/chicla-kit/src/integrity.mjs');
  assert.equal(/^\s*import\s/m.test(src), false, 'no import at all');
  assert.equal(/node:fs|readFileSync|existsSync/.test(src), false);
  for (const f of ['packages/chicla-kit/src/bump-round.mjs', 'packages/chicla-kit/src/emergency-dump.mjs', 'packages/chicla-kit/src/pinned/recovery-report.mjs']) {
    if (f.endsWith('emergency-dump.mjs') || f.includes('pinned/')) assert.equal(text(f).includes('integrity.mjs'), false, `${f} must not import it (D7, the pin)`);
  }
});

test('checkLf: every file of the list is checked, in a view where all are LF every row is ok', () => {
  const files = Object.fromEntries([...LF, 'CHICLA_PROJECT_STATUS-9.md'].map((f) => [f, 'a\nb\n']));
  const rows = I.checkLf(view(files));
  assert.deepEqual(rows.map((r) => r.file).sort(), Object.keys(files).sort());
  assert.equal(rows.every((r) => r.ok && r.id === 'lf'), true);
});

test('checkLf: CRLF in any one file of the list, and in the status file, fails that row and no other', () => {
  for (const bad of [...LF, 'CHICLA_PROJECT_STATUS-9.md']) {
    const files = Object.fromEntries([...LF, 'CHICLA_PROJECT_STATUS-9.md'].map((f) => [f, 'a\nb\n']));
    files[bad] = 'a\r\nb\n';
    const failed = I.checkLf(view(files)).filter((r) => !r.ok);
    assert.deepEqual(failed.map((r) => r.file), [bad]);
  }
});

test('checkLf: a bare CR inside a line is not CRLF; a file that is not in the list is never checked; an absent or unreadable file gives no row', () => {
  const rows = I.checkLf(view({ 'CLAUDE.md': 'a\rb\n', 'README.md': 'a\r\nb\r\n', 'AGENTS.md': 'x\n' }));
  assert.deepEqual(rows.map((r) => [r.file, r.ok]).sort(), [['AGENTS.md', true], ['CLAUDE.md', true]]);
  assert.deepEqual(I.checkLf({ names: ['CLAUDE.md'], read: () => null }), []);
  assert.deepEqual(I.checkLf(view({})), []);
});

test('checkLf: `skip` leaves named files out (the files a --write is about to regenerate)', () => {
  const rows = I.checkLf(view({ 'CLAUDE.md': 'a\r\n', 'FILES.manifest': 'a\r\n' }), { skip: ['FILES.manifest'] });
  assert.deepEqual(rows.map((r) => [r.file, r.ok]), [['CLAUDE.md', false]]);
});

// ---- bump-round --verify ----
const project = () => {
  const p = join(T, `p${n++}`);
  for (const { path: rel } of parseManifest(text('FILES.manifest'))) {
    mkdirSync(dirname(join(p, rel)), { recursive: true });
    try { copyFileSync(join(ROOT, rel), join(p, rel)); } catch { /* listed but not on disk */ }
  }
  return p;
};
const crlf = (p, rel) => writeFileSync(join(p, rel), readFileSync(join(p, rel), 'utf8').replace(/\r?\n/g, '\r\n'));

test('bump-round --verify: the control prints the same nine rows, the CLAUDE.md row last', () => {
  const r = bumpRound({ root: project(), mode: 'verify' });
  assert.equal(r.ok, true);
  assert.equal(r.checks.length, 9);
  assert.match(r.checks[8].label, /^CLAUDE\.md has LF/);
});

test('bump-round --verify: CRLF in AGENTS.md (a file of the list that no hash covers) fails with EBUMP_VERIFY and names it', () => {
  const p = project();
  writeFileSync(join(p, 'AGENTS.md'), '# rules\r\nline\r\n'); // this project has none of its own: the file is added, in CRLF
  const r = bumpRound({ root: p, mode: 'verify' });
  assert.equal(r.code, 'EBUMP_VERIFY');
  const bad = r.checks.filter((c) => !c.ok);
  assert.equal(bad.length, 1);
  assert.match(bad[0].label, /AGENTS\.md/);
});

test('bump-round: it takes the status-file regex from integrity.mjs (no copy of the literal)', () => {
  const src = text('packages/chicla-kit/src/bump-round.mjs');
  assert.match(src, /from "\.\/integrity\.mjs"/);
  assert.equal(/CHICLA_PROJECT_STATUS-\\d/.test(src.replace(/\/\/.*$/gm, '').replace(/`[^`]*`/g, '')), false, 'the regex literal is still in bump-round.mjs');
});

// ---- check-manifest ----
const tiny = (files) => { const p = join(T, `m${n++}`); for (const [f, c] of Object.entries(files)) { mkdirSync(dirname(join(p, f)), { recursive: true }); writeFileSync(join(p, f), c); } return p; };

test('check-manifest: CRLF in CLAUDE.md stops the check and --write alike with EINTEGRITY_LF, and --write writes nothing', () => {
  const p = tiny({ 'CLAUDE.md': 'a\r\nb\r\n', 'x.txt': 'x\n' });
  for (const write of [false, true]) {
    const r = checkManifest({ root: p, write });
    assert.equal(r.ok, false); assert.equal(r.code, 'EINTEGRITY_LF');
    assert.deepEqual(r.crlf, ['CLAUDE.md']);
  }
  assert.throws(() => readFileSync(join(p, 'FILES.manifest')), /ENOENT/);
});

test('check-manifest: a CRLF FILES.manifest is flagged in check mode, but --write regenerates it (it is on the skip list of a write)', () => {
  const p = tiny({ 'x.txt': 'x\n' });
  assert.equal(checkManifest({ root: p, write: true }).ok, true);
  writeFileSync(join(p, 'FILES.manifest'), readFileSync(join(p, 'FILES.manifest'), 'utf8').replace(/\n/g, '\r\n'));
  assert.equal(checkManifest({ root: p }).code, 'EINTEGRITY_LF');
  const w = checkManifest({ root: p, write: true });
  assert.equal(w.ok, true, JSON.stringify(w.messages));
  assert.equal(checkManifest({ root: p }).ok, true);
});

test('check-manifest: control, LF files and a project with none of the listed files pass; a CRLF file outside the list is not its business', () => {
  assert.equal(checkManifest({ root: tiny({ 'CLAUDE.md': 'a\n', 'CHANGELOG.md': 'b\n' }), write: true }).ok, true);
  assert.equal(checkManifest({ root: tiny({ 'x.txt': 'x\n' }), write: true }).ok, true);
  assert.equal(checkManifest({ root: tiny({ 'notes.txt': 'a\r\nb\r\n' }), write: true }).ok, true);
});

test('check-manifest: it takes the status-file regex from integrity.mjs (no copy of the literal)', () => {
  const src = text('packages/chicla-kit/src/check-manifest.mjs');
  assert.match(src, /from "\.\/integrity\.mjs"/);
  assert.equal(/CHICLA_PROJECT_STATUS-\\d/.test(src.replace(/\/\/.*$/gm, '')), false);
});
