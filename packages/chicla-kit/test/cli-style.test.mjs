// C11.5 slice b (D93): the human output of the CLI uses ui.mjs ONLY on an interactive terminal (`shouldStyle`): a TTY, not --json, not CI, no NO_COLOR, not TERM=dumb.
// Everything else keeps today's text BYTE FOR BYTE. Only the marks of summary lines (✓ ✗ ⚠) are painted, never the lists of files (D93 (b)). Streams are injected: no real TTY (D93 (4)).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { main } = await import(pathToFileURL(join(ROOT, 'packages/chicla-kit/src/cli.mjs')).href);
const { stripAnsi } = await import(pathToFileURL(join(ROOT, 'packages/chicla-kit/src/ui.mjs')).href);
const ESC = '\u001b[';

const project = () => {
  const T = mkdtempSync(join(tmpdir(), 'chicla-c115b-'));
  writeFileSync(join(T, 'package.json'), '{"name":"fake","private":true,"version":"0.0.1"}\n');
  for (const [rel, text] of Object.entries({ 'a.txt': 'a', 'sub/b.txt': 'b' })) { mkdirSync(dirname(join(T, rel)), { recursive: true }); writeFileSync(join(T, rel), text); }
  return T;
};
/** In-process run with injected streams; `tty` sets isTTY on both, `env` is the injected environment. */
const run = async (args, { tty = false, env = {}, cwd } = {}) => {
  let out = '', err = '';
  const status = await main(args, { stdout: { isTTY: tty, write: (s) => { out += s; } }, stderr: { isTTY: tty, write: (s) => { err += s; } }, cwd, env });
  return { status, out, err };
};
/** Writes a manifest, then loses one file so the check FAILS: gives a ✓-free, ✗ and file-list output. */
const lostProject = async () => {
  const T = project();
  await run(['check-manifest', '--write', '--root', T]);
  rmSync(join(T, 'a.txt'));
  return T;
};

test('not a TTY: the output is plain (no escape code) and is what a styled run gives once the codes are stripped', async () => {
  const T = await lostProject();
  try {
    const plain = await run(['check-manifest', '--root', T], { tty: false });
    const styled = await run(['check-manifest', '--root', T], { tty: true });
    assert.equal(plain.status, 1); assert.equal(styled.status, 1, 'the exit code does not change');
    assert.ok(!plain.out.includes(ESC) && !plain.err.includes(ESC));
    assert.ok((styled.out + styled.err).includes(ESC), 'a TTY with a clean env is styled');
    assert.equal(stripAnsi(styled.out), plain.out); assert.equal(stripAnsi(styled.err), plain.err);
  } finally { rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('a passing check is styled too, on stdout', async () => {
  const T = project();
  try {
    await run(['check-manifest', '--write', '--root', T]);
    const plain = await run(['check-manifest', '--root', T]);
    const styled = await run(['check-manifest', '--root', T], { tty: true });
    assert.equal(styled.status, 0);
    assert.ok(styled.out.includes(ESC + '32m'), 'the ✓ is green');
    assert.equal(stripAnsi(styled.out), plain.out);
  } finally { rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('the lists of files are never painted: every styled line is a summary line starting with a mark', async () => {
  const T = await lostProject();
  try {
    const styled = await run(['check-manifest', '--root', T], { tty: true });
    const lines = (styled.out + styled.err).split('\n');
    const listed = lines.filter((l) => /^ {2}\S/.test(stripAnsi(l)) && !/^ {2}[✓✗⚠]/.test(stripAnsi(l)));
    assert.ok(listed.length >= 1, 'the failing run lists the lost file');
    for (const l of listed) assert.ok(!l.includes(ESC), `file line painted: ${l}`);
  } finally { rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('NO_COLOR, CI and TERM=dumb switch the style off; an empty NO_COLOR does not', async () => {
  const T = await lostProject();
  try {
    for (const env of [{ NO_COLOR: '1' }, { CI: 'true' }, { TERM: 'dumb' }]) {
      const r = await run(['check-manifest', '--root', T], { tty: true, env });
      assert.ok(!(r.out + r.err).includes(ESC), JSON.stringify(env));
    }
    const r = await run(['check-manifest', '--root', T], { tty: true, env: { NO_COLOR: '' } });
    assert.ok((r.out + r.err).includes(ESC));
  } finally { rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('--json: one JSON object on stdout and plain text on stderr, even on a TTY', async () => {
  const T = await lostProject();
  try {
    const r = await run(['check-manifest', '--json', '--root', T], { tty: true });
    assert.ok(!r.out.includes(ESC) && !r.err.includes(ESC));
    assert.equal(JSON.parse(r.out).ok, false);
  } finally { rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('the environment comes from io.env, not process.env, and the two streams are judged separately', async () => {
  const T = await lostProject();
  const saved = process.env.NO_COLOR;
  try {
    process.env.NO_COLOR = '1'; // must be ignored when io.env is given
    const r = await run(['check-manifest', '--root', T], { tty: true, env: {} });
    assert.ok((r.out + r.err).includes(ESC));
    let out = '', err = '';
    await main(['check-manifest', '--root', T], { stdout: { isTTY: false, write: (s) => { out += s; } }, stderr: { isTTY: true, write: (s) => { err += s; } }, env: {} });
    assert.ok(!out.includes(ESC), 'stdout is a pipe: plain');
    assert.ok(err.includes(ESC), 'stderr is a TTY: styled');
  } finally { if (saved === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = saved; rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('usage errors and --help stay plain on a TTY', async () => {
  const r = await run(['nope'], { tty: true });
  assert.equal(r.status, 2); assert.ok(!r.err.includes(ESC));
  const h = await run(['--help'], { tty: true });
  assert.equal(h.status, 0); assert.ok(!h.out.includes(ESC));
});
