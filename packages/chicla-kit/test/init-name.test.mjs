// C26.4 (round 301, D151; D-A, D-B, D-C264a and D-C264b confirmed by Rodrigo): `chicla init` names the status file of the new project.
// The name is `--name <NAME>`, else the folder in capitals with every character outside A-Z and 0-9 turned into `_`; a name that does not start with a letter
// (or that the user gave in a form that is not capitals, digits and `_`) is REFUSED with ENAME and nothing is written, never guessed. The name is the one line
// `status-prefix: <NAME>` of CLAUDE.md (C26.1); a project named CHICLA has no line (it is the default) and a CLAUDE.md byte for byte the template.
// The seven templates say `CHICLA_PROJECT_STATUS` as their source name; init (and `update`, which compares) read it as `<NAME>_PROJECT_STATUS`.
// Written before the code; red until it exists. Tests assert codes, states and bytes, never message text. Every project is a temp folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(join(KIT, f)).href);
const { initProject } = await imp('src/init.mjs');
const { updateProject } = await imp('src/update.mjs');
const { bumpRound } = await imp('src/bump-round.mjs');
const { checkManifest } = await imp('src/check-manifest.mjs');
const { statusPrefix } = await imp('src/integrity.mjs');
const { main } = await imp('src/cli.mjs');
const tpl = (n) => readFileSync(join(KIT, 'templates', n), 'utf8');

const T = mkdtempSync(join(tmpdir(), 'chicla-c264-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
/** A folder whose own name is `leaf` (the default name comes from it). */
const folder = (leaf) => { const d = join(T, `w${n++}`, leaf); mkdirSync(d, { recursive: true }); return d; };
const viewOf = (d) => ({ names: readdirSync(d), read: (f) => { try { return readFileSync(join(d, f)); } catch { return null; } } });
const read = (d, f) => readFileSync(join(d, f), 'utf8');
const run = async (args) => { let out = '', err = ''; const status = await main(args, { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd: process.cwd() }); return { status, out, err }; };
const statusFiles = (d) => readdirSync(d).filter((f) => /_PROJECT_STATUS-\d+\.md$/.test(f));

test('the name comes from the folder in capitals: every character outside A-Z and 0-9 becomes `_`; the status file, the line and the three fingerprint places all say it', () => {
  const d = folder('my app.v2');
  const r = initProject({ root: d });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(statusFiles(d), ['MY_APP_V2_PROJECT_STATUS-1.md']);
  assert.ok(r.created.includes('MY_APP_V2_PROJECT_STATUS-1.md'));
  assert.equal(statusPrefix(viewOf(d)), 'MY_APP_V2');
  assert.equal(read(d, 'CLAUDE.md').match(/^status-prefix:.*$/gm).length, 1);
  assert.match(read(d, 'CHANGELOG.md').split('\n', 1)[0], /file=MY_APP_V2_PROJECT_STATUS-1\.md /);
  assert.match(read(d, 'version.mjs'), /file=MY_APP_V2_PROJECT_STATUS-1\.md /);
});

test('--name wins over the folder; the new project is consistent at once (verify, manifest) and no file still says the Chicla name', () => {
  const d = folder('whatever');
  const r = initProject({ root: d, name: 'ACME', agents: ['gemini', 'copilot'] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(statusFiles(d), ['ACME_PROJECT_STATUS-1.md']);
  assert.equal(bumpRound({ root: d, mode: 'verify' }).ok, true);
  assert.equal(checkManifest({ root: d }).ok, true);
  for (const f of ['CLAUDE.md', 'AGENTS.md', 'CHANGELOG.md', 'version.mjs', 'ACME_PROJECT_STATUS-1.md', 'GEMINI.md', '.github/copilot-instructions.md']) {
    assert.doesNotMatch(read(d, f), /CHICLA_PROJECT_STATUS/, `${f} still says the Chicla name`);
    assert.match(read(d, f), /ACME_PROJECT_STATUS/, `${f} does not say the name`);
  }
});

test('a project named CHICLA has no line and a CLAUDE.md byte for byte the template (the default needs no line)', () => {
  const d = folder('anything');
  assert.equal(initProject({ root: d, name: 'CHICLA' }).ok, true);
  assert.deepEqual(statusFiles(d), ['CHICLA_PROJECT_STATUS-1.md']);
  assert.equal(read(d, 'CLAUDE.md'), tpl('CLAUDE.md'));
  assert.equal(read(d, 'AGENTS.md'), tpl('AGENTS.md'));
});

test('never a guess: a folder that gives no valid name, or a --name that is not capitals, digits and `_` starting with a letter, is ENAME and nothing is written', () => {
  for (const [leaf, name] of [['2026-app', undefined], ['---', undefined], ['x', 'acme'], ['x', 'A-B'], ['x', '1ABC'], ['x', '_A'], ['x', ''], ['x', 'A B']]) {
    const d = folder(leaf);
    const r = initProject({ root: d, name });
    assert.equal(r.ok, false, JSON.stringify([leaf, name]));
    assert.equal(r.code, 'ENAME', JSON.stringify([leaf, name]));
    assert.deepEqual(readdirSync(d), [], 'nothing written');
  }
});

test('a status file of ANY prefix already in the folder refuses init (EEXIST), as the Chicla one did', () => {
  const d = folder('x'); writeFileSync(join(d, 'OLD_PROJECT_STATUS-3.md'), 's\n');
  const r = initProject({ root: d, name: 'ACME' });
  assert.equal(r.ok, false); assert.equal(r.code, 'EEXIST');
  assert.deepEqual(readdirSync(d), ['OLD_PROJECT_STATUS-3.md']);
});

test('update reads the templates through the same name: a fresh project of any name is up to date, and a local edit is a difference without the name in it', () => {
  const d = folder('x');
  assert.equal(initProject({ root: d, name: 'ACME', agents: ['gemini', 'copilot'] }).ok, true);
  const states = Object.fromEntries(updateProject({ root: d, agents: ['gemini', 'copilot'] }).files.map((f) => [f.file, f.state]));
  assert.deepEqual(Object.values(states).filter((s) => s !== 'same'), [], JSON.stringify(states));
  writeFileSync(join(d, 'AGENTS.md'), `${read(d, 'AGENTS.md')}\n- a local rule\n`);
  const a = updateProject({ root: d, agents: ['gemini', 'copilot'] }).files.find((f) => f.file === 'AGENTS.md');
  assert.equal(a.state, 'differs');
  assert.doesNotMatch(a.diff, /PROJECT_STATUS/, 'the name is not part of the difference');
});

test('cli: `init --name ACME` creates the project; `--name` needs a value; a bad name exits 1 and writes nothing; the folder name is the default', async () => {
  const d = folder('x');
  assert.equal((await run(['init', '--name', 'ACME', '--root', d])).status, 0);
  assert.deepEqual(statusFiles(d), ['ACME_PROJECT_STATUS-1.md']);
  const e = folder('x');
  assert.equal((await run(['init', '--root', e, '--name'])).status, 2, 'usage error');
  assert.equal((await run(['init', '--root', e, '--name', 'acme'])).status, 1);
  assert.deepEqual(readdirSync(e), []);
  const f = folder('plain-folder');
  assert.equal((await run(['init', '--root', f])).status, 0);
  assert.deepEqual(statusFiles(f), ['PLAIN_FOLDER_PROJECT_STATUS-1.md']);
  assert.ok(existsSync(join(f, 'FILES.manifest')));
});
