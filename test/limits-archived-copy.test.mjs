// Round 267 (C20.2, AUDIT-7 F-3; D-265b confirmed by Rodrigo: «aceito tudo»): the tests of the archive limits (`core-bump-round-limits.test.mjs`) must not assume how many «Previous» blocks,
// «Done» lines or CHANGELOG rounds the live files hold: item 6 moves them to the limits and below, and a test that says «the live file has exactly 5» goes red in the window between the
// archive and the round's own rotation (measured in AUDIT-7: 3 of 1613 red on an archived copy). This test makes that experiment every time: a copy of the whole tree is archived as deep as
// the rules allow, its fingerprints are refreshed, and the limits test file is run there. Written before the fix; red until it (3 red in the copy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// NODE_TEST_CONTEXT is dropped: a child `node --test` that inherits it reports into the parent runner and exits 0 whatever it saw
const { NODE_TEST_CONTEXT, ...env } = process.env;
const node = (cwd, ...a) => spawnSync(process.execPath, a, { cwd, encoding: 'utf8', env });

test('on a copy archived to the depth of item 6 (--keep 3, 1 «Previous», 2 «Done», 1 rolling clause), the limits test file is still green', () => {
  const d = mkdtempSync(join(tmpdir(), 'chicla-limarch-'));
  try {
    cpSync(ROOT, d, { recursive: true, filter: (p) => !/(^|[\\/])node_modules([\\/]|$)/.test(p) });
    for (const args of [['--keep', '3'], ['--status', '--keep-previous', '1'], ['--snapshot', '--keep-done', '2'], ['--rolling', '--keep-clauses', '1']]) {
      const r = node(d, 'scripts/archive-changelog.mjs', ...args);
      assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
    }
    const f = node(d, 'scripts/bump-round.mjs', '--refresh');
    assert.equal(f.status, 0, f.stdout + f.stderr);
    const t = node(d, '--test', 'packages/chicla-kit/test/core-bump-round-limits.test.mjs');
    assert.equal(t.status, 0, (t.stdout.match(/^not ok .*$/gm) ?? []).join('\n') || t.stderr.slice(-400));
  } finally { rmSync(d, { recursive: true, force: true }); }
});
