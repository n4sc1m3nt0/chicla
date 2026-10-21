// Round 143 (G-C13, first Windows CI run): `createZip(path, root, { stream: true })` opened `<out>.partial` read-only ("r") and called `fh.sync()`.
// On Windows, fsync needs a handle with write access (FlushFileBuffers): the call fails with EPERM and ~30 tests of the windows job went red.
// Linux and macOS accept fsync on a read-only descriptor, so the bug cannot show here directly. The child process below emulates Windows: a handle
// opened with the plain flag "r" throws EPERM from sync(); any other handle works. A real Windows run (CI job `windows`, gate G-C13) is the final proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ZIPKIT = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '../src/zipkit.mjs')).href;

const CHILD = `
import fsp from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const orig = fsp.open;
fsp.open = async (p, flags, ...rest) => {
  const fh = await orig.call(fsp, p, flags, ...rest);
  if (flags === 'r') fh.sync = async () => { const e = new Error('EPERM: operation not permitted, fsync'); e.code = 'EPERM'; throw e; };
  return fh;
};
syncBuiltinESMExports();
const { createZip } = await import(process.argv[1]);
try {
  const r = await createZip(process.argv[2], process.argv[3], { stream: true });
  console.log(JSON.stringify({ ok: true, files: r.entries?.length ?? null }));
} catch (e) { console.log(JSON.stringify({ ok: false, code: e.code, message: e.message })); }
`;

test('createZip { stream: true } to a path syncs the file through a handle that can write (Windows refuses fsync on a read-only one)', () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-fsyncw-'));
  try {
    const root = join(T, 'tree'); mkdirSync(root); writeFileSync(join(root, 'f.txt'), 'hello');
    const out = join(T, 'o.zip');
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD, ZIPKIT, out, root], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const res = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.deepEqual(res.ok, true, JSON.stringify(res));
    assert.equal(readFileSync(out).subarray(0, 2).toString(), 'PK');
    assert.deepEqual(readdirSync(T).filter((x) => x.endsWith('.partial')), []);
  } finally { rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});
