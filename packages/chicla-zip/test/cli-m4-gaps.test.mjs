// C5.3b slice 6 (round 57): the first run of the M4 mutants (mutants/list.mjs, ids M4-*) showed nine behaviours of the command line that no test pinned.
// Written red first (each fails against its mutant); they assert exit codes, error `code`s and the shape of the output, never the wording of a message.
import { runCli } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildZip } from './zipfab.mjs';
import { normalizing } from './fsprobe.mjs';

let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-m4-')); });
after(() => { rmSync(base, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const fresh = () => { const d = join(base, `t${n++}`); mkdirSync(d); return d; };
const zipOf = (entries) => { const p = join(fresh(), 'a.zip'); writeFileSync(p, buildZip(entries)); return p; };
const sinkOf = () => { const parts = []; return { write: (c) => { parts.push(Buffer.from(c)); return true; }, text: () => Buffer.concat(parts).toString('utf8') }; };
const cli = async (...argv) => { const out = sinkOf(), err = sinkOf(); const code = await runCli(argv, { out, err }); return { code, out: out.text(), err: err.text() }; };

test('an internal error prints its stack on stderr, not only the message', async () => {
  const boom = { write() { throw new TypeError('boom'); } }, err = sinkOf();
  assert.equal(await runCli(['ls', zipOf([{ name: 'a.txt', data: 'x' }])], { out: boom, err }), 3);
  assert.match(err.text(), /TypeError/); assert.match(err.text(), /\n\s+at /);
});

test('if stdout is the broken part, a failure in --json still reaches stderr', async () => {
  const dead = { write() { throw Object.assign(new Error('closed'), { code: 'EPIPE' }); } }, err = sinkOf();
  assert.equal(await runCli(['ls', join(fresh(), 'missing.zip'), '--json'], { out: dead, err }), 1);
  assert.notEqual(err.text(), '');
});

test('a raw system error (mark on a missing zip) is exit 1 with its own code, not an internal error', async () => {
  const r = await cli('mark', join(fresh(), 'missing.zip'), '--json');
  assert.equal(r.code, 1); assert.equal(JSON.parse(r.out).error.code, 'ENOENT');
});

test('ls text: the size sits right-aligned in ten columns', async () => {
  const r = await cli('ls', zipOf([{ name: 'a.txt', data: 'x' }]));
  assert.match(r.out, /^ {9}1 {2}a\.txt\n$/);
});

test('a control character below 0x10 in a name is shown as two hex digits', async () => {
  const r = await cli('ls', zipOf([{ name: 'a\x01b', data: 'x' }]));
  assert.ok(r.out.includes('a\\x01b'), r.out);
});

test('test: a folder entry is not an unsafe name', async () => {
  const r = await cli('test', zipOf([{ name: 'dir/', dir: true }, { name: 'dir/b.txt', data: 'bee' }]), '--json');
  assert.equal(r.code, 0); assert.deepEqual(JSON.parse(r.out).warnings.unsafeNames, []);
});

test('test text: six unsafe names are counted, five are named', async () => {
  const r = await cli('test', zipOf([1, 2, 3, 4, 5, 6].map((i) => ({ name: `../x${i}`, data: 'x' }))));
  assert.equal(r.code, 0); assert.match(r.out, /! 6 unsafe name/);
  assert.ok(r.out.includes('x5') && !r.out.includes('x6'), r.out);
});

test('mark --json: patched counts only the entries it changed', async () => {
  const j = JSON.parse((await cli('mark', zipOf([{ name: 'é.txt', data: 'x' }, { name: 'a.txt', data: 'y' }]), '--json')).out);
  assert.deepEqual([j.patched, j.total], [1, 2]);
});

test('extract text: names that differ only in NFC/NFD are reported', { skip: normalizing && 'this file system treats NFC and NFD as one name: extract refuses them (ECOLLISION), which is the right answer there' }, async () => {
  const nfc = 'caf\u00e9.txt', nfd = 'cafe\u0301.txt';
  const r = await cli('extract', zipOf([{ name: nfc, data: 'a', flags: 0x800 }, { name: nfd, data: 'b', flags: 0x800 }]), join(fresh(), 'o'));
  assert.equal(r.code, 0); assert.match(r.out, /equivalent names/);
});

// C4.5 (round 59, D40): a zip whose DOS date is zero (month or day 0, as reproducible-build tools write it) has no valid date; `ls --json` said so with an internal error (exit 3).
const zeroDate = (entries, which = 'both') => {
  const b = buildZip(entries), p = join(fresh(), 'z.zip');
  for (let i = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); i >= 0; i = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), i + 4)) {
    if (which === 'both' || which === 'date') b.writeUInt16LE(0, i + 14);
    if (which === 'both' || which === 'time') b.writeUInt16LE(0, i + 12);
  }
  writeFileSync(p, b); return p;
};

test('ls --json: a zip with a zero DOS date lists with mtime null, exit 0 (D40)', async () => {
  const r = await cli('ls', zeroDate([{ name: 'a.txt', data: 'x' }, { name: 'b.txt', data: 'y' }]), '--json');
  assert.equal(r.code, 0); assert.equal(r.err, '');
  const j = JSON.parse(r.out); assert.equal(j.ok, true); assert.deepEqual(j.entries.map((e) => e.mtime), [null, null]);
});

test('ls --json: only the entries without a valid date get null, the others keep their ISO date', async () => {
  const b = buildZip([{ name: 'a.txt', data: 'x' }, { name: 'b.txt', data: 'y' }]), p = join(fresh(), 'm.zip');
  const first = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])), second = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), first + 4);
  b.writeUInt16LE(0, second + 14); writeFileSync(p, b);
  const m = JSON.parse((await cli('ls', p, '--json')).out).entries.map((e) => e.mtime);
  assert.match(m[0], /^\d{4}-\d{2}-\d{2}T/); assert.equal(m[1], null);
});

test('ls text and test still work on a zip with a zero DOS date', async () => {
  const z = zeroDate([{ name: 'a.txt', data: 'x' }]);
  assert.equal((await cli('ls', z)).code, 0); assert.equal((await cli('test', z)).code, 0);
});
