// Round 323 (G-C18): the publication of `chicla` 0.3.0 by Rodrigo is recorded in the docs, and he closed G-C18 and C29.4 in his own words («fecha o g-c18 e o g-c29.4»).
// Written before the text; each assertion is red until it exists. Docs only: no source, the pin does not move. Only Rodrigo publishes: the AI ran no `npm publish`, `git tag`, `gh release create` or `npm deprecate`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const row = (text, prefix) => text.split('\n').find((l) => l.startsWith(prefix)) ?? '';
const SHA = '9fc6387862267e9515285355e49cf4dfaa759787b6e277f8c08d4dc883198bf7';

const section = () => {
  const s = read('docs/release.md');
  const i = s.indexOf('## Published: chicla 0.3.0 (round 323');
  assert.ok(i > 0, 'docs/release.md has no «## Published: chicla 0.3.0 (round 323…)» section');
  const j = s.indexOf('\n## ', i + 5);
  return { text: j < 0 ? s.slice(i) : s.slice(i, j), at: i, all: s };
};

test('docs/release.md: «Published: chicla 0.3.0» sits right after the 0.3.0 runbook and before the 0.2.1 one, and says who did what and when', () => {
  const { text, at, all } = section();
  assert.ok(at > all.indexOf('## Releasing chicla 0.3.0'), 'after the 0.3.0 runbook');
  assert.ok(at < all.indexOf('## Releasing chicla 0.2.1 (round 284'), 'before the 0.2.1 runbook');
  assert.match(text, /Rodrigo published/);
  assert.match(text, /2026-11-08/);
  for (const part of ['chicla-v0.3.0', '306881e', '42480780034', 'fecha o g-c18']) assert.ok(text.includes(part), `missing: ${part}`);
  assert.doesNotMatch(text, /npm deprecate chicla@0\.2\.1/, '0.2.1 is not deprecated');
});

test('docs/release.md: the numbers seen in his output: 32 files, the sha256 of the CI tarball, the same sha256 from `npm pack chicla@0.3.0`, the Mac rebuild that differs in bytes only', () => {
  const { text } = section();
  for (const part of [SHA, '146190', '32 files', 'npm pack chicla@0.3.0', '7a4e1cf6', '145757', 'diff -r']) assert.ok(text.includes(part), `missing: ${part}`);
});

test('docs/release.md: what he tried from the installed package and on the real logs zip is listed', () => {
  const { text } = section();
  for (const part of ['init --name ACME', 'rename-status', 'RECOVER/', 'recovered project root', 'delivery created and verified', '14 job(s) read']) assert.ok(text.includes(part), `missing: ${part}`);
});

test('docs/release.md: what went differently is written down and the runbook says so', () => {
  const { text, all } = section();
  for (const part of ['file exists', '{owner}', 'EEXISTS', 'notes']) assert.ok(text.includes(part), `missing: ${part}`);
  const run = all.slice(all.indexOf('## Releasing chicla 0.3.0'), all.indexOf('## Published: chicla 0.3.0'));
  assert.match(run, /dist-0\.3\.0/, 'step 1 downloads into a new folder');
  assert.doesNotMatch(run, /must print one block per job/, 'a green run prints one summary line');
});

test('docs/release.md: Claude is honest about what it saw: only his pasted output, never the registry or GitHub itself', () => {
  const { text } = section();
  assert.match(text, /Not seen by Claude|not seen by Claude/);
  assert.match(text, /pasted/);
  assert.doesNotMatch(text, /Claude (ran|published|tagged|deprecated)/);
  assert.match(text, /AI ran no `npm publish`/);
});

test('status file and ROADMAP: G-C18 is CLOSED by Rodrigo (2026-11-08, in his words), with the tag, the commit and the sha256', () => {
  const g = row(statusWithArchives(), '| G-C18 |');
  assert.match(g, /CLOSED by Rodrigo \(2026-11-08/);
  assert.match(g, /fecha o g-c18/i);
  for (const part of ['chicla-v0.3.0', '306881e', '9fc63878']) assert.ok(g.includes(part), `the G-C18 row does not say «${part}»`);
  assert.doesNotMatch(g, /\*\*open \(Rodrigo's\)/);
  const r = row(read('ROADMAP.md'), '| G-C18 ·');
  assert.match(r, /CLOSED by Rodrigo \(2026-11-08/);
});

test('C29.4 is closed on Rodrigo\'s word and the records say Claude saw no output of the kit mutants', () => {
  const k = row(read('ROADMAP.md'), '| C29.4 |');
  assert.match(k, /closed by Rodrigo/i);
  assert.ok(k.includes('mutants:kit') && /(did not see|not seen)/.test(k), 'C29.4 does not say that Claude saw nothing of the run');
  const line = statusWithArchives().split('\n').find((l) => l.startsWith('- Done: round 323 ')) ?? '';
  for (const part of ['G-C18', 'C29.4', '306881e', 'Dependabot']) assert.ok(line.includes(part), `the Snapshot line of round 323 does not say «${part}»`);
});

test('README: 0.3.0 is published (a fact, not «prepared»); 0.2.1 is still on npm and not deprecated', () => {
  const r = read('README.md');
  assert.match(r, /`0\.3\.0` is published on npm/);
  assert.match(r, /chicla-v0\.3\.0/);
  assert.doesNotMatch(r, /is prepared in this tree/);
  assert.doesNotMatch(r, /and is not published/);
});

test('AUDIT-11 has a round 323 follow-up: the three Dependabot pull requests, read against the workflow', () => {
  const a = read('docs/audits/AUDIT-11.md');
  const f = a.slice(a.indexOf('## 7. Follow-up'));
  assert.ok(a.includes('## 7. Follow-up (round 323') && f.length > 500);
  for (const part of ['Dependabot', 'v7', 'pull_request_target', 'registry-url', 'FILES.manifest', 'one at a time']) assert.ok(f.includes(part), `the follow-up does not say «${part}»`);
});

test('the CHANGELOG records round 323', () => {
  const all = [read('CHANGELOG.md'), ...readdirSync(join(root, 'docs/archive/changelog')).map((f) => read(`docs/archive/changelog/${f}`))].join('\n');
  assert.match(all, /^## Round 323 /m);
});
