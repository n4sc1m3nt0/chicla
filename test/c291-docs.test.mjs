// Round 320 (C29.1, AUDIT-11 F-1): the grouped `git rm` line of EMANIFEST_TRACKED is documented where the code is described (docs/manifest.md) and where Rodrigo meets it (docs/release.md).
// Written before the docs; red until they say it. Docs only: it reads files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const row = () => read('docs/manifest.md').split('\n').find((l) => l.startsWith('| `EMANIFEST_TRACKED` |')) ?? '';

test('docs/manifest.md: the EMANIFEST_TRACKED row names the three new fields and the line it prints (C29.1)', () => {
  const r = row();
  for (const part of ['trackedGroups', 'trackedCommand', 'trackedCommandComplete', 'git rm -r -q --cached --ignore-unmatch', 'C29.1']) assert.ok(r.includes(part), `the row does not say «${part}»`);
  assert.match(r, /3000/);
  assert.match(r, /15/);
});

test('docs/release.md: the 0.3.0 runbook points to the line the guard prints, so nobody types the cleanup from memory (AUDIT-11 F-1)', () => {
  const s = read('docs/release.md');
  const sec = s.slice(s.indexOf('## Releasing chicla 0.3.0'), s.indexOf('## Releasing chicla 0.2.1'));
  assert.ok(sec.includes('EMANIFEST_TRACKED') && sec.includes('prints') && sec.includes('git rm'), 'the 0.3.0 runbook does not say that the guard prints the git rm line');
});
