// Round 285 (C24.2, AUDIT-8 F-3): `chicla init` now writes a minimal private package.json, so the project it makes can make-delivery, verify-delivery and recovery.
// Rodrigo confirmed D-283a and D-283b («confirmo tudo. avança», 2026-10-29). Written before the docs; red until they exist. No pinned file; the pin does not move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const row = (text, start) => text.split('\n').find((l) => l.startsWith(start)) ?? '';

test('the READMEs and the runbook say that init writes package.json (and keeps one that is there)', () => {
  assert.match(read('packages/chicla/README.md'), /chicla init[^\n]*package\.json/);
  assert.match(row(read('packages/chicla-kit/README.md'), '| `chicla init` |'), /package\.json/);
  assert.match(read('docs/release.md'), /chicla init\s+# seven files created/);
  assert.doesNotMatch(read('docs/release.md'), /chicla init\s+# six files created/);
});

test('ROADMAP: D120 says init now writes package.json; D149 records D-283a and D-283b as CONFIRMED; C24.2 is done and C24.5 is the next card', () => {
  const r = read('ROADMAP.md');
  assert.match(row(r, '| D120 |'), /C24\.2[^|]*package\.json|package\.json[^|]*C24\.2/);
  const d = row(r, '| D149 |');
  assert.match(d, /D-283a[^|]*CONFIRMED|CONFIRMED[^|]*D-283a/);
  assert.match(d, /D-283b[^|]*CONFIRMED|CONFIRMED[^|]*D-283b/);
  assert.match(row(r, '| C24.2 |'), /feito|done/i);
  assert.doesNotMatch(row(r, '| C24.5 |'), /decision first/, 'C24.5 is no longer waiting for a decision');
});

test('the status file says the open decisions are none and the next card is C24.5; its archives name C24.2 as done', () => {
  const f = readdirSync(root).find((n) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(n));
  const live = read(f);
  assert.match(live.split('## Next up')[1].split('## Gates')[0] + statusWithArchives(), /round 285: \*\*none open/); // the clause of round 285 moves to docs/status-archive-rolling-* when the paragraph is archived (item 6)
  assert.ok(/C24\.2[^\n]*package\.json/.test(statusWithArchives()), 'C24.2 is not recorded');
});
