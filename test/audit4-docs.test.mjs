// Round 233b (D-234a, D-234b, D-234c): the audit of 2026-10-22 is recorded as docs/audits/AUDIT-4.md and its plan is in ROADMAP (D137, M16, cards C16.1 to C16.6).
// Written before the docs; red until they exist. Docs only: no source, the pin does not move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusText, statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const AUDIT = 'docs/audits/AUDIT-4.md';
const CARDS = ['C16.1', 'C16.2', 'C16.3', 'C16.4', 'C16.5', 'C16.6'];

test('AUDIT-4 exists, has the sections of an audit, and a plan with one block per card', () => {
  assert.ok(existsSync(join(root, AUDIT)), `${AUDIT} missing`);
  const a = read(AUDIT);
  for (const h of ['## 1. What is good', '## 2. Security', '## 3. Performance', '## 4. Tokens', '## 5. Different approach', '## 6. Plan, one round per card']) assert.ok(a.includes(h), `section «${h}» missing`);
  for (const c of CARDS) assert.ok(new RegExp(`^### ${c.replace('.', '\\.')} `, 'm').test(a), `plan block for ${c} missing`);
});

test('every plan block says its files (at most 3 source files), its tests first, whether the pin moves, and how it is checked', () => {
  const plan = read(AUDIT).split('## 6. Plan, one round per card')[1];
  const blocks = plan.split(/^### /m).slice(1);
  assert.equal(blocks.length, CARDS.length);
  for (const b of blocks) for (const k of ['Source files:', 'Tests first:', 'Pin:', 'Done when:']) assert.ok(b.includes(k), `«${k}» missing in «${b.slice(0, 12)}»`);
});

test('the decisions Rodrigo confirmed are recorded: D-234a yes, D-234b docs round first, D-234c refuse .tar.gz', () => {
  const a = read(AUDIT);
  for (const d of ['D-234a', 'D-234b', 'D-234c']) assert.ok(a.includes(d), `${d} missing in AUDIT-4`);
  assert.match(a, /D-234c[^\n]*(refuse|recusa)[^\n]*\.tar\.gz/i);
});

test('the stale finding is corrected: MAX_CENTRAL is 64 MiB (C15.6) and big-cm.log is an old measurement, not a contradiction', () => {
  const a = read(AUDIT);
  assert.match(a, /big-cm\.log[^\n]*(old|stale|1 GiB)/i);
  assert.match(a, /C15\.6/);
});

test('ROADMAP: decision D137 and milestone M16 with the six cards; docs/README lists the audit', () => {
  const r = read('ROADMAP.md');
  assert.match(r, /^\| D137 \|/m);
  assert.match(r, /^### M16 /m);
  for (const c of CARDS) assert.match(r, new RegExp(`^\\| ${c.replace('.', '\\.')} \\|`, 'm'), `${c} row missing`);
  assert.ok(/AUDIT-4/.test(read('docs/README.md')), 'docs/README.md does not list AUDIT-4');
});

test('the status file (the newest one) names the audit and the cards of M16', () => {
  const s = statusWithArchives(); // the archive rules move lines: a name is looked for in the file and its verbatim archives (C19.3)
  assert.ok(s.includes('C16.1') && s.includes('AUDIT-4'));
});
