// Round 266 (C20.1, AUDIT-7 F-1; D-265a confirmed by Rodrigo: «aceito tudo. avança»): `scripts/bump-round.mjs` refuses an argument it does not know. Before, `--help` or a typo
// (`--verfy`) fell through to the default mode and did a REAL bump: the status file was renamed N to N+1 and the fingerprints rewritten (measured on a copy in AUDIT-7).
// Now: an unknown option, a stray word, `--note` with no text, or `--verify` with another mode exits 2 with a usage text and changes nothing; `--help` / `-h` print it and exit 0;
// every known form still works. Written before the code; red until it. Tests assert exit codes and file facts, never wording (product rule 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const copy = () => { const d = mkdtempSync(join(tmpdir(), 'chicla-bmpopt-')); cpSync(ROOT, d, { recursive: true, filter: (p) => !/(^|[\\/])node_modules([\\/]|$)/.test(p) }); return d; };
const run = (dir, ...a) => spawnSync(process.execPath, [join(dir, 'scripts/bump-round.mjs'), ...a], { encoding: 'utf8' });
const tree = (dir) => readdirSync(dir, { recursive: true }).sort().map((f) => { try { return `${f}:${readFileSync(join(dir, f), 'utf8')}`; } catch { return `${f}:/`; } }).join('␞');
const withCopy = (fn) => { const dir = copy(); try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };
const statusFiles = (dir) => readdirSync(dir).filter((f) => f.startsWith('CHICLA_PROJECT_STATUS-') && f.endsWith('.md'));

test('an option the script does not know, a stray word, `--note` with no text, or `--verify` with another mode: exit 2, a usage text on stderr, nothing changes', () => withCopy((dir) => {
  const before = tree(dir);
  for (const bad of [['--bogus'], ['--verfy'], ['--dry-runn'], ['stray'], ['-x'], ['--note'], ['--note', '--dry-run'], ['--refresh', 'oops'], ['--verify', '--refresh'], ['--verify', '--dry-run'], ['--verify', '--note', 'x']]) {
    const r = run(dir, ...bad);
    assert.equal(r.status, 2, `${bad.join(' ')}: exit ${r.status}`);
    assert.ok(r.stderr.trim().length > 0, `${bad.join(' ')}: a usage text on stderr`);
    assert.equal(r.stdout, '');
    assert.equal(tree(dir), before, `${bad.join(' ')}: nothing in the project changed`);
  }
}));

test('--help and -h print the usage on stdout, exit 0 and change nothing (they used to bump for real)', () => withCopy((dir) => {
  const before = tree(dir);
  for (const h of ['--help', '-h']) {
    const r = run(dir, h);
    assert.equal(r.status, 0, `${h}: exit ${r.status}`);
    assert.ok(r.stdout.trim().length > 0 && r.stderr === '');
    assert.equal(tree(dir), before, `${h}: nothing changed`);
  }
}));

test('every known form still works: --verify, --dry-run, --refresh --dry-run, --note <text> --dry-run write nothing and exit 0', () => withCopy((dir) => {
  const before = tree(dir);
  for (const ok of [['--verify'], ['--dry-run'], ['--refresh', '--dry-run'], ['--note', 'a note', '--dry-run'], ['--dry-run', '--note', 'x']]) {
    const r = run(dir, ...ok);
    assert.equal(r.status, 0, `${ok.join(' ')}: exit ${r.status}: ${r.stderr}`);
    assert.equal(tree(dir), before, `${ok.join(' ')}: writes nothing`);
  }
}));

test('without an option the default mode still bumps for real (the behaviour the check must keep): the status number goes up by one', () => withCopy((dir) => {
  const [name] = statusFiles(dir), n = +name.match(/-(\d+)\.md$/)[1];
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(statusFiles(dir), [`CHICLA_PROJECT_STATUS-${n + 1}.md`]);
}));
