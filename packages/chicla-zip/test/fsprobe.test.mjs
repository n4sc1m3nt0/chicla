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
