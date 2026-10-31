// Round 292 (C25.1, AUDIT-9 F-1, F-5): on Windows `smoke-test-tarball.mjs` started npm and the .bin\*.cmd shims with `{ shell: true }` and an argument ARRAY; Node joins the array with spaces and
// quotes nothing, so a temp or user folder with a space split the tarball path, the --root paths and the .cmd command. Now one command line is built with every part quoted
// (`scripts/win-quote.mjs`, a pure function, so it is tested on any system). Written before the code; red until it exists. Windows itself is not run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const { quoteWin, winLine } = await import(new URL('../scripts/win-quote.mjs', import.meta.url).href);

test('quoteWin wraps every part in double quotes, so a path with a space stays one argument', () => {
  assert.equal(quoteWin('C:\\Users\\Rodrigo Nascimento\\AppData\\Local\\Temp\\x.tgz'), '"C:\\Users\\Rodrigo Nascimento\\AppData\\Local\\Temp\\x.tgz"');
  assert.equal(quoteWin('--offline'), '"--offline"');
  assert.equal(quoteWin(''), '""');
});

test('quoteWin refuses what cannot be quoted for cmd.exe (a double quote, a line break) instead of building a wrong line', () => {
  for (const bad of ['a"b', 'a\nb', 'a\rb']) assert.throws(() => quoteWin(bad), (e) => e.code === 'EQUOTE');
});

test('winLine builds ONE command line: the command and each argument quoted, joined by single spaces', () => {
  const l = winLine('C:\\Temp dir\\node_modules\\.bin\\chicla.cmd', ['init', '--root', 'C:\\Temp dir\\fresh']);
  assert.equal(l, '"C:\\Temp dir\\node_modules\\.bin\\chicla.cmd" "init" "--root" "C:\\Temp dir\\fresh"');
});

test('smoke-test-tarball.mjs uses winLine for the shell calls on Windows and no longer passes an argument array with shell: true', () => {
  const src = readFileSync(join(root, 'scripts', 'smoke-test-tarball.mjs'), 'utf8');
  assert.match(src, /from "\.\/win-quote\.mjs"/);
  assert.match(src, /winLine\(/);
  assert.doesNotMatch(src, /const sh = WIN \? \{ shell: true \} : \{\}/, 'the old unquoted shell option is still there');
});

test('on this system the smoke script still passes (the Windows path must not change Linux and macOS)', { timeout: 120000 }, async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'smoke-test-tarball.mjs'), '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout.trim()).ok, true);
});

test('ROADMAP: C25.1 is done (round 292) and says that Windows was not run', () => {
  const c = readFileSync(join(root, 'ROADMAP.md'), 'utf8').split('\n').find((l) => l.startsWith('| C25.1 |')) ?? '';
  assert.match(c, /feito \(round 292/);
  assert.match(c, /Windows/);
  assert.match(c, /not run|NOT run/i);
});
