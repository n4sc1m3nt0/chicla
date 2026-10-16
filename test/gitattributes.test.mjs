// M14, D112 (round 156, confirmed by Rodrigo with «d112 sim»), written before the file exists. Round 155 CI log: on the Windows runner git's default `core.autocrlf=true` checked the text files
// out with CRLF, which broke FILES.manifest (every line ended in \r), the shebang of the CLI and 15 chicla-kit tests (reproduced on Linux with a CRLF copy). `.gitattributes` makes every
// checkout LF, on any platform and whatever the user's `core.autocrlf` says, so the manifest's crc32 and sizes stay true. Binary files are never touched.
// The behaviour test uses the real `git` (a temp repo, `core.autocrlf=true`, the same setting as the Windows runner); the control shows the problem is real without the file.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, '.gitattributes');
const haveGit = spawnSync('git', ['--version']).status === 0;
let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-gitattr-')); });
after(() => { rmSync(base, { recursive: true, force: true }); });
const lines = () => readFileSync(FILE, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const git = (cwd, ...a) => { const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`); return r.stdout; };

test('D112: `.gitattributes` is in the project root, and it is LF itself (a CRLF copy of it would not be read)', () => {
  assert.ok(existsSync(FILE), 'no .gitattributes in the project root');
  assert.ok(!readFileSync(FILE).includes(13), 'the file has a CR');
});

test('D112: every file is text=auto with eol=lf, and zip, tgz and png are binary', () => {
  const l = lines();
  assert.ok(l.includes('* text=auto eol=lf'), `lines: ${l.join(' | ')}`);
  for (const ext of ['zip', 'tgz', 'png']) assert.ok(l.some((x) => x === `*.${ext} binary`), `*.${ext} binary missing`);
});

// A repo made by hand: `core.autocrlf=true` is the Windows runner's setting; a checkout after removing the file is what a clone does.
const checkout = (withAttr) => {
  const d = join(base, `r${n++}`); git(base, 'init', '-q', d);
  git(d, 'config', 'core.autocrlf', 'true'); // on Linux this means: LF in the repo, CRLF in the work tree, exactly like the Windows runner
  if (withAttr) writeFileSync(join(d, '.gitattributes'), readFileSync(FILE));
  writeFileSync(join(d, 'a.mjs'), '#!/usr/bin/env node\nexport const x = 1;\n');
  writeFileSync(join(d, 'FILES.manifest'), '# chicla-manifest v2\na.mjs\t00000000\t10\n');
  writeFileSync(join(d, 'b.zip'), Buffer.from([0x50, 0x4b, 3, 4, 10, 13, 10, 0, 0xff]));
  git(d, 'add', '-A'); git(d, 'commit', '-q', '-m', 'x');
  for (const f of ['a.mjs', 'FILES.manifest', 'b.zip']) rmSync(join(d, f)); git(d, 'checkout', '--', '.');
  return d;
};

test('control: without the file, `core.autocrlf=true` writes CRLF into the work tree (the problem of round 155 is real and the test can see it)', { skip: !haveGit && 'git not found' }, () => {
  const d = checkout(false); assert.ok(readFileSync(join(d, 'a.mjs')).includes(13), 'expected CR in a.mjs without .gitattributes');
});

test('D112: with the project\'s `.gitattributes`, the checkout is LF even with `core.autocrlf=true` (script, manifest) and a binary file is byte for byte', { skip: !haveGit && 'git not found' }, () => {
  const d = checkout(true);
  assert.ok(!readFileSync(join(d, 'a.mjs')).includes(13), 'CR in a.mjs'); assert.ok(readFileSync(join(d, 'a.mjs'), 'utf8').startsWith('#!/usr/bin/env node\n'));
  assert.ok(!readFileSync(join(d, 'FILES.manifest')).includes(13), 'CR in FILES.manifest');
  assert.deepEqual([...readFileSync(join(d, 'b.zip'))], [0x50, 0x4b, 3, 4, 10, 13, 10, 0, 0xff], 'the binary file was changed');
});
