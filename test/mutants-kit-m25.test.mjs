// Round 294 (C25.3, AUDIT-9 F-9, AUDIT-8 F-6): the code M24 touched gets hand mutants in the kit list, so `npm run mutants:kit` can repeat them. Written before the entries; red until they exist.
// The shape and the anchors of every entry are held by `test/mutants-kit-list.test.mjs`; this file holds WHICH guarantees are in the list (one entry per leg of the M24 code).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const list = (await import(pathToFileURL(join(root, 'packages/chicla-kit/mutants/list.mjs')).href)).default;
const byId = (id) => list.find((m) => m.id === id);

const WANT = {
  'K-PKG-01': 'scripts/build-chicla.mjs',                    // the pinned copy of zipkit.mjs in the built package (C24.1)
  'K-PKG-02': 'packages/chicla-kit/src/emergency-dump.mjs',  // the toolchain files are looked for beside the module first (C24.5)
  'K-PKG-03': 'packages/chicla-kit/src/init.mjs',            // the package.json of a new project is private (C24.2)
  'K-PKG-04': 'packages/chicla-kit/src/init.mjs',            // ... and carries the version of the template
  'K-PKG-05': 'scripts/pack-release.mjs',                    // npm is started through a shell on Windows only (C24.6)
  'K-PKG-06': 'scripts/win-quote.mjs',                       // every part of the Windows command line is quoted (C25.1)
  'K-PKG-07': 'scripts/failure-reason.mjs',                  // a failed step shows the line that says what failed (C25.4)
  'K-LDR-01': 'packages/chicla-kit/src/zipkit-loader.mjs',   // a zipkit.mjs beside the loader is used first (C23.1)
  'K-LDR-02': 'packages/chicla-kit/src/zipkit-loader.mjs',   // any other error is passed on, never hidden by the next step
};

test('the kit list names the nine guarantees of the M24 code, each on the file that holds it', () => {
  for (const [id, file] of Object.entries(WANT)) {
    const m = byId(id);
    assert.ok(m, `${id} is not in the list`);
    assert.equal(m.file, file, `${id} targets ${m.file}`);
    assert.ok(m.tests.length > 0 && m.why.length > 20, `${id}: tests and a reason`);
  }
});

test('ROADMAP: C25.3 is done (round 294) and says what was run and what was not', () => {
  const c = readFileSync(join(root, 'ROADMAP.md'), 'utf8').split('\n').find((l) => l.startsWith('| C25.3 |')) ?? '';
  assert.match(c, /feito \(round 294/);
  assert.match(c, /mutants:kit/);
});
