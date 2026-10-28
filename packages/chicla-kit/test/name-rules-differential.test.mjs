// C17.3 (round 245, D140; plan in docs/plan-a1-integrity.md §5): the name rules of `check-manifest` (what its walk leaves out) and of `verify-delivery` (what it rejects in a zip) are tied to
// `pinned/policy.mjs` by a DIFFERENTIAL test over one corpus of names. The oracle is written here from the policy's own exports (`neverShipReason`, `isJunkName`, `SKIP_NAMES`), so it is a
// third reader: a new rule in `policy.mjs` that one tool does not follow turns a row red. Tests only: no source, the pin does not move. A difference between a tool and the oracle is never
// «fixed» here (a fix in `policy.mjs` moves the pin): it is listed in KNOWN_DIFF, named, and the test asserts it is still exactly that, so it can neither grow nor go away unnoticed.
// Round 246 (D-245a): the list is empty.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importPinned } from '../../../test/toolchain-files.mjs';
import { buildZip } from '../../chicla-zip/test/zipfab.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const P = await importPinned('policy');
const { parseManifest } = await importPinned('manifest');
const { checkManifest } = await imp('packages/chicla-kit/src/check-manifest.mjs');
const { verifyDelivery } = await imp('packages/chicla-kit/src/verify-delivery.mjs');

const POLICY_JSON = { version: 1, names: ['dist'], paths: ['secrets', 'docs/private'] };
const CORPUS = [
  '.env', '.env.local', '.env.example', '.env.sample', 'a/.env.production', 'envfile', '.environment', '.envrc',
  'id_rsa', 'id_rsa.pub', 'a/id_rsa_work', 'x.pem', 'Dir/KEY.PEM', '.npmrc', 'sub/.NETRC', '.git-credentials',
  'a/.ssh/x', '.aws/credentials',
  'app.pyc', 'a/app.pyc', '__pycache__/x.py', 'a/__pycache__/x', '.venv/lib/x', 'pyvenv.cfg',
  'node_modules/x/index.js', 'a/node_modules/x', '.git/config', 'a/.git/x', '.next/x', '__MACOSX/x',
  '.DS_Store', 'sub/.DS_Store', 'tsconfig.tsbuildinfo', 'sub/tsconfig.tsbuildinfo', 'app.tsbuildinfo',
  'README.md', 'src/a.mjs', 'LICENSE', 'docs/public/y.md', 'docs/private-not/x.md',
  'dist/out.js', 'a/dist/x', 'distribution.txt', 'secrets/k.txt', 'a/secrets/k.txt', 'docs/private/x.md', 'docs/private',
].filter((n) => n !== 'docs/private'); // a file and a folder of one name cannot both exist: the folder case is `docs/private/x.md`

/** The oracle: what must NOT ship, from the policy exports alone. */
const policy = P.parsePolicy(JSON.stringify(POLICY_JSON));
const oracleLeavesOut = (rel) => {
  const parts = rel.split('/');
  return P.neverShipReason(rel, policy) !== null || P.isJunkName(parts.at(-1)) || parts.some((s) => P.SKIP_NAMES.has(s));
};
/** Differences between a tool and the oracle that exist TODAY. Each needs Rodrigo's decision (it is a rule in the pinned `policy.mjs` or a regex in a tool). */
// D-245a (Rodrigo, round 246: «sim») closed the one difference found in round 245 (`app.tsbuildinfo`): both tools now follow `isJunkName` for every `*.tsbuildinfo`. Nothing is known to differ today;
// a future difference goes here, named, with the decision that is waiting for it.
const KNOWN_DIFF = { checkManifest: {}, verifyDelivery: {} };

const T = mkdtempSync(join(tmpdir(), 'chicla-c173-'));
after(() => rmSync(T, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));

// ---- check-manifest: one project with every corpus file, `--write`, then read what the manifest lists ----
const proj = join(T, 'proj');
mkdirSync(proj, { recursive: true });
writeFileSync(join(proj, 'chicla.policy.json'), JSON.stringify(POLICY_JSON));
for (const rel of CORPUS) { mkdirSync(dirname(join(proj, rel)), { recursive: true }); writeFileSync(join(proj, rel), 'plain text\n'); }
const wrote = checkManifest({ root: proj, write: true });
const listed = new Set(parseManifest(readFileSync(join(proj, 'FILES.manifest'), 'utf8')).map((e) => e.path));

// ---- verify-delivery: a zip per name (one file, nothing else), and the name must appear in a problem only if a name rule fired ----
const verifyRejects = (rel, i) => {
  const zip = join(T, `z${i}.zip`);
  writeFileSync(zip, buildZip([{ name: rel, data: 'plain text\n' }]));
  const r = verifyDelivery({ zip, root: proj });
  return r.problems.some((p) => p.includes(rel) && (p.includes('NEVER leave') || p.includes('junk inside')));
};

test('the corpus run itself is sound: check-manifest wrote a manifest and the project policy was loaded', () => {
  assert.equal(wrote.code, null, JSON.stringify(wrote.messages));
  assert.ok(listed.has('README.md') && listed.has('src/a.mjs'), 'the plain names are listed');
  assert.ok(CORPUS.length >= 45);
});

test('check-manifest leaves out exactly what the oracle (policy.mjs exports) says, apart from the named differences', () => {
  const diff = CORPUS.filter((rel) => oracleLeavesOut(rel) === listed.has(rel));
  assert.deepEqual(Object.fromEntries(diff.map((r) => [r, listed.has(r) ? 'listed but the oracle leaves it out' : 'left out but the oracle ships it'])), KNOWN_DIFF.checkManifest);
});

test('verify-delivery rejects exactly what the oracle says, apart from the named differences', () => {
  const diff = CORPUS.filter((rel, i) => oracleLeavesOut(rel) !== verifyRejects(rel, i));
  assert.deepEqual(Object.fromEntries(diff.map((r) => [r, verifyRejects(r, CORPUS.indexOf(r)) ? 'rejected but the oracle ships it' : 'accepted but the oracle leaves it out'])), KNOWN_DIFF.verifyDelivery);
});

test('the two tools agree with each other on every name, except where a named difference says otherwise', () => {
  const split = CORPUS.filter((rel, i) => listed.has(rel) === verifyRejects(rel, i));
  // listed (shipped) and rejected (must not ship) are opposite verdicts: they agree when exactly one is true
  assert.deepEqual(split.filter((r) => !(r in KNOWN_DIFF.checkManifest) && !(r in KNOWN_DIFF.verifyDelivery)), []);
});

test('a rule added to policy.mjs reaches both tools: a policy name (any depth) and a policy path (from the root only) are followed by the walk and by the zip check alike', () => {
  for (const rel of ['dist/out.js', 'a/dist/x', 'secrets/k.txt', 'docs/private/x.md']) {
    assert.equal(listed.has(rel), false, `check-manifest ${rel}`);
    assert.equal(verifyRejects(rel, 900 + CORPUS.indexOf(rel)), true, `verify-delivery ${rel}`);
  }
  for (const rel of ['distribution.txt', 'a/secrets/k.txt', 'docs/private-not/x.md', 'docs/public/y.md', '.env.example']) {
    assert.equal(listed.has(rel), true, `check-manifest ${rel}`);
    assert.equal(verifyRejects(rel, 900 + CORPUS.indexOf(rel)), false, `verify-delivery ${rel}`);
  }
});
