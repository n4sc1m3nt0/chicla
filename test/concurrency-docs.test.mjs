// C15.13 (ZIP-003 and ZIP-004, D134, round 194), written before the docs: `SECURITY.md` and `docs/zip-handling.md` must SAY that `createZip` and the
// merge mode of `extractZip` are not safe against a concurrent writer of the tree or the destination. Before this round both were silent, and the
// «what counts as a vulnerability» list in `SECURITY.md` read as a guarantee about crafted zips only. The behaviour itself is pinned in
// `packages/chicla-zip/test/concurrent-writer.test.mjs`: when C15.14 or C15.15 changes it, these texts change with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const section = (s, from, to) => { const a = s.indexOf(from); assert.ok(a >= 0, `missing: ${from}`); const b = to ? s.indexOf(to, a + from.length) : -1; return s.slice(a, b < 0 ? undefined : b); };

test('SECURITY.md «known limits» says createZip and the merge mode of extractZip are not safe against a concurrent writer, and names the two effects', () => {
  const sec = section(read('SECURITY.md'), '## What is not a vulnerability', '\n## ');
  assert.match(sec, /concurrent writer/i);
  assert.match(sec, /`createZip`/);
  assert.match(sec, /merge/i);
  assert.match(sec, /symlink/i, 'a folder swapped for a symlink');
  assert.match(sec, /replac/i, 'a file replaced during the merge');
  assert.match(sec, /not a guarantee|no guarantee|not safe|not protected/i);
});

test('SECURITY.md «what counts» carves the concurrent writer out of the extraction guarantee, with a pointer to the known limits', () => {
  const sec = section(read('SECURITY.md'), '## What counts as a vulnerability', '\n## What is not');
  assert.match(sec, /concurrent writer/i);
  assert.match(sec, /known limits/i);
});

test('docs/zip-handling.md says it in §3 (the merge), §4 (createZip) and §7 (known limits), each time as a limit and not a promise', () => {
  const s = read('docs/zip-handling.md');
  const s3 = section(s, '## 3. What extraction promises', '\n## 4.'), s4 = section(s, '## 4. What the writer promises', '\n## 5.'), s7 = section(s, '## 7. Known limits', '\n## 8.');
  for (const [name, sec] of [['§3', s3], ['§4', s4], ['§7', s7]]) assert.match(sec, /concurrent writer/i, `${name} is silent`);
  assert.match(s3, /merge/i);
  assert.match(s4, /`createZip`/);
  assert.match(s7, /symlink/i);
  assert.match(s7, /replac/i);
  assert.match(s7, /C15\.14/, '§7 says the cheap half narrows the window');
  assert.match(s7, /C15\.15/, '§7 says descriptor pinning is the fix and is not done');
});

test('both docs say what to do about it: run it when nothing else writes to the tree or the destination (a private folder)', () => {
  for (const f of ['SECURITY.md', 'docs/zip-handling.md']) assert.match(read(f), /nothing else (is )?writ(es|ing)|only you can write|private folder/i, f);
});

// C15.14 slice c (round 197), written before the docs: the re-check in `mergeMove` exists since round 195, so the texts say it in the present tense,
// name the code (`EEXIST`), say the window is narrower and NOT closed, and no longer promise it as future work.
test('both docs say the re-check before each move is done (C15.14), gives EEXIST, and that the window is narrower and not closed', () => {
  const sec = section(read('SECURITY.md'), '## What is not a vulnerability', '\n## ');
  const s7 = section(read('docs/zip-handling.md'), '## 7. Known limits', '\n## 8.');
  for (const [name, t] of [['SECURITY.md', sec], ['zip-handling §7', s7]]) {
    assert.match(t, /C15\.14/, name);
    assert.match(t, /`EEXIST`/, `${name}: the code a lost race gives`);
    assert.match(t, /narrow(s|er)/i, `${name}: narrower`);
    assert.match(t, /not closed|does not close|without closing|never closes/i, `${name}: not closed`);
    assert.doesNotMatch(t, /C15\.14[^.]*\bwill\b/i, `${name}: still future tense for C15.14`);
  }
});

test('docs/zip-handling.md §3 point 8 also says the merge looks at the target again before each move', () => {
  const s3 = section(read('docs/zip-handling.md'), '## 3. What extraction promises', '\n## 4.');
  assert.match(s3, /again before each move|right before each move/i);
  assert.match(s3, /`EEXIST`/);
});
