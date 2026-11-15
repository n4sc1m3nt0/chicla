// Round 336 (Rodrigo: «ok, 1: construir primeiro»): D166 is confirmed (D-A, D-B, D-C), D167 records the release automation inside chicla (M32, cards C32.1 to C32.4) and its place before the release of 0.4.0.
// Docs only: no source, the pin does not move. The rule change («the AI never runs `chicla release publish`») is NOT recorded as done: `ok` does not cover a rule, it stays open for Rodrigo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const R = readFileSync(join(root, 'ROADMAP.md'), 'utf8');
const row = (id) => R.split('\n').find((l) => l.startsWith(`| ${id} |`)) ?? '';

test('D166 is CONFIRMED by Rodrigo with its date and his words', () => {
  assert.match(row('D166'), /CONFIRMED by Rodrigo \(2026-11-15, «ok, 1: construir primeiro»\)/);
});

test('D167 records the release automation: check, prepare, publish; only Rodrigo publishes; the rule change is open', () => {
  const d = row('D167');
  assert.ok(d, 'D167 missing');
  for (const w of ['release check', 'release prepare', 'release publish', 'only Rodrigo publishes']) assert.ok(d.includes(w), `D167 lacks «${w}»`);
  assert.match(d, /interactive terminal/i);
  assert.match(d, /D-3[^|]*(open|waits for Rodrigo)/i);
  assert.doesNotMatch(d, /CLAUDE\.md[^|]*(was changed|is changed|changed in round)/i);
});

test('M32 has C32.1 to C32.4 in this order, and the order with C31 is written: C31.3 comes after the release command', () => {
  const ids = ['C32.1', 'C32.2', 'C32.3', 'C32.4'];
  const at = ids.map((c) => R.indexOf(`\n| ${c} |`));
  assert.ok(at.every((i) => i > 0), 'a card of M32 has no row');
  assert.deepEqual([...at].sort((a, b) => a - b), at);
  assert.match(R, /### M32 —/);
  assert.match(row('C31.3'), /after M32|C32\.4/);
});
