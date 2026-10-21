// C3.1: interoperability contract for the writer (C3.2 onwards). PROVISIONAL API, C3.2 may adjust it with its own tests:
//   writeZip(outPath, sources, opts?) -> Promise<{ entries, bytes }>, sources: [{ name, data }] and folders [{ name: 'dir/' }].
// Until `writeZip` is exported these are `todo` (they cannot run, and the report says so); the moment it exists they run for real,
// with no edit. They were shown to FAIL against a deliberately bad writer (see the CHANGELOG of round 15).
// Whatever the writer writes must be accepted by unzip, zipinfo, Python zipfile and the Chicla reader (7z when installed), with the
// right names and content, in both stored and deflate; names are written exactly as given (no normalisation) and non-ASCII ones carry bit 11.
import * as zk from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkZip } from './interop.mjs';
import { normalizing } from './fsprobe.mjs';

const writeZip = zk.writeZip, T = writeZip ? test : test.todo;
let dir, n = 0;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-winterop-')); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const out = () => join(dir, `w${n++}.zip`);
const asSources = (tree) => Object.entries(tree).map(([name, v]) => (name.endsWith('/') ? { name } : { name, data: Buffer.from(v) }));
const noise = (len) => { const b = Buffer.alloc(len); let x = 12345; for (let i = 0; i < len; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; b[i] = x >>> 24; } return b; };

const CASES = {
  'plain names, text and empty file and folder': { 'a.txt': 'hello', 'empty': '', 'dir/': '', 'dir/b.txt': 'inside' },
  'non-ASCII names, NFC and NFD kept as given': { 'caf\u00e9.txt': 'nfc', 'cafe\u0301.txt': 'nfd', '\u30a2/\u00df.txt': 'deep' },
  'compressible and incompressible, small and large': { 'zeros.bin': Buffer.alloc(3_000_000), 'noise.bin': noise(400_000), 'tiny.txt': 'x', 'text.txt': 'chicla '.repeat(50_000) },
  '300 small files in nested folders': Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`d${i % 7}/e${i % 3}/f${i}.txt`, `file ${i}`])),
};
for (const [label, tree] of Object.entries(CASES)) {
  T(`readers agree: ${label}`, async () => {
    const p = out(); await writeZip(p, asSources(tree));
    const c = await checkZip(p, tree);
    assert.deepEqual(c.problems, []);
    for (const t of ['unzip', 'zipinfo', 'python', 'chicla']) assert.ok(c.ran.includes(t), `${t} did not run`);
    assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.partial')), [], 'a .partial file was left');
  });
}

T('the empty file is stored (an empty deflate entry is rejected by unzip) and non-ASCII names carry bit 11', async () => {
  const p = out(); await writeZip(p, asSources({ 'empty': '', '\u00e9.txt': 'x', 'plain.txt': 'y' }));
  const { entries } = zk.listZip(p), by = Object.fromEntries(entries.map((e) => [e.name, e]));
  assert.equal(by.empty.method, 0);
  const py = spawnSync('python3', ['-c', 'import sys,zipfile,json\nprint(json.dumps({i.filename:i.flag_bits for i in zipfile.ZipFile(sys.argv[1]).infolist()}))', p], { encoding: 'utf8' });
  const bits = JSON.parse(py.stdout);
  assert.ok(bits['\u00e9.txt'] & 0x800, 'bit 11 not set on a non-ASCII name');
});

T('compressible data is deflated and incompressible data is not inflated (the zip is smaller than the data only where it can be)', async () => {
  const p = out(); await writeZip(p, asSources({ 'zeros.bin': Buffer.alloc(1_000_000), 'noise.bin': noise(100_000) }));
  const by = Object.fromEntries(zk.listZip(p).entries.map((e) => [e.name, e]));
  assert.equal(by['zeros.bin'].method, 8); assert.ok(by['zeros.bin'].csize < 10_000);
  assert.ok(by['noise.bin'].csize <= by['noise.bin'].usize + 16, 'incompressible data grew');
  assert.ok(statSync(p).size < 1_200_000);
});

T('round trip: what the Chicla writer wrote, the Chicla extractor gives back byte for byte', { skip: normalizing && 'this file system treats NFC and NFD as one name: the extractor refuses the NFC/NFD pair (ECOLLISION)' }, async () => {
  const tree = CASES['non-ASCII names, NFC and NFD kept as given'], p = out(), dest = join(dir, `x${n++}`);
  await writeZip(p, asSources(tree)); await zk.extractZip(p, dest);
  for (const [name, v] of Object.entries(tree)) assert.deepEqual(readFileSync(join(dest, name)), Buffer.from(v), name);
});
