// R0 / C0.1 + C0.2 + C0.3 — o layout do repositório cumpre o roadmap (D3, D4, D13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const has = (p) => existsSync(join(root, p));
const isDir = (p) => has(p) && statSync(join(root, p)).isDirectory();
const node = (...args) => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });

const SCRIPTS = [
  'archive-changelog', 'bump-round', 'check-build', 'check-manifest', 'emergency-dump',
  'make-delivery-zip', 'mutants', 'recovery-report', 'verify-delivery-zip',
  'smoke-test-archive-changelog', 'smoke-test-bump-round', 'smoke-test-check-build',
  'smoke-test-delivery-guards', 'smoke-test-emergency', 'smoke-test-mutants',
];

test('raiz: monorepo privado, ESM, Node 18+, versão da app (D13)', () => {
  const pkg = json('package.json');
  assert.equal(pkg.private, true);
  assert.deepEqual(pkg.workspaces, ['packages/*']);
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.engines.node, '>=18');
  assert.equal(pkg.scripts.test, 'node --test');
  assert.ok(pkg.scripts.smoke, 'falta o script "smoke"');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
});

for (const name of ['chicla-zip', 'chicla-kit']) {
  test(`${name}: package válido, versionado à parte, sem dependências de terceiros (D3, D4)`, () => {
    const dir = `packages/${name}`;
    const pkg = json(`${dir}/package.json`);
    assert.equal(pkg.name, name);
    assert.equal(pkg.version, '0.1.0'); // chicla-zip is at its release version since round 163, the kit since round 229; neither is published until Rodrigo does it
    assert.equal(pkg.type, 'module');
    assert.equal(pkg.engines.node, '>=18');
    assert.deepEqual(pkg.dependencies, name === 'chicla-kit' ? { 'chicla-zip': '^0.1.0' } : undefined); // C13.5: the kit reaches chicla-zip by name, the only dependency, and it is ours (D3)
    assert.equal(pkg.devDependencies, undefined);
    assert.ok(isDir(`${dir}/src`), 'falta src/');
    assert.ok(isDir(`${dir}/test`), 'falta test/');
  });
}

test('chicla-kit tem a pasta templates/', () => {
  assert.ok(isDir('packages/chicla-kit/templates'));
});

test('C0.3: ficheiros de arranque na raiz, com exatamente 1 ficheiro de estado', () => {
  for (const f of ['CLAUDE.md', 'CHANGELOG.md', 'ROADMAP.md', 'FILES.manifest', 'version.mjs']) {
    assert.ok(has(f), `falta ${f} na raiz`);
  }
  const status = readdirSync(root).filter((f) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(f));
  assert.equal(status.length, 1, `há ${status.length} ficheiros de estado`);
  assert.equal(has('docs/CLAUDE.md'), false, 'docs/CLAUDE.md devia ter passado para a raiz');
});

test('C0.2: os scripts do workflow estão no repositório', () => {
  for (const s of SCRIPTS) assert.ok(has(`scripts/${s}.mjs`), `falta scripts/${s}.mjs`);
});

test('C0.2: nenhum script refere o projeto de origem nem exige Cargo.toml na raiz', () => {
  for (const s of SCRIPTS) {
    const src = read(`scripts/${s}.mjs`);
    assert.doesNotMatch(src, /CEDAR|cedar/i, `${s} ainda refere o projeto de origem`);
    assert.doesNotMatch(src, /set\.has\("Cargo\.toml"\)|cargoToml/, `${s} ainda exige Cargo.toml`);
  }
});

test('C0.2: os fingerprints coincidem (bump-round --verify)', () => {
  const r = node('scripts/bump-round.mjs', '--verify');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('C0.2: nenhum ficheiro perdido face ao FILES.manifest (check-manifest)', () => {
  const r = node('scripts/check-manifest.mjs');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('C0.2: check-build verifica a sintaxe de todos os .mjs', () => {
  const r = node('scripts/check-build.mjs');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /node --check/);
});

test('C0.1: CI com Node 18/20/22 em Linux e macOS e com as guardas do workflow', () => {
  const ci = read('.github/workflows/ci.yml');
  for (const v of ['18', '20', '22']) assert.match(ci, new RegExp(`\\b${v}\\b`));
  assert.match(ci, /ubuntu-latest/);
  assert.match(ci, /macos-latest/);
  assert.match(ci, /npm test/);
  assert.match(ci, /check-manifest\.mjs/);
  assert.match(ci, /bump-round\.mjs --verify/);
  assert.match(ci, /npm run smoke/);
});
