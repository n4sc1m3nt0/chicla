// R3 / C1.3: `legacyEncoding` chooses how names are decoded when they have no Unicode Path extra, no bit 11 and are not
// valid UTF-8 (the last step of the precedence). Default stays cp437 (the zip spec). Nothing else about names changes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openZip, listZip, readZipFile, ZipError } from '../src/zipkit.mjs';
import { buildZip, unicodePathExtra } from './zipfab.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-legacy-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (buf) => { const p = join(dir, `z${n++}.zip`); writeFileSync(p, buf); return p; };
const nameOf = (raw, opts, extra = {}) => listZip(put(buildZip([{ name: raw, data: 'x', ...extra }])), opts).entries[0];

const cafe82 = Buffer.from([0x63, 0x61, 0x66, 0x82, 0x2e, 0x74, 0x78, 0x74]); // "caf" 0x82 ".txt"
const cafeE9 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x2e, 0x74, 0x78, 0x74]); // "caf" 0xE9 ".txt": lone 0xE9 is not UTF-8
const sjis = Buffer.from([0x83, 0x41, 0x2e, 0x74, 0x78, 0x74]); // Shift_JIS 0x8341 + ".txt"

test('default is cp437, and "cp437" / "CP437" / "ibm437" are the same thing', () => {
  for (const opts of [undefined, {}, { legacyEncoding: 'cp437' }, { legacyEncoding: 'CP437' }, { legacyEncoding: ' ibm437 ' }]) {
    const e = nameOf(cafe82, opts);
    assert.equal(e.name, 'café.txt', JSON.stringify(opts));
    assert.equal(e.nameSource, 'cp437');
  }
});

test('windows-1252 decodes the same bytes differently from cp437', () => {
  const e = nameOf(cafeE9, { legacyEncoding: 'windows-1252' });
  assert.equal(e.name, 'café.txt');
  assert.equal(e.nameSource, 'legacy');
  assert.equal(nameOf(cafe82, { legacyEncoding: 'windows-1252' }).name, 'caf\u201a.txt', '0x82 is a low quote in windows-1252, not é');
});

test('a multi-byte legacy encoding works (shift_jis)', () => {
  const e = nameOf(sjis, { legacyEncoding: 'shift_jis' });
  assert.equal(e.name, 'ア.txt');
  assert.equal(e.nameSource, 'legacy');
});

test('legacyEncoding only affects the last step: 0x7075, bit 11 and valid UTF-8 are untouched', () => {
  const opts = { legacyEncoding: 'windows-1252' };
  assert.deepEqual([nameOf('relatório.txt', opts, { flags: 0x800 }).name, nameOf('relatório.txt', opts, { flags: 0x800 }).nameSource], ['relatório.txt', 'flag']);
  assert.deepEqual([nameOf('relatório.txt', opts).name, nameOf('relatório.txt', opts).nameSource], ['relatório.txt', 'utf8']);
  const e = nameOf(cafeE9, opts, { extra: unicodePathExtra(cafeE9, 'unicode-wins.txt') });
  assert.deepEqual([e.name, e.nameSource], ['unicode-wins.txt', 'unicode-extra']);
  assert.deepEqual([nameOf('plain.txt', opts).name, nameOf('plain.txt', opts).nameSource], ['plain.txt', 'ascii']);
});

test('a legacy-decoded name does not count as "missing the UTF-8 flag"', () => {
  assert.equal(nameOf(cafeE9, { legacyEncoding: 'windows-1252' }).flagMissing, false);
});

test('openZip and readZipFile take the option too, and lookup uses the decoded name', () => {
  const p = put(buildZip([{ name: cafeE9, data: 'legacy content' }]));
  const z = openZip(p, { legacyEncoding: 'windows-1252' });
  try { assert.equal(z.read('café.txt').toString(), 'legacy content'); } finally { z.close(); }
  assert.equal(readZipFile(p, 'café.txt', { legacyEncoding: 'windows-1252' }).toString(), 'legacy content');
  assert.throws(() => readZipFile(p, 'café.txt'), (e) => e instanceof ZipError && e.code === 'ENOENT', 'under cp437 the name is different');
});

test('readZipFile still takes maxBytes next to the new option', () => {
  const p = put(buildZip([{ name: 'big.bin', data: Buffer.alloc(2000, 1) }]));
  assert.throws(() => readZipFile(p, 'big.bin', { maxBytes: 1000, legacyEncoding: 'cp437' }), ZipError);
  assert.equal(readZipFile(p, 'big.bin', { maxBytes: 2000, legacyEncoding: 'cp437' }).length, 2000);
});

test('bad values are refused with EBADARG: unknown label, non-string, and Unicode encodings', () => {
  const p = put(buildZip([{ name: 'a.txt', data: 'x' }]));
  for (const bad of ['klingon', '', 42, null, {}, 'utf-8', 'utf-16le']) {
    assert.throws(() => listZip(p, { legacyEncoding: bad }), (e) => e instanceof ZipError && e.code === 'EBADARG', String(bad));
    assert.throws(() => openZip(p, { legacyEncoding: bad }), (e) => e instanceof ZipError && e.code === 'EBADARG', String(bad));
  }
});

test('a refused option does not open (or leak) a descriptor', () => {
  const fds = () => (existsSync('/proc/self/fd') ? readdirSync('/proc/self/fd').length : null);
  const p = put(buildZip([{ name: 'a.txt', data: 'x' }])), before = fds();
  for (let i = 0; i < 1000; i++) assert.throws(() => openZip(p, { legacyEncoding: 'klingon' }), ZipError);
  if (before !== null) assert.equal(fds(), before, 'descriptor count changed');
});

// Some Node builds decode windows-1252 as latin1 (0x80-0x9F come out as C1 controls). The expectation below comes from
// Python's cp1252 (the 5 bytes Python leaves undefined map to the same C1 code points, as in the WHATWG table).
const CP1252_80_9F = '€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8dŽ\x8f\x90‘’“”•–—˜™š›œ\x9džŸ';
test('windows-1252: bytes 0x80-0x9F decode like cp1252 on every Node, and its aliases too', () => {
  const raw = Buffer.concat([Buffer.from('a'), Buffer.from(Array.from({ length: 32 }, (_, i) => 0x80 + i)), Buffer.from([0xe9, 0xff])]);
  for (const label of ['windows-1252', 'cp1252', 'latin1', 'iso-8859-1', 'WINDOWS-1252']) {
    const e = nameOf(raw, { legacyEncoding: label });
    assert.equal(e.name, 'a' + CP1252_80_9F + 'éÿ', label);
    assert.equal(e.nameSource, 'legacy');
  }
});

test('other single-byte labels are untouched by the windows-1252 table (iso-8859-2 keeps its own mapping)', () => {
  assert.equal(nameOf(Buffer.from([0x61, 0xb1]), { legacyEncoding: 'iso-8859-2' }).name, 'aą');
});
