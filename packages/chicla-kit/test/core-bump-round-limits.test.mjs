// Round 258 (C19.2, AUDIT-6 F-1; D-256b confirmed by Rodrigo: «d142 sim»): `bump-round` (the bump and `--refresh`, dry or not) prints one line per archive limit that the
// status file or the CHANGELOG passes, names the command to run, and NEVER runs it and never changes its exit status. A file within the limits prints nothing.
// Limits (instruction 6 and `test/audit5-archive.test.mjs`): 5 «Previous» blocks, 10 «Done» lines in the Snapshot, 21 `## Round` headings in the CHANGELOG,
// 4096 bytes in the «Current version» line and in the «Open decisions» line. Written before the code; red until it is done.
// Every project is a temp copy of the real tree (every file the manifest lists), so the fingerprints and the pin are the real ones.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned } from '../../../test/toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { bumpRound, renderBumpRound } = await import(pathToFileURL(join(ROOT, 'packages/chicla-kit/src/bump-round.mjs')).href);
const T = mkdtempSync(join(tmpdir(), 'chicla-c192-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
const STATUS_RE = /^CHICLA_PROJECT_STATUS-\d+\.md$/;

/** A copy of the real project; `edit(statusText, changelogText)` returns the texts to write (any may stay as it is). */
const project = (edit) => {
  const p = join(T, `p${n++}`);
  for (const { path: rel } of parseManifest(readFileSync(join(ROOT, 'FILES.manifest'), 'utf8'))) {
    mkdirSync(dirname(join(p, rel)), { recursive: true });
    try { copyFileSync(join(ROOT, rel), join(p, rel)); } catch { /* listed but not on disk */ }
  }
  copyFileSync(join(ROOT, 'FILES.manifest'), join(p, 'FILES.manifest'));
  const st = readdirSync(p).find((f) => STATUS_RE.test(f));
  if (edit) {
    const [s, c] = edit(readFileSync(join(p, st), 'utf8'), readFileSync(join(p, 'CHANGELOG.md'), 'utf8'));
    writeFileSync(join(p, st), s); writeFileSync(join(p, 'CHANGELOG.md'), c);
  }
  return { p, st };
};
const tree = (p) => readdirSync(p, { recursive: true }).sort().join('\n');
const limitLines = (r) => r.messages.filter((m) => m.stream === 'out' && /^ {2}! /.test(m.text)).map((m) => m.text);
const close = (p, mode = 'refresh', dry = true) => bumpRound({ root: p, mode, dry, regenerateManifest: () => ({ ok: true, out: 'manifest stub', err: '' }) });

// the editors: each adds `k` of one thing
const lines = (s) => s.split('\n');
// the live file keeps 1 to 5 «Previous» blocks (item 6 archives to `--keep-previous N` and the round adds its own): pad to exactly 5 first, so `k` is the count over the limit whatever state the archives left (C20.2, AUDIT-7 F-3)
const addPrevious = (k) => (s, c) => { const a = lines(s), i = a.findIndex((l) => l.startsWith('**Previous (round ')), n = a.filter((l) => l.startsWith('**Previous (round ')).length; a.splice(i, 0, ...Array.from({ length: Math.max(0, 5 - n) + k }, (_, j) => `**Previous (round x${j}):** filler.\n`)); return [a.join('\n'), c]; };
// the live file keeps 9 or 10 «Done» lines (item 6, keep 9 before the round's own): pad to exactly 10 first, so `k` is the count over the limit whatever round it is (round 261)
const addDone = (k) => (s, c) => { const a = lines(s), i = a.findIndex((l) => l.startsWith('- Done:')), n = a.filter((l) => l.startsWith('- Done:')).length; a.splice(i, 0, ...Array.from({ length: Math.max(0, 10 - n) + k }, (_, j) => `- Done: round x${j}. filler.`)); return [a.join('\n'), c]; };
const addRounds = (k) => (s, c) => { const a = lines(c); a.splice(2, 0, ...Array.from({ length: k }, (_, j) => `## Round x${j}\n\nfiller.\n`)); return [s, a.join('\n')]; };
/** Pad the line that starts with `head` to exactly `bytes` bytes (the line without its newline). */
const padLine = (head, bytes) => (s, c) => { const a = lines(s), i = a.findIndex((l) => l.startsWith(head)); assert.ok(i >= 0, head); a[i] = `${head} ${'x'.repeat(bytes - Buffer.byteLength(head) - 1)}`; return [a.join('\n'), c]; }; // the line is replaced, not grown: a live line already past `bytes` would make `repeat` throw

test('the real tree is within every limit: the normal run and --refresh print no limit line and report an empty `limits`', () => {
  const { p } = project();
  for (const mode of ['bump', 'refresh']) {
    const r = close(p, mode, true);
    assert.equal(r.ok, true, JSON.stringify(r.messages)); assert.deepEqual(limitLines(r), []); assert.deepEqual(r.limits, []);
    assert.doesNotMatch(renderBumpRound(r).out, /archive-changelog/);
  }
});

test('«Previous» blocks: 5 print nothing, 6 print one line that names --status; the result stays ok and the command is not run', () => {
  const { p, st } = project(addPrevious(0));
  const base = readFileSync(join(p, st), 'utf8').split('\n').filter((l) => l.startsWith('**Previous (round ')).length;
  assert.equal(base, 5); // addPrevious(0) pads to exactly 5, whatever the live file holds
  assert.deepEqual(limitLines(close(p)), []);
  const six = project(addPrevious(1));
  const before = tree(six.p), stBefore = readFileSync(join(six.p, six.st));
  const r = close(six.p);
  assert.equal(r.ok, true); assert.equal(r.code, null);
  const l = limitLines(r);
  assert.equal(l.length, 1, l.join('\n')); assert.match(l[0], /6 «Previous» blocks/); assert.match(l[0], /limit 5/); assert.match(l[0], /node scripts\/archive-changelog\.mjs --status\b/); assert.match(l[0], /bump-round\.mjs --refresh/);
  assert.equal(r.limits.length, 1); assert.equal(r.limits[0].id, 'previous');
  assert.equal(tree(six.p), before, 'nothing was archived'); assert.ok(readFileSync(join(six.p, six.st)).equals(stBefore), 'the status file is untouched (dry)');
});

test('«Done» lines: 10 print nothing, 11 print one line that names --snapshot', () => {
  const r = close(project(addDone(1)).p), l = limitLines(r);
  assert.equal(l.length, 1, l.join('\n')); assert.match(l[0], /11 «Done» lines/); assert.match(l[0], /limit 10/); assert.match(l[0], /archive-changelog\.mjs --snapshot\b/); assert.equal(r.limits[0].id, 'done');
});

test('CHANGELOG rounds: 21 headings print nothing, 22 print one line that names the plain archive-changelog command', () => {
  const real = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8').split('\n').filter((l) => /^## Round /.test(l)).length;
  assert.deepEqual(limitLines(close(project(addRounds(21 - real)).p)), [], '21 headings is within the limit');
  const r = close(project(addRounds(22 - real)).p), l = limitLines(r);
  assert.equal(l.length, 1, l.join('\n')); assert.match(l[0], /22 rounds/); assert.match(l[0], /limit 21/); assert.match(l[0], /archive-changelog\.mjs(?! --)/); assert.equal(r.limits[0].id, 'changelog');
});

test('the two rolling paragraphs: 4096 bytes print nothing, 4097 print one line that names --rolling (bytes, not characters)', () => {
  for (const [head, id] of [['**Current version:**', 'current-version'], ['**Open decisions:**', 'open-decisions']]) {
    assert.deepEqual(limitLines(close(project(padLine(head, 4096)).p)), [], `${id} at 4096 bytes`);
    const r = close(project(padLine(head, 4097)).p), l = limitLines(r);
    assert.equal(l.length, 1, `${id}: ${l.join('\n')}`); assert.match(l[0], /4097 bytes/); assert.match(l[0], /limit 4096/); assert.match(l[0], /archive-changelog\.mjs --rolling\b/); assert.equal(r.limits[0].id, id);
  }
  // a line of multi-byte characters counts its BYTES: 2100 characters of « are 4200 bytes
  const { p } = project((s, c) => { const a = lines(s), i = a.findIndex((l) => l.startsWith('**Open decisions:**')); a[i] = '**Open decisions:** ' + '«'.repeat(2100); return [a.join('\n'), c]; });
  assert.equal(limitLines(close(p)).length, 1);
});

test('several limits at once: one line each, in the order status file (Previous, Done, Current version, Open decisions) then CHANGELOG', () => {
  const both = (...fs) => (s, c) => fs.reduce(([a, b], f) => f(a, b), [s, c]);
  const real = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8').split('\n').filter((l) => /^## Round /.test(l)).length; // the live count moves when the CHANGELOG is archived (round 263)
  const r = close(project(both(addPrevious(1), addDone(1), addRounds(22 - real), padLine('**Open decisions:**', 4200))).p);
  assert.deepEqual(r.limits.map((x) => x.id), ['previous', 'done', 'open-decisions', 'changelog']);
  assert.equal(limitLines(r).length, 4);
});

test('a real (not dry) --refresh prints the lines too and still ends ok; the status file keeps its number; --verify prints none; the lines come through renderBumpRound', () => {
  const { p, st } = project(addPrevious(1));
  const r = close(p, 'refresh', false);
  assert.equal(r.ok, true, JSON.stringify(r.messages)); assert.equal(r.code, null);
  assert.equal(limitLines(r).length, 1); assert.match(renderBumpRound(r).out, /6 «Previous» blocks/);
  assert.ok(readdirSync(p).includes(st), 'the number was kept');
  assert.equal(readdirSync(join(p, 'docs')).filter((f) => /status-archive-previous-/.test(f)).length, readdirSync(join(ROOT, 'docs')).filter((f) => /status-archive-previous-/.test(f)).length, 'no archive file was written');
  const v = bumpRound({ root: p, mode: 'verify' });
  assert.deepEqual(limitLines(v), []); assert.equal(v.limits, undefined);
});

test('the limits never decide the exit status: a failing run (unpaired seq) stops before anything is said about limits', () => {
  const { p } = project((s, c) => { const [a, b] = addPrevious(2)(s, c); return [a, b]; });
  writeFileSync(join(p, 'version.mjs'), readFileSync(join(p, 'version.mjs'), 'utf8').replace(/seq=\d+/, 'seq=1'));
  const bad = close(p);
  assert.equal(bad.ok, false); assert.equal(bad.code, 'EBUMP_UNPAIRED'); assert.deepEqual(limitLines(bad), []);
});
