// C32.4 (D167): the three `chicla release` commands are in the docs. The runbook (`docs/release.md`) opens with a section for them, the three READMEs (root, kit, the page npm shows) name all three,
// and the help names them. Written before the docs: red until they are written. Docs only. Asserts names and flags, never prose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const { main } = await import(pathToFileURL(join(root, 'packages/chicla-kit/src/cli.mjs')).href);

test('the runbook opens with the section for `chicla release`, with the three commands, their flags and the rule that only Rodrigo publishes', () => {
  const doc = read('docs/release.md'), first = doc.split(/^## /m)[1];
  assert.match(first.split('\n')[0], /chicla release/);
  for (const s of ['release check', 'release prepare --run', 'release publish --from', '--confirm', '--out', 'gh run list', 'npm login', 'npm view', 'npm pack', 'EOTP', 'dist-']) assert.ok(first.includes(s), `the first section lacks «${s}»`);
  assert.match(first, /only Rodrigo/i); assert.match(first, /AI never runs/);
  assert.ok(doc.indexOf('## Releasing chicla 0.3.0') > doc.indexOf(first.slice(0, 40)), 'the older sections stay below, untouched');
});

test('the root README, the kit README and the page npm shows name all three commands', () => {
  for (const f of ['README.md', 'packages/chicla-kit/README.md', 'packages/chicla/README.md']) {
    const t = read(f);
    for (const s of ['release check', 'release prepare', 'release publish']) assert.ok(t.includes(s), `${f} lacks «${s}»`);
  }
});

test('the help line of `release` names check, prepare and publish', async () => {
  let out = ''; assert.equal(await main(['--help'], { stdout: { write: (s) => { out += s; } }, stderr: { write() {} } }), 0);
  const line = out.split('\n').find((l) => /^  release /.test(l)) ?? '';
  for (const s of ['check', 'prepare', 'publish']) assert.ok(line.includes(s), `the help line of release lacks «${s}»`);
});
