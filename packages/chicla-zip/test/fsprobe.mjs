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
/** decides from one run of `zipinfo -1` on a zip with the single UTF-8 name «é-日.txt»: Info-ZIP exits 1 for warnings (Windows prints the name through the OEM code page and warns), so 0 and 1 both count (round 147) */
export const lossyFromZipinfo = (r) => !r.error && (r.status === 0 || r.status === 1) && String(r.stdout).trim() !== '' && String(r.stdout).trim() !== 'é-日.txt';
/** what one run of the probe saw, for the failure messages (round 148: the round 147 probe stayed false on Windows and the logs did not say why) */
export const describeProbe = (r) => `status=${r.status} error=${r.error?.code ?? 'none'} stdout=${JSON.stringify(String(r.stdout ?? '').slice(0, 60))} stderr=${JSON.stringify(String(r.stderr ?? '').slice(0, 80))}`;
/** the probe, plus the platform: on Windows every CI log (five of them) shows the OEM code page rendering of non-ASCII names, whatever the probe said */
export const decideLossy = (r, platform) => lossyFromZipinfo(r) || platform === 'win32';
const lossyProbe = (() => {
  const d = mkdtempSync(join(tmpdir(), 'chicla-fsprobe-'));
  try {
    const z = join(d, 'p.zip'); writeFileSync(z, buildZip([{ name: 'é-日.txt', data: 'x', flags: 0x800 }]));
    const r = spawnSync('zipinfo', ['-1', z], { encoding: 'utf8' });
    return { lossy: decideLossy(r, process.platform), diag: describeProbe(r) };
  } catch (e) { return { lossy: process.platform === 'win32', diag: `the probe threw: ${e.message}` }; } finally { try { rmSync(d, { recursive: true, force: true }); } catch { /* a temp folder left behind is not a failure */ } }
})();
export const lossyNames = lossyProbe.lossy;
export const lossyDiag = lossyProbe.diag;
// On Windows the OEM code page turns the UTF-8 bytes of «é» into «+» and a replacement character (round 146): both count as the non-ASCII run there.
export const lossy = (n) => n.replace(process.platform === 'win32' ? /[^\x20-\x7e]|\+/g : /[^\x20-\x7e]/g, '?').replace(/\?+/g, '?');
