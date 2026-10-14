// C11.1 slice 7 (D92 (1)): the kit CLI imports every core from packages/chicla-kit/src/ (and src/pinned/) directly; scripts/ is only a set of entry points for the workflow.
// A copy of the kit and of chicla-zip with NO scripts/ folder must run every command's core.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI_SRC = readFileSync(join(ROOT, 'packages/chicla-kit/src/cli.mjs'), 'utf8');

test('cli.mjs names no scripts/ path in code (comments and messages aside)', () => {
  const code = CLI_SRC.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(!/new URL\([^)]*scripts\//.test(code), 'no URL into scripts/');
  assert.ok(!/\.\.\/\.\.\/\.\.\/scripts/.test(code), 'no relative path to the root scripts/ folder');
  assert.ok(!/\bSCRIPTS\b/.test(code), 'the SCRIPTS base url is gone');
});

test('a copy of the kit and chicla-zip WITHOUT any scripts/ folder runs check-manifest', () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-src-'));
  try {
    for (const p of ['packages/chicla-kit/src', 'packages/chicla-zip/src']) cpSync(join(ROOT, p), join(T, p), { recursive: true });
    writeFileSync(join(T, 'package.json'), '{"name":"x","private":true}\n');
    const proj = join(T, 'proj'); mkdirSync(proj); writeFileSync(join(proj, 'a.txt'), 'hello\n');
    assert.ok(!existsSync(join(T, 'scripts')));
    const r = spawnSync(process.execPath, [join(T, 'packages/chicla-kit/src/cli.mjs'), 'check-manifest', '--write', '--root', proj], { cwd: T, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(existsSync(join(proj, 'FILES.manifest')));
    assert.ok(!/ECOMMAND_LOAD/.test(r.stdout + r.stderr));
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('every core the CLI loads exists under src/ (recovery from src/pinned/)', () => {
  const files = [...CLI_SRC.matchAll(/"((?:pinned\/)?[a-z-]+\.mjs)"/g)].map((m) => m[1]);
  assert.ok(files.length >= 6, files.join());
  for (const f of files) assert.ok(existsSync(join(ROOT, 'packages/chicla-kit/src', f)), f);
});
