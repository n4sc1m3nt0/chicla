// Round 248 (Rodrigo: «sim» to the audit after M17): the audit of 2026-10-26 is recorded as docs/audits/AUDIT-5.md and its plan is in ROADMAP (D141, M18, cards C18.1 to C18.4).
// Written before the docs; red until they exist. Docs only: no source, the pin does not move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusText, statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const AUDIT = 'docs/audits/AUDIT-5.md';
const CARDS = ['C18.1', 'C18.2', 'C18.3', 'C18.4'];

test('AUDIT-5 exists, has the sections of an audit, and a plan with one block per card', () => {
  assert.ok(existsSync(join(root, AUDIT)), `${AUDIT} missing`);
  const a = read(AUDIT);
  for (const h of ['## 1. Promised against what exists', '## 2. What is good', '## 3. Findings', '## 4. Not measured', '## 5. Plan, one round per card']) assert.ok(a.includes(h), `section «${h}» missing`);
  for (const c of CARDS) assert.ok(new RegExp(`^### ${c.replace('.', '\\.')} `, 'm').test(a), `plan block for ${c} missing`);
});

test('every plan block says its files (at most 3 source files), its tests first, whether the pin moves, and how it is checked', () => {
  const plan = read(AUDIT).split('## 5. Plan, one round per card')[1];
  const blocks = plan.split(/^### /m).slice(1);
  assert.equal(blocks.length, CARDS.length);
  for (const b of blocks) for (const k of ['Source files:', 'Tests first:', 'Pin:', 'Done when:']) assert.ok(b.includes(k), `«${k}» missing in «${b.slice(0, 12)}»`);
});

test('every finding names where it was measured, and the audit says what was NOT measured (item 18)', () => {
  const a = read(AUDIT);
  const findings = a.split('## 3. Findings')[1].split('## 4. ')[0].split(/^- \*\*/m).slice(1);
  assert.ok(findings.length >= 5, 'fewer than five findings');
  for (const f of findings) assert.match(f, /measured|counted|read|ran/i, `a finding has no measurement: «${f.slice(0, 20)}»`);
  assert.match(a.split('## 4. Not measured')[1], /mutants|macOS|Windows|CI/i);
});

test('the audit does not claim a fix: nothing was changed outside docs and one test', () => {
  const a = read(AUDIT);
  assert.match(a, /Nothing was fixed in this round/);
});

test('ROADMAP: decision D141 and milestone M18 with the four cards; docs/README lists the audit', () => {
  const r = read('ROADMAP.md');
  assert.match(r, /^\| D141 \|/m);
  assert.match(r, /^### M18 /m);
  for (const c of CARDS) assert.match(r, new RegExp(`^\\| ${c.replace('.', '\\.')} \\|`, 'm'), `${c} row missing`);
  assert.ok(/AUDIT-5/.test(read('docs/README.md')), 'docs/README.md does not list AUDIT-5');
});

test('the status file (the newest one) names the audit and the cards of M18', () => {
  const s = statusWithArchives(); // the archive rules move lines: a name is looked for in the file and its verbatim archives (C19.3)
  assert.ok(s.includes('C18.1') && s.includes('AUDIT-5'));
});
