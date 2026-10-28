// C6.1 slice d3 (round 99) adds `presets` at the end of this file. C6.1 slice d2a (round 97): an OPTIONAL `chicla.policy.json` at the project root ADDS «never leaves» rules (D65, D66). Without it nothing changes.
// It can only add: no key removes a built-in rule. A bad file stops the work (a policy that is silently ignored would leak what it was meant to keep in).
// Tests assert error `code`s, never message text (rule 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_MANIFEST_COPY, copyFiles, importPinned } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = await importPinned('policy');
const codeOf = (fn) => { try { fn(); } catch (e) { return e.code ?? 'NOCODE'; } return null; };
const P = (o) => JSON.stringify({ version: 1, ...o });

test('the file name is fixed and the default is empty', () => {
  assert.equal(policy.POLICY_FILE, 'chicla.policy.json');
  assert.equal(policy.NO_POLICY.names.size, 0);
  assert.deepEqual(policy.NO_POLICY.paths, []);
  assert.equal(policy.neverShipReason('secrets/a.txt'), null, 'no policy, no extra rule');
});

test('parsePolicy: a valid file gives names and paths', () => {
  const p = policy.parsePolicy(P({ names: ['dist', 'target'], paths: ['secrets/', 'docs/private', 'notes.txt'] }));
  assert.deepEqual([...p.names].sort(), ['dist', 'target']);
  assert.deepEqual(p.paths, ['secrets', 'docs/private', 'notes.txt'], 'a trailing slash is the same as none');
  const q = policy.parsePolicy(P({}));
  assert.equal(q.names.size, 0); assert.deepEqual(q.paths, []);
});

test('parsePolicy: what is refused, with a stable code', () => {
  const c = (text) => codeOf(() => policy.parsePolicy(text));
  assert.equal(c(''), 'EPOLICY_PARSE');
  assert.equal(c('{"version":1,'), 'EPOLICY_PARSE');
  assert.equal(c('[]'), 'EPOLICY_PARSE', 'not an object');
  assert.equal(c('null'), 'EPOLICY_PARSE');
  assert.equal(c('{}'), 'EPOLICY_FORMAT', 'version is required');
  assert.equal(c(JSON.stringify({ version: 2 })), 'EPOLICY_FORMAT', 'a version this reader does not know');
  assert.equal(c(P({ remove: ['.env'] })), 'EPOLICY_FORMAT', 'unknown key: nothing can remove a rule');
  assert.equal(c(P({ names: 'dist' })), 'EPOLICY_FORMAT');
  assert.equal(c(P({ paths: [1] })), 'EPOLICY_FORMAT');
  for (const bad of ['', '.', '..', 'a/b', 'a\\b', '/a', 'policy\0', 'chicla.policy.json']) assert.equal(c(P({ names: [bad] })), 'EPOLICY_PATH', `name ${JSON.stringify(bad)}`);
  for (const bad of ['', '/', '/etc', '../x', 'a/../b', './a', 'a//b', 'a\\b', 'C:\\x', 'x\0', 'chicla.policy.json']) assert.equal(c(P({ paths: [bad] })), 'EPOLICY_PATH', `path ${JSON.stringify(bad)}`);
});

test('neverShipReason and policySkips with a policy: names at any depth, paths from the root', () => {
  const p = policy.parsePolicy(P({ names: ['scratch'], paths: ['secrets', 'docs/private', 'notes.txt'] }));
  const r = (rel) => policy.neverShipReason(rel, p);
  assert.ok(r('scratch/a.txt'), 'a folder name at the root');
  assert.ok(r('a/b/scratch/c.txt'), 'a folder name deep down');
  assert.ok(r('a/scratch'), 'a file with that name');
  assert.ok(r('secrets/k.key'));
  assert.ok(r('secrets/sub/k.key'));
  assert.ok(r('docs/private/x.md'));
  assert.ok(r('notes.txt'));
  assert.equal(r('a/secrets/k.key'), null, 'a path is anchored at the root');
  assert.equal(r('secrets2/k.key'), null, 'a path is a whole segment, not a prefix of the text');
  assert.equal(r('docs/public/x.md'), null);
  assert.equal(r('notes.txt.bak'), null);
  assert.equal(r('scratchpad/a'), null, 'a name is a whole segment');
  assert.equal(policy.policySkips('secrets', p), true, 'the folder itself, for the walk');
  assert.equal(policy.policySkips('src/a.mjs', p), false);
  // NFC/NFD: macOS stores names decomposed; the file is written composed
  assert.ok(policy.neverShipReason('relat\u00f3rio/a.pdf', policy.parsePolicy(P({ paths: ['relato\u0301rio'] }))), 'NFD in the JSON, NFC on disk');
  assert.ok(policy.neverShipReason('relato\u0301rio/a.pdf', policy.parsePolicy(P({ paths: ['relat\u00f3rio'] }))), 'NFC in the JSON, NFD on disk');
});

test('the policy only ADDS: the built-in rules answer the same with any policy', () => {
  const p = policy.parsePolicy(P({ names: ['x'], paths: ['y'] }));
  for (const rel of ['.env', 'a/.env.local', 'x/__pycache__/m.pyc', '.venv/bin/python', 'tool.pyc']) assert.equal(policy.neverShipReason(rel, p), policy.neverShipReason(rel), rel);
  assert.equal(policy.neverShipReason('.env.example', p), null);
});

test('loadPolicy: no file is the default, a bad file is an error, a folder is not a file', () => {
  const d = mkdtempSync(join(tmpdir(), 'chicla-d2a-'));
  try {
    assert.equal(policy.loadPolicy(d), policy.NO_POLICY, 'absent: the built-in default');
    writeFileSync(join(d, 'chicla.policy.json'), P({ names: ['dist'] }));
    assert.deepEqual([...policy.loadPolicy(d).names], ['dist']);
    writeFileSync(join(d, 'chicla.policy.json'), '{ nope');
    assert.equal(codeOf(() => policy.loadPolicy(d)), 'EPOLICY_PARSE');
    rmSync(join(d, 'chicla.policy.json')); mkdirSync(join(d, 'chicla.policy.json'));
    assert.equal(codeOf(() => policy.loadPolicy(d)), 'EPOLICY_READ', 'unreadable is NOT «absent»: failing open would leak');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// ---- check-manifest, in a copy of the scripts ----
const project = (files, polText) => {
  const d = mkdtempSync(join(tmpdir(), 'chicla-d2a-p-'));
  mkdirSync(join(d, 'scripts'));
  copyFiles(ROOT, d, CHECK_MANIFEST_COPY); // the wrapper, its core in the kit and the pinned files it reads
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), text); }
  if (polText !== undefined) writeFileSync(join(d, 'chicla.policy.json'), polText);
  return d;
};
const manifestOf = (d) => readFileSync(join(d, 'FILES.manifest'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[0]).filter((x) => !x.startsWith('scripts/') && !x.startsWith('packages/chicla-kit/src/pinned/') && x !== 'packages/chicla-kit/src/check-manifest.mjs' && x !== 'packages/chicla-kit/src/integrity.mjs').sort(); // the copied scripts are not the project under test
const FILES = { 'package.json': '{}', 'a.txt': 'a', 'secrets/k.key': 'K', 'x/scratch/s.txt': 's', 'x/keep.txt': 'k', 'dist/o.js': 'o', '.env': 'S=1' };

test('check-manifest --write: without a policy file the list is the built-in one', () => {
  const d = project(FILES);
  try {
    const r = spawnSync(process.execPath, [join(d, 'scripts/check-manifest.mjs'), '--write'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(manifestOf(d), ['a.txt', 'dist/o.js', 'package.json', 'secrets/k.key', 'x/keep.txt', 'x/scratch/s.txt']);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('check-manifest --write: the policy file keeps listed names and paths out, and is itself listed', () => {
  const d = project(FILES, P({ names: ['scratch', 'dist'], paths: ['secrets/'] }));
  try {
    const r = spawnSync(process.execPath, [join(d, 'scripts/check-manifest.mjs'), '--write'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(manifestOf(d), ['a.txt', 'chicla.policy.json', 'package.json', 'x/keep.txt']);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('check-manifest: a bad policy file stops both modes with its code and writes nothing', () => {
  const d = project(FILES, P({ remove: ['.env'] }));
  try {
    for (const args of [['--write'], []]) {
      const r = spawnSync(process.execPath, [join(d, 'scripts/check-manifest.mjs'), ...args], { encoding: 'utf8' });
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, /EPOLICY_FORMAT/);
    }
    assert.throws(() => readFileSync(join(d, 'FILES.manifest')), 'no manifest was written');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// ---- C6.1 slice d3 (D69): presets ----
test('presets: a fixed list of names each, expanded into `names`, and only ever added', () => {
  assert.deepEqual(Object.keys(policy.PRESETS).sort(), ['cargo', 'node', 'python']);
  assert.deepEqual([...policy.PRESETS.cargo], ['target']);
  assert.deepEqual([...policy.PRESETS.node].sort(), ['build', 'coverage', 'dist', '.turbo'].sort());
  assert.deepEqual([...policy.PRESETS.python].sort(), ['.eggs', '.mypy_cache', '.pytest_cache', '.ruff_cache', '.tox', 'build', 'dist']);
  for (const [name, list] of Object.entries(policy.PRESETS)) {
    for (const n of list) assert.equal(codeOf(() => policy.parsePolicy(P({ names: [n] }))), null, `${name}: ${n} is a valid name`);
    assert.ok(!list.includes('.env') && !list.includes('node_modules') && !list.includes('.git'), `${name}: nothing that is already built in, nothing that weakens it`);
  }
  const c = policy.parsePolicy(P({ presets: ['cargo'] }));
  assert.deepEqual([...c.names], ['target']);
  const both = policy.parsePolicy(P({ presets: ['node', 'python'], names: ['scratch'] }));
  assert.deepEqual([...both.names].sort(), ['.eggs', '.mypy_cache', '.pytest_cache', '.ruff_cache', '.tox', '.turbo', 'build', 'coverage', 'dist', 'scratch']);
  assert.deepEqual(policy.parsePolicy(P({ presets: [] })).names.size, 0);
  assert.deepEqual(policy.parsePolicy(P({ presets: ['cargo', 'cargo'] })).names.size, 1, 'a repeated preset is harmless');
  assert.deepEqual(policy.parsePolicy(P({ presets: ['cargo', 'cargo'] })).presets, ['cargo'], '...and listed once');
});

test('presets: what is refused, with a stable code', () => {
  const c = (o) => codeOf(() => policy.parsePolicy(P(o)));
  assert.equal(c({ presets: ['ruby'] }), 'EPOLICY_FORMAT', 'unknown preset');
  assert.equal(c({ presets: ['Cargo'] }), 'EPOLICY_FORMAT', 'names are exact');
  assert.equal(c({ presets: 'cargo' }), 'EPOLICY_FORMAT', 'not a list');
  assert.equal(c({ presets: [1] }), 'EPOLICY_FORMAT');
  assert.equal(c({ presets: ['__proto__'] }), 'EPOLICY_FORMAT', 'no prototype keys');
  assert.equal(c({ presets: ['constructor'] }), 'EPOLICY_FORMAT');
});

test('presets: a preset skips its names at any depth, the built-in rules answer the same, and NO_POLICY has none', () => {
  const p = policy.parsePolicy(P({ presets: ['cargo', 'node'] }));
  for (const rel of ['target/debug/x', 'crates/a/target/x', 'dist/o.js', 'a/b/build/x', 'coverage/lcov.info', '.turbo/c']) assert.ok(policy.neverShipReason(rel, p), rel);
  for (const rel of ['src/targets.rs', 'distro/a', 'a/rebuild/x']) assert.equal(policy.neverShipReason(rel, p), null, rel);
  assert.equal(policy.neverShipReason('.env', p), policy.neverShipReason('.env'));
  assert.equal(policy.neverShipReason('.env.example', p), null);
  assert.equal(policy.neverShipReason('target/x'), null, 'without the preset nothing is skipped');
  assert.deepEqual(policy.NO_POLICY.presets, []);
  assert.deepEqual(policy.parsePolicy(P({ presets: ['cargo'] })).presets, ['cargo'], 'the chosen presets are reported');
});

test('presets, end to end: check-manifest keeps a preset folder out', () => {
  const d = project({ 'package.json': '{}', 'a.txt': 'a', 'target/debug/x': 'x', 'crates/c/target/y': 'y', 'src/keep.rs': 'k' }, P({ presets: ['cargo'] }));
  try {
    const r = spawnSync(process.execPath, [join(d, 'scripts/check-manifest.mjs'), '--write'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(manifestOf(d), ['a.txt', 'chicla.policy.json', 'package.json', 'src/keep.rs']);
  } finally { rmSync(d, { recursive: true, force: true }); }
  const bad = project({ 'package.json': '{}' }, P({ presets: ['ruby'] }));
  try {
    const r = spawnSync(process.execPath, [join(bad, 'scripts/check-manifest.mjs'), '--write'], { encoding: 'utf8' });
    assert.equal(r.status, 1); assert.match(r.stderr, /EPOLICY_FORMAT/);
  } finally { rmSync(bad, { recursive: true, force: true }); }
});
