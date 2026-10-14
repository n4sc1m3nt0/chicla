// Round 91: CHANGELOG.md has exactly one `# Changelog` heading, right after the fingerprint line (round 87 left a second one between two entries).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const lines = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'CHANGELOG.md'), 'utf8').split('\n');

test('round 91: one `# Changelog` heading, on line 2, and the entries are all below it', () => {
  const at = lines.map((l, i) => (/^# Changelog\s*$/.test(l) ? i + 1 : 0)).filter(Boolean);
  assert.deepEqual(at, [2], `heading lines: ${at}`);
  assert.ok(lines.slice(2).some((l) => /^## Round /.test(l)), 'entries follow');
});
