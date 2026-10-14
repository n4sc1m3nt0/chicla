// M14, C14.2 (round 141, D96, D97), written before the code: extractZip, writeZip, writeZipStream and createZip apply `windowsNameProblems` when `windowsNames` is true
// (default: true only on win32, so Linux and macOS behave as before). A hit is EUNSAFE and NOTHING is written, like the other unsafe names; it is never renamed or corrected.
// Assertions use error codes and what is on disk, never message text (D18).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildZip } from './zipfab.mjs';
import { writeZip, writeZipStream, createZip, extractZip, windowsNameProblems } from '../src/zipkit.mjs';

let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-winnames-')); });
after(() => { rmSync(base, { recursive: true, force: true }); });
const fresh = () => { const d = join(base, `t${n++}`); mkdirSync(d); return d; };
const D = (name) => ({ name, data: Buffer.from('data data data data') });
const sinkOf = () => new Writable({ write(_c, _e, cb) { cb(); } });
const BAD = ['nul.txt', 'dir/CON', 'a<b', 'name.', 'dir /x', 'ab:stream', 'COM1.log', 'x/y?z', 'trail ', 'CONIN$'];
const GOOD = ['a.txt', 'dir/sub/b.txt', 'résumé.txt', 'CONSOLE.txt', 'COM10'];
const mk = async (names) => { const zip = join(fresh(), 'a.zip'); await writeZip(zip, names.map(D)); return zip; };
const refused = (p) => p.then(() => assert.fail('should have been refused'), (e) => { assert.equal(e.code, 'EUNSAFE'); return e; });

test('the sanity of the fixtures: every BAD name has a problem and every GOOD name has none', () => {
  for (const b of BAD) assert.ok(windowsNameProblems(b).length > 0, b);
  for (const g of GOOD) assert.deepEqual(windowsNameProblems(g), [], g);
});

test('extractZip with windowsNames: true refuses each bad name and writes NOTHING (even beside good names)', async () => {
  for (const b of BAD) {
    const zip = await mk([...GOOD, b]), dest = fresh();
    await refused(extractZip(zip, dest, { windowsNames: true }));
    assert.deepEqual(readdirSync(dest), [], `nothing written for ${b}`);
  }
});

test('extractZip with windowsNames: true extracts good names normally', async () => {
  const zip = await mk(GOOD), dest = fresh(), r = await extractZip(zip, dest, { windowsNames: true });
  assert.equal(r.files, GOOD.length); assert.ok(existsSync(join(dest, 'dir', 'sub', 'b.txt')));
});

test('extractZip with windowsNames: true also checks folder entries (a trailing slash is not part of the name)', async () => {
  const zip = join(fresh(), 'f.zip'); await writeZip(zip, [{ name: 'nul/' }, D('ok.txt')]);
  await refused(extractZip(zip, fresh(), { windowsNames: true }));
});

test('extractZip with windowsNames: false takes the same names (on any platform)', async () => {
  const zip = await mk(['nul.txt', 'x/COM1.log', 'trail.x']), dest = fresh();
  const r = await extractZip(zip, dest, { windowsNames: false }); assert.equal(r.files, 3);
});

test('extractZip default follows the platform: on win32 refuses, elsewhere accepts', async () => {
  const zip = await mk(['nul.txt']), dest = fresh();
  if (process.platform === 'win32') await refused(extractZip(zip, dest)); else assert.equal((await extractZip(zip, dest)).files, 1);
});

test('extractZip: a symlink entry is never created, so its Windows-bad name is skipped as before, not a reason to refuse', async () => {
  const zip = join(fresh(), 's.zip'); writeFileSync(zip, buildZip([{ name: 'ok.txt', data: Buffer.from('x') }, { name: 'nul', data: Buffer.from('ok.txt'), mode: 0o120777 }]));
  const dest = fresh(), r = await extractZip(zip, dest, { windowsNames: true });
  assert.deepEqual(r.skipped.map((k) => k.name), ['nul']); assert.deepEqual(readdirSync(dest), ['ok.txt']);
});

test('extractZip: windowsNames must be a boolean or undefined (EARG)', async () => {
  const zip = await mk(['a.txt']);
  for (const bad of ['yes', 1, null, {}]) await assert.rejects(extractZip(zip, fresh(), { windowsNames: bad }), { code: 'EARG' });
  await extractZip(zip, fresh(), { windowsNames: undefined });
});

test('writeZip with windowsNames: true refuses each bad name before writing the file', async () => {
  for (const b of BAD) {
    const out = join(fresh(), 'o.zip');
    await refused(writeZip(out, [...GOOD.map(D), D(b)], { windowsNames: true }));
    assert.ok(!existsSync(out) && !existsSync(`${out}.partial`), `no output for ${b}`);
  }
});

test('writeZip with windowsNames: true writes good names; without it (default off here) it takes bad ones as before', async () => {
  await writeZip(join(fresh(), 'g.zip'), GOOD.map(D), { windowsNames: true });
  if (process.platform !== 'win32') for (const b of BAD) await writeZip(join(fresh(), 'b.zip'), [D(b)]);
});

test('writeZipStream: the same refusal (EUNSAFE) and the same acceptance', async () => {
  const S = (name) => ({ name, stream: [Buffer.from('data')] });
  for (const b of BAD) await refused(writeZipStream(sinkOf(), [S(b)], { windowsNames: true }));
  await writeZipStream(sinkOf(), GOOD.map(S), { windowsNames: true });
});

test('createZip: a tree holding a Windows-unsafe name is refused with windowsNames: true, whole tree (and streamed) alike', async () => {
  for (const stream of [false, true]) {
    const root = join(fresh(), 'root'); mkdirSync(root); writeFileSync(join(root, 'ok.txt'), 'x'); writeFileSync(join(root, 'nul.txt'), 'x');
    const out = join(fresh(), 'o.zip');
    await refused(createZip(out, root, { windowsNames: true, stream }));
    assert.ok(!existsSync(out), `no output (stream ${stream})`);
  }
  const root = join(fresh(), 'root'); mkdirSync(root); writeFileSync(join(root, 'ok.txt'), 'x');
  const r = await createZip(join(fresh(), 'o.zip'), root, { windowsNames: true }); assert.equal(r.entries.length, 1);
});

test('writeZip, writeZipStream and createZip: windowsNames must be a boolean or undefined (EARG)', async () => {
  for (const bad of ['yes', 1, null]) {
    await assert.rejects(writeZip(join(fresh(), 'o.zip'), [D('a')], { windowsNames: bad }), { code: 'EARG' });
    await assert.rejects(writeZipStream(sinkOf(), [{ name: 'a', stream: [] }], { windowsNames: bad }), { code: 'EARG' });
  }
});
