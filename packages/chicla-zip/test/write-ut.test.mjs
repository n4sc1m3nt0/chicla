// C3.8: writeZip writes the extended-timestamp extra (UT, id 0x5455) so the modification time round-trips to the exact second in any time zone.
// Contract under test (opt-in: `writeZip(..., { extendedTime: true })`; without it nothing changes, because with ANY extra present Info-ZIP 6.00 in a non-UTF-8
// locale extracts non-ASCII names as «caf#U00e9» (checked: the same zip without an extra extracts «café»)):
//   - every entry (file or folder) gets, in its local header AND in its central entry, an extra block 0x5455 of 5 data bytes: flags 0x01 (mtime present)
//     and the mtime as a signed 32-bit number of seconds since 1970 (the layout Info-ZIP writes), next to the zip64 block when there is one;
//   - the time is the one the DOS stamp was made from (deterministic: `epoch`, SOURCE_DATE_EPOCH or the source's mtime or 1980-01-01 00:00 UTC; otherwise the
//     source's mtime, or "now"), cut to whole seconds, NOT clamped to 1980..2107 (the DOS fields stay clamped);
//   - a time that does not fit 32 bits (after 2038-01-19) gets no UT block (the DOS stamp stays; readers fall back to it);
//   - the Chicla reader (`mtime`, extraction), Info-ZIP `unzip` and Python `zipfile` still accept the file; extraction by `unzip` and by Chicla gives the
//     exact mtime whatever the time zone; the offsets and sizes of everything else are unchanged by it (zip64 included).
// Assertions use values and error codes, never message text. Linux and macOS only (TZ, unzip).
import { writeZip as rawWriteZip, createZip, listZip, extractZip, readZipFile, ZipError } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkZip, readers } from './interop.mjs';

let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-ut-')); });
after(() => { rmSync(base, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const fresh = () => join(base, `t${n++}`);
const writeZip = (o, s, opts = {}) => rawWriteZip(o, s, { extendedTime: true, ...opts }); // the option is opt-in; the guard tests below call rawWriteZip
const blocks = (extra) => { const m = new Map(); for (let o = 0; o + 4 <= extra.length;) { const id = extra.readUInt16LE(o), len = extra.readUInt16LE(o + 2); m.set(id, extra.subarray(o + 4, o + 4 + len)); o += 4 + len; } return m; };
// Raw parse, independent of the Chicla reader: [{ name, local: Map, central: Map, lExtraLen, cExtraLen }]
const raw = (p) => {
  const b = readFileSync(p); let e = b.length - 22; while (b.readUInt32LE(e) !== 0x06054b50) e--;
  let cd = b.readUInt32LE(e + 16); const cnt = b.readUInt16LE(e + 10), out = [];
  if (b.readUInt32LE(e - 20) === 0x07064b50) { const z = Number(b.readBigUInt64LE(e - 20 + 8)); cd = Number(b.readBigUInt64LE(z + 48)); }
  for (let i = 0; i < cnt; i++) {
    const nl = b.readUInt16LE(cd + 28), xl = b.readUInt16LE(cd + 30), cl = b.readUInt16LE(cd + 32); let off = b.readUInt32LE(cd + 42);
    const name = b.toString('utf8', cd + 46, cd + 46 + nl), central = blocks(b.subarray(cd + 46 + nl, cd + 46 + nl + xl));
    if (off === 0xffffffff) off = Number(central.get(1).readBigUInt64LE(central.get(1).length - 8));
    const lnl = b.readUInt16LE(off + 26), lxl = b.readUInt16LE(off + 28);
    out.push({ name, central, local: blocks(b.subarray(off + 30 + lnl, off + 30 + lnl + lxl)), lExtraLen: lxl, cExtraLen: xl }); cd += 46 + nl + xl + cl;
  }
  return out;
};
const utOf = (blk) => { const d = blk?.get(0x5455); return d ? { len: d.length, flags: d[0], secs: d.readInt32LE(1) } : null; };
const T = (iso) => new Date(iso);

test('every entry has a UT block in the local header and in the central entry: flags 1 and the exact mtime in seconds (odd seconds too)', async () => {
  const out = fresh() + '.zip', when = T('2021-03-04T05:06:07Z'); // 07 is odd: DOS has 2-second steps
  await writeZip(out, [{ name: 'd/', mtime: when }, { name: 'd/a.txt', data: Buffer.from('hello'), mtime: when }, { name: 'b.bin', data: Buffer.alloc(5000, 1), mtime: T('2022-12-31T23:59:59Z') }]);
  const r = raw(out), secs = when.getTime() / 1000;
  for (const [i, s] of [secs, secs, T('2022-12-31T23:59:59Z').getTime() / 1000].entries()) {
    for (const where of ['local', 'central']) assert.deepEqual(utOf(r[i][where]), { len: 5, flags: 1, secs: s }, `${r[i].name} ${where}`);
  }
  assert.deepEqual((await checkZip(out, { 'd/': '', 'd/a.txt': 'hello', 'b.bin': Buffer.alloc(5000, 1) })).problems, []);
});

test('the Chicla reader gives the exact mtime, odd seconds included, whatever the time zone (child processes)', async () => {
  const out = fresh() + '.zip'; await writeZip(out, [{ name: 'a.txt', data: Buffer.from('x'), mtime: T('2021-03-04T05:06:07Z') }]);
  const code = `import { listZip } from ${JSON.stringify(new URL('../src/zipkit.mjs', import.meta.url).href)}; console.log(listZip(${JSON.stringify(out)}).entries[0].mtime.toISOString());`;
  const seen = new Set();
  for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Auckland']) {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.stdout.trim(), '2021-03-04T05:06:07.000Z', tz); seen.add(tz);
  }
  assert.equal(seen.size, 4);
});

test('extraction by Chicla and by unzip give the exact mtime (not shifted by the zone) for files and folders', async () => {
  const out = fresh() + '.zip', when = T('2021-03-04T05:06:07Z');
  await writeZip(out, [{ name: 'd/', mtime: when }, { name: 'd/a.txt', data: Buffer.from('hello'), mtime: when }]);
  const c = fresh(); mkdirSync(c); await extractZip(out, join(c, 'x'));
  assert.equal(statSync(join(c, 'x/d/a.txt')).mtimeMs, when.getTime()); assert.equal(statSync(join(c, 'x/d')).mtimeMs, when.getTime());
  const has = spawnSync('unzip', ['-v']); if (has.error) return; // no unzip here: the Chicla half above still ran
  for (const tz of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles']) {
    const d = fresh(); mkdirSync(d); const r = spawnSync('unzip', ['-q', out, '-d', d], { env: { ...process.env, TZ: tz } }); assert.equal(r.status, 0, tz);
    assert.equal(statSync(join(d, 'd/a.txt')).mtimeMs, when.getTime(), `unzip in ${tz}`);
  }
});

test('deterministic mode: the UT time is the epoch (option, then SOURCE_DATE_EPOCH), else the source mtime, else 1980-01-01 00:00 UTC; bytes unchanged by the zone', async () => {
  const src = (m) => [{ name: 'a.txt', data: Buffer.from('x'), mtime: m }];
  const get = async (srcs, opts, env) => { const o = fresh() + '.zip'; const prev = process.env.SOURCE_DATE_EPOCH; if (env === undefined) delete process.env.SOURCE_DATE_EPOCH; else process.env.SOURCE_DATE_EPOCH = env; try { await writeZip(o, srcs, { deterministic: true, ...opts }); } finally { if (prev === undefined) delete process.env.SOURCE_DATE_EPOCH; else process.env.SOURCE_DATE_EPOCH = prev; } return utOf(raw(o)[0].local).secs; };
  assert.equal(await get(src(T('2020-01-01T00:00:01Z')), { epoch: 1700000001 }), 1700000001);
  assert.equal(await get(src(T('2020-01-01T00:00:01Z')), {}, '1600000003'), 1600000003);
  assert.equal(await get(src(T('2020-01-01T00:00:01Z')), {}), 1577836801);
  assert.equal(await get(src(undefined), {}), 315532800);
});

test('without deterministic: the source mtime, or "now" (to the second) when it has none; fractions are cut, not rounded', async () => {
  const o = fresh() + '.zip', before = Math.floor(Date.now() / 1000);
  await writeZip(o, [{ name: 'a', data: Buffer.from('x'), mtime: new Date(1600000000999) }, { name: 'b', data: Buffer.from('y') }]);
  const r = raw(o); assert.equal(utOf(r[0].local).secs, 1600000000);
  const nowSecs = utOf(r[1].local).secs; assert.ok(nowSecs >= before && nowSecs <= before + 5, `now was ${nowSecs}`);
});

test('a time before 1980 or before 1970 is written exactly (signed), the DOS fields stay clamped; the reader returns the real time', async () => {
  const o = fresh() + '.zip', a = T('1975-06-07T08:09:10Z'), b = T('1965-01-02T03:04:05Z');
  await writeZip(o, [{ name: 'a', data: Buffer.from('x'), mtime: a }, { name: 'b', data: Buffer.from('y'), mtime: b }]);
  const r = raw(o); assert.equal(utOf(r[0].central).secs, a.getTime() / 1000); assert.equal(utOf(r[1].central).secs, b.getTime() / 1000);
  assert.ok(b.getTime() / 1000 < 0);
  assert.deepEqual(listZip(o).entries.map((e) => e.mtime.toISOString()), [a.toISOString(), b.toISOString()]);
  assert.deepEqual((await checkZip(o, { a: 'x', b: 'y' })).problems, []);
});

test('a time that does not fit 32 bits (after 2038-01-19) gets no UT block and the file is still valid; 2038-01-19 03:14:07 UTC does fit', async () => {
  const o = fresh() + '.zip', fit = new Date(2147483647 * 1000), late = new Date(2147483648 * 1000);
  await writeZip(o, [{ name: 'fit', data: Buffer.from('x'), mtime: fit }, { name: 'late', data: Buffer.from('y'), mtime: late }, { name: 'dir/', mtime: T('2100-01-01T00:00:00Z') }]);
  const r = raw(o); assert.equal(utOf(r[0].local).secs, 2147483647); assert.equal(utOf(r[1].local), null); assert.equal(utOf(r[1].central), null); assert.equal(utOf(r[2].local), null);
  assert.deepEqual((await checkZip(o, { fit: 'x', late: 'y', 'dir/': '' })).problems, []);
  assert.equal(listZip(o).entries[0].mtime.getTime(), 2147483647000);
});

test('with zip64 (forced, and automatic by the limits) the UT block sits next to the zip64 block: sizes, offsets and readers all agree', async () => {
  const data = Buffer.alloc(3000, 7), when = T('2021-03-04T05:06:07Z');
  for (const opts of [{ zip64: true }, { zip64: 'auto', _limits: { max32: 1000 } }]) {
    const o = fresh() + '.zip'; await writeZip(o, [{ name: 'a.bin', data, mtime: when }, { name: 'b.bin', data: Buffer.from('tiny'), mtime: when }], { level: 0, ...opts });
    const r = raw(o);
    for (const e of r) { assert.deepEqual(utOf(e.local), { len: 5, flags: 1, secs: when.getTime() / 1000 }, `${e.name} local`); assert.deepEqual(utOf(e.central), { len: 5, flags: 1, secs: when.getTime() / 1000 }, `${e.name} central`); }
    assert.ok(r[0].local.has(1) && r[0].central.has(1), 'zip64 block present on the big one');
    assert.deepEqual((await checkZip(o, { 'a.bin': data, 'b.bin': 'tiny' })).problems, []);
    assert.deepEqual(readZipFile(o, 'a.bin'), data);
  }
});

test('the extra costs 9 bytes per local header and per central entry, nothing else moves (no zip64: 30+name+9 | 46+name+9)', async () => {
  const o = fresh() + '.zip'; await writeZip(o, [{ name: 'a.txt', data: Buffer.from('hello'), mtime: T('2021-03-04T05:06:08Z') }], { level: 0 });
  const r = raw(o)[0]; assert.equal(r.lExtraLen, 9); assert.equal(r.cExtraLen, 9);
  assert.equal(readFileSync(o).length, (30 + 5 + 9 + 5) + (46 + 5 + 9) + 22);
});

test('same sources, same options: same bytes (the UT block adds no non-determinism), and different mtimes give different bytes', async () => {
  const mk = (m) => [{ name: 'a', data: Buffer.from('x'), mtime: m }];
  const a = fresh() + '.zip', b = fresh() + '.zip', c = fresh() + '.zip';
  await writeZip(a, mk(T('2021-03-04T05:06:07Z')), { deterministic: true }); await writeZip(b, mk(T('2021-03-04T05:06:07Z')), { deterministic: true }); await writeZip(c, mk(T('2021-03-04T05:06:06Z')), { deterministic: true });
  assert.ok(readFileSync(a).equals(readFileSync(b))); assert.ok(!readFileSync(a).equals(readFileSync(c)));
});

test('opt-in: by default (and with extendedTime: false) no UT block and the bytes are exactly as before; a non-boolean is EARG and nothing is written', async () => {
  const srcs = [{ name: 'a.txt', data: Buffer.from('hello'), mtime: T('2021-03-04T05:06:07Z') }], a = fresh() + '.zip', b = fresh() + '.zip', c = fresh() + '.zip';
  await rawWriteZip(a, srcs, { deterministic: true }); await rawWriteZip(b, srcs, { deterministic: true, extendedTime: false }); await rawWriteZip(c, srcs, { deterministic: true, extendedTime: true });
  assert.ok(readFileSync(a).equals(readFileSync(b))); assert.equal(raw(a)[0].lExtraLen, 0); assert.equal(raw(a)[0].cExtraLen, 0); assert.equal(raw(a)[0].local.has(0x5455), false);
  assert.equal(readFileSync(c).length - readFileSync(a).length, 18, 'only the two 9-byte blocks differ');
  for (const bad of ['yes', 1, null]) { const o = fresh() + '.zip'; await assert.rejects(rawWriteZip(o, srcs, { extendedTime: bad }), (e) => e instanceof ZipError && e.code === 'EARG'); assert.throws(() => statSync(o), { code: 'ENOENT' }); }
});

test('createZip passes extendedTime through: the zip holds the exact mtime of the file on disk', async () => {
  const root = fresh(); mkdirSync(root); const { writeFileSync, utimesSync } = await import('node:fs'); const when = T('2021-03-04T05:06:07Z');
  writeFileSync(join(root, 'a.txt'), 'hi'); utimesSync(join(root, 'a.txt'), when, when);
  const o = fresh() + '.zip'; await createZip(o, root, { extendedTime: true });
  assert.equal(utOf(raw(o)[0].central).secs, when.getTime() / 1000);
  const p = fresh() + '.zip'; await createZip(p, root); assert.equal(raw(p)[0].central.has(0x5455), false);
});

test('non-ASCII names with the UT block: readers that decode UTF-8 themselves agree (Info-ZIP zipinfo in a C locale is the known exception, so it is left out)', async () => {
  const o = fresh() + '.zip', tree = { 'caf\u00e9.txt': 'x', '\u30a2/\u00df': 'y' };
  await writeZip(o, Object.entries(tree).map(([name, v]) => ({ name, data: Buffer.from(v), mtime: T('2021-03-04T05:06:07Z') })));
  for (const t of ['unzip', 'python', 'chicla']) { const res = await readers[t](o, tree); assert.ok(res, `${t} did not run`); assert.deepEqual(res.problems, [], t); }
});
