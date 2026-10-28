// C19.7 (round 264, D-263a, AUDIT-6 F-5): the gaps that the kit mutants of `verify-delivery.mjs` (round 263) showed: K-VER-02, -04, -05, -06, -11 to -14, -20, -21, -24.
// (`K-VER-25` is explained, not tested: with a zip64 count of 0xffff the verifier answers EZIP_UNREADABLE either way; only the wording differs.)
// One valid delivery is made once by the real writer in a copy of this tree; every variant is then BUILT here, entry by entry, with the independent zip fabricator of
// chicla-zip's tests (no Python, never the code under test), so each variant is wrong in exactly one way. Tests look for the problem line that starts with the rule's own words
// or code, never for the whole text.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZip, unicodePathExtra } from '../../chicla-zip/test/zipfab.mjs';
import { importPinned } from '../../../test/toolchain-files.mjs';
import { verifyDelivery, renderVerifyDelivery } from '../src/verify-delivery.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const T = mkdtempSync(join(tmpdir(), 'chicla-c197-')), proj = join(T, 'proj');
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
for (const { path: rel } of parseManifest(readFileSync(join(ROOT, 'FILES.manifest'), 'utf8'))) {
  if (!existsSync(join(ROOT, rel))) continue;
  mkdirSync(dirname(join(proj, rel)), { recursive: true }); copyFileSync(join(ROOT, rel), join(proj, rel));
}
const made = spawnSync(process.execPath, [join(proj, 'scripts/make-delivery-zip.mjs'), join(T, 'real.zip')], { cwd: proj, encoding: 'utf8', maxBuffer: 1 << 28 });
assert.equal(made.status, 0, made.stdout + made.stderr);
// the files of the delivery, by name: what the manifest the writer just regenerated lists, plus the manifest itself
const base = new Map([['FILES.manifest', readFileSync(join(proj, 'FILES.manifest'))]]);
for (const { path: rel } of parseManifest(readFileSync(join(proj, 'FILES.manifest'), 'utf8'))) base.set(rel, readFileSync(join(proj, rel)));

let n = 0;
/** Builds a zip from `files` (a Map name → bytes, deflated) plus `extra` raw entries, and verifies it. */
const check = (files, { extra = [], against = [] } = {}) => {
  const zip = join(T, `v${n++}.zip`);
  writeFileSync(zip, buildZip([...[...files].map(([name, data]) => ({ name, data, method: 8 })), ...extra]));
  return verifyDelivery({ zip, against, root: proj });
};
const zipOf = (files, extra = []) => { const p = join(T, `u${n++}.zip`); writeFileSync(p, buildZip([...[...files].map(([name, data]) => ({ name, data, method: 8 })), ...extra])); return p; };
const has = (r, start) => r.problems.some((p) => p.startsWith(start));
const without = (...names) => new Map([...base].filter(([k]) => !names.includes(k)));
const first = (re) => [...base.keys()].find((k) => re.test(k));

test('the variants below start from a delivery that verifies: ok, no problems', () => {
  const r = check(base);
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.deepEqual(r.problems, []);
});

test('K-VER-02: a `*.tsbuildinfo` file inside the zip is junk', () => {
  const r = check(base, { extra: [{ name: 'packages/x/tsconfig.tsbuildinfo', data: 'x', method: 8 }] });
  assert.ok(has(r, 'junk inside the zip'), JSON.stringify(r.problems));
});

test('K-VER-04: a zip whose files all sit in one folder (a wrapper) says package.json is not at the root', () => {
  const wrapped = new Map([...base].map(([k, v]) => [`wrapper/${k}`, v]));
  const r = check(wrapped);
  assert.equal(r.ok, false);
  assert.ok(has(r, 'package.json is not at the ROOT'), JSON.stringify(r.problems));
});

test('K-VER-05: the same name twice in one zip is not an NFC/NFD collision (the pair must DIFFER)', () => {
  const dup = { name: 'README.md', data: base.get('README.md'), method: 8 };
  const r = check(base, { extra: [dup] });
  assert.ok(!has(r, 'EZIP_COLLISION'), JSON.stringify(r.problems));
});

test('K-VER-06: a Unicode Path field with the wrong crc32 is not trusted: the entry keeps its raw name', () => {
  const raw = Buffer.from('docs/real-name.txt');
  const r = check(base, { extra: [{ name: raw, data: 'x', method: 8, extra: unicodePathExtra(raw, 'docs/other-name.txt', { crc: 1 }) }] });
  const line = r.problems.find((p) => p.includes('outside FILES.manifest'));
  assert.ok(line, JSON.stringify(r.problems));
  assert.ok(line.includes('docs/real-name.txt') && !line.includes('other-name'), line);
});

test('K-VER-11: a file in the zip that FILES.manifest does not list is a problem of its own', () => {
  const r = check(base, { extra: [{ name: 'stray-file.txt', data: 'x', method: 8 }] });
  assert.ok(r.problems.some((p) => /outside FILES\.manifest/.test(p) && p.includes('stray-file.txt')), JSON.stringify(r.problems));
});

test('K-VER-12: a file that the baseline lists and the zip lacks is named «in the baseline, not in the zip»', () => {
  const gone = first(/^README\.md$/);
  const r = check(without(gone));
  assert.ok(r.problems.some((p) => p.startsWith('EBASELINE_MISMATCH') && p.includes(`${gone} (in the baseline, not in the zip)`)), JSON.stringify(r.problems));
});

test('K-VER-13: a zip without CHANGELOG.md says so', () => {
  const r = check(without('CHANGELOG.md'));
  assert.ok(has(r, 'CHANGELOG.md is missing from the zip'), JSON.stringify(r.problems));
});

test('K-VER-14: a status file whose number is not the seq= of the CHANGELOG fingerprint is a problem of its own', () => {
  const st = first(/^CHICLA_PROJECT_STATUS-\d+\.md$/), files = new Map([...base].map(([k, v]) => [k === st ? 'CHICLA_PROJECT_STATUS-99999.md' : k, v]));
  const r = check(files);
  assert.ok(r.problems.some((p) => /^the status file is -99999 but the CHANGELOG fingerprint says seq=\d+/.test(p)), JSON.stringify(r.problems));
});

test('K-VER-20: an --against zip with SEVERAL top folders is compared by its own paths, not unwrapped', () => {
  const prev = zipOf(new Map(), [{ name: 'alpha/one.txt', data: 'x', method: 8 }, { name: 'beta/two.txt', data: 'y', method: 8 }]);
  const r = check(base, { against: [prev] });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('alpha/one.txt') && p.includes('beta/two.txt')), JSON.stringify(r.problems));
});

test('K-VER-21: the __MACOSX folder of an --against upload does not stop its single wrapper from being removed', () => {
  const wrapped = new Map([...base].map(([k, v]) => [`old-round/${k}`, v]));
  const prev = zipOf(wrapped, [{ name: '__MACOSX/old-round/._package.json', data: 'x', method: 8 }]);
  const r = check(base, { against: [prev] });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.ok(!r.problems.some((p) => p.includes('NO LONGER')), JSON.stringify(r.problems));
});

test('K-VER-24: renderVerifyDelivery puts each message on its own line, per stream', () => {
  const out = renderVerifyDelivery({ messages: [{ stream: 'out', text: 'a' }, { stream: 'err', text: 'b' }, { stream: 'out', text: 'c' }] });
  assert.deepEqual(out, { out: 'a\nc\n', err: 'b\n' });
});
