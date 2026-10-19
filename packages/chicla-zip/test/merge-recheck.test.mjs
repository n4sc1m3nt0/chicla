// C15.14 (ZIP-004 B, D134), slice 1: with `overwrite: false`, `mergeMove` looks again at the target right before EACH move. A file or folder that
// appeared after the plan (and after the previous move) is `EEXIST`, the moves already done are undone and the writer's item is untouched.
// This narrows the window, it does not close it: `concurrent-writer.test.mjs` (zip004 B) still pins the rest through a hook that runs AFTER the
// check. The race is made deterministic with the test-only `_rename`: while the FIRST move runs, a «writer» creates the target of the SECOND one.
// Assertions use error codes, file system state and content, never message text.
import { extractZip, ZipError } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, renameSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildZip } from './zipfab.mjs';

let base, n = 0;
before(() => { base = realpathSync(mkdtempSync(join(tmpdir(), 'chicla-zip-c1514-'))); });
// realpath: on macOS tmpdir() is /var/..., a symlink to /private/var/...; the code hands the hooks the REAL path, so the tests compare real paths (round 198).
after(() => { rmSync(base, { recursive: true, force: true }); });

// dest exists and is empty; the zip has two new top-level items, whatever order the plan takes them in.
const world = (entries) => {
  const w = join(base, `t${n++}`), dest = join(w, 'dest'); mkdirSync(dest, { recursive: true });
  const zip = join(w, 'z.zip'); writeFileSync(zip, buildZip(entries));
  return { dest, zip };
};
// The writer: on the first move it creates the OTHER target (as a file, or as a folder with `asDir`); later calls (the undo goes through `rn` too) just rename.
const writerHook = (dest, names, asDir) => {
  const moves = [];
  const _rename = (from, to) => {
    moves.push(to);
    if (moves.length === 1) { const other = names.map((x) => join(dest, x)).find((p) => p !== to); if (asDir) mkdirSync(other); else writeFileSync(other, 'WRITER'); }
    renameSync(from, to);
  };
  return { _rename, moves };
};
const twoFiles = [{ name: 'a.txt', data: 'ZIPDATA-A' }, { name: 'b.txt', data: 'ZIPDATA-B' }];

test('a file that appears before the second move is EEXIST: the first move is undone, the writer\'s file stays, nothing is saved or left', async () => {
  const { dest, zip } = world(twoFiles), { _rename, moves } = writerHook(dest, ['a.txt', 'b.txt']);
  await assert.rejects(extractZip(zip, dest, { overwrite: false, _rename }), (e) => e instanceof ZipError && e.code === 'EEXIST');
  assert.ok(moves.length >= 2, 'the writer ran during the first move and the second move was reached');
  const left = readdirSync(dest);
  assert.equal(left.length, 1, `only the writer's file is in the destination: ${left}`);
  assert.equal(readFileSync(join(dest, left[0]), 'utf8'), 'WRITER', 'and it was not replaced');
});

test('a folder that appears before the second move is EEXIST too (the check is on the target, not on its type)', async () => {
  const { dest, zip } = world(twoFiles), { _rename } = writerHook(dest, ['a.txt', 'b.txt'], true);
  await assert.rejects(extractZip(zip, dest, { overwrite: false, _rename }), (e) => e instanceof ZipError && e.code === 'EEXIST');
  const left = readdirSync(dest);
  assert.equal(left.length, 1, `only the writer's folder is in the destination: ${left}`);
  assert.deepEqual(readdirSync(join(dest, left[0])), [], 'and it is still empty');
});

test('the same thing in a new subtree that moves whole: a folder planned as new but created meanwhile is EEXIST', async () => {
  const { dest, zip } = world([{ name: 'sub/x.txt', data: 'ZIPDATA-X' }, { name: 'z.txt', data: 'ZIPDATA-Z' }]), { _rename } = writerHook(dest, ['sub', 'z.txt'], true);
  await assert.rejects(extractZip(zip, dest, { overwrite: false, _rename }), (e) => e instanceof ZipError && e.code === 'EEXIST');
  assert.ok(!existsSync(join(dest, 'sub', 'x.txt')), 'nothing of the zip entered the folder the writer made');
  assert.ok(!readdirSync(dest).some((x) => x.startsWith('.chicla-bak-')), 'no backup folder left');
});

test('control, overwrite: true is unchanged: the file that appears is replaced and the run succeeds', async () => {
  const { dest, zip } = world(twoFiles), { _rename } = writerHook(dest, ['a.txt', 'b.txt']);
  const r = await extractZip(zip, dest, { overwrite: true, _rename });
  assert.equal(r.files, 2);
  assert.equal(readFileSync(join(dest, 'a.txt'), 'utf8'), 'ZIPDATA-A');
  assert.equal(readFileSync(join(dest, 'b.txt'), 'utf8'), 'ZIPDATA-B');
  assert.ok(!readdirSync(dest).some((x) => x.startsWith('.chicla-bak-')), 'backups are dropped after a good run');
});

test('control, nobody writing: a plain merge with overwrite: false still works', async () => {
  const { dest, zip } = world(twoFiles);
  const r = await extractZip(zip, dest, { overwrite: false });
  assert.equal(r.files, 2);
  assert.deepEqual(readdirSync(dest).sort(), ['a.txt', 'b.txt']);
});
