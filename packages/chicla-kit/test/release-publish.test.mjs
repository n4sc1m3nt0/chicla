// C32.3 (D167, D173, M32) — `chicla release publish --from <folder> [--confirm]`: the irreversible step. ONLY Rodrigo runs it (D167 D-3, rule 4 of CLAUDE.md): these tests drive it with a fake `run`
// (`git`, `gh` and `npm` all go through ONE function) and a fake terminal, so no test here can tag, release or publish anything.
// Without `--confirm` it is a DRY RUN: it checks and prints the plan (the exact commands), and runs nothing that writes. With `--confirm` it needs an interactive terminal (ERELEASE_NOTTY, no call at all),
// the version typed back (ERELEASE_NOCONFIRM, no call at all), and then, in order: the checks (files, sha256, `release check`, notes of this commit), `npm whoami`, `git tag -a`, `git push origin <tag>`,
// `gh release create`, `npm publish <tarball> --access public` (interactive: npm asks for the two-factor code itself), `npm view <name> version`. It stops at the first failure and says which write steps are done.
// `releasePublish` is sync and takes `typed` and `isTTY` from the caller (the CLI asks the question). Written before the code: red until it exists. Tests assert ids, codes and calls, never message text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(join(KIT, f)).href);
const { releasePublish, renderReleasePublish, runTool } = await imp('src/release.mjs');
const { main } = await imp('src/cli.mjs');

const SHA = 'a'.repeat(40), TGZ = Buffer.from('the bytes of a tarball'), SUM = createHash('sha256').update(TGZ).digest('hex'), NAME = 'chicla-0.4.0.tgz', NOTES = 'notes-chicla-0.4.0.md', TAG = 'chicla-v0.4.0';
const T = () => mkdtempSync(join(tmpdir(), 'chicla-publish-'));
const done = (d) => rmSync(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 });
/** a project root with packages/chicla/package.json and a prepared folder `dist-0.4.0` (what `release prepare` leaves) */
const project = (o = {}) => {
  const d = T(); mkdirSync(join(d, 'packages', 'chicla'), { recursive: true }); writeFileSync(join(d, 'packages', 'chicla', 'package.json'), JSON.stringify(o.pkg ?? { name: 'chicla', version: '0.4.0' }));
  const from = join(d, 'dist-0.4.0'); mkdirSync(from);
  for (const [f, c] of o.files ?? [[NAME, TGZ], [`${NAME}.sha256`, `${SUM}  ${NAME}\n`], [NOTES, `## chicla 0.4.0\n\nTag \`${TAG}\` · commit \`${SHA}\` · CI run 42 (success)\n`]]) writeFileSync(join(from, f), c);
  return { d, from };
};
const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const bad = (stderr = '', status = 1) => ({ status, stdout: '', stderr });
const GREEN = JSON.stringify([{ status: 'completed', conclusion: 'success' }]);
const fake = (over = {}) => {
  const calls = [];
  const f = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], cwd: opts?.cwd, interactive: opts?.interactive === true });
    const line = `${cmd} ${args.join(' ')}`;
    if (line in over) return typeof over[line] === 'function' ? over[line](args) : over[line];
    if (line === 'npm view chicla@0.4.0 version') return bad('npm ERR! code E404');
    if (line === 'git status --porcelain') return ok('');
    if (line === `git tag --list ${TAG}`) return ok('');
    if (line === 'git rev-parse HEAD') return ok(`${SHA}\n`);
    if (line.startsWith('gh run list --commit')) return ok(GREEN);
    if (line === 'npm whoami') return ok('rodrigo\n');
    if (line === 'npm view chicla version') return ok('0.4.0\n');
    if (/^(git tag -a|git push origin|gh release create|npm publish) /.test(line)) return ok();
    return bad('unexpected call');
  };
  f.calls = calls; f.lines = () => calls.map((c) => `${c.cmd} ${c.args.join(' ')}`);
  return f;
};
const READS = ['npm view chicla@0.4.0 version', 'git status --porcelain', `git tag --list ${TAG}`, 'git rev-parse HEAD', `gh run list --commit ${SHA} --json databaseId,name,status,conclusion --limit 50`];
const WRITES = (from) => [
  `git tag -a ${TAG} -m chicla 0.4.0 ${SHA}`, `git push origin ${TAG}`,
  `gh release create ${TAG} ${join(from, NAME)} ${join(from, `${NAME}.sha256`)} --title chicla 0.4.0 --notes-file ${join(from, NOTES)}`, `npm publish ${join(from, NAME)} --access public`,
];
const ids = (r) => r.checks.map((c) => c.id);
const check = (r, id) => r.checks.find((c) => c.id === id);
const go = (p, run, over = {}) => releasePublish({ root: p.d, run, from: p.from, ...over });
const LIVE = { confirm: true, isTTY: true, typed: '0.4.0' };
const snap = (d) => Object.fromEntries(readdirSync(d, { recursive: true }).map((f) => { try { return [f, readFileSync(join(d, f), 'utf8')]; } catch { return [f, null]; } }));

test('dry run (no --confirm): the four checks pass, the plan is the exact commands, ONLY reads ran, nothing was written', () => {
  const p = project(); try {
    const before = snap(p.d), run = fake(), r = go(p, run);
    assert.equal(r.ok, true); assert.equal(r.dryRun, true); assert.deepEqual(r.checks.map((c) => [c.id, c.ok]), [['files', true], ['sha256', true], ['release-check', true], ['notes-commit', true]]);
    assert.equal(r.name, 'chicla'); assert.equal(r.version, '0.4.0'); assert.equal(r.tag, TAG); assert.equal(r.commit, SHA); assert.equal(r.file, NAME); assert.equal(r.from, p.from);
    assert.deepEqual(r.plan, WRITES(p.from).map((l, i) => (i === 0 ? l.replace('-m chicla 0.4.0', '-m "chicla 0.4.0"') : l.replace('--title chicla 0.4.0', '--title "chicla 0.4.0"'))));
    assert.deepEqual(run.lines(), READS); assert.deepEqual(r.done, []); assert.equal(r.published, false);
    assert.deepEqual(snap(p.d), before);
  } finally { done(p.d); }
});

test('--confirm without an interactive terminal is ERELEASE_NOTTY: not one call, nothing written', () => {
  const p = project(); try {
    for (const isTTY of [false, undefined, 'yes', 1]) { const run = fake(), r = go(p, run, { confirm: true, isTTY, typed: '0.4.0' }); assert.equal(r.ok, false); assert.equal(r.code, 'ERELEASE_NOTTY', String(isTTY)); assert.equal(run.calls.length, 0); }
  } finally { done(p.d); }
});

test('the version must be typed back exactly: anything else is ERELEASE_NOCONFIRM and not one call is made', () => {
  const p = project(); try {
    for (const typed of ['', '0.4', 'v0.4.0', '0.4.0 ', ' 0.4.0', '0.4.0\n', '0.4.1', undefined, 4, 'yes', 'CHICLA']) {
      const run = fake(), r = go(p, run, { confirm: true, isTTY: true, typed });
      assert.equal(r.ok, false, String(typed)); assert.equal(r.code, 'ERELEASE_NOCONFIRM', String(typed)); assert.equal(run.calls.length, 0, String(typed));
    }
  } finally { done(p.d); }
});

test('confirmed: the checks, then npm whoami, tag, push, release, publish (interactive) and npm view, in this order, each in the project root', () => {
  const p = project(); try {
    const run = fake(), r = go(p, run, LIVE);
    assert.equal(r.ok, true); assert.equal(r.dryRun, false); assert.deepEqual(ids(r), ['files', 'sha256', 'release-check', 'notes-commit', 'npm-whoami', 'git-tag', 'git-push', 'gh-release', 'npm-publish', 'npm-view']);
    assert.ok(r.checks.every((c) => c.ok && c.level === 'pass')); assert.deepEqual(r.done, ['git-tag', 'git-push', 'gh-release', 'npm-publish']); assert.equal(r.published, true);
    assert.deepEqual(run.lines(), [...READS, 'npm whoami', ...WRITES(p.from), 'npm view chicla version']);
    for (const c of run.calls) assert.equal(c.cwd, p.d);
    assert.deepEqual(run.calls.filter((c) => c.interactive).map((c) => c.cmd + ' ' + c.args[0]), ['npm publish'], 'only npm publish is interactive (it asks for the two-factor code)');
    for (const l of run.lines()) assert.doesNotMatch(l, /--force|--tag |--otp|deprecate|unpublish|login|-f /);
    const tag = run.calls.find((c) => c.args[0] === 'tag' && c.args[1] === '-a'); assert.deepEqual(tag.args, ['tag', '-a', TAG, '-m', 'chicla 0.4.0', SHA]);
    const pub = run.calls.find((c) => c.args[0] === 'publish'); assert.equal(pub.args[1], join(p.from, NAME)); assert.ok(pub.args[1].startsWith('/') || /^[A-Za-z]:/.test(pub.args[1]), 'an absolute path: npm would read dist/x.tgz as a GitHub shorthand');
  } finally { done(p.d); }
});

test('each of the four release checks that fails stops everything: no whoami, no tag, no push, no release, no publish', () => {
  const cases = {
    'version already on npm': { 'npm view chicla@0.4.0 version': ok('0.4.0\n') }, 'dirty tree': { 'git status --porcelain': ok(' M a.txt\n') }, 'tag exists': { [`git tag --list ${TAG}`]: ok(`${TAG}\n`) },
    'CI red': { [READS[4]]: ok(JSON.stringify([{ status: 'completed', conclusion: 'failure' }])) }, 'CI running': { [READS[4]]: ok(JSON.stringify([{ status: 'in_progress', conclusion: null }])) },
  };
  for (const [name, over] of Object.entries(cases)) {
    const p = project(); try {
      for (const opt of [{}, LIVE]) {
        const run = fake(over), r = go(p, run, opt);
        assert.equal(r.ok, false, name); assert.equal(r.code, 'ERELEASE_FAILED', name); assert.deepEqual(ids(r), ['files', 'sha256', 'release-check'], name); assert.equal(check(r, 'release-check').ok, false, name);
        assert.deepEqual(run.lines(), READS, name); assert.deepEqual(r.done, [], name);
      }
    } finally { done(p.d); }
  }
});

test('the prepared folder must hold exactly <name>-<version>.tgz, its .sha256 and the notes: otherwise ERELEASE_FROM and no call', () => {
  const cases = {
    'no notes': [[NAME, TGZ], [`${NAME}.sha256`, `${SUM}  ${NAME}\n`]], 'no sha256 file': [[NAME, TGZ], [NOTES, 'n']], 'no tarball': [[`${NAME}.sha256`, `${SUM}  ${NAME}\n`], [NOTES, 'n']],
    'another version': [['chicla-0.3.0.tgz', TGZ], ['chicla-0.3.0.tgz.sha256', `${SUM}  chicla-0.3.0.tgz\n`], ['notes-chicla-0.3.0.md', 'n']], 'a fourth file': [[NAME, TGZ], [`${NAME}.sha256`, `${SUM}  ${NAME}\n`], [NOTES, 'n'], ['zzz.txt', 'x']], empty: [],
  };
  for (const [name, files] of Object.entries(cases)) { const p = project({ files }); try { const run = fake(), r = go(p, run, LIVE); assert.equal(r.ok, false, name); assert.equal(r.code, 'ERELEASE_FROM', name); assert.equal(run.calls.length, 0, name); } finally { done(p.d); } }
  const p = project(); try {
    for (const from of [undefined, '', join(p.d, 'nope'), join(p.d, 'packages', 'chicla', 'package.json'), 42]) { const run = fake(), r = releasePublish({ root: p.d, run, from }); assert.equal(r.code, 'ERELEASE_FROM', String(from)); assert.equal(run.calls.length, 0); }
  } finally { done(p.d); }
});

test('a tarball whose sha256 is not the one in the .sha256 file (or a .sha256 that names another file) fails `sha256` and STOPS: no git, gh or npm call', () => {
  const cases = { 'other digest': `${'b'.repeat(64)}  ${NAME}\n`, 'other name': `${SUM}  chicla-0.3.0.tgz\n`, garbage: 'not a sha256 line\n', short: `${SUM.slice(0, 63)}  ${NAME}\n` };
  for (const [name, text] of Object.entries(cases)) {
    const p = project({ files: [[NAME, TGZ], [`${NAME}.sha256`, text], [NOTES, `commit \`${SHA}\``]] }); try {
      const run = fake(), r = go(p, run, LIVE); assert.equal(r.ok, false, name); assert.equal(r.code, 'ERELEASE_FAILED', name); assert.deepEqual(ids(r), ['files', 'sha256'], name); assert.equal(run.calls.length, 0, name);
    } finally { done(p.d); }
  }
});

test('notes of ANOTHER commit than HEAD fail `notes-commit`: the folder was prepared from a different commit; nothing is written', () => {
  const p = project({ files: [[NAME, TGZ], [`${NAME}.sha256`, `${SUM}  ${NAME}\n`], [NOTES, `Tag \`${TAG}\` · commit \`${'b'.repeat(40)}\` · CI run 42 (success)\n`]] }); try {
    const run = fake(), r = go(p, run, LIVE);
    assert.equal(r.ok, false); assert.equal(r.code, 'ERELEASE_FAILED'); assert.deepEqual(ids(r), ['files', 'sha256', 'release-check', 'notes-commit']); assert.equal(check(r, 'notes-commit').ok, false);
    assert.deepEqual(run.lines(), READS);
    const q = project({ files: [[NAME, TGZ], [`${NAME}.sha256`, `${SUM}  ${NAME}\n`], [NOTES, 'no commit at all\n']] }); try { assert.equal(check(go(q, fake(), LIVE), 'notes-commit').ok, false); } finally { done(q.d); }
  } finally { done(p.d); }
});

test('npm whoami that fails (not logged in) stops BEFORE the tag: nothing irreversible happened', () => {
  const p = project(); try {
    const run = fake({ 'npm whoami': bad('npm ERR! code E401', 1) }), r = go(p, run, LIVE);
    assert.equal(r.ok, false); assert.equal(r.code, 'ERELEASE_FAILED'); assert.equal(check(r, 'npm-whoami').ok, false); assert.equal(ids(r).at(-1), 'npm-whoami'); assert.deepEqual(r.done, []);
    assert.deepEqual(run.lines(), [...READS, 'npm whoami']);
  } finally { done(p.d); }
});

test('a write step that fails stops the next ones and `done` says which are done; a failed publish never calls npm view', () => {
  const STEPS = ['git-tag', 'git-push', 'gh-release', 'npm-publish'];
  STEPS.forEach((id, k) => {
    const p = project(); try {
      const run = fake({ [WRITES(p.from)[k]]: bad('boom', 1) }), r = go(p, run, LIVE);
      assert.equal(r.ok, false, id); assert.equal(r.code, 'ERELEASE_FAILED', id); assert.equal(ids(r).at(-1), id, id); assert.equal(check(r, id).ok, false, id); assert.deepEqual(r.done, STEPS.slice(0, k), id);
      assert.equal(run.lines().length, READS.length + 1 + k + 1, id); assert.ok(!run.lines().includes('npm view chicla version'), id); assert.equal(r.published, false, id);
    } finally { done(p.d); }
  });
});

test('publish that succeeds but a registry that still says another version: `npm-view` fails, `published` stays true and the result is not ok', () => {
  const p = project(); try {
    for (const view of [ok('0.3.0\n'), bad('E404'), ok('')]) {
      const r = go(p, fake({ 'npm view chicla version': view }), LIVE);
      assert.equal(r.ok, false); assert.equal(r.code, 'ERELEASE_FAILED'); assert.equal(check(r, 'npm-view').ok, false); assert.equal(r.published, true); assert.deepEqual(r.done, ['git-tag', 'git-push', 'gh-release', 'npm-publish']);
    }
  } finally { done(p.d); }
});

test('a project without a usable package.json or a missing root stops before any call; a run that throws never makes the core throw', () => {
  const d = T(); try {
    for (const [root, code] of [[d, 'ERELEASE_NOPACKAGE'], [join(d, 'nope'), 'ENOROOT']]) { const run = fake(), r = releasePublish({ root, run, from: d, ...LIVE }); assert.equal(r.code, code); assert.equal(run.calls.length, 0); }
    for (const pkg of [{ name: '@x/chicla', version: '0.4.0' }, { name: 'chicla', version: '--registry=x' }]) { const p = project({ pkg }); try { const run = fake(); assert.equal(go(p, run).code, 'ERELEASE_NOPACKAGE'); assert.equal(run.calls.length, 0); } finally { done(p.d); } }
    const p = project(); try { const r = go(p, () => { throw new Error('boom'); }, LIVE); assert.equal(r.ok, false); assert.equal(check(r, 'release-check').ok, false); } finally { done(p.d); }
  } finally { done(d); }
});

test('renderer: a dry run says so and lists the plan; a success lists every step; a failure prints its code and the steps that are done', () => {
  const p = project(); try {
    const dry = renderReleasePublish(go(p, fake()));
    assert.match(dry.out, /dry run/i); assert.equal(dry.err, ''); for (const l of go(p, fake()).plan) assert.ok(dry.out.includes(l), l); assert.match(dry.out, /--confirm/);
    const g = renderReleasePublish(go(p, fake(), LIVE)); assert.match(g.out, /^✓ release publish/); assert.equal(g.err, ''); assert.equal(g.out.split('\n').filter((l) => /^  ✓ /.test(l)).length, 10);
    const f = renderReleasePublish(go(p, fake({ [WRITES(p.from)[2]]: bad('x') }), LIVE)); assert.match(f.err, /ERELEASE_FAILED/); assert.match(f.err, /git-tag/); assert.match(f.err, /git-push/); assert.equal(f.out.split('\n').filter((l) => /^  ✗ gh-release/.test(l)).length, 1);
    assert.match(renderReleasePublish({ ok: false, code: 'ERELEASE_NOTTY', message: 'm' }).err, /ERELEASE_NOTTY/);
  } finally { done(p.d); }
});

// ---- the CLI: it asks the question (io.ask), judges the terminal (io.isTTY), and never asks before the dry run passed
const cli = async (args, { run, isTTY, answer, cwd, d } = {}) => {
  let out = '', err = '', asked = [];
  const status = await main(args.concat(['--root', d]), { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd: cwd ?? d, run, isTTY, ask: async (q) => { asked.push(q); return answer; } });
  return { status, out, err, asked };
};

test('cli: without --confirm it is a dry run (exit 0), prints the plan, asks nothing; --from is read from the current folder', async () => {
  const p = project(); const cwd = p.d; try {
    const run = fake(), a = await cli(['release', 'publish', '--from', 'dist-0.4.0'], { run, cwd, d: p.d, isTTY: true, answer: '0.4.0' });
    assert.equal(a.status, 0); assert.match(a.out + a.err, /dry run/i); assert.equal(a.asked.length, 0); assert.deepEqual(run.lines(), READS);
    mkdirSync(join(p.d, 'sub')); const rel = await cli(['release', 'publish', '--from', '../dist-0.4.0'], { run: fake(), cwd: join(p.d, 'sub'), d: p.d }); assert.equal(rel.status, 0, 'a relative --from is read from the current folder, not from the project root');
    const j = await cli(['release', 'publish', '--from', 'dist-0.4.0', '--json'], { run: fake(), cwd, d: p.d }); const o = JSON.parse(j.out); assert.equal(o.command, 'release'); assert.equal(o.dryRun, true); assert.equal(o.from, resolve(cwd, 'dist-0.4.0')); assert.equal(o.plan.length, 4);
  } finally { done(p.d); }
});

test('cli: --confirm without a terminal is exit 1 ERELEASE_NOTTY, no call at all, no question', async () => {
  const p = project(); try {
    const run = fake(), a = await cli(['release', 'publish', '--from', 'dist-0.4.0', '--confirm'], { run, d: p.d, isTTY: false, answer: '0.4.0' });
    assert.equal(a.status, 1); assert.match(a.err, /ERELEASE_NOTTY/); assert.equal(run.calls.length, 0); assert.equal(a.asked.length, 0);
  } finally { done(p.d); }
});

test('cli: --confirm on a terminal asks ONCE, after the dry run passed; a wrong answer is exit 1 ERELEASE_NOCONFIRM and nothing is written; the right one publishes', async () => {
  const p = project(); try {
    const w = fake(), a = await cli(['release', 'publish', '--from', 'dist-0.4.0', '--confirm'], { run: w, d: p.d, isTTY: true, answer: '0.4' });
    assert.equal(a.status, 1); assert.match(a.err, /ERELEASE_NOCONFIRM/); assert.equal(a.asked.length, 1); assert.ok(a.asked[0].includes('0.4.0')); assert.deepEqual(w.lines(), READS);
    assert.ok(a.out.includes(`git push origin ${TAG}`), 'the plan is shown BEFORE the question');
    const run = fake(), b = await cli(['release', 'publish', '--from', 'dist-0.4.0', '--confirm'], { run, d: p.d, isTTY: true, answer: '0.4.0' });
    assert.equal(b.status, 0); assert.equal(b.asked.length, 1); assert.deepEqual(run.lines().slice(READS.length * 2), ['npm whoami', ...WRITES(p.from), 'npm view chicla version']);
  } finally { done(p.d); }
});

test('cli: a dry run that fails (dirty tree) is exit 1 and the question is NOT asked', async () => {
  const p = project(); try {
    const run = fake({ 'git status --porcelain': ok(' M a\n') }), a = await cli(['release', 'publish', '--from', 'dist-0.4.0', '--confirm'], { run, d: p.d, isTTY: true, answer: '0.4.0' });
    assert.equal(a.status, 1); assert.match(a.err, /ERELEASE_FAILED/); assert.equal(a.asked.length, 0); assert.deepEqual(run.lines(), READS);
  } finally { done(p.d); }
});

test('cli: usage errors (exit 2, nothing runs): no --from, --from without a value, --confirm on check or prepare, --from on check, a second subcommand', async () => {
  const p = project(); try {
    for (const args of [['release', 'publish'], ['release', 'publish', '--from'], ['release', 'publish', '--from', '--confirm'], ['release', 'publish', '--confirm'], ['release', 'check', '--confirm'], ['release', 'prepare', '--run', '1', '--confirm'], ['release', 'check', '--from', 'x'], ['release', 'publish', 'check', '--from', 'x'], ['release', 'publish', '--from', 'x', '--nope']]) {
      const run = fake(), a = await cli(args, { run, d: p.d, isTTY: true, answer: '0.4.0' });
      assert.equal(a.status, 2, args.join(' ')); assert.match(a.err, /EUSAGE/); assert.equal(run.calls.length, 0, args.join(' ')); assert.equal(a.asked.length, 0);
    }
  } finally { done(p.d); }
});

test('cli: --help names `release publish`', async () => {
  let out = ''; assert.equal(await main(['--help'], { stdout: { write: (s) => { out += s; } }, stderr: { write() {} } }), 0);
  assert.match(out, /^  release .*publish/m);
});

test('runTool: an interactive child owns the terminal (its output is not captured) and its exit status comes back; a normal child is captured', () => {
  const a = runTool(process.execPath, ['-e', 'process.stdout.write("\\n"); process.exit(3)'], { interactive: true });
  assert.equal(a.status, 3); assert.equal(a.stdout, '');
  const b = runTool(process.execPath, ['-e', 'process.stdout.write("hi"); process.exit(0)']);
  assert.equal(b.status, 0); assert.equal(b.stdout, 'hi');
});
