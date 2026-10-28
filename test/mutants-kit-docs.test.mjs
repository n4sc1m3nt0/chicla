// Round 260 (C19.4, AUDIT-6 F-4; D-256d confirmed by Rodrigo: «d142 sim»): `npm run mutants:kit` is documented where a newcomer looks, with what it needs.
// Written before the docs; red until they say it. Docs and this test only: no source, the pin does not move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusText } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const CMD = 'npm run mutants:kit';

test('the script exists in package.json and runs the kit list on the whole tree (`--pkg .`)', () => {
  const s = JSON.parse(read('package.json')).scripts['mutants:kit'];
  assert.ok(s, 'package.json has no mutants:kit script');
  assert.match(s, /--pkg \./); assert.match(s, /--list packages\/chicla-kit\/mutants\/list\.mjs/);
  assert.ok(existsSync(join(root, 'packages/chicla-kit/mutants/list.mjs')));
});

test('README.md and CONTRIBUTING.md name the command, say it needs the whole tree, and point to the list', () => {
  for (const f of ['README.md', 'CONTRIBUTING.md']) {
    const t = read(f);
    assert.ok(t.includes(CMD), `${f} does not name ${CMD}`);
    const para = t.split('\n').filter((l) => l.includes(CMD)).join('\n');
    assert.match(para, /whole tree/i, `${f}: the line that names the command must say it copies the whole tree`);
    assert.match(para, /--pkg \./, `${f}: and name --pkg .`);
    assert.ok(t.includes('packages/chicla-kit/mutants/list.mjs'), `${f} does not name the list file`);
  }
});

test('docs/README.md lists the kit mutant list, and item 20 (c) of the status file says when to use `mutants:kit` next to the zip list', () => {
  assert.ok(read('docs/README.md').includes('packages/chicla-kit/mutants/list.mjs'), 'docs/README.md does not list the kit mutant list');
  const item = statusText().split('\n').find((l) => l.startsWith('20. **Long commands'));
  assert.ok(item, 'item 20 not found');
  const c = item.slice(item.indexOf('(c) Mutants'), item.indexOf('(d) If a wait'));
  assert.ok(c.includes(CMD), 'item 20 (c) does not name npm run mutants:kit');
  assert.match(c, /--only/); assert.match(c, /detached/); assert.match(c, /packages\/chicla-kit/);
});

test('the kit README does not name it: the list is a development file of this repository and is not shipped with the package', () => {
  assert.ok(!read('packages/chicla-kit/README.md').includes('mutants:kit'));
});
