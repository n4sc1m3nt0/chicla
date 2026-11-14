// C30.7 (D164): the core of bump-round no longer spawns <root>/scripts/check-manifest.mjs when no manifest step is given.
// A bump or a refresh without `regenerateManifest` stops BEFORE writing (EBUMP_MANIFEST); a dry run and a verify need no step; with the step it works.
// Tests assert codes and files, never message text (one assertion: the message names no scripts/ path). Every project is a temp folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(KIT, '..', '..');
const { bumpRound } = await import(pathToFileURL(join(KIT, 'src', 'bump-round.mjs')).href);
const { checkManifest, renderCheckManifest } = await import(pathToFileURL(join(KIT, 'src', 'check-manifest.mjs')).href);
const { main } = await import(pathToFileURL(join(KIT, 'src', 'cli.mjs')).href);

const T = mkdtempSync(join(tmpdir(), 'chicla-c307-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
const sink = () => ({ text: '', write(x) { this.text += x; return true; } });
const step = (root) => { const m = checkManifest({ root, write: true }); return { ok: m.ok, ...renderCheckManifest(m) }; };

async function project() {
  const dir = join(T, `p${++n}`); mkdirSync(dir);
  assert.equal(await main(['init'], { stdout: sink(), stderr: sink(), cwd: dir }), 0);
  return dir;
}
const snapshot = (dir) => readdirSync(dir).sort().map((f) => `${f}=${readFileSync(join(dir, f), 'utf8').length}`).join('|');

test('a bump without a manifest step stops before writing anything: EBUMP_MANIFEST, the tree is as it was, and no scripts/ path is named', async () => {
  const dir = await project(), before = snapshot(dir);
  const r = bumpRound({ root: dir, mode: 'bump' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'EBUMP_MANIFEST');
  assert.equal(snapshot(dir), before);
  assert.ok(!JSON.stringify(r.messages).includes('scripts/'));
});

test('a refresh without a manifest step is refused the same way', async () => {
  const dir = await project(), before = snapshot(dir);
  const r = bumpRound({ root: dir, mode: 'refresh' });
  assert.equal(r.code, 'EBUMP_MANIFEST');
  assert.equal(snapshot(dir), before);
});

test('a dry run and a verify need no manifest step', async () => {
  const dir = await project();
  assert.equal(bumpRound({ root: dir, mode: 'bump', dry: true }).ok, true);
  assert.equal(bumpRound({ root: dir, mode: 'verify' }).ok, true);
});

test('with the manifest step a bump works: the status file number goes up by one', async () => {
  const dir = await project();
  const num = (d) => Number(readdirSync(d).find((f) => /_PROJECT_STATUS-\d+\.md$/.test(f)).match(/-(\d+)\.md$/)[1]);
  const was = num(dir);
  const r = bumpRound({ root: dir, mode: 'bump', regenerateManifest: step });
  assert.equal(r.ok, true, JSON.stringify(r.messages));
  assert.equal(num(dir), was + 1);
});

test('the wrapper scripts/bump-round.mjs of this repo still passes the step: --dry-run exits 0', () => {
  const r = spawnSync(process.execPath, [join(REPO, 'scripts/bump-round.mjs'), '--dry-run'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
