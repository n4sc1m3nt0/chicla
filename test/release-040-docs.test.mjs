// Round 347 (C31.3, D166 D-B): what must be written down for the release 0.4.0 that Rodrigo publishes (gate G-C19).
// The package is 0.4.0 and the runbook «Releasing chicla 0.4.0» sits right under the `chicla release` section and above the 0.3.0 one.
// Asserts names, numbers and rules, never prose. Docs and one version only: nothing here ran git, GitHub or npm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const section = () => { const s = read('docs/release.md'); const i = s.indexOf('## Releasing chicla 0.4.0'); return { s, i, sec: i < 0 ? '' : s.slice(i, s.indexOf('\n## ', i + 5)) }; };

test('packages/chicla is 0.4.0; the two internal packages keep their own versions (D4)', () => {
  assert.equal(JSON.parse(read('packages/chicla/package.json')).version, '0.4.0');
  assert.equal(JSON.parse(read('packages/chicla-zip/package.json')).version, '0.1.1');
  assert.equal(JSON.parse(read('packages/chicla-kit/package.json')).version, '0.1.1');
});

test('docs/release.md: «Releasing chicla 0.4.0» is the second section, above 0.3.0, and keeps the rule that only Rodrigo publishes', () => {
  const { s, i, sec } = section();
  assert.ok(i > 0, 'no «## Releasing chicla 0.4.0» section');
  assert.ok(i > s.indexOf('## Releasing with `chicla release`') && i < s.indexOf('## Releasing chicla 0.3.0'), 'between the chicla release section and 0.3.0');
  for (const part of ['G-C19', 'D166', 'chicla-v0.4.0', 'chicla-0.4.0.tgz', 'dist-0.4.0', 'release check', 'release prepare --run', 'release publish --from', '--confirm', 'npm view chicla version', 'npm pack chicla@0.4.0']) assert.ok(sec.includes(part), `the 0.4.0 runbook lacks «${part}»`);
  assert.match(sec, /only Rodrigo/i); assert.match(sec, /AI never runs/);
});

test('the runbook lists what 0.4.0 has that 0.3.0 has not, the moved pin and G-C11, and the file count', () => {
  const { sec } = section();
  for (const part of ['archive', 'doctor', 'git-plan', 'release check', '375b6901b72d', '15e4ef5d0602', 'G-C11', '36 files', '32', 'package/src/release.mjs', '166265']) assert.ok(sec.includes(part), `the 0.4.0 runbook lacks «${part}»`);
});

test('the runbook says the first real run of prepare and publish is his, that 0.3.0 is not deprecated, and that a local rebuild is not the CI tarball', () => {
  const { sec } = section();
  assert.match(sec, /first real run/i);
  assert.match(sec, /no `npm deprecate`/);
  assert.match(sec, /local rebuild/i);
});

test('ROADMAP: C31.3 is done and G-C19 is a gate row that is Rodrigo\'s (open in round 347, CLOSED in round 348)', () => {
  const r = read('ROADMAP.md');
  const c = r.split('\n').find((l) => l.startsWith('| C31.3 '));
  assert.ok(c && /feito/.test(c) && /round 347/.test(c), 'C31.3 is not recorded as done in round 347');
  const g = r.split('\n').find((l) => l.startsWith('| G-C19'));
  assert.ok(g, 'no G-C19 gate row in ROADMAP');
  assert.match(g, /Rodrigo/); assert.match(g, /OPEN|CLOSED/);
});
