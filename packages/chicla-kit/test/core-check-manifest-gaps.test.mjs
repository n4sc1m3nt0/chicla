// C19.6 (round 262, D-261a, AUDIT-6 F-5): four gaps that the kit mutants of `check-manifest.mjs` (round 261) showed: K-CMN-14, -15, -18, -20.
// Each test goes red against its mutant (`npm run mutants:kit -- --only K-CMN-nn`). Every project is a temp folder; a v1 manifest (one path per line) is written by hand.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkManifest, renderCheckManifest } from '../src/check-manifest.mjs';

const T = mkdtempSync(join(tmpdir(), 'chicla-c196-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
const project = (files, manifest) => {
  const p = join(T, `p${n++}`);
  mkdirSync(p);
  for (const f of files) writeFileSync(join(p, f), 'x\n');
  if (manifest !== undefined) writeFileSync(join(p, 'FILES.manifest'), manifest);
  return p;
};

test('K-CMN-14: a renamed status file is not a loss, but two status files on disk with the listed one gone ARE a lost file', () => {
  const one = project(['CHICLA_PROJECT_STATUS-6.md'], 'CHICLA_PROJECT_STATUS-5.md\n');
  const a = checkManifest({ root: one });
  assert.equal(a.ok, true, 'exactly one status file now: a deliberate rename');
  const two = project(['CHICLA_PROJECT_STATUS-6.md', 'CHICLA_PROJECT_STATUS-7.md'], 'CHICLA_PROJECT_STATUS-5.md\n');
  const b = checkManifest({ root: two });
  assert.equal(b.ok, false);
  assert.equal(b.code, 'EMANIFEST_LOST');
  assert.deepEqual(b.lost, ['CHICLA_PROJECT_STATUS-5.md']);
});

test('K-CMN-15: a file on disk in NFD (a macOS checkout) and a manifest in NFC (git) are the same file: nothing lost, nothing new', () => {
  const nfc = '\u00e9.txt', nfd = 'e\u0301.txt';
  assert.notEqual(nfc, nfd);
  const p = project([nfd], `${nfc}\n`);
  const r = checkManifest({ root: p });
  assert.equal(r.ok, true);
  assert.deepEqual(r.lost, []);
  assert.deepEqual(r.added, [], 'the NFD name on disk is listed, in its NFC spelling');
  assert.ok(!r.messages.some((m) => /new file/.test(m.text)));
});

test('K-CMN-18: the warning about new files names 15 of them and no more', () => {
  const files = Array.from({ length: 20 }, (_, i) => `f${String(i).padStart(2, '0')}.txt`);
  const p = project(files, 'f00.txt\n');
  const r = checkManifest({ root: p });
  assert.equal(r.ok, true, 'new files only warn');
  assert.equal(r.added.length, 19);
  const m = r.messages.find((x) => /new file\(s\) outside/.test(x.text));
  assert.ok(m, 'the warning is there');
  assert.match(m.text, /^⚠ 19 new file\(s\)/);
  assert.equal(m.text.split('\n  ').length - 1, 15, 'exactly 15 names follow the header');
});

test('K-CMN-20: renderCheckManifest gives the text of each stream, one line per message, in order', () => {
  const r = { messages: [{ stream: 'out', text: 'a' }, { stream: 'err', text: 'b' }, { stream: 'out', text: 'c' }] };
  assert.deepEqual(renderCheckManifest(r), { out: 'a\nc\n', err: 'b\n' });
  assert.deepEqual(renderCheckManifest({ messages: [] }), { out: '', err: '' });
});
