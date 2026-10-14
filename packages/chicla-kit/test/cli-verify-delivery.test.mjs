// C11.1, slice 3a — `verify-delivery` as a core (`verifyDelivery({ zip, against, allowRemoved, root })`, never prints, exits or throws) and
// `chicla verify-delivery <zip> [--against <zip>]... [--allow-removed <path>]... [--json] [--root <dir>]`. The script keeps its exact output; the CLI and
// the script run the same code. A delivery zip is made once, by the real writer, in a copy of this tree in a temp folder; variants (a lost file, an
// older upload with an extra file) are made with Python, never by the code under test, as test/verify-against.test.mjs does. Tests assert codes, exit
// statuses and file names; the only text compared is the script's own output against the core's and the CLI's (parity).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned } from '../../../test/toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI = join(ROOT, 'packages/chicla-kit/src/cli.mjs');
const PY = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();
const skip = !PY && 'no python3';
const { verifyDelivery, renderVerifyDelivery } = await import(pathToFileURL(join(ROOT, 'scripts/verify-delivery-zip.mjs')).href);
const { main } = await import(pathToFileURL(CLI).href);

// one project + one valid delivery zip for the whole file (made by the real writer, in a copy of this tree)
const T = mkdtempSync(join(tmpdir(), 'chicla-c111c-')), proj = join(T, 'proj'), ZIP = join(T, 'new.zip');
after(() => rmSync(T, { recursive: true, force: true }));
for (const { path: rel } of parseManifest(readFileSync(join(ROOT, 'FILES.manifest'), 'utf8'))) {
  if (!existsSync(join(ROOT, rel))) continue;
  mkdirSync(dirname(join(proj, rel)), { recursive: true }); copyFileSync(join(ROOT, rel), join(proj, rel));
}
const made = spawnSync(process.execPath, [join(proj, 'scripts/make-delivery-zip.mjs'), ZIP], { cwd: proj, encoding: 'utf8', maxBuffer: 1 << 28 });
assert.equal(made.status, 0, made.stdout + made.stderr);

/** A variant of the valid zip: `drop` = entry names removed, `extra` = names added (empty files), `out` = where it goes. */
const variant = (out, { drop = [], extra = [] } = {}) => {
  const code = 'import zipfile,sys,json\nzin=zipfile.ZipFile(sys.argv[1]);zout=zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED)\ndrop=set(json.loads(sys.argv[3]))\nfor i in zin.infolist():\n  if i.filename not in drop: zout.writestr(i.filename, zin.read(i.filename))\nfor n in json.loads(sys.argv[4]): zout.writestr(n, "x")\nzout.close()';
  const r = spawnSync(PY, ['-c', code, ZIP, out, JSON.stringify(drop), JSON.stringify(extra)], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); return out;
};
const run = async (args, cwd = proj) => {
  let out = '', err = '';
  const status = await main(args, { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd });
  return { status, out, err };
};
const script = (...a) => spawnSync(process.execPath, [join(proj, 'scripts/verify-delivery-zip.mjs'), ...a], { cwd: proj, encoding: 'utf8', maxBuffer: 1 << 28 });

// ---- the core ----

test('core: a valid delivery is ok: code null, the file count, the success line on stdout', () => {
  const r = verifyDelivery({ zip: ZIP, root: proj });
  assert.equal(r.ok, true); assert.equal(r.code, null); assert.deepEqual(r.problems, []); assert.ok(r.files > 100);
  assert.match(renderVerifyDelivery(r).out, /zip ready to paste over/); assert.equal(renderVerifyDelivery(r).err, '');
});

test('core: a lost file is not ok (EVERIFY_FAILED), the problems name it, and nothing is thrown', { skip }, () => {
  const bad = variant(join(T, 'nolicense.zip'), { drop: ['LICENSE'] });
  const r = verifyDelivery({ zip: bad, root: proj });
  assert.equal(r.ok, false); assert.equal(r.code, 'EVERIFY_FAILED'); assert.ok(r.problems.some((p) => p.includes('LICENSE')));
  assert.match(renderVerifyDelivery(r).err, /ZIP IS NOT READY/);
});

test('core: --against: a file of the previous zip that is gone is named, --allow-removed releases it, and a clean comparison prints «nothing lost»', { skip }, () => {
  const prev = variant(join(T, 'prev.zip'), { extra: ['old/gone.txt'] });
  const bad = verifyDelivery({ zip: ZIP, against: [prev], root: proj });
  assert.equal(bad.ok, false); assert.ok(bad.problems.some((p) => p.includes('old/gone.txt')));
  const ok = verifyDelivery({ zip: ZIP, against: [prev], allowRemoved: ['old/gone.txt'], root: proj });
  assert.equal(ok.ok, true, JSON.stringify(ok.problems)); assert.match(renderVerifyDelivery(ok).out, /nothing lost vs prev\.zip/);
});

test('core: unusable input comes back as a code, never thrown: no zip (EVERIFY_USAGE), a missing file and a truncated zip (EZIP_UNREADABLE)', () => {
  assert.equal(verifyDelivery({ root: proj }).code, 'EVERIFY_USAGE'); assert.match(renderVerifyDelivery(verifyDelivery({ root: proj })).err, /usage:/);
  const none = verifyDelivery({ zip: join(T, 'nope.zip'), root: proj }); assert.equal(none.ok, false); assert.equal(none.code, 'EZIP_UNREADABLE');
  const cut = join(T, 'cut.zip'); writeFileSync(cut, readFileSync(ZIP).subarray(0, 30));
  const r = verifyDelivery({ zip: cut, root: proj }); assert.equal(r.ok, false); assert.equal(r.code, 'EZIP_UNREADABLE');
});

test('core: nothing is remembered between calls: the same path, rewritten with a corrupted entry, is read again (EZIP_DATA, no stale zip cache)', { skip }, () => {
  const p = join(T, 'same-path.zip'), bad = join(T, 'same-path-corrupt.zip');
  const code = 'import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1]);i=z.getinfo("LICENSE");b=bytearray(open(sys.argv[1],"rb").read())\ns=i.header_offset+30+len(i.filename.encode())+int.from_bytes(b[i.header_offset+28:i.header_offset+30],"little")\nb[s+i.compress_size//2]^=0xff;open(sys.argv[2],"wb").write(b)';
  const c = spawnSync(PY, ['-c', code, ZIP, bad], { encoding: 'utf8' }); assert.equal(c.status, 0, c.stderr);
  copyFileSync(ZIP, p); assert.equal(verifyDelivery({ zip: p, root: proj }).ok, true);
  copyFileSync(bad, p); const r = verifyDelivery({ zip: p, root: proj });
  assert.equal(r.ok, false); assert.ok(r.problems.some((x) => x.startsWith('EZIP_DATA')), JSON.stringify(r.problems));
  copyFileSync(ZIP, p); assert.equal(verifyDelivery({ zip: p, root: proj }).ok, true);
});

test('core: parity: the script as a process and the core print the same, valid zip and a zip with a lost file', { skip }, () => {
  const bad = variant(join(T, 'parity-bad.zip'), { drop: ['LICENSE'] });
  for (const z of [ZIP, bad]) {
    const s = script(z), { out, err } = renderVerifyDelivery(verifyDelivery({ zip: z, root: proj }));
    assert.equal(s.status, z === ZIP ? 0 : 1); assert.equal(s.stdout, out); assert.equal(s.stderr, err);
  }
  assert.equal(script().status, 2); assert.match(script().stderr, /usage:/);
});

test('core: importing the script runs nothing (no output, no exit): the module only exports', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(join(ROOT, 'scripts/verify-delivery-zip.mjs')).href)}).then((m) => console.log(typeof m.verifyDelivery))`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), 'function');
});

// ---- the CLI ----

test('cli: verify-delivery on a valid zip exits 0 with the success line on stdout; a relative path is read from the CLI cwd', async () => {
  const a = await run(['verify-delivery', ZIP, '--root', proj], '/'); assert.equal(a.status, 0, a.err); assert.match(a.out, /zip ready to paste over/); assert.equal(a.err, '');
  const b = await run(['verify-delivery', 'new.zip', '--root', proj], T); assert.equal(b.status, 0, b.err);
});

test('cli: --json is ONE object on stdout (ok, code, problems, files), the human text on stderr; exit 1 and EVERIFY_FAILED when the zip is not ready', { skip }, async () => {
  const ok = await run(['verify-delivery', ZIP, '--json', '--root', proj], '/'); const o = JSON.parse(ok.out);
  assert.equal(ok.status, 0); assert.equal(o.command, 'verify-delivery'); assert.equal(o.ok, true); assert.equal(o.code, null); assert.deepEqual(o.problems, []); assert.ok(o.files > 100); assert.match(ok.err, /zip ready/);
  const bad = variant(join(T, 'cli-bad.zip'), { drop: ['LICENSE'] });
  const r = await run(['verify-delivery', bad, '--json', '--root', proj], '/'); const b = JSON.parse(r.out);
  assert.equal(r.status, 1); assert.equal(b.ok, false); assert.equal(b.code, 'EVERIFY_FAILED'); assert.ok(b.problems.some((p) => p.includes('LICENSE'))); assert.match(r.err, /ZIP IS NOT READY/);
  assert.equal(r.out.trim().split('\n').length, 1);
});

test('cli: --against and --allow-removed (each may repeat) behave as in the script', { skip }, async () => {
  const prev = variant(join(T, 'cli-prev.zip'), { extra: ['old/gone.txt', 'old/other.txt'] });
  const bad = await run(['verify-delivery', ZIP, '--against', prev, '--root', proj], '/'); assert.equal(bad.status, 1); assert.match(bad.err, /old\/gone\.txt/);
  const part = await run(['verify-delivery', ZIP, '--against', prev, '--allow-removed', 'old/gone.txt', '--root', proj], '/'); assert.equal(part.status, 1); assert.match(part.err, /old\/other\.txt/);
  const ok = await run(['verify-delivery', ZIP, '--against', prev, '--allow-removed', 'old/gone.txt', '--allow-removed', 'old/other.txt', '--root', proj], '/');
  assert.equal(ok.status, 0, ok.err); assert.match(ok.out, /nothing lost vs cli-prev\.zip/);
});

test('cli: parity: `chicla verify-delivery` prints what the script prints, stdout for stdout, valid and not ready', { skip }, async () => {
  const bad = variant(join(T, 'cli-parity-bad.zip'), { drop: ['LICENSE'] });
  for (const z of [ZIP, bad]) { const s = script(z), c = await run(['verify-delivery', z, '--root', proj], '/'); assert.equal(c.status, s.status); assert.equal(c.out, s.stdout); assert.equal(c.err, s.stderr); }
});

test('cli: an unreadable zip is exit 1 with EZIP_UNREADABLE; usage errors are exit 2 with EUSAGE', async () => {
  const none = await run(['verify-delivery', join(T, 'nope.zip'), '--json', '--root', proj], '/'); assert.equal(none.status, 1); assert.equal(JSON.parse(none.out).code, 'EZIP_UNREADABLE');
  for (const a of [[], ['--json'], [ZIP, 'second.zip'], [ZIP, '--against'], [ZIP, '--against', '--json'], [ZIP, '--allow-removed'], [ZIP, '--root'], [ZIP, '--bogus'], [ZIP, '--write']]) {
    const r = await run(['verify-delivery', ...a, '--json'], '/'); assert.equal(r.status, 2, a.join(' ')); assert.equal(JSON.parse(r.out).code, 'EUSAGE', a.join(' '));
  }
});

test('cli: --help lists verify-delivery and no longer calls it unbuilt', async () => {
  const r = await run(['--help']); assert.equal(r.status, 0); assert.match(r.out, /verify-delivery/);
  for (const o of ['--against', '--allow-removed']) assert.ok(r.out.includes(o), o);
  assert.doesNotMatch(r.out, /Not built yet:[^\n]*verify-delivery/);
});
