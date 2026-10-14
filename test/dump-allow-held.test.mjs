// C6.3 slice c2 (round 109, D77 (5), D78 (1) (4) (5)):
//   - emergency-dump: a file the project's chicla.policy.json RELEASES with `allow` (a false positive of the content detector) is no longer held back; it goes into
//     the dump like any file, silently (it is not in `secretsHeld`, not in the report section, not on the console). The dump keeps its OWN copy of the rule (D7):
//     exact path from the project root, compared in NFC, tied to policy.mjs's policyAllows() by behaviour. A policy that cannot be used releases nothing.
//   - recovery-report: reads `marker.secretsHeld`, lists those files under «Held back by the dump» (name and kind only) and takes them OUT of «MISSING vs the base»;
//     a file the recovered project's policy allows is NOT held back (an older dump held it anyway, D78 (5)): it stays MISSING.
// The samples are built by concatenation so that this very file, being part of the project, is not caught by the detector.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DUMP_COPY, PINNED } from './toolchain-files.mjs';
import { importPinned, pinnedFile } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = await importPinned('policy');
const which = (n) => spawnSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
const PY = which('python3'), ZIP = which('zip'), TAR = which('tar'), GZIP = which('gzip');
const AWS = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
const SECRET = `id = ${AWS}\n`;
const nfc = (s) => s.normalize('NFC');
const COPY = DUMP_COPY;
const BROKEN = 'export const writeZipStream = async () => { throw new Error("broken on purpose"); };\n';

// files: path relative to work/ -> string. mode: 'stream' | 'zip' (writer broken) | 'tar' (writer broken, no zip). omit: files of the tool copy to remove.
function dump(T, mode, files, { args = [], omit = [], outputs = {}, bare = false } = {}) {
  const work = join(T, 'work'), outdir = join(T, 'out'), tool = join(T, 'tool'), bin = join(T, 'bin');
  mkdirSync(outdir, { recursive: true }); mkdirSync(bin);
  const put = (rel, data) => { mkdirSync(dirname(join(work, rel)), { recursive: true }); writeFileSync(join(work, rel), data); };
  if (!bare) { put('chicla/package.json', '{"version":"0.0.1"}\n'); put('chicla/FILES.manifest', 'a.txt\n'); }
  for (const [rel, data] of Object.entries(files)) put(rel, data);
  for (const [rel, data] of Object.entries(outputs)) { mkdirSync(dirname(join(outdir, rel)), { recursive: true }); writeFileSync(join(outdir, rel), data); }
  for (const f of COPY) { if (omit.includes(f)) continue; mkdirSync(dirname(join(tool, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(tool, f)); }
  let env = process.env, node = process.execPath;
  if (mode !== 'stream') {
    writeFileSync(join(tool, 'packages/chicla-zip/src/zipkit.mjs'), BROKEN);
    symlinkSync(process.execPath, join(bin, 'node'));
    for (const t of mode === 'zip' ? [ZIP] : [TAR, GZIP]) symlinkSync(t, join(bin, t.split('/').pop()));
    node = join(bin, 'node'); env = { PATH: bin, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
  }
  const r = spawnSync(node, [join(tool, 'scripts/emergency-dump.mjs'), '--work', work, '--outdir', outdir, ...(Object.keys(outputs).length ? [] : ['--no-outputs']), ...args, 'c63c2'], { encoding: 'utf8', env, maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, 'the dump always comes out: ' + r.stdout + r.stderr);
  const f = readdirSync(outdir).find((n) => n.endsWith(mode === 'tar' ? '.tar.gz' : '.zip'));
  assert.ok(f, `a ${mode === 'tar' ? '.tar.gz' : '.zip'} in ${readdirSync(outdir)}`);
  const code = [
    'import sys,json,zipfile,tarfile',
    'p=sys.argv[1]',
    'if p.endswith(".zip"):',
    '    z=zipfile.ZipFile(p); names=z.namelist(); rd=lambda n: z.read(n)',
    'else:',
    '    t=tarfile.open(p); names=[m.name for m in t.getmembers()]; rd=lambda n: t.extractfile(n).read()',
    'strip=lambda n: n[2:] if n.startswith("./") else n',
    'out={"names":[strip(n) for n in names]}',
    'out["marker"]=json.loads(rd(next(n for n in names if strip(n)=="RECOVERY_MARKER.json")).decode("utf8"))',
    'out["report"]=rd(next(n for n in names if strip(n)=="RECOVERY_REPORT.md")).decode("utf8")',
    'print(json.dumps(out))',
  ].join('\n');
  const o = spawnSync(PY, ['-c', code, join(outdir, f)], { encoding: 'utf8', maxBuffer: 1 << 29 });
  assert.equal(o.status, 0, o.stderr);
  const x = JSON.parse(o.stdout);
  return { r, names: new Set(x.names.map(nfc)), marker: x.marker, report: x.report };
}
const T0 = () => mkdtempSync(join(tmpdir(), 'chicla-c63c2-'));
const POL = (o) => JSON.stringify({ version: 1, ...o });

for (const [mode, ok] of [['stream', true], ['zip', !!ZIP], ['tar', !!TAR && !!GZIP]]) {
  test(`emergency-dump (${mode} path): a file released by \`allow\` goes into the dump, silently; an identical file that is not released stays held`, { skip: !PY || !ok }, () => {
    const T = T0();
    try {
      const { r, names, marker, report } = dump(T, mode, {
        'chicla/chicla.policy.json': POL({ allow: ['docs/example-key.txt'] }),
        'chicla/docs/example-key.txt': SECRET, // released: a false positive
        'chicla/docs/other-key.txt': SECRET,   // not released
        'chicla/sub/docs/example-key.txt': SECRET, // same name deeper: `allow` is an exact path from the project root
        'docs/example-key.txt': SECRET,        // outside the project root: not its policy's business
        'scratc/docs/example-key.txt': SECRET, // outside, and 6 characters + «/» in front: it would match if the project's prefix were cut off blindly
      }, { outputs: { 'chicla/docs/example-key.txt': SECRET } }); // a file in outputs/ with the same relative path: the policy is about the project in work/
      assert.ok(names.has('work/chicla/docs/example-key.txt'), 'the released file is in the dump');
      for (const rel of ['chicla/docs/other-key.txt', 'chicla/sub/docs/example-key.txt', 'docs/example-key.txt']) assert.ok(!names.has(`work/${rel}`), `${rel} stays out`);
      assert.deepEqual(marker.secretsHeld.map((h) => h.path), ['outputs/chicla/docs/example-key.txt', 'work/chicla/docs/other-key.txt', 'work/chicla/sub/docs/example-key.txt', 'work/docs/example-key.txt', 'work/scratc/docs/example-key.txt']);
      assert.ok(!names.has('outputs/chicla/docs/example-key.txt') && !names.has('work/scratc/docs/example-key.txt'));
      assert.ok(!report.includes('docs/example-key.txt  [') || !report.split('\n').some((l) => l.startsWith('- work/chicla/docs/example-key.txt')), 'silent: not in the «Held back» list of the report');
      assert.ok(!r.stdout.split('\n').some((l) => /^\s+work\/chicla\/docs\/example-key\.txt\s+\[/.test(l)), 'silent: not on the console');
      assert.match(r.stdout, /5 file\(s\) held back/);
      assert.ok('docs/example-key.txt' in marker.hashes, 'a released file is hashed like any project file');
    } finally { rmSync(T, { recursive: true, force: true }); }
  });
}

test('emergency-dump: a name that is NFD on disk is released by an NFC `allow` entry (and the other way round)', { skip: !PY }, () => {
  const T = T0();
  try {
    const { names } = dump(T, 'stream', { 'chicla/chicla.policy.json': POL({ allow: ['relatório/k.txt', 'ação/m.txt'.normalize('NFD')] }), 'chicla/relato\u0301rio/k.txt': SECRET, 'chicla/açãoo/m.txt': SECRET, 'chicla/ação/m.txt': SECRET });
    assert.ok(names.has(nfc('work/chicla/relatório/k.txt')), 'NFD on disk, NFC in the policy');
    assert.ok(names.has(nfc('work/chicla/ação/m.txt')), 'NFC on disk, NFD in the policy');
    assert.ok(!names.has(nfc('work/chicla/açãoo/m.txt')), 'a different name is not released');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('emergency-dump: `allow` compares in NFC and behaves as policyAllows() does (tie by behaviour, D7)', { skip: !PY }, () => {
  const T = T0();
  try {
    const allow = ['relatório/k.txt', 'a/b.txt', 'Case/File.txt'];
    const cases = ['relatório/k.txt', 'relato\u0301rio/k.txt', 'a/b.txt', 'a/b.txt.bak', 'a/c.txt', 'A/b.txt', 'case/file.txt', 'Case/File.txt', 'x/a/b.txt', 'a'];
    const files = { 'chicla/chicla.policy.json': POL({ allow }) };
    for (const c of cases) files[`chicla/${c}`] = SECRET;
    // `a` is a file AND the first segment of `a/b.txt`: keep the table honest by dropping the one that cannot exist beside the others
    delete files['chicla/a'];
    const { names } = dump(T, 'stream', files);
    const pol = policy.parsePolicy(POL({ allow }));
    for (const c of cases.filter((x) => x !== 'a')) assert.equal(names.has(nfc(`work/chicla/${c}`)), policy.policyAllows(c, pol), `${JSON.stringify(c)}: the dump and policyAllows() agree`);
    assert.ok(names.has(nfc('work/chicla/relatório/k.txt')), 'the NFD-named file is released');
    assert.ok(!names.has('work/chicla/a/c.txt'));
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('emergency-dump: a policy that cannot be used (broken file, or policy.mjs missing) releases NOTHING; the dump still comes out', { skip: !PY }, () => {
  for (const bad of ['broken', 'nopolicy']) {
    const T = T0();
    try {
      const pol = bad === 'broken' ? '{ not json' : POL({ allow: ['k.txt'] });
      const { names, marker } = dump(T, 'stream', { 'chicla/chicla.policy.json': pol, 'chicla/k.txt': SECRET }, { omit: bad === 'nopolicy' ? [PINNED.policy] : [] });
      assert.ok(!names.has('work/chicla/k.txt'), `${bad}: still held back (the safe side)`);
      assert.deepEqual(marker.secretsHeld.map((h) => h.path), ['work/chicla/k.txt']);
      assert.ok(marker.policy.error, `${bad}: the marker says the policy was not applied`);
    } finally { rmSync(T, { recursive: true, force: true }); }
  }
});

test('emergency-dump: a released file that the same policy also lists in names/paths stays out, and is not «held back» either', { skip: !PY }, () => {
  const T = T0();
  try {
    const { names, marker } = dump(T, 'stream', { 'chicla/chicla.policy.json': POL({ allow: ['gen/k.txt'], paths: ['gen/'] }), 'chicla/gen/k.txt': SECRET, 'chicla/gen/ok.txt': 'x\n' });
    assert.ok(!names.has('work/chicla/gen/k.txt') && !names.has('work/chicla/gen/ok.txt'), 'the policy listing wins');
    assert.deepEqual(marker.secretsHeld, []);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('emergency-dump --project-only: the released file is in the dump too', { skip: !PY }, () => {
  const T = T0();
  try {
    const { names, marker } = dump(T, 'stream', { 'chicla/chicla.policy.json': POL({ allow: ['k.txt'] }), 'chicla/k.txt': SECRET, 'chicla/m.txt': SECRET }, { args: ['--project-only'] });
    assert.ok(names.has('work/chicla/k.txt') && !names.has('work/chicla/m.txt'));
    assert.deepEqual(marker.secretsHeld.map((h) => h.path), ['work/chicla/m.txt']);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

// ---- recovery-report ----
const pyzip = (path, entries) => assert.equal(spawnSync(PY, ['-c', 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1],"w");[z.writestr(n,t) for n,t in json.loads(sys.argv[2])];z.close()', path, JSON.stringify(entries)], { encoding: 'utf8' }).status, 0);
const section = (diff, head) => { const p = diff.split(head)[1]; return p === undefined ? null : p.split('\n').slice(1).join('\n').split('\n###')[0].split('\n##')[0].split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2)).filter((l) => !l.startsWith('(') && !l.startsWith('…')); };
function recover(T, { held, entries = [], baseEntries = [], markerExtra = {} }) {
  const marker = JSON.stringify({ format: 'chicla-recovery-v1', projectRootRel: 'chicla', hashes: {}, created: 'x', note: 't', ...(held === undefined ? {} : { secretsHeld: held }), ...markerExtra });
  const P = 'work/chicla/';
  const dumpZ = join(T, 'd.zip'), base = join(T, 'b.zip'), out = join(T, 'rec');
  pyzip(dumpZ, [['RECOVERY_MARKER.json', marker], [P + 'FILES.manifest', 'a.txt\n'], [P + 'package.json', '{}'], [P + 'a.txt', 'a'], ...entries.map(([n, t]) => [P + n, t])]);
  pyzip(base, [['chicla/package.json', '{}'], ['chicla/a.txt', 'a'], ...baseEntries.map(([n, t]) => ['chicla/' + n, t])]);
  const r = spawnSync(process.execPath, [pinnedFile(ROOT, 'recovery-report'), dumpZ, '--baseline', base, '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const diff = readFileSync(join(out, 'RECOVERY_DIFF.md'), 'utf8');
  return { r, diff, missing: section(diff, '### MISSING vs the base'), held: section(diff, '### Held back by the dump') };
}

test('recovery-report: a file the dump held back is «held back» (name and kind), not «MISSING»; a file that is simply gone stays MISSING', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c63c2-r-'));
  try {
    const { held, missing, diff } = recover(T, { held: [{ path: 'work/chicla/src/k.js', kind: 'GitHub token' }], baseEntries: [['src/k.js', 'old'], ['gone.txt', 'g']] });
    assert.deepEqual(missing, ['gone.txt']);
    assert.equal(held.length, 1);
    assert.ok(held[0].includes('src/k.js') && held[0].includes('GitHub token'), held[0]);
    assert.ok(diff.includes('Held back by the dump (1)'));
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('recovery-report: names compare in NFC, and held files outside the project are listed but never counted as missing', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c63c2-r-'));
  try {
    const { held, missing } = recover(T, { held: [{ path: 'work/chicla/relato\u0301rio/k.txt', kind: 'private key' }, { path: 'work/notes.txt', kind: 'AWS access key' }, { path: 'outputs/x.txt', kind: 'npm token' }], baseEntries: [['relatório/k.txt', 'old']] });
    assert.deepEqual(missing, [], 'the NFC/NFD pair is one file');
    assert.equal(held.length, 3);
    assert.ok(held.some((l) => l.includes('work/notes.txt') && l.includes('AWS access key')) && held.some((l) => l.includes('outputs/x.txt')));
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('recovery-report: a file the recovered project\'s policy allows is NOT held back (an older dump held it anyway): it stays MISSING', { skip: !PY }, () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c63c2-r-'));
  try {
    const { held, missing } = recover(T, { held: [{ path: 'work/chicla/docs/k.txt', kind: 'AWS access key' }, { path: 'work/chicla/src/k.js', kind: 'GitHub token' }], entries: [['chicla.policy.json', POL({ allow: ['docs/k.txt'] })]], baseEntries: [['docs/k.txt', 'o'], ['src/k.js', 'o']] });
    assert.deepEqual(missing, ['docs/k.txt']);
    assert.equal(held.length, 1);
    assert.ok(held[0].includes('src/k.js'));
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('recovery-report: no `secretsHeld` (an older dump) or a malformed one changes nothing and never stops the recovery; the match is never printed', { skip: !PY }, () => {
  for (const held of [undefined, 'x', { a: 1 }, [null, 5, { path: 1, kind: 2 }, { kind: 'x' }]]) {
    const T = mkdtempSync(join(tmpdir(), 'chicla-c63c2-r-'));
    try {
      const { missing, held: h } = recover(T, { held, baseEntries: [['gone.txt', 'g']] });
      assert.deepEqual(missing, ['gone.txt'], JSON.stringify(held));
      assert.deepEqual(h ?? [], [], JSON.stringify(held));
    } finally { rmSync(T, { recursive: true, force: true }); }
  }
});

// C6.3 follow-up (round 110, D79 (4)): a held file that FILES.manifest lists is «held back», not «lost»: the dump's own report and console leave it out of
// «NOT on disk» / «missing vs manifest» (it is named in the «Held back» section instead). A file that is really gone stays in the list.
test('emergency-dump: a held file listed in FILES.manifest is not «NOT on disk» in the report nor «missing vs manifest» on the console; a really missing one still is', { skip: !PY }, () => {
  const T = T0();
  try {
    const { r, report, marker } = dump(T, 'stream', { 'chicla/FILES.manifest': 'k.js\ngone.txt\nrelat\u00f3rio/h.txt\n', 'chicla/k.js': SECRET, 'chicla/relato\u0301rio/h.txt': SECRET });
    const lost = report.split('NOT on disk')[1].split('\n## ')[0].split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2)).filter((l) => !l.startsWith('('));
    assert.deepEqual(lost, ['gone.txt']);
    assert.deepEqual(marker.secretsHeld.map((h) => h.path).sort(), ['work/chicla/k.js', 'work/chicla/relato\u0301rio/h.txt'].sort());
    assert.ok(report.split('\n').some((l) => l.startsWith('- work/chicla/k.js')), 'it is named in the «Held back» section');
    assert.match(r.stdout, /1 missing vs manifest/);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('emergency-dump: with NO project root a held file is still held back and the dump still comes out', { skip: !PY }, () => {
  const T = T0();
  try {
    const { names, marker } = dump(T, 'stream', { 'notes.txt': SECRET, 'ok.txt': 'x\n' }, { bare: true });
    assert.ok(!names.has('work/notes.txt') && names.has('work/ok.txt'));
    assert.deepEqual(marker.secretsHeld.map((h) => h.path), ['work/notes.txt']);
  } finally { rmSync(T, { recursive: true, force: true }); }
});
