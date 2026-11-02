// C26.1 (round 298, D151): the status file is called <NAME>_PROJECT_STATUS-N.md, not always CHICLA_PROJECT_STATUS-N.md. Found by Rodrigo when he installed the kit in another project:
// `chicla init` wrote the Chicla name there. The NAME is one line of CLAUDE.md, `status-prefix: <NAME>` at the start of a line (D-B, D-298a: next to the toolchain pin, which is
// read the same way; CLAUDE.md is in no hash, so no fingerprint moves). No line = the legacy name CHICLA, so every project that exists keeps working untouched.
// This slice: the shared rule in `integrity.mjs`, `bump-round` (the name it renames to) and `check-manifest` (a rename of the prefix is not a lost file). The other readers (panel, update,
// verify-delivery, dump, recovery) are C26.2 and C26.3 and `init` is last (C26.4), so no round writes a name that another tool refuses. Written before the code; red until it exists.
// Tests assert codes and ids, never message text (CLAUDE.md product rule 6). Every project is a temp folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned } from '../../../test/toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const I = await imp('packages/chicla-kit/src/integrity.mjs');
const { bumpRound } = await imp('packages/chicla-kit/src/bump-round.mjs');
const { checkManifest } = await imp('packages/chicla-kit/src/check-manifest.mjs');
const view = (files) => ({ names: Object.keys(files), read: (f) => (f in files ? Buffer.from(files[f]) : null) });
const claude = (...lines) => view({ 'CLAUDE.md': `# rules\n${lines.join('\n')}\n` });

const T = mkdtempSync(join(tmpdir(), 'chicla-c261-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
/** A copy of the real project (every file the manifest lists), then moved to the prefix `name`: the status file renamed, `file=` of the two fingerprint lines and the `status-prefix:` line of CLAUDE.md. */
const project = (name) => {
  const p = join(T, `p${n++}`);
  for (const { path: rel } of parseManifest(read('FILES.manifest'))) {
    mkdirSync(dirname(join(p, rel)), { recursive: true });
    try { copyFileSync(join(ROOT, rel), join(p, rel)); } catch { /* listed but not on disk */ }
  }
  copyFileSync(join(ROOT, 'FILES.manifest'), join(p, 'FILES.manifest'));
  if (name) {
    const old = readdirSync(p).find((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f)), seq = old.match(/-(\d+)\.md$/)[1], fresh = `${name}_PROJECT_STATUS-${seq}.md`;
    renameSync(join(p, old), join(p, fresh));
    for (const f of ['version.mjs', 'CHANGELOG.md']) writeFileSync(join(p, f), readFileSync(join(p, f), 'utf8').replace(`file=${old}`, `file=${fresh}`)); // line 3 and line 1: in no hash
    writeFileSync(join(p, 'CLAUDE.md'), readFileSync(join(p, 'CLAUDE.md'), 'utf8').replace(/^status-prefix: CHICLA[ \t]*$/m, `status-prefix: ${name}`));
  }
  return p;
};
const regen = (root) => { const m = checkManifest({ root, write: true }); return { ok: m.ok, out: m.messages.filter((x) => x.stream === 'out').map((x) => x.text).join('\n'), err: m.messages.filter((x) => x.stream === 'err').map((x) => x.text).join('\n') }; };
const statusFiles = (p) => readdirSync(p).filter((f) => /_PROJECT_STATUS-\d+\.md$/.test(f));

// ---- the shared rule (integrity.mjs, still pure) ----
test('statusPrefix: no line means the legacy name CHICLA; a line at the start of a line gives its value', () => {
  assert.equal(I.statusPrefix(claude('- a rule')), 'CHICLA');
  assert.equal(I.statusPrefix(view({})), 'CHICLA'); // no CLAUDE.md at all: the legacy name (the other rules say what is missing)
  assert.equal(I.statusPrefix(claude('status-prefix: ACME')), 'ACME');
  assert.equal(I.statusPrefix(claude('status-prefix: MY_APP2')), 'MY_APP2');
});

test('statusPrefix: a mention inside a sentence or a code span is not the line; an invalid value or two different lines give null (never a guess)', () => {
  assert.equal(I.statusPrefix(claude('Write `status-prefix: ACME` as the first word of a line.')), 'CHICLA');
  for (const bad of ['acme', 'A-B', '9ACME', '_ACME', '../X', 'A B', 'ACME.md', '']) assert.equal(I.statusPrefix(claude(`status-prefix: ${bad}`)), null, JSON.stringify(bad));
  assert.equal(I.statusPrefix(claude('status-prefix: ACME', 'status-prefix: OTHER')), null);
  assert.equal(I.statusPrefix(claude('status-prefix: ACME', 'status-prefix: ACME')), 'ACME'); // the same twice is not a conflict
});

test('statusFileRe: exactly <PREFIX>_PROJECT_STATUS-<N>.md; another prefix, a longer name, a suffix and a path never match; null matches nothing', () => {
  const re = I.statusFileRe('ACME');
  assert.equal(re.test('ACME_PROJECT_STATUS-7.md'), true);
  for (const no of ['CHICLA_PROJECT_STATUS-7.md', 'XACME_PROJECT_STATUS-7.md', 'ACME_PROJECT_STATUS-7.md.bak', 'ACME_PROJECT_STATUS-.md', 'docs/ACME_PROJECT_STATUS-7.md', 'ACME_PROJECT_STATUS-7.mdx']) assert.equal(re.test(no), false, no);
  assert.equal(I.statusFileRe(null).test('ACME_PROJECT_STATUS-7.md'), false);
  assert.equal(I.statusFileRe(null).test('CHICLA_PROJECT_STATUS-7.md'), false);
  assert.equal(I.STATUS_FILE_RE.test('CHICLA_PROJECT_STATUS-7.md'), true, 'the legacy export stays for the readers of C26.2 and C26.3');
});

test('statusFileAny: the generic shape (any valid prefix), for a LISTED name of an older manifest', () => {
  for (const ok of ['CHICLA_PROJECT_STATUS-1.md', 'ACME_PROJECT_STATUS-30.md', 'A_PROJECT_STATUS-2.md']) assert.equal(I.statusFileAny.test(ok), true, ok);
  for (const no of ['acme_PROJECT_STATUS-1.md', 'PROJECT_STATUS-1.md', '_PROJECT_STATUS-1.md', 'ACME_PROJECT_STATUS-1.txt']) assert.equal(I.statusFileAny.test(no), false, no);
});

test('checkState and checkLf follow the prefix: ACME file + `status-prefix: ACME` is consistent; the CHICLA file under that prefix is "not found"; CRLF in the ACME file is an LF failure', () => {
  // state rule only (no app/CHANGELOG in the view: the fingerprint rows are skipped, the state row is the one that counts)
  const files = (name, claudeLine) => ({ 'CLAUDE.md': `# r\n${claudeLine}\n`, [name]: '# Status\n' });
  const sha256 = () => 'x'.repeat(64);
  const okRows = I.checkState(view(files('ACME_PROJECT_STATUS-7.md', 'status-prefix: ACME')), sha256);
  assert.equal(okRows.some((r) => r.id === 'state' && !r.ok), false);
  const wrong = I.checkState(view(files('CHICLA_PROJECT_STATUS-7.md', 'status-prefix: ACME')), sha256);
  assert.equal(wrong.length, 1); assert.equal(wrong[0].id, 'state'); assert.equal(wrong[0].ok, false);
  const bad = I.checkState(view(files('ACME_PROJECT_STATUS-7.md', 'status-prefix: acme')), sha256);
  assert.equal(bad.length, 1); assert.equal(bad[0].id, 'state'); assert.equal(bad[0].ok, false);
  const crlf = { 'CLAUDE.md': '# r\nstatus-prefix: ACME\n', 'ACME_PROJECT_STATUS-7.md': '# Status\r\nx\r\n' };
  const lf = I.checkLf(view(crlf));
  assert.equal(lf.some((r) => r.file === 'ACME_PROJECT_STATUS-7.md' && !r.ok), true);
  const legacy = I.checkLf(view({ 'CHICLA_PROJECT_STATUS-7.md': '# S\r\n' }));
  assert.equal(legacy.some((r) => r.file === 'CHICLA_PROJECT_STATUS-7.md' && !r.ok), true, 'no line: the legacy name is still LF-checked');
});

test('integrity.mjs stays pure after C26.1 (no import, no I/O, no crypto)', () => {
  const src = read('packages/chicla-kit/src/integrity.mjs');
  assert.equal(/^\s*import\s/m.test(src), false);
  assert.equal(/node:|createHash|readFileSync|existsSync/.test(src.replace(/^\/\/.*$/gm, '')), false);
});

// ---- bump-round ----
test('this project says it in CLAUDE.md: `status-prefix: CHICLA` at the start of a line, and the shared rule reads it', () => {
  assert.match(read('CLAUDE.md'), /^status-prefix: CHICLA[ \t]*$/m);
  assert.equal(I.statusPrefix(view({ 'CLAUDE.md': read('CLAUDE.md') })), 'CHICLA');
});

test('bump-round --verify on a project whose prefix is ACME: all rows pass and it names ACME_PROJECT_STATUS-N', () => {
  const p = project('ACME');
  const r = bumpRound({ root: p, mode: 'verify' });
  assert.equal(r.ok, true, JSON.stringify(r.messages));
  assert.match(r.statusFile, /^ACME_PROJECT_STATUS-\d+\.md$/);
});

test('bump-round (bump) on prefix ACME renames ACME_...-N to ACME_...-N+1 (never to CHICLA_), writes `file=` of both fingerprint lines and leaves one status file', () => {
  const p = project('ACME');
  const before = statusFiles(p)[0], seq = +before.match(/-(\d+)\.md$/)[1];
  const r = bumpRound({ root: p, mode: 'bump', regenerateManifest: regen });
  assert.equal(r.ok, true, JSON.stringify(r.messages));
  assert.deepEqual(statusFiles(p), [`ACME_PROJECT_STATUS-${seq + 1}.md`]);
  assert.equal(r.statusFile, before);
  assert.match(readFileSync(join(p, 'version.mjs'), 'utf8').split('\n')[2], new RegExp(`file=ACME_PROJECT_STATUS-${seq + 1}\\.md `));
  assert.match(readFileSync(join(p, 'CHANGELOG.md'), 'utf8').split('\n')[0], new RegExp(`file=ACME_PROJECT_STATUS-${seq + 1}\\.md `));
  assert.match(readFileSync(join(p, 'FILES.manifest'), 'utf8'), new RegExp(`ACME_PROJECT_STATUS-${seq + 1}\\.md`));
  assert.doesNotMatch(readFileSync(join(p, 'FILES.manifest'), 'utf8'), /^CHICLA_PROJECT_STATUS-\d+\.md\t/m, 'no root status file of the old prefix in the manifest');
  assert.equal(bumpRound({ root: p, mode: 'verify' }).ok, true);
});

test('bump-round on the real project (no change of prefix) still renames CHICLA_...-N to -N+1', () => {
  const p = project();
  const seq = +statusFiles(p)[0].match(/-(\d+)\.md$/)[1];
  const r = bumpRound({ root: p, mode: 'bump', regenerateManifest: regen });
  assert.equal(r.ok, true, JSON.stringify(r.messages));
  assert.deepEqual(statusFiles(p), [`CHICLA_PROJECT_STATUS-${seq + 1}.md`]);
});

test('bump-round refuses (EBUMP_STATE, nothing written) when the prefix line is invalid or two different, or when the only status file has another prefix than the line says', () => {
  // each case starts from a project that passes today (CHICLA_ file, no line) and only adds the line: before C26.1 the line is ignored and these pass, so they are red first
  for (const [label, line] of [['invalid', 'status-prefix: chicla'], ['mismatch', 'status-prefix: OTHER'], ['conflict', 'status-prefix: CHICLA\nstatus-prefix: OTHER']]) {
    const p = project();
    writeFileSync(join(p, 'CLAUDE.md'), readFileSync(join(p, 'CLAUDE.md'), 'utf8').replace(/^status-prefix: CHICLA[ \t]*\n/m, '').replace(/^(# CLAUDE\.md[^\n]*\n)/, `$1\n${line}\n`));
    const names = readdirSync(p).sort(), app = readFileSync(join(p, 'version.mjs'));
    for (const mode of ['verify', 'bump', 'refresh']) {
      const r = bumpRound({ root: p, mode, regenerateManifest: regen });
      assert.equal(r.ok, false, `${label} ${mode}`); assert.equal(r.code, 'EBUMP_STATE', `${label} ${mode}`);
    }
    assert.deepEqual(readdirSync(p).sort(), names, `${label}: nothing renamed`);
    assert.equal(readFileSync(join(p, 'version.mjs')).equals(app), true, `${label}: nothing rewritten`);
  }
});

// ---- check-manifest ----
test('check-manifest on a project with prefix ACME passes after a regeneration, and a prefix change is a deliberate rename, not a lost file (one status file now)', () => {
  const p = project('ACME');
  assert.equal(checkManifest({ root: p, write: true }).ok, true);
  assert.equal(checkManifest({ root: p }).ok, true);
  // migration: the manifest still lists the old CHICLA_ name, the tree has the ACME_ one
  const q = project();
  const old = statusFiles(q)[0], fresh = old.replace('CHICLA_', 'ACME_');
  renameSync(join(q, old), join(q, fresh));
  writeFileSync(join(q, 'CLAUDE.md'), readFileSync(join(q, 'CLAUDE.md'), 'utf8').replace(/^status-prefix: CHICLA/m, 'status-prefix: ACME'));
  const m = checkManifest({ root: q });
  assert.equal(m.lost.includes(old), false, 'the old name is a rename, not a loss');
  assert.deepEqual(m.lost, []);
  assert.equal(existsSync(join(q, fresh)), true);
});

test('check-manifest: with two status files of the prefix the old listed one IS reported lost again: the rename exemption needs exactly one', () => {
  const q = project();
  const old = statusFiles(q)[0];
  writeFileSync(join(q, old.replace('CHICLA_', 'ACME_')), readFileSync(join(q, old)));
  rmSync(join(q, old));
  writeFileSync(join(q, 'ACME_PROJECT_STATUS-1.md'), '# x\n'); // two status files of the prefix now
  writeFileSync(join(q, 'CLAUDE.md'), readFileSync(join(q, 'CLAUDE.md'), 'utf8').replace(/^status-prefix: CHICLA/m, 'status-prefix: ACME'));
  const m = checkManifest({ root: q });
  assert.equal(m.lost.includes(old), true);
});
