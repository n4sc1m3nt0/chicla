// C11.1, slice 1 — the `chicla` CLI: the dispatcher and ONE subcommand, `check-manifest`, running the SAME code as scripts/check-manifest.mjs
// (no child process). Design calls confirmed by Rodrigo (2026-10-12): `--json` = one object on stdout, human text on stderr; exit codes
// 0 ok, 1 check failed, 2 usage, 3 EHASH_TOOLCHAIN (reserved); a command that is planned but not built yet is refused with its own code.
// Tests assert result/error `code`s and exit statuses; the only text compared is the script's own output against the CLI's (parity).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHECK_MANIFEST_COPY, copyFiles } from '../../../test/toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI = join(ROOT, 'packages/chicla-kit/src/cli.mjs');
const { checkManifest } = await import(pathToFileURL(join(ROOT, 'scripts/check-manifest.mjs')).href);
const { main } = await import(pathToFileURL(CLI).href);

const NFC = 'caf\u00e9.txt', NFD = 'cafe\u0301.txt';

/** A fake project in a temp folder (no scripts in it: the CLI and the core come from the real tree, `--root` points here). */
const project = (files = { 'a.txt': 'a', 'sub/b.txt': 'b' }) => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c111-'));
  writeFileSync(join(T, 'package.json'), '{"name":"fake","private":true,"version":"0.0.1"}\n');
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(T, rel)), { recursive: true }); writeFileSync(join(T, rel), text); }
  return T;
};
const done = (T) => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 });
const holdsBoth = (() => { const T = project({ [NFC]: '1', [NFD]: '2' }); try { return existsSync(join(T, NFC)) && existsSync(join(T, NFD)) && readFileSync(join(T, NFC), 'utf8') === '1'; } finally { done(T); } })();

/** Runs the CLI in-process; returns { status, out, err }. */
const run = async (args, cwd) => {
  let out = '', err = '';
  const status = await main(args, { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd });
  return { status, out, err };
};

// ---- the core: checkManifest({ root, write }) never prints, never exits, never throws ----

test('core: --write writes a v2 manifest, then the check passes with nothing lost or added', () => {
  const T = project();
  try {
    const w = checkManifest({ root: T, write: true });
    assert.equal(w.ok, true); assert.equal(w.code, null); assert.equal(w.mode, 'write'); assert.equal(w.written, 3);
    assert.ok(readFileSync(join(T, 'FILES.manifest'), 'utf8').startsWith('# chicla-manifest v2\n'));
    const c = checkManifest({ root: T });
    assert.equal(c.ok, true); assert.equal(c.mode, 'check'); assert.deepEqual(c.lost, []); assert.deepEqual(c.added, []);
    assert.equal(c.listed, 3); assert.equal(c.files, 3);
  } finally { done(T); }
});

test('core: a listed file that is gone is LOST: ok is false and the path is named', () => {
  const T = project();
  try {
    checkManifest({ root: T, write: true });
    rmSync(join(T, 'sub/b.txt'));
    const c = checkManifest({ root: T });
    assert.equal(c.ok, false); assert.equal(c.code, 'EMANIFEST_LOST'); assert.deepEqual(c.lost, ['sub/b.txt']);
  } finally { done(T); }
});

test('core: a new file outside the manifest is only reported (ok stays true)', () => {
  const T = project();
  try {
    checkManifest({ root: T, write: true });
    writeFileSync(join(T, 'new.txt'), 'n');
    const c = checkManifest({ root: T });
    assert.equal(c.ok, true); assert.deepEqual(c.added, ['new.txt']);
  } finally { done(T); }
});

test('core: no FILES.manifest is a warning, not a failure', () => {
  const T = project();
  try { const c = checkManifest({ root: T }); assert.equal(c.ok, true); assert.equal(c.manifestMissing, true); } finally { done(T); }
});

test('core: a corrupt manifest fails with its code instead of passing', () => {
  const T = project();
  try {
    writeFileSync(join(T, 'FILES.manifest'), '# chicla-manifest v2\na.txt\tnothex\t1\n');
    const c = checkManifest({ root: T });
    assert.equal(c.ok, false); assert.equal(c.code, 'EMANIFEST_FORMAT');
  } finally { done(T); }
});

test('core: a bad policy file stops both modes with its code and writes nothing', () => {
  const T = project({ 'a.txt': 'a', 'chicla.policy.json': '{ not json' });
  try {
    for (const write of [false, true]) { const c = checkManifest({ root: T, write }); assert.equal(c.ok, false); assert.equal(c.code, 'EPOLICY_PARSE'); }
    assert.equal(existsSync(join(T, 'FILES.manifest')), false);
  } finally { done(T); }
});

test('core: two files that differ only in NFC/NFD fail both modes and leave the manifest as it was', { skip: !holdsBoth && 'this file system folds the two names' }, () => {
  const T = project({ 'a.txt': 'a', [NFC]: '1', [NFD]: '2' });
  try {
    writeFileSync(join(T, 'FILES.manifest'), 'a.txt\n');
    for (const write of [false, true]) { const c = checkManifest({ root: T, write }); assert.equal(c.ok, false); assert.equal(c.code, 'EMANIFEST_COLLISION'); }
    assert.equal(readFileSync(join(T, 'FILES.manifest'), 'utf8'), 'a.txt\n');
  } finally { done(T); }
});

test('core: importing scripts/check-manifest.mjs checks nothing (the script runs only when it is the entry point)', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(join(ROOT, 'scripts/check-manifest.mjs')).href)}); console.log('imported');`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, 'imported\n'); assert.equal(r.stderr, '');
});

// ---- the CLI: dispatcher, exit codes, --json ----

test('cli check-manifest: exit 0 when nothing is lost, 1 when something is', async () => {
  const T = project();
  try {
    assert.equal((await run(['check-manifest', '--write', '--root', T])).status, 0);
    assert.equal((await run(['check-manifest', '--root', T])).status, 0);
    rmSync(join(T, 'a.txt'));
    assert.equal((await run(['check-manifest', '--root', T])).status, 1);
  } finally { done(T); }
});

test('cli check-manifest: the root defaults to the current folder', async () => {
  const T = project();
  try {
    assert.equal((await run(['check-manifest', '--write'], T)).status, 0);
    assert.ok(existsSync(join(T, 'FILES.manifest')));
  } finally { done(T); }
});

test('cli check-manifest --json: ONE object on stdout, the human text on stderr', async () => {
  const T = project();
  try {
    await run(['check-manifest', '--write', '--root', T]);
    rmSync(join(T, 'a.txt'));
    const r = await run(['check-manifest', '--json', '--root', T]);
    assert.equal(r.status, 1);
    assert.equal(r.out.trim().split('\n').length, 1, 'one line');
    const o = JSON.parse(r.out);
    assert.equal(o.command, 'check-manifest'); assert.equal(o.ok, false); assert.equal(o.code, 'EMANIFEST_LOST'); assert.deepEqual(o.lost, ['a.txt']);
    assert.ok(r.err.length > 0, 'the human text is still shown, on stderr');
    const ok = await run(['check-manifest', '--write', '--json', '--root', T]);
    assert.equal(ok.status, 0); assert.equal(JSON.parse(ok.out).ok, true);
  } finally { done(T); }
});

test('parity: the CLI prints exactly what scripts/check-manifest.mjs prints (stdout, stderr, status) in the same project', async () => {
  const T = project();
  try {
    copyFiles(ROOT, T, CHECK_MANIFEST_COPY); // the wrapper, its core in the kit and the pinned files it reads
    const script = (...a) => spawnSync(process.execPath, [join(T, 'scripts/check-manifest.mjs'), ...a], { cwd: T, encoding: 'utf8' });
    const same = async (...a) => { const s = script(...a), c = await run(['check-manifest', ...a, '--root', T]); assert.equal(c.status, s.status, `status of ${a.join(' ') || 'check'}`); assert.equal(c.out, s.stdout); assert.equal(c.err, s.stderr); };
    await same('--write');
    await same();
    writeFileSync(join(T, 'new.txt'), 'n'); await same();          // a warning
    rmSync(join(T, 'sub/b.txt')); await same();                    // a lost file
    rmSync(join(T, 'FILES.manifest')); await same();               // no manifest
    writeFileSync(join(T, 'chicla.policy.json'), '{ not json'); await same(); await same('--write'); // a bad policy
  } finally { done(T); }
});

test('cli usage errors exit 2 with a code: no command, unknown command, unknown option', async () => {
  const none = await run([]); assert.equal(none.status, 2);
  const unk = await run(['frobnicate', '--json']); assert.equal(unk.status, 2); assert.equal(JSON.parse(unk.out).code, 'ECOMMAND_UNKNOWN');
  const opt = await run(['check-manifest', '--bogus', '--json']); assert.equal(opt.status, 2); assert.equal(JSON.parse(opt.out).code, 'EUSAGE');
});

test('cli: no command is pending any more (dump: slice 4a, recovery: slice 4b); checked with invocations that cannot run anything', async () => {
  for (const args of [['dump', '--bogus'], ['recovery']]) { // a bad option / no zip: a usage error, so nothing is dumped or extracted
    const r = await run([...args, '--json']);
    assert.equal(r.status, 2, args.join(' ')); assert.equal(JSON.parse(r.out).code, 'EUSAGE', args.join(' '));
  }
});

test('cli --help exits 0 and lists the subcommands on stdout', async () => {
  const r = await run(['--help']);
  assert.equal(r.status, 0); assert.match(r.out, /check-manifest/);
});

test('the real process: bin entry in package.json, shebang, exit status and --json through `node src/cli.mjs`', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'packages/chicla-kit/package.json'), 'utf8'));
  assert.equal(pkg.bin?.chicla, 'src/cli.mjs');
  assert.equal(pkg.version, '0.1.1', 'the kit version changes only at its releases (0.1.1 since round 276)');
  assert.ok(readFileSync(CLI, 'utf8').startsWith('#!/usr/bin/env node\n'));
  const T = project();
  try {
    const w = spawnSync(process.execPath, [CLI, 'check-manifest', '--write', '--json', '--root', T], { encoding: 'utf8' });
    assert.equal(w.status, 0, w.stderr); assert.equal(JSON.parse(w.stdout).written, 3);
    const u = spawnSync(process.execPath, [CLI, 'nope'], { encoding: 'utf8' });
    assert.equal(u.status, 2);
  } finally { done(T); }
});
