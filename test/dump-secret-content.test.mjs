// C6.3 slice b2 (round 105, D73 (2), D76 (1)): the dump keeps its OWN copy of the content detector (D7: no import that can break) and leaves out of the stream,
// the external zip and the tar path every file whose content looks like a secret (private-key header, AWS access key id, GitHub ghp_ / github_pat_, npm npm_).
// The marker (`secretsHeld`: path + kind), the report and the console name the file and the kind, NEVER the match. The dump still always comes out.
// The copy is tied to src/pinned/policy.mjs by behaviour: the same files go through detectSecret and through the dump, and the two must agree.
// The samples are built by concatenation so that this very file, being part of the project, is not caught by the detector.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DUMP_COPY } from './toolchain-files.mjs';
import { importPinned } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = await importPinned('policy');
const PY = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();
const which = (n) => spawnSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
const ZIP = which('zip'), TAR = which('tar'), GZIP = which('gzip');
const j = (...p) => p.join('');
const pem = (what) => j('-----BEGIN ', what, 'PRIVATE KEY', what.endsWith('PGP ') ? ' BLOCK' : '', '-----');
const AWS = j('AKIA', 'IOSFODNN7EXAMPLE');
const GHP = j('ghp_', 'a1B2'.repeat(9));
const GHPAT = j('github_pat_', 'A'.repeat(22), '_', 'b'.repeat(59));
const NPM = j('npm_', 'c3D4'.repeat(9));
const AWS2 = j('AKIA', 'ABCDEFGHIJKLMNOP'), NPM2 = j('npm_', 'e5F6'.repeat(9)); // in the controls that are NOT scanned (binary, over 1 MiB): they stay in the dump on purpose
const UNIQUE = [AWS, GHP, GHPAT, NPM].map((s) => s.slice(6)); // a stretch of each sample that must never be printed
const buf = (s) => Buffer.from(s, 'utf8');

const COPY = DUMP_COPY;
const BROKEN = 'export const writeZipStream = async () => { throw new Error("broken on purpose"); };\n';

// files: path relative to work/ -> string or Buffer. mode: 'stream' | 'zip' (writer broken) | 'tar' (writer broken, no zip).
// Returns { r, names, marker, report, bytes } where names are the members of the dump and bytes is its whole content as latin1 (to look for a leaked match).
function dump(T, mode, files, { args = [], outputs = {}, nobody = false, locked = [] } = {}) {
  const work = join(T, 'work'), outdir = join(T, 'out');
  mkdirSync(outdir, { recursive: true });
  const put = (base, rel, data) => { mkdirSync(dirname(join(base, rel)), { recursive: true }); writeFileSync(join(base, rel), data); };
  put(work, 'chicla/package.json', '{"version":"0.0.1"}\n'); put(work, 'chicla/FILES.manifest', 'a.txt\n');
  for (const [rel, data] of Object.entries(files)) put(work, rel, data);
  for (const rel of locked) chmodSync(join(work, rel), 0);
  for (const [rel, data] of Object.entries(outputs)) put(outdir, rel, data);
  let node = process.execPath, script = join(ROOT, 'scripts/emergency-dump.mjs'), env = process.env;
  if (mode !== 'stream') {
    const tool = join(T, 'tool'), bin = join(T, 'bin'); mkdirSync(bin);
    for (const f of COPY) { mkdirSync(dirname(join(tool, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(tool, f)); }
    writeFileSync(join(tool, 'packages/chicla-zip/src/zipkit.mjs'), BROKEN);
    symlinkSync(process.execPath, join(bin, 'node'));
    for (const t of mode === 'zip' ? [ZIP] : [TAR, GZIP]) symlinkSync(t, join(bin, t.split('/').pop()));
    node = join(bin, 'node'); script = join(tool, 'scripts/emergency-dump.mjs'); env = { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
  }
  const spawnOpts = {};
  if (nobody) { // root can read a file with mode 000: run a copy of the tool as nobody so that the file really cannot be read
    const tool = join(T, 'tool'); mkdirSync(join(T, 'bin'), { recursive: true });
    for (const f of COPY) { mkdirSync(dirname(join(tool, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(tool, f)); }
    script = join(tool, 'scripts/emergency-dump.mjs'); Object.assign(spawnOpts, { uid: 65534, gid: 65534 });
    for (const d of [T, work, outdir, tool]) spawnSync('chmod', ['-R', 'a+rX', d]); chmodSync(outdir, 0o777);
    for (const rel of locked) chmodSync(join(work, rel), 0);
  }
  const have = Object.keys(outputs).length > 0;
  const before = new Set(readdirSync(outdir));
  const r = spawnSync(node, [script, '--work', work, '--outdir', outdir, ...(have ? [] : ['--no-outputs']), ...args, 'c63b2'], { encoding: 'utf8', env, maxBuffer: 1 << 28, ...spawnOpts });
  assert.equal(r.status, 0, 'the dump always comes out: ' + r.stdout + r.stderr);
  const f = readdirSync(outdir).find((n) => !before.has(n) && n.endsWith(mode === 'tar' ? '.tar.gz' : '.zip'));
  assert.ok(f, `a ${mode === 'tar' ? '.tar.gz' : '.zip'} in ${readdirSync(outdir)}`);
  const code = [
    'import sys,json,zipfile,tarfile',
    'p=sys.argv[1]',
    'if p.endswith(".zip"):',
    '    z=zipfile.ZipFile(p); names=z.namelist(); rd=lambda n: z.read(n); isf=lambda n: not n.endswith("/")',
    'else:',
    '    t=tarfile.open(p); ms=t.getmembers(); names=[m.name for m in ms]; rd=lambda n: t.extractfile(n).read(); isf=lambda n: t.getmember(n).isfile()',
    'strip=lambda n: n[2:] if n.startswith("./") else n',
    'out={"names":[strip(n) for n in names]}',
    'out["marker"]=json.loads(rd(next(n for n in names if strip(n)=="RECOVERY_MARKER.json")).decode("utf8"))',
    'out["report"]=rd(next(n for n in names if strip(n)=="RECOVERY_REPORT.md")).decode("utf8")',
    'out["all"]="".join(rd(n).decode("latin1") for n in names if isf(n))',
    'print(json.dumps(out))',
  ].join('\n');
  const o = spawnSync(PY, ['-c', code, join(outdir, f)], { encoding: 'utf8', maxBuffer: 1 << 29 });
  assert.equal(o.status, 0, o.stderr);
  const x = JSON.parse(o.stdout);
  return { r, names: new Set(x.names), marker: x.marker, report: x.report, bytes: x.all };
}

const T0 = () => mkdtempSync(join(tmpdir(), 'chicla-c63b2-'));
const HELD = { // path relative to work/ -> [content, kind]
  'chicla/src/k.js': [`const k = "${GHP}";\n`, 'GitHub token'],
  'chicla/cfg/aws.ini': [`[default]\nid = ${AWS}\n`, 'AWS access key'],
  'chicla/keys/server.key': [`${pem('RSA ')}\nMIIEow\n`, 'private key'],
  'chicla/ci/token.txt': [`${NPM}\n`, 'npm token'],
  'chicla/ci/pat.txt': [`${GHPAT}\n`, 'GitHub token'],
  'chicla/we ird/[a]*.js': [`x = "${NPM}"\n`, 'npm token'], // glob characters in the name: the zip and tar patterns must still hit this file
  'notes.txt': [`scratch: ${AWS}\n`, 'AWS access key'], // outside the project, inside work/
};
const KEPT = { // controls: must stay in the dump
  'chicla/docs/note.md': 'An AWS key id starts with AKIA and a GitHub token with ghp_.\n',
  'chicla/we ird/ok.txt': 'fine\n',
  'chicla/bin/blob.dat': Buffer.concat([Buffer.from([0]), buf(AWS2)]),
  'chicla/big.txt': Buffer.concat([buf(NPM2), Buffer.alloc(1048577, 0x61)]), // over 1 MiB: not scanned, a known limit
  'chicla/a.txt': 'a\n',
};
const files = () => ({ ...Object.fromEntries(Object.entries(HELD).map(([k, [c]]) => [k, c])), ...KEPT });

for (const [mode, ok] of [['stream', true], ['zip', !!ZIP], ['tar', !!TAR && !!GZIP]]) {
  test(`emergency-dump (${mode} path): a file whose content looks like a secret stays out; marker, report and console name it and its kind, never the match`, { skip: !PY || !ok }, () => {
    const T = T0();
    try {
      const { r, names, marker, report, bytes } = dump(T, mode, files());
      for (const rel of Object.keys(HELD)) assert.ok(!names.has(`work/${rel}`), `${rel} must not be in the dump`);
      for (const rel of Object.keys(KEPT)) assert.ok(names.has(`work/${rel}`), `${rel} (a control) must be in the dump`);
      assert.ok(names.has('work/chicla/package.json'));
      // the marker: path + kind, sorted, and no hash for a held file
      assert.ok(Array.isArray(marker.secretsHeld), 'marker.secretsHeld');
      assert.deepEqual(marker.secretsHeld, Object.entries(HELD).map(([rel, [, kind]]) => ({ path: `work/${rel}`, kind })).sort((a, b) => (a.path < b.path ? -1 : 1)));
      for (const rel of Object.keys(HELD)) assert.ok(!(rel.replace(/^chicla\//, '') in marker.hashes), `${rel}: no hash of a held file`);
      // the report says what and why
      assert.match(report, /looks like a secret/i, 'the report has a section for it');
      for (const [rel, [, kind]] of Object.entries(HELD)) { const line = report.split('\n').find((l) => l.includes(`work/${rel}`) && l.includes(kind)); assert.ok(line, `${rel} [${kind}] is named in the report`); }
      // the console too
      assert.match(r.stdout, /held back/i); assert.match(r.stdout, /k\.js.*GitHub token/);
      // and the match is nowhere: not in the console, the report, the marker, nor any member of the dump
      for (const u of UNIQUE) for (const [where, text] of [['stdout', r.stdout + r.stderr], ['report', report], ['marker', JSON.stringify(marker)], ['dump', bytes]]) assert.ok(!text.includes(u), `the match is printed in the ${where}`);
      assert.ok(!(report + JSON.stringify(marker)).includes('MIIEow'), 'nor the content around it');
    } finally { rmSync(T, { recursive: true, force: true }); }
  });
}

test('emergency-dump: with nothing to hold back the marker has an empty list and the report says none', { skip: !PY }, () => {
  const T = T0();
  try {
    const { marker, report, r } = dump(T, 'stream', { 'chicla/a.txt': 'a\n', 'chicla/docs/n.md': 'AKIA and ghp_ in prose\n' });
    assert.deepEqual(marker.secretsHeld, []);
    assert.match(report, /looks like a secret[^\n]*\n[^\n]*none/i);
    assert.doesNotMatch(r.stdout, /held back/i);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

// ---- the copy is tied to policy.mjs: same files, same verdicts ----
const pad = (n, s) => Buffer.concat([buf(`${s}\n`), Buffer.alloc(n - s.length - 1, 0x61)]);
const TIE = {
  ...Object.fromEntries(Object.entries({ 'private key': pem(''), 'AWS access key': AWS, 'GitHub token': GHP, 'npm token': NPM }).flatMap(([k, s]) => [[`p-${k}-1`, s], [`p-${k}-2`, `x=${s}\n`], [`p-${k}-3`, `# note\n${s}\nmore\n`], [`p-${k}-4`, `"${s}"`]])),
  'p-pat': GHPAT, 'p-pat-short': j('github_pat_', 'A'.repeat(22)),
  ...Object.fromEntries(['RSA ', 'EC ', 'OPENSSH ', 'ENCRYPTED ', 'DSA ', 'PGP '].map((w, i) => [`p-pem-${i}`, pem(w)])),
  'n-public': j('-----BEGIN ', 'PUBLIC KEY', '-----'), 'n-cert': j('-----BEGIN ', 'CERTIFICATE', '-----'), 'n-cut': j('-----BEGIN ', 'PRIVATE', ' KEY'),
  'n-aws19': j('AKIA', 'IOSFODNN7EXAMPL'), 'n-aws21': j('AKIA', 'IOSFODNN7EXAMPLEX'), 'n-awsglued': j('xAKIA', 'IOSFODNN7EXAMPLE'), 'n-awslower': j('akia', 'iosfodnn7example'),
  'n-ghp35': j('ghp_', 'a'.repeat(35)), 'n-ghx': j('ghx_', 'a'.repeat(36)), 'n-pat10': j('github_pat_', 'A'.repeat(10)), 'n-ghpglued': j('x', 'ghp_', 'a'.repeat(36)),
  'n-npm35': j('npm_', 'c'.repeat(35)), 'n-npm37': j('npm_', 'c'.repeat(37)), 'n-npmglued': j('xnpm_', 'c'.repeat(36)),
  'n-prose1': 'AKIA is the prefix of an AWS key id', 'n-prose2': 'a token starts with ghp_ and npm_ in the docs', 'n-empty': '',
  // C16.5 (round 239): the five new kinds, positive and negative, must get the same verdict in the dump's own copy
  'p-slack': j('xox', 'b-', '123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx'), 'p-stripe': j('sk_', 'live_', 'a1B2c3D4'.repeat(3)), 'p-stripe-r': j('rk_', 'live_', 'a1B2c3D4'.repeat(3)),
  'p-google': j('AIza', 'Sy', 'A1b2C3d4'.repeat(4), '_'), 'p-ant': j('sk-', 'ant-', 'api03-', 'aB1_'.repeat(8)), 'p-oai': j('sk-', 'aB3dE5gH7j'.repeat(5)), 'p-oai-proj': j('sk-', 'proj-', 'aB1_-d'.repeat(20)),
  'n-slack-doc': j('xox', 'b-', 'your-token-here'), 'n-slack-x': j('xox', 'b-', 'x'.repeat(40)), 'n-stripe-test': j('sk_', 'test_', 'a1B2c3D4'.repeat(3)), 'n-stripe-23': j('sk_', 'live_', 'a'.repeat(23)),
  'n-google-34': j('AIza', 'Sy', 'A1b2C3d4'.repeat(4)), 'n-google-36': j('AIza', 'Sy', 'A1b2C3d4'.repeat(4), '_x'), 'n-ant-31': j('sk-', 'ant-', 'a'.repeat(31)),
  'n-oai-nodigit': j('sk-', 'aBcDeFgHiJ'.repeat(5)), 'n-oai-noupper': j('sk-', 'a1b2c3d4e5'.repeat(5)), 'n-oai-css': 'sk-fading-circle-loader-spinner-animation-keyframes-wrapper', 'n-oai-glued': j('ri', 'sk-', 'aB3dE5gH7j'.repeat(5)),
  'l-exact': pad(1048576, AWS), 'l-over': pad(1048577, AWS),
  'l-nul-first': Buffer.concat([Buffer.from([0]), buf(AWS)]), 'l-nul-last': Buffer.concat([buf(AWS), Buffer.from([0])]),
  'l-ctrl': Buffer.concat([buf(`${AWS}\n`), Buffer.alloc(10, 0x20), Buffer.from([0x7f])]),
  'l-utf8': `é ü ${GHP} ñ\n`, // a UTF-8 file is scanned byte by byte
  'l-utf8-after-ghp': `k=${GHP}é\n`, 'l-utf8-after-aws': `k=${AWS}ü\n`, // a lead byte right after the key is not a letter (latin1, not ascii)
};

test('emergency-dump holds back exactly the files that policy.detectSecret flags (the copy and the policy agree: shapes, boundaries, limits)', { skip: !PY }, () => {
  const T = T0();
  try {
    const input = {}; for (const [k, v] of Object.entries(TIE)) input[`chicla/tie/${k}.txt`] = v;
    const want = Object.entries(TIE).filter(([, v]) => policy.detectSecret(Buffer.isBuffer(v) ? v : buf(v))).map(([k]) => `work/chicla/tie/${k}.txt`).sort();
    assert.ok(want.length > 20 && want.length < Object.keys(TIE).length, 'the control of this test: the table has both kinds');
    const { marker, names } = dump(T, 'stream', input);
    assert.deepEqual(marker.secretsHeld.map((h) => h.path), want);
    for (const [k, v] of Object.entries(TIE)) {
      const kind = policy.detectSecret(Buffer.isBuffer(v) ? v : buf(v)), p = `work/chicla/tie/${k}.txt`;
      assert.equal(names.has(p), !kind, p);
      if (kind) assert.equal(marker.secretsHeld.find((h) => h.path === p).kind, kind, `${k}: the same kind as the policy`);
    }
  } finally { rmSync(T, { recursive: true, force: true }); }
});

// ---- outputs/, --project-only, unreadable ----
for (const [mode, ok] of [['stream', true], ['zip', !!ZIP]]) {
  test(`emergency-dump (${mode} path): a file in outputs/ whose content looks like a secret stays out too, named as outputs/…`, { skip: !PY || !ok }, () => {
    const T = T0();
    try {
      const { names, marker, report, bytes } = dump(T, mode, { 'chicla/a.txt': 'a\n' }, { outputs: { 'leak.txt': `${NPM}\n`, 'fine.txt': 'fine\n' } });
      assert.ok(!names.has('outputs/leak.txt')); assert.ok(names.has('outputs/fine.txt'), 'the control stays');
      assert.deepEqual(marker.secretsHeld, [{ path: 'outputs/leak.txt', kind: 'npm token' }]);
      assert.match(report, /outputs\/leak\.txt.*npm token/); assert.ok(!bytes.includes(UNIQUE[3]));
    } finally { rmSync(T, { recursive: true, force: true }); }
  });
}

test('emergency-dump --project-only: only held files of the project are listed (the scratch file is not in the dump, so it is not «held back»)', { skip: !PY }, () => {
  const T = T0();
  try {
    const { names, marker, report } = dump(T, 'stream', files(), { args: ['--project-only'] });
    assert.ok(!names.has('work/notes.txt'), 'scratch is out by the option');
    assert.ok(marker.secretsHeld.length === Object.keys(HELD).length - 1 && marker.secretsHeld.every((h) => h.path.startsWith('work/chicla/')), JSON.stringify(marker.secretsHeld));
    assert.ok(!report.includes('notes.txt  ') && !/notes\.txt.*AWS/.test(report), 'the scratch file is not named as held back');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('emergency-dump: a file that cannot be read is not scanned and does not stop the dump (run as nobody, so that root cannot read it either)', { skip: !PY || (process.getuid?.() === 0 && !spawnSync('sh', ['-c', 'id nobody'], { encoding: 'utf8' }).stdout.includes('uid=')) }, () => {
  const T = T0();
  try {
    const { names, marker, report } = dump(T, 'stream', { 'chicla/a.txt': 'a\n', 'chicla/locked.txt': `${AWS}\n`, 'chicla/b.txt': `${NPM}\n` }, { nobody: process.getuid?.() === 0, locked: ['chicla/locked.txt'] });
    assert.ok(names.has('work/chicla/a.txt'), 'the dump came out with the rest');
    assert.ok(!names.has('work/chicla/b.txt') && marker.secretsHeld.some((h) => h.path === 'work/chicla/b.txt'), 'a readable secret next to it is still held back');
    assert.ok(!report.includes('locked.txt  ['), 'the unreadable file is not called a secret');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('the dump source carries its own copy: no static import of policy.mjs (D7) and its own scan limit', () => {
  const src = readFileSync(join(ROOT, 'packages/chicla-kit/src/emergency-dump.mjs'), 'utf8'); // C11.1 5f: the code is in the kit
  assert.ok(!/^import .* from "(\.\/|\.\.\/\.\.\/\.\.\/scripts\/)policy\.mjs"/m.test(src), 'no static import of policy.mjs: the dump must not break because of it');
  assert.match(src, /1048576/, 'the copy has its own scan limit');
});
