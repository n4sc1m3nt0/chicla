// C15.21 (ZIP-017, D135): a failed extraction into a NEW destination leaves the destination absent and no `.chicla-tmp-*` folder,
// but the parent folders that were created for it (`mkdirSync(dirname(target), { recursive: true })` just before the final rename) stay, empty.
// This is documented (docs/zip-handling.md §3.2 and SECURITY.md), not a promise to remove them; the test pins the behaviour so a change is a decision.
// The failure is injected with the test-only `_rename` hook. Assertions use error codes and file system state, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { extractZip, ZipError } from '../src/zipkit.mjs';
import { realTmp } from './fsprobe.mjs';
import { buildZip } from './zipfab.mjs';

let dir;
before(() => { dir = mkdtempSync(join(realTmp(), 'chicla-zip-parent-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });
const zip = (name) => { const p = join(dir, name); writeFileSync(p, buildZip([{ name: 'a.txt', data: 'A' }])); return p; };
const failing = () => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); };
const tmpLeft = (...folders) => folders.flatMap((f) => readdirSync(f)).filter((x) => /^\.chicla-(tmp|bak)-/.test(x));

test('a failed extraction into a new destination: no destination, no temp folder, but the created parent folders remain', async () => {
  const root = join(dir, 'w1'); // `root` itself does not exist
  const dest = join(root, 'p', 'q', 'out');
  await assert.rejects(extractZip(zip('z1.zip'), dest, { _rename: failing }), (e) => e instanceof ZipError && e.cause?.code === 'EACCES');
  assert.equal(existsSync(dest), false, 'the destination was not created');
  assert.ok(existsSync(join(root, 'p', 'q')) && statSync(join(root, 'p', 'q')).isDirectory(), 'the parent folders made for it stay (ZIP-017)');
  assert.deepEqual(readdirSync(join(root, 'p', 'q')), [], 'and they are empty');
  assert.deepEqual(tmpLeft(dir, root, join(root, 'p'), join(root, 'p', 'q')), [], 'no temp or backup folder is left');
});

test('the same failure when the parent already exists leaves nothing behind', async () => {
  const dest = join(dir, 'out2');
  await assert.rejects(extractZip(zip('z2.zip'), dest, { _rename: failing }), (e) => e instanceof ZipError);
  assert.equal(existsSync(dest), false); assert.deepEqual(tmpLeft(dir), []);
});
