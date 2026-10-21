// C12.5 + C12.6 (round 167): the agent matrix and `chicla init --agent <name>`. The matrix holds only the agents whose instruction file was read in a source
// on 2026-10-17 (a third-party survey of each tool's documentation: NOT the vendors' own pages, so G-C15 is Rodrigo's). `--agent` ADDS the file of that
// agent to the default set (CLAUDE.md, AGENTS.md and the state files); it never overwrites and is all or nothing. Tests assert codes and files, never message text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(join(KIT, f)).href);
const agents = await imp('src/agents.mjs').catch(() => ({}));
const { initProject } = await imp('src/init.mjs');
const { main } = await imp('src/cli.mjs');
const { bumpRound } = await imp('src/bump-round.mjs');
const { checkManifest, renderCheckManifest } = await imp('src/check-manifest.mjs');
const tpl = (n) => readFileSync(join(KIT, 'templates', n), 'utf8');
const regen = (root) => { const m = checkManifest({ root, write: true }); return { ok: m.ok, ...renderCheckManifest(m) }; };
const T = () => mkdtempSync(join(tmpdir(), 'chicla-agent-'));
const done = (d) => rmSync(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 });
const run = async (args, cwd) => { let out = '', err = ''; const status = await main(args, { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, cwd }); return { status, out, err }; };
const tree = (d, p = '') => readdirSync(join(d, p), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? [`${p}${e.name}/`, ...tree(d, `${p}${e.name}/`)] : [`${p}${e.name}`]).sort();

test('matrix: exactly the four confirmed agents, each with the file it reads, and the file is where the agent looks', () => {
  assert.deepEqual(Object.keys(agents.AGENTS ?? {}).sort(), ['claude', 'codex', 'copilot', 'gemini']);
  assert.deepEqual(Object.fromEntries(Object.entries(agents.AGENTS ?? {}).map(([k, v]) => [k, v.file])), { claude: 'CLAUDE.md', codex: 'AGENTS.md', gemini: 'GEMINI.md', copilot: '.github/copilot-instructions.md' });
  for (const [k, v] of Object.entries(agents.AGENTS ?? {})) assert.ok(existsSync(join(KIT, 'templates', v.template)), `${k}: template ${v.template}`);
});

test('resolveAgents: known names give their files (deduplicated, in the order of the matrix), an unknown one is EAGENT and names it', () => {
  assert.deepEqual(agents.resolveAgents(['gemini', 'copilot', 'gemini']), { ok: true, agents: ['gemini', 'copilot'] });
  assert.deepEqual(agents.resolveAgents([]), { ok: true, agents: [] });
  const bad = agents.resolveAgents(['gemini', 'vim']);
  assert.equal(bad.ok, false); assert.equal(bad.code, 'EAGENT'); assert.equal(bad.name, 'vim');
  assert.equal(agents.resolveAgents(['Gemini']).code, 'EAGENT', 'names are exact: no case folding');
});

test('core: --agent gemini and copilot add exactly their two files to the six; byte for byte the templates; the folder .github is created', () => {
  const d = T();
  try {
    const r = initProject({ root: d, agents: ['gemini', 'copilot'] });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(tree(d), ['.github/', '.github/copilot-instructions.md', 'AGENTS.md', 'CHANGELOG.md', 'CHICLA_PROJECT_STATUS-1.md', 'CLAUDE.md', 'FILES.manifest', 'GEMINI.md', 'version.mjs']);
    assert.equal(readFileSync(join(d, 'GEMINI.md'), 'utf8'), tpl('GEMINI.md'));
    assert.equal(readFileSync(join(d, '.github/copilot-instructions.md'), 'utf8'), tpl('copilot-instructions.md'));
    assert.ok(r.created.includes('GEMINI.md') && r.created.includes('.github/copilot-instructions.md'));
  } finally { done(d); }
});

test('core: the project is usable at once: bump-round --verify and check-manifest pass, the manifest lists the agent files, a round closes', () => {
  const d = T();
  try {
    assert.equal(initProject({ root: d, agents: ['gemini', 'copilot'] }).ok, true);
    const v = bumpRound({ root: d, mode: 'verify', regenerateManifest: regen }); assert.equal(v.ok, true, JSON.stringify(v));
    const m = checkManifest({ root: d, write: false }); assert.equal(m.ok, true, JSON.stringify(m));
    const list = readFileSync(join(d, 'FILES.manifest'), 'utf8');
    assert.ok(list.includes('GEMINI.md') && list.includes('.github/copilot-instructions.md'));
    const b = bumpRound({ root: d, mode: 'bump', regenerateManifest: regen }); assert.equal(b.ok, true, JSON.stringify(b));
  } finally { done(d); }
});

test('core: claude and codex are accepted and add nothing (their files are in the default set); no agent is the same as before', () => {
  const a = T(), b = T(), c = T();
  try {
    assert.equal(initProject({ root: a, agents: ['claude', 'codex'] }).ok, true);
    assert.equal(initProject({ root: b }).ok, true);
    assert.equal(initProject({ root: c, agents: [] }).ok, true);
    assert.deepEqual(tree(a), tree(b)); assert.deepEqual(tree(c), tree(b));
    assert.ok(!tree(a).includes('GEMINI.md'));
  } finally { done(a); done(b); done(c); }
});

test('core: an unknown agent is EAGENT and nothing is written (not even the default files)', () => {
  const d = T();
  try {
    const r = initProject({ root: d, agents: ['gemini', 'vim'] });
    assert.equal(r.ok, false); assert.equal(r.code, 'EAGENT');
    assert.deepEqual(tree(d), []);
  } finally { done(d); }
});

test('core: an existing agent file refuses the whole run (EEXIST) and writes nothing; an existing .github with other files is fine and is kept', () => {
  const d = T(), e = T();
  try {
    writeFileSync(join(d, 'GEMINI.md'), 'mine\n');
    const r = initProject({ root: d, agents: ['gemini'] });
    assert.equal(r.ok, false); assert.equal(r.code, 'EEXIST'); assert.ok(r.existing.includes('GEMINI.md'));
    assert.deepEqual(tree(d), ['GEMINI.md']); assert.equal(readFileSync(join(d, 'GEMINI.md'), 'utf8'), 'mine\n');
    mkdirSync(join(e, '.github/workflows'), { recursive: true }); writeFileSync(join(e, '.github/workflows/ci.yml'), 'x\n');
    assert.equal(initProject({ root: e, agents: ['copilot'] }).ok, true);
    assert.equal(readFileSync(join(e, '.github/workflows/ci.yml'), 'utf8'), 'x\n');
    assert.ok(existsSync(join(e, '.github/copilot-instructions.md')));
  } finally { done(d); done(e); }
});

test('core: a copilot-instructions.md that exists already refuses the run, and a failure after .github was created removes .github again', () => {
  const d = T(), e = T(), tpls = T();
  try {
    mkdirSync(join(d, '.github')); writeFileSync(join(d, '.github/copilot-instructions.md'), 'mine\n');
    const r = initProject({ root: d, agents: ['copilot'] });
    assert.equal(r.code, 'EEXIST'); assert.deepEqual(tree(d), ['.github/', '.github/copilot-instructions.md']);
    for (const f of readdirSync(join(KIT, 'templates'))) if (f !== 'copilot-instructions.md') writeFileSync(join(tpls, f), tpl(f)); // the template of the agent is missing: the run fails after the default files
    const w = initProject({ root: e, agents: ['copilot'], templates: pathToFileURL(tpls + '/') });
    assert.equal(w.ok, false); assert.equal(w.code, 'EWRITE');
    assert.deepEqual(tree(e), [], 'the folder is as it was, .github included');
  } finally { done(d); done(e); done(tpls); }
});

test('templates: the agent files carry the same rules as AGENTS.md (one body), name only commands that exist and say what was not run', () => {
  const body = (s) => s.slice(s.indexOf('\n'));
  const cli = readFileSync(join(KIT, 'src/cli.mjs'), 'utf8');
  const names = new Set([...cli.match(/const CORES = \{([^}]*)\}/)[1].matchAll(/(?:"([a-z-]+)"|\b([a-z]+)):/g)].map((m) => m[1] || m[2]));
  for (const f of ['GEMINI.md', 'copilot-instructions.md']) {
    const s = tpl(f);
    assert.equal(body(s), body(tpl('AGENTS.md')), `${f}: the rules are written once, in AGENTS.md; this body must be the same`);
    assert.notEqual(s.split('\n')[0], tpl('AGENTS.md').split('\n')[0], `${f}: its own title`);
    for (const m of s.matchAll(/`chicla ([a-z-]+)/g)) assert.ok(names.has(m[1]), `${f} names «chicla ${m[1]}»`);
    for (const must of ['chicla bump-round --verify', 'chicla dump', '/dump', '.env', 'node_modules', 'CHICLA_PROJECT_STATUS']) assert.ok(s.includes(must), `${f} lacks «${must}»`);
    assert.match(s, /did not run/i);
  }
});

test('cli: `chicla init --agent gemini --agent copilot --root <dir>` creates them (0); the project passes bump-round --verify; --json lists the files', async () => {
  const d = T(), e = T();
  try {
    const r = await run(['init', '--agent', 'gemini', '--agent', 'copilot', '--root', d], d);
    assert.equal(r.status, 0, r.err); assert.ok(existsSync(join(d, 'GEMINI.md')) && existsSync(join(d, '.github/copilot-instructions.md')));
    assert.equal((await run(['bump-round', '--verify', '--root', d], d)).status, 0);
    const j = await run(['init', '--agent', 'gemini', '--json', '--root', e], e); const o = JSON.parse(j.out);
    assert.equal(o.ok, true); assert.ok(o.created.includes('GEMINI.md'));
  } finally { done(d); done(e); }
});

test('cli: an unknown agent is a usage error (2) with code EAGENT and writes nothing; --agent with no value, or on another command, is usage (2)', async () => {
  const d = T();
  try {
    const r = await run(['init', '--agent', 'vim', '--json', '--root', d], d);
    assert.equal(r.status, 2); assert.equal(JSON.parse(r.out).code, 'EAGENT'); assert.deepEqual(tree(d), []);
    assert.equal((await run(['init', '--agent', '--root', d], d)).status, 2);
    assert.equal((await run(['init', '--agent'], d)).status, 2);
    assert.equal((await run(['check-manifest', '--agent', 'gemini', '--root', d], d)).status, 2);
    assert.deepEqual(tree(d), []);
  } finally { done(d); }
});

test('cli: --help and the README name --agent and the four agents with their files', async () => {
  const h = (await run(['--help'], process.cwd())).out;
  assert.match(h, /--agent <name>/);
  const readme = readFileSync(join(KIT, 'README.md'), 'utf8');
  for (const [k, v] of Object.entries(agents.AGENTS ?? {})) { assert.ok(h.includes(k) || readme.includes(k), `${k} in help or README`); assert.ok(readme.includes(v.file), `README names ${v.file}`); }
  assert.match(readme, /--agent/);
});
