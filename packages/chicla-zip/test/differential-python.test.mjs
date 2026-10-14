// C5.2: differential test against Python's `zipfile` on random trees. Each seed builds one random tree (nested folders, empty folders, empty files, odd and
// non-ASCII names, compressible, incompressible and zero data, a few big files) and runs it both ways:
//   A. Chicla writes (createZip, random options: level, zip64, stream, deterministic, extendedTime, sha256) -> unzip, zipinfo, Python and the Chicla reader accept it,
//      and Python's infolist (name, size, CRC, method, bit 11) matches the Chicla listing entry by entry.
//   B. Python writes the same tree (stored or deflate, random level, forced zip64 per entry, seekable or a stream with data descriptors) -> the Chicla reader
//      accepts it, its listing matches Python's infolist, and extractZip gives the same folder as Python's extractall and as the original tree.
// Oracle: the tree comes from the generator (sha256 per file), never from the code under test; each implementation is compared with it AND with the other.
// CHICLA_DIFF_SEED (default 20261010) and CHICLA_DIFF_N (default 30) reproduce a failure: tree i uses seed SEED+i, so `CHICLA_DIFF_SEED=<seed+i> CHICLA_DIFF_N=1`
// reruns exactly that one, and the failing message prints the seed and the options. Not covered here: dates (C3.4, C3.8), symlinks and modes (C3.5, C2).
// The external tools run with a UTF-8 locale (this file only; node --test gives each file its own process): unzip 6.00 in a non-UTF-8 locale escapes non-ASCII names
// (`caf#U00e9`) and warns about "mismatching local filename" whenever an extra field is present (forced zip64 from Python, UT from Chicla). Known and not a defect (ROADMAP, C3.8).
// The external tools run with a UTF-8 locale (this file only; node --test gives each file its own process): unzip 6.00 in a non-UTF-8 locale escapes non-ASCII names
// (`caf#U00e9`) and warns about "mismatching local filename" whenever an extra field is present (forced zip64 from Python, UT from Chicla). Known and not a defect (ROADMAP, C3.8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createZip, extractZip, listZip, testZip } from '../src/zipkit.mjs';
import { checkZip } from './interop.mjs';

process.env.LC_ALL = process.env.CHICLA_DIFF_LOCALE ?? 'C.UTF-8';
process.env.LC_ALL = process.env.CHICLA_DIFF_LOCALE ?? "C.UTF-8";
const SEED = Number(process.env.CHICLA_DIFF_SEED ?? 20261010), N = Number(process.env.CHICLA_DIFF_N ?? 30);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const prng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------- the random tree: { dirs: ['a/', 'a/b/'], files: Map(path -> Buffer) } ----------
const PARTS = ['a', 'docs', 'src', 'data.v2', 'with space', 'caf\u00e9', 'cafe\u0301', '\u00df\u00fc\u00f1', '\u65e5\u672c\u8a9e', '[x]', '#1', '100%', '.hidden', '-dash', 'UPPER', 'n'.repeat(process.platform === 'win32' ? 20 : 120), 'a.b.c.d'];
function genTree(r) {
  const pick = (a) => a[Math.floor(r() * a.length)], used = new Set(), dirs = [], files = new Map();
  const key = (p) => p.normalize('NFC').toLowerCase().replace(/\/$/, ''); // portable: no two names equal in NFC or in case
  const parents = [''];
  for (let i = Math.floor(r() * 7); i > 0; i--) {
    const p = pick(parents), name = pick(PARTS) + (r() < 0.5 ? '' : String(Math.floor(r() * 99))), path = `${p}${name}/`;
    if (!used.has(key(path)) && path.split('/').length <= 6) { used.add(key(path)); dirs.push(path); parents.push(path); }
  }
  const data = () => {
    const k = Math.floor(r() * 7), len = (m) => Math.floor(r() * m);
    if (k === 0) return Buffer.alloc(0);
    if (k === 1) return Buffer.from('hello ' + len(1e6));
    if (k === 2) return Buffer.from('chicla zip '.repeat(len(20000)));
    if (k === 3) return Buffer.alloc(len(300000));
    if (k === 4) { const b = Buffer.alloc(len(100000)); for (let i = 0; i < b.length; i++) b[i] = Math.floor(r() * 256); return b; }
    if (k === 5) return Buffer.concat([Buffer.alloc(len(5000)), Buffer.from('x'.repeat(len(5000))), Buffer.from([0, 255, 10, 13])]);
    return r() < 0.1 ? Buffer.alloc(1_500_000, 7) : Buffer.from('line\n'.repeat(len(3000)));
  };
  for (let i = 1 + Math.floor(r() * 24); i > 0; i--) {
    const path = pick(parents) + pick(PARTS) + (r() < 0.6 ? String(Math.floor(r() * 999)) : '') + pick(['', '.txt', '.bin']);
    if (!used.has(key(path))) { used.add(key(path)); files.set(path, data()); }
  }
  return { dirs, files };
}
const expected = (t) => ({ ...Object.fromEntries(t.dirs.map((d) => [d, ''])), ...Object.fromEntries(t.files) }); // the shape checkZip wants
function writeTree(t, root) {
  for (const d of t.dirs) mkdirSync(join(root, d), { recursive: true });
  for (const [p, b] of t.files) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), b); }
}
function walk(root) { // lstat only; dirs end in '/', files map to sha256
  const out = {}, go = (rel) => { for (const e of readdirSync(join(root, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = rel + e.name; if (e.isDirectory()) { out[p + '/'] = null; go(p + '/'); } else if (e.isFile()) out[p] = sha(readFileSync(join(root, p))); else out[p] = `special:${lstatSync(join(root, p)).mode}`; } };
  go(''); return out;
}
const treeShape = (t) => ({ ...Object.fromEntries(t.dirs.map((d) => [d, null])), ...Object.fromEntries([...t.files].map(([p, b]) => [p, sha(b)])) });
const same = (got, want, what) => { const out = []; for (const k of Object.keys(want)) if (!(k in got)) out.push(`${what}: missing «${k}»`); else if (got[k] !== want[k]) out.push(`${what}: content of «${k}» differs`); for (const k of Object.keys(got)) if (!(k in want)) out.push(`${what}: unexpected «${k}»`); return out; };

// ---------- Python side (the independent implementation) ----------
const PY_META = 'import sys,json,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nprint(json.dumps([[i.filename,i.file_size,i.CRC,i.compress_type,(i.flag_bits>>11)&1] for i in z.infolist()]))';
const PY_EXTRACT = 'import sys,zipfile\nzipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])';
const PY_BUILD = `import sys,json,zipfile
class Unseekable:
    def __init__(s,f): s.f=f
    def write(s,b): return s.f.write(b)
    def flush(s): s.f.flush()
spec=json.load(sys.stdin); raw=open(spec["out"],"wb")
with zipfile.ZipFile(Unseekable(raw) if spec["mode"]=="stream" else raw,"w") as z:
    for e in spec["entries"]:
        zi=zipfile.ZipInfo(e["name"],date_time=(2026,10,10,12,30,40))
        if e["dir"]:
            zi.external_attr=(0o40755<<16)|0x10; z.writestr(zi,b"",compress_type=0)
            continue
        zi.external_attr=0o100644<<16; zi.compress_type=e["method"]; data=open(spec["root"]+"/"+e["name"],"rb").read()
        if e["zip64"]:
            with z.open(zi,"w",force_zip64=True) as w: w.write(data)
        else: z.writestr(zi,data,compress_type=e["method"],compresslevel=e["level"] if e["method"] else None)
raw.close()`;
const py = (code, args, input) => { const r = spawnSync('python3', ['-c', code, ...args], { encoding: 'utf8', input, maxBuffer: 1 << 28, env: { ...process.env, PYTHONUTF8: '1' } }); assert.equal(r.status, 0, `python3 failed: ${r.error?.message ?? r.stderr.trim().split('\n').pop()}`); return r.stdout; };

// the Chicla listing, entry by entry, against Python's infolist of the same zip (name, size, CRC, method, bit 11)
function metaProblems(zipPath) {
  const pyRows = JSON.parse(py(PY_META, [zipPath])), mine = listZip(zipPath).entries, out = [];
  if (pyRows.length !== mine.length) out.push(`entry count: python ${pyRows.length}, chicla ${mine.length}`);
  pyRows.forEach(([name, size, crc, method, bit11], i) => {
    const e = mine[i]; if (!e) return;
    const nonAscii = /[^\x00-\x7f]/.test(name) ? 1 : 0, got = [e.name, e.usize, e.crc, e.method], want = [name, size, crc, method];
    if (JSON.stringify(got) !== JSON.stringify(want) || bit11 !== nonAscii) out.push(`entry ${i} «${name}»: python ${JSON.stringify([...want, `bit11=${bit11}`])}, chicla ${JSON.stringify(got)}`);
  });
  return out;
}

for (let i = 0; i < N; i++) {
  const seed = SEED + i;
  test(`random tree, seed ${seed}: Chicla writes and Python reads, Python writes and Chicla reads`, async () => {
    const r = prng(seed), t = genTree(r), dir = mkdtempSync(join(tmpdir(), 'chicla-diff-'));
    const opts = { level: [0, 1, 6, 9][Math.floor(r() * 4)], zip64: r() < 0.3 ? true : 'auto', stream: r() < 0.5, deterministic: r() < 0.5, extendedTime: r() < 0.3, sha256: r() < 0.3 };
    const spec = { mode: r() < 0.5 ? 'stream' : 'seek', entries: [...t.dirs.map((name) => ({ name, dir: true })), ...[...t.files.keys()].map((name) => ({ name, dir: false, method: r() < 0.3 ? 0 : 8, level: 1 + Math.floor(r() * 9), zip64: r() < 0.3 }))] };
    const why = `to reproduce: CHICLA_DIFF_SEED=${seed} CHICLA_DIFF_N=1 · chicla options ${JSON.stringify(opts)} · python ${spec.mode}`;
    try {
      const src = join(dir, 'src'); mkdirSync(src); writeTree(t, src);
      // A. Chicla writes
      const a = join(dir, 'chicla.zip'); await createZip(a, src, opts);
      const ca = await checkZip(a, expected(t));
      for (const tool of ['unzip', 'zipinfo', 'python', 'chicla']) assert.ok(ca.ran.includes(tool), `${tool} did not run`);
      assert.deepEqual([...ca.problems, ...metaProblems(a)], [], `A (chicla -> python): ${why}`);
      // B. Python writes
      const b = join(dir, 'python.zip'); py(PY_BUILD, [], JSON.stringify({ out: b, root: src, ...spec }));
      await testZip(b);
      const cb = await checkZip(b, expected(t));
      assert.deepEqual([...cb.problems, ...metaProblems(b)], [], `B (python -> chicla): ${why}`);
      const mine = join(dir, 'x-chicla'), theirs = join(dir, 'x-python'); await extractZip(b, mine); py(PY_EXTRACT, [b, theirs]);
      const want = treeShape(t);
      assert.deepEqual([...same(walk(mine), want, 'chicla extract vs tree'), ...same(walk(theirs), want, 'python extractall vs tree'), ...same(walk(mine), walk(theirs), 'chicla vs python extract')], [], `B (extraction): ${why}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('the generator is deterministic and the seeds really cover the shapes the differential relies on', () => {
  const again = (s) => JSON.stringify(genTree(prng(s)).dirs) + [...genTree(prng(s)).files].map(([p, b]) => p + sha(b)).join();
  assert.equal(again(20261010), again(20261010));
  const cover = { emptyDir: 0, emptyFile: 0, nonAscii: 0, deep: 0, big: 0, nfd: 0 };
  for (let s = 0; s < 60; s++) {
    const t = genTree(prng(20261010 + s)), names = [...t.dirs, ...t.files.keys()];
    if (t.dirs.some((d) => ![...t.files.keys()].some((f) => f.startsWith(d)) && !t.dirs.some((e) => e !== d && e.startsWith(d)))) cover.emptyDir++;
    if ([...t.files.values()].some((b) => b.length === 0)) cover.emptyFile++;
    if (names.some((n) => /[^\x00-\x7f]/.test(n))) cover.nonAscii++;
    if (names.some((n) => n.split('/').length >= 5)) cover.deep++;
    if ([...t.files.values()].some((b) => b.length > 200000)) cover.big++;
    if (names.some((n) => n !== n.normalize('NFC'))) cover.nfd++;
  }
  for (const [k, v] of Object.entries(cover)) assert.ok(v >= 3, `the first 60 default seeds hold only ${v} tree(s) with «${k}»; the differential would not exercise it`);
});
