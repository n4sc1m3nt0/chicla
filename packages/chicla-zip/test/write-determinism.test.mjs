// C3.4: determinism and dates in writeZip. Written before the code (they failed first; see the CHANGELOG of round 22).
// Contract under test:
//   writeZip(out, sources, { deterministic: true, epoch? })
//   - the same sources give the same bytes on any machine, any day, any time zone;
//   - dates: `epoch` (seconds since 1970) > env SOURCE_DATE_EPOCH > each source's own `mtime`; a source with no date gets 1980-01-01 00:00;
//     everything is clamped to the DOS range (1980-01-01 00:00:00 .. 2107-12-31 23:59:58) and written in UTC;
//   - modes are normalised to 0644 (0755 for folders and for files with the owner execute bit);
//   - the order of `sources` is kept exactly as given (walking a tree in a fixed order is C3.5's job).
//   Without `deterministic` nothing changes: dates are local time, a source with no date gets "now", modes are kept.
// The independent reader is Python's zipfile: `date_time` is the raw DOS field (no time zone is applied) and `external_attr >> 16` is the mode.
// Assertions use error codes, never message text.
import { writeZip, ZipError } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkZip } from './interop.mjs';

const SRC = pathToFileURL(fileURLToPath(new URL('../src/zipkit.mjs', import.meta.url))).href;
let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-det-')); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const out = () => join(dir, `d${n++}.zip`);
const f = (name, extra = {}) => ({ name, data: Buffer.from(`content of ${name}`), ...extra });
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const utc = (...a) => new Date(Date.UTC(...a));
const secs = (d) => Math.floor(d.getTime() / 1000);
const PY = 'import zipfile,json,sys\nz=zipfile.ZipFile(sys.argv[1])\nprint(json.dumps([[i.filename,list(i.date_time),i.external_attr>>16] for i in z.infolist()]))';
const raw = (p) => { const r = spawnSync('python3', ['-c', PY, p], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).map(([name, date, mode]) => ({ name, date, mode })); };
const stamps = (p) => raw(p).map((e) => e.date);
const noPartial = () => assert.deepEqual(readdirSync(dir).filter((x) => x.endsWith('.partial')), [], 'a .partial file was left');
const withEnv = async (value, fn) => {
  const had = Object.hasOwn(process.env, 'SOURCE_DATE_EPOCH'), old = process.env.SOURCE_DATE_EPOCH;
  if (value === undefined) delete process.env.SOURCE_DATE_EPOCH; else process.env.SOURCE_DATE_EPOCH = value;
  try { return await fn(); } finally { if (had) process.env.SOURCE_DATE_EPOCH = old; else delete process.env.SOURCE_DATE_EPOCH; }
};
const rejects = async (sources, opts, code) => {
  const p = out();
  await assert.rejects(writeZip(p, sources, opts), (e) => e instanceof ZipError && e.code === code, `expected ${code}`);
  assert.throws(() => statSync(p), { code: 'ENOENT' }, 'output exists after a refusal');
  noPartial();
};
// Runs writeZip in a child process with a given time zone; returns { sha, offset } so tests can prove the zones really differ.
const inZone = (tz, sources, opts, env = {}) => {
  const p = out();
  const code = `import { writeZip } from ${JSON.stringify(SRC)};
    const s = JSON.parse(process.argv[2]).map((x) => ({ name: x.name, ...(x.data === undefined ? {} : { data: Buffer.from(x.data) }), ...(x.mtime === undefined ? {} : { mtime: new Date(x.mtime) }), ...(x.mode === undefined ? {} : { mode: x.mode }) }));
    await writeZip(process.argv[1], s, JSON.parse(process.argv[3]));
    console.log(String(new Date(Date.UTC(2020, 0, 1)).getTimezoneOffset()));`; // a string: a number is painted yellow when FORCE_COLOR reaches the child (npm test on a Mac, round 177)
  const wire = sources.map((x) => ({ name: x.name, data: x.data?.toString(), mtime: x.mtime?.getTime(), mode: x.mode }));
  const childEnv = { ...process.env, ...env, TZ: tz }; if (env.SOURCE_DATE_EPOCH === undefined) delete childEnv.SOURCE_DATE_EPOCH;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code, p, JSON.stringify(wire), JSON.stringify(opts)], { encoding: 'utf8', env: childEnv });
  assert.equal(r.status, 0, r.stderr);
  const offset = Number(r.stdout.trim()); assert.ok(Number.isFinite(offset), `the child printed ${JSON.stringify(r.stdout)}, stderr ${JSON.stringify(r.stderr)}`); // a Mac printed NaN here (round 175)
  return { path: p, hash: sha(p), offset };
};

test('deterministic: a source with no date gets 1980-01-01 00:00:00, never "now"', async () => {
  const p = out(); await withEnv(undefined, () => writeZip(p, [f('a.txt'), { name: 'd/' }, f('d/b.txt')], { deterministic: true }));
  assert.deepEqual(stamps(p), [[1980, 1, 1, 0, 0, 0], [1980, 1, 1, 0, 0, 0], [1980, 1, 1, 0, 0, 0]]);
});

test('deterministic: the same sources written twice give identical bytes, whatever the output name', async () => {
  const src = () => [f('a.txt'), f('big.txt', { mtime: utc(2021, 4, 2, 3, 4, 5) }), { name: 'dir/', mtime: utc(2020, 1, 1) }, f('dir/c.bin', { mode: 0o755 })];
  const a = out(), b = join(dir, 'other-name.zip');
  await withEnv(undefined, async () => { await writeZip(a, src(), { deterministic: true }); await new Promise((r) => setTimeout(r, 2100)); /* DOS time has 2 s */ await writeZip(b, src(), { deterministic: true }); });
  assert.equal(sha(a), sha(b));
});

test('not deterministic (the default): a source with no date still gets the current time', async () => {
  const p = out(); await withEnv('315532800', () => writeZip(p, [f('a.txt')])); // SOURCE_DATE_EPOCH is ignored without the option
  const [[year]] = stamps(p); assert.ok(year >= 2024, `year ${year}`);
});

test('deterministic: SOURCE_DATE_EPOCH replaces every date, even an explicit mtime; odd seconds round down (DOS has 2 s)', async () => {
  const p = out(); await withEnv('1700000001', () => writeZip(p, [f('a.txt', { mtime: utc(2001, 1, 1) }), { name: 'd/' }, f('d/b.txt')], { deterministic: true }));
  for (const d of stamps(p)) assert.deepEqual(d, [2023, 11, 14, 22, 13, 20]); // 2023-11-14T22:13:21Z
});

test('deterministic: the `epoch` option beats SOURCE_DATE_EPOCH, as a number or as digits', async () => {
  for (const epoch of [secs(utc(2022, 5, 30, 8, 0, 10)), '1656576010']) {
    const p = out(); await withEnv('1700000000', () => writeZip(p, [f('a.txt')], { deterministic: true, epoch }));
    assert.deepEqual(stamps(p), [[2022, 6, 30, 8, 0, 10]]); // 2022-06-30T08:00:10Z
  }
});

test('deterministic without an epoch: each source keeps its own mtime, read in UTC; no date gives 1980', async () => {
  const p = out(); await withEnv(undefined, () => writeZip(p, [f('a', { mtime: utc(2020, 5, 15, 12, 30, 45) }), f('b', { mtime: utc(2023, 10, 14, 22, 13, 20) }), f('c')], { deterministic: true }));
  assert.deepEqual(stamps(p), [[2020, 6, 15, 12, 30, 44], [2023, 11, 14, 22, 13, 20], [1980, 1, 1, 0, 0, 0]]);
});

test('deterministic: dates are clamped to 1980-01-01 00:00:00 .. 2107-12-31 23:59:58, for mtime and for epoch', async () => {
  const low = [1980, 1, 1, 0, 0, 0], high = [2107, 12, 31, 23, 59, 58];
  let p = out(); await withEnv(undefined, () => writeZip(p, [f('old', { mtime: utc(1970, 0, 1) }), f('edge', { mtime: utc(1980, 0, 1, 0, 0, 1) }), f('far', { mtime: utc(2200, 0, 1) }), f('last', { mtime: utc(2107, 11, 31, 23, 59, 59) })], { deterministic: true }));
  assert.deepEqual(stamps(p), [low, low, high, high]);
  for (const [epoch, want] of [[0, low], [secs(utc(1980, 0, 1)) - 1, low], [secs(utc(2108, 0, 1)), high]]) {
    p = out(); await withEnv(undefined, () => writeZip(p, [f('a')], { deterministic: true, epoch })); assert.deepEqual(stamps(p), [want], `epoch ${epoch}`);
  }
});

test('deterministic: an invalid epoch is refused with EARG and nothing is written', async () => {
  for (const epoch of ['abc', '', '-5', '1.5', '1e3', ' 7', '0x10', -1, 1.5, NaN, Infinity, 9e12, '9000000000000', null, {}, 1n])
    await withEnv(undefined, () => rejects([f('a')], { deterministic: true, epoch }, 'EARG'));
  for (const bad of ['abc', '', '-5', '1.5', '1e3', ' 7', '9000000000000']) await withEnv(bad, () => rejects([f('a')], { deterministic: true }, 'EARG'));
});

test('an invalid SOURCE_DATE_EPOCH is ignored when `deterministic` is off, and `epoch` without `deterministic` is refused', async () => {
  const p = out(); await withEnv('not a number', () => writeZip(p, [f('a')])); assert.equal(stamps(p).length, 1);
  await rejects([f('a')], { epoch: 0 }, 'EARG');
  await rejects([f('a')], { deterministic: false, epoch: 0 }, 'EARG');
  for (const deterministic of ['yes', 1, null, {}]) await rejects([f('a')], { deterministic }, 'EARG');
});

test('deterministic output is identical in every time zone (and the zones really differ)', async () => {
  const src = [f('a.txt', { mtime: utc(2021, 1, 3, 23, 30, 40) }), f('b.txt'), { name: 'd/', mtime: utc(2019, 11, 31, 23, 59, 58) }];
  const zones = ['UTC', 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Auckland'];
  for (const env of [{}, { SOURCE_DATE_EPOCH: '1700000001' }]) {
    const runs = zones.map((tz) => inZone(tz, src, { deterministic: true }, { ...env }));
    assert.equal(new Set(runs.map((r) => r.offset)).size, zones.length, `time zones did not take effect: ${runs.map((r) => r.offset)}`);
    assert.equal(new Set(runs.map((r) => r.hash)).size, 1, `bytes differ between zones (${JSON.stringify(env)})`);
    assert.deepEqual(stamps(runs[0].path)[0], env.SOURCE_DATE_EPOCH ? [2023, 11, 14, 22, 13, 20] : [2021, 2, 3, 23, 30, 40]);
  }
});

test('guard: without `deterministic` the date is local time, as before (what Info-ZIP and the Chicla reader assume)', () => {
  const src = [f('a.txt', { mtime: utc(2020, 0, 1, 0, 0, 0) })];
  assert.deepEqual(stamps(inZone('Asia/Kolkata', src, {}).path), [[2020, 1, 1, 5, 30, 0]]);
  assert.deepEqual(stamps(inZone('America/Los_Angeles', src, {}).path), [[2019, 12, 31, 16, 0, 0]]);
});

test('deterministic: modes are normalised (0644; 0755 for folders and for files with the owner execute bit)', async () => {
  const src = [f('plain'), f('private', { mode: 0o600 }), f('group', { mode: 0o664 }), f('ro', { mode: 0o444 }), f('exec', { mode: 0o755 }), f('ownerx', { mode: 0o100 }), f('groupx', { mode: 0o070 }), f('all', { mode: 0o777 }),
    { name: 'd1/' }, { name: 'd2/', mode: 0o700 }, { name: 'd3/', mode: 0o777 }];
  const p = out(); await writeZip(p, src, { deterministic: true });
  assert.deepEqual(raw(p).map((e) => e.mode.toString(8)), ['100644', '100644', '100644', '100644', '100755', '100755', '100644', '100755', '40755', '40755', '40755']);
});

test('guard: without `deterministic` the modes are kept as given', async () => {
  const p = out(); await writeZip(p, [f('private', { mode: 0o600 }), f('plain'), { name: 'd/', mode: 0o700 }, { name: 'e/' }]);
  assert.deepEqual(raw(p).map((e) => e.mode.toString(8)), ['100600', '100644', '40700', '40755']);
});

test('guard: deterministic keeps the order of the sources exactly as given', async () => {
  const p = out(); await writeZip(p, [f('z'), f('a'), { name: 'm/' }, f('m/b'), f('B')], { deterministic: true });
  assert.deepEqual(raw(p).map((e) => e.name), ['z', 'a', 'm/', 'm/b', 'B']);
});

test('deterministic output is accepted by unzip, zipinfo, Python and the Chicla reader; zip64 switches keep it deterministic', async () => {
  const tree = { 'a.txt': 'hello', 'd/': '', 'd/b.txt': 'inside', 'caf\u00e9.txt': 'nfc' };
  const src = () => Object.entries(tree).map(([name, v]) => (name.endsWith('/') ? { name } : { name, data: Buffer.from(v) }));
  const p = out(); await writeZip(p, src(), { deterministic: true, epoch: 1700000000 });
  const c = await checkZip(p, tree); assert.deepEqual(c.problems, []);
  const ascii = { 'a.txt': 'hello', 'd/': '', 'd/b.txt': 'inside' }, asciiSrc = () => src().filter((x) => x.name in ascii); // zip64 + non-ASCII: Info-ZIP quirk, see write.test.mjs
  const a = out(), b = out();
  await writeZip(a, asciiSrc(), { deterministic: true, epoch: 1700000000, zip64: true }); await writeZip(b, asciiSrc(), { deterministic: true, epoch: 1700000000, zip64: true });
  assert.equal(sha(a), sha(b)); assert.deepEqual((await checkZip(a, ascii)).problems, []);
});
