// C26.2 (round 299, D151): after C26.1 the status file is <PREFIX>_PROJECT_STATUS-N.md and the PREFIX is the `status-prefix:` line of CLAUDE.md (no line = CHICLA).
// This slice moves three READERS of the kit to that rule: the panel (finds the status file), `update` (knows a project by any status file, and never loses or shows as a
// difference the project's own `status-prefix:` line when it replaces CLAUDE.md) and `verify-delivery` (a previous status file of the same prefix is not a lost file; the
// delivery zip is read through its own reader, so its CLAUDE.md says the prefix). Written before the code; red until it exists.
// Tests assert states, bytes and exit codes, never message text (CLAUDE.md product rule 6). Every project is a temp folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned } from '../../../test/toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const { readPanelData } = await imp('packages/chicla-kit/src/panel.mjs');
const { initProject, forName } = await imp('packages/chicla-kit/src/init.mjs');
const { updateProject } = await imp('packages/chicla-kit/src/update.mjs');
const { checkManifest } = await imp('packages/chicla-kit/src/check-manifest.mjs');
const { statusPrefix } = await imp('packages/chicla-kit/src/integrity.mjs');
const tpl = (f) => readFileSync(join(ROOT, 'packages/chicla-kit/templates', f), 'utf8');

const T = mkdtempSync(join(tmpdir(), 'chicla-c262-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
const STATUS = '# Status\n\n**Current version:** v1.2.3 (round 9)\n\n**Last updated (round 9):** 2026-11-01. One line.\n\n## Next up\n\nthe next thing\n\n## Gates\n\n| Gate | What | State |\n| --- | --- | --- |\n| G-1 | Name | open |\n';
const folder = (files) => { const d = join(T, `f${n++}`); mkdirSync(d); for (const [k, v] of Object.entries(files)) writeFileSync(join(d, k), v); return d; };
const rules = (p) => `# rules\n\nstatus-prefix: ${p}\n`;
const viewOf = (d) => ({ names: readdirSync(d), read: (f) => { try { return readFileSync(join(d, f)); } catch { return null; } } });
/** A project made by `init --name` (C26.4 writes the status file, the line and the `file=` of the fingerprint lines itself; before it, this helper renamed them by hand). */
const moved = (name, agents = []) => {
  const d = join(T, `m${n++}`); mkdirSync(d);
  assert.equal(initProject({ root: d, agents, name }).ok, true);
  return d;
};
const stripLine = (s) => s.replace(/^status-prefix:.*\r?\n/gm, '');

// ---- the panel ----
test('panel: the status file is the one of the prefix in CLAUDE.md, whatever other status files lie in the folder', () => {
  const d = folder({ 'CLAUDE.md': rules('ACME'), 'ACME_PROJECT_STATUS-7.md': STATUS, 'CHICLA_PROJECT_STATUS-9.md': STATUS.replace('v1.2.3', 'v9.9.9') });
  const r = readPanelData(d);
  assert.equal(r.statusFile, 'ACME_PROJECT_STATUS-7.md');
  assert.match(r.version, /v1\.2\.3/);
  assert.deepEqual(r.gates.map((g) => g.id), ['G-1']);
});

test('panel: the highest number of the prefix wins; with no line the legacy CHICLA name still works; an invalid line finds no file and never throws', () => {
  assert.equal(readPanelData(folder({ 'CLAUDE.md': rules('ACME'), 'ACME_PROJECT_STATUS-9.md': STATUS, 'ACME_PROJECT_STATUS-10.md': STATUS })).statusFile, 'ACME_PROJECT_STATUS-10.md');
  assert.equal(readPanelData(folder({ 'CLAUDE.md': '# rules\n', 'CHICLA_PROJECT_STATUS-3.md': STATUS })).statusFile, 'CHICLA_PROJECT_STATUS-3.md');
  assert.equal(readPanelData(folder({ 'CHICLA_PROJECT_STATUS-3.md': STATUS })).statusFile, 'CHICLA_PROJECT_STATUS-3.md', 'no CLAUDE.md at all: the legacy name');
  const bad = readPanelData(folder({ 'CLAUDE.md': rules('acme'), 'ACME_PROJECT_STATUS-7.md': STATUS, 'CHICLA_PROJECT_STATUS-9.md': STATUS }));
  assert.equal(bad.statusFile, null); assert.deepEqual(bad.gates, []);
});

// ---- update ----
test('update: a project of another prefix is a project (no ENOPROJECT) even with no instruction file', () => {
  const d = folder({ 'ACME_PROJECT_STATUS-4.md': STATUS });
  const r = updateProject({ root: d });
  assert.equal(r.ok, true);
  assert.ok(r.files.every((f) => f.state === 'missing'));
});

test('update: the `status-prefix:` line is the project\'s own: CLAUDE.md with it and the template as it is read "same", and a diff never shows the line', () => {
  const d = moved('ACME');
  assert.equal(updateProject({ root: d }).files.find((f) => f.file === 'CLAUDE.md').state, 'same');
  writeFileSync(join(d, 'CLAUDE.md'), `${readFileSync(join(d, 'CLAUDE.md'), 'utf8')}\n## Mine\n- a local rule\n`);
  const c = updateProject({ root: d }).files.find((f) => f.file === 'CLAUDE.md');
  assert.equal(c.state, 'differs');
  assert.doesNotMatch(c.diff, /status-prefix/);
  assert.match(c.diff, /a local rule/);
});

test('update --apply: replacing CLAUDE.md keeps the project\'s `status-prefix:` line, so the status file is still found and the refresh passes', () => {
  const d = moved('ACME');
  writeFileSync(join(d, 'CLAUDE.md'), `${readFileSync(join(d, 'CLAUDE.md'), 'utf8')}\n## Mine\n- a local rule\n`);
  const r = updateProject({ root: d, apply: ['CLAUDE.md'] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.applied, ['CLAUDE.md']);
  const after = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
  assert.equal(statusPrefix(viewOf(d)), 'ACME');
  assert.equal(after.match(/^status-prefix:/gm).length, 1);
  assert.equal(stripLine(after), forName(tpl('CLAUDE.md'), 'ACME'), 'the rest is the template, read through the name (C26.4)');
  assert.ok(readdirSync(d).includes('ACME_PROJECT_STATUS-1.md'));
});

test('update --apply: a project with no line (the legacy name) gets the template as it is, no line added', () => {
  const d = join(T, `m${n++}`); mkdirSync(d);
  assert.equal(initProject({ name: 'CHICLA', root: d }).ok, true);
  writeFileSync(join(d, 'CLAUDE.md'), `${readFileSync(join(d, 'CLAUDE.md'), 'utf8')}\n- a local rule\n`);
  const r = updateProject({ root: d, apply: ['CLAUDE.md'] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(readFileSync(join(d, 'CLAUDE.md'), 'utf8'), tpl('CLAUDE.md'));
});

// ---- verify-delivery ----
const node = (cwd, script, ...a) => spawnSync(process.execPath, [join(cwd, script), ...a], { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
test('verify-delivery: a second delivery of a project with its own prefix does not lose the previous status file (the old number is not a lost file)', () => {
  const p = join(T, `p${n++}`);
  for (const { path: rel } of parseManifest(read('FILES.manifest'))) { mkdirSync(dirname(join(p, rel)), { recursive: true }); try { copyFileSync(join(ROOT, rel), join(p, rel)); } catch { /* listed but not on disk */ } }
  copyFileSync(join(ROOT, 'FILES.manifest'), join(p, 'FILES.manifest'));
  const old = readdirSync(p).find((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f)), fresh = old.replace('CHICLA', 'ACME');
  renameSync(join(p, old), join(p, fresh));
  for (const f of ['version.mjs', 'CHANGELOG.md']) writeFileSync(join(p, f), readFileSync(join(p, f), 'utf8').replace(`file=${old}`, `file=${fresh}`));
  writeFileSync(join(p, 'CLAUDE.md'), readFileSync(join(p, 'CLAUDE.md'), 'utf8').replace(/^status-prefix: CHICLA[ \t]*$/m, 'status-prefix: ACME'));
  const one = join(T, 'one.zip'), two = join(T, 'two.zip');
  let r = node(p, 'scripts/make-delivery-zip.mjs', one); assert.equal(r.status, 0, r.stdout + r.stderr);
  r = node(p, 'scripts/bump-round.mjs'); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(readdirSync(p).some((f) => /^ACME_PROJECT_STATUS-\d+\.md$/.test(f) && f !== fresh), 'bump-round renamed it to the next number, same prefix');
  r = node(p, 'scripts/make-delivery-zip.mjs', two, '--against', one); assert.equal(r.status, 0, r.stdout + r.stderr);
});
