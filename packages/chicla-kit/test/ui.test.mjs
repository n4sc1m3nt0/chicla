// C11.5 slice a (D93): ui.mjs, pure drawing functions (data in, text out). No I/O, no process, no dependencies. Nothing calls it yet; slice b wires it, only on an interactive terminal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldStyle, paint, stripAnsi, width, pad, truncate, box, table, bar, SPINNER, spinnerFrame, styleSummary } from '../src/ui.mjs';

test('shouldStyle: only an interactive terminal, never --json, CI, NO_COLOR or TERM=dumb', () => {
  assert.equal(shouldStyle({ isTTY: true, env: {} }), true);
  assert.equal(shouldStyle({ isTTY: false, env: {} }), false);
  assert.equal(shouldStyle({ isTTY: true, env: {}, json: true }), false);
  assert.equal(shouldStyle({ isTTY: true, env: { CI: 'true' } }), false);
  assert.equal(shouldStyle({ isTTY: true, env: { NO_COLOR: '1' } }), false);
  assert.equal(shouldStyle({ isTTY: true, env: { NO_COLOR: '' } }), true, 'an empty NO_COLOR does not count (no-color.org)');
  assert.equal(shouldStyle({ isTTY: true, env: { TERM: 'dumb' } }), false);
  assert.equal(shouldStyle({}), false);
});

test('paint: escape codes only when on; an unknown style is refused', () => {
  assert.equal(paint('x', 'green', false), 'x');
  assert.equal(paint('x', 'green', true), '\u001b[32mx\u001b[0m');
  assert.equal(stripAnsi(paint('x', 'bold', true)), 'x');
  assert.throws(() => paint('x', 'purple-ish', true), /unknown style/);
});

test('width, pad and truncate count characters, not escape codes', () => {
  const s = paint('abc', 'red', true);
  assert.equal(width(s), 3);
  assert.equal(stripAnsi(pad(s, 6)), 'abc   ');
  assert.equal(pad('abc', 6, 'right'), '   abc');
  assert.equal(pad('abcdef', 3), 'abcdef');
  assert.equal(truncate('abcdef', 4), 'abc…');
  assert.equal(truncate('abc', 4), 'abc');
  assert.equal(truncate('abc', 0), '');
});

test('box: title in the top edge, every line the same width, content padded; long lines are cut', () => {
  const out = box('Status', ['one', 'a much longer line than the box'], { width: 20 }).split('\n');
  assert.equal(out.length, 4);
  assert.ok(out[0].startsWith('┌─ Status ') && out[0].endsWith('┐'));
  assert.ok(out[3].startsWith('└') && out[3].endsWith('┘'));
  for (const l of out) assert.equal(width(l), 20, l);
  assert.ok(out[2].includes('…'));
});

test('box and table are plain text when `on` is false (no escape codes at all)', () => {
  assert.ok(!/\u001b/.test(box('T', ['x'], { width: 12, on: false })));
  assert.ok(!/\u001b/.test(table(['a'], [['b']], { on: false })));
  assert.ok(/\u001b/.test(box('T', ['x'], { width: 12, on: true })));
});

test('table: columns aligned to the widest cell, header and a rule, right-aligned numbers', () => {
  const out = table(['File', 'Size'], [['a.txt', 5], ['long-name.mjs', 1234]], { on: false, align: ['left', 'right'] }).split('\n');
  assert.deepEqual(out, ['File           Size', '-------------  ----', 'a.txt             5', 'long-name.mjs  1234']);
  assert.equal(table(['A'], [], { on: false }), 'A\n-');
});

test('bar: a ratio clamped to 0..1 over a fixed width', () => {
  assert.equal(bar(0.5, 10), '█████░░░░░');
  assert.equal(bar(0, 4), '░░░░');
  assert.equal(bar(2, 4), '████');
  assert.equal(bar(-1, 4), '░░░░');
  assert.equal(bar(Number.NaN, 4), '░░░░');
});

test('spinnerFrame cycles over the frames, also for a negative or huge index', () => {
  assert.ok(SPINNER.length >= 4);
  assert.equal(spinnerFrame(0), SPINNER[0]);
  assert.equal(spinnerFrame(SPINNER.length), SPINNER[0]);
  assert.equal(spinnerFrame(-1), SPINNER[SPINNER.length - 1]);
});

test('ui.mjs has no imports and touches no process or file system', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui.mjs', import.meta.url), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(!/^\s*import\b|\bimport\s*\(|\brequire\b|\bprocess\b|node:/m.test(src));
});

// ---- slice b (D93 (b)): styleSummary paints only the marks of summary lines, never file lists ----

test('styleSummary: with `on` false the text comes back byte for byte', () => {
  const t = '✓ ok\n  ✗ bad\n⚠ warn\n  some/file.txt\n\nplain';
  assert.equal(styleSummary(t, false), t);
  assert.equal(styleSummary(t), t);
});

test('styleSummary: ✓ green, ✗ red, ⚠ yellow at the start of a line (indent kept); the rest of the line is untouched', () => {
  const out = styleSummary('✓ ok\n  ✗ bad\n⚠ warn', true).split('\n');
  assert.equal(out[0], paint('✓', 'green', true) + ' ok');
  assert.equal(out[1], '  ' + paint('✗', 'red', true) + ' bad');
  assert.equal(out[2], paint('⚠', 'yellow', true) + ' warn');
});

test('styleSummary: file lists, blank lines and marks inside a line stay plain; stripping the codes gives the input back', () => {
  const t = '\n✗ 2 LOST file(s):\n  a/b.txt\n  ✓-looking.txt\nnot a ✓ mark\n';
  const out = styleSummary(t, true);
  const lines = out.split('\n');
  assert.equal(lines[0], '');
  assert.equal(lines[2], '  a/b.txt');
  assert.equal(lines[3], '  ✓-looking.txt', 'a mark glued to a name is not a summary mark');
  assert.equal(lines[4], 'not a ✓ mark');
  assert.equal(stripAnsi(out), t);
});

test('styleSummary: handles CRLF and an empty string', () => {
  assert.equal(styleSummary('', true), '');
  assert.equal(stripAnsi(styleSummary('✓ a\r\n✗ b', true)), '✓ a\r\n✗ b');
});

test('box: a painted line that fits keeps its escape codes; one that is too long is cut on its visible text and never mid-escape', () => {
  const ok = box('T', [paint('ab', 'green', true)], { width: 12, on: false }).split('\n')[1];
  assert.ok(ok.includes('\u001b[32mab\u001b[0m')); assert.equal(width(ok), 12);
  const cut = box('T', [paint('abcdefghijklmnop', 'green', true)], { width: 12, on: false }).split('\n')[1];
  assert.equal(width(cut), 12); assert.ok(stripAnsi(cut).includes('abcdefg…'), 'cut on the visible text: 7 characters and «…»'); assert.ok(!/\u001b(?!\[[0-9;]*m)/.test(cut));
});

test('paint: blue and white are LETTER colours (94 and 97, bold), never a background, and always reset', () => {
  assert.ok(/^\u001b\[1;94mx\u001b\[0m$/.test(paint('x', 'blue', true)), 'blue: bold bright blue letters');
  assert.ok(/^\u001b\[1;97mx\u001b\[0m$/.test(paint('x', 'white', true)), 'white: bold bright white letters');
  for (const st of ['blue', 'white']) assert.ok(!/\u001b\[[0-9;]*(?:;|\[)(?:4[0-7]|10[0-7])(?:;|m)/.test(paint('x', st, true)), `${st} sets no background`);
  assert.equal(paint('x', 'blue', false), 'x'); assert.equal(paint('x', 'white', false), 'x');
  assert.throws(() => paint('x', 'blueBg', true)); assert.throws(() => paint('x', 'whiteBg', true));
});
