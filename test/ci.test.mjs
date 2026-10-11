// C5.4 — the benchmark with a budget runs in CI (D15: 3x `unzip` for 20 000 small files, on tmpfs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
const jobs = ci.split(/^  (?=[a-z][\w-]*:\s*$)/m).slice(1); // jobs are 2-space keys under `jobs:`
const bench = jobs.find((j) => /^bench:/.test(j)) ?? '';

test('C5.4: CI has a separate `bench` job, so a slow runner never hides a test failure', () => {
  assert.ok(bench, 'no `bench:` job in ci.yml');
  assert.ok(jobs.some((j) => /^test:/.test(j)), 'the `test` job must stay');
});

test('C5.4: the bench job runs the small-files benchmark with the D15 budget of 3', () => {
  assert.match(bench, /node packages\/chicla-zip\/bench\/small-files\.mjs[^\n]*--budget 3\b/);
});

test('C5.4: the bench job runs on Linux only and on tmpfs (the budget was measured there)', () => {
  assert.match(bench, /runs-on:\s*ubuntu-latest/);
  assert.doesNotMatch(bench, /macos|windows/);
  assert.match(bench, /TMPDIR:\s*\/dev\/shm/);
});

test('C5.4: the bench job uses one Node version, not the whole matrix', () => {
  assert.doesNotMatch(bench, /matrix/);
  assert.match(bench, /node-version:\s*22/);
});
