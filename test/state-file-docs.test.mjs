// C10.5 (round 181) — the format of the status file is specified in docs/state-file.md, and `bump-round` refuses a status file that lacks a required part.
// Tests first: they were red before docs/state-file.md and the check in packages/chicla-kit/src/bump-round.mjs existed.
// The projects are throw-away folders whose hashes are computed HERE (the definition of docs/fingerprint.md), then `bumpRound` is asked to bump, refresh,
// dry-run and verify them. The doc and the code cannot drift: the table of required parts in the doc is read back and compared with what the code refuses.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = 'packages/chicla-kit/src/bump-round.mjs';
const { bumpRound } = await import(pathToFileURL(join(ROOT, CORE)).href);
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DOC = 'docs/state-file.md';
const T = mkdtempSync(join(tmpdir(), 'chicla-c105-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 5 }));

const tailFrom = (text, n) => text.split('\n').slice(n - 1).join('\n');
const h12 = (text) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
const core = (seq, hApp, hCl) => `seq=${seq} file=CHICLA_PROJECT_STATUS-${seq}.md app_sha256_12=${hApp} changelog_sha256_12=${hCl}`;
const para = (seq, hApp, hCl) => `**Fingerprint:** seq=${seq} · app=version.mjs ·\napp_sha256_12=${hApp} (of everything below the app file's own fingerprint comment) ·\nchangelog=CHANGELOG.md ·\nchangelog_sha256_12=${hCl} (hash of CHANGELOG.md below its own line) · matches the comments.\nIf any of these three don't match, stop and see instructions item 11 above before doing anything else.`;

/** The parts, in the order the doc gives them: [name the refusal prints, the text that makes the part present]. */
const PARTS = [
  ['## Instructions', '## Instructions (read this first)\n\n1. Cold start.\n'],
  ['**Current version:**', '**Current version:** v0.0.1 (round 1)\n'],
  ['**Last updated (round N):**', '**Last updated (round 1):** 2026-10-18. Something happened.\n'],
  ['## Snapshot', '## Snapshot\n\n- Done: round 1.\n'],
  ['## Next up', '## Next up\n\n**Open decisions:** none.\n'],
  ['## Gates', '## Gates\n\n| Gate | What | State |\n| --- | --- | --- |\n'],
];
/** A status file with the parts in a valid order. `skip` leaves one out by name; `parts` replaces the list. */
const statusText = (seq, hApp, hCl, { skip = null, parts = PARTS } = {}) => {
  const p = Object.fromEntries(parts);
  const take = (name) => (name === skip || p[name] === undefined ? '' : p[name] + '\n');
  return `# Status\n\n${take('## Instructions')}${take('**Current version:**')}${para(seq, hApp, hCl)}\n\n${take('**Last updated (round N):**')}${take('## Snapshot')}${take('## Next up')}${take('## Gates')}`;
};

let n = 0;
function project({ seq = 4, status = {} } = {}) {
  const dir = join(T, `p${n++}`);
  mkdirSync(dir, { recursive: true });
  const app = `// a\n// b\n// FP\nexport const V = 1;\n`; const cl = `<!-- FP -->\n# Changelog\n\n## Round 1\n`;
  const hApp = h12(tailFrom(app, 4)); const hCl = h12(tailFrom(cl, 2));
  writeFileSync(join(dir, 'version.mjs'), app.replace('// FP', `// STATUS_FILE_FINGERPRINT: ${core(seq, hApp, hCl)}`));
  writeFileSync(join(dir, 'CHANGELOG.md'), cl.replace('<!-- FP -->', `<!-- CHANGELOG_FINGERPRINT: ${core(seq, hApp, hCl)} -->`));
  writeFileSync(join(dir, `CHICLA_PROJECT_STATUS-${seq}.md`), statusText(seq, hApp, hCl, status));
  return dir;
}
const stub = () => ({ ok: true, out: 'manifest stub', err: '' });
const bump = (dir, o = {}) => bumpRound({ root: dir, regenerateManifest: stub, ...o });
const names = (dir) => readdirSync(dir).sort();
const snapshot = (dir) => Object.fromEntries(names(dir).map((f) => [f, readFileSync(join(dir, f), 'utf8')]));

test('docs/state-file.md exists and docs/README.md lists it', () => {
  assert.ok(existsSync(join(ROOT, DOC)), `${DOC} is missing`);
  assert.ok(read('docs/README.md').includes('`state-file.md`'), 'docs/README.md has no row for state-file.md');
});

test('the doc names every required part, lists the ordered ones in the order the code insists on, and the code names every part', () => {
  const doc = read(DOC);
  const at = PARTS.map(([name]) => doc.indexOf('`' + name + '`'));
  PARTS.forEach(([name], i) => assert.ok(at[i] >= 0, `the doc does not name ${name}`));
  PARTS.forEach(([name]) => assert.ok(doc.includes('| `' + name + '` |'), `the table of parts has no row for ${name}`));
  assert.ok(doc.includes('| `**Fingerprint:**` |'), 'the table of parts has no row for the fingerprint paragraph');
  const fp = doc.indexOf('1. `**Fingerprint:**`');
  assert.ok(fp >= 0, 'the doc has no numbered order starting at the fingerprint');
  const order = ['`**Last updated (round N):**`', '`## Snapshot`', '`## Next up`', '`## Gates`'].map((x, k) => doc.indexOf(`${k + 2}. ${x}`));
  assert.ok(order.every((x, k) => x > (k ? order[k - 1] : fp)), `the numbered order in the doc is ${order}`);
  assert.ok(doc.includes('EBUMP_STATUS'), 'the doc does not explain the refusal code');
  const src = read(CORE);
  for (const [name] of PARTS) assert.ok(src.includes(name), `the code does not name ${name}`);
});

test('a complete status file is bumped, refreshed and dry-run exactly as before (the check adds nothing for a good file)', () => {
  const a = project(); const r = bump(a); assert.equal(r.ok, true, JSON.stringify(r.messages)); assert.equal(r.code, null);
  assert.ok(existsSync(join(a, 'CHICLA_PROJECT_STATUS-5.md')));
  const b = project(); assert.equal(bump(b, { mode: 'refresh' }).ok, true);
  const c = project(); const before = snapshot(c); assert.equal(bump(c, { dry: true }).ok, true); assert.deepEqual(snapshot(c), before);
  assert.equal(bumpRound({ root: project(), mode: 'verify' }).ok, true);
});

for (const [name] of PARTS) {
  test(`a status file without ${name} is refused by bump, refresh and dry-run (EBUMP_STATUS), names the part, and nothing is written`, () => {
    for (const o of [{}, { mode: 'refresh' }, { dry: true }, { mode: 'refresh', dry: true }]) {
      const dir = project({ status: { skip: name } }); const before = snapshot(dir);
      const r = bump(dir, o);
      assert.equal(r.ok, false, JSON.stringify(o)); assert.equal(r.code, 'EBUMP_STATUS', JSON.stringify(o));
      assert.ok(r.messages.some((m) => m.stream === 'err' && m.text.includes(name)), `the message names ${name}`);
      assert.deepEqual(snapshot(dir), before, 'nothing written, nothing renamed');
    }
  });
}

test('all the missing parts are named at once, not one per run', () => {
  const dir = project({ status: { parts: [PARTS[0], PARTS[1]] } });
  const r = bump(dir); assert.equal(r.code, 'EBUMP_STATUS');
  const text = r.messages.map((m) => m.text).join('\n');
  for (const [name] of PARTS.slice(2)) assert.ok(text.includes(name), `names ${name}`);
});

test('a part inside a fenced block does not count (``` and ~~~), and the real part after the block still does', () => {
  for (const fence of ['```', '~~~']) {
    const parts = PARTS.map(([name, body]) => (name === '## Gates' ? [name, `${fence}\n## Gates\n${fence}\n`] : [name, body]));
    const r = bump(project({ status: { parts } })); assert.equal(r.code, 'EBUMP_STATUS', fence);
    assert.ok(r.messages.some((m) => m.text.includes('## Gates')), fence);
  }
  const ok = PARTS.map(([name, body]) => (name === '## Next up' ? [name, body + '```\ncode\n```\n'] : [name, body]));
  assert.equal(bump(project({ status: { parts: ok } })).ok, true, 'an ordinary fenced block inside a part is fine');
});

test('a part counts only at the start of a line, for every part: the same words inside a sentence do not satisfy it', () => {
  for (const [name] of PARTS) {
    const inline = name.replace('N', '1');
    const parts = PARTS.map(([nm, body]) => (nm === name ? [nm, `The words ${inline} are in a sentence, not at the start of a line.\n`] : [nm, body]));
    const r = bump(project({ status: { parts } })); assert.equal(r.code, 'EBUMP_STATUS', name);
    assert.ok(r.messages.some((m) => m.stream === 'err' && m.text.includes(name)), name);
  }
});

test('«Last updated» needs its round: `**Last updated:**` alone is refused, and so are the headings with extra words after them (## Snapshot of the work)', () => {
  const noRound = PARTS.map(([nm, body]) => (nm.startsWith('**Last updated') ? [nm, '**Last updated:** 2026-10-18.\n'] : [nm, body]));
  assert.equal(bump(project({ status: { parts: noRound } })).code, 'EBUMP_STATUS');
  for (const [name, longer] of [['## Snapshot', '## Snapshot of the work\n'], ['## Next up', '## Next up soon\n'], ['## Gates', '## Gates and more\n']]) {
    const parts = PARTS.map(([nm, body]) => (nm === name ? [nm, longer] : [nm, body]));
    const r = bump(project({ status: { parts } })); assert.equal(r.code, 'EBUMP_STATUS', longer.trim());
    assert.ok(r.messages.some((m) => m.text.includes(name)), longer.trim());
  }
});

test('the parts must come in the order of the doc: fingerprint, then last updated, then snapshot, next up, gates (a swapped file is refused and says so)', () => {
  const dir = project({ seq: 6 });
  const file = join(dir, 'CHICLA_PROJECT_STATUS-6.md'); const t = readFileSync(file, 'utf8');
  const i = t.indexOf('## Snapshot'); const j = t.indexOf('## Next up');
  writeFileSync(file, t.slice(0, i) + t.slice(j, t.indexOf('## Gates')) + t.slice(i, j) + t.slice(t.indexOf('## Gates')));
  const r = bump(dir); assert.equal(r.code, 'EBUMP_STATUS');
  assert.ok(r.messages.some((m) => /order/i.test(m.text)), 'the message says order');
  assert.ok(existsSync(file), 'still named -6');
});

test('verify does not run the check: it reads and reports the fingerprint checks only (an old, incomplete file can still be verified)', () => {
  const dir = project({ status: { skip: '## Gates' } });
  const r = bumpRound({ root: dir, mode: 'verify' });
  assert.equal(r.ok, true, JSON.stringify(r.messages)); assert.equal(r.code, null);
});

test('EBUMP_STATUS comes after EBUMP_STATE and EBUMP_UNPAIRED: a damaged fingerprint paragraph is still EBUMP_STATE, seqs that differ are still EBUMP_UNPAIRED', () => {
  const noPara = project(); writeFileSync(join(noPara, 'CHICLA_PROJECT_STATUS-4.md'), '# Status\n');
  assert.equal(bump(noPara).code, 'EBUMP_STATE');
  const dir = project({ status: { skip: '## Gates' } });
  writeFileSync(join(dir, 'version.mjs'), readFileSync(join(dir, 'version.mjs'), 'utf8').replace('seq=4', 'seq=3'));
  assert.equal(bump(dir).code, 'EBUMP_UNPAIRED');
});

test('the real status file and the template of `chicla init` both pass the check (dry-run on a project whose fingerprint paragraph is rebuilt here)', () => {
  const PARA_RE = /\*\*Fingerprint:\*\* seq=\d+ · app=\S+ ·\s*app_sha256_12=[0-9a-f]{12}[\s\S]*?changelog_sha256_12=[0-9a-f]{12}[\s\S]*?before doing anything else\./;
  const real = readdirSync(ROOT).find((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f));
  for (const [label, file] of [['real', real], ['template', 'packages/chicla-kit/templates/CHICLA_PROJECT_STATUS-1.md']]) {
    const dir = project({ seq: 4 }); const target = join(dir, 'CHICLA_PROJECT_STATUS-4.md');
    const paraNow = readFileSync(target, 'utf8').match(PARA_RE)[0];
    assert.ok(PARA_RE.test(read(file)), `${label} has the fingerprint paragraph`);
    writeFileSync(target, read(file).replace(PARA_RE, () => paraNow));
    const r = bump(dir, { dry: true }); assert.equal(r.ok, true, `${label}: ${JSON.stringify(r.messages)}`);
  }
});
