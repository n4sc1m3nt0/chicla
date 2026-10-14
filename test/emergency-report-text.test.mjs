// Round 90: the report inside a dump no longer says to send "the LAST good delivery zip" with it (D44 did this for the /dump sentence; the baseline
// travels inside the dump since C9.6). It still tells the next session to say «recovery mode». Python reads the zip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PY = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();

test('round 90: the dump report asks for «recovery mode» and not for the last delivery zip', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-r90-'));
  try {
    const proj = join(T, 'work', 'chicla');
    for (const [rel, text] of Object.entries({ 'package.json': '{"version":"0.0.1"}\n', 'CHANGELOG.md': '## Round 1\n', 'FILES.manifest': 'a.txt\n', 'a.txt': 'a\n' })) { mkdirSync(dirname(join(proj, rel)), { recursive: true }); writeFileSync(join(proj, rel), text); }
    const outdir = join(T, 'out');
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/emergency-dump.mjs'), '--work', join(T, 'work'), '--outdir', outdir, '--no-outputs', 'r90'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const z = readdirSync(outdir).find((f) => f.endsWith('.zip'));
    assert.ok(z, 'a zip');
    const report = spawnSync(PY, ['-c', 'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("RECOVERY_REPORT.md").decode())', join(outdir, z)], { encoding: 'utf8' }).stdout;
    assert.ok(/recovery mode/.test(report), 'it still says to use recovery mode');
    assert.ok(!/delivery zip/i.test(report), 'it does not ask for the last delivery zip');
  } finally { rmSync(T, { recursive: true, force: true }); }
});
