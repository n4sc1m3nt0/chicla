// Round 293 (C25.2, AUDIT-9 F-2, F-3, F-6, F-7; D-290a and D-290b confirmed by Rodrigo): docs only, no source, the pin does not move. Written before the docs; red until they say it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');

test('README «Emergency» says the digest pin is this repository\'s, and that a project made by `chicla init` has none (F-3, D-290b)', () => {
  const l = read('README.md').split('\n').find((x) => x.startsWith('- **Emergency.**')) ?? '';
  assert.match(l, /RECOVER\//);
  assert.match(l, /chicla init/);
  assert.match(l, /no (digest|pin)/i);
  assert.match(l, /never code from the dump/);
});

test('the generated CLAUDE.md says that package.json only marks the project root and that APP_VERSION is the app version (F-2, D-290a)', () => {
  const t = read('packages/chicla-kit/templates/CLAUDE.md');
  assert.match(t, /`package\.json` only marks the project root/);
  assert.match(t, /`APP_VERSION` in `version\.mjs`/);
});

test('docs/release.md «Releasing chicla 0.2.1» step 3 also compares the sha256 of the rebuilt tarball with the CI one (F-6)', () => {
  const sec = read('docs/release.md').split('## Releasing chicla 0.2.1')[1].split('\n## ')[0];
  const step3 = sec.split('\n').find((l) => l.startsWith('3. **Tag and release:**')) ?? '';
  assert.match(step3, /sha256sum/);
  assert.match(step3, /dist2/);
});

test('ROADMAP: the M24 heading no longer says «proposed» (F-7) and C25.2 is done (round 293)', () => {
  const r = read('ROADMAP.md');
  const h = r.split('\n').find((l) => l.startsWith('### M24 ')) ?? '';
  assert.doesNotMatch(h, /proposed/);
  assert.match(h, /confirmed/);
  const c = r.split('\n').find((l) => l.startsWith('| C25.2 |')) ?? '';
  assert.match(c, /feito \(round 293/);
});
