// Round 228: the Decisions page of the panel. The «Next up» paragraph is one long line with the rounds in parentheses; the page lays it out by SHAPE (a heading per round, the newest in full, older ones cut to one line, «Rodrigo's to do» as a bulleted list), never by the project's wording beyond the labels «Round N», «Earlier» and «Rodrigo's to do».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const panel = await import(pathToFileURL(join(ROOT, 'packages/chicla-kit/src/panel.mjs')).href);
const { stripAnsi } = await import(pathToFileURL(join(ROOT, 'packages/chicla-kit/src/ui.mjs')).href);

const NEXT = "**Open decisions:** (round 9: none new; the layout is Rodrigo's request, no call made; **Rodrigo's to do** as before.) (Round 8: none new; the colours are a fix of round 7, no call made, and a long tail so that this older entry is surely cut by the width of the box.) One call made on delegation in round 6: keep the rule; Claude suggests keeping it. **Rodrigo's to do:** run the checks (see `docs/release.md`; twice); push and read the CI; keep the file. Suggested next task: the release. (Earlier text: none new; old.)";
const data = (next) => ({ root: '.', statusFile: 'CHICLA_PROJECT_STATUS-1.md', version: null, updated: null, next, gates: [], delivery: null });
const page = (next, { width = 60, on = false } = {}) => panel.renderPanel(data(next), 2, { width, on }).split('\n').slice(2, -2).map((l) => stripAnsi(l).replace(/^│ /, '').replace(/ │$/, '').replace(/\s+$/, ''));

test('Decisions page: a heading, one block per round, the newest in full, the to-dos as bullets', () => {
  const L = page(NEXT, { width: 100 });
  assert.equal(L[0], 'Open decisions');
  const i = L.indexOf('Round 9');
  assert.ok(i > 0, 'the newest round has its own heading line');
  assert.equal(L[i + 1], "  none new; the layout is Rodrigo's request, no call made", 'its text is indented under the heading, without ** or backticks or the dangling «;»');
  assert.equal(L[i + 2], '  To do'); assert.equal(L[i + 3], '  • as before.');
  assert.ok(L.includes('Note'), 'the text between rounds gets its own block');
  assert.ok(L.includes('  To do'), '«Rodrigo\'s to do» becomes a labelled list');
  for (const item of [/^ {2}• run the checks \(see docs\/release\.md; twice\)$/, /^ {2}• push and read the CI$/, /^ {2}• keep the file\./]) assert.ok(L.some((l) => item.test(l)), `a bullet for ${item}`);
  assert.ok(!L.join('\n').includes('**') && !L.join('\n').includes('`'));
});

test('Decisions page: older rounds are one line each, cut with «…» when long; nothing else is lost', () => {
  const L = page(NEXT);
  const old = L.filter((l) => /^Round 8\b/.test(l));
  assert.equal(old.length, 1, 'one line for the older round');
  assert.ok(old[0].endsWith('…') && [...old[0]].length <= 56);
  assert.ok(L.includes('Earlier text: none new; old.'), 'a short older entry is shown whole');
  assert.ok(L.some((l) => /^Older entries/.test(l)), 'the shortened lines are announced');
  assert.ok(L.some((l) => /call made on delegation in round 6/.test(l)), 'the note outside the parentheses is kept');
});

test('Decisions page: every line fits, no escape code when off, the same text when on', () => {
  for (const width of [30, 50, 80, 100]) for (const l of page(NEXT, { width })) assert.ok([...l].length <= Math.max(30, width) - 4, `too wide at ${width}: ${l}`);
  assert.ok(!panel.renderPanel(data(NEXT), 2, { width: 60, on: false }).includes('\u001b['));
  const on = panel.renderPanel(data(NEXT), 2, { width: 60, on: true });
  assert.ok(on.includes('\u001b['));
  assert.deepEqual(page(NEXT, { on: true }), page(NEXT, { on: false }));
});

test('Decisions page: a plain paragraph with no rounds has no «Note» heading; other lines are kept as before; no text shows the old message', () => {
  const L = page('**Open decisions:** D7 (suggestion: yes). **Task: the next thing.**\n\nAnother line.');
  assert.equal(L[0], 'Open decisions');
  assert.ok(!L.includes('Note'));
  assert.ok(L.some((l) => /D7 \(suggestion: yes\)\. Task: the next thing\./.test(l)));
  assert.ok(L.includes('Another line.'));
  assert.match(page(null).join('\n'), /no «Next up» section found/);
});

test('Decisions page: a group that never closes (the real file has one) is still an entry, shown as an older line, not as text', () => {
  const L = page('**Open decisions:** (round 3: newest, here) Between. (Earlier text: old (nested one) never closed; and more');
  assert.ok(L.includes('Round 3'));
  assert.ok(L.some((l) => /^Earlier text: old \(nested one\) never closed; and more$/.test(l)), 'one dim line');
  assert.ok(!L.includes('  Earlier text: old (nested one) never closed; and more'), 'not folded into the Note');
});
