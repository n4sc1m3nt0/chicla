// C11.3 — `chicla update`: compares the instruction files of a project (CLAUDE.md, AGENTS.md and the files of the agents it uses) with the templates of the
// installed kit, shows the difference and changes NOTHING unless a file is named with --apply (that is the confirmation; always manual, D12).
// It never touches the state files (status file, CHANGELOG.md, version.mjs, FILES.manifest content stays the project's); after an apply the manifest and the
// fingerprint are refreshed by the kit's own `bump-round --refresh`, and if that fails the file goes back to what it was. Calls made on delegation: D132.
// Tests assert `code`s, states and bytes, never message text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(join(KIT, f)).href);
const { initProject } = await imp('src/init.mjs');
const { updateProject, renderUpdate } = await imp('src/update.mjs');
const { main } = await imp('src/cli.mjs');
const { bumpRound } = await imp('src/bump-round.mjs');
const { checkManifest } = await imp('src/check-manifest.mjs');
const tpl = (n) => readFileSync(join(KIT, 'templates', n), 'utf8');

const T = () => mkdtempSync(join(tmpdir(), 'chicla-update-'));
const done = (d) => rmSync(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 });
const fresh = (agents = []) => { const d = T(); assert.equal(initProject({ root: d, agents }).ok, true); return d; };
const read = (d, f) => readFileSync(join(d, f), 'utf8');
const snapshot = (d) => Object.fromEntries(readdirSync(d, { recursive: true }).map((f) => { try { return [f, readFileSync(join(d, f), 'utf8')]; } catch { return [f, null]; } }));
const run = async (args, cwd) => { let out = '', err = ''; const status = await main(args, { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd }); return { status, out, err }; };

test('core: a fresh project is up to date: both files are "same", nothing is written', () => {
  const d = fresh(); try {
    const before = snapshot(d);
    const r = updateProject({ root: d });
    assert.equal(r.ok, true);
    assert.deepEqual(r.files.map((f) => [f.file, f.state]), [['CLAUDE.md', 'same'], ['AGENTS.md', 'same']]);
    assert.deepEqual(r.applied, []);
    assert.deepEqual(snapshot(d), before);
  } finally { done(d); }
});

test('core: a local edit is "differs", comes with a diff that names both sides, and the file is NOT overwritten', () => {
  const d = fresh(); try {
    const mine = `${read(d, 'CLAUDE.md')}\n## Project rules\n- my own rule\n`;
    writeFileSync(join(d, 'CLAUDE.md'), mine);
    const before = snapshot(d);
    const r = updateProject({ root: d });
    const c = r.files.find((f) => f.file === 'CLAUDE.md');
    assert.equal(c.state, 'differs');
    assert.match(c.diff, /^-.*my own rule/m, 'the line only the project has is marked -');
    assert.equal(r.files.find((f) => f.file === 'AGENTS.md').state, 'same');
    assert.equal(read(d, 'CLAUDE.md'), mine);
    assert.deepEqual(snapshot(d), before, 'a report writes nothing at all');
  } finally { done(d); }
});

test('core: the diff marks a line only the template has with +, and a line the project changed as - and +', () => {
  const d = fresh(); try {
    const t = tpl('AGENTS.md').split('\n');
    const i = t.findIndex((l) => l.trim().length > 10);
    t[i] = 'THIS LINE WAS REWRITTEN LOCALLY';
    writeFileSync(join(d, 'AGENTS.md'), t.join('\n'));
    const c = updateProject({ root: d }).files.find((f) => f.file === 'AGENTS.md');
    assert.match(c.diff, /^-THIS LINE WAS REWRITTEN LOCALLY$/m);
    assert.ok(c.diff.split('\n').some((l) => l === `+${tpl('AGENTS.md').split('\n')[i]}`), 'the template line is marked +');
  } finally { done(d); }
});

test('core: CRLF line endings alone are not a difference (a Windows checkout)', () => {
  const d = fresh(); try {
    writeFileSync(join(d, 'CLAUDE.md'), read(d, 'CLAUDE.md').replace(/\n/g, '\r\n'));
    assert.equal(updateProject({ root: d }).files.find((f) => f.file === 'CLAUDE.md').state, 'same');
  } finally { done(d); }
});

test('core: a missing file is "missing"; a folder or a link where a file should be is refused with ENOFILE and nothing is written', () => {
  const d = fresh(); try {
    rmSync(join(d, 'AGENTS.md'));
    assert.equal(updateProject({ root: d }).files.find((f) => f.file === 'AGENTS.md').state, 'missing');
    mkdirSync(join(d, 'AGENTS.md'));
    const r = updateProject({ root: d, apply: ['AGENTS.md'] });
    assert.equal(r.ok, false); assert.equal(r.code, 'ENOFILE');
    assert.deepEqual(readdirSync(join(d, 'AGENTS.md')), []);
  } finally { done(d); }
});

test('core: the files of an agent that the project already has are compared too; --agent adds one that is not there yet (as "missing")', () => {
  const d = fresh(['gemini']); try {
    assert.deepEqual(updateProject({ root: d }).files.map((f) => f.file), ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md']);
    const r = updateProject({ root: d, agents: ['copilot'] });
    assert.deepEqual(r.files.map((f) => [f.file, f.state]), [['CLAUDE.md', 'same'], ['AGENTS.md', 'same'], ['GEMINI.md', 'same'], ['.github/copilot-instructions.md', 'missing']]);
    assert.equal(updateProject({ root: d, agents: ['nope'] }).code, 'EAGENT');
  } finally { done(d); }
});

test('core: no project here (none of the instruction files and no status file) is ENOPROJECT; a missing folder is ENOROOT', () => {
  const d = T(); try {
    assert.equal(updateProject({ root: d }).code, 'ENOPROJECT');
    assert.equal(updateProject({ root: join(d, 'nope') }).code, 'ENOROOT');
  } finally { done(d); }
});

test('core: --apply replaces exactly the named file with the template, leaves the others, and the project still verifies', () => {
  const d = fresh(); try {
    writeFileSync(join(d, 'CLAUDE.md'), 'local\n');
    writeFileSync(join(d, 'AGENTS.md'), 'also local\n');
    const r = updateProject({ root: d, apply: ['CLAUDE.md'] });
    assert.equal(r.ok, true); assert.deepEqual(r.applied, ['CLAUDE.md']);
    assert.equal(read(d, 'CLAUDE.md'), tpl('CLAUDE.md'));
    assert.equal(read(d, 'AGENTS.md'), 'also local\n', 'a file that was not named is never touched');
    assert.equal(r.files.find((f) => f.file === 'CLAUDE.md').state, 'applied');
    assert.equal(bumpRound({ root: d, mode: 'verify' }).ok, true);
    assert.equal(checkManifest({ root: d }).ok, true, 'the manifest was refreshed');
    assert.deepEqual(readdirSync(d).filter((f) => f.endsWith('.tmp') || f.endsWith('.bak')), [], 'no temp or backup file is left');
  } finally { done(d); }
});

test('core: --apply on a missing file creates it (a new agent file); on a file that is already the same it is a no-op', () => {
  const d = fresh(); try {
    const r = updateProject({ root: d, agents: ['copilot'], apply: ['.github/copilot-instructions.md', 'CLAUDE.md'] });
    assert.equal(r.ok, true); assert.deepEqual(r.applied, ['.github/copilot-instructions.md']);
    assert.equal(read(d, '.github/copilot-instructions.md'), tpl('copilot-instructions.md'));
    assert.equal(bumpRound({ root: d, mode: 'verify' }).ok, true);
  } finally { done(d); }
});

test('core: --apply of a name that is not an instruction file (a state file, a path out of the project, an unknown name) is EAPPLY and writes nothing', () => {
  const d = fresh(); try {
    writeFileSync(join(d, 'CLAUDE.md'), 'local\n');
    const before = snapshot(d);
    for (const bad of ['CHANGELOG.md', 'version.mjs', 'FILES.manifest', '../x.md', '/etc/passwd', 'GEMINI.md', 'claude.md']) {
      const r = updateProject({ root: d, apply: ['CLAUDE.md', bad] });
      assert.equal(r.ok, false, bad); assert.equal(r.code, 'EAPPLY', bad);
    }
    assert.deepEqual(snapshot(d), before, 'one bad name refuses the whole run, even the good name next to it');
  } finally { done(d); }
});

test('core: if the refresh after an apply fails, the file is put back exactly as it was (all or nothing)', () => {
  const d = fresh(); try {
    writeFileSync(join(d, 'CLAUDE.md'), 'local\n');
    rmSync(join(d, 'CHICLA_PROJECT_STATUS-1.md')); // the refresh needs exactly one status file: it will fail
    const r = updateProject({ root: d, apply: ['CLAUDE.md'] });
    assert.equal(r.ok, false); assert.equal(r.code, 'EWRITE');
    assert.equal(read(d, 'CLAUDE.md'), 'local\n');
    assert.deepEqual(readdirSync(d).filter((f) => f.endsWith('.tmp')), []);
  } finally { done(d); }
});

test('core: `templates` (tests only) is the folder that is compared against, so the kit\'s own templates are not the only reference', () => {
  const d = fresh(); const t = T(); try {
    for (const f of ['CLAUDE.md', 'AGENTS.md']) writeFileSync(join(t, f), 'newer template\n');
    const r = updateProject({ root: d, templates: pathToFileURL(`${t}/`) });
    assert.deepEqual(r.files.map((f) => f.state), ['differs', 'differs']);
    assert.equal(updateProject({ root: d, apply: ['AGENTS.md'], templates: pathToFileURL(`${t}/`) }).ok, true);
    assert.equal(read(d, 'AGENTS.md'), 'newer template\n');
  } finally { done(d); done(t); }
});

test('cli: `chicla update` reports and exits 0; --json has one object; unknown option and a bare --apply are usage errors (2)', async () => {
  const d = fresh(); try {
    writeFileSync(join(d, 'CLAUDE.md'), 'local\n');
    const a = await run(['update'], d);
    assert.equal(a.status, 0);
    assert.ok(a.out.includes('CLAUDE.md') || a.err.includes('CLAUDE.md'));
    assert.equal(read(d, 'CLAUDE.md'), 'local\n');
    const j = await run(['update', '--json'], d);
    const o = JSON.parse(j.out); assert.equal(o.command, 'update'); assert.equal(o.ok, true);
    assert.equal(o.files.find((f) => f.file === 'CLAUDE.md').state, 'differs');
    assert.equal((await run(['update', '--bogus'], d)).status, 2);
    assert.equal((await run(['update', '--apply'], d)).status, 2);
    assert.equal((await run(['update', '--agent'], d)).status, 2);
    assert.equal((await run(['update', '--agent', 'nope'], d)).status, 2);
  } finally { done(d); }
});

test('cli: `chicla update --apply CLAUDE.md` writes it; --apply with a bad name exits 1 and writes nothing; no project exits 1', async () => {
  const d = fresh(); const e = T(); try {
    writeFileSync(join(d, 'CLAUDE.md'), 'local\n');
    assert.equal((await run(['update', '--apply', 'version.mjs'], d)).status, 1);
    assert.equal(read(d, 'CLAUDE.md'), 'local\n');
    const r = await run(['update', '--apply', 'CLAUDE.md', '--root', d], e);
    assert.equal(r.status, 0);
    assert.equal(read(d, 'CLAUDE.md'), tpl('CLAUDE.md'));
    assert.equal((await run(['update'], e)).status, 1);
  } finally { done(d); done(e); }
});

test('cli: --help names update and its options; the README of the kit lists the command', async () => {
  const h = await run(['--help'], process.cwd());
  assert.match(h.out, /\bupdate\b/); assert.match(h.out, /--apply/);
  assert.match(readFileSync(join(KIT, 'README.md'), 'utf8'), /chicla update/);
});

test('render: the human text names every file with its state, and shows the diff only for a file that differs', () => {
  const d = fresh(); try {
    writeFileSync(join(d, 'CLAUDE.md'), 'local\n');
    const { out, err } = renderUpdate(updateProject({ root: d }));
    const text = out + err;
    assert.ok(text.includes('CLAUDE.md') && text.includes('AGENTS.md'));
    assert.ok(text.includes('--apply'), 'it tells how to apply, since it never does it alone');
    assert.equal(existsSync(join(d, 'CLAUDE.md.bak')), false);
  } finally { done(d); }
});
