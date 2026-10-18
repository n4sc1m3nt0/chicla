// Round 163: release documents and the Cedar removal. Written before the files; each assertion is red until they exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

test('SECURITY.md: reporting channel, scope, supported versions; no invented e-mail address', () => {
  assert.ok(existsSync(join(root, 'SECURITY.md')), 'SECURITY.md is missing');
  const s = read('SECURITY.md');
  assert.match(s, /private vulnerability reporting/i);
  assert.match(s, /Supported versions/);
  assert.match(s, /hostile input/i);
  assert.match(s, /integrity, not authenticity/i);
  assert.doesNotMatch(s, /[\w.+-]+@[\w-]+\.[\w.]+/, 'no e-mail address may be invented');
});

test('CONTRIBUTING.md: the round rules a contributor must know', () => {
  assert.ok(existsSync(join(root, 'CONTRIBUTING.md')), 'CONTRIBUTING.md is missing');
  const s = read('CONTRIBUTING.md');
  for (const word of ['zero dependencies', 'node --test', 'one small', 'Apache-2.0']) assert.ok(s.toLowerCase().includes(word.toLowerCase()), `missing: ${word}`);
});

test('chicla-kit README documents every subcommand of the CLI and the exit codes', () => {
  assert.ok(existsSync(join(root, 'packages/chicla-kit/README.md')), 'the kit README is missing');
  const readme = read('packages/chicla-kit/README.md');
  const cli = read('packages/chicla-kit/src/cli.mjs');
  const cores = cli.match(/const CORES = \{([^}]*)\}/)[1];
  const names = [...cores.matchAll(/(?:"([a-z-]+)"|\b([a-z]+)):/g)].map((m) => m[1] || m[2]);
  assert.ok(names.length >= 6, 'the CORES table was not parsed');
  for (const n of names) assert.ok(readme.includes('chicla ' + n), `the README does not document «chicla ${n}»`);
  assert.match(readme, /Exit codes/);
  assert.match(readme, /not released|pre-release/i, 'the README must not claim a release that does not exist');
});

test('docs/release.md: the G-C6 runbook has the steps that only Rodrigo can do, and never says the AI publishes', () => {
  assert.ok(existsSync(join(root, 'docs/release.md')), 'docs/release.md is missing');
  const s = read('docs/release.md');
  for (const part of ['sha256sum -c', 'npm login', 'npm publish', 'npm view chicla-zip', 'gh release create', 'git tag', 'two-factor']) assert.ok(s.includes(part), `missing step: ${part}`);
  assert.match(s, /only Rodrigo publishes/i);
});

test('ROADMAP: Cedar is out of the plan (Rodrigo, 2026-10-16): no §8 about it, C13.1 cancelled, the gates updated', () => {
  const r = read('ROADMAP.md');
  assert.doesNotMatch(r, /## 8\. Relationship with Cedar/);
  assert.match(r, /\| C13\.1 \| ~~/, 'C13.1 must be struck through (cancelled)');
  assert.doesNotMatch(r, /projeto-modelo que não é o Cedar/);
  assert.match(r, /G-C7[^\n]*CLOSED by Rodrigo \(2026-10-16/);
  assert.match(r, /G-C11[^\n]*CLOSED by Rodrigo \(2026-10-16/);
});

// Round 184 (C11.3 closing, D130): the runbook for `chicla-kit`. It is the second half of docs/release.md.
const kitSection = () => { const s = read('docs/release.md'); const i = s.indexOf('## `chicla-kit`'); assert.ok(i > 0, 'no «## `chicla-kit`» section'); return s.slice(i); };

test('docs/release.md: the chicla-kit runbook has its own tag, artifact, tarball, checks and the npm steps, and chicla-zip goes out first', () => {
  const k = kitSection();
  for (const part of ['chicla-kit-v0.1.0', 'chicla-kit-tarball', 'pack-kit', 'chicla-kit-0.1.0.tgz', 'sha256sum -c', 'tar -tzf', 'npm whoami', 'npm publish dist/chicla-kit-0.1.0.tgz', 'gh release create chicla-kit-v0.1.0', 'npm view chicla-kit version', 'pack-release.mjs packages/chicla-kit', 'two-factor', 'bump-round --verify', 'chicla update', '`0.0.0`']) assert.ok(k.includes(part), `missing in the kit section: ${part}`);
  assert.match(k, /\*\*`chicla-zip` goes out first\*\*/);
  assert.ok(k.indexOf('chicla-zip` 0.1.0 is published') > 0 && k.indexOf('chicla-zip` 0.1.0 is published') < k.indexOf('### Steps'), 'the zip comes before the kit steps');
  assert.match(k, /AI never runs `npm publish`/);
  assert.doesNotMatch(k, /not releasable yet/i, 'the old «not releasable» sentence is gone');
  assert.doesNotMatch(read('docs/release.md').slice(0, read('docs/release.md').indexOf('## `chicla-kit`')), /not releasable yet/i);
});

test('docs/release.md: every `chicla` command and script the kit runbook names exists, and the warning about the `chicla` placeholder is there', async () => {
  const k = kitSection();
  const { main } = await import(new URL('../packages/chicla-kit/src/cli.mjs', import.meta.url).href);
  let help = ''; await main(['--help'], { stdout: { write: (x) => { help += x; } }, stderr: { write() {} } });
  for (const c of new Set([...k.matchAll(/npx --no-install chicla (\S+)/g)].map((m) => m[1]))) assert.ok(c === '--help' || help.includes(`  ${c} `), `the runbook runs «chicla ${c}», which the help does not list`);
  assert.ok(existsSync(join(root, 'scripts/pack-release.mjs')));
  assert.match(k, /unrelated `chicla` placeholder/);
});
