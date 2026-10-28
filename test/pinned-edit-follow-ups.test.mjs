// Round 271 (C21.1, D-270b and D-270c confirmed by Rodrigo: «sim a tudo»; plan in docs/plan-a2-pins.md §2 and §5; AUDIT-4 A-2): an edit of a pinned file must cost `bump-round` and nothing else.
// Measured in round 270: one comment line in a pinned file plus `bump-round --refresh` left `--verify` green but turned the `pinned-*-move` test of that file red (a frozen sha256, or reverse
// patches), for each of the five files except `zipkit.mjs`. This test makes that experiment every time, on a copy of the tree, once per pinned file: append one comment line, refresh the
// pin, check `--verify`, and run the tests that read the pinned files (the four move tests, the pin tests, the fingerprint docs). Written before the fix; red until the four move tests
// stop freezing bytes (4 of the 5 subtests red first). The tree itself is never edited: the copies are thrown away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLCHAIN_SOURCES } from './toolchain-files.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// NODE_TEST_CONTEXT is dropped: a child `node --test` that inherits it reports into the parent runner and exits 0 whatever it saw (round 267)
const { NODE_TEST_CONTEXT, ...env } = process.env;
const node = (cwd, ...a) => spawnSync(process.execPath, a, { cwd, encoding: 'utf8', env, maxBuffer: 1 << 28, timeout: 240000 });
const READERS = [
  'test/pinned-baseline-move.test.mjs', 'test/pinned-manifest-move.test.mjs', 'test/pinned-policy-move.test.mjs', 'test/pinned-recovery-report-move.test.mjs',
  'test/toolchain-pin.test.mjs', 'packages/chicla-kit/test/core-integrity-state.test.mjs', 'test/fingerprint-docs.test.mjs',
];

// the names are the helper's (`toolchain-files.test.mjs` holds the exact five); a test never writes a pinned path itself, so this one only counts
test('the pinned files are the ones the helper names (so a sixth cannot escape this test)', () => {
  assert.equal(Object.keys(TOOLCHAIN_SOURCES).length, 5);
});

for (const [name, src] of Object.entries(TOOLCHAIN_SOURCES)) {
  test(`an edit of ${name} costs bump-round only: after one comment line and \`bump-round --refresh\`, --verify is green and the tests that read the pinned files are green`, () => {
    const d = mkdtempSync(join(tmpdir(), 'chicla-pinedit-'));
    try {
      cpSync(ROOT, d, { recursive: true, filter: (p) => !/(^|[\\/])node_modules([\\/]|$)/.test(p) });
      const before = node(d, 'scripts/bump-round.mjs', '--verify');
      assert.equal(before.status, 0, `the copy is not consistent before the edit: ${before.stdout}`);
      appendFileSync(join(d, src), '\n// edit of a pinned file, to measure what it costs\n');
      const stale = node(d, 'scripts/bump-round.mjs', '--verify');
      assert.notEqual(stale.status, 0, 'the pin must notice the edit before the refresh (else this test measures nothing)');
      const fix = node(d, 'scripts/bump-round.mjs', '--refresh');
      assert.equal(fix.status, 0, fix.stdout + fix.stderr);
      const after = node(d, 'scripts/bump-round.mjs', '--verify');
      assert.equal(after.status, 0, after.stdout + after.stderr);
      const t = node(d, '--test', ...READERS);
      assert.equal(t.status, 0, `the edit of ${name} turned these red: ${(t.stdout.match(/^not ok .*$/gm) ?? []).join(' | ') || t.stderr.slice(-400)}`);
    } finally { rmSync(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
  });
}
