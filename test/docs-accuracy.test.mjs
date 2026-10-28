// Round 164 — things found in round 163 outside its task, fixed with a test each; and D118 (Rodrigo: «d118 sim»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

test('docs/zip-handling.md §7 does not say Windows was never run (CI runs it, blocking) and does not call Windows names «written» by default', () => {
  const s = read('docs/zip-handling.md');
  assert.doesNotMatch(s, /Windows has not been run at all/);
  assert.doesNotMatch(s, /Windows is its own milestone \(M14, D19\), not the 0\.1 line/);
  const sec = s.slice(s.indexOf('## 7. Known limits'));
  assert.match(sec, /CI runs the `chicla-zip` suite on Ubuntu, macOS and Windows/);
  assert.match(sec, /real Windows machine/);
});

test('no test names the origin project in a title or comment (D117); the one guard that must name it stays in layout.test.mjs', () => {
  for (const f of ['test/dump-policy.test.mjs', 'test/policy.test.mjs', 'test/recovery-policy.test.mjs']) assert.doesNotMatch(read(f), /cedar/i, `${f} still names it`);
  const lines = read('test/layout.test.mjs').split('\n').filter((l) => /cedar/i.test(l));
  assert.equal(lines.length, 1, 'layout.test.mjs may hold only the guard regex');
  assert.match(lines[0], /doesNotMatch\(src, \/CEDAR\|cedar\/i/);
});

test('mutants list: every `find` occurs exactly once in its file (a stale anchor, as in round 151, is caught by npm test, not 12 rounds later)', async () => {
  const m = await import(pathToFileURL(join(root, 'packages/chicla-zip/mutants/list.mjs')).href);
  const list = m.default;
  assert.ok(Array.isArray(list) && list.length > 200, 'the list was not loaded');
  const bad = [];
  for (const x of list) { const src = read(`packages/chicla-zip/${x.file}`); if (src.split(x.find).length - 1 !== 1) bad.push(x.id); }
  assert.deepEqual(bad, [], 'stale or ambiguous anchors');
});

test('D118: C5.3b-A15 is an accepted survivor with a reason (equivalent since round 151: the catch closes the stream and removes the file)', async () => {
  const m = await import(pathToFileURL(join(root, 'packages/chicla-zip/mutants/list.mjs')).href);
  const x = m.default.find((e) => e.id === 'C5.3b-A15');
  assert.ok(x, 'the entry exists'); assert.equal(typeof x.survives, 'string'); assert.ok(x.survives.length > 40);
});

test('C15.22 (ZIP-018): CLAUDE.md and README.md state the mutant count of the list, so it cannot go stale again', async () => {
  const m = await import(pathToFileURL(join(root, 'packages/chicla-zip/mutants/list.mjs')).href);
  for (const f of ['CLAUDE.md', 'README.md']) { const hit = read(f).match(/\((?:\d+ )?(\d+) (?:hand-made )?mutants\)|(\d+) hand-made mutants/); const n = Number(hit?.[1] ?? hit?.[2]); assert.equal(n, m.default.length, `${f} says ${n}`); }
});

test('C15.22 (ZIP-018): C5.3b-A13 and C5.1-central-bounds are accepted survivors with a reason and are pinned by test/audit-zip018.test.mjs', async () => {
  const m = await import(pathToFileURL(join(root, 'packages/chicla-zip/mutants/list.mjs')).href);
  for (const id of ['C5.3b-A13', 'C5.1-central-bounds']) { const x = m.default.find((e) => e.id === id); assert.ok(x, id); assert.ok(typeof x.survives === 'string' && x.survives.length > 40, id); assert.ok(x.tests.includes('test/audit-zip018.test.mjs'), id); }
});

test('ZIP-021 (round 209, C15.26): docs/zip-handling.md §2 documents the end-record search window, and trailing-size-fake.test.mjs no longer describes the pre-ZIP-015 rule', () => {
  const s = read('docs/zip-handling.md');
  const sec = s.slice(s.indexOf('## 2. What the reader does'), s.indexOf('## 3. What extraction promises'));
  assert.match(sec, /last 21 bytes/, 'the 21-byte rule is not written');
  assert.match(sec, /65 557/, 'the tail window is not written');
  assert.match(sec, /65 558/, 'the Python window is not written');
  assert.match(sec, /never misread/, 'the safe direction is not written');
  const t = read('packages/chicla-zip/test/trailing-size-fake.test.mjs').split('\n').slice(0, 12).join('\n');
  assert.match(t, /ZIP-015/, 'the header does not mention the general rule of round 200');
  assert.doesNotMatch(t, /is now EAMBIGUOUS; candidates BEFORE/, 'the stale one-case sentence is still there');
});

// Round 236 (C16.3; AUDIT-4 T-1, T-2, T-5, P-3). Written before the docs; red until they change. Docs only: no source, the pin does not move.
const statusName = () => readdirSync(root).filter((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f)).sort((a, b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1])).pop();
const item20 = () => { const s = read(statusName()); const i = s.indexOf('\n20. **Long commands'); const j = s.indexOf('\n\n', i + 1); assert.ok(i > 0 && j > i, 'item 20 not found'); return s.slice(i, j); };
const WAIT = /timeout 270 [^\n]*until grep -q '\^EXIT'/;

test('C16.3 (T-2): the stale timing claims are gone from CLAUDE.md and item 20 («900+», «about 4 minutes», «~4 min»)', () => {
  for (const [name, text] of [['CLAUDE.md', read('CLAUDE.md')], ['item 20', item20()]]) {
    assert.doesNotMatch(text, /900\+/, `${name} still says 900+`);
    assert.doesNotMatch(text, /about 4 minutes|~\s?4 min|\(4 min/i, `${name} still says 4 minutes`);
  }
});

test('C16.3 (T-1): item 20 says ONE blocking wait (`timeout 270` on `until grep -q \'^EXIT\'`) and no longer asks for polling with `sleep` ≤ 60 s', () => {
  const t = item20();
  assert.match(t, WAIT, 'the blocking wait is not written');
  assert.doesNotMatch(t, /sleep` ≤ 60 s|poll with short calls|every 30 to 60 seconds/i, 'item 20 still asks for short polling');
});

test('C16.3 (T-1, T-5): CLAUDE.md keeps the short rule and POINTS to item 20; it does not copy the old polling rule', () => {
  const c = read('CLAUDE.md');
  const sec = c.slice(c.indexOf('## Long commands'), c.indexOf('## Working rules'));
  assert.ok(sec.length > 40 && sec.includes('item 20'), 'the section does not point to item 20');
  assert.doesNotMatch(sec, /sleep` more than 60|poll the file|every 30 to 60 seconds/i, 'the old polling text is still copied');
  assert.match(sec, /\(348 mutants\)|\(\d+ mutants\)/, 'the mutant count that docs-accuracy checks must stay');
  assert.ok(sec.length < 1400, `the section is ${sec.length} chars: it should be a pointer, not a copy`);
});

test('C16.3 (T-5): the delivery rules of CLAUDE.md are a pointer to items 8 to 15, not a second copy', () => {
  const c = read('CLAUDE.md');
  const sec = c.slice(c.indexOf('## Delivery rules'), c.indexOf('## Product rules'));
  assert.match(sec, /items? 8 (to|-|–) 15|items 8, 14/, 'the pointer to the status items is missing');
  assert.doesNotMatch(sec, /never hand-rolled|\(D13\)|Say what was NOT run/, 'the delivery text is still copied');
  assert.ok(sec.length < 900, `the section is ${sec.length} chars`);
});

test('C16.3 (P-3): big-cm.log is not in the root; it moved to packages/chicla-zip/bench/ with a header that says which MAX_CENTRAL it was measured at', () => {
  assert.equal(existsSync(join(root, 'big-cm.log')), false, 'big-cm.log is still in the root');
  const moved = 'packages/chicla-zip/bench/big-cm.log';
  assert.ok(existsSync(join(root, moved)), `${moved} missing`);
  const first = read(moved).split('\n')[0];
  assert.match(first, /1 GiB/); assert.match(first, /C15\.6/); assert.match(first, /64 MiB/);
  assert.match(read(moved), /12000000 entries/, 'the measurement itself must be kept verbatim');
});

// Round 237 (Rodrigo: the request of round 227 was about the CLI text, not the chat; revert the chat layout). The panel (round 228) stays.
test('round 237: the chat reply layout of round 227 is gone: no item 21 «Reply format» in the Instructions and no «Layout» sentence in CLAUDE.md rule 6', () => {
  const s = read(statusName());
  const instr = s.slice(s.indexOf('## Instructions'), s.indexOf('**Current version:**'));
  assert.doesNotMatch(instr, /\n21\. /, 'item 21 is still in the Instructions');
  assert.doesNotMatch(instr, /Reply format|What is left for you/);
  const c = read('CLAUDE.md');
  assert.doesNotMatch(c, /item 21|\*\*Layout:\*\*/, 'CLAUDE.md still points to the removed layout');
  assert.match(c, /Open decisions, always/, 'rule 6 itself must stay');
});

// Round 238 (C16.4): the new status-file archive is documented where a reader looks for history.
test('C16.4: item 6, the Map (item 4), docs/state-file.md and docs/README.md name the status archive and the --status mode; ROADMAP marks C16.4 done', () => {
  const s = read(statusName());
  const item = (n) => { const i = s.indexOf(`\n${n}. **`); return s.slice(i, s.indexOf('\n', i + 1)); };
  assert.match(item(6), /archive-changelog\.mjs --status/, 'item 6 does not name --status');
  assert.match(item(4), /status-archive-previous-\*\.md/, 'the Map does not name the archive');
  assert.match(read('docs/state-file.md'), /status-archive-previous-/, 'docs/state-file.md');
  assert.match(read('docs/README.md'), /status-archive-previous-/, 'docs/README.md');
  assert.match(read('ROADMAP.md'), /^\| C16\.4 \|[^\n]*S · feito \(round 238/m, 'ROADMAP C16.4');
});

// Round 239 (C16.5): docs/manifest.md lists every kind the content detector knows (read from policy.mjs, so it cannot drift) and keeps the limits.
test('C16.5: docs/manifest.md names every detector kind of policy.mjs and states the limits (1 MiB, binary, UTF-16)', () => {
  const src = read('packages/chicla-kit/src/pinned/policy.mjs');
  const block = src.slice(src.indexOf('const DETECTORS = ['), src.indexOf('];', src.indexOf('const DETECTORS = [')));
  const kinds = [...block.matchAll(/^\s*\["([^"]+)",\s*\//gm)].map((m) => m[1]);
  assert.ok(kinds.length >= 9, `expected 9 kinds, found ${kinds}`);
  const doc = read('docs/manifest.md');
  for (const k of kinds) assert.ok(doc.includes(k), `docs/manifest.md does not name «${k}»`);
  assert.match(doc, /1 MiB/); assert.match(doc, /binary/i); assert.match(doc, /UTF-16/);
  assert.match(doc, /never the match|never the matched text/i);
});

test('C16.5: ROADMAP marks C16.5 done and C16.6 next; D139 is confirmed (Rodrigo) and the C16.6 row sends the timings to item 20', () => {
  const r = read('ROADMAP.md');
  assert.match(r, /^\| C16\.5 \|[^\n]*S · feito \(round 239/m);
  assert.match(r, /^\| C16\.6 \|[^\n]*S · (planned \(next\)|feito \(round 240)/m);
  assert.match(r, /^\| D139 \|[^\n]*CONFIRMED \(Rodrigo, 2026-10-22/m);
  assert.match(r, /^\| C16\.7 \|[^\n]*S · (planned( \(next\))?|feito \(round 241)/m);
  const c166 = r.match(/^\| C16\.6 \|[^\n]*$/m)[0];
  assert.match(c166, /item 20/, 'the C16.6 row must say the timings go to item 20');
  assert.doesNotMatch(c166, /timings? (go|goes|are written|written)? ?(in)?to `?CLAUDE\.md/i);
});

// Round 240 (C16.6): the fast/slow split is explained where the rule lives (item 20), CLAUDE.md only points to it, and the numbers are measured ones.
test('C16.6: item 20 explains `npm run test:fast` / `test:slow` with measured times and says the CI and the closing run keep the full `npm test`; CLAUDE.md names test:fast without numbers', () => {
  const t = item20();
  assert.match(t, /npm run test:fast/); assert.match(t, /npm run test:slow/);
  assert.match(t, /measured (in )?round 240/i, 'the times must say when they were measured');
  assert.match(t, /1 core|nproc/i, 'the machine is named: with one core node --test cannot overlap files');
  assert.match(t, /CI[^.]*npm test|npm test[^.]*CI/, 'the CI keeps the full npm test');
  const c = read('CLAUDE.md'); const sec = c.slice(c.indexOf('## Long commands'), c.indexOf('## Working rules'));
  assert.match(sec, /test:fast/); assert.doesNotMatch(sec, /\b\d+ ?(s|sec|seconds|min|minutes)\b/, 'no time that can go stale in CLAUDE.md');
});

test('C16.6: ROADMAP marks C16.6 done (round 240) and C16.7 next; AUDIT-4 §7 says so', () => {
  const r = read('ROADMAP.md');
  assert.match(r, /^\| C16\.6 \|[^\n]*S · feito \(round 240/m);
  assert.match(r, /^\| C16\.7 \|[^\n]*S · (planned \(next\) \||feito \(round 241)/m);
  assert.match(read('docs/audits/AUDIT-4.md'), /C16\.6 done in round 240/);
});

// Round 241 (C16.7, D139): the Snapshot lines are archived like the Previous blocks, and the archive is documented where a reader looks for history.
test('C16.7: item 6, the Map (item 4), docs/state-file.md and docs/README.md name `--snapshot` and the done archive; every file the Snapshot index names exists; ROADMAP marks C16.7 done', () => {
  const s = read(statusName());
  const item = (n) => { const i = s.indexOf(`\n${n}. **`); return s.slice(i, s.indexOf('\n', i + 1)); };
  assert.match(item(6), /archive-changelog\.mjs --snapshot/);
  assert.match(item(4), /status-archive-done-\*\.md/);
  assert.match(read('docs/state-file.md'), /status-archive-done-/);
  assert.match(read('docs/README.md'), /status-archive-done-/);
  const snap = s.slice(s.indexOf('\n## Snapshot\n'), s.indexOf('\n## Next up\n'));
  const idx = snap.match(/^- Archived «Done» lines \(nothing deleted\): (.*)$/m);
  assert.ok(idx, 'the Snapshot has its index line');
  const files = [...idx[1].matchAll(/`(docs\/status-archive-done-[^`]+\.md)`/g)].map((m) => m[1]);
  assert.ok(files.length >= 1);
  for (const f of files) assert.ok(existsSync(join(root, f)), `${f} is named in the index and does not exist`);
  assert.match(read('ROADMAP.md'), /^\| C16\.7 \|[^\n]*S · feito \(round 241/m);
  assert.match(read('docs/audits/AUDIT-4.md'), /C16\.7 done in round 241/);
});

test('C16.7: the Snapshot of the status file stays short (the old lines live in docs/status-archive-done-*.md): at most 25 lines', () => {
  const s = read(statusName());
  const snap = s.slice(s.indexOf('\n## Snapshot\n'), s.indexOf('\n## Next up\n'));
  const n = snap.split('\n').filter((l) => l.startsWith('- ')).length;
  assert.ok(n <= 25, `the Snapshot has ${n} lines: run node scripts/archive-changelog.mjs --snapshot --keep-done 9`);
});
