// Round 256 (Rodrigo: «d-255a sim»): the audit of 2026-10-27 is recorded as docs/audits/AUDIT-6.md and its plan is in ROADMAP (D142, M19, cards C19.1 to C19.5).
// Written before the docs; red until they exist. Docs only: no source, the pin does not move. It reads the status file AND its archives (the lesson of F-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusText, statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const AUDIT = 'docs/audits/AUDIT-6.md';
const CARDS = ['C19.1', 'C19.2', 'C19.3', 'C19.4', 'C19.5'];

test('AUDIT-6 exists, has the sections of an audit, and a plan with one block per card', () => {
  assert.ok(existsSync(join(root, AUDIT)), `${AUDIT} missing`);
  const a = read(AUDIT);
  for (const h of ['## 1. Promised against what exists', '## 2. What is good', '## 3. Findings', '## 4. Not measured', '## 5. Plan, one round per card', '## 6. The whole kit mutant pass']) assert.ok(a.includes(h), `section «${h}» missing`);
  for (const c of CARDS) assert.ok(new RegExp(`^### ${c.replace('.', '\\.')} `, 'm').test(a), `plan block for ${c} missing`);
});

test('every plan block says its files (at most 3 source files), its tests first, whether the pin moves, and how it is checked', () => {
  const plan = read(AUDIT).split('## 5. Plan, one round per card')[1].split('## 6. ')[0];
  const blocks = plan.split(/^### /m).slice(1);
  assert.equal(blocks.length, CARDS.length);
  for (const b of blocks) for (const k of ['Source files:', 'Tests first:', 'Pin:', 'Done when:']) assert.ok(b.includes(k), `«${k}» missing in «${b.slice(0, 12)}»`);
});

test('every finding names how it was measured, and the audit says what was NOT measured (item 18)', () => {
  const a = read(AUDIT);
  const findings = a.split('## 3. Findings')[1].split('## 4. ')[0].split(/^- \*\*/m).slice(1);
  assert.ok(findings.length >= 6, 'fewer than six findings');
  for (const f of findings) assert.match(f, /measured|counted|read|ran/i, `a finding has no measurement: «${f.slice(0, 20)}»`);
  assert.match(a.split('## 4. Not measured')[1], /CI|Node 18|macOS|Windows/);
});

test('the pass of the whole kit list is recorded with a count, not left as a placeholder', () => {
  const pass = read(AUDIT).split('## 6. The whole kit mutant pass')[1];
  assert.doesNotMatch(pass, /KITPASS/);
  assert.match(pass, /\b60 mutants?\b/);
  assert.match(pass, /\bRED\b|red/);
});

test('the audit says what it changed: nothing but docs, one test and the housekeeping of item 6', () => {
  const a = read(AUDIT);
  assert.match(a, /Nothing was fixed in this round except the housekeeping/);
});

test('ROADMAP: decision D142 and milestone M19 with the five cards; docs/README lists the audit', () => {
  const r = read('ROADMAP.md');
  assert.match(r, /^\| D142 \|/m);
  assert.match(r, /^### M19 /m);
  for (const c of CARDS) assert.match(r, new RegExp(`^\\| ${c.replace('.', '\\.')} \\|`, 'm'), `${c} row missing`);
  assert.ok(/AUDIT-6/.test(read('docs/README.md')), 'docs/README.md does not list AUDIT-6');
});

test('the status file (the newest one) or its archives name the audit and the cards of M19', () => {
  const s = statusWithArchives(); // the live file and its archives (C19.3)
  assert.ok(s.includes('AUDIT-6') && s.includes('C19.1'), 'the status file or its archives name the audit and C19.1');
});
