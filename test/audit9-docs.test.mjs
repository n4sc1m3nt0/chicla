// Round 291 (Rodrigo: «faz a próxima auditoria», then «confirmo tudo»): the audit after M24 is recorded as docs/audits/AUDIT-9.md and its plan is in ROADMAP (D150, M25, cards C25.1 to C25.3).
// Written before the docs; red until they exist. Docs only: no source, the pin does not move. It reads the status file AND its archives (the lesson of AUDIT-6 F-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const AUDIT = 'docs/audits/AUDIT-9.md';
const CARDS = ['C25.1', 'C25.2', 'C25.3'];

test('AUDIT-9 exists and has the sections of an audit', () => {
  assert.ok(existsSync(join(root, AUDIT)), `${AUDIT} missing`);
  const a = read(AUDIT);
  for (const h of ['## 1. Promised against what exists', '## 2. What is good', '## 3. Findings', '## 4. Not measured', '## 5. Plan, one round per card']) assert.ok(a.includes(h), `section «${h}» missing`);
});

test('every finding names how it was measured, and the audit says what was NOT measured (item 18)', () => {
  const a = read(AUDIT);
  const findings = a.split('## 3. Findings')[1].split('## 4. ')[0].split(/^- \*\*/m).slice(1);
  assert.ok(findings.length >= 8, 'fewer than eight findings');
  for (const f of findings) assert.match(f, /measured|counted|read|ran|grep|killed|mutant|CI/i, `a finding has no measurement: «${f.slice(0, 20)}»`);
  assert.match(a.split('## 4. Not measured')[1], /CI|Node 18|macOS|Windows/);
});

test('the audit records its own measurements: the whole suite, the tarball sha256, the five killed mutants', () => {
  const a = read(AUDIT);
  assert.match(a, /1745 tests, 1743 pass, 0 fail, 2 skipped, 744 s/);
  assert.match(a, /fd85ea5772f6/);
  assert.match(a, /134509 bytes/);
  assert.match(a, /five hand mutants, all killed/);
});

test('the plan has the three cards and the two decisions, and says Rodrigo CONFIRMED them', () => {
  const plan = read(AUDIT).split('## 5. Plan, one round per card')[1];
  for (const c of CARDS) assert.ok(plan.includes(`**${c}`), `${c} missing in the plan`);
  for (const d of ['D-290a', 'D-290b']) assert.ok(plan.includes(d), `${d} missing`);
  assert.match(plan, /CONFIRMED by Rodrigo/);
});

test('the audit says what it changed: nothing but this file and the docs of the round', () => {
  assert.match(read(AUDIT), /Nothing was fixed in this audit except the audit itself/);
});

test('ROADMAP: decision D150 and milestone M25 with the three cards; docs/README lists the audit', () => {
  const r = read('ROADMAP.md');
  assert.match(r, /^\| D150 \|/m);
  assert.match(r, /^### M25 /m);
  for (const c of CARDS) assert.match(r, new RegExp(`^\\| ${c.replace('.', '\\.')} \\|`, 'm'), `${c} row missing`);
  assert.ok(/AUDIT-9/.test(read('docs/README.md')), 'docs/README.md does not list AUDIT-9');
});

test('the status file (the newest one) or its archives name the audit and the cards of M25; the CHANGELOG has round 291 on top', () => {
  const s = statusWithArchives();
  assert.ok(s.includes('AUDIT-9') && s.includes('C25.1'), 'the status file or its archives name the audit and C25.1');
  assert.match(read('CHANGELOG.md'), /^## Round 291 /m);
});
