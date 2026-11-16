// Round 348: the publication of `chicla` 0.4.0 by Rodrigo is recorded in the docs, and he closed G-C19 and G-C11 in his own words («fecha ambas as gates»).
// Names, numbers and rules, never prose. Docs only: Claude ran nothing against git, GitHub or npm; every fact below is from his pasted output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const row = (text, start) => text.split('\n').find((l) => l.startsWith(start)) ?? '';
const SHA = '939079907bbe402dd8db0a06f1b91a14005d864816ac7fc8308db9c0ea15e708';
const status = () => statusWithArchives();
const published = () => { const s = read('docs/release.md'); const i = s.indexOf('## Published: chicla 0.4.0 (round 348'); return { s, i, text: i < 0 ? '' : s.slice(i, s.indexOf('\n## ', i + 5)) }; };

test('docs/release.md: «Published: chicla 0.4.0» sits right after the 0.4.0 runbook and before the 0.3.0 one, and says who did what and when', () => {
  const { s, i, text } = published();
  assert.ok(i > 0, 'no «## Published: chicla 0.4.0 (round 348…)» section');
  assert.ok(i > s.indexOf('## Releasing chicla 0.4.0') && i < s.indexOf('## Releasing chicla 0.3.0'), 'between the 0.4.0 runbook and the 0.3.0 one');
  for (const part of ['2026-11-16', 'chicla-v0.4.0', '08dae60', '43844959291', 'fecha ambas']) assert.ok(text.includes(part), `missing: ${part}`);
  assert.match(text, /only Rodrigo/i); assert.match(text, /the AI ran no/i);
});

test('the numbers seen in his output: the sha256 in the CI notes, the GitHub release and `npm pack`, 36 files, 166265 bytes, the same bytes as the round 347 local rebuild', () => {
  const { text } = published();
  for (const part of [SHA, '166265', '36 files', 'npm pack chicla@0.4.0', 'npm view chicla version', 'local rebuild', 'sha256:54a6534c']) assert.ok(text.includes(part), `missing: ${part}`);
});

test('what went differently is written down: `release` is not in the installed 0.3.0, the example run id, `--no-install` takes the global chicla, and the dump text for the agent', () => {
  const { text } = published();
  for (const part of ['ECOMMAND_UNKNOWN', 'run-is-head', '12345678901', '--no-install', 'NOW: present_files']) assert.ok(text.includes(part), `missing: ${part}`);
});

test('the `chicla release` section says how to run it before the version that has it is installed, and to use `npx --yes chicla@<version>`', () => {
  const s = read('docs/release.md'), first = s.split(/^## /m)[1];
  assert.ok(first.includes('node packages/chicla-kit/src/cli.mjs release'), 'no run-from-the-tree line');
  assert.ok(first.includes('npx --yes chicla@'), 'no npx --yes line');
});

test('the 0.4.0 runbook tries the installed package with `npx --yes chicla@0.4.0`, not the global chicla', () => {
  const s = read('docs/release.md'), a = s.indexOf('## Releasing chicla 0.4.0'), sec = s.slice(a, s.indexOf('\n## ', a + 5));
  assert.ok(sec.includes('npx --yes chicla@0.4.0'));
});

test('G-C19 and G-C11 are CLOSED by Rodrigo (2026-11-16, round 348) in the status file and the ROADMAP; G-C8 is still open', () => {
  const st = status(), r = read('ROADMAP.md');
  for (const [name, g] of [['G-C19 status', row(st, '| G-C19 |')], ['G-C19 ROADMAP', row(r, '| G-C19 ·')], ['G-C11 status', row(st, '| G-C11 |')], ['G-C11 ROADMAP', row(r, '| G-C11 ·')]]) {
    assert.match(g, /CLOSED by Rodrigo \(2026-11-16/, `${name} is not closed on 2026-11-16`);
    assert.ok(g.includes('fecha ambas'), `${name} lacks his words`);
  }
  assert.match(row(st, '| G-C19 |'), /36 files/); assert.ok(row(st, '| G-C19 |').includes(SHA));
  assert.ok(!/OPEN AGAIN \(round 338[^)]*\):\*\* the pin moved/.test(row(st, '| G-C11 |').split('Before:')[0]) || /CLOSED by Rodrigo \(2026-11-16/.test(row(st, '| G-C11 |')));
  assert.match(row(st, '| G-C8 |'), /\| open \|/);
});

test('README: 0.4.0 is published (a fact, not «prepared»)', () => {
  const r = read('README.md');
  assert.match(r, /chicla-v0\.4\.0/); assert.match(r, /0\.4\.0/);
});
