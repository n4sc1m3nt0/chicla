// C11.1, slices 2a and 2b — `bump-round` as a core (`bumpRound({ root, mode, dry, note, regenerateManifest }`, never prints, exits or throws) and
// `chicla bump-round` with all its modes: `--verify` (2a, read only) and the bump, `--refresh`, `--dry-run`, `--note` (2b). The CLI regenerates the
// manifest in-process (`checkManifest`), so it works on a project that has no `scripts/` folder. Tests assert result `code`s and exit statuses; the only
// text compared is the script's own output against the core's and the CLI's (parity). The fake project is built here, with the fingerprints hashed by an
// independent function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHECK_MANIFEST_COPY, copyFiles } from '../../../test/toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI = join(ROOT, 'packages/chicla-kit/src/cli.mjs');
const { bumpRound, renderBumpRound } = await import(pathToFileURL(join(ROOT, 'scripts/bump-round.mjs')).href);
const { main } = await import(pathToFileURL(CLI).href);
const { checkManifest } = await import(pathToFileURL(join(ROOT, 'scripts/check-manifest.mjs')).href);

// hash independent of the script (strings, not Buffers)
const hashFrom = (text, fromLine) => createHash('sha256').update(text.split('\n').slice(fromLine - 1).join('\n'), 'utf8').digest('hex').slice(0, 12);
const PARA = (seq, app, hApp, hCl) => `**Fingerprint:** seq=${seq} · app=${app} ·\napp_sha256_12=${hApp} (of everything below the app file's own\nfingerprint comment; unchanged since round 1) ·\nchangelog=CHANGELOG.md ·\nchangelog_sha256_12=${hCl} (hash of \`CHANGELOG.md\` below its own\nfingerprint line; recomputed fresh this round) · matches the\n\`STATUS_FILE_FINGERPRINT\` comment on line 2–3 of the app file and the\n\`CHANGELOG_FINGERPRINT\` comment on line 1 of \`CHANGELOG.md\`. If any of\nthese three don't match what you're looking at, stop and see\ninstructions item 11 above before doing anything else.`;

/** A fake project in a temp folder. `scripts/` holds copies of the real scripts (for the parity runs and the manifest step of a bump). */
const project = ({ seq = 5, appSeq = seq, extraStatus = false, scripts = true } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'chicla-c111b-'));
  if (scripts) { copyFiles(ROOT, root, [...CHECK_MANIFEST_COPY, 'scripts/bump-round.mjs', 'packages/chicla-kit/src/bump-round.mjs']); } // C11.1 5c: scripts/bump-round.mjs is a wrapper over the core in the kit
  const appBody = 'export const APP_VERSION = "0.0.1"; // fake\n', clBody = '# Changelog\n\n## Round 1 — entry: ç ã\n';
  const hApp = hashFrom('L1\nL2\nL3\n' + appBody, 4), hCl = hashFrom('X\n' + clBody, 2);
  const core = (s) => `seq=${s} file=CHICLA_PROJECT_STATUS-${s}.md app_sha256_12=${hApp} changelog_sha256_12=${hCl}`;
  writeFileSync(join(root, 'package.json'), '{"name":"fake","private":true,"version":"0.0.1"}\n');
  writeFileSync(join(root, 'version.mjs'), `//! fake\n//! (line 3 = fingerprint)\n// STATUS_FILE_FINGERPRINT: ${core(appSeq)} (old note)\n` + appBody);
  writeFileSync(join(root, 'CHANGELOG.md'), `<!-- CHANGELOG_FINGERPRINT: ${core(seq)} (old note) -->\n` + clBody);
  const st = `# Status\n\n## Instructions\n\n**Current version:** v0.0.1\n\n${PARA(seq, 'version.mjs', hApp, hCl)}\n\n**Last updated (round 1):** 2026-10-02.\n\n## Snapshot\n\n## Next up\n\n## Gates\n`; // C10.5: the parts a status file must have
  writeFileSync(join(root, `CHICLA_PROJECT_STATUS-${seq}.md`), st);
  if (extraStatus) writeFileSync(join(root, `CHICLA_PROJECT_STATUS-${seq + 1}.md`), st);
  checkManifest({ root, write: true });
  return root;
};
const done = (T) => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 });
const snap = (T) => readdirSync(T).sort().map((f) => (f === 'scripts' || f === 'packages' ? f : `${f}\n${readFileSync(join(T, f), 'utf8')}`)).join('\n--\n');
const rd = (T, f) => readFileSync(join(T, f), 'utf8');
const run = async (args, cwd) => {
  let out = '', err = '';
  const status = await main(args, { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd });
  return { status, out, err };
};

// ---- the core ----

test('core: verify on a consistent project is ok, with every check named and true', () => {
  const T = project();
  try {
    const r = bumpRound({ root: T, mode: 'verify' });
    assert.equal(r.ok, true); assert.equal(r.code, null); assert.equal(r.mode, 'verify'); assert.equal(r.seq, 5); assert.equal(r.statusFile, 'CHICLA_PROJECT_STATUS-5.md');
    assert.equal(r.checks.length, 7); assert.ok(r.checks.every((c) => c.ok === true && typeof c.label === 'string'));
  } finally { done(T); }
});

test('core: verify after a CHANGELOG edit is not ok (EBUMP_VERIFY) and names the failed checks; nothing is written', () => {
  const T = project();
  try {
    writeFileSync(join(T, 'CHANGELOG.md'), readFileSync(join(T, 'CHANGELOG.md'), 'utf8') + '## Round 2\n');
    const before = snap(T);
    const r = bumpRound({ root: T, mode: 'verify' });
    assert.equal(r.ok, false); assert.equal(r.code, 'EBUMP_VERIFY');
    assert.deepEqual(r.checks.filter((c) => !c.ok).length, 1); assert.match(r.checks.find((c) => !c.ok).label, /CHANGELOG hash/);
    assert.equal(snap(T), before);
  } finally { done(T); }
});

test('core: state errors come back as codes, never thrown: two status files, none, no app file, no CHANGELOG, a broken fingerprint', () => {
  const two = project({ extraStatus: true });
  const none = project(), noApp = project(), noCl = project(), broken = project();
  try {
    assert.equal(bumpRound({ root: two, mode: 'verify' }).code, 'EBUMP_STATE');
    rmSync(join(none, 'CHICLA_PROJECT_STATUS-5.md')); assert.equal(bumpRound({ root: none, mode: 'verify' }).code, 'EBUMP_STATE');
    rmSync(join(noApp, 'version.mjs')); assert.equal(bumpRound({ root: noApp, mode: 'verify' }).code, 'EBUMP_STATE');
    rmSync(join(noCl, 'CHANGELOG.md')); assert.equal(bumpRound({ root: noCl, mode: 'verify' }).code, 'EBUMP_STATE');
    writeFileSync(join(broken, 'CHANGELOG.md'), 'no fingerprint here\n'); assert.equal(bumpRound({ root: broken, mode: 'verify' }).code, 'EBUMP_STATE');
    for (const T of [two, none, noApp, noCl, broken]) assert.equal(bumpRound({ root: T, mode: 'verify' }).ok, false);
  } finally { for (const T of [two, none, noApp, noCl, broken]) done(T); }
});

test('core: a bump refuses (EBUMP_UNPAIRED, nothing written) when the app seq differs from the status file (11a)', () => {
  const T = project({ seq: 5, appSeq: 4 });
  try {
    const before = snap(T);
    const r = bumpRound({ root: T, mode: 'bump' });
    assert.equal(r.ok, false); assert.equal(r.code, 'EBUMP_UNPAIRED'); assert.equal(snap(T), before);
  } finally { done(T); }
});

test('core: dry-run reports seq 5 → 6 and writes nothing; an unknown mode is EBUMP_USAGE', () => {
  const T = project();
  try {
    const before = snap(T);
    const r = bumpRound({ root: T, mode: 'bump', dry: true });
    assert.equal(r.ok, true); assert.equal(r.dry, true); assert.equal(r.seq, 5); assert.equal(r.nextSeq, 6);
    assert.match(renderBumpRound(r).out, /seq 5 → 6/); assert.equal(snap(T), before);
    assert.equal(bumpRound({ root: T, mode: 'frobnicate' }).code, 'EBUMP_USAGE');
  } finally { done(T); }
});

test('core: a bump renames the status file, keeps the three fingerprints paired and a verify passes after it; refresh keeps the number', () => {
  const T = project();
  try {
    writeFileSync(join(T, 'CHANGELOG.md'), readFileSync(join(T, 'CHANGELOG.md'), 'utf8') + '\n## Round 2\n');
    const b = bumpRound({ root: T, mode: 'bump', note: 'round X' });
    assert.equal(b.ok, true, JSON.stringify(b.messages)); assert.equal(b.nextSeq, 6);
    assert.ok(existsSync(join(T, 'CHICLA_PROJECT_STATUS-6.md')) && !existsSync(join(T, 'CHICLA_PROJECT_STATUS-5.md')));
    assert.ok(readFileSync(join(T, 'version.mjs'), 'utf8').includes('round X'));
    assert.equal(bumpRound({ root: T, mode: 'verify' }).ok, true);
    writeFileSync(join(T, 'CHANGELOG.md'), readFileSync(join(T, 'CHANGELOG.md'), 'utf8') + 'late\n');
    assert.equal(bumpRound({ root: T, mode: 'verify' }).ok, false);
    const f = bumpRound({ root: T, mode: 'refresh' });
    assert.equal(f.ok, true); assert.equal(f.nextSeq, 6);
    assert.ok(existsSync(join(T, 'CHICLA_PROJECT_STATUS-6.md')) && !existsSync(join(T, 'CHICLA_PROJECT_STATUS-7.md')));
    assert.equal(bumpRound({ root: T, mode: 'verify' }).ok, true);
  } finally { done(T); }
});

test('core: parity: the script as a process and the core print the same text on the same project, verify ok and verify failed', () => {
  const T = project();
  try {
    const script = (...a) => spawnSync(process.execPath, [join(T, 'scripts/bump-round.mjs'), ...a], { cwd: T, encoding: 'utf8' });
    const same = (a, mode) => { const { out, err } = renderBumpRound(bumpRound({ root: T, mode })); assert.equal(a.stdout, out); assert.equal(a.stderr, err); };
    const ok = script('--verify'); assert.equal(ok.status, 0); same(ok, 'verify');
    writeFileSync(join(T, 'CHANGELOG.md'), readFileSync(join(T, 'CHANGELOG.md'), 'utf8') + 'edit\n');
    const bad = script('--verify'); assert.equal(bad.status, 1); same(bad, 'verify');
  } finally { done(T); }
});

test('core: importing the script runs nothing (no output, no exit): the module only exports', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(join(ROOT, 'scripts/bump-round.mjs')).href)}).then((m) => console.log(typeof m.bumpRound))`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), 'function');
});

test('core: the manifest step is injectable: it is called once with the root on a bump, and its failure is EBUMP_MANIFEST (nothing else is hidden)', () => {
  const T = project(), F = project();
  try {
    const calls = [];
    const ok = bumpRound({ root: T, mode: 'bump', regenerateManifest: (r) => { calls.push(r); return { ok: true, out: 'manifest step ran\n', err: '' }; } });
    assert.equal(ok.ok, true); assert.equal(calls.length, 1); assert.equal(calls[0], T); assert.match(renderBumpRound(ok).out, /manifest step ran/);
    const bad = bumpRound({ root: F, mode: 'bump', regenerateManifest: () => ({ ok: false, out: '', err: 'boom' }) });
    assert.equal(bad.ok, false); assert.equal(bad.code, 'EBUMP_MANIFEST'); assert.match(renderBumpRound(bad).err, /boom/);
    const dry = bumpRound({ root: F, mode: 'bump', dry: true, regenerateManifest: () => { throw new Error('must not run on a dry-run'); } });
    assert.equal(dry.ok, true);
  } finally { done(T); done(F); }
});

// ---- the CLI ----

test('cli: bump-round --verify on a consistent project exits 0 and prints the checks on stdout', async () => {
  const T = project();
  try {
    const r = await run(['bump-round', '--verify', '--root', T], '/');
    assert.equal(r.status, 0, r.err); assert.match(r.out, /✓/); assert.equal(r.err, '');
  } finally { done(T); }
});

test('cli: --root defaults to the current folder', async () => {
  const T = project();
  try { assert.equal((await run(['bump-round', '--verify'], T)).status, 0); } finally { done(T); }
});

test('cli: bump-round --verify --json is ONE object on stdout, the human text on stderr; exit 1 and the failed check when it drifted', async () => {
  const T = project();
  try {
    const ok = await run(['bump-round', '--verify', '--json', '--root', T], '/');
    const o = JSON.parse(ok.out); assert.equal(ok.status, 0); assert.equal(o.command, 'bump-round'); assert.equal(o.ok, true); assert.equal(o.code, null); assert.equal(o.seq, 5); assert.equal(o.checks.length, 7); assert.match(ok.err, /✓/);
    writeFileSync(join(T, 'CHANGELOG.md'), readFileSync(join(T, 'CHANGELOG.md'), 'utf8') + 'edit\n');
    const bad = await run(['bump-round', '--verify', '--json', '--root', T], '/');
    const b = JSON.parse(bad.out); assert.equal(bad.status, 1); assert.equal(b.ok, false); assert.equal(b.code, 'EBUMP_VERIFY'); assert.ok(b.checks.some((c) => c.ok === false)); assert.match(bad.err, /✗/);
    assert.equal(bad.out.trim().split('\n').length, 1);
  } finally { done(T); }
});

test('cli: a state error (two status files) is exit 1 with its code, in JSON and in text', async () => {
  const T = project({ extraStatus: true });
  try {
    const j = await run(['bump-round', '--verify', '--json', '--root', T], '/');
    assert.equal(j.status, 1); assert.equal(JSON.parse(j.out).code, 'EBUMP_STATE');
    const t = await run(['bump-round', '--verify', '--root', T], '/');
    assert.equal(t.status, 1); assert.match(t.err, /✗/);
  } finally { done(T); }
});

test('cli: parity: `chicla bump-round --verify` prints what the script prints, stdout for stdout', async () => {
  const T = project();
  try {
    const s = spawnSync(process.execPath, [join(T, 'scripts/bump-round.mjs'), '--verify'], { cwd: T, encoding: 'utf8' });
    const c = await run(['bump-round', '--verify', '--root', T], '/');
    assert.equal(c.status, s.status); assert.equal(c.out, s.stdout); assert.equal(c.err, s.stderr);
  } finally { done(T); }
});

test('cli: a bump works on a project with NO scripts/ folder: status renamed, fingerprints paired, manifest regenerated in-process, verify passes after', async () => {
  const T = project({ scripts: false });
  try {
    assert.ok(!existsSync(join(T, 'scripts')));
    writeFileSync(join(T, 'CHANGELOG.md'), rd(T, 'CHANGELOG.md') + '\n## Round 2\n');
    const r = await run(['bump-round', '--note', 'round X', '--root', T], '/');
    assert.equal(r.status, 0, r.out + r.err); assert.match(r.out, /✓ round closed/);
    assert.ok(existsSync(join(T, 'CHICLA_PROJECT_STATUS-6.md')) && !existsSync(join(T, 'CHICLA_PROJECT_STATUS-5.md')));
    assert.ok(rd(T, 'version.mjs').includes('round X'));
    assert.ok(rd(T, 'FILES.manifest').includes('CHICLA_PROJECT_STATUS-6.md') && !rd(T, 'FILES.manifest').includes('CHICLA_PROJECT_STATUS-5.md'));
    assert.equal((await run(['bump-round', '--verify', '--root', T], '/')).status, 0);
  } finally { done(T); }
});

test('cli: parity: `chicla bump-round` and the script print the same on twin projects, bump and dry-run', async () => {
  const A = project(), B = project();
  try {
    for (const [cliArgs, scriptArgs] of [[['--dry-run'], ['--dry-run']], [[], []]]) {
      const s = spawnSync(process.execPath, [join(A, 'scripts/bump-round.mjs'), ...scriptArgs], { cwd: A, encoding: 'utf8' });
      const c = await run(['bump-round', ...cliArgs, '--root', B], '/');
      assert.equal(c.status, s.status, cliArgs.join(' ')); assert.equal(c.out, s.stdout); assert.equal(c.err, s.stderr);
    }
    assert.equal(rd(B, 'version.mjs'), rd(A, 'version.mjs')); assert.equal(rd(B, 'CHANGELOG.md'), rd(A, 'CHANGELOG.md')); assert.equal(rd(B, 'FILES.manifest'), rd(A, 'FILES.manifest'));
  } finally { done(A); done(B); }
});

test('cli: --dry-run exits 0, reports 5 → 6 (json: dry, nextSeq) and writes nothing', async () => {
  const T = project({ scripts: false });
  try {
    const before = snap(T);
    const r = await run(['bump-round', '--dry-run', '--json', '--root', T], '/');
    const o = JSON.parse(r.out); assert.equal(r.status, 0, r.err); assert.equal(o.command, 'bump-round'); assert.equal(o.ok, true); assert.equal(o.dry, true); assert.equal(o.seq, 5); assert.equal(o.nextSeq, 6);
    assert.match(r.err, /seq 5 → 6/); assert.equal(snap(T), before);
  } finally { done(T); }
});

test('cli: --refresh after a late CHANGELOG edit keeps the number and fixes the hash', async () => {
  const T = project({ scripts: false });
  try {
    writeFileSync(join(T, 'CHANGELOG.md'), rd(T, 'CHANGELOG.md') + 'late edit\n');
    assert.equal((await run(['bump-round', '--verify', '--root', T], '/')).status, 1);
    const r = await run(['bump-round', '--refresh', '--json', '--root', T], '/');
    assert.equal(r.status, 0, r.err); assert.equal(JSON.parse(r.out).nextSeq, 5);
    assert.ok(existsSync(join(T, 'CHICLA_PROJECT_STATUS-5.md')) && !existsSync(join(T, 'CHICLA_PROJECT_STATUS-6.md')));
    assert.equal((await run(['bump-round', '--verify', '--root', T], '/')).status, 0);
  } finally { done(T); }
});

test('cli: a bump refuses (exit 1, EBUMP_UNPAIRED, nothing written) when the app seq differs from the status file (11a)', async () => {
  const T = project({ seq: 5, appSeq: 4, scripts: false });
  try {
    const before = snap(T);
    const r = await run(['bump-round', '--json', '--root', T], '/');
    assert.equal(r.status, 1); assert.equal(JSON.parse(r.out).code, 'EBUMP_UNPAIRED'); assert.equal(snap(T), before);
  } finally { done(T); }
});

test('cli: usage errors of bump-round (EUSAGE, exit 2): unknown option, --root without a folder, --note without a text, and options that contradict --verify', async () => {
  for (const a of [['--bogus'], ['--verify', '--bogus'], ['--verify', '--root'], ['--verify', '--root', '--json'], ['--note'], ['--note', '--json'],
                   ['--verify', '--refresh'], ['--verify', '--dry-run'], ['--verify', '--note', 'x'], ['--refresh', '--dry-run', '--verify']]) {
    const r = await run(['bump-round', ...a, '--json'], '/');
    assert.equal(r.status, 2, a.join(' ')); assert.equal(JSON.parse(r.out).code, 'EUSAGE', a.join(' '));
  }
});

test('cli: --help lists bump-round with its options and no longer calls it unfinished', async () => {
  const r = await run(['--help']);
  assert.equal(r.status, 0); assert.match(r.out, /bump-round/); for (const o of ['--verify', '--refresh', '--dry-run', '--note']) assert.ok(r.out.includes(o), o);
  assert.doesNotMatch(r.out, /Not built yet:[^\n]*bump-round/); assert.doesNotMatch(r.out, /EOPTION_PENDING/);
});
