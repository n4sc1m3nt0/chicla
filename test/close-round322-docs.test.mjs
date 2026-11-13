// Round 322 (Rodrigo: «podes fechar o g-c11, já o fiz noutra conta. fecha tudo o resto que foi feito (mutants e ci e tudo o resto) e vamos avançar para a release»): the records say what was done, with the numbers read from the real logs zip
// of the green CI run of commit c03e1767, and the values of the tarball that is to be released. Written before the docs; red until they say it. Docs only: no source, the pin does not move; Claude publishes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const SHA = '9fc6387862267e9515285355e49cf4dfaa759787b6e277f8c08d4dc883198bf7';
const COMMIT = 'c03e176729e5d99241792bfc6ab58c11157b04c5';
const row = (text, start) => text.split('\n').find((l) => l.startsWith(start)) ?? '';
const section = (f, from, to) => { const s = read(f); const i = s.indexOf(from); return i < 0 ? '' : s.slice(i, s.indexOf(to, i + 5)); };

test('G-C11 is CLOSED by Rodrigo\'s word (2026-11-08, done in another account, not seen by Claude); G-C8 is still open', () => {
  const st = statusWithArchives();
  const g = row(st, '| G-C11 |');
  assert.match(g, /CLOSED by Rodrigo \(2026-11-08/);
  assert.ok(g.includes('another account') && /not (verified|seen)/.test(g), 'the row says it was done elsewhere and that Claude did not see it');
  assert.ok(!/\*\*open \(Rodrigo's\), round 300/.test(g), 'the row still says open');
  assert.match(row(st, '| G-C8 |'), /\| open \|/);
  assert.match(row(read('ROADMAP.md'), '| G-C11 ·'), /2026-11-08/);
});

// Round 323: G-C18 was closed by Rodrigo after the release, so the row may be open (round 322) or CLOSED (round 323); the values stay in it either way.
test('G-C18 is Rodrigo\'s (open in round 322, CLOSED in round 323), with the commit the CI built and the tarball values (the same bytes as a local rebuild)', () => {
  const g = row(statusWithArchives(), '| G-C18 |');
  assert.match(g, /open \(Rodrigo's\)|CLOSED by Rodrigo \(2026-11-08/);
  for (const part of ['c03e1767', '9fc63878', '146190', 'docs/release.md']) assert.ok(g.includes(part), `the G-C18 row does not say «${part}»`);
  const r = row(read('ROADMAP.md'), '| G-C18 ·');
  assert.ok(r.includes('c03e1767') && /open|CLOSED/.test(r) && /G-C11/.test(r));
});

test('docs/release.md: the 0.3.0 runbook has the values of the run to release, says G-C11 is closed and that ci-report has read a real logs zip', () => {
  const sec = section('docs/release.md', '## Releasing chicla 0.3.0', '## Releasing chicla 0.2.1');
  for (const part of [COMMIT, SHA, '146190', 'byte for byte', '14 jobs']) assert.ok(sec.includes(part), `the 0.3.0 runbook does not say «${part}»`);
  assert.match(sec, /G-C11[^.]*closed/i);
  assert.ok(!/G-C11[^.]*is open/i.test(sec), 'the runbook still says G-C11 is open');
  assert.ok(!/first use of `ci-report` on a real logs zip\*\*/.test(sec), 'the runbook still calls the real logs zip a future event');
  assert.ok(!/sha256 of a rebuild may differ/.test(sec), 'the runbook still says a rebuild may differ: it was measured to be identical');
  assert.match(sec, /real logs zip/);
});

test('ROADMAP: C27.5 is closed with what the real logs say; C29.4 stays open with its reason (the kit list is still to run)', () => {
  const r = read('ROADMAP.md');
  const c = row(r, '| C27.5 |');
  assert.ok(c.includes('Closed in round 322') && c.includes('1810') && /12 (more|tests)/.test(c) && c.includes('/dev/full'), 'C27.5 does not say what the logs showed');
  const k = row(r, '| C29.4 |');
  assert.ok(/proposed|closed by Rodrigo/.test(k) && k.includes('mutants:kit') && k.includes('348'), 'C29.4 does not say why it stays open');
});

test('AUDIT-11 has a follow-up section: what the CI, the real logs zip and Rodrigo\'s runs settled, and what is still open', () => {
  const a = read('docs/audits/AUDIT-11.md');
  const f = a.slice(a.indexOf('## 6. Follow-up'));
  assert.ok(a.includes('## 6. Follow-up') && f.length > 600);
  for (const part of ['14 jobs', '1928', '12 more', 'Dependabot', 'C29.4', '348', COMMIT.slice(0, 8)]) assert.ok(f.includes(part), `the follow-up does not say «${part}»`);
});

test('the status file and the CHANGELOG record round 322 with the mutants of the zip list (348, 9 not run on darwin) and the green CI', () => {
  const s = statusWithArchives();
  const line = s.split('\n').find((l) => l.startsWith('- Done: round 322 ')) ?? '';
  for (const part of ['348', '9 not run on darwin', '14 jobs', 'c03e1767', 'G-C11']) assert.ok(line.includes(part), `the Snapshot line of round 322 does not say «${part}»`);
  const all = [read('CHANGELOG.md'), ...readdirSync(join(root, 'docs/archive/changelog')).map((f) => read(`docs/archive/changelog/${f}`))].join('\n');
  assert.match(all, /^## Round 322 /m);
});
