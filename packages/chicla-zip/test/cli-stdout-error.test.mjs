// Round 203 / C15.20 / G-C5 ZIP-016 (D135, third security review): the CLI threw an uncaught exception (a stack trace) when stdout failed with something other
// than EPIPE or EOF, for example `ls > /dev/full` (ENOSPC), against «the CLI never throws» and «--json: nothing on stderr». The handler of the two standard streams
// now ends every output error with exit 1 and, when stdout (not stderr) is the stream that failed, one short line on stderr. A closed pipe stays quiet (A-1).
// `/dev/full` exists on Linux only: the tests are skipped elsewhere, with that reason. Assertions use exit codes and shapes, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildZip } from './zipfab.mjs';

const skip = existsSync('/dev/full') && process.platform === 'linux' ? false : 'needs /dev/full (Linux)';
let dir, zip;
before(() => { dir = mkdtempSync(join(tmpdir(), 'chicla-zip-stdout-')); zip = join(dir, 'a.zip'); writeFileSync(zip, buildZip([{ name: 'a.txt', data: 'HELLO' }])); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });
const CLI = fileURLToPath(new URL('../src/zipkit.mjs', import.meta.url)); // not `.pathname`: on Windows that is /D:/a/… (round 217)
const sh = (cmd) => spawnSync('sh', ['-c', cmd], { encoding: 'utf8', env: { ...process.env, CLI, ZIP: zip, NODE: process.execPath } });
const noStack = (s) => assert.doesNotMatch(s, /\n\s+at |node:internal|Unhandled|throw er/);

for (const [name, args] of [['ls', 'ls "$ZIP"'], ['ls --json', 'ls --json "$ZIP"'], ['cat', 'cat "$ZIP" a.txt'], ['test', 'test "$ZIP"']]) {
  test(`ZIP-016: «${name}» into a full device ends with exit 1, one short line and no stack trace`, { skip }, () => {
    const r = sh(`"$NODE" "$CLI" ${args} > /dev/full`);
    assert.equal(r.status, 1);
    noStack(r.stderr);
    assert.ok(r.stderr.trim().length > 0 && r.stderr.trim().split('\n').length === 1, 'one short line, not a trace and not silence');
  });
}

test('ZIP-016: a failing command whose stderr is the full device still ends with exit 1 and nothing is thrown through', { skip }, () => {
  const r = sh('"$NODE" "$CLI" ls "$ZIP.missing" 2> /dev/full');
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
});

test('ZIP-016 controls: a closed pipe (`ls | head`) stays quiet, and a normal run is untouched', { skip: process.platform === 'win32' && 'POSIX shell' }, () => {
  // enough output (about 200 KB) that the writer is still writing when `head` has gone: a small listing never meets the closed pipe
  const big = join(dir, 'big.zip');
  writeFileSync(big, buildZip(Array.from({ length: 3000 }, (_, i) => ({ name: `folder-with-a-rather-long-name/file-number-${String(i).padStart(5, '0')}.txt`, data: 'x' }))));
  const piped = sh(`"$NODE" "$CLI" ls "${big}" | head -c1`);
  assert.equal(piped.stdout.length, 1);
  noStack(piped.stderr);
  assert.equal(piped.stderr, '', 'a closed pipe is not an error to report');
  const ok = sh('"$NODE" "$CLI" cat "$ZIP" a.txt');
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout, 'HELLO');
});

test('ZIP-016 docs: §8 of zip-handling.md describes the output errors and the closed stdout', () => {
  const doc = readFileSync(new URL('../../../docs/zip-handling.md', import.meta.url), 'utf8');
  assert.match(doc, /Output errors \(G-C5 ZIP-016/);
  assert.match(doc, /never a stack trace/);
  assert.match(doc, /closed \(`>&-`\)/);
});
