// D44 (round 89): after the G-C7 rehearsal (a recovery with no zip, closed by Rodrigo 2026-10-11) the sentence the AI says after a /dump no longer asks for
// the last delivery zip: the baseline travels inside the dump (C9.6). `CLAUDE.md` and item 17 of the status file must say the same thing.
// The test reads the quoted sentence («Dump created: <n>. ...») in both files; it asserts content, not exact wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const status = readdirSync(ROOT).filter((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f));
const sentence = (file) => (readFileSync(join(ROOT, file), 'utf8').match(/"(Dump created: <n>\.[^"]*)"/) ?? [])[1];

test('D44: there is exactly one status file and the /dump sentence is in it and in CLAUDE.md', () => {
  assert.equal(status.length, 1);
  for (const f of ['CLAUDE.md', status[0]]) assert.ok(sentence(f), `the quoted /dump sentence is in ${f}`);
});

for (const f of ['CLAUDE.md', 'status file']) {
  test(`D44: the /dump sentence in ${f} asks for «recovery mode» and no longer for the last delivery zip`, () => {
    const s = sentence(f === 'CLAUDE.md' ? f : status[0]);
    assert.ok(/recovery mode/.test(s), 'it still says to use recovery mode');
    assert.ok(!/delivery zip/i.test(s), 'it does not ask for the last delivery zip');
  });
}

test('D44: the two files carry the same sentence', () => {
  assert.equal(sentence('CLAUDE.md'), sentence(status[0]));
});

// D72 (round 101): `/dump project` is the same three steps with `--project-only` (C6.2, D70, D71). CLAUDE.md and item 17 must say the same thing.
const projectSentence = (file) => (readFileSync(join(ROOT, file), 'utf8').match(/"(Dump created \(project only\): <n>\.[^"]*)"/) ?? [])[1];
for (const f of ['CLAUDE.md', 'status file']) {
  test(`D72: ${f} defines /dump project: --project-only in step 1, its own sentence, recovery mode, and a plain /dump is unchanged`, () => {
    const file = f === 'CLAUDE.md' ? f : status[0];
    const text = readFileSync(join(ROOT, file), 'utf8');
    assert.ok(/`\/dump project`/.test(text), '/dump project is named');
    assert.ok(/emergency-dump\.mjs --project-only/.test(text), 'step 1 runs the script with --project-only');
    const s = projectSentence(file);
    assert.ok(s && /recovery mode/.test(s), 'its own sentence, and it asks for recovery mode');
    assert.ok(!/delivery zip/i.test(s));
    assert.ok(/refus/i.test(text.split('/dump project')[1].slice(0, 700)), 'it says what happens with no project root');
    assert.ok(sentence(file) && !/project only/.test(sentence(file)), 'the plain /dump sentence is untouched');
  });
}
test('D72: the two files carry the same /dump project sentence', () => {
  assert.ok(projectSentence('CLAUDE.md'), 'defined');
  assert.equal(projectSentence('CLAUDE.md'), projectSentence(status[0]));
});
