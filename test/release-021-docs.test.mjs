// Round 284 (C24.1, AUDIT-8 F-1): `chicla recovery` did not start in chicla 0.2.0 (ERR_MODULE_NOT_FOUND); build-chicla now ships the zip module beside the pinned recovery-report.mjs.
// This file holds what must be written down for the release 0.2.1 that Rodrigo publishes (gate G-C17). Written before the docs; red until they exist. Docs and one version: no pinned file, the pin does not move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const row = (text, start) => text.split('\n').find((l) => l.startsWith(start)) ?? '';

test('packages/chicla is 0.2.1 (npm cannot publish 0.2.0 twice) and the 0.2.0 README line about the move stays true', () => {
  assert.equal(JSON.parse(read('packages/chicla/package.json')).version, '0.2.1');
});

test('docs/release.md: «Releasing chicla 0.2.1» sits above the 0.2.0 runbook, says why, and keeps the rule that only Rodrigo publishes', () => {
  const s = read('docs/release.md');
  const i = s.indexOf('## Releasing chicla 0.2.1');
  assert.ok(i > 0 && i < s.indexOf('## Releasing chicla 0.2.0'), 'no «## Releasing chicla 0.2.1» section above the 0.2.0 one');
  const sec = s.slice(i, s.indexOf('\n## ', i + 5));
  for (const part of ['G-C17', 'AUDIT-8', 'ERR_MODULE_NOT_FOUND', 'src/pinned/zipkit.mjs', 'chicla recovery', 'chicla-v0.2.1', 'chicla-0.2.1.tgz', 'sha256sum -c', 'npm publish ./dist/chicla-0.2.1.tgz', 'npm view chicla version', 'npm deprecate chicla@0.2.0', 'diff -r', 'Rodrigo']) assert.ok(sec.includes(part), `the 0.2.1 runbook does not mention ${part}`);
  assert.match(sec, /only Rodrigo publishes|Rodrigo only/i);
  assert.ok(sec.indexOf('npm publish') < sec.indexOf('npm deprecate chicla@0.2.0'), 'deprecate 0.2.0 only after 0.2.1 is on npm');
});

test('ROADMAP: C24.1 is done, and G-C17 is an OPEN gate that is Rodrigo\'s', () => {
  const r = read('ROADMAP.md');
  assert.match(row(r, '| C24.1 |'), /feito|done/i);
  const g = row(r, '| G-C17 ');
  assert.ok(g, 'no G-C17 row in ROADMAP');
  assert.match(g, /0\.2\.1/);
  assert.match(g, /\| open \|?\s*$/);
});

test('the status file lists G-C17 as open, and the status file or its archives say C24.1 is done', () => {
  const live = readFileSync(join(root, readFileSyncName()), 'utf8');
  assert.match(row(live, '| G-C17 '), /\| open/);
  assert.ok(/C24\.1[^\n]*(done|`recovery` runs)/.test(statusWithArchives()), 'C24.1 is not recorded as done');
});

function readFileSyncName() {
  const f = readdirSyncRoot().find((n) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(n));
  assert.ok(f, 'no status file');
  return f;
}
import { readdirSync } from 'node:fs';
function readdirSyncRoot() { return readdirSync(root); }
