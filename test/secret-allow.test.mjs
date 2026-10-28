// C6.3 slice c1 (round 107, D73 (3)): the `allow` key of chicla.policy.json releases a FALSE POSITIVE of the content detector, and nothing else.
// { "version": 1, "allow": ["docs/example-key.txt"] }: exact files from the project root (NFC), no folders, no names, no globs.
// It never reaches the name rules (.env, .npmrc, *.pem, id_rsa*, .ssh/, .aws/): a path those rules refuse is an EPOLICY_PATH error, not a silent no-op.
// Wired here into the manifest (check-manifest) and the delivery verifier. The dump and the recovery are slice c2 (until then the dump still holds a released file back: the safe side).
// The samples are built by concatenation so that this very file is not caught by the detector.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_MANIFEST_COPY, VERIFY_DELIVERY_COPY, copyFiles, importPinned } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = await importPinned('policy');
const PY = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();
const j = (...p) => p.join('');
const AWS = j('AKIA', 'IOSFODNN7EXAMPLE');
const NPM = j('npm_', 'c3D4'.repeat(9));
const P = (o) => JSON.stringify({ version: 1, ...o });
const code = (f) => { try { f(); return null; } catch (e) { return e.code ?? 'other'; } };

test('parsePolicy: `allow` is a list of exact file paths, kept as a set (NFC); an empty policy allows nothing', () => {
  assert.equal(policy.NO_POLICY.allow.size, 0);
  assert.equal(policy.policyAllows('a.txt'), false, 'the default policy releases nothing');
  const p = policy.parsePolicy(P({ allow: ['docs/key.txt', 'relatório/k.txt'] }));
  assert.ok(p.allow instanceof Set);
  assert.equal(policy.policyAllows('docs/key.txt', p), true);
  assert.equal(policy.policyAllows('relatório/k.txt', p), true, 'NFD in the JSON, NFC on disk');
  assert.equal(policy.policyAllows('relatório/k.txt', p), true, 'and the other way round');
  for (const rel of ['docs/key.txt.bak', 'x/docs/key.txt', 'docs', 'docs/key']) assert.equal(policy.policyAllows(rel, p), false, `${rel}: exact path only`);
  assert.equal(policy.parsePolicy(P({ names: ['dist'] })).allow.size, 0);
});

test('parsePolicy: a bad `allow` is an error with a code, never ignored', () => {
  for (const a of ['a.txt', [1], [[]], { x: 1 }]) assert.equal(code(() => policy.parsePolicy(P({ allow: a }))), 'EPOLICY_FORMAT', JSON.stringify(a));
  for (const x of ['', '.', '..', '../a.txt', 'a/../b.txt', '/abs.txt', 'a\\b.txt', 'a//b.txt', 'a/', 'docs/', 'chicla.policy.json', 'a\0b'])
    assert.equal(code(() => policy.parsePolicy(P({ allow: [x] }))), 'EPOLICY_PATH', JSON.stringify(x));
});

test('`allow` never reaches a name rule: a path those rules refuse is EPOLICY_PATH', () => {
  for (const x of ['.env', 'a/.env.local', '.npmrc', 'x/.netrc', '.git-credentials', 'k.pem', 'sub/KEY.PEM', 'id_rsa', 'id_rsa.pub', '.ssh/config', 'a/.aws/credentials', 'node_modules/x/k.js', '.git/c', 'x/__pycache__/m.pyc', 't.pyc'])
    assert.equal(code(() => policy.parsePolicy(P({ allow: [x] }))), 'EPOLICY_PATH', x);
  const p = policy.parsePolicy(P({ allow: ['docs/key.txt'] }));
  for (const x of ['.env', 'a/.npmrc', 'k.pem', '.ssh/config']) assert.ok(policy.neverShipReason(x, p), `${x} is still refused`);
});

test('`allow` does not weaken the other keys: a listed name or path still wins', () => {
  const p = policy.parsePolicy(P({ names: ['scratch'], allow: ['scratch/k.txt'] }));
  assert.ok(policy.neverShipReason('scratch/k.txt', p), 'a file under a listed name is skipped whatever allow says');
});

// ---- check-manifest, in a copy of the scripts ----
const project = (files, polText) => {
  const d = mkdtempSync(join(tmpdir(), 'chicla-c63c-'));
  mkdirSync(join(d, 'scripts'));
  copyFiles(ROOT, d, [...CHECK_MANIFEST_COPY, ...VERIFY_DELIVERY_COPY]); // the two wrappers, their cores in the kit and the pinned files they read
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), text); }
  if (polText !== undefined) writeFileSync(join(d, 'chicla.policy.json'), polText);
  return d;
};
const cm = (d, ...a) => spawnSync(process.execPath, [join(d, 'scripts/check-manifest.mjs'), ...a], { encoding: 'utf8' });
const manifestOf = (d) => readFileSync(join(d, 'FILES.manifest'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[0]).filter((x) => !x.startsWith('scripts/') && !x.startsWith('packages/chicla-kit/src/pinned/') && x !== 'packages/chicla-kit/src/check-manifest.mjs' && x !== 'packages/chicla-kit/src/integrity.mjs' && x !== 'packages/chicla-kit/src/verify-delivery.mjs').sort();
const FILES = { 'package.json': '{}', 'docs/example-key.txt': `Example: ${AWS}\n`, 'other/example-key.txt': `Example: ${AWS}\n`, 'src/real.js': `const t = "${NPM}";\n`, 'a.txt': 'a' };

test('check-manifest --write: an allowed file with a secret-looking content is listed, silently; every other one is still held back', () => {
  const d = project(FILES, P({ allow: ['docs/example-key.txt'] }));
  try {
    const r = cm(d, '--write'); assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(manifestOf(d), ['a.txt', 'chicla.policy.json', 'docs/example-key.txt', 'package.json']);
    const out = r.stdout + r.stderr;
    assert.match(out, /other\/example-key\.txt.*AWS access key/, 'the same name in another folder is NOT released');
    assert.match(out, /src\/real\.js.*npm token/);
    assert.ok(!/docs\/example-key\.txt/.test(out), 'the released file is not reported as held back');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('check-manifest --write: without `allow` the same tree holds all three back', () => {
  const d = project(FILES, P({ names: ['dist'] }));
  try {
    assert.equal(cm(d, '--write').status, 0);
    assert.deepEqual(manifestOf(d), ['a.txt', 'chicla.policy.json', 'package.json']);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('check-manifest (check mode): a listed, allowed file that holds a secret is not LOST; an allowed path that does not exist is harmless', () => {
  const d = project({ 'package.json': '{}', 'a.txt': 'a', 'b.txt': 'b' }, P({ allow: ['b.txt', 'gone.txt'] }));
  try {
    assert.equal(cm(d, '--write').status, 0);
    writeFileSync(join(d, 'b.txt'), `${AWS}\n`);
    const r = cm(d); assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(!/held back/.test(r.stdout + r.stderr));
    writeFileSync(join(d, 'chicla.policy.json'), P({ allow: ['gone.txt'] }));
    assert.equal(cm(d).status, 1, 'allow taken away: the file is held back again (and a listed file that now looks like a secret is LOST, not dropped silently)');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('check-manifest: a bad `allow` stops both modes with its code and writes nothing', () => {
  for (const [o, c] of [[{ allow: ['.npmrc'] }, 'EPOLICY_PATH'], [{ allow: 'a.txt' }, 'EPOLICY_FORMAT']]) {
    const d = project({ 'package.json': '{}' }, P(o));
    try {
      for (const args of [['--write'], []]) { const r = cm(d, ...args); assert.equal(r.status, 1); assert.match(r.stderr, new RegExp(c)); }
      assert.throws(() => readFileSync(join(d, 'FILES.manifest')));
    } finally { rmSync(d, { recursive: true, force: true }); }
  }
});

// ---- the verifier ----
const pyzip = (path, members) => assert.equal(spawnSync(PY, ['-c', 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1],"w");[z.writestr(n,c) for n,c in json.loads(sys.argv[2]).items()];z.close()', path, JSON.stringify(members)], { encoding: 'utf8' }).status, 0);
const verify = (d, zip) => { const r = spawnSync(process.execPath, [join(d, 'scripts/verify-delivery-zip.mjs'), zip], { cwd: d, encoding: 'utf8', maxBuffer: 1 << 28 }); return { r, out: r.stdout + r.stderr }; };

test('verify-delivery-zip: an allowed member passes ESECRET_CONTENT, any other secret is still refused; the message no longer says «once it exists»', { skip: !PY && 'no python3' }, () => {
  const d = project({ 'package.json': '{}' }, P({ allow: ['docs/example-key.txt'] }));
  try {
    const zip = join(d, 'z.zip');
    pyzip(zip, { 'package.json': '{}', 'docs/example-key.txt': `${AWS}\n`, 'other/example-key.txt': `${AWS}\n` });
    const { out } = verify(d, zip);
    assert.match(out, /ESECRET_CONTENT/); assert.match(out, /other\/example-key\.txt \[AWS access key\]/);
    assert.ok(!/docs\/example-key\.txt \[/.test(out), 'the released member is not named');
    assert.doesNotMatch(out, /once it exists/);
    pyzip(zip, { 'package.json': '{}', 'docs/example-key.txt': `${AWS}\n` });
    assert.doesNotMatch(verify(d, zip).out, /ESECRET_CONTENT/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('verify-delivery-zip: without `allow` the same member is refused', { skip: !PY && 'no python3' }, () => {
  const d = project({ 'package.json': '{}' });
  try {
    const zip = join(d, 'z.zip'); pyzip(zip, { 'package.json': '{}', 'docs/example-key.txt': `${AWS}\n` });
    assert.match(verify(d, zip).out, /ESECRET_CONTENT.*docs\/example-key\.txt \[AWS access key\]/s);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('verify-delivery-zip: a name rule is not released by `allow` even if the policy file was edited by hand after check-manifest (the policy is refused first)', { skip: !PY && 'no python3' }, () => {
  const d = project({ 'package.json': '{}' }, P({ allow: ['.npmrc'] }));
  try {
    const zip = join(d, 'z.zip'); pyzip(zip, { 'package.json': '{}' });
    assert.match(verify(d, zip).out, /EPOLICY_PATH/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
