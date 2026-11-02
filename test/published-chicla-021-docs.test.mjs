// Round 297 (G-C17): the publication of `chicla` 0.2.1 by Rodrigo is recorded in the docs, and he closed the gate in his own words.
// Written before the text; each assertion is red until it exists. Only Rodrigo publishes: the AI ran no `npm publish`, `git tag`, `gh release create` or `npm deprecate`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives, statusText } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const row = (text, prefix) => text.split('\n').find((l) => l.startsWith(prefix)) ?? '';
const SHA = '554cbbc74e5ea3204d6ed9560ed0f8937bd14696f58adfa107f4580d8e66abf6';

const section = () => {
  const s = read('docs/release.md');
  const i = s.indexOf('## Published: chicla 0.2.1 (round 297');
  assert.ok(i > 0, 'docs/release.md has no «## Published: chicla 0.2.1 (round 297…)» section');
  const j = s.indexOf('\n## ', i + 5);
  return { text: j < 0 ? s.slice(i) : s.slice(i, j), at: i, all: s };
};

test('docs/release.md: «Published: chicla 0.2.1» sits right after the 0.2.1 runbook and before the 0.2.0 one, and says who did what and when', () => {
  const { text, at, all } = section();
  assert.ok(at > all.indexOf('## Releasing chicla 0.2.1'), 'after the 0.2.1 runbook');
  assert.ok(at < all.indexOf('## Releasing chicla 0.2.0 (round 281'), 'before the 0.2.0 runbook');
  assert.match(text, /Rodrigo published/);
  assert.match(text, /2026-11-01/);
  for (const part of ['chicla-v0.2.1', '9a7da0f', '41237566907', 'npm deprecate chicla@0.2.0', 'recovery does not start; use chicla 0.2.1']) assert.ok(text.includes(part), `missing: ${part}`);
});

test('docs/release.md: the numbers seen in his output: 30 files, the sha256 of the CI tarball and the same sha256 from `npm pack chicla@0.2.1`', () => {
  const { text } = section();
  assert.ok(text.includes(SHA));
  assert.match(text, /30 files/);
  assert.match(text, /npm pack chicla@0\.2\.1/);
  assert.match(text, /npx --yes chicla@0\.2\.1 --help/);
});

test('docs/release.md: what he tried from the installed package is listed, and the three fixes are named as seen working', () => {
  const { text } = section();
  for (const part of ['RECOVER/', 'recovered project root', 'delivery created and verified', '`import("chicla/zip")', 'ERR_MODULE_NOT_FOUND']) assert.ok(text.includes(part), `missing: ${part}`);
});

test('docs/release.md: what went differently is written down (E401 then E404 before the login; the first recovery test had no FILES.manifest; `dist/` was not empty; the rebuild differs in bytes) and the runbook says so', () => {
  const { text, all } = section();
  assert.match(text, /E401/);
  assert.match(text, /E404/);
  assert.match(text, /nothing was published/i);
  assert.match(text, /FILES\.manifest/);
  assert.match(text, /file exists|not empty|already had/i);
  assert.match(text, /481ff8a5/);
  const run = all.slice(all.indexOf('## Releasing chicla 0.2.1'), all.indexOf('## Published: chicla 0.2.1'));
  assert.match(run, /`FILES\.manifest`/, 'step 2 says the project for dump and recovery needs package.json AND FILES.manifest');
  assert.match(run, /npm login/, 'step 4 says to log in first (npm whoami)');
  assert.match(run, /empty `dist\/`|new `dist\/`|fresh `dist\/`/, 'step 1 says to download into a folder with nothing in it');
});

test('docs/release.md: Claude is honest about what it saw: only his pasted output, never the registry or GitHub itself', () => {
  const { text } = section();
  assert.match(text, /Not seen by Claude|not seen by Claude/);
  assert.match(text, /pasted/);
  assert.doesNotMatch(text, /Claude (ran|published|tagged|deprecated)/);
  assert.match(text, /AI ran no `npm publish`/);
});

test('ROADMAP: G-C17 is CLOSED by Rodrigo (2026-11-01, in his words) and C24.1 says the release is published', () => {
  const r = read('ROADMAP.md');
  const g = row(r, '| G-C17 ');
  assert.match(g, /CLOSED by Rodrigo \(2026-11-01/);
  assert.match(g, /fecha o g-c17/i);
  assert.match(g, /chicla-v0\.2\.1/);
  assert.doesNotMatch(g, /\| open \|?\s*$/);
  assert.match(row(r, '| C24.1 |'), /published/i);
});

test('status file: the gate row is CLOSED, the round 297 line is in the Snapshot, and Next up names no open decision', () => {
  const s = statusWithArchives(root);
  assert.match(s, /\| G-C17 \|[^\n]*0\.2\.1[^\n]*\| CLOSED by Rodrigo \(2026-11-01/);
  assert.match(s, /- Done: round 297 \(2026-11-01/);
  assert.match(s, /round 297: \*\*none open/); // C26.3: the live file or its archives (the rolling archive moves old «Open decisions» entries)
});

test('README: 0.2.1 is published (a fact, not «prepared and waiting»)', () => {
  const r = read('README.md');
  assert.match(r, /`0\.2\.1` is published on npm/);
  assert.match(r, /chicla-v0\.2\.1/);
  assert.match(r, /`0\.2\.0` is deprecated/);
  assert.doesNotMatch(r, /prepared and waiting for the owner/);
});
