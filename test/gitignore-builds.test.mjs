// Round 318 (C29.2, AUDIT-11 F-2; D-317b: Rodrigo said to fix the findings before the push): the build folders and the files the runbooks write inside the repository are in .gitignore, so a `git add -A` after a release
// cannot track them again (that is how `dist2/`, `dist3/`, `distci/`, `distkit/`, `dist-0.2.0/`, four `notes*.md` and their `.sha256` got into `main`, and why the guard EMANIFEST_TRACKED then failed).
// Written before the change; red until it. It reads files only (no git needed): a small matcher for the kinds of line this .gitignore uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const patterns = () => read('.gitignore').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

// One .gitignore line -> does it ignore `path` (a repository-relative path with /)? Supports: `name/` (a folder, anchored when it starts with /, else at any depth), `*` inside a name, `/name` anchored, `name` at any depth.
const re = (g) => g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
const matches = (pat, path) => {
  const dirOnly = pat.endsWith('/');
  const body = pat.replace(/^\//, '').replace(/\/$/, '');
  const anchored = pat.startsWith('/') || body.includes('/');
  const n = body.split('/').length, rx = new RegExp(`^${re(body)}$`), segs = path.split('/');
  const starts = anchored ? [0] : segs.map((_, i) => i);
  return starts.some((i) => i + n <= segs.length && rx.test(segs.slice(i, i + n).join('/')) && (!dirOnly || i + n < segs.length));
};
const ignored = (path) => patterns().some((p) => matches(p, path));

test('the matcher itself (control): folder, anchored, glob and any-depth lines', () => {
  assert.ok(matches('dist/', 'dist/a.tgz') && matches('dist/', 'x/dist/a') && !matches('dist/', 'dist'));
  assert.ok(matches('/notes.md', 'notes.md') && !matches('/notes.md', 'docs/notes.md'));
  assert.ok(matches('dist-*/', 'dist-0.2.0/a/b') && !matches('dist-*/', 'distribution/a'));
  assert.ok(matches('*.tgz.sha256', 'dist2/chicla.tgz.sha256') && !matches('*.tgz.sha256', 'chicla.tgz'));
  assert.ok(matches('__MACOSX/', 'dist-0.2.0/__MACOSX/._a'));
});

test('C29.2: everything a release leaves in the repository is ignored (AUDIT-11 F-2)', () => {
  for (const p of ['dist/a.tgz', 'dist2/chicla-0.2.1.tgz.sha256', 'dist3/a', 'distci/a', 'distkit/a', 'dist-0.2.0/chicla-0.2.0.tgz', 'dist-0.2.0/__MACOSX/._a', 'stage/x', 'stage2/chicla/package.json', 'ci/package/package.json', 'ci/chicla-tarball/a',
    'notes.md', 'notes-chicla.md', 'notes-kit.md', 'notes-zip.md', 'x/chicla-0.3.0.tgz.sha256', '__MACOSX/._a', '.DS_Store', '.idea/workspace.xml', 'node_modules/a/b']) assert.ok(ignored(p), `${p} is not ignored`);
});

test('C29.2: nothing of the project is ignored: no path of FILES.manifest matches the .gitignore', () => {
  const paths = read('FILES.manifest').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[0]);
  assert.ok(paths.length > 400);
  const hidden = paths.filter(ignored);
  assert.deepEqual(hidden, [], `the .gitignore hides files of the project: ${hidden.slice(0, 5).join(', ')}`);
});

test('C29.2: a new folder named in a runbook (`--out <dir>`) is ignored too, so the next release cannot reopen F-2', () => {
  const docs = ['docs/release.md', 'README.md', 'docs/README.md'].map(read).join('\n');
  const outs = new Set([...docs.matchAll(/--out(?:dir)?[ =]+['"]?((?:dist|stage|ci)[A-Za-z0-9._-]*)/g)].map((m) => m[1]));
  assert.ok(outs.size >= 3, 'the runbooks name at least dist, dist2 and stage2');
  for (const o of outs) assert.ok(ignored(`${o}/x`), `the runbooks write ${o}/ and the .gitignore does not ignore it`);
});
