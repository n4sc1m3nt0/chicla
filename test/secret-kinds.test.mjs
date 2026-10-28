// Round 239 (C16.5, AUDIT-4 S-5): the content detector learns five more kinds: Slack, Stripe, Google API key, Anthropic and OpenAI keys.
// One positive and one false-positive family per kind; the kind, never the match, is what is printed. Written before the code; red until it exists.
// The samples are built by concatenation so that this very file, being part of the project, is not caught by its own detector.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_MANIFEST_COPY, copyFiles, importPinned } from './toolchain-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = await importPinned('policy');
const j = (...p) => p.join('');
const buf = (s) => Buffer.from(s, 'utf8');
const mix = 'aB3dE5gH7j';

const SLACK = j('xox', 'b-', '123456789012', '-', '1234567890123', '-', 'AbCdEfGhIjKlMnOpQrStUvWx');
const SLACK_OLD = j('xox', 'p-', '1234567890', '-', '1234567890', '-', '1234567890', '-', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');
const STRIPE = j('sk_', 'live_', 'a1B2c3D4'.repeat(3));
const STRIPE_R = j('rk_', 'live_', 'a1B2c3D4'.repeat(3));
const GOOGLE = j('AIza', 'Sy', 'A1b2C3d4'.repeat(4), '_');
const ANT = j('sk-', 'ant-', 'api03-', 'aB1_'.repeat(8));
const OAI = j('sk-', mix.repeat(5));
const OAI_PROJ = j('sk-', 'proj-', 'aB1_-d'.repeat(20));
const POSITIVE = {
  'Slack token': [SLACK, SLACK_OLD, j('xox', 'a-', '2-', '1234567890123456789012345'), j('xox', 'r-', '1234567890123456789012345'), j('xox', 's-', '1234567890123456789012345')],
  'Stripe key': [STRIPE, STRIPE_R, j('sk_', 'live_', 'A1'.repeat(50))],
  'Google API key': [GOOGLE, j('AIza', 'Sy', 'A1b2C3d4'.repeat(4), '-')],
  'Anthropic API key': [ANT],
  'OpenAI API key': [OAI, OAI_PROJ],
};
const NEGATIVE = {
  'Slack token': { doc: j('xox', 'b-', 'your-token-here'), allX: j('xox', 'b-', 'x'.repeat(40)), short: j('xox', 'b-', '12345678'), z: j('xox', 'z-', '1234567890123456789012345678'), glued: j('a', SLACK), prose: 'Slack bot tokens start with xoxb- and user tokens with xoxp-' },
  'Stripe key': { test: j('sk_', 'test_', 'a1B2c3D4'.repeat(3)), short: j('sk_', 'live_', 'a'.repeat(23)), glued: j('x', STRIPE), publishable: j('pk_', 'live_', 'a1B2c3D4'.repeat(3)), prose: 'Stripe live keys start with sk_live_ and rk_live_' },
  'Google API key': { short: j('AIza', 'Sy', 'A1b2C3d4'.repeat(4)), long: GOOGLE + 'x', glued: j('x', GOOGLE), lower: j('ai', 'za', 'Sy', 'A1b2C3d4'.repeat(4), '_'), prose: 'Google API keys start with AIza and are 39 characters long' },
  'Anthropic API key': { short: j('sk-', 'ant-', 'a'.repeat(31)), glued: j('x', ANT), prose: 'Anthropic keys start with sk-ant- and are long' },
  'OpenAI API key': { learn: 'sk-learn is the old name of scikit-learn', noDigit: j('sk-', 'aBcDeFgHiJ'.repeat(5)), noUpper: j('sk-', 'a1b2c3d4e5'.repeat(5)), css: 'sk-fading-circle-loader-spinner-animation-keyframes-wrapper', glued: j('ri', OAI), short: j('sk-', mix.repeat(3)), underscored: j('x_', OAI) },
};

test('detectSecret: each new shape gives its kind, alone, in a line and quoted, and only the kind', () => {
  for (const [kind, samples] of Object.entries(POSITIVE)) for (const s of samples) for (const text of [s, `x=${s}\n`, `# note\n${s}\nmore\n`, `"${s}"`]) assert.equal(policy.detectSecret(buf(text)), kind, `${kind}: ${text.slice(0, 14)}…`);
});

test('detectSecret: the Anthropic key is the Anthropic kind, not the OpenAI one (order), and the OpenAI project key is OpenAI', () => {
  assert.equal(policy.detectSecret(buf(ANT)), 'Anthropic API key');
  assert.equal(policy.detectSecret(buf(OAI_PROJ)), 'OpenAI API key');
});

test('detectSecret: shapes that are NOT secrets (placeholders, length, boundary, test keys, public keys, prose, CSS names)', () => {
  for (const [kind, cases] of Object.entries(NEGATIVE)) for (const [name, text] of Object.entries(cases)) assert.equal(policy.detectSecret(buf(text)), null, `${kind} / ${name}`);
});

test('the old four kinds are unchanged (the new regexes do not steal their samples)', () => {
  const old = { 'private key': j('-----BEGIN ', 'PRIVATE KEY', '-----'), 'AWS access key': j('AKIA', 'IOSFODNN7EXAMPLE'), 'GitHub token': j('ghp_', 'a1B2'.repeat(9)), 'npm token': j('npm_', 'c3D4'.repeat(9)) };
  for (const [kind, s] of Object.entries(old)) assert.equal(policy.detectSecret(buf(s)), kind);
});

test('hostile input of 1 MiB does not make the scan slow (no regex that backtracks badly); run in a child with a time limit, so a hang is a failure and not a stuck suite', () => {
  const child = `
    import { pathToFileURL } from 'node:url';
    const { detectSecret } = await import(pathToFileURL(process.argv[1]).href);
    const MIB = 1048576, j = (...p) => p.join('');
    const attacks = [j('sk-', '').repeat(Math.floor(MIB / 3)), j('sk-', 'A'.repeat(MIB - 3)), ' sk-aB'.repeat(Math.floor(MIB / 6)), j('xox', 'b-').repeat(Math.floor(MIB / 5)), j('xox', 'b-', '-'.repeat(MIB - 5)),
      j('xox', 'b-', 'x').repeat(Math.floor(MIB / 6)), j('sk_', 'live_').repeat(Math.floor(MIB / 8)), 'AIza'.repeat(MIB / 4), j('sk-', 'ant-').repeat(Math.floor(MIB / 7)), 'sk-'.concat('a1'.repeat(MIB / 4))];
    const t0 = Date.now();
    for (const a of attacks) detectSecret(Buffer.from(a.slice(0, MIB), 'latin1'));
    console.log(Date.now() - t0);`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', child, join(ROOT, 'packages/chicla-kit/src/pinned/policy.mjs')], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, `the scan did not finish in 30 s (${r.signal || r.stderr.slice(0, 200)})`);
  assert.ok(Number(r.stdout) < 5000, `took ${r.stdout.trim()} ms`);
});

const T0 = () => mkdtempSync(join(tmpdir(), 'chicla-c165-'));
test('check-manifest --write: a file with each new kind is left out, named with its kind, and the match is never printed', () => {
  const d = T0();
  try {
    mkdirSync(join(d, 'scripts')); copyFiles(ROOT, d, CHECK_MANIFEST_COPY);
    const files = { 'package.json': '{}', 'keep.txt': 'ordinary prose about sk-learn and xoxb- and AIza\n' };
    const held = { 'slack.env.txt': [SLACK, 'Slack token'], 'pay/stripe.js': [STRIPE, 'Stripe key'], 'cfg/maps.ini': [GOOGLE, 'Google API key'], 'a/ant.txt': [ANT, 'Anthropic API key'], 'b/oai.txt': [OAI, 'OpenAI API key'] };
    for (const [rel, [s]] of Object.entries(held)) files[rel] = `k = ${s}\n`;
    for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), text); }
    const r = spawnSync(process.execPath, [join(d, 'scripts/check-manifest.mjs'), '--write'], { encoding: 'utf8' });
    const out = r.stdout + r.stderr;
    const manifest = readFileSync(join(d, 'FILES.manifest'), 'utf8');
    assert.ok(manifest.includes('keep.txt'), 'the control stays');
    for (const [rel, [s, kind]] of Object.entries(held)) {
      assert.ok(!manifest.includes(rel), `${rel} is out of the manifest`);
      assert.ok(out.includes(rel) && out.includes(kind), `${rel} is named with «${kind}»: ${out.slice(0, 300)}`);
      assert.ok(!out.includes(s.slice(6)), `the match of ${kind} is never printed`);
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});
