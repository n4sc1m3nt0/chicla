// C15.13 (ZIP-003 and ZIP-004, D134, round 194): the PINNED LIMIT. `createZip` (the walk) and the merge mode of `extractZip` are NOT safe against
// somebody else writing to the tree or the destination at the same moment. These tests do not promise that behaviour: they pin it as KNOWN, so a
// change (C15.14 narrows the window, C15.15 closes it on Linux) turns them red on purpose and the docs (`SECURITY.md`, `docs/zip-handling.md`) are
// changed in the same round. No source file was touched by C15.13: the tests pass from the start, because they describe what the code does today.
// The races are made deterministic with the hooks the code already has: `exclude` (called after the walk's lstat and before it reads the folder)
// and the test-only `_rename` (called for each move of a merge, after the plan and after the last existence check).
// Linux and macOS only (symlinks). Assertions use error codes, file system state and file content, never message text.
import { createZip, extractZip, listZip, readZipFile, ZipError } from '../src/zipkit.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, renameSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildZip } from './zipfab.mjs';
const skip = process.platform === 'win32' ? 'symlinks need rights on Windows' : false;

let base, n = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'chicla-zip-c1513-')); });
after(() => { rmSync(base, { recursive: true, force: true }); });
const fresh = () => { const d = join(base, `t${n++}`); mkdirSync(d); return d; };

// ---- ZIP-003: the walk of createZip -------------------------------------------------------------------------------------------------------------
// The walk lstats `d` (a real folder), asks `exclude`, then reads the folder by its PATH. A writer that swaps `d` for a symlink in between makes the
// walk list and read the files of the symlink's target: they enter the zip under the names `d/...`. Not caught: the file itself is a regular file,
// and O_NOFOLLOW only looks at the last component of the path.
const world003 = () => {
  const w = fresh(), root = join(w, 'root'), outside = join(w, 'outside');
  mkdirSync(join(root, 'd'), { recursive: true }); mkdirSync(outside);
  writeFileSync(join(root, 'd', 'in.txt'), 'INSIDE'); writeFileSync(join(root, 'ok.txt'), 'fine'); writeFileSync(join(outside, 'secret.txt'), 'OUTSIDE');
  const swap = (name, { isDir }) => { if (name === 'd' && isDir) { rmSync(join(root, 'd'), { recursive: true }); symlinkSync(outside, join(root, 'd')); } return false; };
  return { w, root, outside, swap };
};
for (const stream of [false, true]) {
  test(`zip003 (known limit, stream: ${stream}): a folder swapped for a symlink between the listing and the read puts files from OUTSIDE the tree into the zip`, { skip }, async () => {
    const { w, root, swap } = world003(), out = join(w, 'a.zip');
    await createZip(out, root, { exclude: swap, stream });
    const names = listZip(out).entries.map((e) => e.name);
    assert.ok(names.includes('d/secret.txt'), `the file from outside entered as d/secret.txt: ${names}`);
    assert.equal((await readZipFile(out, 'd/secret.txt')).toString(), 'OUTSIDE');
    assert.ok(!names.includes('d/in.txt'), 'and the real content of d is not there');
  });
  test(`zip003 control (stream: ${stream}): with nobody swapping, a symlinked folder is skipped and nothing from outside enters`, { skip }, async () => {
    const { w, root, outside } = world003(), out = join(w, 'a.zip');
    rmSync(join(root, 'd'), { recursive: true }); symlinkSync(outside, join(root, 'd'));
    const r = await createZip(out, root, { stream });
    assert.deepEqual(r.skipped, [{ name: 'd', reason: 'symlink' }]);
    assert.deepEqual(listZip(out).entries.map((e) => e.name), ['ok.txt']);
  });
}

// ---- ZIP-004 A: a folder of the destination swapped for a symlink during the merge --------------------------------------------------------------
// The plan said «sub exists in the destination, move new.txt into it». The move goes by path. A writer that swaps `dest/sub` for a symlink after the
// plan makes the rename land in the symlink's target.
const world004 = () => {
  const w = fresh(), dest = join(w, 'dest'), outside = join(w, 'outside');
  mkdirSync(join(dest, 'sub'), { recursive: true }); mkdirSync(outside);
  const zip = join(w, 'z.zip'); writeFileSync(zip, buildZip([{ name: 'sub/new.txt', data: 'ZIPDATA' }, { name: 'a.txt', data: 'alpha' }]));
  return { w, dest, outside, zip };
};
test('zip004 A (known limit): a destination folder swapped for a symlink after the plan receives the file in the symlink target', { skip }, async () => {
  const { dest, outside, zip } = world004(); let swapped = false;
  const _rename = (from, to) => {
    if (!swapped && to === join(dest, 'sub', 'new.txt')) { swapped = true; rmSync(join(dest, 'sub'), { recursive: true }); symlinkSync(outside, join(dest, 'sub')); }
    renameSync(from, to);
  };
  const r = await extractZip(zip, dest, { _rename });
  assert.equal(r.files, 2);
  assert.equal(readFileSync(join(outside, 'new.txt'), 'utf8'), 'ZIPDATA', 'the file landed OUTSIDE the destination');
});
test('zip004 A control: with nobody swapping, the file lands in the existing folder and nothing goes outside', { skip }, async () => {
  const { dest, outside, zip } = world004();
  await extractZip(zip, dest);
  assert.equal(readFileSync(join(dest, 'sub', 'new.txt'), 'utf8'), 'ZIPDATA');
  assert.deepEqual(readdirSync(outside), []);
});

// ---- ZIP-004 B: a file created in the destination while the merge runs ---------------------------------------------------------------------------
// With `overwrite: false` an existing file is EEXIST, from the plan. A file that appears AFTER the plan and the last existence check is replaced by the
// rename, and no backup of it was made (the backup is made only for a file that existed at that check). C15.14 re-checks right before each move, which
// shrinks the window and does not close it: this hook runs after any such check, so the test stays true after C15.14.
const world004b = () => {
  const w = fresh(), dest = join(w, 'dest'); mkdirSync(dest);
  const zip = join(w, 'z.zip'); writeFileSync(zip, buildZip([{ name: 'a.txt', data: 'ZIPDATA' }]));
  return { dest, zip };
};
test('zip004 B (known limit): a file that appears in the destination during the merge is replaced although overwrite is false, with no backup', { skip }, async () => {
  const { dest, zip } = world004b();
  const _rename = (from, to) => { writeFileSync(to, 'WRITER'); renameSync(from, to); };
  const r = await extractZip(zip, dest, { overwrite: false, _rename });
  assert.equal(r.files, 1);
  assert.equal(readFileSync(join(dest, 'a.txt'), 'utf8'), 'ZIPDATA', 'the writer\'s file was replaced, not refused');
  assert.deepEqual(readdirSync(dest).filter((x) => x.startsWith('.chicla-bak-')), [], 'and nothing was saved');
});
test('zip004 B control: a file that already exists BEFORE the merge is EEXIST and stays as it was', { skip }, async () => {
  const { dest, zip } = world004b(); writeFileSync(join(dest, 'a.txt'), 'WRITER');
  await assert.rejects(extractZip(zip, dest, { overwrite: false }), (e) => e instanceof ZipError && e.code === 'EEXIST');
  assert.equal(readFileSync(join(dest, 'a.txt'), 'utf8'), 'WRITER');
  assert.ok(!existsSync(join(dest, 'sub')));
});
