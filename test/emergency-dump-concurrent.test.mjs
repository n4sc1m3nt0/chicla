// The external zip/tar fallback of emergency-dump used to build its archive at tmpdir()/<zip name>, a name with one-second resolution shared by every process.
// Two dumps started in the same second (node --test runs the test files in parallel, CI saw it once on Node 18) deleted each other's archive:
// «ENOENT: copyfile '/tmp/chicla-EMERGENCY-…' -> …». The archive now lives in the dump's own mkdtemp folder.
// This test runs several dumps at once, in the same second, with the SAME TMPDIR and the chicla-zip writer broken (so every one takes the external path),
// and asserts that all of them come out, and that nothing is left in the shared TMPDIR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DUMP_COPY } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const which = (n) => spawnSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
const ZIP = which('zip'), TAR = which('tar'), GZIP = which('gzip'), PY = which('python3');
const BROKEN = 'export const writeZipStream = async () => { throw new Error("broken on purpose"); };\n';
const N = 8;

const run = (cmd, args, opts) => new Promise((resolve) => {
  const p = spawn(cmd, args, opts); let out = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  p.on('close', (status) => resolve({ status, out }));
});

for (const [mode, tools] of [['zip', [ZIP]], ['tar', [TAR, GZIP]]]) {
  test(`emergency-dump (${mode} fallback): dumps started together with one TMPDIR all come out and leave nothing in it`, { skip: !PY || tools.some((t) => !t) }, async () => {
    const T = mkdtempSync(join(tmpdir(), 'chicla-conc-'));
    try {
      const shared = join(T, 'shared-tmp'); mkdirSync(shared);
      const tool = join(T, 'tool'), bin = join(T, 'bin'); mkdirSync(bin);
      for (const f of DUMP_COPY) { mkdirSync(dirname(join(tool, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(tool, f)); }
      writeFileSync(join(tool, 'packages/chicla-zip/src/zipkit.mjs'), BROKEN);
      symlinkSync(process.execPath, join(bin, 'node'));
      for (const t of tools) symlinkSync(t, join(bin, t.split('/').pop()));
      const env = { PATH: bin, HOME: process.env.HOME, TMPDIR: shared };
      const jobs = [];
      for (let i = 0; i < N; i++) {
        const work = join(T, `work${i}`), out = join(T, `out${i}`);
        mkdirSync(join(work, 'chicla'), { recursive: true }); mkdirSync(out);
        writeFileSync(join(work, 'chicla/package.json'), '{"version":"0.0.1"}\n'); writeFileSync(join(work, 'chicla/FILES.manifest'), 'a.txt\n');
        for (let k = 0; k < 40; k++) writeFileSync(join(work, `chicla/f${k}.txt`), `file ${k}\n`.repeat(200));
        jobs.push(run(join(bin, 'node'), [join(tool, 'scripts/emergency-dump.mjs'), '--work', work, '--outdir', out, '--no-outputs', 'conc'], { env }).then((r) => ({ ...r, out_: out })));
      }
      const res = await Promise.all(jobs);
      for (const r of res) {
        assert.equal(r.status, 0, 'the dump always comes out: ' + r.out);
        assert.equal(readdirSync(r.out_).filter((n) => n.endsWith(mode === 'tar' ? '.tar.gz' : '.zip')).length, 1, 'exactly one archive in ' + r.out_);
      }
      assert.deepEqual(readdirSync(shared), [], 'nothing is left in the shared TMPDIR');
    } finally { rmSync(T, { recursive: true, force: true }); }
  });
}
