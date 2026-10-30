// Round 281 (C23.3, D148, M23): the two old packages are retired in the tree, the CI and the docs; the runbook for `chicla` 0.2.0 replaces the thin one.
// Written before the change; each assertion is red until it exists. Nothing here publishes anything (CLAUDE.md product rule 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const row = (text, prefix) => text.split('\n').find((l) => l.startsWith(prefix)) ?? '';

test('D148 D-D: chicla-zip and chicla-kit are private (npm refuses to publish them); chicla is not; names and versions are unchanged', () => {
  for (const [dir, name] of [['chicla-zip', 'chicla-zip'], ['chicla-kit', 'chicla-kit']]) {
    const p = json(`packages/${dir}/package.json`);
    assert.equal(p.name, name);
    assert.equal(p.private, true, `${dir} must be private`);
    assert.equal(p.version, '0.1.1', `${dir} version stays at the last published one`);
  }
  assert.notEqual(json('packages/chicla/package.json').private, true, 'the single package is the one that gets published');
  assert.equal(json('packages/chicla/package.json').version, '0.2.1');
});

test('pack-release refuses both private folders with EPRIVATE, so no tarball of an old package can be made by mistake', () => {
  const out = mkdtempSync(join(tmpdir(), 'chicla-retire-'));
  try {
    for (const dir of ['packages/chicla-zip', 'packages/chicla-kit']) {
      const r = spawnSync(process.execPath, [join(root, 'scripts/pack-release.mjs'), join(root, dir), '--out', out], { encoding: 'utf8' });
      assert.equal(r.status, 1, `${dir}: exit code`);
      assert.match(r.stdout + r.stderr, /EPRIVATE/, `${dir}: error code`);
    }
    assert.deepEqual(readdirSync(out), [], 'nothing was written');
  } finally { rmSync(out, { recursive: true, force: true }); }
});

const ci = read('.github/workflows/ci.yml');
const jobs = ci.split(/^jobs:\n/m)[1].split(/^  (?=[a-z][\w-]*:)/m).filter(Boolean);
const job = (n) => jobs.find((j) => j.startsWith(`${n}:`)) ?? '';

test('CI: the `pack` and `pack-kit` jobs are gone (they would fail on a private package); `pack-chicla` builds then packs the single package and never publishes', () => {
  assert.equal(job('pack'), '', 'the pack job is still in ci.yml');
  assert.equal(job('pack-kit'), '', 'the pack-kit job is still in ci.yml');
  assert.doesNotMatch(ci, /chicla-zip-tarball|chicla-kit-tarball|pack-release\.mjs packages\//);
  const p = job('pack-chicla');
  assert.ok(p, 'pack-chicla is missing');
  assert.match(p, /node scripts\/build-chicla\.mjs --out stage/);
  assert.match(p, /node scripts\/pack-release\.mjs stage\/chicla --out dist/);
  assert.match(p, /name:\s*chicla-tarball/);
  assert.doesNotMatch(p, /secrets\.|npm publish|continue-on-error/);
});

const rel = () => read('docs/release.md');
const sec = () => { const s = rel(); const i = s.indexOf('## Releasing chicla 0.2.0'); assert.ok(i > 0, 'no «## Releasing chicla 0.2.0» section'); const j = s.indexOf('\n## ', i + 5); return s.slice(i, j < 0 ? undefined : j); };

test('docs/release.md: «Releasing chicla 0.2.0» comes first and replaces the thin 0.1.1 runbook (which must not be there any more)', () => {
  const s = rel();
  const i = s.indexOf('## Releasing chicla 0.2.0');
  assert.ok(i > 0);
  for (const old of ['## Releasing 0.1.1 (round 276', '## Published: 0.1.1', '## Where the release stands (round 230)']) assert.ok(i < s.indexOf(old), `the new section must come before «${old}»`);
  assert.doesNotMatch(s, /## Releasing chicla 0\.1\.1/, 'the thin runbook is replaced, not kept');
  assert.doesNotMatch(s, /chicla-v0\.1\.1/, 'no tag for the thin package is left anywhere');
});

test('docs/release.md: the 0.2.0 runbook has the whole path, and only Rodrigo publishes', () => {
  const k = sec();
  for (const part of ['chicla-v0.2.0', 'chicla-tarball', 'chicla-0.2.0.tgz', 'chicla-0.2.0.tgz.sha256', 'sha256sum -c', 'tar -tzf', 'npm whoami', 'npm publish ./dist/chicla-0.2.0.tgz --access public',
    'gh release create chicla-v0.2.0', 'npm view chicla version', 'build-chicla.mjs', 'pack-release.mjs stage2/chicla', 'two-factor', 'npx chicla --help', 'G-C16', 'D148']) assert.ok(k.includes(part), `missing: ${part}`);
  assert.match(k, /AI never runs `npm publish`/);
  assert.match(k, /\.\/dist\//, 'write ./dist/, never dist/ (EALLOWGIT)');
  assert.doesNotMatch(k, /npm publish dist\//);
  assert.match(k, /empty folder/);
  assert.match(k, /package\/src\/zipkit\.mjs/, 'the listing check names the zip module beside the loader');
  assert.doesNotMatch(k, /npm install chicla-kit|chicla-kit \^/, 'it no longer installs or depends on the old packages');
});

test('docs/release.md: the deprecation steps come AFTER the publish and its check, with the agreed message, on both names, and say what is NOT done (no unpublish)', () => {
  const k = sec();
  const pub = k.indexOf('npm publish ./dist/chicla-0.2.0.tgz'), view = k.indexOf('npm view chicla version');
  const d1 = k.indexOf('npm deprecate chicla-zip'), d2 = k.indexOf('npm deprecate chicla-kit');
  assert.ok(pub > 0 && view > pub, 'the check follows the publish');
  assert.ok(d1 > view && d2 > view, 'deprecate only after chicla 0.2.0 is verified on npm');
  assert.match(k, /npm deprecate chicla-zip "moved into chicla: npm install chicla"/);
  assert.match(k, /npm deprecate chicla-kit "moved into chicla: npm install chicla"/);
  assert.match(k, /npm deprecate chicla-zip@"?[^\n]*"? /, 'the all-versions form is shown (name@"*" or the range)');
  assert.match(k, /not (run )?`npm unpublish`|never `npm unpublish`|no `npm unpublish`/i);
  assert.match(k, /0\.1\.x[^\n]*stay/i, 'their 0.1.x stay on npm');
});

test('docs/release.md: every `chicla` command the 0.2.0 runbook runs exists in the help of the kit', async () => {
  const { main } = await import(new URL('../packages/chicla-kit/src/cli.mjs', import.meta.url).href);
  let help = ''; await main(['--help'], { stdout: { write: (x) => { help += x; } }, stderr: { write() {} } });
  const cmds = [...new Set([...sec().matchAll(/npx (?:--no-install )?chicla ([\w-]+)/g)].map((m) => m[1]))];
  assert.ok(cmds.length >= 1);
  for (const c of cmds) assert.ok(c === '--help' || help.includes(`  ${c} `), `the runbook runs «chicla ${c}», which the help does not list`);
  assert.ok(existsSync(join(root, 'scripts/build-chicla.mjs')) && existsSync(join(root, 'scripts/pack-release.mjs')));
});

test('the history stays: the 0.1.1 sections say they are history (the packages are retired), nothing is deleted', () => {
  const s = rel();
  const i = s.indexOf('## Releasing 0.1.1 (round 276');
  assert.match(s.slice(i, i + 900), /history|retired|superseded by D148/i);
  assert.ok(s.includes('## Published: 0.1.1 (round 277, D146)'));
});

test('READMEs and SECURITY.md: the two old packages say they moved into `chicla`; the last release under the old name is named (C24.4 reworded the 0.1.1 sentences)', () => {
  for (const f of ['packages/chicla-zip/README.md', 'packages/chicla-kit/README.md']) {
    const r = read(f);
    assert.match(r, /Moved into `chicla`/, `${f} must say it moved`);
    assert.match(r, /npm install chicla\b(?!-)/, `${f} must give the new command`);
    assert.match(r, /`0\.1\.1` is the last release under this name/, `${f} names the last release under the old name`);
    assert.match(r, /private/i, `${f} says the folder is private source`);
  }
  const sec_ = read('SECURITY.md');
  assert.match(sec_, /\| `chicla` \| the latest `0\.2\.x`/);
  assert.doesNotMatch(sec_, /\| `chicla-zip` \|/, 'round 289 (C24.4): the old rows are gone from the supported table; one sentence says they are deprecated');
  assert.match(sec_, /`chicla-zip` and `chicla-kit` \(`0\.1\.x`\) are the old names/);
  assert.match(read('README.md'), /private/i);
});

test('ROADMAP: C23.3 done in round 281 (C23.4 and G-C16 are closed in round 282: see published-chicla-docs.test.mjs)', () => {
  const r = read('ROADMAP.md');
  assert.match(row(r, '| C23.3 |'), /feito \(round 281/);
  assert.match(row(r, '| G-C16 '), /0\.2\.0/);
});
