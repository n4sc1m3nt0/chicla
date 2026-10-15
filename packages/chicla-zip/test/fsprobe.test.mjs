// Round 66: the probes that let the suite run on macOS (APFS, Apple zipinfo). They must measure, return booleans, and the name mask must be stable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseInsensitive, normalizing, refusesNoncharacters, lossyNames, lossy, realTmp } from './fsprobe.mjs';
import { realpathSync } from 'node:fs';

test('every probe answers true or false', () => {
  for (const v of [caseInsensitive, normalizing, refusesNoncharacters, lossyNames]) assert.equal(typeof v, 'boolean');
});

test('realTmp has no links in it', () => assert.equal(realTmp(), realpathSync(realTmp())));

test('lossy: runs of non-ASCII characters (and what Apple prints for them) collapse to one «?»; ASCII is untouched', () => {
  assert.equal(lossy('café.txt'), 'caf?.txt');
  assert.equal(lossy('café.txt'), 'cafe?.txt');
  assert.equal(lossy('café.txt'), lossy('caf�?.txt'), 'the Apple spelling of é maps to the same name');
  assert.equal(lossy('dir/a b-c.txt'), 'dir/a b-c.txt');
  assert.equal(lossy('日本語/ß.txt'), '?/?.txt');
});

// Round 147: on Windows `zipinfo` exits 1 (a warning) while it prints the names through the OEM code page; the probe demanded exit 0, so `lossyNames`
// stayed false there and the readers compared raw names (31 red tests in the Windows job).
test('round 147: lossyNames is decided from what zipinfo printed, and an exit code of 1 (warning) still counts', async () => {
  const { lossyFromZipinfo } = await import('./fsprobe.mjs');
  assert.equal(lossyFromZipinfo({ status: 0, stdout: 'é-日.txt\n' }), false, 'a reader that prints the name as it is is not lossy');
  assert.equal(lossyFromZipinfo({ status: 0, stdout: '?-?.txt\n' }), true, 'macOS: «?» for every non-ASCII run');
  assert.equal(lossyFromZipinfo({ status: 1, stdout: '+\ufffd-+\ufffd.txt\n' }), true, 'Windows: warning exit and an OEM-code-page rendering');
  assert.equal(lossyFromZipinfo({ status: 127, stdout: '' }), false, 'no output: nothing to compare');
  assert.equal(lossyFromZipinfo({ status: 2, stdout: 'zipinfo: error\n' }), false, 'a real failure (exit 2 or more) is not a rendering');
  assert.equal(lossyFromZipinfo({ error: new Error('ENOENT'), status: null, stdout: '' }), false, 'zipinfo is not installed');
});

// Round 148: the round 147 probe was still false on Windows (the readers kept comparing raw names) and the cause is not visible from the logs.
// So: the decision takes the platform into account (five CI logs show the same «+» and U+FFFD for every non-ASCII name there), and the probe says what it saw.
test('round 148: Windows counts as lossy even when the probe says no, other platforms follow the probe, and the probe describes itself', async () => {
  const { decideLossy, describeProbe } = await import('./fsprobe.mjs');
  const failed = { status: 2, stdout: '' };
  assert.equal(decideLossy(failed, 'win32'), true);
  assert.equal(decideLossy(failed, 'linux'), false);
  assert.equal(decideLossy({ status: 0, stdout: '?-?.txt\n' }, 'darwin'), true);
  assert.equal(decideLossy({ status: 0, stdout: 'é-日.txt\n' }, 'linux'), false);
  const d = describeProbe({ status: 1, stdout: '+\ufffd-.txt\n', stderr: 'warning: x' });
  assert.match(d, /status=1/); assert.match(d, /error=none/); assert.match(d, /stdout="\+/); assert.match(d, /warning: x/);
  assert.match(describeProbe({ error: Object.assign(new Error('x'), { code: 'ENOENT' }), status: null, stdout: '' }), /error=ENOENT/);
  const { lossyDiag } = await import('./fsprobe.mjs');
  assert.equal(typeof lossyDiag, 'string'); assert.ok(lossyDiag.length > 0);
});
