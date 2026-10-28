// Round 232 (D-231a): the gate table in ROADMAP §9 must agree with the Gates table of the status file.
// Written before the ROADMAP edit; each assertion is red until the rows are corrected. Docs only, no gate changes state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const roadmap = readFileSync(join(root, 'ROADMAP.md'), 'utf8');
const statusName = readdirSync(root).filter((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f)).sort((a, b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1])).pop();
const status = readFileSync(join(root, statusName), 'utf8');

const section9 = roadmap.slice(roadmap.indexOf('## 9. Gates'), roadmap.indexOf('## 10.'));
const rows9 = section9.split('\n').filter((l) => /^\| G-C\d+ /.test(l));
const rowOf = (id) => rows9.find((l) => l.startsWith(`| ${id} `) || l.startsWith(`| ${id}·`));
const statusRows = status.slice(status.indexOf('## Gates'), status.indexOf('\n## ', status.indexOf('## Gates') + 5) === -1 ? undefined : undefined)
  .split('\n').filter((l) => /^\| G-C\d+ /.test(l));
const cells = (l) => l.split(/ \| /).map((c) => c.replace(/^\|\s*|\s*\|$/g, '').trim());

test('every gate CLOSED in the status file has a row in ROADMAP §9 that says it is closed', () => {
  assert.ok(statusRows.length >= 14, 'status Gates table not found');
  for (const l of statusRows) {
    const [id, , state] = cells(l);
    if (!/^CLOSED/.test(state)) continue;
    const row = rows9.find((r) => r.startsWith(`| ${id} `));
    assert.ok(row, `${id} is CLOSED in the status file but has no row in ROADMAP §9`);
    assert.match(row, /FECHADO|CLOSED|closed/, `${id} row in ROADMAP §9 does not say it is closed`);
  }
});

test('no closed gate row of ROADMAP §9 ends with the state «open»', () => {
  for (const r of rows9) {
    if (/FECHADO|CLOSED/.test(r.split(' | ')[0])) assert.doesNotMatch(r, /\| open \|$/, `${r.slice(0, 40)}… is titled closed but its state says open`);
  }
});

test('G-C3 row says which part is done and that the exFAT/FAT part is still open; G-C8 stays open in both files', () => {
  const g3 = rows9.find((r) => r.startsWith('| G-C3 '));
  assert.match(g3, /macOS[^|]*done/i);
  assert.match(g3, /exFAT\/FAT[^|]*open/i);
  const g8 = rows9.find((r) => r.startsWith('| G-C8 '));
  assert.doesNotMatch(g8, /FECHADO|CLOSED/);
  const s8 = statusRows.find((r) => r.startsWith('| G-C8 '));
  assert.match(cells(s8)[2], /^open/);
});

test('cards C5.5 and C13.4 are no longer plain «gate»: both releases were published (round 230)', () => {
  for (const id of ['C5.5', 'C13.4']) {
    const row = roadmap.split('\n').find((l) => l.startsWith(`| ${id} |`));
    assert.ok(row, `${id} not found`);
    assert.doesNotMatch(row, /\| gate \|$/, `${id} still ends with a bare «gate»`);
    assert.match(row, /CLOSED|closed|published/);
  }
});
