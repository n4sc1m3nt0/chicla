// D102 (confirmed by Rodrigo, 2026-10-15, «102 sim»; built in round 162), written before the code: `verify-delivery` (and so `make-delivery-zip`) prints ONE `git rm` line for the
// files that were in a previous zip (`--against`) and are not in this one, so an old status file (renamed by `bump-round`) or an approved removal (`--allow-removed`) is not
// forgotten on `main`. Never printed for a rejected zip. The names come from another zip, so the line is built by a pure helper, `gitRmLine`, that quotes every name,
// always puts `--` first, never prints a name with a control character (a newline there would fake a second command) and prints no command at all for more than 30 names.
// The zips are built in a temp folder from a copy of the tree; the real tree is never touched.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned } from '../../../test/toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const { makeDelivery, renderMakeDelivery } = await imp('packages/chicla-kit/src/make-delivery.mjs');
const { verifyDelivery, renderVerifyDelivery, gitRmLine } = await imp('packages/chicla-kit/src/verify-delivery.mjs');
const { listZip, readZipFile, writeZip } = await imp('packages/chicla-zip/src/zipkit.mjs');

const T = mkdtempSync(join(tmpdir(), 'chicla-d102-'));
after(() => rmSync(T, { recursive: true, force: true }));
let n = 0;
const tree = () => {
  const proj = join(T, `tree${n++}`);
  const rels = [...parseManifest(readFileSync(join(ROOT, 'FILES.manifest'), 'utf8')).map((e) => e.path), 'FILES.manifest'];
  for (const rel of rels) { if (!existsSync(join(ROOT, rel))) continue; mkdirSync(dirname(join(proj, rel)), { recursive: true }); copyFileSync(join(ROOT, rel), join(proj, rel)); }
  return proj;
};
/** The delivery of a fresh copy of the tree, built by the core. */
const delivery = async () => { const root = tree(), out = join(T, `d${n++}.zip`); const r = await makeDelivery({ out, root }); assert.equal(r.ok, true, JSON.stringify(r.messages)); return { root, out }; };
/** A «previous zip»: every entry of `zip`, plus `extra` names with a small content (written with chicla-zip, no python). */
const previous = async (zip, extra) => {
  const sources = listZip(zip).entries.filter((e) => !e.isDir).map((e) => ({ name: e.name, data: readZipFile(zip, e.name) }));
  for (const name of extra) sources.push({ name, data: Buffer.from('x') });
  const out = join(T, `prev${n++}.zip`); await writeZip(out, sources); return out;
};
const lines = (text) => text.split('\n');

test('D102: an old status file in the previous zip is not in this one: ONE `git rm -- <name>` line names it, and the check still passes', async () => {
  const { root, out } = await delivery();
  const prev = await previous(out, ['CHICLA_PROJECT_STATUS-1.md']);
  const v = verifyDelivery({ zip: out, against: [prev], root });
  assert.equal(v.ok, true, JSON.stringify(v.problems));
  assert.deepEqual(v.left, ['CHICLA_PROJECT_STATUS-1.md']);
  const o = renderVerifyDelivery(v).out;
  assert.equal(lines(o).filter((l) => /^ {2}git rm /.test(l)).length, 1, 'exactly one git rm line');
  assert.ok(lines(o).includes('  git rm -- CHICLA_PROJECT_STATUS-1.md'), o);
  assert.ok(o.indexOf('git rm') < o.indexOf('zip ready to paste over'), 'the hint comes before the final «zip ready» line');
});

test('D102: an approved removal (--allow-removed) and the old status file go in the SAME line, sorted', async () => {
  const { root, out } = await delivery();
  const prev = await previous(out, ['old/gone.txt', 'CHICLA_PROJECT_STATUS-1.md']);
  const v = verifyDelivery({ zip: out, against: [prev], allowRemoved: ['old/gone.txt'], root });
  assert.equal(v.ok, true, JSON.stringify(v.problems));
  assert.deepEqual(v.left, ['CHICLA_PROJECT_STATUS-1.md', 'old/gone.txt']);
  assert.ok(lines(renderVerifyDelivery(v).out).includes('  git rm -- CHICLA_PROJECT_STATUS-1.md old/gone.txt'));
});

test('D102: nothing left the zip: no `git rm` line and `left` is empty', async () => {
  const { root, out } = await delivery();
  const v = verifyDelivery({ zip: out, against: [await previous(out, [])], root });
  assert.equal(v.ok, true); assert.deepEqual(v.left, []);
  assert.doesNotMatch(renderVerifyDelivery(v).out, /git rm/);
});

test('D102: a lost file that is NOT approved rejects the zip, and then no `git rm` line is printed at all (the delivery is not going anywhere)', async () => {
  const { root, out } = await delivery();
  const prev = await previous(out, ['old/gone.txt', 'CHICLA_PROJECT_STATUS-1.md']);
  const v = verifyDelivery({ zip: out, against: [prev], root });
  assert.equal(v.ok, false); assert.equal(v.code, 'EVERIFY_FAILED'); assert.deepEqual(v.left, []);
  const r = renderVerifyDelivery(v); assert.doesNotMatch(r.out + r.err, /git rm/);
});

test('D102: two --against zips: the names are joined without repeats', async () => {
  const { root, out } = await delivery();
  const a = await previous(out, ['CHICLA_PROJECT_STATUS-1.md']), b = await previous(out, ['CHICLA_PROJECT_STATUS-1.md', 'CHICLA_PROJECT_STATUS-2.md']);
  const v = verifyDelivery({ zip: out, against: [a, b], root });
  assert.deepEqual(v.left, ['CHICLA_PROJECT_STATUS-1.md', 'CHICLA_PROJECT_STATUS-2.md']);
  assert.ok(lines(renderVerifyDelivery(v).out).includes('  git rm -- CHICLA_PROJECT_STATUS-1.md CHICLA_PROJECT_STATUS-2.md'));
});

test('D102: `make-delivery` prints the same line (it relays the verifier) and its result carries the files that left', async () => {
  const { root, out } = await delivery();
  const prev = await previous(out, ['CHICLA_PROJECT_STATUS-1.md']), out2 = join(T, `d${n++}.zip`);
  const r = await makeDelivery({ out: out2, against: [prev], root });
  assert.equal(r.ok, true, JSON.stringify(r.messages));
  assert.ok(lines(renderMakeDelivery(r).out).includes('  git rm -- CHICLA_PROJECT_STATUS-1.md'));
});

// ---- the pure helper ----

test('gitRmLine: `--` first, names sorted and without repeats, plain names bare', () => {
  assert.deepEqual(gitRmLine(['b/y.txt', 'a.txt', 'a.txt']), { line: 'git rm -- a.txt b/y.txt', note: null });
  assert.deepEqual(gitRmLine([]), { line: null, note: null });
});

test('gitRmLine: a name with a space, a quote or a shell character is single-quoted, and a quote inside is closed, escaped and reopened', () => {
  assert.equal(gitRmLine(['my file.txt']).line, "git rm -- 'my file.txt'");
  assert.equal(gitRmLine(["it's.txt"]).line, "git rm -- 'it'\\''s.txt'");
  assert.equal(gitRmLine(['a;b$(x).txt']).line, "git rm -- 'a;b$(x).txt'");
  assert.equal(gitRmLine(['-rf']).line, 'git rm -- -rf', '`--` makes a leading dash a name, not an option');
});

test('gitRmLine: a name with a control character (newline, tab, escape, DEL) is NEVER printed; a note counts them, and the line has no newline', () => {
  const r = gitRmLine(['ok.txt', 'a\ngit rm -rf x', 'tab\there', 'esc\u001b[2J', 'del\u007f']);
  assert.equal(r.line, 'git rm -- ok.txt'); assert.ok(!r.line.includes('\n'));
  assert.match(r.note, /4 name\(s\)/); assert.ok(!r.note.includes('\n') && !/[\u0000-\u001f\u007f]/.test(r.note));
  const only = gitRmLine(['a\nb']); assert.equal(only.line, null); assert.match(only.note, /1 name\(s\)/);
});

test('gitRmLine: 30 names make a line, 31 make none (a note says how many); the limit counts the names that can be printed', () => {
  const names = (k) => Array.from({ length: k }, (_, i) => `f${String(i).padStart(2, '0')}.txt`);
  assert.ok(gitRmLine(names(30)).line.startsWith('git rm -- f00.txt'));
  const big = gitRmLine(names(31)); assert.equal(big.line, null); assert.match(big.note, /31 file\(s\)/);
});
