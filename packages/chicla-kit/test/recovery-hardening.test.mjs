// C16.1 (AUDIT-4 S-1, S-2; D137, D-234c): `recovery` (1) refuses a .tar.gz instead of handing it to the system `tar` (a zip is hostile input, product rule 2; the
// dump keeps writing a .tar.gz as its third fallback, and that one is recovered by hand), and (2) where its default folder is not /home/claude/recovered it extracts
// into a FRESH mkdtemp folder, never a predictable one another user could have created first. Tests assert codes and exit statuses, never message text.
// This changes a PINNED file, so the pin in CLAUDE.md moves (bump-round writes it).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned, pinnedFile } from '../../../test/toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { recoveryReport } = await importPinned('recovery-report');
const { main } = await import(pathToFileURL(join(ROOT, 'packages/chicla-kit/src/cli.mjs')).href);
const T = mkdtempSync(join(tmpdir(), 'chicla-c161-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
const sink = () => { let s = ''; return { write: (x) => { s += x; return true; }, get text() { return s; } }; };
const GZ = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0, 3, 0x03, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]); // the start of a gzip stream (an empty one)

test('a .tar.gz, .tgz or .tar (any case) is refused with ERECOVERY_FORMAT and nothing is created', async () => {
  for (const name of ['d.tar.gz', 'D.TAR.GZ', 'd.tgz', 'd.tar']) {
    const f = join(T, name), out = join(T, `out-${name}`);
    writeFileSync(f, GZ);
    const r = await recoveryReport({ dump: f, out });
    assert.equal(r.ok, false, name); assert.equal(r.code, 'ERECOVERY_FORMAT', name);
    assert.equal(existsSync(out), false, `${name}: no folder was created`);
  }
});

test('a gzip stream under any other name (a .zip that is really a .tar.gz) is refused the same way', async () => {
  const f = join(T, 'disguised.zip'), out = join(T, 'out-disguised');
  writeFileSync(f, GZ);
  const r = await recoveryReport({ dump: f, out });
  assert.equal(r.code, 'ERECOVERY_FORMAT');
  assert.equal(existsSync(out), false);
});

test('chicla recovery <x.tar.gz>: exit 1, --json carries the code, nothing extracted', async () => {
  const f = join(T, 'cli.tar.gz'), out = join(T, 'out-cli');
  writeFileSync(f, GZ);
  const o = sink(), e = sink();
  const status = await main(['recovery', f, '--out', out, '--json'], { stdout: o, stderr: e, cwd: T });
  assert.equal(status, 1);
  assert.equal(JSON.parse(o.text).code, 'ERECOVERY_FORMAT');
  assert.equal(existsSync(out), false);
});

test('the pinned file no longer runs the system `tar`', () => {
  const src = readFileSync(pinnedFile(ROOT, 'recovery-report'), 'utf8');
  assert.equal(/\bsh\("tar"/.test(src) || /spawnSync\("tar"/.test(src), false);
});

test('the fallback default is a fresh mkdtemp folder: two runs never share one, and a folder planted at the old fixed name is never used', async () => {
  const tmp = join(T, 'faketmp'); mkdirSync(tmp);
  mkdirSync(join(tmp, 'chicla-recovered')); // what another user could have created first
  mkdirSync(join(tmp, 'chicla-recovered-2'));
  const bad = join(T, 'garbage.zip'); writeFileSync(bad, 'not a zip');
  const env = { platform: 'win32', exists: () => false, tmp };
  for (let i = 0; i < 2; i++) assert.equal((await recoveryReport({ dump: bad, _env: env })).code, 'ERECOVERY_EXTRACT');
  const made = readdirSync(tmp).filter((n) => n !== 'chicla-recovered' && n !== 'chicla-recovered-2');
  assert.equal(made.length, 2, `two fresh folders, got ${made}`);
  for (const n of made) { assert.match(n, /^chicla-recovered-[A-Za-z0-9]{6}$/); if (process.platform !== 'win32') assert.equal(statSync(join(tmp, n)).mode & 0o077, 0, 'private to the owner'); }
  assert.deepEqual(readdirSync(join(tmp, 'chicla-recovered')), [], 'the planted folder was not touched');
});

test('an explicit --out keeps the old behaviour: the folder is used, and -2, -3 are appended when it exists', async () => {
  const bad = join(T, 'garbage2.zip'); writeFileSync(bad, 'not a zip');
  const out = join(T, 'explicit');
  await recoveryReport({ dump: bad, out }); await recoveryReport({ dump: bad, out });
  assert.ok(existsSync(out) && existsSync(`${out}-2`));
});
