// C10.4 (round 180) — the legs of the fingerprint are specified in docs/fingerprint.md, and the spec cannot drift from the code.
// The tests build small throw-away projects whose hashes are computed HERE, from the definition the doc gives (not by calling the code under test),
// then ask `bumpRound` to verify, refresh and bump them. A doc that says something the code does not do, or a code path the doc does not mention, goes red.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TOOLCHAIN_SOURCES } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = 'packages/chicla-kit/src/bump-round.mjs';
const { bumpRound } = await import(pathToFileURL(join(ROOT, CORE)).href);
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DOC = 'docs/fingerprint.md';
const T = mkdtempSync(join(tmpdir(), 'chicla-c104-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 5 }));

// ---- the definition of the doc, written again from scratch: «tail -n +n | sha256sum | first 12 hex» ----
const tailFrom = (text, n) => text.split('\n').slice(n - 1).join('\n');
const h12 = (text) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
const APP_BODY = "export const VERSION = '1.2.3';\n";
const CL_BODY = '# Changelog\n\n## Round 1\n- first\n';
const core = (seq, hApp, hCl) => `seq=${seq} file=CHICLA_PROJECT_STATUS-${seq}.md app_sha256_12=${hApp} changelog_sha256_12=${hCl}`;
const para = (seq, hApp, hCl) => `**Fingerprint:** seq=${seq} · app=version.mjs ·\napp_sha256_12=${hApp} (of everything below the app file's own fingerprint comment) ·\nchangelog=CHANGELOG.md ·\nchangelog_sha256_12=${hCl} (hash of CHANGELOG.md below its own line) · matches the comments.\nIf any of these three don't match, stop and see instructions item 11 above before doing anything else.\n`;

let n = 0;
/** A project that is consistent at `seq`, with every hash computed by this file. `edit` may change the text of a file before the hashes are taken. */
function project({ seq = 7, app = `// app\n// leg\n// FP\n${APP_BODY}`, cl = `<!-- FP -->\n${CL_BODY}` } = {}) {
  const dir = join(T, `p${n++}`);
  mkdirSync(dir, { recursive: true });
  const hApp = h12(tailFrom(app, 4)); const hCl = h12(tailFrom(cl, 2));
  const appLines = app.split('\n'); appLines[2] = `// STATUS_FILE_FINGERPRINT: ${core(seq, hApp, hCl)}`;
  const clLines = cl.split('\n'); clLines[0] = `<!-- CHANGELOG_FINGERPRINT: ${core(seq, hApp, hCl)} -->`;
  writeFileSync(join(dir, 'version.mjs'), appLines.join('\n'));
  writeFileSync(join(dir, 'CHANGELOG.md'), clLines.join('\n'));
  writeFileSync(join(dir, `CHICLA_PROJECT_STATUS-${seq}.md`), `# Status\n\n## Instructions\n\n**Current version:** v0.0.1\n\n${para(seq, hApp, hCl)}\n\n**Last updated (round 1):** x\n\n## Snapshot\n\n## Next up\n\n## Gates\n\nOther text that no leg covers.\n`);
  return dir;
}
const stub = () => ({ ok: true, out: 'manifest stub', err: '' });
const verify = (dir) => bumpRound({ root: dir, mode: 'verify' });
const failed = (r) => (r.checks ?? []).filter((c) => !c.ok).map((c) => c.label.split(/[ =:]/)[0] + ' ' + (c.label.match(/hash/) ? 'hash' : ''));
const edit = (dir, file, fn) => writeFileSync(join(dir, file), fn(readFileSync(join(dir, file), 'utf8')));

test('docs/fingerprint.md exists and docs/README.md lists it', () => {
  assert.ok(existsSync(join(ROOT, DOC)), `${DOC} is missing`);
  assert.ok(read('docs/README.md').includes('`fingerprint.md`'), 'docs/README.md has no row for fingerprint.md');
});

test('every EBUMP_* code the code can return is explained in the doc (and no code is documented that the code never returns)', () => {
  const inCode = new Set([...read(CORE).matchAll(/EBUMP_[A-Z0-9]+/g)].map((m) => m[0]));
  const inDoc = new Set([...read(DOC).matchAll(/EBUMP_[A-Z0-9]+/g)].map((m) => m[0]));
  assert.ok(inCode.size >= 7, `expected at least 7 codes in the core, found ${[...inCode]}`);
  assert.deepEqual([...inCode].filter((c) => !inDoc.has(c)).sort(), [], 'codes in the code but not in the doc');
  assert.deepEqual([...inDoc].filter((c) => !inCode.has(c)).sort(), [], 'codes in the doc but not in the code');
});

test('the table of checks in the doc is the list `--verify` prints, in the same order (the pin row only when CLAUDE.md pins a toolchain)', () => {
  const rows = [...read(DOC).matchAll(/^\| *`([^`]+)` *\|/gm)].map((m) => m[1]);
  const begin = rows.indexOf('toolchain digest'); // first row of the table of checks
  assert.ok(begin >= 0, 'the table of checks must start with the row `toolchain digest`');
  const docChecks = rows.slice(begin, begin + 9);
  const labels = verify(project()).checks.map((c) => c.label); // no CLAUDE.md in the throw-away project: no pin row
  assert.equal(labels.length, 7);
  labels.forEach((l, i) => assert.ok(l.startsWith(docChecks[i + 1]), `check ${i + 1} is «${l}», the doc says «${docChecks[i + 1]}»`));
  const real = bumpRound({ root: ROOT, mode: 'verify' }).checks;
  assert.equal(real.length, 9, 'the real project prints the pin row, the seven and the line-ending check of CLAUDE.md');
  assert.ok(real[8].label.startsWith(docChecks[8]), `the last real check is «${real[8].label}», the doc says «${docChecks[8]}»`);
  assert.ok(real[0].label.startsWith(docChecks[0]), `the first real check is «${real[0].label}», the doc says «${docChecks[0]}»`);
});

test('what each leg covers: the app from line 4, the CHANGELOG from line 2; the fingerprint line itself and the status file are never hashed', () => {
  const ok = project(); assert.equal(verify(ok).ok, true, 'hashes computed from the doc definition are accepted');
  // not covered: app lines 1 to 3, CHANGELOG line 1, the rest of the status file
  const a = project(); edit(a, 'version.mjs', (t) => t.replace('// app\n// leg\n', '// other\n// words\n')); assert.equal(verify(a).ok, true, 'app lines 1 and 2 are not hashed');
  const c = project(); edit(c, 'CHANGELOG.md', (t) => t.replace(' -->\n', ' --> \n')); assert.equal(verify(c).ok, true, 'CHANGELOG line 1 is not hashed (its own line)');
  const s = project(); edit(s, 'CHICLA_PROJECT_STATUS-7.md', (t) => t + 'More text.\n'); assert.equal(verify(s).ok, true, 'the status file is not hashed');
  // covered: app line 4 on, CHANGELOG line 2 on
  const a4 = project(); edit(a4, 'version.mjs', (t) => t.replace('1.2.3', '1.2.4')); const ra = verify(a4);
  assert.equal(ra.ok, false); assert.equal(ra.code, 'EBUMP_VERIFY'); assert.deepEqual(ra.checks.filter((x) => !x.ok).map((x) => x.label.split(' ')[0]), ['app']); assert.match(ra.checks.filter((x) => !x.ok)[0].label, /^app hash/);
  const c2 = project(); edit(c2, 'CHANGELOG.md', (t) => t.replace('- first', '- second')); const rc = verify(c2);
  assert.equal(rc.ok, false); assert.equal(rc.code, 'EBUMP_VERIFY'); assert.match(rc.checks.filter((x) => !x.ok)[0].label, /^CHANGELOG hash/);
});

test('a file with fewer lines than the leg starts at hashes as empty (e3b0c44298fc), and the doc says so', () => {
  const dir = project({ app: '// app\n// leg\n// FP\n', cl: '<!-- FP -->\n' });
  assert.equal(h12(''), 'e3b0c44298fc');
  assert.equal(verify(dir).ok, true);
  assert.match(readFileSync(join(dir, 'version.mjs'), 'utf8'), /app_sha256_12=e3b0c44298fc/);
  assert.match(read(DOC), /e3b0c44298fc/);
});

test('every disagreement between the three legs fails the matching check: seq, file name, app name, hashes', () => {
  const seqApp = project(); edit(seqApp, 'version.mjs', (t) => t.replace('seq=7 ', 'seq=8 '));
  assert.match(verify(seqApp).checks.find((c) => !c.ok).label, /^app: seq=8/);
  const seqCl = project(); edit(seqCl, 'CHANGELOG.md', (t) => t.replace('seq=7 ', 'seq=6 '));
  assert.match(verify(seqCl).checks.find((c) => !c.ok).label, /^CHANGELOG: seq=6/);
  const seqSt = project(); edit(seqSt, 'CHICLA_PROJECT_STATUS-7.md', (t) => t.replace('seq=7 ·', 'seq=9 ·'));
  assert.match(verify(seqSt).checks.find((c) => !c.ok).label, /^status file: seq=9/);
  const file = project(); edit(file, 'CHANGELOG.md', (t) => t.replace('file=CHICLA_PROJECT_STATUS-7.md', 'file=CHICLA_PROJECT_STATUS-6.md'));
  assert.match(verify(file).checks.find((c) => !c.ok).label, /^file= points to/);
  const appName = project(); edit(appName, 'CHICLA_PROJECT_STATUS-7.md', (t) => t.replace('app=version.mjs', 'app=other.mjs'));
  assert.match(verify(appName).checks.find((c) => !c.ok).label, /^app=version\.mjs in the status file paragraph/);
  const hash = project(); edit(hash, 'CHICLA_PROJECT_STATUS-7.md', (t) => t.replace(/app_sha256_12=[0-9a-f]{12}/, 'app_sha256_12=000000000000'));
  assert.match(verify(hash).checks.find((c) => !c.ok).label, /^app hash/);
});

/** The doc shows the two comment lines with placeholders; each becomes a pattern the line the code writes must match. */
const TOKENS = { '<N>': '\\d+', '<hex12>': '[0-9a-f]{12}', '<CHANGED|unchanged>': '(?:CHANGED|unchanged)', '[; <note>]': '(?:; .+)?' };
const toRegex = (template) => new RegExp('^' + template.split(/(<N>|<hex12>|<CHANGED\|unchanged>|\[; <note>\])/).map((p) => TOKENS[p] ?? p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$');
const docLine = (start) => { const l = read(DOC).split('\n').find((x) => x.startsWith(start)); assert.ok(l, `the doc has no line starting with «${start}»`); return l.trim(); };

test('the two comment lines the code writes have the shape the doc shows, with and without a note', () => {
  const appRe = toRegex(docLine('// STATUS_FILE_FINGERPRINT:')); const clRe = toRegex(docLine('<!-- CHANGELOG_FINGERPRINT:'));
  for (const note of ['', 'a note']) {
    const dir = project(); edit(dir, 'version.mjs', (t) => t.replace('1.2.3', '1.2.5')); // the app changed, so the tag says CHANGED
    const r = bumpRound({ root: dir, mode: 'refresh', note, regenerateManifest: stub });
    assert.equal(r.ok, true, JSON.stringify(r.messages));
    const l3 = readFileSync(join(dir, 'version.mjs'), 'utf8').split('\n')[2]; const l1 = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8').split('\n')[0];
    assert.match(l3, appRe); assert.match(l1, clRe);
    assert.ok(l3.includes('app hash CHANGED'), l3); assert.equal(l3.includes('; a note'), note !== '');
  }
  const same = project(); bumpRound({ root: same, mode: 'refresh', regenerateManifest: stub }); assert.ok(readFileSync(join(same, 'version.mjs'), 'utf8').split('\n')[2].includes('app hash unchanged'));
});

test('a bump moves seq and the file name by one in all three places and renames the status file; a refresh keeps the number', () => {
  const dir = project();
  const b = bumpRound({ root: dir, mode: 'bump', regenerateManifest: stub });
  assert.equal(b.ok, true, JSON.stringify(b.messages)); assert.equal(b.nextSeq, 8);
  assert.deepEqual(readdirSync(dir).filter((f) => f.startsWith('CHICLA_PROJECT_STATUS')), ['CHICLA_PROJECT_STATUS-8.md']);
  for (const [f, re] of [['version.mjs', /seq=8 file=CHICLA_PROJECT_STATUS-8\.md/], ['CHANGELOG.md', /seq=8 file=CHICLA_PROJECT_STATUS-8\.md/], ['CHICLA_PROJECT_STATUS-8.md', /\*\*Fingerprint:\*\* seq=8 /]]) assert.match(readFileSync(join(dir, f), 'utf8'), re, f);
  assert.equal(verify(dir).ok, true);
  const r = bumpRound({ root: dir, mode: 'refresh', regenerateManifest: stub }); assert.equal(r.ok, true, JSON.stringify(r.messages)); assert.equal(r.nextSeq, 8);
  assert.deepEqual(readdirSync(dir).filter((f) => f.startsWith('CHICLA_PROJECT_STATUS')), ['CHICLA_PROJECT_STATUS-8.md']);
});

test('the refusals the doc lists: two status files, no status file, no app file, no CHANGELOG, a damaged comment or paragraph (EBUMP_STATE), seqs that differ from the status file name (EBUMP_UNPAIRED, nothing written)', () => {
  const two = project(); writeFileSync(join(two, 'CHICLA_PROJECT_STATUS-9.md'), 'x'); assert.equal(verify(two).code, 'EBUMP_STATE');
  const none = project(); rmSync(join(none, 'CHICLA_PROJECT_STATUS-7.md')); assert.equal(verify(none).code, 'EBUMP_STATE');
  const noApp = project(); rmSync(join(noApp, 'version.mjs')); assert.equal(verify(noApp).code, 'EBUMP_STATE');
  const noCl = project(); rmSync(join(noCl, 'CHANGELOG.md')); assert.equal(verify(noCl).code, 'EBUMP_STATE');
  const badApp = project(); edit(badApp, 'version.mjs', (t) => t.replace('STATUS_FILE_FINGERPRINT', 'SOMETHING')); assert.equal(verify(badApp).code, 'EBUMP_STATE');
  const badCl = project(); edit(badCl, 'CHANGELOG.md', (t) => t.replace('CHANGELOG_FINGERPRINT', 'SOMETHING')); assert.equal(verify(badCl).code, 'EBUMP_STATE');
  const noPara = project(); edit(noPara, 'CHICLA_PROJECT_STATUS-7.md', (t) => t.replace('**Fingerprint:**', '**Print:**')); assert.equal(verify(noPara).code, 'EBUMP_STATE');
  const twoPara = project(); edit(twoPara, 'CHICLA_PROJECT_STATUS-7.md', (t) => t + '\n' + para(7, 'a'.repeat(12), 'b'.repeat(12))); assert.equal(verify(twoPara).code, 'EBUMP_STATE');
  const unpaired = project(); edit(unpaired, 'CHANGELOG.md', (t) => t.replace('seq=7 ', 'seq=6 '));
  const before = readFileSync(join(unpaired, 'version.mjs'), 'utf8'); const r = bumpRound({ root: unpaired, mode: 'bump', regenerateManifest: stub });
  assert.equal(r.code, 'EBUMP_UNPAIRED'); assert.equal(readFileSync(join(unpaired, 'version.mjs'), 'utf8'), before); assert.ok(existsSync(join(unpaired, 'CHICLA_PROJECT_STATUS-7.md')));
  assert.equal(bumpRound({ root: project(), mode: 'sideways' }).code, 'EBUMP_USAGE');
});

test('the toolchain pin: the doc names the five RECOVER files and the formula, and the digest computed from the formula is the one CLAUDE.md pins', () => {
  const doc = read(DOC);
  for (const name of Object.keys(TOOLCHAIN_SOURCES)) assert.ok(doc.includes('`' + name + '`'), `the doc does not name ${name}`);
  assert.match(doc, /RECOVER\//); assert.match(doc, /toolchain-digest: /);
  const lines = Object.keys(TOOLCHAIN_SOURCES).sort().map((name) => `${createHash('sha256').update(readFileSync(join(ROOT, TOOLCHAIN_SOURCES[name]))).digest('hex')}  RECOVER/${name}\n`).join('');
  const digest = createHash('sha256').update(lines).digest('hex');
  assert.equal(digest, read('CLAUDE.md').match(/toolchain-digest: ([0-9a-f]{64})/)[1]);
});
