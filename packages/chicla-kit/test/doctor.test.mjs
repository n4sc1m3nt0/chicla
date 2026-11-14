// C30.4 (D-E, round 332; Rodrigo «ok» = the task under «Next up»): `chicla doctor` reads a project and says what is wrong, writing NOTHING. Four checks, by id:
// `instruction-files` (at least one instruction file, and each one is a regular file; a missing CLAUDE.md or AGENTS.md alone is a note: a project may use one agent), `fingerprint` (what `bump-round --verify` checks), `templates` (a file that differs from this kit's template is a NOTE,
// never a failure: the project may edit its rules) and `scripts-refs` (an instruction file or the status file names a `scripts/<file>` that is not in the project).
// Written before the code: red until it exists. Tests assert ids, codes, states and bytes, never message text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(join(KIT, f)).href);
const { initProject } = await imp('src/init.mjs');
const { doctor, renderDoctor } = await imp('src/doctor.mjs');
const { main } = await imp('src/cli.mjs');

const T = () => mkdtempSync(join(tmpdir(), 'chicla-doctor-'));
const done = (d) => rmSync(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 });
const fresh = () => { const d = T(); assert.equal(initProject({ name: 'CHICLA', root: d }).ok, true); return d; };
const read = (d, f) => readFileSync(join(d, f), 'utf8');
const snapshot = (d) => Object.fromEntries(readdirSync(d, { recursive: true }).map((f) => { try { return [f, readFileSync(join(d, f), 'utf8')]; } catch { return [f, null]; } }));
const check = (r, id) => r.checks.find((c) => c.id === id);
const run = async (args, cwd) => { let out = '', err = ''; const status = await main(args, { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd }); return { status, out, err }; };

test('core: a fresh project is healthy: the four checks pass, no note, and nothing is written', () => {
  const d = fresh(); try {
    const before = snapshot(d);
    const r = doctor({ root: d });
    assert.equal(r.ok, true);
    assert.deepEqual(r.checks.map((c) => [c.id, c.ok]), [['instruction-files', true], ['fingerprint', true], ['templates', true], ['scripts-refs', true]]);
    assert.ok(r.checks.every((c) => c.level !== 'note'));
    assert.deepEqual(snapshot(d), before);
  } finally { done(d); }
});

test('core: one of CLAUDE.md and AGENTS.md missing is a NOTE that names it; both missing, or one that is a folder, fails `instruction-files`; code EDOCTOR_FAILED', () => {
  for (const f of ['CLAUDE.md', 'AGENTS.md']) {
    const d = fresh(); try {
      rmSync(join(d, f));
      const r = doctor({ root: d });
      assert.equal(r.ok, true);
      const c = check(r, 'instruction-files');
      assert.equal(c.ok, true); assert.equal(c.level, 'note'); assert.deepEqual(c.files, [f]);
    } finally { done(d); }
  }
  const d = fresh(); try {
    rmSync(join(d, 'CLAUDE.md')); rmSync(join(d, 'AGENTS.md'));
    const r = doctor({ root: d });
    assert.equal(r.ok, false); assert.equal(r.code, 'EDOCTOR_FAILED');
    assert.equal(check(r, 'instruction-files').ok, false);
    assert.equal(check(r, 'scripts-refs').ok, true, 'the other checks still run');
  } finally { done(d); }
  const e = fresh(); try {
    rmSync(join(e, 'AGENTS.md')); mkdirSync(join(e, 'AGENTS.md'));
    const c = check(doctor({ root: e }), 'instruction-files');
    assert.equal(c.ok, false); assert.deepEqual(c.files, ['AGENTS.md']);
  } finally { done(e); }
});

test('core: a project whose app file was edited fails `fingerprint`', () => {
  const d = fresh(); try {
    writeFileSync(join(d, 'version.mjs'), `${read(d, 'version.mjs')}\n// edited elsewhere\n`);
    const r = doctor({ root: d });
    assert.equal(r.ok, false); assert.equal(check(r, 'fingerprint').ok, false);
    assert.equal(check(r, 'instruction-files').ok, true);
  } finally { done(d); }
});

test('core: an edited CLAUDE.md is a NOTE on `templates`, not a failure', () => {
  const d = fresh(); try {
    writeFileSync(join(d, 'CLAUDE.md'), `${read(d, 'CLAUDE.md')}\n## Project rules\n- my own rule\n`);
    const r = doctor({ root: d });
    assert.equal(r.ok, true);
    const c = check(r, 'templates');
    assert.equal(c.ok, true); assert.equal(c.level, 'note'); assert.deepEqual(c.files, ['CLAUDE.md']);
  } finally { done(d); }
});

test('core: a `scripts/<file>` named in an instruction file or in the status file that is not in the project fails `scripts-refs`; one that exists passes', () => {
  const d = fresh(); try {
    writeFileSync(join(d, 'CLAUDE.md'), `${read(d, 'CLAUDE.md')}\nRun \`node scripts/gone.mjs\` first.\n`);
    let r = doctor({ root: d });
    assert.equal(r.ok, false);
    assert.deepEqual(check(r, 'scripts-refs').refs, [{ file: 'CLAUDE.md', ref: 'scripts/gone.mjs' }]);
    mkdirSync(join(d, 'scripts')); writeFileSync(join(d, 'scripts/gone.mjs'), '// now it exists\n');
    r = doctor({ root: d });
    assert.equal(check(r, 'scripts-refs').ok, true);
    const st = readdirSync(d).find((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f));
    writeFileSync(join(d, st), `${read(d, st)}\nAlso scripts/missing-too.mjs.\n`);
    r = doctor({ root: d });
    assert.deepEqual(check(r, 'scripts-refs').refs.map((x) => [x.file, x.ref]), [[st, 'scripts/missing-too.mjs']]);
  } finally { done(d); }
});

test('core: a pattern or a placeholder after the folder name (a star, <name>, {a,b}, [x]) is not a file name, and neither is the full stop that ends a sentence', () => {
  const d = fresh(); try {
    writeFileSync(join(d, 'CLAUDE.md'), `${read(d, 'CLAUDE.md')}\nThe files scripts/smoke-*.mjs, scripts/<name>.mjs, scripts/x-{a,b}.mjs and scripts/y[12].mjs; then see scripts/real.mjs.\n`);
    mkdirSync(join(d, 'scripts')); writeFileSync(join(d, 'scripts/real.mjs'), '//\n');
    const r = doctor({ root: d });
    assert.deepEqual(check(r, 'scripts-refs').refs, [], 'only a plain name is a reference, and the final full stop is not in it');
    assert.equal(r.ok, true);
  } finally { done(d); }
});

test('core: a folder with no chicla project is EDOCTOR_NOPROJECT; a folder that does not exist is ENOROOT', () => {
  const d = T(); try {
    const r = doctor({ root: d });
    assert.equal(r.ok, false); assert.equal(r.code, 'EDOCTOR_NOPROJECT');
    assert.equal(doctor({ root: join(d, 'nope') }).code, 'ENOROOT');
  } finally { done(d); }
});

test('render: one line per check, a mark that tells pass, note and fail apart, and the ids', () => {
  const d = fresh(); try {
    writeFileSync(join(d, 'CLAUDE.md'), `${read(d, 'CLAUDE.md')}\nmine\n`);
    const { out, err } = renderDoctor(doctor({ root: d }));
    for (const id of ['instruction-files', 'fingerprint', 'templates', 'scripts-refs']) assert.ok((out + err).includes(id), id);
    assert.match(out, /^\s*✓ instruction-files/m);
    assert.match(out, /^\s*! templates/m);
  } finally { done(d); }
});

test('cli: `chicla doctor --root <dir>` exits 0 on a healthy project and 1 on a failing one, --json carries the checks, and it writes nothing', async () => {
  const d = fresh(); try {
    const before = snapshot(d);
    const ok = await run(['doctor', '--root', d], d);
    assert.equal(ok.status, 0, ok.err);
    const j = JSON.parse((await run(['doctor', '--json', '--root', d], d)).out);
    assert.equal(j.ok, true); assert.equal(j.command, 'doctor'); assert.deepEqual(j.checks.map((c) => c.id), ['instruction-files', 'fingerprint', 'templates', 'scripts-refs']);
    assert.deepEqual(snapshot(d), before);
    rmSync(join(d, 'AGENTS.md')); rmSync(join(d, 'CLAUDE.md'));
    const bad = await run(['doctor', '--json', '--root', d], d);
    assert.equal(bad.status, 1); assert.equal(JSON.parse(bad.out).code, 'EDOCTOR_FAILED');
    assert.equal((await run(['doctor'], d)).status, 1, 'the root defaults to the current folder');
    const e = fresh(); try {
      const elsewhere = T(); try {
        assert.equal((await run(['doctor', '--root', e], elsewhere)).status, 0, '--root is the project, not the current folder');
        assert.equal((await run(['doctor'], elsewhere)).status, 1, 'the current folder has no project');
      } finally { done(elsewhere); }
    } finally { done(e); }
  } finally { done(d); }
});

test('cli: doctor takes no other option (usage, 2), and --help lists it', async () => {
  const d = fresh(); try {
    assert.equal((await run(['doctor', '--apply', 'CLAUDE.md', '--root', d], d)).status, 2);
    assert.equal((await run(['doctor', '--root'], d)).status, 2);
    const h = await run(['--help'], d);
    assert.match(h.out, /^\s+doctor\s/m);
  } finally { done(d); }
});
