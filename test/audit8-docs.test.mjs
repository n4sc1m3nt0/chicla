// Round 283 (Rodrigo: «faz o audit final»): the audit after M23 is recorded as docs/audits/AUDIT-8.md and its plan is in ROADMAP (D149, M24, cards C24.1 to C24.5).
// Written before the docs; red until they exist. Docs only: no source, the pin does not move. It reads the status file AND its archives (the lesson of AUDIT-6 F-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const AUDIT = 'docs/audits/AUDIT-8.md';
const CARDS = ['C24.1', 'C24.2', 'C24.3', 'C24.4', 'C24.5'];

test('AUDIT-8 exists, has the sections of an audit, and a plan with one block per card', () => {
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

test('every finding names how it was measured, and the audit says what was NOT measured (item 18)', () => {
  const a = read(AUDIT);
  const findings = a.split('## 3. Findings')[1].split('## 4. ')[0].split(/^- \*\*/m).slice(1);
  assert.ok(findings.length >= 6, 'fewer than six findings');
  for (const f of findings) assert.match(f, /measured|counted|read|ran/i, `a finding has no measurement: «${f.slice(0, 20)}»`);
  assert.match(a.split('## 4. Not measured')[1], /CI|Node 18|macOS|Windows/);
});

test('the audit checked what npm serves itself, and records the two real defects of the published package', () => {
  const a = read(AUDIT);
  assert.match(a, /bd13bc23ff0c2fdd6a97d722bf0a7f7e8b84f348cc978667903fbf7bb9def1b9/, 'the sha256 npm serves is not recorded');
  assert.match(a, /ERR_MODULE_NOT_FOUND/, '`chicla recovery` failing in the published package is not recorded');
  assert.match(a, /package\.json/, 'the init / make-delivery gap is not recorded');
});

test('the audit says what it changed: nothing but docs and one test', () => {
  assert.match(read(AUDIT), /Nothing was fixed in this round except/);
});

test('ROADMAP: decision D149 and milestone M24 with the five cards; docs/README lists the audit', () => {
  const r = read('ROADMAP.md');
  assert.match(r, /^\| D149 \|/m);
  assert.match(r, /^### M24 /m);
  for (const c of CARDS) assert.match(r, new RegExp(`^\\| ${c.replace('.', '\\.')} \\|`, 'm'), `${c} row missing`);
  assert.ok(/AUDIT-8/.test(read('docs/README.md')), 'docs/README.md does not list AUDIT-8');
});

test('the status file (the newest one) or its archives name the audit and the cards of M24', () => {
  const s = statusWithArchives();
  assert.ok(s.includes('AUDIT-8') && s.includes('C24.1'), 'the status file or its archives name the audit and C24.1');
});
