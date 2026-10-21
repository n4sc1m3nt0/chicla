// C15.10 (ZIP-010, round 191), written before the code: the WRITERS refuse a list where one path is a file and also a folder, or the
// parent of another path (`a` and `a/b`, `a` and `a/`), with the rule extractZip already uses: a file key that is also a folder key, explicit
// or implied by another entry's path. EUNSAFE, and nothing is written (no output file, no `.partial`, zero bytes to a sink).
// Exact path comparison: «a» against «a.txt», «ab/x» or «A/x» is NOT this rule (case and NFC folding stay advisory, see write-collisions).
// Assertions use error codes and file system state, never message text.
import { writeZip, writeZipStream, extractZip, ZipError } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildZip } from './zipfab.mjs';

let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-zip010-')); });
after(() => { rmSync(base, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const fresh = () => { const d = join(base, `t${n++}`); mkdirSync(d); return d; };
const D = (s) => ({ name: s, data: Buffer.from('data data data data') });
const F = (s) => ({ name: s.endsWith('/') ? s : `${s}/` });

// Each writer reports how much it wrote: a file left in the folder, or the bytes a sink received.
const viaWriteZip = async (sources) => { const dir = fresh(); const out = join(dir, 'a.zip'); try { await writeZip(out, sources); return { ok: true, out }; } catch (e) { return { err: e, left: readdirSync(dir) }; } };
const viaStream = async (sources) => {
  let bytes = 0; const sink = new Writable({ write(c, _e, cb) { bytes += c.length; cb(); } });
  try { await writeZipStream(sink, sources.map((s) => (s.data ? { name: s.name, stream: [s.data] } : s))); return { ok: true, bytes }; } catch (e) { return { err: e, bytes }; }
};
const writers = { writeZip: viaWriteZip, writeZipStream: viaStream };
const untouched = (r) => (r.left ? r.left.length === 0 : r.bytes === 0);

const CONFLICTS = {
  'a file, then a file inside it': [D('a'), D('a/b.txt')],
  'a file inside it, then the file': [D('a/b.txt'), D('a')],
  'a file and an explicit folder of the same name': [D('a'), F('a')],
  'an explicit folder, then the file of the same name': [F('a'), D('a')],
  'a file and a deeper file through it': [D('x/a'), D('x/a/b/c.txt')],
  'a file and a deep file, an unrelated one between them': [D('d'), D('other.txt'), D('d/e/f.txt')],
  'a file and a folder inside it': [D('a'), F('a/sub')],
};

for (const [label, w] of Object.entries(writers)) {
  for (const [what, sources] of Object.entries(CONFLICTS)) {
    test(`${label}: ${what} is EUNSAFE and nothing is written`, async () => {
      const r = await w(sources);
      assert.ok(r.err instanceof ZipError, 'must be refused');
      assert.equal(r.err.code, 'EUNSAFE');
      assert.ok(untouched(r), 'nothing may be written');
    });
  }
  test(`${label}: names that only share a prefix, or differ in case, are not this conflict`, async () => {
    for (const sources of [[D('a'), D('a.txt'), D('ab/x'), D('a-b/y')], [D('a'), D('A/x')], [D('dir/a'), D('dir/a2/b'), F('dir/z')], [F('a'), D('a/b.txt'), D('a/c/d.txt')]]) {
      const r = await w(sources);
      assert.ok(r.ok, `must be written: ${r.err?.code}`);
    }
  });
  test(`${label}: a conflict is refused even when a later source is invalid or streamed, with no side effect`, async () => {
    const r = await w([D('a'), D('a/b'), D('c')]);
    assert.equal(r.err?.code, 'EUNSAFE');
    assert.ok(untouched(r));
  });
}

// The extractor applies the same rule to a zip another tool made: the very lists the writers refuse are refused by extractZip too.
test('extractZip refuses the lists the writers refuse (same rule, one source of truth)', async () => {
  for (const [what, sources] of Object.entries(CONFLICTS)) {
    const zip = join(fresh(), 'x.zip'), dest = join(fresh(), 'out');
    writeFileSync(zip, buildZip(sources.map((s) => (s.data ? { name: s.name, data: s.data.toString() } : { name: s.name, dir: true }))));
    const e = await extractZip(zip, dest).catch((err) => err);
    assert.ok(e instanceof ZipError, what);
    assert.equal(e.code, 'EUNSAFE', what);
    assert.equal(existsSync(dest), false, what);
  }
});

// Independent reader: what the writers accept still extracts the same with Python's zipfile (no regression of the happy path).
test('a list the writers accept is read back by Python zipfile and by extractZip', async () => {
  const sources = [F('a'), D('a/b.txt'), D('a/c/d.txt'), D('a.txt'), D('ab/x')];
  const out = join(fresh(), 'ok.zip'); await writeZip(out, sources);
  const py = spawnSync('python3', ['-c', 'import sys,zipfile\nzipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', out, join(fresh(), 'py')], { encoding: 'utf8' });
  if (py.error?.code !== 'ENOENT') assert.equal(py.status, 0, py.stderr);
  const dest = join(fresh(), 'ours'); const r = await extractZip(out, dest);
  assert.equal(r.files, 4);
});
