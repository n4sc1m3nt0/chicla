// Round 310 (C27.6): the same two tests now also cover `actions/upload-artifact` (v4 and v5 run on node20; v6.0.0 is the first with `runs.using: node24`, read in its action.yml).
// Round 309 (C27.5; D156, Claude's label): the CI logs warned that `actions/checkout` and `actions/setup-node` at v4 run on Node 20 and are forced to Node 24.
// Both actions have run on Node 24 since v5/v6; the workflow pins them by commit (the pin test of `smoke-tarball.test.mjs` wants 40 hex) and says the version in the
// trailing comment. This test reads that comment: every use of the two actions is at v6 or later, and one action has one commit in the whole workflow.
// Written before the change; red until it. It reads the file only (no network, no wording).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const uses = (action) => [...ci.matchAll(new RegExp(`uses:\\s*actions/${action}@([0-9a-f]{40})\\s*#\\s*v(\\d+)\\.(\\d+)\\.(\\d+)`, 'g'))].map((m) => ({ sha: m[1], major: Number(m[2]) }));

// [action, least number of uses the workflow must have]: five jobs use checkout and setup-node, the `pack` job alone uploads.
for (const [action, least] of [['checkout', 5], ['setup-node', 5], ['upload-artifact', 1]]) {
  test(`C27.5: every use of actions/${action} is pinned by commit and its version comment is v6 or later (Node 24)`, () => {
    const all = [...ci.matchAll(new RegExp(`uses:\\s*actions/${action}@`, 'g'))].length;
    const found = uses(action);
    assert.ok(all >= least, `the workflow uses actions/${action} in its jobs`);
    assert.equal(found.length, all, 'each use is a 40-hex commit with a vX.Y.Z comment');
    for (const u of found) assert.ok(u.major >= 6, `v${u.major} runs on Node 20`);
  });

  test(`C27.5: actions/${action} is one commit in the whole workflow`, () => {
    assert.equal(new Set(uses(action).map((u) => u.sha)).size, 1);
  });
}
