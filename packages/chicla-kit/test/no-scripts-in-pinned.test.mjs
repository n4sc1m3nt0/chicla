// C31.2 (AUDIT-12 F-1): the guard of `no-scripts-in-messages.test.mjs` skips `src/pinned/` on purpose (an edit there moves the pin); this one reads the pinned files too. No non-comment line of a pinned file may name
// the scripts folder, and the NEXT line of `chicla recovery` must say `chicla make-delivery`: a user of the published package has no scripts folder. Written before the fix: red on line 253 of recovery-report.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PINNED = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'pinned');
const FOLDER = ['scripts', '/'].join(''); // built in code, never written, so no text guard counts this file
const files = readdirSync(PINNED).filter((f) => f.endsWith('.mjs'));
const code = (f) => readFileSync(join(PINNED, f), 'utf8').split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => !/^\s*(\/\/|\*|\/\*)/.test(l));

test('the pinned files are found (a guard against an empty folder)', () => assert.ok(files.length >= 4, files.join(',')));

test('no non-comment line of a pinned file names the scripts folder', () => {
  const hits = files.flatMap((f) => code(f).filter(([, l]) => l.includes(FOLDER)).map(([n]) => `${f}:${n}`));
  assert.deepEqual(hits, []);
});

test('the NEXT line of recovery-report says `chicla make-delivery <out.zip> --against <last delivery zip>`', () => {
  const next = code('recovery-report.mjs').map(([, l]) => l).find((l) => l.includes('NEXT: read the note above'));
  assert.ok(next, 'the NEXT line is not found');
  assert.ok(next.includes('chicla make-delivery <out.zip> --against <last delivery zip>'));
});
