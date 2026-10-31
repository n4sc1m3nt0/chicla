// Round 295 (C25.4): the Windows leg of the `tarball` job (CI of round 294) ended `EINSTALL: npm install of the tarball failed (exit 1): node:internal/modules/cjs/loader:1433`:
// the first line of a Node stack is a file and a line number, not a reason. `scripts/failure-reason.mjs` (pure) picks the line that says what failed. Written before the code; red until it exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const { failureReason } = await import(new URL('../scripts/failure-reason.mjs', import.meta.url).href);

const NODE_STACK = ['node:internal/modules/cjs/loader:1433', '  throw err;', '  ^', '', "Error: Cannot find module 'C:\\x\\npm-cli.js'", '    at Function._resolveFilename (node:internal/modules/cjs/loader:1430:15)', "  code: 'MODULE_NOT_FOUND',"].join('\n');

test('a Node stack: the line that says Error, not the file and line number of the first line', () => {
  const r = failureReason(NODE_STACK);
  assert.match(r, /Cannot find module/);
  assert.doesNotMatch(r, /^node:internal/);
});

test('npm errors and ERR_ codes are found; the first matching line wins', () => {
  assert.match(failureReason('npm warn x\nnpm error code ENOENT\nnpm error path C:\\a b'), /ENOENT/);
  assert.match(failureReason('some noise\nTypeError [ERR_INVALID_ARG_TYPE]: bad\nError: later'), /ERR_INVALID_ARG_TYPE/);
});

test('no error-like line: the first five non-empty lines, so nothing is lost; empty input says so', () => {
  const r = failureReason('a\n\nb\nc\nd\ne\nf\ng');
  assert.equal(r, 'a | b | c | d | e');
  assert.equal(failureReason(''), 'no output');
  assert.equal(failureReason(undefined), 'no output');
});

test('the answer is one line of at most 400 characters', () => {
  const r = failureReason(`Error: ${'x'.repeat(2000)}`);
  assert.ok(r.length <= 400 && !r.includes('\n'));
});

test('smoke-test-tarball.mjs uses it for the install and for every step, and no longer cuts the first line of stderr', () => {
  const src = readFileSync(join(root, 'scripts', 'smoke-test-tarball.mjs'), 'utf8');
  assert.match(src, /from "\.\/failure-reason\.mjs"/);
  assert.doesNotMatch(src, /String\(inst\.stderr\)\.split\("\\n"\)\[0\]/, 'EINSTALL still shows only the first line');
  assert.doesNotMatch(src, /String\(r\.stderr \|\| r\.stdout\)\.split\("\\n"\)\[0\]/, 'exit0 still shows only the first line');
});

test('ROADMAP: C25.4 is done (round 295) and says that Windows was not run', () => {
  const c = readFileSync(join(root, 'ROADMAP.md'), 'utf8').split('\n').find((l) => l.startsWith('| C25.4 |')) ?? '';
  assert.match(c, /feito \(round 295/);
  assert.match(c, /not run|NOT run/i);
});
