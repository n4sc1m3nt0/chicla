// C2.4: escape oracle and extraction fuzz.
// The oracle builds a small world (a destination, its parent, a sibling and an "outside" folder holding a secret), runs an
// extraction and compares a snapshot of EVERYTHING outside the destination before and after. It is independent of extractZip:
// it only lstat()s and reads. Assertions use error classes, never message text.
// Fuzz: CHICLA_FUZZ_SEED (default 20261008) and CHICLA_FUZZ_N (default 400) make a failure reproducible; a failing case prints
// its seed, index and entries.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-escape-')); });
after(() => { rmSync(base, { recursive: true, force: true }); });

// Recursive snapshot of `root` (lstat only): relative path -> type + mode + content. `skip` is a relative path whose CONTENTS are ignored.
const snap = (root, skip) => {
  const out = {};
  const walk = (p) => {
    const st = lstatSync(p), rel = relative(root, p) || '.';
    if (st.isSymbolicLink()) { out[rel] = `symlink`; return; }
    if (st.isDirectory()) { out[rel] = `dir`; if (rel === skip) return; for (const c of readdirSync(p).sort()) walk(join(p, c)); return; }
    out[rel] = `file:${(st.mode & 0o777).toString(8)}:${readFileSync(p).toString('hex')}`;
  };
  walk(root); return out;
};
const diff = (a, b) => { const keys = new Set([...Object.keys(a), ...Object.keys(b)]); return [...keys].filter((k) => a[k] !== b[k]).sort(); };

// The world. Layout:  world/{outside/{secret.txt,sub/}, sibling/s.txt, parent/{keep.txt, link-out -> ../outside, out/ (the destination)}}
// `pre` says what the destination holds before: 'none' (absent), 'empty', or 'full' (files, folders and symlinks pointing OUT of it).
const makeWorld = (pre) => {
  const w = join(base, `w${n++}`), parent = join(w, 'parent'), dest = join(parent, 'out'), outside = join(w, 'outside');
  mkdirSync(join(outside, 'sub'), { recursive: true }); writeFileSync(join(outside, 'secret.txt'), 'secret');
  mkdirSync(join(w, 'sibling')); writeFileSync(join(w, 'sibling', 's.txt'), 'sibling');
  mkdirSync(parent); writeFileSync(join(parent, 'keep.txt'), 'keep'); symlinkSync(outside, join(parent, 'link-out'));
  if (pre !== 'none') mkdirSync(dest);
  if (pre === 'full') {
    mkdirSync(join(dest, 'a', 'b'), { recursive: true }); writeFileSync(join(dest, 'a', 'b', 'f.txt'), 'old'); writeFileSync(join(dest, 'a.txt'), 'old');
    symlinkSync(outside, join(dest, 'link')); mkdirSync(join(dest, 'sub')); symlinkSync(outside, join(dest, 'sub', 'link'));
    symlinkSync(join(outside, 'secret.txt'), join(dest, 'sec'));
  }
  return { w, parent, dest, outside };
};

// Runs `extract(dest)` in a world and returns { error, leaked, destChanged, tree }. `leaked` = paths outside the destination that changed.
const runOracle = async (extract, pre) => {
  const { w, dest } = makeWorld(pre), skip = relative(w, dest);
  const outsideBefore = snap(w, skip), destBefore = pre === 'none' ? null : snap(dest);
  let error = null; try { await extract(dest); } catch (e) { error = e; }
  const after = snap(w, skip), leaked = diff(outsideBefore, after).filter((k) => k !== skip && !(pre === 'none' && k === skip));
  let destAfter = null; try { destAfter = snap(dest); } catch { /* absent */ }
  const destChanged = JSON.stringify(destBefore) !== JSON.stringify(destAfter);
  return { error, leaked, destChanged, destBefore, destAfter, w, dest };
};

// ---------- the oracle itself must be able to see a leak (otherwise a green run means nothing) ----------
test('oracle self-check: it reports a file written outside the destination, a modified secret and a leftover temp folder', async () => {
  const leakParent = await runOracle(async (d) => writeFileSync(join(d, '..', 'evil.txt'), 'x'), 'empty');
  assert.ok(leakParent.leaked.includes(join('parent', 'evil.txt')), 'a new file next to the destination');
  const leakSecret = await runOracle(async (d) => writeFileSync(join(d, '..', 'link-out', 'secret.txt'), 'pwned'), 'empty');
  assert.ok(leakSecret.leaked.includes(join('outside', 'secret.txt')), 'a modified file reached through a symlink');
  const leftover = await runOracle(async (d) => mkdirSync(join(d, '..', '.chicla-tmp-left')), 'empty');
  assert.ok(leftover.leaked.includes(join('parent', '.chicla-tmp-left')), 'a temp folder left behind');
  const clean = await runOracle(async () => {}, 'full');
  assert.deepEqual(clean.leaked, []); assert.equal(clean.destChanged, false);
});

// ---------- every outcome is judged the same way ----------
// A zip may succeed or be refused; either way: nothing outside the destination changed, no temp folder remains anywhere,
// the destination holds no symlink that was not there before, and the error (if any) is a ZipError.
const judge = (r, label, expected) => {
  assert.deepEqual(r.leaked, [], `${label}: changed outside the destination`);
  if (r.error) {
    assert.ok(r.error instanceof ZipError, `${label}: error is not a ZipError: ${r.error?.stack}`);
    assert.equal(r.destChanged, false, `${label}: refused but the destination changed: ${JSON.stringify(diff(r.destBefore ?? {}, r.destAfter ?? {}))}`);
  } else if (r.destAfter) {
    for (const [k, v] of Object.entries(r.destAfter)) {
      if (r.destBefore?.[k] === v) continue;
      assert.notEqual(v, 'symlink', `${label}: a symlink appeared in the destination (${k})`);
      assert.ok(expected?.has(k) || !k.split(sep).some((s) => /^\.chicla-tmp-[A-Za-z0-9]{6}$/.test(s)), `${label}: temp folder inside the destination (${k})`); // a zip entry may legitimately be called .chicla-tmp-x
      if (expected) assert.ok(expected.has(k) || k === '.', `${label}: unexpected path in the destination (${k})`);
    }
    for (const k of Object.keys(r.destBefore ?? {})) if (r.destBefore[k] === 'symlink') assert.equal(r.destAfter[k], 'symlink', `${label}: pre-existing symlink ${k} was replaced`);
  }
  if (r.dest) { let real = null; try { real = realpathSync(r.dest); } catch { /* refused and absent */ } if (real) assert.ok(real.startsWith(realpathSync(join(r.dest, '..')) + sep), `${label}: destination resolves outside its parent`); }
};
const expectedPaths = (entries) => { // every prefix of every entry path that is a normal segment sequence
  const s = new Set();
  for (const e of entries) { const segs = String(e.name).split('/').filter((x) => x && x !== '.'); for (let i = 1; i <= segs.length; i++) s.add(segs.slice(0, i).join(sep)); }
  return s;
};
const attack = async (entries, { pre = 'empty', overwrite = false, code } = {}) => {
  const zip = join(base, `z${n++}.zip`); writeFileSync(zip, buildZip(entries));
  const r = await runOracle((d) => extractZip(zip, d, { overwrite }), pre);
  const label = `${pre}/overwrite=${overwrite}/${JSON.stringify(entries.map((e) => e.name))}`;
  judge(r, label, code ? null : expectedPaths(entries));
  if (code) assert.ok(r.error && r.error.code === code, `${label}: expected ${code}, got ${r.error ? r.error.code : 'success'}`);
  return r;
};

// ---------- hostile names: refused whole, nothing written anywhere ----------
const REFUSED = ['../evil.txt', 'a/../../evil.txt', 'a/b/../../../evil.txt', '..', '../', '../out2/x', '../../outside/secret.txt', '../link-out/secret.txt',
  '/abs.txt', '//double.txt', '/', 'C:/x.txt', 'C:evil.txt', 'a\\b.txt', '..\\evil.txt', 'a/..\\..\\evil.txt', 'a\0b.txt', 'a/\0', 'a/../..', 'a/b/../../..'];
for (const name of REFUSED) {
  for (const pre of ['none', 'empty', 'full']) {
    test(`hostile name ${JSON.stringify(name)} (destination: ${pre}): refused with EUNSAFE, nothing changes`, async () => {
      await attack([{ name: 'ok.txt', data: 'fine' }, { name, data: 'pwn' }], { pre, overwrite: true, code: 'EUNSAFE' });
    });
  }
}

// ---------- odd but contained names: they may succeed, and must stay inside ----------
const CONTAINED = ['....//x', '.../x', 'a/./b', 'a//b', 'a.', '..a', 'a..', '.hidden', 'x/.../y', '-rf', 'a b/c d', 'é/ü', 'A.txt', 'a.txt', 'a'.repeat(200), 'a/'.repeat(60) + 'f'];
for (const name of CONTAINED) {
  test(`contained name ${JSON.stringify(name.length > 40 ? name.slice(0, 40) + '…' : name)}: no leak, no symlink, only expected paths`, async () => {
    for (const pre of ['none', 'empty']) await attack([{ name, data: 'v' }], { pre });
  });
}

// ---------- symlinks ----------
test('a symlink entry followed by a file through it: the symlink is never created, the file lands in a real folder', async () => {
  for (const target of ['../outside', '../../outside', '/etc', 'sub', '.']) {
    const r = await attack([{ name: 'link', data: target, mode: 0o120777 }, { name: 'link/pwn.txt', data: 'pwn' }], { pre: 'empty' });
    assert.equal(r.error, null, 'extraction itself is fine'); assert.equal(r.destAfter['link'], 'dir'); assert.equal(r.destAfter[join('link', 'pwn.txt')].startsWith('file:'), true);
  }
});
test('a symlink entry alone is reported in skipped and never created', async () => {
  const zip = join(base, `z${n++}.zip`); writeFileSync(zip, buildZip([{ name: 'l', data: '../outside', mode: 0o120777 }, { name: 'f', data: 'x' }]));
  const r = await runOracle(async (d) => { const res = await extractZip(zip, d); assert.deepEqual(res.skipped.map((s) => s.name), ['l']); }, 'none');
  assert.equal(r.error, null); judge(r, 'symlink alone'); assert.equal(r.destAfter['l'], undefined);
});
test('a symlink ALREADY in the destination, pointing out: writing through it is refused, with and without overwrite', async () => {
  for (const overwrite of [false, true]) {
    for (const name of ['link/pwn.txt', 'link', 'sub/link/pwn.txt', 'sub/link', 'sec']) {
      const r = await attack([{ name: 'fresh.txt', data: 'new' }, { name, data: 'pwn' }], { pre: 'full', overwrite, code: 'EUNSAFE' });
      assert.equal(readFileSync(join(r.w, 'outside', 'secret.txt'), 'utf8'), 'secret');
      assert.deepEqual(readdirSync(join(r.w, 'outside')).sort(), ['secret.txt', 'sub']);
    }
  }
});
test('a folder entry over a symlink already in the destination is refused too', async () => {
  for (const overwrite of [false, true]) await attack([{ name: 'link/', dir: true }, { name: 'link/f', data: 'x' }], { pre: 'full', overwrite, code: 'EUNSAFE' });
});

// ---------- names the file system cannot hold: an error the caller can handle, never a raw fs error (found by the fuzz, seed 20261008 i=64) ----------
test('a folder or file name longer than the file system allows: ZipError, nothing left behind', async () => {
  const long = 'q'.repeat(300);
  for (const name of [`${long}/f.txt`, `d/${long}/f.txt`, `${long}`, `d/${long}`, `${long}/`]) {
    for (const pre of ['none', 'empty']) {
      const r = await attack([{ name: 'ok.txt', data: 'fine' }, { name, data: 'x' }], { pre });
      assert.ok(r.error instanceof ZipError, `${name.slice(0, 12)}…: expected a ZipError, got ${r.error?.constructor?.name}`);
      assert.equal(r.destChanged, false);
    }
  }
});

// ---------- failure halfway never leaks either ----------
test('a bad CRC after files that were already extracted: nothing outside, nothing inside, no temp folder', async () => {
  const entries = [{ name: 'one.txt', data: '1' }, { name: 'd/two.txt', data: '2', method: 8 }, { name: 'd/bad.txt', data: '3', crc: 1 }];
  for (const pre of ['none', 'empty', 'full']) {
    const r = await attack(entries, { pre, overwrite: true });
    assert.ok(r.error instanceof ZipError, 'the bad CRC must be refused'); assert.equal(r.destChanged, false);
  }
});

// ---------- fuzz ----------
const prng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SEGS = ['a', 'b', 'c', 'sub', 'link', 'sec', 'a.txt', '..', '.', '', '...', 'A', 'é', 'e\u0301', 'x\\y', 'C:', '\0', 'q'.repeat(300), 'out', '-', ' ', '.chicla-tmp-x'];
const KINDS = [
  () => ({}), () => ({ method: 8 }), () => ({ dir: true }), () => ({ mode: 0o120777, dataIsTarget: true }), () => ({ mode: 0o010644 }),
  () => ({ crc: 0xdeadbeef }), () => ({ flags: 1 }), () => ({ methodField: 12 }), () => ({ usize: 1 << 20 }), () => ({ mode: 0o100000 }), () => ({ mode: 0o040000, dir: true }),
];
const fuzzEntries = (rnd) => {
  const pick = (a) => a[Math.floor(rnd() * a.length)], out = [], count = 1 + Math.floor(rnd() * 8);
  for (let i = 0; i < count; i++) {
    const depth = 1 + Math.floor(rnd() * 4); let name = Array.from({ length: depth }, () => pick(SEGS)).join('/');
    const k = pick(KINDS)(); if (k.dir && !name.endsWith('/')) name += '/';
    const e = { name, data: k.dataIsTarget ? pick(['../outside', '/etc', 'a', '..']) : `d${i}`, ...k }; delete e.dataIsTarget; out.push(e);
  }
  return out;
};
test('fuzz: random hostile zips against random destinations never leak, never throw anything but ZipError, and refusals change nothing', async () => {
  const seed = Number(process.env.CHICLA_FUZZ_SEED ?? 20261008), N = Number(process.env.CHICLA_FUZZ_N ?? 400), rnd = prng(seed);
  let ok = 0, refused = 0;
  for (let i = 0; i < N; i++) {
    const entries = fuzzEntries(rnd), pre = ['none', 'empty', 'full'][Math.floor(rnd() * 3)], overwrite = rnd() < 0.5;
    const zip = join(base, `fz${i}.zip`); writeFileSync(zip, buildZip(entries));
    const r = await runOracle((d) => extractZip(zip, d, { overwrite }), pre);
    const label = `seed=${seed} i=${i} pre=${pre} overwrite=${overwrite} entries=${JSON.stringify(entries.map((e) => ({ ...e, data: undefined })))}`;
    judge(r, label, r.error ? null : expectedPaths(entries));
    if (r.error) refused++; else ok++;
    rmSync(zip, { force: true }); rmSync(r.w, { recursive: true, force: true });
  }
  assert.ok(ok > 0 && refused > 0, `the fuzz must exercise both outcomes (ok=${ok}, refused=${refused})`);
});
