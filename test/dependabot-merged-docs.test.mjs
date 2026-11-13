// Round 324: Rodrigo merged the three Dependabot pull requests (v7 of checkout, setup-node, upload-artifact) after checking each commit against its tag with `git ls-remote`; the records say so, and the round-323 claim that a merge makes `check-manifest` fail is corrected.
// Written before the text; each assertion is red until it exists. Only Rodrigo merged: the AI opened no pull request and ran no `gh pr merge`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const CHECKOUT = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1';
const SETUP = 'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0';
const UPLOAD = 'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2';
const count = (s, part) => s.split(part).length - 1;

test('ci.yml is what Rodrigo\'s main has after the three merges: v7.0.1 x5, v7.1.0 x5, v7.0.2 x1, and no v6 left', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.equal(count(ci, CHECKOUT), 5);
  assert.equal(count(ci, SETUP), 5);
  assert.equal(count(ci, UPLOAD), 1);
  assert.doesNotMatch(ci, /# v6\.0\.0/);
});

test('AUDIT-11 §8: the merge is recorded, with what was checked and by whom', () => {
  const a = read('docs/audits/AUDIT-11.md');
  assert.ok(a.includes('## 8. Follow-up (round 324'), 'no «## 8. Follow-up (round 324…)»');
  const f = a.slice(a.indexOf('## 8. Follow-up (round 324'));
  for (const part of ['Rodrigo merged', 'git ls-remote', '3d3c42e5', '949feb24', 'cf430e03', 'v7.0.1', 'v7.1.0', 'v7.0.2', '42512206190', '14 jobs', '@dependabot rebase', 'AI opened no pull request']) assert.ok(f.includes(part), `§8 does not say «${part}»`);
  assert.match(f, /Not seen by Claude|not seen by Claude/);
});

test('AUDIT-11 §7: the claim that a merge makes `check-manifest` fail is corrected: it compares the list of files, and the crc only changes at the next make-delivery', () => {
  const a = read('docs/audits/AUDIT-11.md');
  assert.doesNotMatch(a, /so the next `check-manifest` fails until/, 'the wrong claim is still there');
  const f = a.slice(a.indexOf('## 7. Follow-up'), a.indexOf('## 8. Follow-up'));
  assert.ok(f.includes('Corrected in round 324'), '§7 does not say it was corrected');
  const g = a.slice(a.indexOf('## 8. Follow-up'));
  for (const part of ['check-manifest', 'list of files', 'make-delivery-zip', '79']) assert.ok(g.includes(part), `§8 does not say «${part}»`);
});

test('status file: no open decision about the Dependabot pull requests; the Snapshot line of round 324 says what was merged and what was corrected', () => {
  const s = statusWithArchives();
  const line = s.split('\n').find((l) => l.startsWith('- Done: round 324 ')) ?? '';
  for (const part of ['#1', '#2', '#3', 'Rodrigo', '42512206190', 'check-manifest', 'AUDIT-11']) assert.ok(line.includes(part), `the Snapshot line of round 324 does not say «${part}»`);
  const open = s.split('\n').find((l) => l.startsWith('**Open decisions:** (round 324')) ?? '';
  assert.ok(open.length > 0, 'the «Open decisions» paragraph has no round 324 clause');
  assert.doesNotMatch(open.split('(round 323')[0], /Dependabot pull requests when he wants/);
});

test('the CHANGELOG records round 324', () => {
  const all = [read('CHANGELOG.md'), ...readdirSync(join(root, 'docs/archive/changelog')).map((f) => read(`docs/archive/changelog/${f}`))].join('\n');
  assert.match(all, /^## Round 324 /m);
});
