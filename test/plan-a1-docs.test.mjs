// Round 242 (Rodrigo: «avança para uma ronda só de plano do A-1, o A-2 fica para depois»; D138, AUDIT-4 §5 A-1): the plan of the shared integrity check is written
// down before any code: docs/plan-a1-integrity.md, ROADMAP D140 and milestone M17 (C17.1 to C17.4). Written before the docs; red until they exist.
// Docs only: no source, nothing pinned touched, the pin does not move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusText, statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const PLAN = 'docs/plan-a1-integrity.md';
const CARDS = ['C17.1', 'C17.2', 'C17.3', 'C17.4'];
const planBlocks = () => read(PLAN).split('## 5. Plan, one round per card')[1].split(/^### /m).slice(1);

test('the plan exists and has its sections', () => {
  assert.ok(existsSync(join(root, PLAN)), `${PLAN} missing`);
  const p = read(PLAN);
  for (const h of ['## 1. What A-1 asks', '## 2. Who checks what today', '## 3. Design', '## 4. What stays out of A-1', '## 5. Plan, one round per card', '## 6. Open decisions']) assert.ok(p.includes(h), `section «${h}» missing`);
});

test('§2 is a table of the rules against the three tools, and records the experiment: a delivery with CRLF, a wrong pin and a stale hash was built and verified', () => {
  const p = read(PLAN).split('## 2. Who checks what today')[1].split('## 3. Design')[0];
  for (const tool of ['check-manifest', 'verify-delivery', 'bump-round']) assert.ok(p.includes(tool), `${tool} missing in §2`);
  for (const rule of ['CRLF', 'pin', 'fingerprint', 'secret', 'status file']) assert.ok(new RegExp(rule, 'i').test(p), `rule «${rule}» missing in §2`);
  assert.match(p, /delivery created and verified/i, 'the experiment result is not recorded');
});

test('§3 keeps the verifier independent: the shared module does no I/O, each tool brings its own reader, and the module is not pinned nor read by the dump (D7)', () => {
  const p = read(PLAN).split('## 3. Design')[1].split('## 4.')[0];
  assert.match(p, /integrity\.mjs/);
  assert.match(p, /no I\/O|does no I\/O/i);
  assert.match(p, /independent/i);
  assert.match(p, /D7/);
  assert.match(p, /not pinned|outside `?RECOVER/i);
});

test('the plan has one block per card; each says its source files (at most 3), tests first, the pin, and done-when', () => {
  const blocks = planBlocks();
  assert.equal(blocks.length, CARDS.length);
  CARDS.forEach((c, i) => assert.ok(blocks[i].startsWith(c + ' '), `block ${i + 1} should be ${c}, is «${blocks[i].slice(0, 12)}»`));
  for (const b of blocks) {
    for (const k of ['Source files:', 'Tests first:', 'Pin:', 'Done when:']) assert.ok(b.includes(k), `«${k}» missing in «${b.slice(0, 12)}»`);
    const src = b.split('\n').find((l) => l.startsWith('- **Source files:**')) ?? b.split('\n').find((l) => l.includes('Source files:'));
    assert.ok((src.match(/\.mjs/g) ?? []).length <= 3, `more than 3 source files in «${b.slice(0, 12)}»`);
    assert.match(b.split('\n').find((l) => l.includes('Pin:')), /does not move/i, `the pin must not move in «${b.slice(0, 12)}»`);
  }
});

test('§4 names what stays out: A-2, the status-file regex copies that stay, the dump copy, and the crc check of the tree', () => {
  const p = read(PLAN).split('## 4. What stays out of A-1')[1].split('## 5.')[0];
  for (const k of ['A-2', 'emergency-dump', 'recovery-report', 'crc32']) assert.ok(p.includes(k), `«${k}» missing in §4`);
});

test('§6 lists the open decisions D-242a to D-242d, each with a suggestion', () => {
  const p = read(PLAN).split('## 6. Open decisions')[1];
  for (const d of ['D-242a', 'D-242b', 'D-242c', 'D-242d']) assert.ok(p.includes(d), `${d} missing`);
  assert.ok((p.match(/Claude suggests/g) ?? []).length >= 4, 'each decision needs «Claude suggests»');
});

test('ROADMAP: D138 says the A-1 plan is written and A-2 waits; D140 exists; M17 has the four cards; docs/README lists the plan', () => {
  const r = read('ROADMAP.md');
  const d138 = r.split('\n').find((l) => l.startsWith('| D138 |'));
  assert.match(d138, /A-2 waits/);
  assert.match(d138, /plan[^|]*(round 242|docs\/plan-a1-integrity)/i);
  assert.match(r, /^\| D140 \|/m);
  assert.match(r, /^### M17 /m);
  for (const c of CARDS) assert.match(r, new RegExp(`^\\| ${c.replace('.', '\\.')} \\|`, 'm'), `${c} row missing`);
  assert.ok(read('docs/README.md').includes('plan-a1-integrity.md'), 'docs/README.md does not list the plan');
});

test('the status file (the newest one) names the plan, D140, and keeps A-2 for later, or says it is closed (round 272)', () => {
  const s = statusWithArchives(), live = statusText(); // names: file + archives (C19.3); the Next up block: the live file
  assert.ok(s.includes('plan-a1-integrity') && s.includes('D140') && s.includes('C17.1'));
  assert.match(live.split('## Next up')[1].split('## Gates')[0], /A-2[^.]*(depois|later|waits|closed)/i); // round 272 (D144, C21.2): A-2 was planned and closed, so «closed» is the newer true state
});
