// Round 319 (Rodrigo: «avança»): AUDIT-11 F-8, the correction of a record of mine: the `main` of the repository is at round 304 (version 0.0.308), not 308. Round 317 (Rodrigo: «faz o audit antes de eu publicar», then «Continuar»): the audit after M28 and before the release 0.3.0 is recorded as docs/audits/AUDIT-11.md; its plan is in ROADMAP (D159, M29, cards C29.1 to C29.4).
// Written before the docs; red until they exist. Docs only: no source, the pin does not move. It reads the status file AND its archives through the helper (AUDIT-6 F-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const AUDIT = 'docs/audits/AUDIT-11.md';
const CARDS = ['C29.1', 'C29.2', 'C29.3', 'C29.4'];

test('AUDIT-11 exists and has the sections of an audit', () => {
  assert.ok(existsSync(join(root, AUDIT)), `${AUDIT} missing`);
  const a = read(AUDIT);
  for (const h of ['## 1. Promised against what exists', '## 2. What is good', '## 3. Findings', '## 4. Not measured', '## 5. Plan, one round per card']) assert.ok(a.includes(h), `section «${h}» missing`);
});

test('every finding names how it was measured, and the audit says what was NOT measured (item 18)', () => {
  const a = read(AUDIT);
  const findings = a.split('## 3. Findings')[1].split('## 4. ')[0].split(/^- \*\*/m).slice(1);
  assert.ok(findings.length >= 6, 'fewer than six findings');
  for (const f of findings) assert.match(f, /measured|counted|read|ran|grep|simulat|clone|CI/i, `a finding has no measurement: «${f.slice(0, 20)}»`);
  assert.match(a.split('## 4. Not measured')[1], /logs zip|Windows|macOS|kit mutants/);
});

test('the audit records its own measurements: the repository state, the simulated push, the registry, Node 18 and 20', () => {
  const a = read(AUDIT);
  assert.match(a, /`main`[^\n]{0,80}round 304/);
  assert.match(a, /0\.0\.308/);
  assert.match(a, /188 files/);
  assert.match(a, /1847 tests, 1845 pass, 0 fail, 2 skipped/);
  assert.match(a, /554cbbc7/);
  assert.match(a, /Node 18\.20\.8/);
  assert.match(a, /Node 20\.20\.2/);
  assert.match(a, /1899 tests, 1897 pass, 0 fail, 2 skipped/);
});

test('the audit gives the cleanup command that was validated, and says Claude published nothing', () => {
  const a = read(AUDIT);
  assert.ok(a.includes('git rm -r -q --ignore-unmatch --') && a.includes('git rm -r -q --cached --ignore-unmatch --') && a.includes('docs/' + 'status-archive-*') && a.includes('CHICLA_PROJECT_STATUS-309.md') && a.includes('t.mjs'));
  assert.match(a, /Claude published nothing|Claude never publishes/);
});

test('the plan has the four cards and the two decisions, and says whether Rodrigo CONFIRMED them', () => {
  const plan = read(AUDIT).split('## 5. Plan, one round per card')[1];
  for (const c of CARDS) assert.ok(plan.includes(`**${c}`), `${c} missing in the plan`);
  for (const d of ['D-317a', 'D-317b']) assert.ok(plan.includes(d), `${d} missing`);
  assert.match(plan, /PROPOSED|CONFIRMED by Rodrigo/);
});

test('the audit says what it changed: only itself, and it names the records with the wrong date', () => {
  const a = read(AUDIT);
  assert.match(a, /Nothing was fixed in this audit except the audit itself/);
  assert.match(a, /2026-11-05/);
});

test('ROADMAP: decision D159, milestone M29 with the four cards; docs/README lists the audit', () => {
  const r = read('ROADMAP.md');
  assert.match(r, /^\| D159 \|/m);
  assert.match(r, /^### M29 /m);
  for (const c of CARDS) assert.match(r, new RegExp(`^\\| ${c.replace('.', '\\.')} \\|`, 'm'), `${c} row missing`);
  assert.ok(/AUDIT-11/.test(read('docs/README.md')), 'docs/README.md does not list AUDIT-11');
});

test('the status file (the newest one) or its archives name the audit and the cards of M29; the CHANGELOG has round 317', () => {
  const s = statusWithArchives();
  assert.ok(s.includes('AUDIT-11') && s.includes('C29.1'), 'the status file or its archives name the audit and C29.1');
  const all = [read('CHANGELOG.md'), ...readdirSync(join(root, 'docs/archive/changelog')).map((f) => read(`docs/archive/changelog/${f}`))].join('\n');
  assert.match(all, /^## Round 317 /m);
});

test('F-8 (AUDIT-11, round 319): the audit says the `main` is at round 304 and names the record it corrects; no live record still says round 308 for the `main`', () => {
  const a = read(AUDIT);
  assert.match(a, /\*\*F-8 \(record, mine\)/);
  assert.match(a, /round 304[^\n]{0,200}0\.0\.308|0\.0\.308[^\n]{0,200}round 304/);
  const wrong = /`main`[^\n]{0,60}round 308|nothing after round 308|rounds 309 to 31[67] were never pushed/;
  for (const [name, text] of [['AUDIT-11', a], ['ROADMAP', read('ROADMAP.md')], ['docs/README.md', read('docs/README.md')], ['CHANGELOG', read('CHANGELOG.md').split('## Round 316 ')[0]], ['status file', statusWithArchives()]]) {
    assert.ok(!wrong.test(text), `${name} still says that the main is at round 308`);
  }
});

test('F-1 (AUDIT-11, round 319): the cleanup command is the one that works in zsh: quoted globs, --ignore-unmatch, --cached for what stays on disk', () => {
  const a = read(AUDIT);
  assert.ok(a.includes("'docs/" + "status-archive-*'"));
  assert.ok(!/git rm -r -q -- CHANGELOG-archive-rounds-\*\.md/.test(a), 'the unquoted glob that zsh refuses is still in the audit');
});
