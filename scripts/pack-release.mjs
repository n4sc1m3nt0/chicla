#!/usr/bin/env node
// pack-release: pack a package with `npm pack` into --out, write <file>.sha256 beside it and print release notes (C5.5 slice b).
// It never publishes (CLAUDE.md product rule 4). Exit 0 ok, 1 refused, 2 usage. With --json stdout is exactly one line.
//   node scripts/pack-release.mjs <package-dir> --out <dir> [--json]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';

const WIN = process.platform === 'win32'; // `npm` is a .cmd file there: only a shell starts it, and a shell needs each argument quoted (a path may hold a space)
const argv = process.argv.slice(2);
const json = argv.includes('--json');
const done = (code, obj, text) => { process.stdout.write(json ? JSON.stringify(obj) + '\n' : text.endsWith('\n') ? text : text + '\n'); process.exit(code); };
const usage = (m) => done(2, { ok: false, error: { code: 'EUSAGE', message: m } }, `✗ ${m}\nusage: pack-release.mjs <package-dir> --out <dir> [--json]`);
const refuse = (code, m) => done(1, { ok: false, error: { code, message: m } }, `✗ ${code}: ${m}`);

let dir, out;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') continue;
  if (a === '--out') { out = argv[++i]; if (!out) usage('--out needs a value'); }
  else if (a.startsWith('--')) usage(`unknown option ${a}`);
  else if (dir === undefined) dir = a; else usage('one package folder only');
}
if (!dir) usage('no package folder');
if (!out) usage('no --out');
dir = resolve(dir); out = resolve(out);
if (!existsSync(join(dir, 'package.json'))) usage(`no package.json in ${dir}`);

const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
if (pkg.private) refuse('EPRIVATE', `${pkg.name} is private`);

// A package whose `bin` targets or `files` entries are not in the folder would be packed as a broken tarball (packages/chicla is only metadata until build-chicla.mjs assembles it).
{
  const binTargets = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin ?? {});
  const missing = [...binTargets, ...(pkg.files ?? []).filter((f) => !/[*?[]/.test(f))].map((f) => String(f).replace(/^\.\//, '')).filter((f) => f !== 'LICENSE' && !existsSync(join(dir, f))); // a missing LICENSE is ELICENSE's, below
  if (missing.length) refuse('EINCOMPLETE', `${pkg.name}: not in the folder: ${[...new Set(missing)].join(', ')}`);
}

// The tarball is built in a scratch folder, checked, and only then copied to --out, so a refusal writes nothing.
const scratch = mkdtempSync(join(tmpdir(), 'chicla-pack-'));
process.on('exit', () => rmSync(scratch, { recursive: true, force: true })); // done() and refuse() end the process
{
  let packed;
  try { packed = Object.values(JSON.parse(execFileSync('npm', WIN ? ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch].map((a) => `"${a}"`) : ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: WIN })))[0]; } // npm up to 11 prints a list, npm 12 an object keyed by package name: the first value is the package either way
  catch (e) { refuse('EPACK', String(e.stderr || e.message).split('\n')[0]); }
  if (!packed.files.some((f) => f.path === 'LICENSE')) refuse('ELICENSE', 'the tarball carries no LICENSE');
  const tgz = join(scratch, packed.filename);
  const sha = createHash('sha256').update(readFileSync(tgz)).digest('hex');
  const size = statSync(tgz).size;
  mkdirSync(out, { recursive: true });
  copyFileSync(tgz, join(out, packed.filename));
  writeFileSync(join(out, `${packed.filename}.sha256`), `${sha}  ${packed.filename}\n`);
  const files = packed.files.map((f) => f.path).sort();
  const notes = [`## ${pkg.name} ${pkg.version}`, '', `| File | Size | sha256 |`, `| --- | --- | --- |`, `| \`${packed.filename}\` | ${size} bytes | \`${sha}\` |`, '', `Contents: ${files.map((f) => `\`${f}\``).join(', ')}.`, `Check: \`sha256sum -c ${packed.filename}.sha256\`.`, `Licence: ${pkg.license}.`].join('\n');
  done(0, { ok: true, name: pkg.name, version: pkg.version, file: packed.filename, sha256: sha, size, files }, notes);
}
