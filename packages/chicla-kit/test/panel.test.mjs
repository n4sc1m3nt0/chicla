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

// Panel polish (round 224, Rodrigo: «if I switch between pages they all get printed in the terminal and I can scroll up, even after I quit»; «no colour, plain Status page»).
test('polish: the panel lives in the terminal\'s alternate screen: entered before the first draw, left (with the cursor shown) on q, Ctrl-C and end of input', async () => {
  const { W, P } = world();
  try {
    for (const leave of [(s) => s.send('q'), (s) => s.send('\u0003'), (s) => s.end()]) {
      const r = await launch(P);
      const enter = r.out.indexOf('\u001b[?1049h');
      assert.ok(enter >= 0, 'alternate screen entered'); assert.ok(enter < r.out.indexOf('v1.2.3'), 'entered before the first draw');
      r.stdin.send('\u001b[C'); r.stdin.send('\t'); r.stdin.send('r');
      assert.ok(r.out.split('\u001b[?1049h').length === 2, 'entered exactly once, however many pages were drawn');
      r.clear(); leave(r.stdin); assert.equal(await settled(r.p), 0);
      assert.ok(r.out.includes('\u001b[?1049l'), 'alternate screen left'); assert.ok(r.out.includes('\u001b[?25h'), 'cursor shown');
      assert.ok(!r.out.includes('\u001b[2J'), 'nothing is drawn after leaving');
    }
  } finally { rmSync(W, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('polish: gate states are coloured (CLOSED green, open yellow) only when `on`, and no line is cut through an escape code', () => {
  const long = STATUS.replace('open (Rodrigo\'s)', 'open: ' + 'a very long state '.repeat(12));
  const { W, P } = world({ status: long });
  try {
    const d = panel.readPanelData(P);
    for (const width of [40, 50, 80]) {
      const on = panel.renderPanel(d, 1, { width, on: true });
      const row = (id) => on.split('\n').find((l) => l.includes(id));
      assert.ok(/\u001b\[32m[^\u001b]*CLOSED/.test(row('G-C1')), 'CLOSED is green');
      assert.ok(/\u001b\[33m[^\u001b]*open/.test(row('G-C2')), 'open is yellow');
      for (const l of on.split('\n')) { assert.ok(!/\u001b(?!\[[0-9;]*m)/.test(l), `broken escape: ${JSON.stringify(l)}`); assert.ok([...stripAnsi(l)].length <= width, `too wide: ${stripAnsi(l)}`); }
      for (const l of on.split('\n').filter((x) => x.includes('│'))) assert.ok(stripAnsi(l).endsWith('│'), 'the right edge of the box stays');
    }
    assert.ok(!panel.renderPanel(d, 1, { width: 50, on: false }).includes('\u001b['), 'on=false: plain');
  } finally { rmSync(W, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('polish: the Status page has labelled fields (File, Version, Round, Updated, Gates, Latest) and the long text wraps under its label', () => {
  const { W, P } = world();
  try {
    const d = panel.readPanelData(P);
    const s = screen(panel.renderPanel(d, 0, { width: 50, on: false }));
    assert.match(s, /File\s+CHICLA_PROJECT_STATUS-7\.md/); assert.match(s, /Version\s+v1\.2\.3/); assert.match(s, /Round\s+9\b/); assert.match(s, /Updated\s+2026-10-14/);
    assert.match(s, /Gates\s+1 closed, 1 open/); assert.match(s, /Latest\s+The newest entry/);
    assert.ok(!/older text/.test(s));
    const long = panel.renderPanel({ ...d, updated: 'Last updated (round 9): 2026-10-14. ' + 'word '.repeat(40) }, 0, { width: 50, on: false }).split('\n');
    const i = long.findIndex((l) => /Latest/.test(l)); assert.ok(/^│ {10}\S/.test(long[i + 1]), 'continuation lines are indented under the text, not under the label');
    for (const l of long) assert.ok([...l].length <= 50);
    assert.ok(!long.join('').includes('…'), 'wrapped, not cut'); assert.equal((long.join(' ').match(/word/g) ?? []).length, 40, 'every word of the long text is on screen');
  } finally { rmSync(W, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('polish: a status file with odd or missing lines still renders the Status page (raw text, no throw)', () => {
  const d = { root: '/x', statusFile: 'CHICLA_PROJECT_STATUS-1.md', version: 'something odd', updated: 'no round here', next: null, gates: [{ id: 'G-X', state: '???' }], delivery: null };
  const s = screen(panel.renderPanel(d, 0, { width: 60, on: true }));
  assert.match(s, /something odd/); assert.match(s, /no round here/); assert.match(s, /CHICLA_PROJECT_STATUS-1\.md/);
  assert.match(screen(panel.renderPanel({ ...d, gates: [] }, 0, { width: 60 })), /Gates\s+none/);
});

test('highlights: the active tab is in blue letters, each key of the footer in white letters (no backgrounds), only when `on`; the text is the same either way', () => {
  const d = { root: '/x', statusFile: null, version: null, updated: null, next: null, gates: [], delivery: null };
  const BG = /\u001b\[[0-9;]*(?:;|\[)(?:4[0-7]|10[0-7])(?:;|m)/;
  for (const page of [0, 1, 2, 3]) {
    const on = panel.renderPanel(d, page, { width: 60, on: true }).split('\n'), off = panel.renderPanel(d, page, { width: 60, on: false }).split('\n');
    assert.ok(/\u001b\[1;94m\[/.test(on[0]), 'the active tab has blue letters (code 94)');
    assert.equal((on[0].match(/\u001b\[1;94m/g) ?? []).length, 1, 'only the active tab is blue');
    assert.equal(stripAnsi(on[0]), off[0], 'same text with or without colour');
    const foot = on[on.length - 1];
    for (const key of ['←/→', 'Tab', 'r', 'q']) assert.ok(new RegExp(`\\u001b\\[1;97m${key.replace('/', '\\/')}\\u001b\\[0m`).test(foot), `key «${key}» has white letters (code 97)`);
    assert.equal(stripAnsi(foot), off[off.length - 1], 'same footer text with or without colour');
    assert.equal(stripAnsi(foot), '←/→ or Tab: page   r: re-read   q: quit', 'the footer wording is the one from before the highlights');
    assert.ok(!off.join('\n').includes('\u001b['), 'on=false: plain');
    for (const l of on) { assert.ok(!/\u001b(?!\[[0-9;]*m)/.test(l), `broken escape: ${JSON.stringify(l)}`); assert.ok(!BG.test(l), `no background colour: ${JSON.stringify(l)}`); }
  }
});

// C18.7 (round 255, AUDIT-5 F-4): panel.mjs line 123, `else return;`: a key the panel does not know neither redraws nor moves.
test('a key the panel does not know (a letter, an up arrow, a space) draws nothing and keeps the page; the next →, ← still work from that page', async () => {
  const { W, P } = world({ zips: [['chicla-round2-2026-01-02.zip', 2000]] });
  try {
    const r = await launch(P);
    r.clear(); r.stdin.send('\u001b[C'); assert.match(screen(r.out), /G-C2/, 'page 2 (gates)');
    for (const k of ['x', '\u001b[A', ' ', 'Z']) { r.clear(); r.stdin.send(k); assert.equal(r.out, '', `no redraw for ${JSON.stringify(k)}`); }
    r.clear(); r.stdin.send('\u001b[C'); assert.match(screen(r.out), /D7/, 'still on page 2: the next → shows page 3');
    r.stdin.send('q'); assert.equal(await settled(r.p), 0);
  } finally { rmSync(W, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});

test('r reads the project again: a status file edited while the panel is open shows after r, and not before (K-PNL-02)', async () => {
  const { W, P } = world();
  try {
    const r = await launch(P);
    assert.match(screen(r.out), /v1\.2\.3/);
    writeFileSync(join(P, 'CHICLA_PROJECT_STATUS-7.md'), STATUS.replace('v1.2.3', 'v9.9.9'));
    r.clear(); r.stdin.send('\u001b[C'); r.stdin.send('\u001b[D'); assert.match(screen(r.out), /v1\.2\.3/, 'not read again without r');
    r.clear(); r.stdin.send('r'); assert.match(screen(r.out), /v9\.9\.9/, 'read again after r');
    r.stdin.send('q'); assert.equal(await settled(r.p), 0);
  } finally { rmSync(W, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); }
});
