// C30.3 (D-C, D-D, D-L; Rodrigo «avança», round 331): the CLAUDE.md and AGENTS.md templates say (1) the open decisions are listed IN THE REPLY, each with the
// agent's suggestion and a one-line reason (the status file does not count), also at the close of a round; (2) «How the owner answers»: `ok`, `ok, 2 não`, `ok, 2: <text>`,
// and `ok` with none open = the task under «Next up», never applied to what only the owner can do; (3) a command box holds commands only, never a comment.
// Written before the templates: red until they say it. Tests assert the tokens of the convention, not a sentence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(join(KIT, f)).href);
const { initProject } = await imp('src/init.mjs');
const { updateProject } = await imp('src/update.mjs');
const tpl = (n) => readFileSync(join(KIT, 'templates', n), 'utf8');

for (const name of ['CLAUDE.md', 'AGENTS.md']) {
  test(`${name}: the open decisions are listed in the reply with a suggestion; the status file does not count; also at the close of a round`, () => {
    const t = tpl(name);
    assert.match(t, /in (the|your) reply/i, 'says where the list goes');
    assert.match(t, /suggestion/i);
    assert.match(t, /status file[^.\n]*does not count/i, 'a mention in the status file is not the list');
    assert.match(t, /(close|end)[^.\n]*round/i, 'also at the close of a round');
  });
  test(`${name}: the owner's one-line answers are defined`, () => {
    const t = tpl(name);
    assert.match(t, /How the owner answers/);
    for (const tok of ['`ok`', '`confirmo tudo`', '`avança`', '`ok, 2 não`', '`ok, 2: <text>`']) assert.ok(t.includes(tok), `names ${tok}`);
    assert.match(t, /Next up/, '`ok` with no open decision is the task under «Next up»');
    assert.match(t, /gate/i, 'gates are named as never covered by an `ok`');
    assert.match(t, /publish/i);
    assert.match(t, /delet/i);
    assert.match(t, /rule/i);
  });
  test(`${name}: a command box holds commands only, never a comment; the explanation goes outside the box`, () => {
    const t = tpl(name);
    assert.match(t, /never a comment/i);
    assert.match(t, /outside the box/i);
  });
}

test('chicla update shows the new text as a difference to a project that has the old template, and applies it only when asked', () => {
  const d = mkdtempSync(join(tmpdir(), 'chicla-c303-'));
  try {
    assert.equal(initProject({ name: 'CHICLA', root: d }).ok, true);
    const full = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
    const at = full.indexOf('## 1b. How the owner answers');
    assert.ok(at > 0, 'the fresh CLAUDE.md has the section');
    const old = full.slice(0, at) + full.slice(full.indexOf('\n## ', at + 5) + 1);
    writeFileSync(join(d, 'CLAUDE.md'), old);
    const r = updateProject({ root: d });
    const c = r.files.find((f) => f.file === 'CLAUDE.md');
    assert.equal(c.state, 'differs');
    assert.match(c.diff, /^\+.*How the owner answers/m);
    assert.equal(readFileSync(join(d, 'CLAUDE.md'), 'utf8'), old, 'nothing written without --apply');
    const a = updateProject({ root: d, apply: ['CLAUDE.md'] });
    assert.equal(a.ok, true);
    assert.equal(readFileSync(join(d, 'CLAUDE.md'), 'utf8'), full);
  } finally { rmSync(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});
