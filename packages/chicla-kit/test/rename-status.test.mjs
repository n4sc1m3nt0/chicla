// C26.5 (round 302, D151; D-C265a and D-C265b confirmed by Rodrigo): `chicla rename-status <NAME>` renames the status file of a project that already exists.
// It rewrites: the status file's name, the `file=` of the two fingerprint lines (CHANGELOG.md line 1, version.mjs), the one `status-prefix:` line of
// CLAUDE.md (none for CHICLA, the default), the old name in the text of the instruction files that exist (CLAUDE.md, AGENTS.md, GEMINI.md, .github/copilot-instructions.md),
// and the manifest. Amended in round 303 (D-C265a, the status file): the PROCESS BLOCK of the status file (everything above its `**Current version:**` line: the session-start
// command and the name of the file are live instructions, not history) says the new name too; everything from that line down (Snapshot, Previous, Done, Gates) keeps its bytes.
// NEVER the CHANGELOG body or the archives (history is not rewritten). All or nothing.
// The same name is not an error: nothing is done, exit 0 («already»). An invalid name is ENAME; a project the tool cannot read as one (not exactly one status file of its
// prefix, an invalid or conflicting line, no CLAUDE.md, a fingerprint line without its `file=`) is ESTATE; a failed write is EWRITE and every file is as it was.
// Written before the code; red until it exists. Tests assert codes, states and bytes, never message text. Every project is a temp folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(join(KIT, f)).href);
const { initProject } = await imp('src/init.mjs');
const { renameStatus } = await imp('src/rename-status.mjs');
const { updateProject } = await imp('src/update.mjs');
const { bumpRound } = await imp('src/bump-round.mjs');
const { checkManifest, renderCheckManifest } = await imp('src/check-manifest.mjs');
const { statusPrefix } = await imp('src/integrity.mjs');
const { main } = await imp('src/cli.mjs');
const tpl = (n) => readFileSync(join(KIT, 'templates', n), 'utf8');

const T = mkdtempSync(join(tmpdir(), 'chicla-c265-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
const AG = ['gemini', 'copilot'];
const viewOf = (d) => ({ names: readdirSync(d), read: (f) => { try { return readFileSync(join(d, f)); } catch { return null; } } });
const read = (d, f) => readFileSync(join(d, f), 'utf8');
/** Every file of the project (relative path -> text), to prove that «nothing changed» or «only these changed». */
const snap = (d, rel = '') => Object.fromEntries(readdirSync(join(d, rel), { withFileTypes: true }).flatMap((e) => { const p = rel ? `${rel}/${e.name}` : e.name; return e.isDirectory() ? Object.entries(snap(d, p)) : [[p, readFileSync(join(d, p), 'utf8')]]; }));
const statusFiles = (d) => readdirSync(d).filter((f) => /_PROJECT_STATUS-\d+\.md$/.test(f));
/** A project of the name `name`, with the old name also written in the BODY of the CHANGELOG and of the status file (history must stay), consistent again after that. */
const project = (name, agents = AG) => {
  const d = join(T, `p${n++}`); mkdirSync(d);
  assert.equal(initProject({ root: d, name, agents }).ok, true);
  writeFileSync(join(d, 'CHANGELOG.md'), `${read(d, 'CHANGELOG.md')}\n## Round 0 — history\n- the file was ${name}_PROJECT_STATUS-1.md then.\n`);
  const sf = `${name}_PROJECT_STATUS-1.md`;
  writeFileSync(join(d, sf), `${read(d, sf)}\nHistory: ${name}_PROJECT_STATUS-1.md was the file.\n`);
  assert.equal(bumpRound({ root: d, mode: 'refresh', regenerateManifest: (root) => { const m = checkManifest({ root, write: true }); return { ok: m.ok, ...renderCheckManifest(m) }; } }).ok, true);
  return d;
};
const run = async (args) => { let out = '', err = ''; const status = await main(args, { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd: process.cwd() }); return { status, out, err }; };

/** The status file split at its `**Current version:**` line: the process block above it, the state and history from it down. */
const split = (t) => { const i = t.search(/^\*\*Current version:\*\*/m); assert.ok(i > 0, 'the status file has a «Current version» line'); return [t.slice(0, i), t.slice(i)]; };

test('rename: the file, the two `file=`, the one line and the old name in the instruction files and in the process block of the status file change; the history below it and the CHANGELOG body do not; the project stays consistent', () => {
  const d = project('OLDN'), before = snap(d);
  const r = renameStatus({ root: d, name: 'NEWN' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(statusFiles(d), ['NEWN_PROJECT_STATUS-1.md']);
  const [headBefore, tailBefore] = split(before['OLDN_PROJECT_STATUS-1.md']), [headAfter, tailAfter] = split(read(d, 'NEWN_PROJECT_STATUS-1.md'));
  assert.match(headBefore, /OLDN_PROJECT_STATUS-\*\.md/, 'the fixture: the process block carries the session-start command with the old name');
  assert.doesNotMatch(headAfter, /OLDN_PROJECT_STATUS/, 'the process block still says the old name');
  assert.match(headAfter, /NEWN_PROJECT_STATUS-\*\.md/, 'the session-start command does not find the renamed file');
  assert.equal(headAfter, headBefore.replaceAll('OLDN_PROJECT_STATUS', 'NEWN_PROJECT_STATUS'), 'nothing else in the process block changed');
  assert.equal(tailAfter, tailBefore, 'from «Current version» down (the history) the status file keeps its bytes');
  assert.match(tailAfter, /Histor[y]: OLDN_PROJECT_STATUS-1\.md was the file/, 'the history of the status file is not rewritten');
  assert.match(read(d, 'CHANGELOG.md').split('\n', 1)[0], /file=NEWN_PROJECT_STATUS-1\.md /);
  assert.match(read(d, 'version.mjs'), /file=NEWN_PROJECT_STATUS-1\.md /);
  assert.match(read(d, 'CHANGELOG.md'), /OLDN_PROJECT_STATUS-1\.md then/, 'the history of the CHANGELOG is not rewritten');
  assert.equal(statusPrefix(viewOf(d)), 'NEWN');
  assert.equal(read(d, 'CLAUDE.md').match(/^status-prefix:.*$/gm).length, 1);
  for (const f of ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.github/copilot-instructions.md']) {
    assert.doesNotMatch(read(d, f), /OLDN_PROJECT_STATUS/, `${f} still says the old name`);
    assert.match(read(d, f), /NEWN_PROJECT_STATUS/, `${f} does not say the new name`);
  }
  assert.equal(bumpRound({ root: d, mode: 'verify' }).ok, true);
  assert.equal(checkManifest({ root: d }).ok, true);
  const states = updateProject({ root: d, agents: AG }).files.map((f) => f.state);
  assert.deepEqual(states.filter((s) => s !== 'same'), [], 'the instruction files are the templates read through the new name');
});

test('rename to CHICLA takes the line away (CLAUDE.md is the template again); from CHICLA it puts the line in; and back again gives the same bytes', () => {
  const d = project('ACME'), start = snap(d);
  assert.equal(renameStatus({ root: d, name: 'CHICLA' }).ok, true);
  assert.deepEqual(statusFiles(d), ['CHICLA_PROJECT_STATUS-1.md']);
  assert.equal(read(d, 'CLAUDE.md'), tpl('CLAUDE.md'));
  assert.equal(statusPrefix(viewOf(d)), 'CHICLA');
  assert.equal(renameStatus({ root: d, name: 'ACME' }).ok, true);
  assert.deepEqual(snap(d), start, 'a round trip leaves every file as it was');
});

test('the same name is not an error: ok, «already», and not one byte or name changes', () => {
  const d = project('ACME'), before = snap(d);
  const r = renameStatus({ root: d, name: 'ACME' });
  assert.equal(r.ok, true); assert.equal(r.already, true);
  assert.deepEqual(snap(d), before);
});

test('never a guess: an invalid name is ENAME and nothing is written', () => {
  const d = project('ACME'), before = snap(d);
  for (const name of ['acme', 'A-B', '1ABC', '_A', '', 'A B', undefined, 42]) {
    const r = renameStatus({ root: d, name });
    assert.equal(r.ok, false, String(name)); assert.equal(r.code, 'ENAME', String(name));
  }
  assert.deepEqual(snap(d), before);
});

test('a project that cannot be read as one is ESTATE and nothing is written: two status files, an invalid or conflicting line, no CLAUDE.md, a fingerprint line without its `file=`', () => {
  const cases = {
    'two status files': (d) => writeFileSync(join(d, 'OTHER_PROJECT_STATUS-4.md'), 's\n'),
    'two of the prefix': (d) => writeFileSync(join(d, 'ACME_PROJECT_STATUS-2.md'), 's\n'),
    'invalid line': (d) => writeFileSync(join(d, 'CLAUDE.md'), read(d, 'CLAUDE.md').replace('status-prefix: ACME', 'status-prefix: acme')),
    'conflicting lines': (d) => writeFileSync(join(d, 'CLAUDE.md'), `${read(d, 'CLAUDE.md')}\nstatus-prefix: OTHER\n`),
    'no CLAUDE.md': (d) => rmSync(join(d, 'CLAUDE.md')),
    'version.mjs without file=': (d) => writeFileSync(join(d, 'version.mjs'), read(d, 'version.mjs').replace(/file=\S+ /, '')),
    'CHANGELOG without file=': (d) => writeFileSync(join(d, 'CHANGELOG.md'), read(d, 'CHANGELOG.md').replace(/file=\S+ /, '')),
    'no status file': (d) => rmSync(join(d, 'ACME_PROJECT_STATUS-1.md')),
  };
  for (const [what, damage] of Object.entries(cases)) {
    const d = project('ACME'); damage(d); const before = snap(d);
    const r = renameStatus({ root: d, name: 'NEWN' });
    assert.equal(r.ok, false, what); assert.equal(r.code, 'ESTATE', what);
    assert.deepEqual(snap(d), before, `${what}: nothing written`);
  }
  const missing = renameStatus({ root: join(T, 'no-such-folder'), name: 'NEWN' });
  assert.equal(missing.ok, false); assert.equal(missing.code, 'ENOROOT');
});

test('all or nothing: when the last step fails, every file is as it was, the old name is back and nothing of the new one is left', () => {
  const d = project('OLDN'), before = snap(d);
  const r = renameStatus({ root: d, name: 'NEWN', regenerateManifest: () => ({ ok: false, out: '', err: '' }) });
  assert.equal(r.ok, false); assert.equal(r.code, 'EWRITE');
  assert.deepEqual(snap(d), before);
  assert.deepEqual(statusFiles(d), ['OLDN_PROJECT_STATUS-1.md']);
});

test('cli: `rename-status ACME` renames; no name is a usage error (2); two names are a usage error; a bad name exits 1 and writes nothing; --json is one object; the help names the command', async () => {
  const d = project('OLDN'), before = snap(d);
  assert.equal((await run(['rename-status', '--root', d])).status, 2);
  assert.equal((await run(['rename-status', 'A', 'B', '--root', d])).status, 2);
  assert.equal((await run(['rename-status', 'acme', '--root', d])).status, 1);
  assert.deepEqual(snap(d), before);
  const j = await run(['rename-status', 'NEWN', '--json', '--root', d]);
  assert.equal(j.status, 0, j.err);
  const o = JSON.parse(j.out); assert.equal(o.command, 'rename-status'); assert.equal(o.ok, true); assert.equal(o.to, 'NEWN');
  assert.deepEqual(statusFiles(d), ['NEWN_PROJECT_STATUS-1.md']);
  const again = await run(['rename-status', 'NEWN', '--root', d]);
  assert.equal(again.status, 0);
  assert.match((await run(['--help'])).out + (await run(['--help'])).err, /rename-status/);
});
