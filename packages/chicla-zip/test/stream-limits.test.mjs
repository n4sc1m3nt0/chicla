// C5.3b slice 4 (round 54): the mutants of `writeZipStream` and `createZip` showed four paths no test reached. Written as tests first.
//   - writeZipStream switches to zip64 end records for each trigger ALONE (entry count, central directory size, central directory offset), as
//     test/write.test.mjs does for writeZip, and the plain end record then carries the marker (0xFFFF or 0xFFFFFFFF) while the zip64 record carries the real value.
//   - writeZipStream with `extendedTime: true` gives no UT block to a time that does not fit 32 bits (as writeZip does) and still writes a valid zip.
//   - createZip refuses an output that IS the folder it reads (ERECURSE), not only one inside it; the folder is left as it was.
//   - createZip with `stream: true` skips a FIFO as "special" at listing time, never opens it, and never calls it ECHANGED.
// Assertions use error codes, never message text. Linux and macOS only (mkfifo).
import { writeZipStream, createZip, ZipError } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkZip } from './interop.mjs';

let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-slimits-')); });
after(() => { rmSync(base, { recursive: true, force: true }); });
const fresh = () => join(base, `t${n++}`);
const memSink = () => { const parts = []; const w = new Writable({ write(c, _e, cb) { parts.push(c); cb(); } }); w.bytes = () => Buffer.concat(parts); return w; };
const toBuffer = async (sources, opts) => { const s = memSink(); const r = await writeZipStream(s, sources, opts); return { buf: s.bytes(), ...r }; };
const folders = (...names) => names.map((name) => ({ name }));

// The end of the archive, read by hand (not by the Chicla reader): the plain record, and whether a zip64 record and locator sit in front of it.
const end = (b) => {
  let e = b.length - 22; while (b.readUInt32LE(e) !== 0x06054b50) e--;
  const plain = { count: b.readUInt16LE(e + 10), cdSize: b.readUInt32LE(e + 12), cdOff: b.readUInt32LE(e + 16) };
  const has64 = e >= 20 && b.readUInt32LE(e - 20) === 0x07064b50;
  const at = has64 ? Number(b.readBigUInt64LE(e - 12)) : 0; // the locator (20 bytes in front of the plain record) says where the zip64 record is
  const z = has64 ? { count: Number(b.readBigUInt64LE(at + 32)), cdSize: Number(b.readBigUInt64LE(at + 40)), cdOff: Number(b.readBigUInt64LE(at + 48)) } : null;
  return { plain, has64, z };
};

test('writeZipStream: each zip64 end-record trigger alone (entry count, directory size, directory offset); the plain record carries the marker', async () => {
  // count only: 3 folders, at most 2 entries without zip64
  const a = await toBuffer(folders('a/', 'b/', 'c/'), { _limits: { max16: 2 } }), ea = end(a.buf);
  assert.ok(ea.has64); assert.equal(ea.plain.count, 0xffff); assert.equal(ea.z.count, 3); assert.notEqual(ea.plain.cdSize, 0xffffffff); assert.notEqual(ea.plain.cdOff, 0xffffffff);
  const pa = fresh(); writeFileSync(pa, a.buf); assert.deepEqual((await checkZip(pa, { 'a/': '', 'b/': '', 'c/': '' })).problems, []);

  // directory size only: three folders put the directory at offset 96 (under the limit) and its records add up to 144 (over it)
  const s = await toBuffer(folders('a/', 'b/', 'c/'), { _limits: { max32: 100 } }), es = end(s.buf);
  assert.ok(es.has64); assert.equal(es.plain.cdSize, 0xffffffff); assert.equal(es.plain.cdOff, 96); assert.equal(es.plain.count, 3); assert.equal(es.z.cdSize, 144);
  const ps = fresh(); writeFileSync(ps, s.buf); assert.deepEqual((await checkZip(ps, { 'a/': '', 'b/': '', 'c/': '' })).problems, []);

  // directory offset only: one small file; its streamed data and descriptor push the directory past 70 bytes, its records stay at 67
  const o = await toBuffer([{ name: 'f', data: Buffer.from('x') }], { _limits: { max32: 70 } }), eo = end(o.buf);
  assert.ok(eo.has64); assert.equal(eo.plain.cdOff, 0xffffffff); assert.equal(eo.plain.cdSize, 67); assert.equal(eo.plain.count, 1); assert.ok(eo.z.cdOff > 70);
  const po = fresh(); writeFileSync(po, o.buf); assert.deepEqual((await checkZip(po, { f: 'x' })).problems, []);

  // none of them: no zip64 end record at all
  const none = await toBuffer(folders('a/', 'b/')); assert.equal(end(none.buf).has64, false);
});

test('createZip: an output that IS the folder being read is ERECURSE, and the folder is left as it was', async () => {
  const root = fresh(); const w = (p, t) => writeFileSync(join(root, p), t);
  spawnSync('mkdir', ['-p', root]); w('a.txt', 'a');
  await assert.rejects(createZip(root, root), (e) => e instanceof ZipError && e.code === 'ERECURSE');
  assert.deepEqual(readdirSync(root), ['a.txt']); assert.equal(readFileSync(join(root, 'a.txt'), 'utf8'), 'a');
});

test('createZip { stream: true }: a FIFO is skipped as "special" at listing time (never opened, never ECHANGED)', { timeout: 20000 }, async () => {
  const root = fresh(); spawnSync('mkdir', ['-p', root]); writeFileSync(join(root, 'a'), 'a');
  const m = spawnSync('mkfifo', [join(root, 'pipe')]); if (m.status !== 0) return; // no mkfifo: nothing to test here
  const r = await createZip(join(fresh() + '.zip'), root, { stream: true });
  assert.deepEqual(r.entries.map((e) => e.name), ['a']); assert.deepEqual(r.skipped, [{ name: 'pipe', reason: 'special' }]);
});

test('writeZipStream { extendedTime: true }: a time that does not fit 32 bits (after 2038-01-19) gets no UT block, one that fits does, and the zip is valid', async () => {
  const T = (iso) => new Date(iso);
  const r = await toBuffer([{ name: 'fit', data: Buffer.from('x'), mtime: T('2038-01-19T03:14:07Z') }, { name: 'late', data: Buffer.from('y'), mtime: T('2100-01-01T00:00:00Z') }, { name: 'dir/', mtime: T('2100-01-01T00:00:00Z') }], { extendedTime: true });
  let e = r.buf.length - 22; while (r.buf.readUInt32LE(e) !== 0x06054b50) e--;
  let cd = r.buf.readUInt32LE(e + 16); const extra = {};
  for (let i = 0, count = r.buf.readUInt16LE(e + 10); i < count; i++) {
    const nl = r.buf.readUInt16LE(cd + 28), xl = r.buf.readUInt16LE(cd + 30), cl = r.buf.readUInt16LE(cd + 32), at = r.buf.readUInt32LE(cd + 42);
    extra[r.buf.toString('utf8', cd + 46, cd + 46 + nl)] = { local: r.buf.readUInt16LE(at + 28), central: xl }; cd += 46 + nl + xl + cl;
  }
  assert.deepEqual(extra, { fit: { local: 20 + 9, central: 20 + 9 }, late: { local: 20, central: 20 }, 'dir/': { local: 0, central: 0 } });
  const p = fresh(); writeFileSync(p, r.buf); assert.deepEqual((await checkZip(p, { fit: 'x', late: 'y', 'dir/': '' })).problems, []);
});
