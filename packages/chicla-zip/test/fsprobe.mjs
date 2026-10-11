// What THIS machine's file system and tools can do, measured, not guessed from the platform name (round 66: the macOS CI jobs).
// APFS on macOS: case-insensitive and normalisation-insensitive by default, refuses some names (U+FFFF: EILSEQ), and /var is a link to /private/var;
// Apple's `zipinfo` prints every non-ASCII byte as «?». The product is right on all of these (it refuses equivalent names with ECOLLISION);
// the tests that need a tree holding two equivalent names, or a faithful `zipinfo`, must not run where that is impossible.
import { mkdtempSync, writeFileSync, readdirSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildZip } from './zipfab.mjs';

const probe = (names) => {
  const d = mkdtempSync(join(tmpdir(), 'chicla-fsprobe-'));
  try { for (const n of names) writeFileSync(join(d, n), 'x'); return readdirSync(d).length; }
  catch (e) { return e.code === 'EILSEQ' ? -1 : -2; }
  finally { rmSync(d, { recursive: true, force: true }); }
};
/** true when `a.txt` and `A.txt` are the same file here */
export const caseInsensitive = probe(['a.txt', 'A.txt']) === 1;
/** true when NFC and NFD spellings of the same name are the same file here */
export const normalizing = probe(['café.txt', 'café.txt']) === 1;
/** true when this file system refuses a name with a Unicode noncharacter (macOS: EILSEQ) */
export const refusesNoncharacters = probe(['￿.txt']) === -1;
/** a temp base whose path has no links in it (macOS: /var/folders is /private/var/folders; the extractor reports real paths) */
export const realTmp = () => realpathSync(tmpdir());
/** Apple's zipinfo writes non-ASCII bytes as «?» (measured on a zip with one UTF-8 name, not guessed from the platform): there, names are
 *  compared with every run of such characters collapsed to one «?» */
export const lossyNames = (() => {
  const d = mkdtempSync(join(tmpdir(), 'chicla-fsprobe-'));
  try {
    const z = join(d, 'p.zip'); writeFileSync(z, buildZip([{ name: 'é-日.txt', data: 'x', flags: 0x800 }]));
    const r = spawnSync('zipinfo', ['-1', z], { encoding: 'utf8' });
    return !r.error && r.status === 0 && r.stdout.trim() !== 'é-日.txt';
  } catch { return false; } finally { rmSync(d, { recursive: true, force: true }); }
})();
export const lossy = (n) => n.replace(/[^\x20-\x7e]/g, '?').replace(/\?+/g, '?');
