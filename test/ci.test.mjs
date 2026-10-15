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

// C5.5 slice b: CI packs chicla-zip and keeps the tarball with its sha256 as an artifact (nothing is published).
const pack = jobs.find((j) => /^pack:/.test(j)) ?? '';

test('C5.5b: CI has a separate `pack` job on Linux and one Node version', () => {
  assert.ok(pack, 'no `pack:` job in ci.yml');
  assert.match(pack, /runs-on:\s*ubuntu-latest/);
  assert.doesNotMatch(pack, /matrix/);
  assert.match(pack, /node-version:\s*22/);
});

test('C5.5b: the pack job runs scripts/pack-release.mjs on chicla-zip and uploads the output, and never publishes', () => {
  assert.match(pack, /node scripts\/pack-release\.mjs packages\/chicla-zip --out [^\n]+/);
  assert.match(pack, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(ci, /npm publish/);
});

// M14, C14.4 (round 142): the chicla-zip suite and the independent readers on Windows. A separate job, so it never hides the Linux and macOS result;
// it cannot be run from here, so what these tests guard is the SHAPE of the job (a typo in it would only show on GitHub).
const windows = jobs.find((j) => /^windows:/.test(j)) ?? '';

test('C14.4: CI has a separate `windows` job on windows-latest and the `test` job is untouched', () => {
  assert.ok(windows, 'no `windows:` job in ci.yml');
  assert.match(windows, /runs-on:\s*windows-latest/);
  const test_ = jobs.find((j) => /^test:/.test(j));
  assert.match(test_, /os:\s*\[ubuntu-latest,\s*macos-latest\]/);
  assert.doesNotMatch(test_, /windows/);
});

test('C14.4: the windows job covers Node 18, 20 and 22 without cancelling the others on the first failure', () => {
  assert.match(windows, /fail-fast:\s*false/);
  assert.match(windows, /node:\s*\[18,\s*20,\s*22\]/);
  assert.match(windows, /node-version:\s*\$\{\{\s*matrix\.node\s*\}\}/);
});

test('C14.4: it runs the whole chicla-zip suite through bash, so the glob is expanded the same way on every Node version', () => {
  assert.match(windows, /shell:\s*bash/);
  assert.match(windows, /node --test [^\n]*packages\/chicla-zip\/test\/\*\.test\.mjs/);
});

test('C14.4: the independent readers are put in place and CHECKED (a skipped reader is not a pass): 7z on PATH, python3, python found', () => {
  assert.match(windows, /GITHUB_PATH/);
  assert.match(windows, /7-Zip/);
  assert.match(windows, /7z --help|7z\.exe/);
  assert.match(windows, /python3(\.exe)?/);
  assert.match(windows, /python3 -c ['"]import zipfile/);
});

test('C14.4: unzip is reported where present, never required (the Windows runner has none by default)', () => {
  assert.match(windows, /unzip/);
  assert.match(windows, /unzip[^\n]*\|\|/);
});

test('C14.4 (D99): the job is informative, continue-on-error, until Windows is green (C14.3, C14.5); it never publishes and uses no secret', () => {
  assert.match(windows, /continue-on-error:\s*true/);
  assert.doesNotMatch(windows, /secrets\.|npm publish/);
});

// Round 146: the macOS Node 18 job stood still for 45 minutes (Rodrigo cancelled it); GitHub's default limit is 360 minutes.
test('round 146: every CI job has `timeout-minutes`, so a stuck test costs minutes, not hours', () => {
  const own = ci.slice(ci.indexOf('\njobs:')).split(/^  (?=[a-z][\w-]*:\s*$)/m).slice(1); // only the keys under `jobs:` (not `push:` under `on:`)
  assert.ok(own.length >= 4, `expected at least test, windows, bench and pack, found ${own.length}`);
  for (const j of own) {
    const name = j.match(/^([\w-]+):/)[1];
    const m = j.match(/^    timeout-minutes:\s*(\d+)\s*$/m);
    assert.ok(m, `job «${name}» has no timeout-minutes`);
    assert.ok(Number(m[1]) >= 5 && Number(m[1]) <= 30, `job «${name}»: ${m[1]} minutes is outside 5..30`);
  }
});

// M14, C14.6 (round 155, D109 confirmed), written before the change: the chicla-kit suite also runs in the `windows` job, informative like the rest (D99), to see what fails there.
// It is a SECOND step after the chicla-zip step, always run (`if: always()`), so a red chicla-zip never hides the kit result and the two are read separately.
const winSteps = windows.split(/^      - /m).slice(1); // the steps of the windows job
const zipStep = winSteps.findIndex((s) => /node --test [^\n]*packages\/chicla-zip\/test\/\*\.test\.mjs/.test(s));
const kitStep = winSteps.findIndex((s) => /node --test [^\n]*packages\/chicla-kit\/test\/\*\.test\.mjs/.test(s));

test('C14.6: the windows job runs the chicla-kit suite as its own step, after the chicla-zip step, and the chicla-zip step stays', () => {
  assert.ok(zipStep >= 0, 'the chicla-zip step must stay');
  assert.ok(kitStep >= 0, 'no step runs packages/chicla-kit/test/*.test.mjs in the windows job');
  assert.ok(kitStep > zipStep, 'the kit step comes after the zip step');
  assert.notEqual(kitStep, zipStep, 'two steps, not one command');
});

test('C14.6: the kit step runs even when the chicla-zip step failed, is named after chicla-kit and has its own time limit', () => {
  const s = winSteps[kitStep];
  assert.match(s, /if:\s*(\$\{\{\s*)?(always\(\)|!cancelled\(\))/);
  assert.match(s, /name:[^\n]*chicla-kit/i);
  const m = s.match(/timeout-minutes:\s*(\d+)/); assert.ok(m, 'the kit step has no timeout-minutes'); assert.ok(Number(m[1]) >= 3 && Number(m[1]) <= 10, `${m[1]} minutes is outside 3..10`);
});

test('C14.6 (D99, D109): still informative and only on Windows: the `test` job does not run the kit suite twice, and the chicla-zip step has no `if`', () => {
  assert.match(windows, /continue-on-error:\s*true/);
  assert.doesNotMatch(windows, /secrets\.|npm publish/);
  assert.ok(!/^\s+if:/m.test(winSteps[zipStep]), 'the chicla-zip step runs unconditionally');
  assert.doesNotMatch(jobs.find((j) => /^test:/.test(j)), /chicla-kit\/test\/\*/);
});
