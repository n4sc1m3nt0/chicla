// C27.3 (round 307, D154): `chicla ci-report <logs.zip>` reads the zip of a GitHub Actions run (the «logs_NNN.zip» of «Download log archive») with the kit's own zip reader and
// prints, per job, the failing tests and the first error. No dependency; the zip is hostile input (it is only read in memory, never extracted, a name is only a label).
// Layout of such a zip: one combined log per job at the top, `<n>_<job>.txt`, and a folder per job with one file per step. Every line starts with a timestamp.
// Tests (node --test, TAP) print `not ok N - name` at the start of a line, and `# tests`, `# pass`, `# fail` at the end of each suite.
// Written before the code; red until it exists. Tests assert codes and fields, never message text. Every zip is built here with writeZip.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(join(KIT, f)).href);
const { ciReport, renderCiReport } = await imp('src/ci-report.mjs');
const { main } = await imp('src/cli.mjs');
const { writeZip } = await imp('../chicla-zip/src/zipkit.mjs');

const T = mkdtempSync(join(tmpdir(), 'chicla-c273-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
let n = 0;
const TS = '2026-11-02T10:00:00.1234567Z ';
const lines = (...ls) => ls.map((l) => TS + l).join('\n') + '\n';
const logsZip = async (files) => { const p = join(T, `logs${++n}.zip`); await writeZip(p, Object.entries(files).map(([name, data]) => ({ name, data: Buffer.from(data) }))); return p; };
const cli = async (...args) => { let out = '', err = ''; const status = await main(args, { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd: T }); return { status, out, err }; };

const GREEN = lines('# tests 100', '# pass 100', '# fail 0');
const RED = lines('not ok 7 - the first broken thing', '  ---', '  error: |-', '    Expected values to be strictly equal:', '', 'not ok 9 - the second broken thing', '# tests 50', '# pass 48', '# fail 2', '##[error]Process completed with exit code 1.');

test('a green job and a red job: only the red one is failing, with its failing tests and the first error', async () => {
  const zip = await logsZip({ '1_green job.txt': GREEN, '2_red job.txt': RED, 'red job/1_Run tests.txt': RED });
  const r = await ciReport({ zip });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'ECIREPORT_FAILED');
  assert.equal(r.jobs.length, 2);
  const red = r.jobs.find((j) => j.name === 'red job'), green = r.jobs.find((j) => j.name === 'green job');
  assert.equal(green.failed, false);
  assert.equal(red.failed, true);
  assert.deepEqual(red.failing, ['the first broken thing', 'the second broken thing']);
  assert.equal(red.firstError, 'Expected values to be strictly equal:');
  assert.deepEqual([red.tests, red.pass, red.fail], [50, 48, 2]);
});

test('all green: ok, no code', async () => {
  const r = await ciReport({ zip: await logsZip({ '1_a.txt': GREEN, '2_b.txt': GREEN }) });
  assert.equal(r.ok, true);
  assert.equal(r.code, null);
  assert.deepEqual(r.jobs.map((j) => j.failed), [false, false]);
});

test('timestamps and colour codes are not part of a test name', async () => {
  const zip = await logsZip({ '1_j.txt': `${TS}\u001b[31mnot ok 3 - coloured name\u001b[0m\n` });
  const r = await ciReport({ zip });
  assert.deepEqual(r.jobs[0].failing, ['coloured name']);
});

test('two suites in one job (Windows runs chicla-zip and chicla-kit): the counts are added', async () => {
  const zip = await logsZip({ '1_win.txt': lines('# tests 10', '# pass 9', '# fail 1', 'not ok 2 - zip one', '# tests 5', '# pass 5', '# fail 0') });
  const j = (await ciReport({ zip })).jobs[0];
  assert.deepEqual([j.tests, j.pass, j.fail], [15, 14, 1], 'the failure of the FIRST suite is not lost behind a clean last one');
  assert.equal(j.failed, true);
});

test('a job that fails with no failing test (a step died): failed, and the ##[error] line is the first error', async () => {
  const zip = await logsZip({ '1_build.txt': lines('npm ERR! boom', '##[error]Process completed with exit code 127.') });
  const j = (await ciReport({ zip })).jobs[0];
  assert.equal(j.failed, true);
  assert.deepEqual(j.failing, []);
  assert.equal(j.firstError, 'Process completed with exit code 127.');
});

test('a zip with only the per-step folders (no combined log) is read by folder', async () => {
  const zip = await logsZip({ 'ubuntu node 22/1_Set up.txt': GREEN, 'ubuntu node 22/2_Run tests.txt': lines('not ok 1 - only in a step') });
  const r = await ciReport({ zip });
  assert.deepEqual(r.jobs.map((j) => j.name), ['ubuntu node 22']);
  assert.deepEqual(r.jobs[0].failing, ['only in a step']);
});

test('what is not a log is ignored (system.txt, other files); a zip with no log at all is ECIREPORT_EMPTY', async () => {
  const r = await ciReport({ zip: await logsZip({ '1_a.txt': GREEN, 'system.txt': 'x', 'notes.md': 'y' }) });
  assert.deepEqual(r.jobs.map((j) => j.name), ['a']);
  assert.equal((await ciReport({ zip: await logsZip({ 'notes.md': 'y' }) })).code, 'ECIREPORT_EMPTY');
});

test('a log over the size limit is not read into memory: the job is listed as unreadable, never a crash, and the run is NOT green (C29.3, D-317a: it was «ok» until round 321)', async () => {
  const zip = await logsZip({ '1_big.txt': 'x'.repeat(5000), '2_ok.txt': GREEN });
  const r = await ciReport({ zip, maxBytes: 1000 });
  const big = r.jobs.find((j) => j.name === 'big');
  assert.equal(big.unreadable, true);
  assert.equal(r.jobs.find((j) => j.name === 'ok').failed, false);
  assert.equal(r.ok, false, 'a job that was not judged is no green');
  assert.equal(r.code, 'ECIREPORT_UNJUDGED');
});

test('not a zip, or missing: ECIREPORT_ZIP, never a throw', async () => {
  const bad = join(T, 'bad.zip'); writeFileSync(bad, 'this is not a zip');
  assert.equal((await ciReport({ zip: bad })).code, 'ECIREPORT_ZIP');
  assert.equal((await ciReport({ zip: join(T, 'nope.zip') })).code, 'ECIREPORT_ZIP');
});

test('the text names the failing jobs and tests', async () => {
  const r = await ciReport({ zip: await logsZip({ '1_red job.txt': RED, '2_green job.txt': GREEN }) });
  const { out, err } = renderCiReport(r);
  assert.ok((out + err).includes('red job') && (out + err).includes('the first broken thing'));
});

test('the CLI: `chicla ci-report <zip>` exits 1 on a red run and 0 on a green one; --json gives the jobs; no zip is a usage error (2)', async () => {
  const red = await logsZip({ '1_red.txt': RED }), green = await logsZip({ '1_g.txt': GREEN });
  assert.equal((await cli('ci-report', red)).status, 1);
  assert.equal((await cli('ci-report', green)).status, 0);
  const j = await cli('ci-report', red, '--json');
  const parsed = JSON.parse(j.out);
  assert.equal(parsed.command, 'ci-report');
  assert.equal(parsed.jobs[0].name, 'red');
  assert.equal((await cli('ci-report')).status, 2);
  assert.equal((await cli('ci-report', red, green)).status, 2);
  assert.equal((await cli('ci-report', join(T, 'nope.zip'))).status, 1);
});

// Round 314 (C28.3, AUDIT-10 F-2, D-310b confirmed by Rodrigo): `--allow <text>`. A job whose name contains the text MAY fail: it is still read and its first error is printed,
// but it does not count (the Windows leg of `tarball` is `continue-on-error`: «reported, not promised»). Without the option nothing changes. Tests assert fields and codes, never wording.
const WIN = 'tarball (windows-latest)';

test('C28.3: an allowed job that fails does not fail the run: ok, no code; the job keeps failed:true (the verdict is not hidden) and allowed:true', async () => {
  const zip = await logsZip({ '1_test.txt': GREEN, [`2_${WIN}.txt`]: RED });
  const r = await ciReport({ zip, allow: ['tarball (windows'] });
  assert.equal(r.ok, true);
  assert.equal(r.code, null);
  const w = r.jobs.find((j) => j.name === WIN), t = r.jobs.find((j) => j.name === 'test');
  assert.deepEqual([w.failed, w.allowed], [true, true]);
  assert.deepEqual([t.failed, t.allowed], [false, false]);
  assert.equal(w.firstError, 'Expected values to be strictly equal:');
});

test('C28.3: a job that is NOT allowed still fails the run, and only it is counted', async () => {
  const zip = await logsZip({ '1_test (ubuntu).txt': RED, [`2_${WIN}.txt`]: RED, '3_bench.txt': GREEN });
  const r = await ciReport({ zip, allow: ['windows'] });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'ECIREPORT_FAILED');
  assert.deepEqual(r.jobs.map((j) => j.allowed), [false, true, false]);
  assert.match(r.messages.map((m) => m.text).join('\n'), /1 of 3 job\(s\) failed/);
});

test('C28.3: with no allow list every job has allowed:false and the verdict is the old one (D154)', async () => {
  const r = await ciReport({ zip: await logsZip({ '1_a.txt': RED, [`2_${WIN}.txt`]: RED }) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.jobs.map((j) => j.allowed), [false, false]);
  assert.match(r.messages.map((m) => m.text).join('\n'), /2 of 2 job\(s\) failed/);
});

test('C28.3: the match is a case-sensitive part of the job name; a wrong case or a typo does not hide a red job (it fails, the safe side)', async () => {
  const zip = await logsZip({ [`1_${WIN}.txt`]: RED });
  assert.equal((await ciReport({ zip, allow: ['WINDOWS'] })).ok, false);
  assert.equal((await ciReport({ zip, allow: ['windos'] })).ok, false);
  assert.equal((await ciReport({ zip, allow: ['windows'] })).ok, true);
  assert.equal((await ciReport({ zip, allow: ['nothing', WIN] })).ok, true, 'any one text of the list is enough');
});

test('C28.3: an allowed red job is still shown (name and first error), and its test names; the summary is ok', async () => {
  const r = await ciReport({ zip: await logsZip({ [`1_${WIN}.txt`]: RED }), allow: ['windows'] });
  const { out, err } = renderCiReport(r);
  assert.ok(err.includes(WIN) && err.includes('Expected values to be strictly equal:') && err.includes('the first broken thing'), 'the allowed failure is not swallowed');
  assert.ok(out.length > 0 && !/ECIREPORT/.test(err), 'the run is reported ok');
});

test('C28.3: allow must be a list of non-empty texts: ECIREPORT_ALLOW, never a throw and never «everything allowed»', async () => {
  const zip = await logsZip({ '1_a.txt': RED });
  for (const bad of [[''], [1], 'windows', [null]]) {
    const r = await ciReport({ zip, allow: bad });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'ECIREPORT_ALLOW');
  }
});

test('C28.3: the CLI: --allow is repeatable; exit 0 when only an allowed job is red, 1 when another is red; --json has `allowed`', async () => {
  const onlyWin = await logsZip({ '1_test.txt': GREEN, [`2_${WIN}.txt`]: RED });
  const both = await logsZip({ '1_test.txt': RED, [`2_${WIN}.txt`]: RED });
  assert.equal((await cli('ci-report', onlyWin)).status, 1, 'without --allow it is red (unchanged)');
  assert.equal((await cli('ci-report', onlyWin, '--allow', 'tarball (windows')).status, 0);
  assert.equal((await cli('ci-report', onlyWin, '--allow', 'nothing', '--allow', 'windows')).status, 0, 'repeatable: one text of the list is enough');
  assert.equal((await cli('ci-report', both, '--allow', 'windows')).status, 1);
  const j = JSON.parse((await cli('ci-report', onlyWin, '--allow', 'windows', '--json')).out);
  assert.deepEqual(j.jobs.map((x) => x.allowed), [false, true]);
  assert.equal(j.ok, true);
});

test('C28.3: the CLI: --allow with no value or an empty one is a usage error (2); other commands do not know --allow', async () => {
  const zip = await logsZip({ '1_a.txt': GREEN });
  assert.equal((await cli('ci-report', zip, '--allow')).status, 2);
  assert.equal((await cli('ci-report', zip, '--allow', '')).status, 2);
  assert.equal((await cli('ci-report', zip, '--allow', '--json')).status, 2);
  assert.equal((await cli('check-manifest', '--allow', 'x')).status, 2);
});

// Round 315 (C28.4, AUDIT-10 F-3 and F-9): two things the audit found. (1) A job killed before the summary has `not ok` lines and no `# fail` and no `##[error]`: it is still failed (the survivor C2: until now
// the `# fail` count hid that the `not ok` rule did no work of its own). (2) A zip entry with a `.` or `..` segment is not a log of any job: its first segment was the label `..`; it is now not read at all.
// The kit's own writer refuses such names (EUNSAFE), so the hostile zips are built here by hand: stored entries, a CRC32 of our own (zlib.crc32 does not exist in Node 18).
const CRC = (() => { const t = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); return (b) => { let c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
const rawZip = (files) => {
  const local = [], central = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const nm = Buffer.from(name), data = Buffer.from(text), crc = CRC(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    local.push(lh, nm, data); central.push(ch, nm); off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  const p = join(T, `raw${++n}.zip`); writeFileSync(p, Buffer.concat([...local, cd, end])); return p;
};

test('C28.4: the raw zip helper makes a zip the reader reads (control for the hostile tests)', async () => {
  const r = await ciReport({ zip: rawZip({ '1_a.txt': GREEN, '2_b.txt': RED }) });
  assert.deepEqual(r.jobs.map((j) => [j.name, j.failed]), [['a', false], ['b', true]]);
});

test('C28.4: a job whose log stops before the summary (a failing test line, no `# fail`, no ##[error]) is failed on the `not ok` line alone', async () => {
  const j = (await ciReport({ zip: await logsZip({ '1_killed.txt': lines('ok 1 - fine', 'not ok 2 - broke before the summary') }) })).jobs[0];
  assert.equal(j.failed, true);
  assert.deepEqual([j.failing, j.fail, j.firstError], [['broke before the summary'], null, null]);
});

test('C28.4: an entry with a `.` or `..` segment is never a log: its first segment is not a job label, and its text is not read (AUDIT-10 F-9)', async () => {
  const hostile = { '../../etc/x_job.txt': RED, '../1_up.txt': RED, './1_here.txt': RED, 'a/../1_x.txt': RED, 'a/./1_y.txt': RED };
  const r = await ciReport({ zip: rawZip({ '1_ok.txt': GREEN, ...hostile }) });
  assert.equal(r.ok, true, 'a hostile entry cannot turn a green run red');
  assert.deepEqual(r.jobs.map((j) => j.name), ['ok']);
  assert.equal((await ciReport({ zip: rawZip(hostile) })).code, 'ECIREPORT_EMPTY', 'only hostile entries: no job at all');
});

test('C28.4: a folder that merely STARTS with dots is a job like any other (`..hidden/1_a.txt`, `.github/1_b.txt`): only a segment that is exactly . or .. is refused', async () => {
  const r = await ciReport({ zip: rawZip({ '..hidden/1_a.txt': RED, '.github/1_b.txt': GREEN }) });
  assert.deepEqual(r.jobs.map((j) => j.name).sort(), ['..hidden', '.github']);
});

// Round 321 (C29.3, AUDIT-11 F-3 and F-4; D-317a CONFIRMED by Rodrigo, «sim, avança»): what `ci-report` did not JUDGE is no green. A job whose log is above the limit (`unreadable`) and the log entries beyond the cap
// (`maxLogs`, 5000) used to end in «✓ no failing job» and exit 0 (the warning went to stderr). Now the run is not ok: code ECIREPORT_UNJUDGED, exit 1, no «✓» line. `--allow <text>` can allow an unjudged JOB by
// name (it is still printed); entries beyond the cap have no name, so nothing allows them. A job that FAILED keeps ECIREPORT_FAILED (a certain failure outranks a doubt). Fields: `unjudgedJobs` (names) and
// `unjudgedEntries` (a count). Tests assert fields and codes, never wording.
const BIG = { '1_big.txt': 'x'.repeat(5000), '2_ok.txt': GREEN };

test('C29.3: an unjudged job: not ok, ECIREPORT_UNJUDGED, no «✓» on stdout, the job named on stderr, the fields say which', async () => {
  const r = await ciReport({ zip: await logsZip(BIG), maxBytes: 1000 });
  assert.deepEqual([r.ok, r.code], [false, 'ECIREPORT_UNJUDGED']);
  assert.deepEqual([r.unjudgedJobs, r.unjudgedEntries], [['big'], 0]);
  const { out, err } = renderCiReport(r);
  assert.equal(out, '', 'no «✓ no failing job» line');
  assert.ok(err.includes('big') && err.includes('ECIREPORT_UNJUDGED'));
});

test('C29.3: --allow names an unjudged job: ok, the job is still printed, unjudgedJobs still lists it; another unjudged job still fails the run', async () => {
  const zip = await logsZip({ ...BIG, '3_other.txt': 'y'.repeat(5000) });
  const some = await ciReport({ zip, maxBytes: 1000, allow: ['big'] });
  assert.deepEqual([some.ok, some.code], [false, 'ECIREPORT_UNJUDGED'], 'the other one is not allowed');
  const all = await ciReport({ zip, maxBytes: 1000, allow: ['big', 'other'] });
  assert.deepEqual([all.ok, all.code], [true, null]);
  assert.deepEqual(all.unjudgedJobs, ['big', 'other']);
  assert.equal(all.jobs.find((j) => j.name === 'big').allowed, true);
  assert.ok(renderCiReport(all).err.includes('big'), 'an allowed job is not swallowed');
  assert.match(renderCiReport(all).out, /2 allowed/, 'the green line counts the two allowed, unjudged jobs');
});

test('C29.3: a failed job outranks a doubt: ECIREPORT_FAILED, and the unjudged job is still listed', async () => {
  const r = await ciReport({ zip: await logsZip({ ...BIG, '3_red.txt': RED }), maxBytes: 1000 });
  assert.deepEqual([r.ok, r.code], [false, 'ECIREPORT_FAILED']);
  assert.deepEqual(r.unjudgedJobs, ['big']);
});

test('C29.3: the cap: entries beyond maxLogs are not read and make the run not ok; nothing allows them; exactly the cap is fine; a red job past the cap is no longer a green run (AUDIT-11 F-4)', async () => {
  const files = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((x, i) => [`${i + 1}_${x}.txt`, GREEN]));
  const over = await ciReport({ zip: await logsZip(files), maxLogs: 3 });
  assert.deepEqual([over.ok, over.code, over.unjudgedEntries, over.jobs.length], [false, 'ECIREPORT_UNJUDGED', 2, 3]);
  const allowed = await ciReport({ zip: await logsZip(files), maxLogs: 3, allow: ['a', 'b', 'c', 'd', 'e'] });
  assert.equal(allowed.ok, false, 'entries beyond the cap have no name: --allow cannot cover them');
  const exact = await ciReport({ zip: await logsZip(files), maxLogs: 5 });
  assert.deepEqual([exact.ok, exact.unjudgedEntries], [true, 0]);
  const late = await ciReport({ zip: await logsZip({ ...files, '6_red.txt': RED }), maxLogs: 5 });
  assert.deepEqual([late.ok, late.code, late.unjudgedEntries], [false, 'ECIREPORT_UNJUDGED', 1], 'the red job as entry 6 was never read: that is no green');
  const both = await ciReport({ zip: await logsZip({ '1_red.txt': RED, ...Object.fromEntries(['b', 'c', 'd'].map((x, i) => [`${i + 2}_${x}.txt`, GREEN])) }), maxLogs: 2 });
  assert.deepEqual([both.code, both.unjudgedEntries], ['ECIREPORT_FAILED', 2]);
});

test('C29.3: a clean run is unchanged: every job judged, unjudgedJobs empty, unjudgedEntries 0, «✓» printed', async () => {
  const r = await ciReport({ zip: await logsZip({ '1_a.txt': GREEN, '2_b.txt': GREEN }) });
  assert.deepEqual([r.ok, r.code, r.unjudgedJobs, r.unjudgedEntries], [true, null, [], 0]);
  assert.ok(renderCiReport(r).out.length > 0);
});

test('C29.3: the CLI end to end with a REAL log above 64 MiB: exit 1, ECIREPORT_UNJUDGED in --json, no «✓» on stdout; --allow names it: exit 0', { timeout: 120000 }, async () => {
  const zip = await logsZip({ '1_huge.txt': Buffer.alloc(65 * 1024 * 1024, 'ok 1 - a\n'), '2_ok.txt': GREEN });
  const plain = await cli('ci-report', zip);
  assert.equal(plain.status, 1);
  assert.ok(!plain.out.includes('✓'), 'stdout has no «✓» line');
  const j = JSON.parse((await cli('ci-report', zip, '--json')).out);
  assert.deepEqual([j.ok, j.code, j.unjudgedJobs, j.unjudgedEntries], [false, 'ECIREPORT_UNJUDGED', ['huge'], 0]);
  assert.equal((await cli('ci-report', zip, '--allow', 'huge')).status, 0);
});
