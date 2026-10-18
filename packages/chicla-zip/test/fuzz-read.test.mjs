// C5.1: read fuzz. Thousands of byte-level mutations of VALID zips go through openZip, read, testZip and extractZip.
// Contract under test: the only thing that may come out is a ZipError (or success); no hang, no huge allocation (a case that takes
// more than CASE_MS fails), nothing written outside the destination, and a refused extraction leaves the destination as it was.
// Oracle: independent of the code under test (lstat and read only; zips built by zipfab.mjs, which has its own CRC).
// The loop runs in a child process with a wall-clock limit, so a hang is a red test, not a stuck suite.
// CHICLA_FUZZ_READ_SEED (default 20261009) and CHICLA_FUZZ_READ_N (default 1500) reproduce a failure; it prints seed, index and the mutations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openZip, testZip, extractZip, ZipError } from '../src/zipkit.mjs';
import { buildZip } from './zipfab.mjs';

const SELF = fileURLToPath(import.meta.url);
const CASE_MS = 3000;

// ---------- seeds: valid zips of different shapes ----------
const text = (n) => 'hello chicla '.repeat(n);
const SEEDS = {
  plain: () => buildZip([{ name: 'a.txt', data: 'alpha' }, { name: 'b.txt', data: text(40), method: 8 }]),
  tree: () => buildZip([{ name: 'd/', dir: true }, { name: 'd/x.txt', data: text(30), method: 8 }, { name: 'd/e/y.bin', data: Buffer.from([0, 1, 2, 255]) }, { name: 'z.txt', data: '' }]),
  names: () => buildZip([{ name: 'caf\u00e9.txt', data: 'x', flags: 0x800 }, { name: Buffer.from([0x63, 0x61, 0x66, 0x82, 0x2e, 0x74]), data: 'y' }, { name: 'e\u0301.txt', data: 'z' }]),
  zip64: () => buildZip([{ name: 'big.txt', data: text(20), method: 8, zip64: {} }, { name: 'p.txt', data: 'p', zip64: { fields: ['offset'] } }], { zip64Eocd: true }),
  special: () => buildZip([{ name: 'ln', data: 'a', mode: 0o120777 }, { name: 'pipe', data: '', mode: 0o010644 }, { name: 'ok.txt', data: 'ok' }]),
};

// ---------- mutations ----------
const prng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SIGS = [0x04034b50, 0x02014b50, 0x06054b50, 0x06064b50, 0x07064b50];
const sigOffsets = (b) => { const o = []; for (let i = 0; i + 4 <= b.length; i++) if (SIGS.includes(b.readUInt32LE(i))) o.push(i); return o; };
const MUTATORS = {
  bitflip: (b, r) => { const c = Buffer.from(b), i = Math.floor(r() * c.length); c[i] ^= 1 << Math.floor(r() * 8); return [c, `bitflip@${i}`]; },
  byte: (b, r) => { const c = Buffer.from(b), i = Math.floor(r() * c.length), v = Math.floor(r() * 256); c[i] = v; return [c, `byte@${i}=${v}`]; },
  // a 16- or 32-bit field near a header signature set to an edge value: where the size, count and offset fields live
  field: (b, r) => { const c = Buffer.from(b), s = sigOffsets(c); if (!s.length) return [c, 'field:none']; const at = s[Math.floor(r() * s.length)], i = Math.min(c.length - 4, at + Math.floor(r() * 56)), v = [0, 1, 0xffff, 0x7fffffff, 0x80000000, 0xffffffff, c.length, c.length + 1][Math.floor(r() * 8)]; c.writeUInt32LE(v >>> 0, i); return [c, `field@${i}=${v}`]; },
  truncate: (b, r) => { const n = Math.floor(r() * b.length); return [b.subarray(0, n), `truncate@${n}`]; },
  cut: (b, r) => { const i = Math.floor(r() * b.length), n = Math.floor(r() * 40); return [Buffer.concat([b.subarray(0, i), b.subarray(i + n)]), `cut@${i}+${n}`]; },
  insert: (b, r) => { const i = Math.floor(r() * b.length), n = 1 + Math.floor(r() * 40), junk = Buffer.from(Array.from({ length: n }, () => Math.floor(r() * 256))); return [Buffer.concat([b.subarray(0, i), junk, b.subarray(i)]), `insert@${i}+${n}`]; },
  dup: (b, r) => { const i = Math.floor(r() * b.length), n = 1 + Math.floor(r() * 60), j = Math.floor(r() * b.length); return [Buffer.concat([b.subarray(0, j), b.subarray(i, i + n), b.subarray(j)]), `dup ${i}+${n}@${j}`]; },
  zero: (b, r) => { const c = Buffer.from(b), i = Math.floor(r() * c.length), n = 1 + Math.floor(r() * 30); c.fill(0, i, Math.min(c.length, i + n)); return [c, `zero@${i}+${n}`]; },
};
const NAMES = Object.keys(MUTATORS);
const mutate = (seedBuf, r) => { let b = seedBuf; const log = [], k = 1 + Math.floor(r() * 4); for (let j = 0; j < k; j++) { const m = NAMES[Math.floor(r() * NAMES.length)]; const [nb, d] = MUTATORS[m](b, r); b = nb; log.push(d); } return [b, log]; };

// ---------- oracle ----------
const snap = (root, skip) => {
  const out = {};
  const walk = (p) => {
    const st = lstatSync(p), rel = relative(root, p).split(sep).join('/') || '.';
    if (st.isSymbolicLink()) { out[rel] = 'symlink'; return; }
    if (st.isDirectory()) { out[rel] = 'dir'; if (rel === skip) return; for (const c of readdirSync(p).sort()) walk(join(p, c)); return; }
    out[rel] = `file:${(st.mode & 0o777).toString(8)}:${readFileSync(p).toString('hex')}`;
  };
  walk(root); return out;
};
const diff = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort();
const okError = (e) => e instanceof ZipError && typeof e.code === 'string';

// Windows: an antivirus or the indexer may hold a file of the case for a moment, and Node 18's rmSync then fails with ENOTEMPTY (CI, 2026-10-17, windows 18). The test's own cleanup retries, like the library's rmBounded (C14.3 b).
const RM = { recursive: true, force: true, maxRetries: 8, retryDelay: 25 };
const fuzzLoop = async () => {
  const seed = Number(process.env.CHICLA_FUZZ_READ_SEED ?? 20261009), N = Number(process.env.CHICLA_FUZZ_READ_N ?? 1500), rnd = prng(seed);
  const base = mkdtempSync(join(tmpdir(), 'chicla-zip-fuzzread-')), seeds = Object.entries(SEEDS).map(([k, f]) => [k, f()]);
  const outcome = { open: 0, openFail: 0, extractOk: 0, extractFail: 0 };
  try {
    for (let i = 0; i < N; i++) {
      const [sname, sbuf] = seeds[i % seeds.length], [bytes, log] = mutate(sbuf, rnd);
      const label = `seed=${seed} i=${i} from=${sname} mutations=${log.join(',')}`;
      const w = join(base, `w${i}`), parent = join(w, 'parent'), dest = join(parent, 'out'), outside = join(w, 'outside');
      mkdirSync(join(outside, 'sub'), { recursive: true }); writeFileSync(join(outside, 'secret.txt'), 'secret');
      mkdirSync(parent); writeFileSync(join(parent, 'keep.txt'), 'keep'); symlinkSync(outside, join(parent, 'link-out')); mkdirSync(dest);
      const zip = join(w, 'f.zip'); writeFileSync(zip, bytes);
      const before = snap(w, 'parent/out'), t0 = Date.now(), guard = (e, what) => { if (!okError(e)) throw new Error(`${label}: ${what} threw a non-ZipError: ${e?.stack ?? e}`); };
      try {
        let z; try { z = openZip(zip); outcome.open++; } catch (e) { guard(e, 'openZip'); outcome.openFail++; }
        if (z) { try { for (const e of z.entries) { try { z.read(e.name, { maxBytes: 1 << 20 }); } catch (err) { guard(err, `read(${JSON.stringify(e.name)})`); } } } finally { z.close(); } }
        try { await testZip(zip); } catch (e) { guard(e, 'testZip'); }
        const destBefore = snap(dest);
        try { await extractZip(zip, dest, { overwrite: true, maxTotalBytes: 1 << 26 }); outcome.extractOk++; } catch (e) { guard(e, 'extractZip'); outcome.extractFail++; assert.deepEqual(diff(destBefore, snap(dest)), [], `${label}: a refused extraction changed the destination`); }
      } catch (e) { if (e instanceof assert.AssertionError || /non-ZipError/.test(e?.message ?? '')) throw e; throw new Error(`${label}: ${e?.stack ?? e}`); }
      assert.ok(Date.now() - t0 < CASE_MS, `${label}: took ${Date.now() - t0} ms (limit ${CASE_MS})`);
      const leaked = diff(before, snap(w, 'parent/out')); assert.deepEqual(leaked, [], `${label}: changed outside the destination: ${leaked.join(', ')}`);
      rmSync(w, RM);
    }
  } finally { rmSync(base, RM); }
  console.log(`FUZZ_READ_OUTCOME ${JSON.stringify(outcome)}`);
};

if (process.env.CHICLA_FUZZ_READ_CHILD) {
  fuzzLoop().then(() => process.exit(0), (e) => { console.error(`FUZZ_READ_FAIL ${e?.message ?? e}`); process.exit(1); });
} else {
  // ---------- must-refuse: single targeted corruptions where SUCCESS would be wrong (the fuzz cannot assert that) ----------
  // Each case patches one field of a valid two-file zip. The expected outcome is a ZipError from every entry point that touches the
  // damage, and an untouched destination. Found by mutation (C5.1): a wrong local signature and a central entry whose name, extra or
  // comment length runs past the directory were accepted by every earlier test.
  const lastCentral = (b) => { let at = -1; for (let i = 0; i + 4 <= b.length; i++) if (b.readUInt32LE(i) === 0x02014b50) at = i; return at; };
  const eocdAt = (b) => b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const TWO = () => buildZip([{ name: 'a.txt', data: 'alpha' }, { name: 'b.txt', data: 'beta' }]);
  const REFUSE = {
    'local signature of the first entry is wrong': { patch: (b) => b.writeUInt32LE(0x12345678, 0), at: 'read' },
    'local header offset of the last entry is past the end of the file': { patch: (b) => b.writeUInt32LE(b.length + 10, lastCentral(b) + 42), at: 'open' },
    'compressed size of the last entry runs past the end of the file': { patch: (b) => { const c = lastCentral(b); b.writeUInt32LE(0x7ffffff0, c + 20); b.writeUInt32LE(0x7ffffff0, c + 24); }, at: 'open' },
    'name length of the last central entry runs past the directory': { patch: (b) => b.writeUInt16LE(0xffff, lastCentral(b) + 28), at: 'open' },
    'extra length of the last central entry runs past the directory': { patch: (b) => b.writeUInt16LE(0xffff, lastCentral(b) + 30), at: 'open' },
    'comment length of the last central entry runs past the directory': { patch: (b) => b.writeUInt16LE(0xffff, lastCentral(b) + 32), at: 'open' },
    'central directory offset is past the end of the file': { patch: (b) => b.writeUInt32LE(b.length, eocdAt(b) + 16), at: 'open' },
    'entry count is larger than the directory can hold': { patch: (b) => { const e = eocdAt(b); b.writeUInt16LE(0xfff0, e + 8); b.writeUInt16LE(0xfff0, e + 10); }, at: 'open' },
  };
  for (const [name, { patch, at }] of Object.entries(REFUSE)) {
    test(`must refuse: ${name}`, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'chicla-zip-refuse-')), dest = join(dir, 'out'), zip = join(dir, 'f.zip');
      try {
        const b = TWO(); patch(b); writeFileSync(zip, b); mkdirSync(dest);
        const refused = (e) => e instanceof ZipError && typeof e.code === 'string';
        if (at === 'open') assert.throws(() => openZip(zip), refused, 'openZip must refuse');
        else {
          const z = openZip(zip);
          try { assert.ok(z.entries.some((e) => e.name === 'a.txt' || e.name === 'b.txt')); assert.throws(() => { for (const e of z.entries) z.read(e.name); }, refused, 'read must refuse'); } finally { z.close(); }
        }
        await assert.rejects(() => testZip(zip), refused, 'testZip must refuse');
        await assert.rejects(() => extractZip(zip, dest), refused, 'extractZip must refuse');
        assert.deepEqual(readdirSync(dest), [], 'a refused extraction creates nothing');
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });
  }

  test('fuzz: mutated valid zips only ever give success or ZipError, never a hang, a leak or a partial extraction', () => {
    const r = spawnSync(process.execPath, [SELF], { env: { ...process.env, CHICLA_FUZZ_READ_CHILD: '1' }, encoding: 'utf8', timeout: 180_000, maxBuffer: 1 << 24 });
    if (r.error?.code === 'ETIMEDOUT') assert.fail('the fuzz child did not finish in 180 s: a hang (rerun with CHICLA_FUZZ_READ_N smaller and the same seed to find the case)');
    assert.equal(r.status, 0, `${(r.stderr || '').split('\n').find((l) => l.startsWith('FUZZ_READ_FAIL')) ?? r.stderr}`);
    const m = /FUZZ_READ_OUTCOME (\{.*\})/.exec(r.stdout); assert.ok(m, 'the child reported no outcome');
    const o = JSON.parse(m[1]);
    assert.ok(o.openFail > 0 && o.open > 0, `both outcomes of openZip must occur (${m[1]})`);
    assert.ok(o.extractOk > 0 && o.extractFail > 0, `both outcomes of extractZip must occur (${m[1]})`);
  });
}
