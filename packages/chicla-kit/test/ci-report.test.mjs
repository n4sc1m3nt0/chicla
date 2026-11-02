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

test('a log over the size limit is not read into memory: the job is listed as unreadable, never a crash', async () => {
  const zip = await logsZip({ '1_big.txt': 'x'.repeat(5000), '2_ok.txt': GREEN });
  const r = await ciReport({ zip, maxBytes: 1000 });
  const big = r.jobs.find((j) => j.name === 'big');
  assert.equal(big.unreadable, true);
  assert.equal(r.jobs.find((j) => j.name === 'ok').failed, false);
  assert.equal(r.ok, true, 'an unreadable log is a warning, not a verdict');
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
