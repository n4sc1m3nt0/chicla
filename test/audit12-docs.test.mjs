// Round 335 (Rodrigo: «fazemos o audit e depois a publicação da atualização»): the audit after M30 is recorded as docs/audits/AUDIT-12.md, its plan is in ROADMAP (D166, M31, cards C31.1 to C31.3) and docs/README.md indexes it.
// Written before the docs; red until they exist. Docs only: no source, the pin does not move. Claude publishes nothing (CLAUDE.md product rule 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const AUDIT = 'docs/audits/AUDIT-12.md';

test('AUDIT-12 exists and has the sections of an audit', () => {
  assert.ok(existsSync(join(root, AUDIT)), `${AUDIT} missing`);
  const a = read(AUDIT);
  for (const h of ['## 1. Promised against what exists', '## 2. What is good', '## 3. Findings', '## 4. Not measured', '## 5. Plan, one round per card']) assert.ok(a.includes(h), `section «${h}» missing`);
});

test('every finding names how it was measured, and the audit says what was NOT measured', () => {
  const a = read(AUDIT);
  const findings = a.split('## 3. Findings')[1].split('## 4. ')[0].split(/^- \*\*/m).slice(1);
  assert.ok(findings.length >= 3, 'fewer than three findings');
  for (const f of findings) assert.match(f, /measured|counted|read|ran|grep|CI/i, `a finding has no measurement: «${f.slice(0, 20)}»`);
  assert.match(a.split('## 4. Not measured')[1], /Node 18|macOS|Windows|CI/);
});

test('ROADMAP has D166 and the cards C31.1 to C31.3, and docs/README.md indexes the audit', () => {
  const r = read('ROADMAP.md');
  assert.match(r, /^\| D166 \|/m);
  for (const c of ['C31.1', 'C31.2', 'C31.3']) assert.match(r, new RegExp(`^\\| ${c.replace('.', '\\.')} \\|`, 'm'), `${c} has no row`);
  assert.ok(read('docs/README.md').includes('audits/AUDIT-12.md'));
});

test('the audit and the plan say that only Rodrigo publishes', () => {
  assert.match(read(AUDIT), /only Rodrigo publishes/i);
});
