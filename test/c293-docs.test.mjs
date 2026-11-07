// Round 321 (C29.3, AUDIT-11 F-3 and F-4; D-317a): the docs of `ci-report` say what the command now does with what it could not judge. Written before the docs; red until they say it. Docs only: it reads files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');

test('the kit README: ECIREPORT_UNJUDGED, the two things that are not judged, the fields, and that --allow covers a job but not the cap', () => {
  const row = read('packages/chicla-kit/README.md').split('\n').find((l) => l.startsWith('| `chicla ci-report')) ?? '';
  for (const part of ['ECIREPORT_UNJUDGED', '64 MiB', '5000', 'unjudgedJobs', 'unjudgedEntries', 'C29.3']) assert.ok(row.includes(part), `the row does not say «${part}»`);
  assert.ok(!/listed as unreadable, not judged\./.test(row), 'the old sentence (a warning, exit 0) is still there');
});

test('the package README and the runbook say that exit 1 also means «not judged»', () => {
  assert.match(read('packages/chicla/README.md'), /ECIREPORT_UNJUDGED|not judged/);
  const s = read('docs/release.md');
  const sec = s.slice(s.indexOf('## Releasing chicla 0.3.0'), s.indexOf('## Releasing chicla 0.2.1'));
  assert.ok(sec.includes('ECIREPORT_UNJUDGED'), 'the 0.3.0 runbook does not name ECIREPORT_UNJUDGED');
});
