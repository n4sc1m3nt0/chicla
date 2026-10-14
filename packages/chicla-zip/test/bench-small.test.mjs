// C5.4 — the small-files benchmark is a CI gate: its exit code must say «over budget» (1), «ok» (0) or «bad usage» (2),
// and a budget that cannot be read must never turn into «no budget». Tiny sizes here: the real run (20 000 files) is in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const NO_ZIP = spawnSync('zip', ['-v']).error ? 'the zip command is not installed (the bench builds its fixture with it)' : false;
const BENCH = join(dirname(fileURLToPath(import.meta.url)), '..', 'bench', 'small-files.mjs');
// defaults are added only for flags the case does not give itself (the bench reads the first occurrence of a flag)
const bench = (...a) => spawnSync(process.execPath, [BENCH, ...(a.includes('--files') ? [] : ['--files', '200']), ...(a.includes('--runs') ? [] : ['--runs', '1']), ...a], { encoding: 'utf8' });

test('prints one line with both timings and the ratio', { skip: NO_ZIP }, () => {
  const r = bench();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^200 files · unzip [\d.]+ s · extractZip [\d.]+ s · ratio [\d.]+x \(best of 1, node v/m);
});

test('a budget that is met exits 0, one that is not exits 1', { skip: NO_ZIP }, () => {
  assert.equal(bench('--budget', '100000').status, 0);
  const r = bench('--budget', '0.000001');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /over the budget/);
});

test('an unreadable budget or count is a usage error (2), never «no budget»', () => {
  for (const args of [['--budget', 'abc'], ['--budget'], ['--budget', '-1'], ['--budget', '0'], ['--runs', '0'], ['--runs', 'x'], ['--files', '0'], ['--files', '1.5']]) {
    const r = bench(...args);
    assert.equal(r.status, 2, `${args.join(' ')} -> exit ${r.status}`);
    assert.match(r.stderr, /usage/i);
  }
});
