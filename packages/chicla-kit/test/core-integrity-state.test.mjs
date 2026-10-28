// C17.2 (round 244, D140; plan in docs/plan-a1-integrity.md §5): the state and pin rules join the LF rule in `src/integrity.mjs` (the TOOLCHAIN map moves in from `bump-round.mjs`),
// `bump-round --verify` prints the same rows from the module and `verify-delivery` calls all of them, so CRLF, a wrong pin, a stale fingerprint and two status files stop a DELIVERY (the
// experiment of the plan §2, which passed `make-delivery-zip` before). Written before the code; red until it exists. Tests assert codes and ids, never message text (CLAUDE.md product rule 6).
// The fake views and the hashes below are computed here with `node:crypto`, not with the module's helpers: the test is an independent reader of the rule.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findPython } from './python-probe.mjs';
import { importPinned, TOOLCHAIN_SOURCES } from '../../../test/toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const text = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const I = await imp('packages/chicla-kit/src/integrity.mjs');
const { verifyDelivery } = await imp('packages/chicla-kit/src/verify-delivery.mjs');
const { bumpRound } = await imp('packages/chicla-kit/src/bump-round.mjs');
const PY = findPython();
const skip = !PY && 'no python3';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sha12 = (s) => sha(Buffer.from(s)).slice(0, 12);
const view = (files) => ({ names: Object.keys(files), read: (f) => (f in files ? Buffer.from(files[f]) : null) });

// ---- a consistent fake project, as a view (status -7, app, CHANGELOG, CLAUDE.md with the pin, the five toolchain files) ----
const tool = Object.fromEntries(Object.values(TOOLCHAIN_SOURCES).map((src, i) => [src, `tool ${i}\n`]));
const digest = (t = tool) => sha(Buffer.from(Object.keys(TOOLCHAIN_SOURCES).sort().map((n) => `${sha(Buffer.from(t[TOOLCHAIN_SOURCES[n]]))}  RECOVER/${n}\n`).join('')));
const fake = ({ appBody = 'export const A = 1;\n', clBody = '# Changelog\n', seq = 7, name = `CHICLA_PROJECT_STATUS-${seq}.md`, pin = digest() } = {}) => {
  const hApp = sha12(appBody), hCl = sha12(clBody), core = `seq=${seq} file=${name} app_sha256_12=${hApp} changelog_sha256_12=${hCl}`;
  const para = `**Fingerprint:** seq=${seq} · app=version.mjs ·\napp_sha256_12=${hApp} (x) ·\nchangelog=CHANGELOG.md ·\nchangelog_sha256_12=${hCl} (y) · matches\nthese three don't match what you're looking at, stop and see\ninstructions item 11 above before doing anything else.\n`;
  return {
    ...tool,
    'CLAUDE.md': `# rules\n- **Toolchain pin**: \`toolchain-digest: ${pin}\`\n`,
    'version.mjs': `// a\n// b\n// STATUS_FILE_FINGERPRINT: ${core} (t)\n${appBody}`,
    'CHANGELOG.md': `<!-- CHANGELOG_FINGERPRINT: ${core} (t) -->\n${clBody}`,
    [name]: `# Status\n\n${para}`,
  };
};

// ---- the pure module ----
test('integrity.mjs: the TOOLCHAIN map moved in (same five files, same sources) and bump-round no longer defines it', () => {
  assert.deepEqual({ ...I.TOOLCHAIN }, TOOLCHAIN_SOURCES);
  assert.equal(/\bconst TOOLCHAIN\b/.test(text('packages/chicla-kit/src/bump-round.mjs')), false);
  assert.equal(I.PIN_RE.test(`toolchain-digest: ${'a'.repeat(64)}`), true);
});

test('integrity.mjs: still pure after C17.2 (no import, no I/O, no crypto: the caller passes `sha256`)', () => {
  const src = text('packages/chicla-kit/src/integrity.mjs');
  assert.equal(/^\s*import\s/m.test(src), false);
  assert.equal(/node:|createHash|readFileSync|existsSync/.test(src.replace(/^\/\/.*$/gm, '')), false);
});

test('checkIntegrity: a consistent project gives only ok rows, in the order pin, fingerprint (7), lf', () => {
  const rows = I.checkIntegrity(view(fake()), { sha256: sha });
  assert.equal(rows.every((r) => r.ok), true, JSON.stringify(rows.filter((r) => !r.ok)));
  assert.deepEqual(rows.map((r) => r.id), ['pin', ...Array(7).fill('fingerprint'), ...rows.filter((r) => r.id === 'lf').map(() => 'lf')]);
  assert.equal(rows.filter((r) => r.id === 'lf').length > 0, true);
});

test('checkIntegrity: a pin off by one digit fails the pin row and nothing else', () => {
  const bad = (digest()[0] === 'a' ? 'b' : 'a') + digest().slice(1);
  const failed = I.checkIntegrity(view(fake({ pin: bad })), { sha256: sha }).filter((r) => !r.ok);
  assert.deepEqual(failed.map((r) => r.id), ['pin']);
});

test('checkIntegrity: a toolchain file changed after the pin was written fails the pin row', () => {
  const f = fake(); f[TOOLCHAIN_SOURCES['policy.mjs']] = 'changed\n';
  assert.deepEqual(I.checkIntegrity(view(f), { sha256: sha }).filter((r) => !r.ok).map((r) => r.id), ['pin']);
});

test('checkIntegrity: no pin in CLAUDE.md, no CLAUDE.md, or a missing toolchain file: the pin rule is skipped (D-242c), not failed', () => {
  const noPin = fake(); noPin['CLAUDE.md'] = '# rules\n';
  const noClaude = fake(); delete noClaude['CLAUDE.md'];
  const noTool = fake(); delete noTool[TOOLCHAIN_SOURCES['zipkit.mjs']];
  for (const f of [noPin, noClaude, noTool]) assert.equal(I.checkIntegrity(view(f), { sha256: sha }).some((r) => r.id === 'pin'), false);
});

test('checkIntegrity: a CHANGELOG edited after the bump (hash stale) fails a fingerprint row and nothing else', () => {
  const f = fake(); f['CHANGELOG.md'] += 'one more line\n';
  const failed = I.checkIntegrity(view(f), { sha256: sha }).filter((r) => !r.ok);
  assert.deepEqual(failed.map((r) => r.id), ['fingerprint']);
});

test('checkIntegrity: the app file edited after the bump fails a fingerprint row; seq and file= that disagree with the status name fail too', () => {
  const a = fake(); a['version.mjs'] += 'x\n';
  assert.deepEqual(I.checkIntegrity(view(a), { sha256: sha }).filter((r) => !r.ok).map((r) => r.id), ['fingerprint']);
  const b = fake(); delete b['CHICLA_PROJECT_STATUS-7.md']; Object.assign(b, { 'CHICLA_PROJECT_STATUS-8.md': fake()['CHICLA_PROJECT_STATUS-7.md'] });
  assert.equal(I.checkIntegrity(view(b), { sha256: sha }).filter((r) => !r.ok && r.id === 'fingerprint').length >= 1, true);
});

test('checkIntegrity: each of the seven fingerprint rows fails alone when its own leg is the one that is wrong', () => {
  const rows = (f) => I.checkIntegrity(view(f), { sha256: sha, groups: ['state'] });
  const hApp = sha12('export const A = 1;\n'), hCl = sha12('# Changelog\n');
  const edit = (file, from, to) => { const f = fake(); f[file] = f[file].replace(from, to); return f; };
  const st = 'CHICLA_PROJECT_STATUS-7.md', cases = [
    ['version.mjs', /seq=7/, 'seq=9'], ['CHANGELOG.md', /seq=7/, 'seq=9'], [st, /seq=7 · app/, 'seq=9 · app'],
    ['version.mjs', /file=CHICLA_PROJECT_STATUS-7\.md/, 'file=CHICLA_PROJECT_STATUS-6.md'], [st, /app=version\.mjs/, 'app=other.mjs'],
    [st, new RegExp(`app_sha256_12=${hApp}`), 'app_sha256_12=000000000000'], [st, new RegExp(`changelog_sha256_12=${hCl}`), 'changelog_sha256_12=000000000000'],
  ];
  const clFile = ['CHANGELOG.md', /file=CHICLA_PROJECT_STATUS-7\.md/, 'file=CHICLA_PROJECT_STATUS-6.md']; // the CHANGELOG leg of `file=` is row 3 too
  assert.deepEqual(rows(edit(...clFile)).map((x, j) => (x.ok ? null : j)).filter((j) => j !== null), [3]);
  cases.forEach(([file, from, to], i) => {
    const r = rows(edit(file, from, to));
    assert.deepEqual(r.map((x, j) => (x.ok ? null : j)).filter((j) => j !== null), [i], `case ${i}: ${JSON.stringify(r.filter((x) => !x.ok).map((x) => x.label))}`);
  });
});

test('checkIntegrity: two status files is one failing `state` row and no fingerprint rows; none is the same', () => {
  const two = fake(); two['CHICLA_PROJECT_STATUS-6.md'] = 'old\n';
  const rows = I.checkIntegrity(view(two), { sha256: sha });
  assert.deepEqual(rows.filter((r) => !r.ok).map((r) => r.id), ['state']);
  assert.equal(rows.some((r) => r.id === 'fingerprint'), false);
  const none = fake(); delete none['CHICLA_PROJECT_STATUS-7.md'];
  assert.deepEqual(I.checkIntegrity(view(none), { sha256: sha }).filter((r) => !r.ok).map((r) => r.id), ['state']);
});

test('checkIntegrity: no version.mjs (a project or a zip without the app leg) skips the fingerprint rows (D-242c); a malformed one fails with a fingerprint row', () => {
  const noApp = fake(); delete noApp['version.mjs'];
  assert.equal(I.checkIntegrity(view(noApp), { sha256: sha }).some((r) => r.id === 'fingerprint'), false);
  const bad = fake(); bad['version.mjs'] = 'export const A = 1;\n';
  assert.deepEqual(I.checkIntegrity(view(bad), { sha256: sha }).filter((r) => !r.ok).map((r) => r.id), ['fingerprint']);
});

test('checkIntegrity: CRLF in CLAUDE.md fails an lf row; `groups` leaves the others out', () => {
  const f = fake(); f['CLAUDE.md'] = f['CLAUDE.md'].replace(/\n/g, '\r\n');
  assert.deepEqual(I.checkIntegrity(view(f), { sha256: sha }).filter((r) => !r.ok).map((r) => [r.id, r.file]), [['lf', 'CLAUDE.md']]);
  assert.deepEqual([...new Set(I.checkIntegrity(view(fake()), { sha256: sha, groups: ['pin'] }).map((r) => r.id))], ['pin']);
  assert.deepEqual([...new Set(I.checkIntegrity(view(fake()), { sha256: sha, groups: ['lf'] }).map((r) => r.id))], ['lf']);
});

// ---- bump-round --verify keeps its rows (the module is the source, the output is the same) ----
test('bump-round --verify on this tree: the same nine rows, all ok, the CLAUDE.md row last', () => {
  const r = bumpRound({ root: ROOT, mode: 'verify' });
  assert.equal(r.ok, true, JSON.stringify(r.checks?.filter((c) => !c.ok)));
  assert.equal(r.checks.length, 9);
  assert.match(r.checks[0].label, /^toolchain digest [0-9a-f]{12} = the pin/);
  assert.match(r.checks.at(-1).label, /^CLAUDE\.md has LF/);
});

test('shape: bump-round and verify-delivery take their state rules from integrity.mjs, with no copy of the fingerprint regexes', () => {
  const b = text('packages/chicla-kit/src/bump-round.mjs'), v = text('packages/chicla-kit/src/verify-delivery.mjs');
  assert.match(b, /from "\.\/integrity\.mjs"/); assert.match(v, /from "\.\/integrity\.mjs"/);
  assert.match(v, /checkIntegrity/);
  assert.equal(/const FP\s*=|const PARA\s*=/.test(b), false, 'bump-round keeps no copy of FP or PARA');
});

// ---- verify-delivery: the experiment of the plan §2 as a test ----
const T = mkdtempSync(join(tmpdir(), 'chicla-c172-')), proj = join(T, 'proj'), ZIP = join(T, 'new.zip');
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
for (const { path: rel } of parseManifest(text('FILES.manifest'))) {
  if (!existsSync(join(ROOT, rel))) continue;
  mkdirSync(dirname(join(proj, rel)), { recursive: true }); copyFileSync(join(ROOT, rel), join(proj, rel));
}
const made = spawnSync(process.execPath, [join(proj, 'scripts/make-delivery-zip.mjs'), ZIP], { cwd: proj, encoding: 'utf8', maxBuffer: 1 << 28 });
assert.equal(made.status, 0, made.stdout + made.stderr);

/** A variant of the valid zip: `replace` = { name: new text }, `add` = names added (one line each), `out` = where it goes. */
let k = 0;
const variant = ({ replace = {}, add = [] }) => {
  const spec = join(T, `spec${k}.json`), out = join(T, `v${k++}.zip`);
  writeFileSync(spec, JSON.stringify({ replace, add }));
  const code = 'import zipfile,sys,json\nspec=json.load(open(sys.argv[3]))\nzin=zipfile.ZipFile(sys.argv[1]);zout=zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED)\nfor i in zin.infolist(): zout.writestr(i.filename, spec["replace"][i.filename].encode() if i.filename in spec["replace"] else zin.read(i.filename))\nfor n in spec["add"]: zout.writestr(n,"x\\n")\nzout.close()';
  const r = spawnSync(PY, ['-c', code, ZIP, out, spec], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); return out;
};
const problems = (zip) => { const r = verifyDelivery({ zip, root: proj }); return { r, codes: r.problems.map((p) => (p.match(/^(EINTEGRITY_[A-Z]+)/) ?? [])[1]).filter(Boolean) }; };
const claude = () => readFileSync(join(proj, 'CLAUDE.md'), 'utf8');

test('verify-delivery: the valid delivery has no EINTEGRITY problem (the same zip without the fault passes)', () => {
  const { r, codes } = problems(ZIP);
  assert.equal(r.ok, true); assert.deepEqual(codes, []);
});

test('verify-delivery: CRLF in CLAUDE.md is EVERIFY_FAILED with EINTEGRITY_LF', { skip }, () => {
  const { r, codes } = problems(variant({ replace: { 'CLAUDE.md': claude().replace(/\n/g, '\r\n') } }));
  assert.equal(r.code, 'EVERIFY_FAILED'); assert.ok(codes.includes('EINTEGRITY_LF'), r.problems.join('\n'));
});

test('verify-delivery: a pin that differs from the five files in the zip is EINTEGRITY_PIN', { skip }, () => {
  const c = claude(), d = c.match(/toolchain-digest: ([0-9a-f]{64})/)[1];
  const { r, codes } = problems(variant({ replace: { 'CLAUDE.md': c.replace(d, (d[0] === 'a' ? 'b' : 'a') + d.slice(1)) } }));
  assert.equal(r.code, 'EVERIFY_FAILED'); assert.ok(codes.includes('EINTEGRITY_PIN'), r.problems.join('\n'));
});

test('verify-delivery: a CHANGELOG changed after the bump (stale fingerprint) is EINTEGRITY_FINGERPRINT', { skip }, () => {
  const { r, codes } = problems(variant({ replace: { 'CHANGELOG.md': readFileSync(join(proj, 'CHANGELOG.md'), 'utf8') + '\nadded after the bump\n' } }));
  assert.equal(r.code, 'EVERIFY_FAILED'); assert.ok(codes.includes('EINTEGRITY_FINGERPRINT'), r.problems.join('\n'));
});

test('verify-delivery: two status files is EINTEGRITY_STATE', { skip }, () => {
  const { r, codes } = problems(variant({ add: ['CHICLA_PROJECT_STATUS-1.md'] }));
  assert.equal(r.code, 'EVERIFY_FAILED'); assert.ok(codes.includes('EINTEGRITY_STATE'), r.problems.join('\n'));
});

test('verify-delivery: the experiment of the plan §2 (CRLF, a wrong pin and a stale CHANGELOG together) names all three codes', { skip }, () => {
  const c = claude().replace(/\n/g, '\r\n'), d = c.match(/toolchain-digest: ([0-9a-f]{64})/)[1];
  const { r, codes } = problems(variant({ replace: { 'CLAUDE.md': c.replace(d, (d[0] === 'a' ? 'b' : 'a') + d.slice(1)), 'CHANGELOG.md': readFileSync(join(proj, 'CHANGELOG.md'), 'utf8') + '\nx\n' } }));
  assert.equal(r.code, 'EVERIFY_FAILED');
  for (const want of ['EINTEGRITY_LF', 'EINTEGRITY_PIN', 'EINTEGRITY_FINGERPRINT']) assert.ok(codes.includes(want), `${want} in ${r.problems.join('\n')}`);
});

test('verify-delivery: a zip without version.mjs skips the fingerprint rules (D-242c), it is not an EINTEGRITY_FINGERPRINT', { skip }, () => {
  const out = join(T, 'noapp.zip');
  const code = 'import zipfile,sys\nzin=zipfile.ZipFile(sys.argv[1]);zout=zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED)\nfor i in zin.infolist():\n  if i.filename!="version.mjs": zout.writestr(i.filename, zin.read(i.filename))\nzout.close()';
  assert.equal(spawnSync(PY, ['-c', code, ZIP, out], { encoding: 'utf8' }).status, 0);
  const { codes } = problems(out);
  assert.equal(codes.includes('EINTEGRITY_FINGERPRINT'), false);
});

// ---- C18.5 (round 252, D-251a): the four survivors of the kit mutant list (K-INT-33, -36, -37, -41), found by C18.3 ----
test('checkIntegrity: a changelog hash that is wrong only in the CHANGELOG line, or only in the app line, fails row 7 alone (K-INT-33); the app hash likewise fails row 6 alone', () => {
  const rows = (f) => I.checkIntegrity(view(f), { sha256: sha, groups: ['state'] });
  const failedAt = (f) => rows(f).map((x, j) => (x.ok ? null : j)).filter((j) => j !== null);
  const hApp = sha12('export const A = 1;\n'), hCl = sha12('# Changelog\n');
  const edit = (file, from, to) => { const f = fake(); f[file] = f[file].replace(from, to); return f; };
  assert.deepEqual(failedAt(edit('CHANGELOG.md', `changelog_sha256_12=${hCl}`, 'changelog_sha256_12=000000000000')), [6]);
  assert.deepEqual(failedAt(edit('version.mjs', `changelog_sha256_12=${hCl}`, 'changelog_sha256_12=000000000000')), [6]);
  assert.deepEqual(failedAt(edit('CHANGELOG.md', `app_sha256_12=${hApp}`, 'app_sha256_12=000000000000')), [5]);
  assert.deepEqual(failedAt(edit('version.mjs', `app_sha256_12=${hApp}`, 'app_sha256_12=000000000000')), [5]);
});

test('checkIntegrity: two «Fingerprint:» paragraphs in the status file are one failing fingerprint row, not an accepted file (K-INT-36)', () => {
  const f = fake(); f['CHICLA_PROJECT_STATUS-7.md'] += f['CHICLA_PROJECT_STATUS-7.md'].split('\n\n')[1];
  const rows = I.checkIntegrity(view(f), { sha256: sha, groups: ['state'] });
  assert.deepEqual(rows.map((r) => [r.id, r.file, r.ok]), [['fingerprint', 'CHICLA_PROJECT_STATUS-7.md', false]]);
});

test('checkIntegrity: line 3 of the app file and line 1 of the CHANGELOG must carry their own word, not only the shape of the fingerprint (K-INT-37)', () => {
  const app = fake(); app['version.mjs'] = app['version.mjs'].replace('STATUS_FILE_FINGERPRINT', 'SOMETHING_ELSE');
  assert.deepEqual(I.checkIntegrity(view(app), { sha256: sha, groups: ['state'] }).map((r) => [r.id, r.file, r.ok]), [['fingerprint', 'version.mjs', false]]);
  const cl = fake(); cl['CHANGELOG.md'] = cl['CHANGELOG.md'].replace('CHANGELOG_FINGERPRINT', 'SOMETHING_ELSE');
  assert.deepEqual(I.checkIntegrity(view(cl), { sha256: sha, groups: ['state'] }).map((r) => [r.id, r.file, r.ok]), [['fingerprint', 'CHANGELOG.md', false]]);
});

test('checkIntegrity: the caller\'s `appFile` is the app leg: a project whose app file has another name gets its seven rows, all ok (K-INT-41)', () => {
  const f = fake(); f['app.mjs'] = f['version.mjs']; delete f['version.mjs'];
  f['CHICLA_PROJECT_STATUS-7.md'] = f['CHICLA_PROJECT_STATUS-7.md'].replace('app=version.mjs', 'app=app.mjs');
  const rows = I.checkIntegrity(view(f), { sha256: sha, appFile: 'app.mjs', groups: ['state'] });
  assert.equal(rows.length, 7);
  assert.equal(rows.every((r) => r.ok), true, JSON.stringify(rows.filter((r) => !r.ok)));
  assert.equal(I.checkIntegrity(view(f), { sha256: sha, groups: ['state'] }).length, 0, 'with the default app file there is none to read: the rows are skipped');
});
