// Round 268 (C20.3, AUDIT-7 F-2 and F-4; D-265c confirmed by Rodrigo: «aceito tudo»): what the docs say about the kit mutant list is derived from the list, not remembered.
// AUDIT-7 counted 126 entries and ten prefixes where the docs said «100 entries, minutes» and named eight prefixes; the whole pass took about 34 minutes on 2 cores, not minutes.
// Written before the docs; red until they are true. Docs and this test only: no source, the pin does not move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { statusText } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const LIST = 'packages/chicla-kit/mutants/list.mjs';
const list = (await import(pathToFileURL(join(root, LIST)).href)).default;
const prefixes = [...new Set(list.map((m) => m.id.replace(/\d+$/, '')))];
const itemC = () => { const item = statusText().split('\n').find((l) => l.startsWith('20. **Long commands')); return item.slice(item.indexOf('(c) Mutants'), item.indexOf('(d) If a wait')); };
const header = () => read(LIST).split('\n').filter((l) => l.startsWith('//')).slice(0, 4).join('\n');

// round 294 (C25.3) added K-LDR- and K-PKG-
test('the list has the prefixes AUDIT-7 counted plus the two of C25.3 (a new prefix must reach the docs: this number moves with it)', () => {
  assert.deepEqual(prefixes.sort(), ['K-ARC-', 'K-BMP-', 'K-CMN-', 'K-DEL-', 'K-DMP-', 'K-INT-', 'K-LDR-', 'K-MAN-', 'K-PKG-', 'K-PNL-', 'K-REC-', 'K-VER-']);
});

test('docs/README.md names every prefix of the list', () => {
  const row = read('docs/README.md').split('\n').find((l) => l.includes(LIST));
  assert.ok(row, 'docs/README.md has no row for the list');
  for (const p of prefixes) assert.ok(row.includes(`\`${p}\``), `docs/README.md does not name ${p}`);
});

test('item 20 (c) and the header of the list carry no entry count that is not the list\'s, and both say the whole pass is about half an hour', () => {
  for (const [where, text] of [['item 20 (c)', itemC()], ['the header of the list', header()]]) {
    for (const m of text.matchAll(/\b(\d+) (entries|mutants)\b/g)) assert.equal(+m[1], list.length, `${where} says «${m[0]}», the list has ${list.length}`);
    assert.match(text, /half an hour/, `${where} does not say how long the whole pass takes`);
    assert.doesNotMatch(text, /minutes, 210 s|about 100|100 entries/, `${where} still carries the old figure`);
  }
});

test('the ROADMAP rows of M19 carry their real states: no «PROPOSED», no «in progress», no «proposed» in the heading (M19 is complete)', () => {
  const r = read('ROADMAP.md');
  const m19 = r.slice(r.indexOf('### M19 '), r.indexOf('### M20 '));
  assert.ok(m19.length > 500, 'M19 section not found');
  const head = m19.split('\n')[0];
  assert.doesNotMatch(head, /proposed/i, 'the M19 heading still says proposed');
  for (const row of m19.split('\n').filter((l) => /^\| C19\.\d /.test(l))) {
    assert.doesNotMatch(row, /PROPOSED|in progress/, `a row of M19 carries a stale state: ${row.slice(0, 12)}`);
    assert.match(row, /feito|done/, `${row.slice(0, 8)} does not say it is done`);
  }
});
