// C30.2a (D160 D-B, D-J): what the npm package `chicla` ships must not tell the user to run `scripts/...`, a folder their project does not have.
// Static part: every mention of `scripts/` in src/ (outside pinned/) and templates/, comments aside, is counted per file against a list that says why it stays or which card removes it.
// The list is exact: a NEW mention fails, and so does one that went away without the list being updated (so the list can only shrink).
// Behaviour part: `chicla init` then `chicla bump-round` on a clean folder write a status file with no `scripts/` in it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { main } = await import(pathToFileURL(join(KIT, 'src', 'cli.mjs')).href);

// file -> how many non-comment mentions stay, and why
const ALLOWED = {
  'src/bump-round.mjs': { n: 2, why: 'BUMP_USAGE is the usage line of the wrapper scripts/bump-round.mjs; and the fallback that spawns <root>/scripts/check-manifest.mjs when a library caller gives no in-process manifest step (the kit CLI always does)' },
  'src/archive-changelog.mjs': { n: 9, why: 'PENDING C30.2b: its own usage and messages' },
  'src/check-manifest.mjs': { n: 3, why: 'PENDING C30.2b: the messages that say to run node scripts/check-manifest.mjs --write' },
};

const code = (line) => line.replace(/\s\/\/.*$/, '');
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? (f === 'pinned' ? [] : walk(p)) : [p]; });
const mentions = (file) => readFileSync(join(KIT, file), 'utf8').split('\n').filter((l) => !isComment(l) && code(l).includes('scripts/'));
const shipped = [...walk(join(KIT, 'src')), ...walk(join(KIT, 'templates'))].map((p) => p.slice(KIT.length + 1).replaceAll('\\', '/'));

test('no shipped file tells the user to run scripts/..., except the ones the list names with their reason', () => {
  for (const f of shipped) {
    const n = mentions(f).length, want = ALLOWED[f]?.n ?? 0;
    assert.equal(n, want, `${f}: ${n} mention(s) of scripts/ outside comments, the list allows ${want}`);
  }
  for (const f of Object.keys(ALLOWED)) assert.ok(shipped.includes(f), `${f} is in the list but is not a shipped file`);
});

test('templates (the files chicla init writes) never mention scripts/ at all', () => {
  for (const f of shipped.filter((p) => p.startsWith('templates/'))) assert.equal(mentions(f).length, 0, f);
});

const T = mkdtempSync(join(tmpdir(), 'chicla-c302a-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
const sink = () => ({ text: '', write(x) { this.text += x; return true; } });

test('chicla init then chicla bump-round: neither the files written nor the output mention scripts/', async () => {
  const dir = join(T, 'proj'); (await import('node:fs')).mkdirSync(dir);
  const run = async (...argv) => { const stdout = sink(), stderr = sink(); const code2 = await main(argv, { stdout, stderr, cwd: dir }); return { code: code2, out: stdout.text + stderr.text }; };
  const a = await run('init');
  assert.equal(a.code, 0, a.out);
  const b = await run('bump-round');
  assert.equal(b.code, 0, b.out);
  assert.ok(!a.out.includes('scripts/') && !b.out.includes('scripts/'), 'the output names scripts/');
  for (const f of readdirSync(dir).filter((x) => /\.(md|mjs|json)$/.test(x) || x === 'FILES.manifest')) assert.ok(!readFileSync(join(dir, f), 'utf8').includes('scripts/'), `${f} mentions scripts/`);
});
