// Round 287 (C24.5 REVERSED, AUDIT-8 F-2): in round 286 the missing RECOVER/ of a dump made by the installed package was written down as a known limit (D-283b).
// Rodrigo reverted that decision («reverte a decisão e faz a correção»): `emergency-dump.mjs` now looks for the five pinned files beside its own module first, so the dump
// made by the package carries RECOVER/. The reason given for the first choice (it «could move the pin») was overstated: the pin hashes the five files, and emergency-dump.mjs is not one.
// This file now holds what the docs must say after the fix. Written before the docs; red until they say it. The behaviour is tested in test/chicla-single-package.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const row = (text, start) => text.split('\n').find((l) => l.startsWith(start)) ?? '';

test('the «known limit» of round 286 is gone: no README section, no row text; SECURITY.md keeps only the fact about 0.2.0', () => {
  assert.ok(!read('packages/chicla/README.md').includes('## Known limit: dumps made by the package'), 'the README section must be removed');
  assert.doesNotMatch(row(read('packages/chicla-kit/README.md'), '| `chicla dump` |'), /known limit|installed package has no/i);
  const sec = read('SECURITY.md').split('## What is not a vulnerability (known limits)')[1];
  assert.ok(!sec.includes('A dump made by the installed package has no `RECOVER/`'), 'the old bullet must be gone');
  assert.match(sec, /\*\*A dump made by `chicla` 0\.2\.0 has no `RECOVER\/`[^\n]*fixed in 0\.2\.1/);
});

test('docs/release.md «Releasing chicla 0.2.1» carries the third fix and checks it: the dump from the installed package has RECOVER/', () => {
  const s = read('docs/release.md');
  const i = s.indexOf('## Releasing chicla 0.2.1');
  const sec = s.slice(i, s.indexOf('\n## ', i + 5));
  assert.match(sec, /emergency-dump/);
  assert.match(sec, /RECOVER\/[^\n]*(five|5)|(five|5)[^\n]*RECOVER\//);
  assert.match(sec, /AUDIT-8 F-2/);
});

test('ROADMAP: D-283b is REVERTED by Rodrigo with the honest reason, C24.5 is done as a FIX, G-C17 covers it', () => {
  const r = read('ROADMAP.md');
  const d = row(r, '| D149 |');
  assert.match(d, /D-283b[^|]*REVERTED|REVERTED[^|]*D-283b/);
  assert.match(d, /overstated/);
  const c = row(r, '| C24.5 |');
  assert.match(c, /feito|done/i);
  assert.match(c, /emergency-dump/);
  assert.doesNotMatch(c, /NOT taken/);
  assert.match(row(r, '| G-C17 '), /RECOVER\//);
});

test('the status file says no decision is open and the next card is C24.3; the status archives record C24.5 as fixed', () => {
  const f = readdirSync(root).find((n) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(n));
  assert.match(read(f).split('## Next up')[1].split('## Gates')[0], /round 287: \*\*none open[^]*Next task: C24\.3/);
  assert.ok(/C24\.5[^\n]*(reversed|REVERSED)/.test(statusWithArchives()), 'C24.5 is not recorded as reversed');
});
