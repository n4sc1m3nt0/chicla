// C15.22 (ZIP-018, D135): two mutants of the list had no test that went red. Both guarantees get one here.
// (1) C5.3b-A13: merging into an existing destination WITHOUT overwrite refuses an existing file in the plan, before anything moves.
// (2) C5.1-central-bounds: a central entry whose name runs past the end of the central directory is refused, not read short.
// Assertions use error codes and file system state, never message text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { extractZip, openZip, ZipError } from '../src/zipkit.mjs';
import { realTmp } from './fsprobe.mjs';
import { buildZip } from './zipfab.mjs';
import { local, central, eocd } from './zipraw.mjs';

let dir, n = 0;
before(() => { dir = mkdtempSync(join(realTmp(), 'chicla-zip-018-')); });
after(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); });

test('merge without overwrite: an existing file is refused in the plan, no rename is attempted, the destination is untouched', async () => {
  const dest = join(dir, `d${n++}`); mkdirSync(dest); writeFileSync(join(dest, 'a.txt'), 'OLD'); writeFileSync(join(dest, 'keep.txt'), 'KEEP');
  const zip = join(dir, `z${n++}.zip`); writeFileSync(zip, buildZip([{ name: 'a.txt', data: 'NEW' }, { name: 'b.txt', data: 'NEW-B' }]));
  const calls = []; const _rename = (f, t) => { calls.push([f, t]); renameSync(f, t); };
  await assert.rejects(extractZip(zip, dest, { _rename }), (e) => e instanceof ZipError && e.code === 'EEXIST');
  assert.deepEqual(calls, [], 'nothing moved before the refusal');
  assert.equal(readFileSync(join(dest, 'a.txt'), 'utf8'), 'OLD'); assert.deepEqual(readdirSync(dest).sort(), ['a.txt', 'keep.txt']);
});

test('a central entry whose declared name length runs past the central directory is refused, not read short', () => {
  // the directory ends exactly where the end record starts (so the layout check passes), but the entry claims a name 6 bytes longer than what is left
  const name = 'abc.txt', data = 'hello', l = local(name, data), c = Buffer.from(central(name, data, 0));
  c.writeUInt16LE(name.length + 6, 28);
  const p = join(dir, `z${n++}.zip`); writeFileSync(p, Buffer.concat([l, c, eocd({ total: 1, cdSize: c.length, cdOff: l.length })]));
  assert.throws(() => openZip(p), (e) => e instanceof ZipError);
});
