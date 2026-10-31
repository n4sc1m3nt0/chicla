// Round 296 (C25.5): CI of round 295 showed the real reason of the Windows `EINSTALL`: `Cannot find module '…\proj\node_modules\npm\bin\npm-prefix.js'`, the folder where npm runs, not npm's own.
// `npm.cmd` finds its files through %~dp0; started as `"npm"` (the command name in quotes, no path) cmd.exe does not resolve it through PATH and %~dp0 is the current folder. The cause is INFERRED (the path in the
// error is the cwd), not confirmed on Windows. C25.1 had quoted the command too: now a bare command name (`npm`) stays bare, a command with a path or a space stays quoted, every argument stays quoted.
// Written before the code; red until it is true. Windows itself is not run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const { winLine } = await import(new URL('../scripts/win-quote.mjs', import.meta.url).href);

test('a bare command name is NOT quoted (npm), its arguments are', () => {
  assert.equal(winLine('npm', ['install', '--offline', 'C:\\Temp dir\\x.tgz']), 'npm "install" "--offline" "C:\\Temp dir\\x.tgz"');
  assert.equal(winLine('npm', []), 'npm');
});

test('a command with a path or a space IS quoted (the .bin shim of an installed package, a folder with a space)', () => {
  assert.equal(winLine('C:\\Temp dir\\node_modules\\.bin\\chicla.cmd', ['init']), '"C:\\Temp dir\\node_modules\\.bin\\chicla.cmd" "init"');
  assert.equal(winLine('C:\\t\\chicla.cmd', []), '"C:\\t\\chicla.cmd"');
  assert.equal(winLine('my tool', ['a']), '"my tool" "a"');
});

test('a command name with a character cmd.exe reads (& | < > ^ %) is quoted, never left bare', () => {
  for (const c of ['a&b', 'a|b', 'a<b', 'a>b', 'a^b', 'a%b']) assert.match(winLine(c, []), /^".*"$/, c);
});

test('smoke-test-tarball.mjs stops with EINIT when `npm init` fails, instead of going on to a second, different error', () => {
  const src = readFileSync(join(root, 'scripts', 'smoke-test-tarball.mjs'), 'utf8');
  assert.match(src, /refuse\("EINIT"/);
});

test('ROADMAP: C25.5 is done (round 296) and says that Windows was not run', () => {
  const c = readFileSync(join(root, 'ROADMAP.md'), 'utf8').split('\n').find((l) => l.startsWith('| C25.5 |')) ?? '';
  assert.match(c, /feito \(round 296/);
  assert.match(c, /not run|NOT run/i);
});
