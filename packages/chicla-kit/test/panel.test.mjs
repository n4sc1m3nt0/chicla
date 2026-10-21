// C11.5 slice c (D93 (a)): the navigable panel. `chicla` with NO arguments on an interactive terminal (stdout and stdin TTY, shouldStyle) shows status, gates,
// open decisions and the last delivery; left/right (or Tab) change page, `q` leaves. It only READS: the status file and the newest chicla-round*.zip next to the project.
// Streams are injected (D93 (4)): no real TTY. Tests assert pages and state, never wording beyond the project's own text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { main } = await import(pathToFileURL(join(ROOT, 'packages/chicla-kit/src/cli.mjs')).href);
const { stripAnsi } = await import(pathToFileURL(join(ROOT, 'packages/chicla-kit/src/ui.mjs')).href);
const panel = await import(pathToFileURL(join(ROOT, 'packages/chicla-kit/src/panel.mjs')).href);

const STATUS = `# Status

**Current version:** v1.2.3 (round 9: the thing)

**Fingerprint:** seq=7

**Last updated (round 9):** 2026-10-14. The newest entry, one line.

**Previous (round 8):** older text that must not be shown as the newest.

## Snapshot

- Done: whatever.

## Next up

**Open decisions:** D7 (suggestion: yes). **Task: the next thing.**

## Gates

| Gate | What | State |
| --- | --- | --- |
| G-C1 | Name the thing | CLOSED by Rodrigo |
| G-C2 | Run on a Mac | open (Rodrigo's) |
`;

/** A fake project: a work folder with the status file; the delivery zips sit NEXT TO it (in the parent). */
const world = ({ status = STATUS, zips = [] } = {}) => {
  const W = mkdtempSync(join(tmpdir(), 'chicla-c115c-')), P = join(W, 'proj');
  mkdirSync(P, { recursive: true });
  if (status !== null) writeFileSync(join(P, 'CHICLA_PROJECT_STATUS-7.md'), status);
  writeFileSync(join(P, 'package.json'), '{"name":"fake","private":true,"version":"0.0.1"}\n');
  zips.forEach(([name, t]) => { writeFileSync(join(W, name), 'zip'); utimesSync(join(W, name), t, t); });
  return { W, P };
};
const snapshot = (dir) => readdirSync(dir, { recursive: true }).sort().map((f) => { const s = statSync(join(dir, f)); return `${f}:${s.isFile() ? readFileSync(join(dir, f), 'utf8').length : 'd'}:${s.mtimeMs}`; }).join('|');

/** A fake stdin the panel can drive: records raw mode and the listeners. */
const fakeStdin = (isTTY = true) => {
  const l = []; const s = { isTTY, raw: null, resumed: false, listeners: l, setEncoding() {}, setRawMode(v) { s.raw = v; }, resume() { s.resumed = true; }, pause() { s.resumed = false; },
    on(e, f) { l.push([e, f]); return s; }, removeListener(e, f) { const i = l.findIndex(([x, y]) => x === e && y === f); if (i >= 0) l.splice(i, 1); return s; },
    send(k) { for (const [e, f] of [...l]) if (e === 'data') f(k); }, end() { for (const [e, f] of [...l]) if (e === 'end') f(); } };
  return s;
};
const launch = async (P, { env = {}, outTTY = true, inTTY = true, args = [], columns } = {}) => {
  let out = '', err = ''; const stdin = fakeStdin(inTTY);
  const p = main(args, { stdout: { isTTY: outTTY, columns, write: (x) => { out += x; } }, stderr: { isTTY: true, write: (x) => { err += x; } }, stdin, cwd: P, env });
  const t0 = Date.now(); while (Date.now() - t0 < 1500 && !stdin.listeners.length) { if (await Promise.race([p.then(() => 'done'), new Promise((r) => setTimeout(() => r('wait'), 5))]) === 'done') break; }
  return { p, stdin, get out() { return out; }, get err() { return err; }, clear() { out = ''; } };
};
/** The result of `p`, or 'HUNG' when it does not settle (a panel that never closes must fail the test, not hang it). */
const settled = (p, ms = 1500) => Promise.race([p, new Promise((r) => setTimeout(() => r('HUNG'), ms))]);
const screen = (s) => stripAnsi(s).replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');

test('readPanelData: version, newest «Last updated» entry only, Next up, gates and the newest delivery zip NEXT TO the project', () => {
  const { W, P } = world({ zips: [['chicla-round1-2026-01-01.zip', 1000], ['chicla-round2-2026-01-02.zip', 2000], ['other.zip', 3000]] });
  try {
    const d = panel.readPanelData(P);
    assert.match(d.version, /v1\.2\.3/); assert.match(d.updated, /newest entry/); assert.ok(!/older text/.test(d.updated));
    assert.match(d.next, /D7/); assert.deepEqual(d.gates.map((g) => g.id), ['G-C1', 'G-C2']); assert.match(d.gates[1].state, /^open/);
    assert.equal(d.delivery, 'chicla-round2-2026-01-02.zip');
  } finally { rmSync(W, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('readPanelData: a project with no status file and no zip gives nulls and empty lists, never throws', () => {
  const { W, P } = world({ status: null });
  try { const d = panel.readPanelData(P); assert.equal(d.version, null); assert.equal(d.delivery, null); assert.deepEqual(d.gates, []); }
  finally { rmSync(W, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('with the highest-numbered status file: -10 wins over -9', () => {
  const { W, P } = world({ status: null });
  try {
    writeFileSync(join(P, 'CHICLA_PROJECT_STATUS-9.md'), '**Current version:** v9\n'); writeFileSync(join(P, 'CHICLA_PROJECT_STATUS-10.md'), '**Current version:** v10\n');
    assert.match(panel.readPanelData(P).version, /v10/);
  } finally { rmSync(W, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('renderPanel: every page fits the width and shows its own content; the tab bar marks the page', () => {
  const { W, P } = world({ zips: [['chicla-round2-2026-01-02.zip', 2000]] });
  try {
    const d = panel.readPanelData(P);
    const pages = panel.PAGES.map((_, i) => screen(panel.renderPanel(d, i, { width: 50, on: false })));
    assert.equal(pages.length, 4);
    assert.match(pages[0], /v1\.2\.3/); assert.match(pages[1], /G-C2/); assert.match(pages[2], /D7/); assert.match(pages[3], /chicla-round2-2026-01-02\.zip/);
    for (const p of pages) for (const l of p.split('\n')) assert.ok([...l].length <= 50, `too wide: ${l}`);
    assert.ok(!panel.renderPanel(d, 0, { width: 50, on: false }).includes('\u001b['), 'on=false: no escape code');
    assert.ok(panel.renderPanel(d, 0, { width: 50, on: true }).includes('\u001b['));
  } finally { rmSync(W, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('no arguments on a TTY (stdout, stdin, clean env): the panel opens in raw mode; →, ←, Tab change page; q leaves, restores the terminal and exits 0', async () => {
  const { W, P } = world({ zips: [['chicla-round2-2026-01-02.zip', 2000]] });
  try {
    const r = await launch(P);
    assert.equal(r.stdin.raw, true); assert.match(screen(r.out), /v1\.2\.3/);
    r.clear(); r.stdin.send('\u001b[C'); assert.match(screen(r.out), /G-C2/);
    r.clear(); r.stdin.send('\t'); assert.match(screen(r.out), /D7/);
    r.clear(); r.stdin.send('\u001b[C'); assert.match(screen(r.out), /chicla-round2/);
    r.clear(); r.stdin.send('\u001b[C'); assert.match(screen(r.out), /v1\.2\.3/, 'after the last page it wraps to the first');
    r.clear(); r.stdin.send('\u001b[D'); assert.match(screen(r.out), /chicla-round2/, '← wraps back');
    r.clear(); r.stdin.send('q');
    assert.equal(await settled(r.p), 0); assert.equal(r.stdin.raw, false); assert.equal(r.stdin.listeners.length, 0, 'every listener is removed');
    assert.ok(r.out.includes('\u001b[?25h'), 'the cursor is shown again');
  } finally { rmSync(W, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('Ctrl-C and the end of the input also leave and restore the terminal', async () => {
  const { W, P } = world();
  try {
    const a = await launch(P); a.stdin.send('\u0003'); assert.equal(await settled(a.p), 0); assert.equal(a.stdin.raw, false);
    const b = await launch(P); b.stdin.end(); assert.equal(await settled(b.p), 0); assert.equal(b.stdin.raw, false);
  } finally { rmSync(W, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('the panel only READS: nothing in the project or beside it changes', async () => {
  const { W, P } = world({ zips: [['chicla-round2-2026-01-02.zip', 2000]] });
  try {
    const before = snapshot(W); const r = await launch(P);
    for (const k of ['\u001b[C', '\u001b[C', '\u001b[C', 'r', 'q']) r.stdin.send(k);
    await r.p; assert.equal(snapshot(W), before);
  } finally { rmSync(W, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('a project with no status file still opens the panel and says so', async () => {
  const { W, P } = world({ status: null });
  try { const r = await launch(P); assert.match(screen(r.out), /no status file/i); r.stdin.send('q'); assert.equal(await r.p, 0); }
  finally { rmSync(W, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('the panel is the STYLED path only: a pipe, a non-TTY stdin, NO_COLOR, CI, TERM=dumb and --json keep today\'s usage error (exit 2)', async () => {
  const { W, P } = world();
  try {
    for (const o of [{ outTTY: false }, { inTTY: false }, { env: { NO_COLOR: '1' } }, { env: { CI: 'true' } }, { env: { TERM: 'dumb' } }, { args: ['--json'] }]) {
      const r = await launch(P, o); const st = await settled(r.p); if (st === 'HUNG') r.stdin.send('q'); assert.equal(st, 2, JSON.stringify(o)); assert.equal(r.stdin.raw, null, 'raw mode was never touched');
    }
  } finally { rmSync(W, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('a real argument never opens the panel, even on a TTY', async () => {
  const { W, P } = world();
  try { const r = await launch(P, { args: ['check-manifest', '--root', P] }); const st = await settled(r.p); if (st === 'HUNG') r.stdin.send('q'); assert.notEqual(st, 'HUNG'); assert.equal(r.stdin.raw, null); }
  finally { rmSync(W, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});
