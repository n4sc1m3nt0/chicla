// C9.6 — the delivery carries its own baseline (FILES.baseline.json) and the dump/recovery use it
// with NO previous delivery zip at hand. Tests assert error `code`s, never message text (rule 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPinned, pinnedFile } from './toolchain-files.mjs';
const { parseManifest } = await importPinned('manifest');
const { BASELINE_FILE, buildBaseline, serializeBaseline, parseBaseline } = await importPinned('baseline');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
const tmp = (tag) => mkdtempSync(join(tmpdir(), `chicla-c96-${tag}-`));
const codeOf = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('C9.6: the baseline file name is fixed', () => {
  assert.equal(BASELINE_FILE, 'FILES.baseline.json');
});

test('C9.6: buildBaseline lists path, size and sha256, sorted, without itself', () => {
  const d = tmp('unit');
  try {
    mkdirSync(join(d, 'sub'));
    writeFileSync(join(d, 'b.txt'), 'bb');
    writeFileSync(join(d, 'sub', 'a.txt'), 'a');
    const b = buildBaseline(d, ['sub/a.txt', 'b.txt', BASELINE_FILE]);
    assert.deepEqual(b.files.map((f) => f.path), ['b.txt', 'sub/a.txt']);
    assert.deepEqual(b.files[0], { path: 'b.txt', size: 2, sha256: sha('bb') });
    assert.deepEqual(b.files[1], { path: 'sub/a.txt', size: 1, sha256: sha('a') });
    assert.equal(b.format, 'chicla-baseline-v1');
    assert.equal(parseBaseline(serializeBaseline(b)).files.length, 2);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('C9.6: a baseline cut, edited or of another format is refused with a stable code', () => {
  const d = tmp('refuse');
  try {
    writeFileSync(join(d, 'x.txt'), 'x'); writeFileSync(join(d, 'y.txt'), 'y');
    const text = serializeBaseline(buildBaseline(d, ['x.txt', 'y.txt']));
    assert.equal(codeOf(() => parseBaseline(text)), null, 'the intact baseline is accepted');
    assert.equal(codeOf(() => parseBaseline(text.slice(0, text.length >> 1))), 'EBASELINE_PARSE', 'cut in half');
    assert.equal(codeOf(() => parseBaseline('')), 'EBASELINE_PARSE', 'empty');
    const o = JSON.parse(text);
    const edit = (fn) => { const c = structuredClone(o); fn(c); return JSON.stringify(c); };
    assert.equal(codeOf(() => parseBaseline(edit((c) => { c.files[0].sha256 = '0'.repeat(64); }))), 'EBASELINE_SEAL', 'hash edited');
    assert.equal(codeOf(() => parseBaseline(edit((c) => { c.files[0].path = 'z.txt'; }))), 'EBASELINE_SEAL', 'path edited');
    assert.equal(codeOf(() => parseBaseline(edit((c) => { c.files.pop(); }))), 'EBASELINE_SEAL', 'entry removed (list cut)');
    assert.equal(codeOf(() => parseBaseline(edit((c) => { c.files[0].size = 99; }))), 'EBASELINE_SEAL', 'size edited');
    assert.equal(codeOf(() => parseBaseline(edit((c) => { c.format = 'other'; }))), 'EBASELINE_FORMAT', 'other format');
    assert.equal(codeOf(() => parseBaseline(edit((c) => { delete c.seal; }))), 'EBASELINE_SEAL', 'no seal');
    assert.equal(codeOf(() => parseBaseline(edit((c) => { c.files = 'nope'; }))), 'EBASELINE_PARSE', 'files is not a list');
    assert.equal(codeOf(() => parseBaseline(edit((c) => { c.files[0].path = '../escape'; }))), 'EBASELINE_PARSE', 'unsafe path (hostile input)');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// ---- end to end: delivery -> dump -> recovery with NO zip at hand ----
test('C9.6: make-delivery-zip ships FILES.baseline.json; a dump is recovered without any previous zip', () => {
  const T = tmp('e2e');
  try {
    // copy of the project (only manifest files that exist), as the other smoke tests do
    const proj = join(T, 'work', 'chicla');
    for (const { path: rel } of parseManifest(readFileSync(join(ROOT, 'FILES.manifest'), 'utf8'))) {
      if (!existsSync(join(ROOT, rel))) continue;
      mkdirSync(dirname(join(proj, rel)), { recursive: true }); copyFileSync(join(ROOT, rel), join(proj, rel));
    }
    // the baseline of the tree is made by the delivery itself: make sure the copy starts without one
    rmSync(join(proj, BASELINE_FILE), { force: true });
    const zip = join(T, 'delivery.zip');
    const mk = run('node', [join(proj, 'scripts/make-delivery-zip.mjs'), zip], proj);
    assert.equal(mk.status, 0, mk.stdout + mk.stderr);

    // independent reader: unzip + sha256 here, not the code that wrote the baseline
    const listing = run('unzip', ['-Z1', zip]).stdout.split('\n').filter(Boolean);
    assert.ok(listing.includes(BASELINE_FILE), 'the delivery zip has FILES.baseline.json');
    const manifest = parseManifest(run('unzip', ['-p', zip, 'FILES.manifest']).stdout).map((e) => e.path); // v2 since C7.1 slice b
    assert.ok(manifest.includes(BASELINE_FILE), 'FILES.manifest lists the baseline');
    const text = run('unzip', ['-p', zip, BASELINE_FILE]).stdout;
    const base = parseBaseline(text);
    assert.deepEqual(base.files.map((f) => f.path).sort(), [...manifest.filter((n) => n !== BASELINE_FILE), 'FILES.manifest'].sort(), 'baseline = manifest (+ the manifest file, which does not list itself) minus itself');
    for (const f of base.files) {
      const bytes = spawnSync('unzip', ['-p', zip, f.path], { maxBuffer: 1 << 28 }).stdout;
      assert.equal(bytes.length, f.size, `size of ${f.path}`);
      assert.equal(sha(bytes), f.sha256, `sha256 of ${f.path}`);
    }

    // "session": modify, add, delete
    appendFileSync(join(proj, 'ROADMAP.md'), '\nline from the session\n');
    writeFileSync(join(proj, 'scripts', 'brand-new.mjs'), 'export const ok = true;\n');
    rmSync(join(proj, 'docs', 'zip-handling.md'));
    const outdir = join(T, 'out');
    const d = run('node', [join(proj, 'scripts/emergency-dump.mjs'), '--work', join(T, 'work'), '--outdir', outdir, '--no-outputs', 'c96'], proj);
    assert.equal(d.status, 0, d.stdout + d.stderr);
    const dumpPath = join(outdir, readdirSync(outdir).find((f) => f.endsWith('.zip')));

    const rec = (zipPath, extra, name) => {
      const o = join(T, name);
      const r = run('node', [pinnedFile(ROOT, 'recovery-report'), zipPath, '--out', o, ...extra], ROOT);
      return { r, diff: existsSync(join(o, 'RECOVERY_DIFF.md')) ? readFileSync(join(o, 'RECOVERY_DIFF.md'), 'utf8') : '' };
    };
    const section = (diff, t) => diff.split(/^### /m).find((s) => s.startsWith(t)) ?? '';

    const a = rec(dumpPath, [], 'rec-nozip');
    assert.equal(a.r.status, 0, a.r.stdout + a.r.stderr);
    assert.match(a.diff, /FILES\.baseline\.json/, 'the report says what it compared against');
    assert.ok(section(a.diff, 'Modified').includes('ROADMAP.md'), 'modified, with NO zip');
    assert.ok(section(a.diff, 'New').includes('scripts/brand-new.mjs'), 'new, with NO zip');
    assert.ok(section(a.diff, 'MISSING').includes('docs/zip-handling.md'), 'missing, with NO zip');
    assert.ok(!section(a.diff, 'New').includes(BASELINE_FILE) && !section(a.diff, 'Modified').includes(BASELINE_FILE), 'the baseline file does not appear as its own change');

    // the old --baseline <zip> still works and wins
    const b = rec(dumpPath, ['--baseline', zip], 'rec-oldzip');
    assert.equal(b.r.status, 0, b.r.stdout + b.r.stderr);
    assert.ok(section(b.diff, 'Modified').includes('ROADMAP.md'));

    // a dump whose baseline was cut or edited is refused (no zip); an explicit zip still recovers it
    const bad = (name, mutate) => {
      const X = join(T, `x-${name}`); run('unzip', ['-q', dumpPath, '-d', X]);
      const marker = JSON.parse(readFileSync(join(X, 'RECOVERY_MARKER.json'), 'utf8'));
      const f = join(X, 'work', marker.projectRootRel, BASELINE_FILE);
      writeFileSync(f, mutate(readFileSync(f, 'utf8')));
      // keep the dump's own integrity record consistent so ONLY the baseline is at fault
      marker.hashes[(marker.projectRootRel ? marker.projectRootRel + '/' : '') + BASELINE_FILE] = sha(readFileSync(f));
      writeFileSync(join(X, 'RECOVERY_MARKER.json'), JSON.stringify(marker, null, 1));
      const z = join(T, `bad-${name}.zip`); run('zip', ['-qr', z, '.'], X);
      return z;
    };
    const cut = bad('cut', (t) => t.slice(0, t.length >> 1));
    const r1 = rec(cut, [], 'rec-cut');
    assert.notEqual(r1.r.status, 0);
    assert.match(r1.r.stderr, /EBASELINE_PARSE/);
    const edited = bad('edit', (t) => t.replace(/[0-9a-f]{64}/, '0'.repeat(64)));
    const r2 = rec(edited, [], 'rec-edit');
    assert.notEqual(r2.r.status, 0);
    assert.match(r2.r.stderr, /EBASELINE_SEAL/);
    const r3 = rec(edited, ['--baseline', zip], 'rec-edit-zip');
    assert.equal(r3.r.status, 0, 'an explicit zip does not depend on the embedded baseline');

    // a delivery made again replaces the baseline with the new state
    const zip2 = join(T, 'delivery2.zip');
    rmSync(join(proj, 'scripts', 'brand-new.mjs'));
    writeFileSync(join(proj, 'docs', 'zip-handling.md'), readFileSync(join(ROOT, 'docs', 'zip-handling.md')));
    const mk2 = run('node', [join(proj, 'scripts/make-delivery-zip.mjs'), zip2], proj);
    assert.equal(mk2.status, 0, mk2.stdout + mk2.stderr);
    const base2 = parseBaseline(run('unzip', ['-p', zip2, BASELINE_FILE]).stdout);
    assert.ok(base2.files.find((f) => f.path === 'ROADMAP.md').sha256 !== base.files.find((f) => f.path === 'ROADMAP.md').sha256, 'the second baseline reflects the edit');
    assert.equal(base2.files.some((f) => f.path === BASELINE_FILE), false);
  } finally { rmSync(T, { recursive: true, force: true }); }
});
