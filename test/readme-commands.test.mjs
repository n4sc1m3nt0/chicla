// C31.1 (AUDIT-12 F-2): every command that `chicla --help` lists is named in `packages/chicla/README.md` (the page npm shows), and `archive` is in the root README and in the kit README too.
// Written before the docs: red while `archive` is missing. Docs only. Asserts names, never prose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const { main } = await import(pathToFileURL(join(root, 'packages/chicla-kit/src/cli.mjs')).href);

const helpCommands = async () => {
  let out = '';
  assert.equal(await main(['--help'], { stdout: { write: (s) => { out += s; } }, stderr: { write() {} } }), 0);
  const block = out.split('Commands:\n')[1].split('\nOptions:')[0];
  return block.split('\n').map((l) => /^  ([a-z][a-z-]*)\s/.exec(l)?.[1]).filter(Boolean);
};

test('the help lists the commands this test expects to find (a guard against an empty parse)', async () => {
  const c = await helpCommands();
  for (const n of ['init', 'doctor', 'git-plan', 'archive', 'bump-round']) assert.ok(c.includes(n), `${n} not parsed from --help`);
  assert.ok(c.length >= 13);
});

test('packages/chicla/README.md names every command of --help', async () => {
  const readme = read('packages/chicla/README.md');
  for (const c of await helpCommands()) assert.ok(readme.includes(`\`${c}\``), `packages/chicla/README.md does not name \`${c}\``);
});

test('`chicla archive` has its usage line in the root README and its row in the kit README', () => {
  assert.match(read('README.md'), /^chicla archive /m);
  assert.match(read('packages/chicla-kit/README.md'), /^chicla archive /m);
  assert.match(read('packages/chicla-kit/README.md'), /^\| `chicla archive` \|/m);
});
