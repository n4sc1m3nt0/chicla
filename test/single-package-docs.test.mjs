// Round 279 (D148, M23): the decision to ship ONE npm package is recorded, and the thin-package runbook of round 278 carries a stop sign.
// Written before the text; each assertion is red until it exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const row = (text, prefix) => text.split('\n').find((l) => l.startsWith(prefix)) ?? '';

test('ROADMAP D148: one package, D-A confirmed in Rodrigo\'s words (D-B, D-C and D-D confirmed in round 280: see chicla-single-package.test.mjs)', () => {
  const d = row(read('ROADMAP.md'), '| D148 |');
  assert.ok(d, 'D148 is missing');
  assert.match(d, /quero ficar com um só/);
  assert.match(d, /ok vamos com a opção 1/);
  assert.match(d, /publish-time merge|assembled when it is published/i);
  for (const part of ['D-A', 'D-B', 'D-C', 'D-D', '0.2.0', 'chicla/zip', 'npm deprecate']) assert.ok(d.includes(part), `D148 does not mention ${part}`);
  assert.match(d, /proposed by Claude, CONFIRMED by Rodrigo/);
  assert.match(d, /G-C11/, 'it must say why the physical merge was not chosen (the pin moves, G-C11 again)');
});

test('ROADMAP M23: C23.1 to C23.3 done (C23.4 closed in round 282)', () => {
  const r = read('ROADMAP.md');
  assert.match(r, /### M23 — One package: `chicla`/);
  assert.match(row(r, '| C23.1 |'), /feito \(round 279/);
  assert.match(row(r, '| C23.2 |'), /feito \(round 280/);
  assert.match(row(r, '| C23.3 |'), /feito \(round 281/);
  assert.ok(row(r, '| C23.4 |'), 'C23.4 must be listed');
});

test('ROADMAP and status: G-C16 now means the single package 0.2.0 and the two deprecations, not the thin 0.1.1', () => {
  const g = row(read('ROADMAP.md'), '| G-C16 ');
  assert.match(g, /0\.2\.0/);
  assert.match(g, /deprecate/);
  assert.doesNotMatch(g, /Releasing chicla 0\.1\.1/);
  assert.match(statusWithArchives(root), /\| G-C16 \|[^\n]*0\.2\.0[^\n]*\| (open|CLOSED by Rodrigo) /);
});

test('docs/release.md: the thin-package runbook is gone (C23.3 replaced it by «Releasing chicla 0.2.0»; see retire-packages.test.mjs)', () => {
  const s = read('docs/release.md');
  assert.ok(!s.includes('## Releasing chicla 0.1.1 (round 278, D147)'));
  assert.ok(s.includes('## Releasing chicla 0.2.0'));
});

test('status file: round 279 and the open D-B, D-C, D-D decisions are in the newest status file', () => {
  const s = statusWithArchives(root);
  assert.match(s, /- Done: round 279 \(2026-10-28; Rodrigo: «ok vamos com a opção 1»/);
  assert.match(s, /Last updated \(round 279\):|Previous \(round 279\):/);
  assert.match(s, /round 279: \*\*D148 opened;\*\*/);
});
