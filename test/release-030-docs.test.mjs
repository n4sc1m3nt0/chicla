// Round 316 (C28.5, AUDIT-10 F-6; D-310c: Rodrigo said «confirmo tudo» to 0.3.0): what must be written down for the release 0.3.0 that Rodrigo publishes (gate G-C18).
// Written before the change; red until it. Docs and the version of packages/chicla only: no source file, the pin does not move. Claude publishes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const section = () => { const s = read('docs/release.md'); const i = s.indexOf('## Releasing chicla 0.3.0'); return { s, i, sec: i < 0 ? '' : s.slice(i, s.indexOf('\n## ', i + 5)) }; };

test('packages/chicla is 0.3.0: 0.2.1 is on npm, npm cannot publish it twice, and three commands are new (D-310c)', () => {
  assert.equal(JSON.parse(read('packages/chicla/package.json')).version, '0.3.0');
});

test('docs/release.md: «Releasing chicla 0.3.0» sits above the 0.2.1 runbook, says why, and keeps the rule that only Rodrigo publishes', () => {
  const { s, i, sec } = section();
  assert.ok(i > 0 && i < s.indexOf('## Releasing chicla 0.2.1'), 'no «## Releasing chicla 0.3.0» section above the 0.2.1 one');
  for (const part of ['G-C18', 'AUDIT-10', 'D-310c', 'chicla-v0.3.0', 'chicla-0.3.0.tgz', 'sha256sum -c', 'npm publish ./dist/chicla-0.3.0.tgz', 'npm view chicla version', '554cbbc7', 'ef00035c']) assert.ok(sec.includes(part), `the 0.3.0 runbook does not say «${part}»`);
  assert.match(sec, /only Rodrigo publishes|Rodrigo only/i);
  assert.ok(sec.indexOf('npm whoami') < sec.indexOf('npm publish ./dist'), 'npm whoami before npm publish');
});

test('the runbook lists what 0.3.0 has that 0.2.1 has not, and the checks of the new commands from the installed package', () => {
  const sec = section().sec;
  for (const part of ['init --name', 'rename-status', 'ci-report', '--allow', 'EMANIFEST_TRACKED', 'status-prefix', '32 files', 'package/src/ci-report.mjs', 'package/src/rename-status.mjs']) assert.ok(sec.includes(part), `the 0.3.0 runbook does not say «${part}»`);
  assert.match(sec, /first (real )?use[^.]*logs zip|real logs zip/i, 'ci-report has never read a real logs zip: the runbook asks for it');
});

test('the runbook is honest about the pin that moved and about G-C11, and does not deprecate 0.2.1 (it is not broken)', () => {
  const sec = section().sec;
  assert.ok(sec.includes('15e4ef5d0602') && sec.includes('24014f880e9e') && sec.includes('G-C11'), 'the moved pin and G-C11 are named');
  assert.match(sec, /G-C11[^.]*(open|Rodrigo)/i);
  assert.ok(!/npm deprecate chicla@0\.2\.1/.test(sec), '0.2.1 must not be deprecated');
  assert.match(sec, /not deprecated|no `npm deprecate`|nothing to deprecate/i);
});

test('packages/chicla/README.md names the commands that are new since 0.2.1', () => {
  const r = read('packages/chicla/README.md');
  for (const part of ['rename-status', 'ci-report', 'init --name', '--allow']) assert.ok(r.includes(part), `the package README does not say «${part}»`);
});

// Round 323: G-C18 was closed by Rodrigo after the release (open in round 316, CLOSED in round 323).
test('G-C18 is a gate that is Rodrigo\'s: in the status file and in ROADMAP §9; C28.5 is done in the ROADMAP', () => {
  const st = statusWithArchives().split('\n').find((l) => l.startsWith('| G-C18 |')) ?? '';
  assert.match(st, /open \(Rodrigo's\)|CLOSED by Rodrigo \(2026-11-08/);
  assert.ok(st.includes('docs/release.md') && st.includes('0.3.0'));
  const r = read('ROADMAP.md');
  assert.ok(r.split('\n').some((l) => l.startsWith('| G-C18 ·') && /0\.3\.0/.test(l)), 'ROADMAP §9 has no G-C18 row');
  assert.match(r.split('\n').find((l) => l.startsWith('| C28.5 |')) ?? '', /feito/);
});

// Round 323: 0.3.0 is published now; the README says so (the 0.3.0 check is in published-chicla-030-docs.test.mjs) and still names 0.2.1 and gate G-C18.
test('README: 0.2.1 is still on npm and the README names the gate of 0.3.0', () => {
  const r = read('README.md');
  assert.match(r, /`0\.2\.1` is published on npm/);
  assert.match(r, /`0\.3\.0` is published on npm/);
  assert.match(r, /G-C18/);
});
