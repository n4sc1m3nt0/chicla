// Round 282 (C23.4, G-C16): the publication of `chicla` 0.2.0 by Rodrigo is recorded in the docs, and he closed the gate in his own words.
// Written before the text; each assertion is red until it exists. Only Rodrigo publishes: the AI ran no `npm publish`, `git tag`, `gh release create` or `npm deprecate`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const row = (text, prefix) => text.split('\n').find((l) => l.startsWith(prefix)) ?? '';
const SHA = 'bd13bc23ff0c2fdd6a97d722bf0a7f7e8b84f348cc978667903fbf7bb9def1b9';

const section = () => {
  const s = read('docs/release.md');
  const i = s.indexOf('## Published: chicla 0.2.0 (round 282');
  assert.ok(i > 0, 'docs/release.md has no «## Published: chicla 0.2.0 (round 282…)» section');
  const j = s.indexOf('\n## ', i + 5);
  return { text: j < 0 ? s.slice(i) : s.slice(i, j), at: i, all: s };
};

test('docs/release.md: «Published: chicla 0.2.0» sits right after the runbook and before the 0.1.1 history, and says who did what and when', () => {
  const { text, at, all } = section();
  assert.ok(at > all.indexOf('## Releasing chicla 0.2.0'), 'after the runbook');
  assert.ok(at < all.indexOf('## Releasing 0.1.1 (round 276'), 'before the 0.1.1 history');
  assert.match(text, /Rodrigo published/);
  assert.match(text, /2026-10-29/);
  for (const part of ['chicla-v0.2.0', '50bc186', 'chicla-zip', 'chicla-kit', 'npm deprecate', 'moved into chicla: npm install chicla']) assert.ok(text.includes(part), `missing: ${part}`);
});

test('docs/release.md: the numbers seen in his output (sha256, size, files) and the sha256 npm serves are the same as the CI tarball', () => {
  const { text } = section();
  assert.ok(text.includes(SHA));
  assert.match(text, /102885 bytes/);
  assert.match(text, /29 files/);
  assert.match(text, /npm serves[^\n]*same sha256|same sha256[^\n]*npm serves|npm pack chicla@0\.2\.0/i);
});

test('docs/release.md: the deprecation is listed per version (0.1.0 and 0.1.1 of both names; the 0.0.0 placeholders were marked too) and nothing was unpublished', () => {
  const { text } = section();
  for (const v of ['chicla-zip@0.1.0', 'chicla-zip@0.1.1', 'chicla-kit@0.1.0', 'chicla-kit@0.1.1']) assert.ok(text.includes(v), `missing: ${v}`);
  assert.match(text, /0\.0\.0-stage/);
  assert.match(text, /no `npm unpublish`|nothing was unpublished/i);
});

test('docs/release.md: what went differently is written down (EOTP through a pipe; the rebuilt tarball differs by npm version, the content does not) and the runbook says so', () => {
  const { text, all } = section();
  assert.match(text, /EOTP/);
  assert.match(text, /npm 12|npm 10/);
  assert.match(text, /diff -r|content/i);
  const run = all.slice(all.indexOf('## Releasing chicla 0.2.0'), all.indexOf('## Published: chicla 0.2.0'));
  assert.match(run, /diff -r/, 'step 5 now compares the CONTENT of the rebuild, not its bytes');
  assert.match(run, /without `tee`|no `tee`|not through `tee`|never through a pipe|never through `tee`/i, 'step 6 says to publish without a pipe');
  assert.doesNotMatch(run, /its sha256 must equal the one in dist\/; if not, stop/);
});

test('docs/release.md: Claude is honest about what it saw: only his pasted output, never the registry or GitHub itself', () => {
  const { text } = section();
  assert.match(text, /Not seen by Claude|not seen by Claude/);
  assert.match(text, /pasted/);
  assert.doesNotMatch(text, /Claude (ran|published|tagged|deprecated)/);
  assert.match(text, /AI ran no `npm publish`/);
});

test('ROADMAP: G-C16 is CLOSED by Rodrigo (2026-10-29, in his words) and C23.4 is done; M23 has no open card left', () => {
  const r = read('ROADMAP.md');
  assert.match(row(r, '| G-C16 '), /CLOSED by Rodrigo \(2026-10-29/);
  assert.match(row(r, '| G-C16 '), /podes fechar/);
  assert.match(row(r, '| C23.4 |'), /feito \(round 282/);
  const m23 = r.slice(r.indexOf('### M23'), r.indexOf('\n### ', r.indexOf('### M23') + 5) < 0 ? undefined : r.indexOf('\n### ', r.indexOf('### M23') + 5));
  assert.doesNotMatch(m23, /\| (M|gate) · open/);
  assert.match(row(r, '| D148 |'), /PUBLISHED|published by Rodrigo/);
});

test('status file: the gate row is CLOSED, the round 282 line is in the Snapshot, and Next up names no open decision', () => {
  const s = statusWithArchives(root);
  assert.match(s, /\| G-C16 \|[^\n]*0\.2\.0[^\n]*\| CLOSED by Rodrigo \(2026-10-29/);
  assert.match(s, /- Done: round 282 \(2026-10-29/);
  assert.match(s, /round 282: \*\*none open/);
});

test('README, SECURITY and the old READMEs: the deprecation is a fact now, not a plan', () => {
  assert.match(read('README.md'), /deprecated on npm/i);
  assert.doesNotMatch(read('README.md'), /waits for the owner to publish|is to be deprecated/i);
  for (const f of ['packages/chicla-zip/README.md', 'packages/chicla-kit/README.md']) assert.match(read(f), /are deprecated on npm/i, f);
});
