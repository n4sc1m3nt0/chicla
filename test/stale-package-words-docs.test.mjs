// Round 289 (C24.4, AUDIT-8 F-5, M24): say once that `chicla-zip` and `chicla-kit` are gone as packages (private source folders since C23.3, deprecated on npm, D148).
// Written before the edits; red until they are made. These are DOCS tests (they read prose, as the other *-docs tests do); the one message of code, EZIP_WRITE,
// is checked in the source text because a test of the code asserts its `code`, never its wording (CLAUDE.md rule 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const row = (t, start) => t.split('\n').find((l) => l.startsWith(start)) ?? '';

test('SECURITY.md: says one package (chicla) with two surfaces, no «two packages», no deprecated name in the supported table', () => {
  const s = read('SECURITY.md');
  assert.doesNotMatch(s, /two packages/i);
  assert.match(s.split('\n').slice(0, 5).join('\n'), /`chicla`/);
  const table = s.split('## Supported versions')[1].split('\n## ')[0];
  assert.match(table, /\| `chicla` \| the latest `0\.2\.x` \|/);
  assert.doesNotMatch(table, /\| `chicla-zip` \|/);
  assert.doesNotMatch(table, /\| `chicla-kit` \|/);
  assert.match(table, /deprecated/i, 'the table says what happened to the two old names');
});

test('SECURITY.md: «Checking a release» is about the `chicla` tarball, not `chicla-zip`', () => {
  const s = read('SECURITY.md');
  const part = s.split('## Checking a release')[1].split('\n## ')[0];
  assert.match(part, /`chicla`/);
  assert.doesNotMatch(part, /release of `chicla-zip`/);
});

test('README.md: no «0.1.1» tree, no `pack` job of chicla-zip, the sample imports from `chicla/zip`, and the NEXT: limit of `recovery` is written down', () => {
  const r = read('README.md');
  assert.doesNotMatch(r, /tree is at `0\.1\.1`/);
  assert.doesNotMatch(r, /a `pack` job builds the `chicla-zip` tarball/);
  assert.doesNotMatch(r, /from "chicla-zip"/);
  assert.match(r, /from "chicla\/zip"/);
  assert.match(r, /`pack-chicla`/, 'the CI sentence names the job that exists');
  assert.match(r, /`tarball`/, 'and the one of C24.3');
  assert.match(r, /NEXT:/, 'the hint of `recovery` that names a script a package user does not have is a known limit');
  const status = r.split('\n').find((l) => l.startsWith('> **Status')) ?? '';
  assert.match(status, /`chicla`/);
  assert.match(status, /0\.2\.0/);
});

test('docs/README.md: release.md is the runbook of `chicla` (the single package), not of chicla-zip 0.1.0', () => {
  const l = row(read('docs/README.md'), '| `release.md` |');
  assert.match(l, /`chicla`/);
  assert.doesNotMatch(l, /runbook of gate G-C6 for `chicla-zip` 0\.1\.0/);
});

for (const [dir, name] of [['chicla-kit', 'chicla-kit'], ['chicla-zip', 'chicla-zip']]) {
  test(`packages/${dir}/README.md: the «Moved into chicla» notice comes first and no line tells the reader to install \`${name}\``, () => {
    const r = read(`packages/${dir}/README.md`);
    const moved = r.indexOf('**Moved into `chicla`**');
    assert.ok(moved > 0, 'no Moved notice');
    assert.doesNotMatch(r, new RegExp(`npm install ${name}\\b`), `a line still says npm install ${name}`);
    assert.doesNotMatch(r, /Status: `0\.1\.1`, published on npm/);
    assert.doesNotMatch(r.slice(0, moved), /published on npm/, 'nothing above the notice says it is published');
  });
}

test('cli.mjs: the header no longer says the kit «cannot be published alone» or «nothing is published before 0.1», and `chicla --help` does not call itself «the kit CLI»', () => {
  const c = read('packages/chicla-kit/src/cli.mjs');
  const head = c.split('\nimport ')[0];
  assert.doesNotMatch(head, /cannot be published alone/);
  assert.doesNotMatch(head, /Nothing is published before 0\.1/);
  const help = c.split('const HELP = `')[1].split('\n')[0];
  assert.doesNotMatch(help, /kit CLI/);
  assert.match(help, /^chicla: /);
});

test('make-delivery.mjs: the EZIP_WRITE message does not name the retired package (the code stays), and the smoke test that read it follows', () => {
  const m = read('packages/chicla-kit/src/make-delivery.mjs');
  const line = m.split('\n').find((l) => l.includes('stop("EZIP_WRITE"')) ?? '';
  assert.ok(line, 'EZIP_WRITE is still raised');
  assert.doesNotMatch(line, /with chicla-zip/);
  assert.doesNotMatch(read('scripts/smoke-test-delivery-guards.mjs'), /could not write the zip with chicla-zip/);
});

test('a grep of the live docs for «two packages» finds nothing (the history, the audits and the archives keep their words)', () => {
  const skip = /^(CHANGELOG|CHICLA_PROJECT_STATUS|ROADMAP)|(^|\/)(audits|node_modules)(\/|$)|status-archive|CHANGELOG-archive/;
  const hits = [];
  const walk = (d) => { for (const n of readdirSync(join(root, d))) { const p = d ? `${d}/${n}` : n; if (skip.test(p) || n.startsWith('.')) continue; if (statSync(join(root, p)).isDirectory()) walk(p); else if (n.endsWith('.md') && /two packages/i.test(read(p))) hits.push(p); } };
  walk('');
  // release.md and the chicla README speak of the two packages as HISTORY (versions 0.1.x, the deprecation): they name them as the old ones.
  assert.deepEqual(hits.filter((p) => !['docs/release.md', 'packages/chicla/README.md'].includes(p)), []);
});

test('ROADMAP: C24.4 is done (round 289) and says what was not run', () => {
  const c = row(read('ROADMAP.md'), '| C24.4 |');
  assert.match(c, /feito \(round 289/);
  assert.match(c, /not run|NOT run/i);
  assert.doesNotMatch(c, /· proposed/);
});
