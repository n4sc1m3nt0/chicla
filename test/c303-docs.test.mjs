// C30.3 (round 331, Rodrigo «avança»): the project's own CLAUDE.md and the delivery item of the status file carry the same three rules as the templates (D-C, D-D, D-L),
// the mirrors of AGENTS.md carry the same body, and the roadmap card is recorded. Written before the docs: red until they say it. Docs and templates only: no source, the pin does not move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusText } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');

test('CLAUDE.md of the project: the open decisions are in the reply, the owner\'s answers are defined, and a command box has no comment', () => {
  const c = read('CLAUDE.md');
  assert.match(c, /in the reply/i);
  assert.match(c, /status file[^.\n]*does not count/i);
  assert.match(c, /How the owner answers/);
  for (const tok of ['`ok`', '`confirmo tudo`', '`avança`', '`ok, 2 não`', '`ok, 2: <text>`']) assert.ok(c.includes(tok), `names ${tok}`);
  assert.match(c, /never a comment/i);
  assert.match(c, /outside the box/i);
});

test('the delivery item (14) of the status file has the rule of the command box (D-L, D161)', () => {
  const item = statusText().split('\n').find((l) => l.startsWith('14. **Delivery.**')) ?? '';
  assert.ok(item, 'item 14 exists');
  assert.match(item, /never a comment/i);
  assert.match(item, /outside the box/i);
});

test('ROADMAP: C30.3 is recorded as done, and C30.4 is still open', () => {
  const rows = read('ROADMAP.md').split('\n');
  assert.match(rows.find((l) => l.startsWith('| C30.3 |')) ?? '', /\| S · feito \(round 331/);
  assert.match(rows.find((l) => l.startsWith('| C30.4 |')) ?? '', /\| M · open \|/);
});

test('the GEMINI.md and copilot templates, which are one body with AGENTS.md, carry the new items', () => {
  for (const f of ['GEMINI.md', 'copilot-instructions.md']) {
    const t = readFileSync(join(root, 'packages/chicla-kit/templates', f), 'utf8');
    assert.match(t, /How the owner answers/);
    assert.ok(t.includes('`ok, 2 não`'));
    assert.match(t, /never a comment/i);
  }
});
