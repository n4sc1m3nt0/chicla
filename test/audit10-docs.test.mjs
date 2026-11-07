// Round 311 (Rodrigo: «confirmo tudo, avança» to D157 and to the audit after M27): the audit is recorded as docs/audits/AUDIT-10.md and its plan is in ROADMAP (D158, M28, cards C28.1 to C28.5).
// Written before the docs; red until they exist. Docs only: no source, the pin does not move. It reads the status file AND its archives (the lesson of AUDIT-6 F-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const statusFile = () => readdirSync(root).find((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f));
const AUDIT = 'docs/audits/AUDIT-10.md';
const CARDS = ['C28.1', 'C28.2', 'C28.3', 'C28.4', 'C28.5'];

test('AUDIT-10 exists and has the sections of an audit', () => {
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

test('the audit records its own measurements: the whole suite, the smoke, the tarball, the mutants', () => {
  const a = read(AUDIT);
  assert.match(a, /1869 tests, 1867 pass, 0 fail, 2 skipped, 668 s/);
  assert.match(a, /80 steps/);
  assert.match(a, /143047 bytes/);
  assert.match(a, /ef00035c7ca6/);
  assert.match(a, /six hand mutants/);
});

test('the plan has the five cards and the three decisions, and says whether Rodrigo CONFIRMED them', () => {
  const plan = read(AUDIT).split('## 5. Plan, one round per card')[1];
  for (const c of CARDS) assert.ok(plan.includes(`**${c}`), `${c} missing in the plan`);
  for (const d of ['D-310a', 'D-310b', 'D-310c']) assert.ok(plan.includes(d), `${d} missing`);
  assert.match(plan, /PROPOSED|CONFIRMED by Rodrigo/);
});

test('the audit says what it changed: the audit itself and the round 310 wording it corrects', () => {
  assert.match(read(AUDIT), /Nothing was fixed in this audit except the audit itself and the wording of round 310 named in F-1/);
});

test('round 310 wording: the job is `pack-chicla`, not `pack` (AUDIT-10 F-1)', () => {
  const live = read('CHANGELOG.md').split('## Round 309 ')[0];
  assert.ok(!/the `pack` job/.test(live), 'the live round 310 entry still says «the `pack` job»');
  const line = statusWithArchives().split('\n').find((l) => l.startsWith('- Done: round 310 ')) ?? ''; // the line may have been rotated into docs/archive/status/ (round 319): look in the archives too
  assert.ok(line.length > 0, 'the Snapshot line of round 310 is nowhere');
  assert.ok(!/`pack` job/.test(line), 'the round 310 Snapshot line still says the `pack` job');
});

test('ROADMAP: decision D158, D157 confirmed, milestone M28 with the five cards; docs/README lists the audit', () => {
  const r = read('ROADMAP.md');
  assert.match(r, /^\| D158 \|/m);
  assert.match(r, /^\| D157 \|[^\n]*CONFIRMED by Rodrigo/m);
  assert.match(r, /^### M28 /m);
  for (const c of CARDS) assert.match(r, new RegExp(`^\\| ${c.replace('.', '\\.')} \\|`, 'm'), `${c} row missing`);
  assert.ok(/AUDIT-10/.test(read('docs/README.md')), 'docs/README.md does not list AUDIT-10');
});

test('the status file (the newest one) or its archives name the audit and the cards of M28; the CHANGELOG has round 311', () => {
  const s = statusWithArchives();
  assert.ok(s.includes('AUDIT-10') && s.includes('C28.1'), 'the status file or its archives name the audit and C28.1');
  const all = [read('CHANGELOG.md'), ...readdirSync(join(root, 'docs/archive/changelog')).map((f) => read(`docs/archive/changelog/${f}`))].join('\n');
  assert.match(all, /^## Round 311 /m);
});
