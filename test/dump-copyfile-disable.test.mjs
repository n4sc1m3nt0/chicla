// Round 179: the tar.gz fallback of the dump runs `tar` with COPYFILE_DISABLE=1. macOS's bsdtar otherwise adds an AppleDouble member («._name») for every
// file or folder that has extended attributes, so a dump made on a Mac carried junk beside the real files (seen on a Mac in round 178). Other tars ignore
// the variable. Checked on any system with a `tar` wrapper that records the variable it was started with and then runs the real tar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DUMP_COPY } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const which = (n) => spawnSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
const TAR = which('tar'), GZIP = which('gzip');
const BROKEN = 'export const writeZipStream = async () => { throw new Error("broken on purpose"); };\n';

// A dump that has to use tar: the writer is broken and there is no zip on the PATH. `outer` is the COPYFILE_DISABLE the test itself starts the dump with.
const run = (outer) => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-copyfile-'));
  try {
    const work = join(T, 'work'), proj = join(work, 'chicla'), outdir = join(T, 'out'), tool = join(T, 'tool'), bin = join(T, 'bin'), rec = join(T, 'rec.txt');
    mkdirSync(proj, { recursive: true }); mkdirSync(bin);
    writeFileSync(join(proj, 'package.json'), '{"version":"0.0.1"}\n'); writeFileSync(join(proj, 'FILES.manifest'), 'a.txt\n'); writeFileSync(join(proj, 'a.txt'), 'x\n');
    for (const f of DUMP_COPY) { mkdirSync(dirname(join(tool, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(tool, f)); }
    writeFileSync(join(tool, 'packages/chicla-zip/src/zipkit.mjs'), BROKEN);
    symlinkSync(process.execPath, join(bin, 'node')); symlinkSync(GZIP, join(bin, 'gzip'));
    writeFileSync(join(bin, 'tar'), `#!/bin/sh\nprintf '%s' "\${COPYFILE_DISABLE-unset}" >> '${rec}'\nexec '${TAR}' "$@"\n`); chmodSync(join(bin, 'tar'), 0o755);
    const env = { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, ...(outer === undefined ? {} : { COPYFILE_DISABLE: outer }) };
    const r = spawnSync(join(bin, 'node'), [join(tool, 'scripts/emergency-dump.mjs'), '--work', work, '--outdir', outdir, '--no-outputs', 'copyfile'], { encoding: 'utf8', env, maxBuffer: 1 << 28 });
    return { r, called: existsSync(rec) ? readFileSync(rec, 'utf8') : null, dumps: existsSync(outdir) ? readdirSync(outdir) : [] };
  } finally { rmSync(T, { recursive: true, force: true }); }
};

test('the tar fallback starts tar with COPYFILE_DISABLE=1 (the dump still comes out as a .tar.gz)', { skip: !TAR || !GZIP }, () => {
  const { r, called, dumps } = run(undefined);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(dumps.some((n) => n.endsWith('.tar.gz')), `a .tar.gz in ${dumps}`);
  assert.equal(called, '1');
});

test('it wins over a value the caller already had: COPYFILE_DISABLE=0 in the environment is still 1 for tar', { skip: !TAR || !GZIP }, () => {
  const { r, called } = run('0');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(called, '1');
});
