// C11.1, slice 4b (D82, D83) — `recovery-report` as a core (`recoveryReport({ dump, baseline, out, toolchainDigest, trustToolchain })`: never prints, exits or
// throws) and `chicla recovery <dump.zip> [--baseline <zip>] [--out <dir>] [--json]`. Exit 0 ok · 1 no recovery (not a dump, cannot extract, ...) · 2 usage ·
// 3 EHASH_TOOLCHAIN. The toolchain check only applies when the script runs from a folder named RECOVER/ (a dump's own copy); this slice changes a PINNED file,
// so the pin in CLAUDE.md moves (test/toolchain-pin.test.mjs). Dumps are made by the 4a core; zips are rewritten and read by Python's zipfile, never by the code
// under test. Every project is a temp copy; the real tree is never touched.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TOOLCHAIN_SOURCES, importPinned, pinnedFile, pinnedPath } from '../../../test/toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = pinnedFile(ROOT, 'recovery-report');
const PY = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();
const skip = !PY && 'no python3';
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const { main } = await imp('packages/chicla-kit/src/cli.mjs');
const { emergencyDump } = await imp('scripts/emergency-dump.mjs');
const { recoveryReport, renderRecoveryReport } = await importPinned('recovery-report');

const T = mkdtempSync(join(tmpdir(), 'chicla-c111f-'));
after(() => rmSync(T, { recursive: true, force: true }));
let n = 0;
const fresh = (name) => join(T, `${name}${n++}`);
/** A dump of a small project (note «half done»): a.txt is in the manifest, ghost.txt is listed but absent, new.txt is on disk but not listed. */
const dumpOf = async (extra = {}) => {
  const base = fresh('d'), work = join(base, 'work'), outdir = join(base, 'out');
  const put = (rel, text) => { mkdirSync(dirname(join(work, rel)), { recursive: true }); writeFileSync(join(work, rel), text); };
  put('chicla/package.json', '{"name":"p","private":true,"version":"0.0.7"}\n'); put('chicla/FILES.manifest', 'a.txt\nghost.txt\n'); put('chicla/a.txt', 'a\n'); put('chicla/new.txt', 'n\n');
  put('chicla/CHANGELOG.md', '<!-- CHANGELOG_FINGERPRINT: seq=7 -->\n# Changelog\n\n## Round 3 — x\n'); put('chicla/CHICLA_PROJECT_STATUS-7.md', '# Status\n');
  for (const [rel, text] of Object.entries(extra)) put(rel, text);
  mkdirSync(outdir, { recursive: true });
  const r = await emergencyDump({ work, outdir, note: 'half done' }); assert.equal(r.ok, true);
  return r.path;
};
const py = (code, ...args) => { const r = spawnSync(PY, ['-c', code, ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
/** The zip `src` rewritten to `dst` with the member `name` replaced by `data` (Python, not the code under test). */
const tamper = (src, dst, name, data) => { py('import zipfile,sys\nzin=zipfile.ZipFile(sys.argv[1]);zout=zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED)\nfor i in zin.infolist():\n  d=zin.read(i.filename)\n  zout.writestr(i.filename, sys.argv[4].encode() if i.filename==sys.argv[3] else d)\nzout.close()', src, dst, name, data); return dst; };
/** A zip made by Python from { name: text }. */
const makeZip = (dst, files) => { py('import zipfile,sys,json\nz=zipfile.ZipFile(sys.argv[1],"w")\nfor k,v in json.loads(sys.argv[2]).items(): z.writestr(k,v)\nz.close()', dst, JSON.stringify(files)); return dst; };
const run = async (args, cwd = T) => {
  let out = '', err = '';
  const status = await main(args, { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd });
  return { status, out, err };
};
const norm = (text, ...dirs) => dirs.reduce((t, d) => t.split(d).join('<out>'), text).replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<time>');
const digestOf = (dir) => { const names = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort(); return createHash('sha256').update(names.map((f) => `${createHash('sha256').update(readFileSync(join(dir, f))).digest('hex')}  RECOVER/${f}\n`).join('')).digest('hex'); };
/** What a dump carries in RECOVER/: this tree's five pinned files, flat, in a folder NAMED RECOVER. */
const recoverDir = () => {
  const d = join(fresh('rc'), 'RECOVER'); mkdirSync(d, { recursive: true });
  for (const [name, src] of Object.entries(TOOLCHAIN_SOURCES)) copyFileSync(join(ROOT, src), join(d, name));
  return d;
};

test('core: recoveryReport extracts the dump, compares with FILES.manifest and returns the facts', { skip }, async () => {
  const dump = await dumpOf(), out = fresh('o');
  const r = await recoveryReport({ dump, out });
  assert.equal(r.ok, true); assert.equal(r.code, null); assert.equal(r.out, out);
  assert.equal(r.root, join(out, 'work', 'chicla')); assert.ok(existsSync(join(r.root, 'a.txt'))); assert.equal(r.report, join(out, 'RECOVERY_DIFF.md')); assert.ok(existsSync(r.report));
  assert.equal(r.note, 'half done'); assert.equal(r.afterRound, '3');
  assert.ok(r.added.includes('new.txt'), 'new.txt is not in the manifest'); assert.deepEqual(r.removed, ['ghost.txt'], 'ghost.txt is listed but absent'); assert.deepEqual(r.modified, []);
  assert.deepEqual(r.changedInTransit, []); assert.match(r.against, /FILES\.manifest/);
  assert.ok(readFileSync(r.report, 'utf8').includes('MISSING vs the base (1)'));
  assert.ok(Array.isArray(r.messages) && r.messages.length > 0);
});

test('core: a second recovery into the same --out goes to -2 (the first is never overwritten)', { skip }, async () => {
  const dump = await dumpOf(), out = fresh('o');
  const a = await recoveryReport({ dump, out }), b = await recoveryReport({ dump, out });
  assert.equal(a.out, out); assert.equal(b.out, `${out}-2`);
  assert.ok(existsSync(join(a.out, 'RECOVERY_DIFF.md')) && existsSync(join(b.out, 'RECOVERY_DIFF.md')));
});

test('core: --baseline (a zip) is the base: modified, new and missing come from it', { skip }, async () => {
  const dump = await dumpOf(), out = fresh('o');
  const dir = fresh('b'); mkdirSync(dir);
  const base = makeZip(join(dir, 'base.zip'), { 'package.json': '{"name":"p","private":true,"version":"0.0.7"}\n', 'a.txt': 'old\n', 'gone.txt': 'g\n' });
  const r = await recoveryReport({ dump, baseline: base, out });
  assert.equal(r.ok, true); assert.ok(r.modified.includes('a.txt')); assert.ok(r.added.includes('new.txt')); assert.deepEqual(r.removed, ['gone.txt']); assert.match(r.against, /baseline base\.zip/);
});

test('core: a file that differs from the marker sha256 is reported as changed in transit', { skip }, async () => {
  const dump = await dumpOf(), dir = fresh('t'); mkdirSync(dir);
  const bad = tamper(dump, join(dir, 'bad.zip'), 'work/chicla/a.txt', 'tampered\n');
  const r = await recoveryReport({ dump: bad, out: fresh('o') });
  assert.equal(r.ok, true, 'a corrupted zip is still reported, not refused');
  assert.deepEqual(r.changedInTransit, ['a.txt']);
  const good = await recoveryReport({ dump, out: fresh('o') });
  assert.deepEqual(good.changedInTransit, [], 'and an intact one reports none');
});

test('core: a zip that is not a dump, a file that is not a zip, a missing file and no dump at all come back as codes (never a throw)', { skip }, async () => {
  const dir = fresh('z'); mkdirSync(dir);
  const plain = makeZip(join(dir, 'plain.zip'), { 'package.json': '{}\n' });
  const a = await recoveryReport({ dump: plain, out: fresh('o') });
  assert.equal(a.ok, false); assert.equal(a.code, 'ENOT_DUMP');
  writeFileSync(join(dir, 'junk.zip'), 'not a zip at all');
  assert.equal((await recoveryReport({ dump: join(dir, 'junk.zip'), out: fresh('o') })).code, 'ERECOVERY_EXTRACT');
  assert.equal((await recoveryReport({ dump: join(dir, 'missing.zip'), out: fresh('o') })).code, 'ERECOVERY_EXTRACT');
  const d = await recoveryReport({ out: fresh('o') });
  assert.equal(d.ok, false); assert.equal(d.code, 'EUSAGE');
  const broken = makeZip(join(dir, 'broken.zip'), { 'RECOVERY_MARKER.json': '{not json' });
  const e = await recoveryReport({ dump: broken, out: fresh('o') });
  assert.equal(e.ok, false); assert.equal(e.code, 'ERECOVERY_ERROR', 'a corrupt marker is an unexpected error, returned as a code');
  assert.ok(e.messages.some((m) => m.stream === 'err'));
});

test('core: importing the script and calling the core prints nothing and never exits (child process), for a recovery and for a refusal', { skip }, async () => {
  const dump = await dumpOf(), dir = fresh('z'); mkdirSync(dir);
  const plain = makeZip(join(dir, 'plain.zip'), { 'package.json': '{}\n' });
  for (const [d, want] of [[dump, 0], [plain, 7]]) {
    const code = `import(${JSON.stringify(pathToFileURL(SCRIPT).href)}).then(async (m) => { const r = await m.recoveryReport(${JSON.stringify({ dump: d, out: fresh('o') })}); process.exitCode = r.ok ? 0 : 7; });`;
    const c = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', cwd: T });
    assert.equal(c.stdout, ''); assert.equal(c.stderr, ''); assert.equal(c.status, want);
  }
});

test('toolchain: run from a folder named RECOVER, a wrong digest refuses with EHASH_TOOLCHAIN (exit 3) before extracting anything; --trust-toolchain and the right digest go on', { skip }, async () => {
  const dump = await dumpOf(), rc = recoverDir(), good = digestOf(rc), script = join(rc, 'recovery-report.mjs');
  const bad = spawnSync(process.execPath, [script, dump, '--out', fresh('o'), '--toolchain-digest', '0'.repeat(64)], { encoding: 'utf8' });
  assert.equal(bad.status, 3); assert.match(bad.stderr, /EHASH_TOOLCHAIN/);
  const none = spawnSync(process.execPath, [script, dump, '--out', fresh('o')], { encoding: 'utf8' });
  assert.equal(none.status, 3, 'no digest given is a mismatch too');
  const refusedOut = fresh('o');
  const refused = spawnSync(process.execPath, [script, dump, '--out', refusedOut, '--toolchain-digest', '0'.repeat(64)], { encoding: 'utf8' });
  assert.equal(refused.status, 3); assert.ok(!existsSync(refusedOut), 'nothing was extracted');
  const trust = spawnSync(process.execPath, [script, dump, '--out', fresh('o'), '--toolchain-digest', '0'.repeat(64), '--trust-toolchain'], { encoding: 'utf8' });
  assert.equal(trust.status, 0, trust.stderr); assert.match(trust.stderr, /ignored by --trust-toolchain/);
  const ok = spawnSync(process.execPath, [script, dump, '--out', fresh('o'), '--toolchain-digest', good], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  // the core, imported from the RECOVER copy, answers with the code instead of exiting
  const m = await import(pathToFileURL(script).href);
  const r = await m.recoveryReport({ dump, out: fresh('o'), toolchainDigest: '0'.repeat(64) });
  assert.equal(r.ok, false); assert.equal(r.code, 'EHASH_TOOLCHAIN');
  assert.equal((await m.recoveryReport({ dump, out: fresh('o'), toolchainDigest: good })).ok, true);
  assert.equal((await m.recoveryReport({ dump, out: fresh('o'), toolchainDigest: '0'.repeat(64), trustToolchain: true })).ok, true);
});

test('cli: `recovery` recovers, exits 0, and prints the same text as the script (parity)', { skip }, async () => {
  const dump = await dumpOf(), a = fresh('o'), b = fresh('o');
  const r = await run(['recovery', dump, '--out', a]);
  assert.equal(r.status, 0, r.err);
  const s = spawnSync(process.execPath, [SCRIPT, dump, '--out', b], { encoding: 'utf8' });
  assert.equal(s.status, 0);
  assert.equal(norm(r.out, a), norm(s.stdout, b), 'stdout is the same'); assert.equal(norm(r.err, a), norm(s.stderr, b), 'stderr is the same');
  assert.match(r.out, /RECOVERY DIFF/); assert.ok(existsSync(join(a, 'RECOVERY_DIFF.md')));
});

test('cli: --json writes ONE object on stdout (no messages key) and the human text on stderr; --baseline is used', { skip }, async () => {
  const dump = await dumpOf(), dir = fresh('b'); mkdirSync(dir);
  const base = makeZip(join(dir, 'base.zip'), { 'a.txt': 'old\n' });
  const r = await run(['recovery', dump, '--baseline', base, '--out', fresh('o'), '--json']);
  assert.equal(r.status, 0); assert.equal(r.out.trim().split('\n').length, 1);
  const o = JSON.parse(r.out); assert.equal(o.ok, true); assert.equal(o.command, 'recovery'); assert.equal(o.code, null); assert.ok(o.modified.includes('a.txt')); assert.ok(!('messages' in o));
  assert.match(r.err, /RECOVERY DIFF/);
});

test('cli: not a dump exits 1 with ENOT_DUMP; extraction failures exit 1; usage errors exit 2; `--root` is refused (a recovery has --out)', { skip }, async () => {
  const dir = fresh('z'); mkdirSync(dir);
  const plain = makeZip(join(dir, 'plain.zip'), { 'package.json': '{}\n' });
  const nd = await run(['recovery', plain, '--out', fresh('o'), '--json']); assert.equal(nd.status, 1); assert.equal(JSON.parse(nd.out).code, 'ENOT_DUMP');
  const ex = await run(['recovery', join(dir, 'nope.zip'), '--out', fresh('o'), '--json']); assert.equal(ex.status, 1); assert.equal(JSON.parse(ex.out).code, 'ERECOVERY_EXTRACT');
  for (const args of [['recovery'], ['recovery', plain, '--baseline'], ['recovery', plain, '--out'], ['recovery', plain, '--bogus'], ['recovery', plain, 'second.zip'], ['recovery', plain, '--root', dir]]) {
    const u = await run([...args, '--json']); assert.equal(u.status, 2, args.join(' ')); assert.equal(JSON.parse(u.out).code, 'EUSAGE', args.join(' '));
  }
  assert.match((await run(['--help'])).out, /\brecovery\b/, 'the help lists recovery');
});

test('cli: EHASH_TOOLCHAIN from the core is exit 3 (checked with a stand-in core in a copy of the kit, as the real core only checks inside RECOVER/)', async () => {
  const kit = fresh('kit'); mkdirSync(join(kit, 'packages/chicla-kit/src'), { recursive: true }); mkdirSync(dirname(join(kit, pinnedPath('recovery-report'))), { recursive: true }); // C11.1 7: the CLI loads the pinned core itself
  copyFileSync(join(ROOT, 'packages/chicla-kit/src/cli.mjs'), join(kit, 'packages/chicla-kit/src/cli.mjs'));
  copyFileSync(join(ROOT, 'packages/chicla-kit/src/ui.mjs'), join(kit, 'packages/chicla-kit/src/ui.mjs')); // C11.5 b: the CLI imports ui.mjs
  writeFileSync(join(kit, pinnedPath('recovery-report')), 'export const recoveryReport = async () => ({ ok: false, code: "EHASH_TOOLCHAIN", messages: [{ stream: "err", text: "x" }] });\nexport const renderRecoveryReport = (r) => ({ out: "", err: "x\\n" });\n');
  writeFileSync(join(kit, 'package.json'), '{"type":"module"}\n');
  const m = await import(pathToFileURL(join(kit, 'packages/chicla-kit/src/cli.mjs')).href);
  let out = '';
  const status = await m.main(['recovery', 'whatever.zip', '--json'], { stdout: { write: (x) => { out += x; } }, stderr: { write() {} }, cwd: T });
  assert.equal(status, 3); assert.equal(JSON.parse(out).code, 'EHASH_TOOLCHAIN');
});
