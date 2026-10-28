// Round 259 (C19.3, AUDIT-6 F-3; D-256c confirmed by Rodrigo: «d142 sim»): the tests that look for a card, audit, decision or round NAME in the status file read it through
// `test/status-text.mjs` (`statusWithArchives`), never the live file alone: the archive rules move those lines. Written before the change; red until it is done.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statusName, statusText, statusArchives, statusWithArchives } from './status-text.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const T = mkdtempSync(join(tmpdir(), 'chicla-c193-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));

test('the helper returns the newest status file by number (-9 before -10), its text, and the archives sorted', () => {
  const d = join(T, 'a'); cpSync(join(root, 'docs'), join(d, 'docs'), { recursive: true });
  for (const n of [9, 10, 2]) writeFileSync(join(d, `CHICLA_PROJECT_STATUS-${n}.md`), `live ${n}\n`);
  writeFileSync(join(d, 'CHICLA_PROJECT_STATUS-11.md.bak'), 'not a status file');
  assert.equal(statusName(d), 'CHICLA_PROJECT_STATUS-10.md');
  assert.equal(statusText(d), 'live 10\n');
  const arch = statusArchives(d);
  assert.ok(arch.length > 0 && arch.every((f) => /^docs\/status-archive-.*\.md$/.test(f)));
  assert.deepEqual(arch, [...arch].sort());
  assert.equal(statusArchives(join(T, 'nowhere')).length, 0, 'no docs folder, no archives, no throw');
});

test('a name that was archived is still found: the live file lost the line, the archive has it verbatim, `statusWithArchives` sees it, `statusText` does not (the round 252 accident)', () => {
  const d = join(T, 'b'); cpSync(join(root, 'docs'), join(d, 'docs'), { recursive: true });
  writeFileSync(join(d, 'CHICLA_PROJECT_STATUS-3.md'), '# status\n- Done: round 5. nothing named here\n');
  writeFileSync(join(d, 'docs/status-archive-done-1-2.md'), '# archive\n- Done: round 2 (plan-a1-integrity, C17.1, AUDIT-4)\n');
  assert.doesNotMatch(statusText(d), /AUDIT-4/);
  assert.match(statusWithArchives(d), /AUDIT-4/); assert.match(statusWithArchives(d), /round 5/);
});

// The guard: a root test that selects the status file of the real root by itself (the literal regex `/^CHICLA_PROJECT_STATUS-\d+\.md$/` in its source) is in this table with its reason, or it imports the helper.
// Every entry reads STRUCTURE or the stable Instructions block, or builds its own fake status file; none looks for a card, audit, decision or round name in the live file.
const OWN_READ = {
  'audit5-archive.test.mjs': 'counts the «Previous» blocks and «Done» lines of the LIVE file: that is the limit itself, archives must not count',
  'docs-accuracy.test.mjs': 'reads the Instructions block (items 4, 6, 20), which no archive rule moves',
  'archive-rolling.test.mjs': 'one test measures the LIVE «Current version» and «Open decisions» lines and the archive pointers, which must be in the live file',
  'integrity-docs.test.mjs': 'the Map (item 4) names docs/integrity.md: the Instructions block',
  'layout.test.mjs': 'counts the status files in the root (exactly one)',
  'toolchain-pin.test.mjs': 'reads the start line of item 17 (the Instructions block)',
  'dump-sentence.test.mjs': 'reads the dump sentence of the Instructions block (item 17)',
  'roadmap-gates.test.mjs': 'reads the Gates table, which no archive rule moves',
  'state-file-docs.test.mjs': 'runs the real status file through the state rules (its structure), not for a name',
};
test('every root test that picks the newest status file by itself imports the helper or is in OWN_READ with a reason (a grep over test/)', () => {
  const pick = /\/\^CHICLA_PROJECT_STATUS-\\d\+\\\.md\$\//; // the literal /^CHICLA_PROJECT_STATUS-\d+\.md$/ that selects the status files of the real root
  const found = [];
  for (const f of readdirSync(join(root, 'test')).filter((f) => f.endsWith('.test.mjs') && f !== 'status-reads.test.mjs')) {
    const src = readFileSync(join(root, 'test', f), 'utf8');
    if (!pick.test(src)) continue;
    if (/from '\.\/status-text\.mjs'/.test(src)) continue;
    found.push(f);
  }
  const bad = found.filter((f) => !(f in OWN_READ));
  assert.deepEqual(bad, [], `these tests read the newest status file themselves: use test/status-text.mjs (statusWithArchives) for a name, or add them to OWN_READ with a reason: ${bad.join(', ')}`);
  for (const f of Object.keys(OWN_READ)) assert.ok(found.includes(f), `${f} is in OWN_READ but no longer reads the status file by itself: remove the entry`);
});

test('the five tests that look for a card or audit name use `statusWithArchives`: audit4-docs, audit5-docs, audit6-docs, plan-a1-docs', () => {
  for (const f of ['audit4-docs', 'audit5-docs', 'audit6-docs', 'audit7-docs', 'plan-a1-docs']) {
    const src = readFileSync(join(root, 'test', `${f}.test.mjs`), 'utf8');
    assert.match(src, /import \{[^}]*statusWithArchives[^}]*\} from '\.\/status-text\.mjs'/, `${f}: imports the helper`);
    assert.match(src, /statusWithArchives\(\)/, `${f}: calls it`);
  }
});
