// C11.1 slice 6a-0 (round 128, D91): test/toolchain-files.mjs is the only list of the recovery toolchain used by the tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DUMP_COPY, PINNED, TOOLCHAIN_SOURCES, ZIPKIT } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HERE = dirname(fileURLToPath(import.meta.url));

test('the helper lists the five RECOVER names and every file exists', () => {
  assert.deepEqual(Object.keys(TOOLCHAIN_SOURCES), ['baseline.mjs', 'manifest.mjs', 'policy.mjs', 'recovery-report.mjs', 'zipkit.mjs']);
  for (const src of Object.values(TOOLCHAIN_SOURCES)) assert.ok(existsSync(join(ROOT, src)), src);
  for (const src of DUMP_COPY) assert.ok(existsSync(join(ROOT, src)), src);
  assert.equal(Object.keys(PINNED).length, 4);
  assert.equal(TOOLCHAIN_SOURCES['zipkit.mjs'], ZIPKIT);
});

test('a fake project for the dump gets every file the dump carries in RECOVER/', () => {
  for (const src of Object.values(TOOLCHAIN_SOURCES)) assert.ok(DUMP_COPY.includes(src), src);
});

test('no test keeps its own copy of the toolchain list or of the RECOVER name map', () => {
  const copyList = "'scripts/manifest.mjs', 'scripts/baseline.mjs', 'scripts/policy.mjs', 'scripts/recovery-report.mjs'";
  const nameMap = "'baseline.mjs': 'scripts/baseline.mjs'";
  const nameMapRecover = "'RECOVER/baseline.mjs': 'scripts/baseline.mjs'";
  const own = readdirSync(HERE).filter((f) => f.endsWith('.test.mjs') && f !== 'toolchain-files.test.mjs')
    .filter((f) => { const s = readFileSync(join(HERE, f), 'utf8'); return s.includes(copyList) || s.includes(nameMap) || s.includes(nameMapRecover); });
  assert.deepEqual(own, []);
});

// 6a-0b: the rest of the tests. A test (or smoke script) never writes the path of a pinned file: it asks the helper, so a move touches the helper only.
test('no test or smoke script names the path of a pinned file (they ask test/toolchain-files.mjs)', () => {
  const dirs = [HERE, ...readdirSync(join(ROOT, 'packages')).map((p) => join(ROOT, 'packages', p, 'test')).filter((d) => existsSync(d)), join(ROOT, 'scripts')];
  const files = dirs.flatMap((d) => readdirSync(d).filter((f) => (d.endsWith('scripts') ? /^smoke-test-.*\.mjs$/.test(f) : f.endsWith('.test.mjs'))).map((f) => join(d, f)))
    .filter((f) => f !== join(HERE, 'toolchain-files.test.mjs'));
  const bare = /['"`](baseline|manifest|policy|recovery-report)\.mjs['"`]/g; // 'policy.mjs' in a copy list; RECOVER/ names (dump side) are not paths
  const offenders = [];
  for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    if (/^\s*\/\//.test(l)) return; // a comment is prose, not a path the code uses
    const names = l.match(bare) || [];
    if (/scripts\/(baseline|manifest|policy|recovery-report)\.mjs/.test(l) || (!/RECOVER/.test(l) && (names.length > 1 || (names.length === 1 && /['"`]scripts['"`]/.test(l))))) offenders.push(`${f.slice(ROOT.length + 1)}:${i + 1}`);
  });
  assert.deepEqual(offenders, []);
});

test('the helper builds paths, imports and copy sets from the same map', async () => {
  const { pinnedPath, pinnedFile, importPinned, CHECK_MANIFEST_COPY, VERIFY_DELIVERY_COPY, CHECK_BUILD_COPY } = await import('./toolchain-files.mjs');
  assert.equal(pinnedPath('policy'), PINNED.policy);
  assert.equal(pinnedFile('/x', 'manifest'), join('/x', PINNED.manifest));
  assert.throws(() => pinnedPath('check-manifest'), /not a pinned file/);
  assert.equal(typeof (await importPinned('manifest')).parseManifest, 'function');
  for (const f of [...CHECK_MANIFEST_COPY, ...VERIFY_DELIVERY_COPY, ...CHECK_BUILD_COPY]) assert.ok(existsSync(join(ROOT, f)), f);
  assert.ok(CHECK_MANIFEST_COPY.includes(PINNED.manifest) && CHECK_MANIFEST_COPY.includes(PINNED.policy));
  assert.ok(VERIFY_DELIVERY_COPY.includes(PINNED.baseline));
});
