// Round 277: the 0.1.1 publication is recorded in the docs. Written before the text; each assertion is red until it exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

const ZIP_SHA = 'a20c2f20e31d6937c0c90252412d96d51237c4676cbf99cce85f8e7a9ac7f8f7';
const KIT_SHA = 'f8ca89dd1e3e3fb4c1b47d014c472605975f12ea9535bb6a6a41c731625bf37f';

const section = () => {
  const s = read('docs/release.md');
  const i = s.indexOf('## Published: 0.1.1 (round 277');
  assert.ok(i > 0, 'docs/release.md has no «## Published: 0.1.1 (round 277…)» section');
  const rest = s.slice(i + 5);
  const j = rest.indexOf('\n## ');
  return j < 0 ? s.slice(i) : s.slice(i, i + 5 + j);
};

test('docs/release.md: the section says who published what, when, and in which order', () => {
  const s = section();
  assert.match(s, /Rodrigo published/);
  assert.match(s, /`chicla-zip` 0\.1\.1/);
  assert.match(s, /`chicla-kit` 0\.1\.1/);
  assert.match(s, /2026-10-28/);
  assert.ok(s.indexOf('`chicla-zip` 0.1.1') < s.indexOf('`chicla-kit` 0.1.1'), 'the zip comes first in the text, as it did on npm');
  for (const tag of ['chicla-zip-v0.1.1', 'chicla-kit-v0.1.1']) assert.ok(s.includes(tag), `the tag ${tag} is not named`);
  assert.match(s, /GitHub releases/);
});

test('docs/release.md: what Claude saw (the registry, the two sha256 of the served tarballs) and what only Rodrigo did', () => {
  const s = section();
  assert.ok(s.includes(ZIP_SHA), 'the sha256 of the chicla-zip tarball npm serves is missing');
  assert.ok(s.includes(KIT_SHA), 'the sha256 of the chicla-kit tarball npm serves is missing');
  assert.match(s, /byte-identical/, 'it must say the served tarballs equal the ones packed from the round 276 tree');
  assert.match(s, /pack-release/);
  assert.match(s, /21:45/);
  assert.match(s, /21:48/);
  assert.match(s, /not seen by Claude/i, 'the tags, the releases and his sha256 check were not seen by Claude: say so');
});

test('docs/release.md: the section does not say the AI published, tagged or released anything', () => {
  const s = section();
  assert.doesNotMatch(s, /Claude (ran|published|tagged|created) /i);
  assert.match(s, /only Rodrigo publishes/i);
});

test('ROADMAP: D146 and the G-C6 row carry the publication, in Rodrigo\'s words, with no gate marked by the AI', () => {
  const r = read('ROADMAP.md');
  const d146 = r.split('\n').find((l) => l.startsWith('| D146 |'));
  assert.ok(d146, 'D146 is missing');
  assert.match(d146, /PUBLISHED by Rodrigo \(2026-10-28/);
  assert.match(d146, /round 277/);
  const g = r.split('\n').find((l) => l.startsWith('| G-C6 '));
  assert.ok(g, 'the G-C6 row is missing');
  assert.match(g, /0\.1\.1/);
  assert.match(g, /round 277/);
  assert.match(g, /FECHADO por Rodrigo, 2026-10-22/, 'the gate keeps the closing it already had; the round does not re-mark it');
});

test('status file: the status file (live or archived, never a fixed line) names round 277 and the publication', () => {
  const s = statusWithArchives(root);
  assert.match(s, /- Done: round 277 \(2026-10-28; Rodrigo: «já fiz as tags as releases/);
  assert.match(s, /Last updated \(round 277\):|Previous \(round 277\):/);
  assert.match(s, /round 277: \*\*no decision opened;\*\*/);
});
