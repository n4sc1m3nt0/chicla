// Round 272 (C21.2, D-270d confirmed by Rodrigo: «sim a tudo»; plan docs/plan-a2-pins.md §5; AUDIT-4 A-2, D138 part 2): the cost of editing a pinned file is written down ONCE, in
// docs/pinned-files-design.md, and the pin's digest has ONE home (`CLAUDE.md`): `bump-round` writes it there, `--verify` and the shell start line of item 17 read it, nobody else copies it.
// A copy elsewhere would be one more follow-up after every edit of a pinned file, which is the cost A-2 was about. Written before the docs; red until they exist. Docs and one test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const DOC = 'docs/pinned-files-design.md';
const SECTION = '## 8. What an edit of a pinned file costs';
const section = () => read(DOC).split(SECTION)[1];

test('docs/pinned-files-design.md has the section «What an edit of a pinned file costs» with its five steps in order (edit, bump-round, --verify, the whole npm test, the real dump)', () => {
  assert.ok(read(DOC).includes(SECTION), `«${SECTION}» missing in ${DOC}`);
  const steps = section().split('\n').filter((l) => /^\d+\. /.test(l));
  assert.equal(steps.length, 5, 'five numbered steps');
  [/edit/i, /bump-round/, /--verify/, /npm test/, /\/dump/].forEach((re, i) => assert.match(steps[i], re, `step ${i + 1} should match ${re}: «${steps[i].slice(0, 40)}»`));
});

test('the section says what no longer costs anything and what still does: the move tests do not freeze bytes, the test that proves it, the gate for a real dump, the pin in one place', () => {
  const s = section();
  assert.match(s, /pinned-edit-follow-ups/);
  assert.match(s, /no longer freeze|do not freeze/i);
  assert.match(s, /«recovery mode»|recovery mode/);
  assert.match(s, /G-C11/);
  assert.match(s, /CLAUDE\.md/);
  assert.match(s, /plan-a2-pins/);
  assert.match(s, /zipkit/);
});

test('the digest of the `toolchain-digest:` line of CLAUDE.md occurs in no other file of the manifest (the CHANGELOG files and the verbatim status archives are history and may quote it)', () => {
  const digest = (read('CLAUDE.md').match(/toolchain-digest: ([0-9a-f]{64})/) ?? [])[1];
  assert.ok(digest, 'CLAUDE.md has no toolchain-digest line');
  const names = read('FILES.manifest').split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((n) => n && !n.startsWith('#') && existsSync(join(root, n)));
  assert.ok(names.length > 100, `the manifest lists ${names.length} files: the reader is wrong`);
  const history = /^(CHANGELOG(-archive-[^/]*)?\.md|docs\/status-archive-[^/]*\.md)$/;
  const homes = names.filter((n) => !history.test(n) && /\.(md|mjs|json|yml|yaml|txt)$/.test(n) && read(n).includes(digest));
  assert.deepEqual(homes, ['CLAUDE.md'], 'the digest must live in CLAUDE.md only');
});

test('D138 and AUDIT-4 A-2 are marked closed, the ROADMAP rows of M21 say feito, and docs/README points at the section', () => {
  const r = read('ROADMAP.md');
  const d138 = r.split('\n').find((l) => l.startsWith('| D138 |'));
  assert.match(d138, /A-2 closed \(round 272\)/);
  assert.match(d138, /A-2 waits/, 'the round 242 history is kept (plan-a1-docs reads it)');
  for (const c of ['C21.1', 'C21.2']) assert.match(r.split('\n').find((l) => l.startsWith(`| ${c} |`)), /feito/, `${c} is not feito`);
  const a2 = read('docs/audits/AUDIT-4.md').split('\n').find((l) => l.startsWith('- **A-2.'));
  assert.match(a2, /Closed \(round 272/i);
  assert.ok(read('docs/README.md').split('\n').find((l) => l.includes('pinned-files-design.md')).includes('What an edit of a pinned file costs'), 'docs/README.md does not point at the section');
});
