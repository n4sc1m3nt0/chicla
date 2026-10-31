// C18.3 (round 251, D141, AUDIT-5 F-3): the hand mutants of the kit become a list that `scripts/mutants.mjs` can run again. First slice: `integrity.mjs`.
// Written before the list; red until `packages/chicla-kit/mutants/list.mjs` and the `mutants:kit` script exist. These tests check the SHAPE and the anchors of the list
// (cheap, part of `npm test`); that each mutant really turns a test red is what `npm run mutants:kit` proves, once per round that touches the module (item 20 c).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const LIST = 'packages/chicla-kit/mutants/list.mjs';
const mod = existsSync(join(root, LIST)) ? await import(pathToFileURL(join(root, LIST)).href) : null;
const list = mod?.default;

test('the kit list exists, is an array, and the first slice has the 26 mutants of integrity.mjs', () => {
  assert.ok(mod, `${LIST} is missing`);
  assert.ok(Array.isArray(list), 'the default export is an array');
  assert.ok(list.length >= 26, `at least 26 entries (found ${list.length})`);
  assert.ok(list.filter((m) => m.file === 'packages/chicla-kit/src/integrity.mjs').length >= 26, 'at least 26 of them target integrity.mjs');
});

test('every entry has the shape scripts/mutants.mjs reads, a unique id, and a real change', () => {
  const seen = new Set();
  for (const m of list ?? []) {
    for (const k of ['id', 'file', 'find', 'why']) assert.ok(typeof m[k] === 'string' && m[k], `${m.id ?? '?'}: ${k}`);
    assert.equal(typeof m.replace, 'string', `${m.id}: replace (may be empty: a deletion)`);
    assert.ok(Array.isArray(m.tests) && m.tests.length > 0 && m.tests.every((t) => typeof t === 'string' && t), `${m.id}: tests`);
    assert.ok(!seen.has(m.id), `duplicate id ${m.id}`);
    seen.add(m.id);
    assert.match(m.id, /^K-[A-Z0-9]+-\d+$/, `${m.id}: ids of the kit list look like K-INT-01`);
    assert.notEqual(m.find, m.replace, `${m.id}: find and replace are the same`);
    if (m.survives !== undefined) assert.ok(typeof m.survives === 'string' && m.survives, `${m.id}: survives is a reason`);
  }
});

test('every `find` occurs exactly once in its file, and the file and the tests exist (a stale anchor is caught here, not rounds later)', () => {
  for (const m of list ?? []) {
    assert.ok(m.file.startsWith('packages/chicla-kit/src/') || ['scripts/archive-changelog.mjs', 'scripts/build-chicla.mjs', 'scripts/pack-release.mjs', 'scripts/win-quote.mjs', 'scripts/failure-reason.mjs'].includes(m.file), `${m.id}: the kit list mutates kit sources and five scripts only (archive-changelog; since C25.3 build-chicla, pack-release, win-quote; since C25.4 failure-reason)`);
    assert.ok(existsSync(join(root, m.file)), `${m.id}: ${m.file} does not exist`);
    const n = read(m.file).split(m.find).length - 1;
    assert.equal(n, 1, `${m.id}: find occurs ${n} times in ${m.file}, must be exactly once`);
    for (const t of m.tests) {
      assert.match(t, /^(packages\/chicla-kit\/test|test)\/[^/]+\.test\.mjs$/, `${m.id}: ${t}`);
      assert.ok(existsSync(join(root, t)), `${m.id}: test file ${t} does not exist`);
    }
  }
});

test('every mutated file still parses (a syntax error would be a fake red, which mutants.mjs reports as INVALID)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chicla-kitlist-'));
  try {
    for (const m of list ?? []) {
      const f = join(dir, `${m.id}.mjs`);
      writeFileSync(f, read(m.file).replace(m.find, () => m.replace));
      const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
      assert.equal(r.status, 0, `${m.id}: the mutated file does not parse`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('every rule of integrity.mjs is covered: each exported function has a mutant inside it', () => {
  const src = read('packages/chicla-kit/src/integrity.mjs');
  const starts = [...src.matchAll(/^export (?:function|const) (\w+)/gm)].map((x) => ({ name: x[1], at: x.index }));
  const need = ['STATUS_FILE_RE', 'LF_FILES', 'checkLf', 'TOOLCHAIN', 'PIN_RE', 'FP', 'PARA', 'tailFrom', 'toolchainDigest', 'checkPin', 'checkState', 'checkIntegrity'];
  for (const name of need) {
    const i = starts.findIndex((s) => s.name === name);
    assert.ok(i >= 0, `${name} is not exported any more: update this list`);
    const lo = starts[i].at, hi = i + 1 < starts.length ? starts[i + 1].at : src.length;
    assert.ok((list ?? []).some((m) => { const p = src.indexOf(m.find); return p >= lo && p < hi; }), `no mutant inside ${name}`);
  }
});

test('npm run mutants:kit runs the list on the whole tree (the kit tests read the project root, so a copy of the package alone is not enough)', () => {
  const s = JSON.parse(read('package.json')).scripts['mutants:kit'];
  assert.equal(typeof s, 'string', 'the script mutants:kit is missing');
  assert.match(s, /scripts\/mutants\.mjs/);
  assert.match(s, /--pkg \./);
  assert.match(s, /--list packages\/chicla-kit\/mutants\/list\.mjs/);
});

test('the list is a development file: chicla-kit does not publish it, and the zip list is untouched', () => {
  const kit = JSON.parse(read('packages/chicla-kit/package.json'));
  assert.ok(!kit.files.some((f) => /mutants/.test(f)), '`files` of chicla-kit must not name mutants');
  assert.equal(JSON.parse(read('package.json')).scripts.mutants, 'node scripts/mutants.mjs');
});

// C19.5 slice 1 (round 261, AUDIT-6 F-5): `check-manifest.mjs`, ids K-CMN-01 and up. The shape, the anchors and the parse are held by the tests above; these two hold the slice itself.
test('slice 7 (C19.5): at least 16 mutants target check-manifest.mjs, ids K-CMN-, and every one names a test file that exists', () => {
  const cm = (list ?? []).filter((m) => m.file === 'packages/chicla-kit/src/check-manifest.mjs');
  assert.ok(cm.length >= 16, `at least 16 entries on check-manifest.mjs (found ${cm.length})`);
  for (const m of cm) assert.match(m.id, /^K-CMN-\d+$/, `${m.id}: ids of this slice are K-CMN-nn`);
  assert.ok(cm.some((m) => m.tests.some((t) => /check-manifest/.test(t))), 'a core or CLI test of check-manifest is among the tests');
});

test('every exported function of check-manifest.mjs has a mutant inside it, and the rules of the walk, the LF check, the collisions and the lost files each have one', () => {
  const src = read('packages/chicla-kit/src/check-manifest.mjs');
  const starts = [...src.matchAll(/^export (?:function|const) (\w+)/gm)].map((x) => ({ name: x[1], at: x.index }));
  for (let i = 0; i < starts.length; i++) {
    const lo = starts[i].at, hi = i + 1 < starts.length ? starts[i + 1].at : src.length;
    assert.ok((list ?? []).some((m) => m.file.endsWith('/check-manifest.mjs') && (() => { const p = src.indexOf(m.find); return p >= lo && p < hi; })()), `no mutant inside ${starts[i].name}`);
  }
  const text = (list ?? []).filter((m) => m.file.endsWith('/check-manifest.mjs')).map((m) => m.find).join('\n');
  for (const rule of ['SKIP_FILES', 'tsbuildinfo', 'isSymbolicLink', 'policySkips', 'policyAllows', 'skip:', 'nfc(f)', 'statusNow.length', 'EMANIFEST_LOST']) {
    assert.ok(text.includes(rule), `no mutant touches «${rule}»`);
  }
});

// C19.5 slice 2 (round 263, AUDIT-6 F-5): `verify-delivery.mjs`, ids K-VER-01 and up; the last slice of the card.
test('slice 8 (C19.5): at least 15 mutants target verify-delivery.mjs, ids K-VER-, and every one names a test file that exists', () => {
  const vd = (list ?? []).filter((m) => m.file === 'packages/chicla-kit/src/verify-delivery.mjs');
  assert.ok(vd.length >= 15, `at least 15 entries on verify-delivery.mjs (found ${vd.length})`);
  for (const m of vd) assert.match(m.id, /^K-VER-\d+$/, `${m.id}: ids of this slice are K-VER-nn`);
  assert.ok(vd.some((m) => m.tests.some((t) => /core-verify-delivery/.test(t))), 'the core test of verify-delivery is among the tests');
});

test('every exported function of verify-delivery.mjs has a mutant inside it, and the rules of the header each have one', () => {
  const src = read('packages/chicla-kit/src/verify-delivery.mjs');
  const starts = [...src.matchAll(/^export (?:function|const) (\w+)/gm)].map((x) => ({ name: x[1], at: x.index }));
  assert.ok(starts.length >= 3, 'gitRmLine, verifyDelivery and renderVerifyDelivery');
  for (let i = 0; i < starts.length; i++) {
    const lo = starts[i].at, hi = i + 1 < starts.length ? starts[i + 1].at : src.length;
    assert.ok((list ?? []).some((m) => m.file.endsWith('/verify-delivery.mjs') && (() => { const p = src.indexOf(m.find); return p >= lo && p < hi; })()), `no mutant inside ${starts[i].name}`);
  }
  const all = (list ?? []).filter((m) => m.file.endsWith('/verify-delivery.mjs'));
  const text = all.map((m) => m.find).join('\n');
  for (const rule of ['package.json', 'tsbuildinfo', 'prior !== trueName', '0x800', 'detectSecret', 'z.crc32', 'listedSet', 'haveSet', 'CHANGELOG.md', 'm[1] !== n', 'allowSet', 'STATUS_FILE_RE', 'leftAll', 'GIT_RM_MAX', 'out.length', 'crc32(out)', '0xffff']) {
    assert.ok(text.includes(rule), `no mutant touches «${rule}»`);
  }
});

// C19.7 (round 264): the survivors of slice 8 are closed; the one that stays is explained, not a gap.
test('slice 8 after C19.7: the only K-VER entry that still survives is K-VER-25, with a reason that says it is equivalent', () => {
  const vd = (list ?? []).filter((m) => m.file === 'packages/chicla-kit/src/verify-delivery.mjs');
  assert.deepEqual(vd.filter((m) => m.survives).map((m) => m.id), ['K-VER-25']);
  assert.match(vd.find((m) => m.id === 'K-VER-25').survives, /equivalent/);
  assert.ok(vd.some((m) => m.tests.includes('packages/chicla-kit/test/core-verify-delivery-gaps.test.mjs')), 'the new gap tests are named by the entries they close');
});
