// C6.3 slice b1 (round 103, D73 (2) and (4)): the content detector. src/pinned/policy.mjs looks INSIDE a file for private-key headers and well-known token
// shapes (AWS access key id, GitHub ghp_ / github_pat_, npm npm_). A file it catches is left out of FILES.manifest (so out of the delivery) and a zip that
// carries one is refused by verify-delivery-zip (ESECRET_CONTENT). It reports ONLY the file name and the kind, never the match.
// Not scanned: a file over 1 MiB, or one with a NUL byte (binary). Slice b2 brings the dump (its own copy, D7); slice c the `allow` key.
// The samples are built by concatenation so that this very file, being part of the project, is not caught by its own detector.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_MANIFEST_COPY, copyFiles, importPinned } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = await importPinned('policy');
const PY = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();
const j = (...p) => p.join('');
const pem = (what) => j('-----BEGIN ', what, 'PRIVATE KEY', what.endsWith('PGP ') ? ' BLOCK' : '', '-----');
const AWS = j('AKIA', 'IOSFODNN7EXAMPLE');
const GHP = j('ghp_', 'a1B2'.repeat(9));
const GHPAT = j('github_pat_', 'A'.repeat(22), '_', 'b'.repeat(59));
const NPM = j('npm_', 'c3D4'.repeat(9));
const KINDS = ['private key', 'AWS access key', 'GitHub token', 'npm token'];
const SAMPLES = { 'private key': pem(''), 'AWS access key': AWS, 'GitHub token': GHP, 'npm token': NPM };
const buf = (s) => Buffer.from(s, 'utf8');

test('detectSecret: each shape gives its kind, and only the kind', () => {
  assert.equal(typeof policy.detectSecret, 'function');
  for (const [kind, s] of Object.entries(SAMPLES)) for (const text of [s, `x=${s}\n`, `# note\n${s}\nmore\n`, `"${s}"`]) assert.equal(policy.detectSecret(buf(text)), kind, `${kind}: ${text.slice(0, 12)}`);
  assert.equal(policy.detectSecret(buf(GHPAT)), 'GitHub token', 'the fine-grained token too');
  assert.equal(policy.detectSecret(buf(j('github_pat_', 'A'.repeat(22)))), 'GitHub token', 'the shortest fine-grained shape (22 characters)');
  for (const w of ['', 'RSA ', 'EC ', 'OPENSSH ', 'ENCRYPTED ', 'DSA ', 'PGP ']) assert.equal(policy.detectSecret(buf(pem(w))), 'private key', `header ${JSON.stringify(w)}`);
  for (const kind of [policy.detectSecret(buf(AWS)), policy.detectSecret(buf(GHP)), policy.detectSecret(buf(NPM))]) assert.ok(KINDS.includes(kind), kind);
});

test('detectSecret: shapes that are NOT secrets (length, boundary, public material, prose)', () => {
  const none = [
    j('-----BEGIN ', 'PUBLIC KEY', '-----'), j('-----BEGIN ', 'CERTIFICATE', '-----'), j('-----BEGIN ', 'PRIVATE', ' KEY'), 'PRIVATE KEY',
    j('AKIA', 'IOSFODNN7EXAMPL'), // 19 characters
    j('AKIA', 'IOSFODNN7EXAMPLEX'), // 21: a longer run is not an access key id
    j('xAKIA', 'IOSFODNN7EXAMPLE'), // glued to a longer word
    j('akia', 'iosfodnn7example'), // the shape is upper case
    j('ghp_', 'a'.repeat(35)), j('ghx_', 'a'.repeat(36)), j('github_pat_', 'A'.repeat(10)),
    j('npm_', 'c'.repeat(35)), j('npm_', 'c'.repeat(37)), j('xnpm_', 'c'.repeat(36)),
    j('-----BEGI ', 'PRIVATE KEY', '-----'), j('x', 'ghp_', 'a'.repeat(36)), // a cut header; a token glued to a longer word
    'AKIA is the prefix of an AWS key id', 'a token starts with ghp_ and npm_ in the docs', 'BEGIN PRIVATE KEY blocks are explained in docs',
  ];
  for (const t of none) assert.equal(policy.detectSecret(buf(t)), null, t);
  assert.equal(policy.detectSecret(Buffer.alloc(0)), null);
});

test('detectSecret: limits (1 MiB, NUL byte)', () => {
  assert.equal(policy.SCAN_LIMIT, 1048576);
  const pad = (n, s) => Buffer.concat([buf(`${s}\n`), Buffer.alloc(n - s.length - 1, 0x61)]); // key, a newline, then filler: a key glued to letters is not a key
  assert.equal(policy.detectSecret(pad(1048576, AWS)), 'AWS access key', 'a file of exactly 1 MiB is scanned');
  assert.equal(policy.detectSecret(pad(1048577, AWS)), null, 'one byte over is not');
  assert.equal(policy.detectSecret(Buffer.concat([Buffer.from([0]), buf(AWS)])), null, 'a NUL anywhere: binary, not scanned');
  assert.equal(policy.detectSecret(Buffer.concat([buf(AWS), Buffer.from([0])])), null);
  assert.equal(policy.detectSecret(Buffer.concat([buf(`${AWS}\n`), Buffer.alloc(10, 0x20), Buffer.from([0x7f])])), 'AWS access key', 'other control bytes are not NUL');
});

const T0 = () => mkdtempSync(join(tmpdir(), 'chicla-c63b-'));
test('scanFile: reads a file from disk; a missing file, a folder or a big file is null', () => {
  const T = T0();
  try {
    writeFileSync(join(T, 'k.txt'), `x\n${NPM}\n`); writeFileSync(join(T, 'ok.txt'), 'hello\n'); writeFileSync(join(T, 'big.txt'), Buffer.concat([buf(NPM), Buffer.alloc(1048577, 0x61)])); mkdirSync(join(T, 'd'));
    assert.equal(policy.scanFile(join(T, 'k.txt')), 'npm token');
    for (const n of ['ok.txt', 'big.txt', 'nope.txt', 'd']) assert.equal(policy.scanFile(join(T, n)), null, n);
    writeFileSync(join(T, 'exact.txt'), Buffer.concat([buf(`${AWS}\n`), Buffer.alloc(1048576 - AWS.length - 1, 0x61)]));
    assert.equal(policy.scanFile(join(T, 'exact.txt')), 'AWS access key', 'a file of exactly 1 MiB is scanned from disk too');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('the detector is built-in: a policy file has no key to switch it off (the `allow` key releases single files, see secret-allow.test.mjs)', () => {
  for (const o of [{ scan: false }, { detector: 'off' }, { allowAll: true }]) {
    let code = null; try { policy.parsePolicy(JSON.stringify({ version: 1, ...o })); } catch (e) { code = e.code; }
    assert.equal(code, 'EPOLICY_FORMAT', JSON.stringify(o));
  }
});

// ---- check-manifest, in a copy of the scripts ----
const project = (files) => {
  const d = T0();
  mkdirSync(join(d, 'scripts'));
  copyFiles(ROOT, d, CHECK_MANIFEST_COPY); // the wrapper, its core in the kit and the pinned files it reads
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), text); }
  return d;
};
const run = (d, ...a) => spawnSync(process.execPath, [join(d, 'scripts/check-manifest.mjs'), ...a], { encoding: 'utf8' });
const manifestOf = (d) => readFileSync(join(d, 'FILES.manifest'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[0]).filter((x) => !x.startsWith('scripts/') && !x.startsWith('packages/chicla-kit/src/pinned/') && x !== 'packages/chicla-kit/src/check-manifest.mjs' && x !== 'packages/chicla-kit/src/integrity.mjs').sort();
const UNIQUE = [AWS, GHP, GHPAT, NPM].map((s) => s.slice(6)); // a stretch of each sample that must never be printed

test('check-manifest --write: a file whose content looks like a secret is left out, named with its kind, never quoted; the controls stay', () => {
  const files = { 'package.json': '{}', 'a.txt': 'a', 'docs/note.md': 'An AWS key id starts with AKIA and a GitHub token with ghp_.\n', 'src/deep/k.js': `const k = "${GHP}";\n`, 'cfg/aws.ini': `[default]\nid = ${AWS}\n`,
    'keys/server.key': `${pem('RSA ')}\nMIIEow\n`, 'ci/token.txt': `${NPM}\n`, 'ci/pat.txt': `${GHPAT}\n`,
    'bin/blob.dat': Buffer.concat([Buffer.from([0]), buf(AWS)]).toString('latin1'), 'big.txt': `${NPM}${'a'.repeat(1048577)}` };
  const d = project(files);
  try {
    const r = run(d, '--write'); assert.equal(r.status, 0, r.stdout + r.stderr);
    const out = r.stdout + r.stderr;
    assert.deepEqual(manifestOf(d), ['a.txt', 'big.txt', 'bin/blob.dat', 'docs/note.md', 'package.json'], 'the five secrets are out; prose, the binary and the big file are in');
    for (const [rel, kind] of [['src/deep/k.js', 'GitHub token'], ['cfg/aws.ini', 'AWS access key'], ['keys/server.key', 'private key'], ['ci/token.txt', 'npm token'], ['ci/pat.txt', 'GitHub token']]) {
      const line = out.split('\n').find((l) => l.includes(rel)); assert.ok(line, `${rel} is named`); assert.ok(line.includes(kind), `${rel}: ${line}`);
    }
    for (const u of UNIQUE) assert.ok(!out.includes(u), 'the match is never printed');
    assert.ok(!out.includes('MIIEow'), 'nor the content around it');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('check-manifest (check mode): a new file with a secret is reported and does not fail; a listed file that now holds one is LOST, with the reason shown', () => {
  const d = project({ 'package.json': '{}', 'a.txt': 'a', 'b.txt': 'b' });
  try {
    assert.equal(run(d, '--write').status, 0);
    writeFileSync(join(d, 'new.txt'), `${NPM}\n`);
    let r = run(d); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout + r.stderr, /new\.txt.*npm token/);
    writeFileSync(join(d, 'b.txt'), `${AWS}\n`);
    r = run(d); assert.equal(r.status, 1, 'b.txt was shipped before and now looks like a secret: not silently dropped');
    assert.match(r.stdout + r.stderr, /b\.txt.*AWS access key/);
    assert.match(r.stdout + r.stderr, /held back/, 'the LOST message says the file is held back, not missing');
    assert.ok(!(r.stdout + r.stderr).includes(UNIQUE[0]));
    writeFileSync(join(d, 'b.txt'), 'b\n'); r = run(d); assert.equal(r.status, 0, 'cleaned: back to normal');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('check-manifest: the detector never reads outside what the walk keeps (a file under a skipped folder is not even opened)', () => {
  const d = project({ 'package.json': '{}', 'node_modules/x/k.js': `${NPM}\n`, '.git/c': `${AWS}\n` });
  try { const r = run(d, '--write'); assert.equal(r.status, 0); assert.ok(!/node_modules|\.git\//.test(r.stdout + r.stderr), 'not reported: it was never walked'); } finally { rmSync(d, { recursive: true, force: true }); }
});

// ---- the verifier ----
const pyzip = (path, members) => assert.equal(spawnSync(PY, ['-c', 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1],"w");[z.writestr(n,c) for n,c in json.loads(sys.argv[2]).items()];z.close()', path, JSON.stringify(members)], { encoding: 'utf8' }).status, 0);
const verify = (zip) => spawnSync(process.execPath, [join(ROOT, 'scripts/verify-delivery-zip.mjs'), zip], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });

test('verify-delivery-zip: a member whose content looks like a secret is refused with ESECRET_CONTENT, naming the member and the kind, not the match', { skip: !PY && 'no python3' }, () => {
  const T = T0();
  try {
    const bad = join(T, 'bad.zip'); pyzip(bad, { 'package.json': '{}', 'notes/a.txt': 'a', 'ci/token.txt': `${NPM}\n`, 'cfg/k': `${pem('OPENSSH ')}\nAAAA\n` });
    const r = verify(bad), out = r.stdout + r.stderr;
    assert.equal(r.status, 1); assert.match(out, /ESECRET_CONTENT/);
    assert.match(out, /ci\/token\.txt \[npm token\]/); assert.match(out, /cfg\/k \[private key\]/); assert.ok(!out.includes('notes/a.txt [') && !/ESECRET_CONTENT[^\n]*notes\/a\.txt/.test(out), 'the clean member is not named');
    for (const u of UNIQUE) assert.ok(!out.includes(u), 'the match is never printed');
    const ok = join(T, 'ok.zip'); pyzip(ok, { 'package.json': '{}', 'notes/a.txt': 'AKIA and ghp_ in prose\n' });
    assert.doesNotMatch(verify(ok).stdout + verify(ok).stderr, /ESECRET_CONTENT/);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('verify-delivery-zip: --against uploads are only listed, never scanned (they come from other tools)', { skip: !PY && 'no python3' }, () => {
  const T = T0();
  try {
    const prev = join(T, 'prev.zip'); pyzip(prev, { 'package.json': '{}', 'old.txt': `${NPM}\n` });
    const cur = join(T, 'cur.zip'); pyzip(cur, { 'package.json': '{}' });
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/verify-delivery-zip.mjs'), cur, '--against', prev], { cwd: ROOT, encoding: 'utf8' });
    assert.doesNotMatch(r.stdout + r.stderr, /ESECRET_CONTENT/);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('the whole chain: make-delivery-zip leaves a secret file out of the zip, says so, and the zip passes the verifier', { skip: !PY && 'no python3' }, () => {
  const T = T0(), proj = join(T, 'proj');
  try {
    const manifest = readFileSync(join(ROOT, 'FILES.manifest'), 'utf8');
    for (const line of manifest.split('\n')) { const rel = line.split('\t')[0]; if (!rel || rel.startsWith('#')) continue; try { mkdirSync(dirname(join(proj, rel)), { recursive: true }); copyFileSync(join(ROOT, rel), join(proj, rel)); } catch { /* a header line or a listed file the tree lacks */ } }
    mkdirSync(join(proj, 'notes'), { recursive: true }); writeFileSync(join(proj, 'notes/aws.txt'), `id = ${AWS}\n`); writeFileSync(join(proj, 'notes/ok.txt'), 'fine\n');
    const zip = join(T, 'd.zip');
    const r = spawnSync(process.execPath, [join(proj, 'scripts/make-delivery-zip.mjs'), zip], { cwd: proj, encoding: 'utf8', maxBuffer: 1 << 28 });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /notes\/aws\.txt.*AWS access key/);
    assert.ok(!(r.stdout + r.stderr).includes(UNIQUE[0]));
    const names = spawnSync(PY, ['-c', 'import zipfile,sys;print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', zip], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout.split('\n');
    assert.ok(!names.includes('notes/aws.txt'), 'the secret is not in the zip'); assert.ok(names.includes('notes/ok.txt'), 'the control is');
  } finally { rmSync(T, { recursive: true, force: true }); }
});
