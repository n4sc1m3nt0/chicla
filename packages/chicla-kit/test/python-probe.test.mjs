// M14, C14.7 (round 157, D113), written before the helper. Round 156 CI log, Windows: 20 chicla-kit tests failed with «null !== 0»: they found python with `sh -c 'command -v python3'`,
// which on the Windows runner prints a POSIX path (/c/hostedtoolcache/...) that Node cannot spawn. `findPython` asks the OS directly (no shell), trying `python3` and then `python`,
// and takes the first that can import `zipfile` (the one thing the tests use it for). It returns '' when there is none (the tests skip, as before).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPython } from './python-probe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fake = (ok) => { const calls = []; const run = (cmd, args) => { calls.push([cmd, ...args]); return ok.includes(cmd) ? { status: 0, stdout: '' } : { status: null, error: new Error('ENOENT') }; }; run.calls = calls; return run; };

test('findPython: python3 first; python when python3 is missing; \'\' when neither works', () => {
  assert.equal(findPython(fake(['python3', 'python'])), 'python3');
  assert.equal(findPython(fake(['python'])), 'python');
  assert.equal(findPython(fake([])), '');
});

test('findPython: a candidate that runs but cannot import zipfile (status 1) is skipped, and a spawn error (status null) is skipped', () => {
  const run = (cmd) => (cmd === 'python3' ? { status: 1 } : cmd === 'python' ? { status: 0 } : { status: null });
  assert.equal(findPython(run), 'python');
  assert.equal(findPython(() => ({ status: 1 })), '');
});

test('findPython never goes through a shell: no `sh`, no `command -v`, and it asks for `import zipfile`', () => {
  const run = fake(['python3']); findPython(run);
  assert.deepEqual(run.calls.map((c) => c[0]), ['python3']);
  assert.ok(run.calls[0].join(' ').includes('import zipfile'));
});

test('the chicla-kit tests that need python use findPython, none of them asks `sh` for it (the Windows runner prints a path Node cannot spawn)', () => {
  const files = readdirSync(HERE).filter((f) => /^cli-.*\.test\.mjs$/.test(f));
  const users = files.filter((f) => /\bPY\b/.test(readFileSync(join(HERE, f), 'utf8')));
  assert.ok(users.length >= 4, `expected at least four python users, found ${users.join(', ')}`);
  for (const f of users) { const s = readFileSync(join(HERE, f), 'utf8'); assert.ok(!/command -v/.test(s), `${f} still uses «command -v»`); assert.match(s, /findPython\(\)/, `${f} does not call findPython()`); }
});
