// C30.5 (D161, D163): `chicla git-plan --against <previous zip | FILES.manifest> [--json] [--root <dir>]` reads the manifest of the delivery (the project root) and the previous one and PRINTS the git commands
// to paste: first the `git rm` of every older status file but the newest (D163), then `git rm` for what left, `git add` for what entered or changed, and one `git commit -m 'round N: title'` (D-N).
// No comment, no `chicla` command, no `git push` (D-O); it writes nothing and runs nothing. Written before the code: red until `src/git-plan.mjs` exists. Tests assert the lines, codes and exit statuses.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(join(KIT, f)).href);
const { gitPlan, renderGitPlan } = await imp('src/git-plan.mjs');
const { main } = await imp('src/cli.mjs');
const { loadZipkit } = await imp('src/zipkit-loader.mjs');
const { writeZip } = await loadZipkit();

const T = mkdtempSync(join(tmpdir(), 'chicla-gitplan-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
const dir = () => { const d = join(T, `d${++n}`); mkdirSync(d); return d; };
/** v2 manifest text from { path: [crc, size] }. */
const man = (o) => `# chicla-manifest v2\n${Object.entries(o).map(([p, [c, s]]) => `${p}\t${c.toString(16).padStart(8, '0')}\t${s}\n`).join('')}`;
const CL = (title = 'C30.4: `chicla doctor` (v0.0.336)', round = '332') => `<!-- CHANGELOG_FINGERPRINT: seq=1 -->\n# Changelog\n\n## Round ${round} — ${title}\n\n- Task.\n\n## Round 331 — older\n`;
const PREV = { 'a.txt': [1, 1], 'old.txt': [2, 2], 'b c.txt': [3, 3], 'CHICLA_PROJECT_STATUS-336.md': [4, 4], 'FILES.manifest': [5, 5], 'CHANGELOG.md': [6, 6] };
const NEW = { 'a.txt': [1, 1], 'new.txt': [7, 7], 'CHICLA_PROJECT_STATUS-337.md': [4, 4], 'FILES.manifest': [8, 8], 'CHANGELOG.md': [9, 9] };
/** A project root (the delivery) and the previous manifest as a file; `over` changes the parts. */
const fixture = ({ prev = PREV, now = NEW, changelog = CL(), status = ['CHICLA_PROJECT_STATUS-337.md'] } = {}) => {
  const root = dir(), previous = join(dir(), 'FILES.manifest');
  if (now) writeFileSync(join(root, 'FILES.manifest'), man(now));
  if (changelog !== null) writeFileSync(join(root, 'CHANGELOG.md'), changelog);
  for (const s of status) writeFileSync(join(root, s), 'status\n');
  writeFileSync(previous, man(prev));
  return { root, previous };
};
const snapshot = (d) => Object.fromEntries(readdirSync(d, { recursive: true }).map((f) => { try { return [f, readFileSync(join(d, f), 'utf8')]; } catch { return [f, null]; } }));
const run = async (args, cwd) => { let out = '', err = ''; const status = await main(args, { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd }); return { status, out, err }; };

const GLOB = "git rm -q --ignore-unmatch -- ':(glob)CHICLA_PROJECT_STATUS-*.md' ':(exclude)CHICLA_PROJECT_STATUS-337.md'";
const EXPECTED = [
  GLOB,
  "git rm -q --ignore-unmatch -- 'b c.txt' old.txt",
  'git add -- CHANGELOG.md CHICLA_PROJECT_STATUS-337.md FILES.manifest new.txt',
  "git commit -m 'round 332: C30.4: chicla doctor (v0.0.336)'",
];

test('core: the plan is four lines in order: the old status files, what left, what entered or changed, the commit; unchanged files are not named', async () => {
  const { root, previous } = fixture();
  const r = await gitPlan({ root, against: previous });
  assert.equal(r.ok, true); assert.equal(r.code, null);
  assert.deepEqual(r.commands, EXPECTED);
  assert.deepEqual(r.left, ['b c.txt', 'old.txt']);
  assert.deepEqual(r.added, ['CHANGELOG.md', 'CHICLA_PROJECT_STATUS-337.md', 'FILES.manifest', 'new.txt']);
  assert.equal(r.round, '332');
});

test('core: FILES.manifest never lists itself yet changes every round: it is always added, once, even when no entry of the manifest names it', async () => {
  const { 'FILES.manifest': _p, ...prev } = PREV, { 'FILES.manifest': _n, ...now } = NEW;
  const f = fixture({ prev, now });
  const r = await gitPlan({ root: f.root, against: f.previous });
  assert.equal(r.ok, true);
  assert.deepEqual(r.added, ['CHANGELOG.md', 'CHICLA_PROJECT_STATUS-337.md', 'FILES.manifest', 'new.txt']);
  assert.deepEqual(r.commands, EXPECTED);
  const g = await gitPlan({ root: f.root, against: f.previous });
  assert.equal(g.added.filter((p) => p === 'FILES.manifest').length, 1);
});

test('core: the old status file is covered by the first line only (never in the second); the new status file is added', async () => {
  const { root, previous } = fixture();
  const r = await gitPlan({ root, against: previous });
  assert.ok(!r.commands.slice(1).some((c) => c.includes('STATUS-336')));
  assert.ok(r.commands[2].includes('CHICLA_PROJECT_STATUS-337.md'));
});

test('core: the prefix and the number come from the newest status file of the root, whatever the project is called', async () => {
  const { root, previous } = fixture({ now: { 'ACME_PROJECT_STATUS-12.md': [1, 1], 'FILES.manifest': [2, 2], 'CHANGELOG.md': [3, 3] }, prev: { 'ACME_PROJECT_STATUS-11.md': [1, 1] }, status: ['ACME_PROJECT_STATUS-9.md', 'ACME_PROJECT_STATUS-12.md'] });
  const r = await gitPlan({ root, against: previous });
  assert.equal(r.ok, true);
  assert.equal(r.commands[0], "git rm -q --ignore-unmatch -- ':(glob)ACME_PROJECT_STATUS-*.md' ':(exclude)ACME_PROJECT_STATUS-12.md'");
});

test('core: nothing left and nothing changed: no `git rm` of files; the status line, `git add` of FILES.manifest alone (rewritten every round) and the commit stay', async () => {
  const { root, previous } = fixture({ prev: NEW });
  const r = await gitPlan({ root, against: previous });
  assert.equal(r.ok, true);
  assert.deepEqual(r.commands, [GLOB, 'git add -- FILES.manifest', EXPECTED[3]]);
});

test('core: a file whose crc32 or size differs is changed (added); the same crc32 and size is not', async () => {
  const same = { 'a.txt': [1, 1], 'size.txt': [5, 5], 'crc.txt': [6, 6], 'CHICLA_PROJECT_STATUS-337.md': [4, 4] };
  const { root, previous } = fixture({ prev: same, now: { ...same, 'size.txt': [5, 50], 'crc.txt': [60, 6] } });
  const r = await gitPlan({ root, against: previous });
  assert.deepEqual(r.added, ['FILES.manifest', 'crc.txt', 'size.txt']);
  assert.deepEqual(r.left, []);
});

test('core: more than 30 names split into several lines of at most 30, none lost', async () => {
  const many = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`gone${String(i).padStart(2, '0')}.txt`, [1, 1]]));
  const { root, previous } = fixture({ prev: { ...many, 'CHICLA_PROJECT_STATUS-337.md': [4, 4] }, now: { 'CHICLA_PROJECT_STATUS-337.md': [4, 4] } });
  const r = await gitPlan({ root, against: previous });
  const rm = r.commands.filter((c) => c.startsWith('git rm -q --ignore-unmatch -- gone'));
  assert.equal(rm.length, 3);
  assert.deepEqual(rm.map((c) => c.split(' ').length - 5), [30, 30, 5]);
  assert.equal(new Set(rm.join(' ').match(/gone\d\d\.txt/g)).size, 65);
});

test('core: a name with a quote is shell-quoted; a name with a control character is never printed and is counted in `skipped`', async () => {
  const prev = { "it's.txt": [1, 1], 'bad\u0001name.txt': [2, 2], 'CHICLA_PROJECT_STATUS-337.md': [4, 4] };
  const { root, previous } = fixture({ prev, now: { 'CHICLA_PROJECT_STATUS-337.md': [4, 4] } });
  const r = await gitPlan({ root, against: previous });
  assert.equal(r.ok, true);
  assert.equal(r.commands[1], "git rm -q --ignore-unmatch -- 'it'\\''s.txt'");
  assert.equal(r.skipped, 1);
  assert.ok(!r.commands.join('\n').includes('\u0001'));
});

test('core: the commit message is ONE line with no quote, backtick, dollar or backslash inside it: it pastes in any shell', async () => {
  const { root, previous } = fixture({ changelog: CL('C1: "quoted" `cmd` $(touch x) it\'s \\ done (v0.0.1)', '1j') });
  const r = await gitPlan({ root, against: previous });
  assert.equal(r.ok, true);
  const line = r.commands.at(-1);
  assert.match(line, /^git commit -m 'round 1j: [^'"`$\\\n]+'$/);
  assert.ok(line.includes('(v0.0.1)'));
});

test('core: no comment, no `chicla` or `node` command, no push, whatever the project holds', async () => {
  const { root, previous } = fixture();
  const r = await gitPlan({ root, against: previous });
  for (const c of r.commands) { assert.match(c, /^git (rm|add|commit) /); assert.ok(!c.includes(' #')); }
  assert.ok(!r.commands.some((c) => /push|^chicla|^node/.test(c)));
});

test('core: it writes nothing, in the project or beside the previous manifest', async () => {
  const { root, previous } = fixture(), before = snapshot(root), beforeP = snapshot(dirname(previous));
  await gitPlan({ root, against: previous });
  assert.deepEqual(snapshot(root), before); assert.deepEqual(snapshot(dirname(previous)), beforeP);
});

test('core: the previous may be a delivery zip: its FILES.manifest is read', async () => {
  const { root, previous } = fixture();
  const z = join(dir(), 'prev.zip');
  await writeZip(z, [{ name: 'FILES.manifest', data: readFileSync(previous) }, { name: 'a.txt', data: Buffer.from('a') }]);
  const r = await gitPlan({ root, against: z });
  assert.equal(r.ok, true); assert.deepEqual(r.commands, EXPECTED);
});

test('core: errors have a code and print nothing: no FILES.manifest in the root, no previous, a zip without a manifest, no status file, no round heading', async () => {
  const f = fixture({ now: null });
  assert.equal((await gitPlan({ root: f.root, against: f.previous })).code, 'EGITPLAN_MANIFEST');
  const g = fixture();
  assert.equal((await gitPlan({ root: g.root, against: join(T, 'nope.zip') })).code, 'EGITPLAN_PREVIOUS');
  assert.equal((await gitPlan({ root: g.root, against: join(T, 'nope-manifest') })).code, 'EGITPLAN_PREVIOUS');
  const z = join(dir(), 'x.zip'); await writeZip(z, [{ name: 'a.txt', data: Buffer.from('a') }]);
  assert.equal((await gitPlan({ root: g.root, against: z })).code, 'EGITPLAN_PREVIOUS');
  const s = fixture({ status: [] });
  assert.equal((await gitPlan({ root: s.root, against: s.previous })).code, 'EGITPLAN_STATUS');
  const c = fixture({ changelog: '# Changelog\n\nno rounds\n' });
  assert.equal((await gitPlan({ root: c.root, against: c.previous })).code, 'EGITPLAN_CHANGELOG');
  const c2 = fixture({ changelog: null });
  assert.equal((await gitPlan({ root: c2.root, against: c2.previous })).code, 'EGITPLAN_CHANGELOG');
  const bad = await gitPlan({ root: g.root, against: undefined });
  assert.equal(bad.code, 'EGITPLAN_USAGE');
  for (const r of [bad]) assert.deepEqual(r.commands, []);
});

test('render: the commands are the output, one per line, and nothing else on stdout', async () => {
  const { root, previous } = fixture();
  const { out, err } = renderGitPlan(await gitPlan({ root, against: previous }));
  assert.equal(out, `${EXPECTED.join('\n')}\n`);
  assert.equal(err, '');
});

test('cli: `git-plan --against <manifest> --root <dir>` prints the plan, exit 0; --json gives one object with the commands', async () => {
  const { root, previous } = fixture();
  const a = await run(['git-plan', '--against', previous, '--root', root], T);
  assert.equal(a.status, 0); assert.equal(a.out, `${EXPECTED.join('\n')}\n`);
  const b = await run(['git-plan', '--against', previous, '--root', root, '--json'], T);
  assert.equal(b.status, 0);
  const j = JSON.parse(b.out);
  assert.equal(j.command, 'git-plan'); assert.equal(j.ok, true); assert.deepEqual(j.commands, EXPECTED);
});

test('cli: no --against is a usage error (exit 2, EUSAGE); a failure of the core is exit 1 with its code in --json', async () => {
  const { root, previous } = fixture();
  const a = await run(['git-plan', '--root', root, '--json'], T);
  assert.equal(a.status, 2); assert.equal(JSON.parse(a.out).code, 'EUSAGE');
  const b = await run(['git-plan', '--against'], T);
  assert.equal(b.status, 2);
  const c = await run(['git-plan', '--against', previous, '--bogus'], T);
  assert.equal(c.status, 2);
  const d = await run(['git-plan', '--against', join(T, 'nope.zip'), '--root', root, '--json'], T);
  assert.equal(d.status, 1); assert.equal(JSON.parse(d.out).code, 'EGITPLAN_PREVIOUS');
});

test('cli: --help lists git-plan', async () => {
  const h = await run(['--help'], T);
  assert.ok(h.out.includes('git-plan'));
});
