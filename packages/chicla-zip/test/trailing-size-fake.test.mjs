// Round 189 / C15.17 (found by Claude in round 187, not in the report): a trailing fake end record whose directory is found by SIZE.
// Python and unzip compute the directory start as `recordPos - cdSize` and ignore the offset field, so a fake record after the real one with a wrong
// offset (not "strict fit") is read by them and was skipped by chicla. A candidate AFTER the chosen record whose `recordPos - cdSize` starts with a
// central header signature is now EAMBIGUOUS; candidates BEFORE it (a stored zip inside an entry) are still ignored.
// Hostile bytes come from test/zipraw.mjs. Assertions use error codes, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openZip, listZip, readZipFile, testZip, extractZip, ZipError } from '../src/zipkit.mjs';
import { local, central, eocd } from './zipraw.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-sizefake-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };
const refused = (err) => err instanceof ZipError && err.code === 'EAMBIGUOUS';
const names = (p) => listZip(p).entries.map((e) => e.name);
const havePython = spawnSync('python3', ['-c', '1'], { stdio: 'ignore' }).status === 0;
const pyNames = (p) => JSON.parse(spawnSync('python3', ['-I', '-c', 'import sys,json,zipfile;print(json.dumps([i.filename for i in zipfile.ZipFile(sys.argv[1]).infolist()]))', p], { encoding: 'utf8' }).stdout || '[]');

const GOOD = 'benign content\n', EVIL = 'EVIL content\n';
// good | evil | cdGood | real record | cdEvil | fake record (offset field wrong, comment fits)
const trailing = (fake = {}) => {
  const good = local('good.txt', GOOD), evil = local('evil.txt', EVIL);
  const cdGood = central('good.txt', GOOD, 0), cdEvil = central('evil.txt', EVIL, good.length);
  const cdGoodAt = good.length + evil.length;
  return Buffer.concat([good, evil, cdGood, eocd({ total: 1, cdSize: cdGood.length, cdOff: cdGoodAt }), cdEvil,
    eocd({ total: 1, cdSize: cdEvil.length, cdOff: 7, ...fake })]);
};

test('C15.17: a trailing record found by size, with a wrong offset field, is refused (EAMBIGUOUS)', async () => {
  const p = put(trailing());
  assert.throws(() => openZip(p), refused);
  assert.throws(() => listZip(p), refused);
  assert.throws(() => readZipFile(p, 'good.txt'), refused);
  await assert.rejects(testZip(p), refused);
  const out = join(dir, 'out-fake');
  await assert.rejects(extractZip(p, out), refused);
  assert.equal(existsSync(out), false, 'nothing is written for a refused zip');
});

test('C15.17: the fixture is a real differential: Python reads the fake directory by size', { skip: !havePython }, () => {
  assert.deepEqual(pyNames(put(trailing())), ['evil.txt']);
});

test('C15.17: any offset value on the fake is refused, not only 7', () => {
  for (const cdOff of [0, 1, 0xffff, 123456]) assert.throws(() => openZip(put(trailing({ cdOff }))), refused, `cdOff ${cdOff}`);
});

test('C15.17: a trailing record whose size does not lead to a central header is not a second directory (still read)', () => {
  const l = local('good.txt', GOOD), c = central('good.txt', GOOD, 0);
  const real = eocd({ total: 1, cdSize: c.length, cdOff: l.length });
  assert.deepEqual(names(put(Buffer.concat([l, c, real, eocd({ total: 0, cdSize: 0, cdOff: 0 })]))), ['good.txt'], 'size 0');
  assert.deepEqual(names(put(Buffer.concat([l, c, real, Buffer.alloc(40), eocd({ total: 1, cdSize: 30, cdOff: 3 })]))), ['good.txt'], 'size that lands on zeros');
});

test('C15.17: a stored zip inside an entry (its record is BEFORE the real one) is still read', () => {
  const inner = (() => { const l = local('in.txt', 'inner'), c = central('in.txt', 'inner', 0); return Buffer.concat([l, c, eocd({ total: 1, cdSize: c.length, cdOff: l.length })]); })();
  const l = local('inner.zip', inner), c = central('inner.zip', inner, 0);
  const p = put(Buffer.concat([l, c, eocd({ total: 1, cdSize: c.length, cdOff: l.length })]));
  assert.deepEqual(names(p), ['inner.zip']);
  assert.deepEqual(readZipFile(p, 'inner.zip'), inner);
});

test('C15.17: an honest zip with a short comment is still read', () => {
  const l = local('good.txt', GOOD), c = central('good.txt', GOOD, 0);
  assert.deepEqual(names(put(Buffer.concat([l, c, eocd({ total: 1, cdSize: c.length, cdOff: l.length, comment: Buffer.from('hello') })]))), ['good.txt']);
});
