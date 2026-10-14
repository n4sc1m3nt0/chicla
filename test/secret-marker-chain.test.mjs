// C6.4 (round 111): the «secret marker» test, extended to the C6.3 cases. A distinctive string (the marker) is planted in EVERY kind of file that must never leave the
// machine (the credential names `.ssh/`, `.aws/`, `.npmrc`, `.netrc`, `.git-credentials`, `*.pem`, `id_rsa*` in any case and any depth, `.env*`, in the project, in scratch
// space of work/ and in outputs/), the dump is made on its three write paths (chicla-zip stream, external `zip`, `tar.gz`) and with --project-only, and then the whole
// chain is read back: the marker is in no member of the dump, not in its marker JSON or report, not on the console, and not in anything `recovery-report` extracts or writes.
// The controls (names that only LOOK similar) must still be in the dump: a rule that over-excludes is not a pass. No product code: it ties the C6.3 rules to the bytes.
// (The delivery side, check-manifest and verify-delivery-zip, is covered by test/secret-names.test.mjs and test/secret-content.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DUMP_COPY } from './toolchain-files.mjs';
import { pinnedFile } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const which = (n) => spawnSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
const PY = which('python3'), ZIP = which('zip'), TAR = which('tar'), GZIP = which('gzip');
const MARK = ['PRIVATE', 'MARKER', 'c64'].join('-'); // assembled at runtime: the literal must not exist in this file, which is part of the project
const COPY = DUMP_COPY;
const BROKEN = 'export const writeZipStream = async () => { throw new Error("broken on purpose"); };\n';

// Every file below holds the marker (plus its own number, so that a leak says which one). Paths relative to work/ (project folder `chicla`).
const SECRET_NAMES = [
  'chicla/.ssh/config', 'chicla/sub/.ssh/known_hosts', 'chicla/.aws/credentials', 'chicla/deep/er/.aws/config',
  'chicla/.npmrc', 'chicla/pkg/.npmrc', 'chicla/.NPMRC', 'chicla/.netrc', 'chicla/x/.netrc', 'chicla/.git-credentials', 'chicla/x/.git-credentials',
  'chicla/certs/server.pem', 'chicla/certs/CA.PEM', 'chicla/server.Pem', 'chicla/keys/id_rsa', 'chicla/keys/ID_RSA.pub', 'chicla/keys/id_rsa_backup.txt', 'chicla/id_rsa',
  'chicla/.env', 'chicla/.env.local', 'chicla/sub/.env.production',
  '.ssh/id_ed25519', 'home.pem', '.aws/credentials', // scratch space of work/, outside the project
];
const OUT_SECRETS = ['.netrc', 'x.pem', '.aws/credentials', 'sub/id_rsa']; // in outputs/
const CONTROLS = [ // look similar, are not credentials: they must STAY in the dump
  'chicla/a.txt', 'chicla/.env.example', 'chicla/.env.sample', 'chicla/docs/ssh.md', 'chicla/docs/aws-notes.md', 'chicla/npmrc.txt', 'chicla/netrc', 'chicla/git-credentials.md',
  'chicla/pem-notes.md', 'chicla/certs/server.pem.txt', 'chicla/keys/rsa_id.txt', 'chicla/ssh/readme.txt', 'chicla/aws/readme.txt', 'chicla/.npmrc.d/note.txt'.replace('.npmrc.d', 'npmrc.d'),
];
const OUT_CONTROLS = ['report.txt', 'notes/ssh.md'];

function dump(T, mode, { args = [], withOutputs = true } = {}) {
  const work = join(T, 'work'), outdir = join(T, 'out'), tool = join(T, 'tool'), bin = join(T, 'bin');
  mkdirSync(outdir, { recursive: true }); mkdirSync(bin);
  const put = (base, rel, data) => { mkdirSync(dirname(join(base, rel)), { recursive: true }); writeFileSync(join(base, rel), data); };
  put(work, 'chicla/package.json', '{"version":"0.0.1"}\n'); put(work, 'chicla/FILES.manifest', 'a.txt\n');
  SECRET_NAMES.forEach((rel, i) => put(work, rel, `${MARK}-${i}\n`));
  CONTROLS.forEach((rel) => put(work, rel, 'ordinary\n'));
  if (withOutputs) { OUT_SECRETS.forEach((rel, i) => put(outdir, rel, `${MARK}-o${i}\n`)); OUT_CONTROLS.forEach((rel) => put(outdir, rel, 'ordinary\n')); }
  for (const f of COPY) { mkdirSync(dirname(join(tool, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(tool, f)); }
  let env = process.env, node = process.execPath;
  if (mode !== 'stream') {
    writeFileSync(join(tool, 'packages/chicla-zip/src/zipkit.mjs'), BROKEN);
    symlinkSync(process.execPath, join(bin, 'node'));
    for (const t of mode === 'zip' ? [ZIP] : [TAR, GZIP]) symlinkSync(t, join(bin, t.split('/').pop()));
    node = join(bin, 'node'); env = { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
  }
  const before = new Set(readdirSync(outdir));
  const r = spawnSync(node, [join(tool, 'scripts/emergency-dump.mjs'), '--work', work, '--outdir', outdir, ...(withOutputs ? [] : ['--no-outputs']), ...args, 'c64'], { encoding: 'utf8', env, maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, 'the dump always comes out: ' + r.stdout + r.stderr);
  const f = readdirSync(outdir).find((n) => !before.has(n) && n.endsWith(mode === 'tar' ? '.tar.gz' : '.zip'));
  assert.ok(f, `a ${mode === 'tar' ? '.tar.gz' : '.zip'} in ${readdirSync(outdir)}`);
  const path = join(outdir, f);
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
  const o = spawnSync(PY, ['-c', code, path], { encoding: 'utf8', maxBuffer: 1 << 29 });
  assert.equal(o.status, 0, o.stderr);
  const x = JSON.parse(o.stdout);
  return { r, path, names: new Set(x.names), marker: x.marker, report: x.report, bytes: x.all };
}

// Every byte under a folder, and every name: the recovery must not have put the marker anywhere.
const walkAll = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => { const p = join(dir, e.name); return e.isDirectory() ? walkAll(p) : [p]; });
const leaks = (dir) => walkAll(dir).filter((p) => readFileSync(p).includes(MARK) || p.includes(MARK));

for (const [mode, ok] of [['stream', true], ['zip', !!ZIP], ['tar', !!TAR && !!GZIP]]) {
  test(`secret marker (${mode} path): in no member, marker, report or console of the dump; the controls stay; recovery-report brings it back nowhere`, { skip: !PY || !ok }, () => {
    const T = mkdtempSync(join(tmpdir(), 'chicla-c64-'));
    try {
      const { r, path, names, marker, report, bytes } = dump(T, mode);
      for (const rel of SECRET_NAMES) assert.ok(!names.has(`work/${rel}`), `work/${rel} must not be in the dump`);
      for (const rel of OUT_SECRETS) assert.ok(!names.has(`outputs/${rel}`), `outputs/${rel} must not be in the dump`);
      for (const rel of CONTROLS.filter((x) => mode !== 'tar' || !/\.env\.(example|sample)$/.test(x))) assert.ok(names.has(`work/${rel}`), `${rel} (a control) must stay in the dump`); // known limit, written in the dump's header: the tar.gz fallback does not put .env.example/.sample back
      for (const rel of OUT_CONTROLS) assert.ok(names.has(`outputs/${rel}`), `outputs/${rel} (a control) must stay in the dump`);
      assert.ok(names.has('work/chicla/package.json'));
      assert.ok(!bytes.includes(MARK), 'the marker is in no member of the dump');
      for (const [where, text] of [['marker', JSON.stringify(marker)], ['report', report], ['console', r.stdout + r.stderr]]) assert.ok(!text.includes(MARK), `the marker is not in the dump's ${where}`);
      // the chain goes on: recovery-report extracts the dump and writes its own report
      const out = join(T, 'recovered');
      const rec = spawnSync(process.execPath, [pinnedFile(ROOT, 'recovery-report'), path, '--out', out], { encoding: 'utf8', maxBuffer: 1 << 28 });
      assert.equal(rec.status, 0, rec.stdout + rec.stderr);
      assert.ok(!(rec.stdout + rec.stderr).includes(MARK), 'the marker is not on the console of recovery-report');
      assert.deepEqual(leaks(out), [], 'the marker is nowhere in what recovery-report extracted or wrote');
    } finally { rmSync(T, { recursive: true, force: true }); }
  });
}

test('secret marker, --project-only: only the project goes, and not a credential of it', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c64-'));
  try {
    const { r, names, marker, report, bytes } = dump(T, 'stream', { args: ['--project-only'] });
    for (const n of names) assert.ok(n.startsWith('work/chicla/') || n.startsWith('RECOVER/') || ['RECOVERY_MARKER.json', 'RECOVERY_REPORT.md'].includes(n), `${n}: only the project, RECOVER/ and the two reports`);
    for (const rel of SECRET_NAMES.filter((x) => x.startsWith('chicla/'))) assert.ok(!names.has(`work/${rel}`), rel);
    for (const rel of CONTROLS) assert.ok(names.has(`work/${rel}`), `${rel} (a control) must stay`);
    assert.ok(!bytes.includes(MARK) && !JSON.stringify(marker).includes(MARK) && !report.includes(MARK) && !(r.stdout + r.stderr).includes(MARK));
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('secret marker: a control that is NOT a credential is not enough to leak one (sanity: the marker really is in the files before the dump)', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c64-'));
  try {
    dump(T, 'stream', { withOutputs: false });
    const w = join(T, 'work');
    for (const rel of SECRET_NAMES.slice(0, 6)) assert.ok(readFileSync(join(w, rel), 'utf8').startsWith(MARK), `${rel} holds the marker on disk`);
    assert.ok(statSync(join(w, 'chicla/.npmrc')).isFile());
  } finally { rmSync(T, { recursive: true, force: true }); }
});
