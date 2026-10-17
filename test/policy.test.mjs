// C6.1 slice a (round 93): the «never leaves» rules of the manifest and of the delivery check live in ONE place, src/pinned/policy.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINNED, importPinned } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const policy = await importPinned('policy');

test('neverShipReason: what never leaves, and why', () => {
  const r = policy.neverShipReason;
  assert.equal(r('.env'), '.env file (secrets)');
  assert.equal(r('app/.env.local'), '.env file (secrets)');
  assert.equal(r('.env.example'), null);
  assert.equal(r('a/.env.sample'), null);
  assert.equal(r('x/__pycache__/m.cpython-312.pyc'), 'Python artefact');
  assert.equal(r('tool.pyc'), 'Python artefact');
  assert.equal(r('.venv/bin/python'), 'Python artefact');
  // D64: corpus folders are no rule of Chicla
  for (const p of ['corpus/real-world/a.pdf', 'corpus/huge/b/c.bin', 'corpus/huge/.gitkeep', 'docs/corpus/real-world/a.pdf']) assert.equal(r(p), null, p);
  assert.equal(r('packages/chicla-zip/src/zipkit.mjs'), null);
  assert.equal(r('.envrc'), null, '.envrc is not .env');
});

test('the predicates check-manifest uses on the walk', () => {
  assert.equal(policy.isPrivateFile, undefined, 'no private-corpus predicate (D64)');
  assert.equal(policy.PRIVATE_DIRS, undefined, 'no private-corpus list (D64)');
  assert.equal(policy.isSecretEnv('.env'), true);
  assert.equal(policy.isSecretEnv('.env.production'), true);
  assert.equal(policy.isSecretEnv('.env.example'), false);
  assert.equal(policy.isSecretEnv('.envrc'), false);
});

test('the walk rules: names skipped everywhere, Python folders', () => {
  assert.deepEqual([...policy.SKIP_NAMES].sort(), ['.aws', '.git', '.next', '.ssh', '__MACOSX', 'node_modules']); // C6.3 a (D73): .ssh and .aws
  assert.deepEqual([...policy.PYTHON_DIRS].sort(), ['.venv', '__pycache__']);
});

test('check-manifest and verify-delivery-zip keep no private copy of the rules', () => {
  for (const f of ['packages/chicla-kit/src/check-manifest.mjs', 'packages/chicla-kit/src/verify-delivery.mjs']) { // C11.1 5b and 5d: the check-manifest and verify-delivery code lives in the kit
    const s = read(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'); // code lines only: comments may still describe the rules
    assert.match(s, /from "(\.\/pinned\/|\.\/|\.\.\/\.\.\/\.\.\/scripts\/)policy\.mjs"/, `${f} imports the policy`);
    assert.doesNotMatch(s, /const (isSecretEnv|privateReason)\b/, `${f} defines no rule of its own`);
  }
});

test('D64: no script names a corpus folder in code, and the rules stay in policy.mjs', () => {
  for (const f of [PINNED.policy, 'scripts/check-manifest.mjs', 'packages/chicla-kit/src/check-manifest.mjs', 'packages/chicla-kit/src/verify-delivery.mjs', PINNED['recovery-report'], 'scripts/emergency-dump.mjs', 'packages/chicla-kit/src/emergency-dump.mjs']) { // C11.1 5f: the dump code lives in the kit
    const s = read(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    assert.doesNotMatch(s, /real-world|corpus\/huge|\bcorpus\b|private corpus|PRIVATE_RE|isPrivate/i, `${f} has no corpus rule`);
  }
});

test('C6.1 d2b: emergency-dump (own rules, D7) names the same policy file as policy.mjs', () => {
  assert.ok(read('packages/chicla-kit/src/emergency-dump.mjs').includes(`"${policy.POLICY_FILE}"`)); // C11.1 5f: the code is in the kit
});

test('isJunkName: the file names recovery-report skips when it hashes a recovered tree', () => {
  const j = policy.isJunkName;
  for (const n of ['.DS_Store', 'tsconfig.tsbuildinfo', 'a.pyc', '.env', '.env.local']) assert.equal(j(n), true, n);
  for (const n of ['.env.example', '.env.sample', 'zipkit.mjs', '.envrc', 'a.pyc.txt', 'notes.tsbuildinfo.md']) assert.equal(j(n), false, n);
});

test('C6.1 slice b: recovery-report keeps no private copy of the rules, and the policy travels in RECOVER/ and in the pin', () => {
  const code = (f) => read(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const esc = (x) => x.split('.').join('\\.'); // a path as the text of a regex
  const rr = code(PINNED['recovery-report']);
  assert.match(rr, /from "\.\/policy\.mjs"/, 'recovery-report imports the policy');
  assert.doesNotMatch(rr, /const (JUNK_DIRS|isJunk|isPrivate)\b/, 'no rule of its own');
  assert.match(read('packages/chicla-kit/src/emergency-dump.mjs'), new RegExp(`"RECOVER/policy\\.mjs": "${esc(PINNED.policy)}"`), 'the dump carries policy.mjs in RECOVER/');
  assert.match(read('packages/chicla-kit/src/bump-round.mjs'), new RegExp(`"policy\\.mjs": "${esc(PINNED.policy)}"`), 'the pin covers policy.mjs'); // C11.1 5c: the pin map lives in the bump-round core
});
