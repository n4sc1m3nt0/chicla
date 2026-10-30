#!/usr/bin/env node
// build-chicla: assemble the single package `chicla` (D148, C23.2) into <out>/chicla. It copies the metadata of packages/chicla (package.json, README.md, LICENSE),
// the kit's src/ and templates/, and the zip module as src/zipkit.mjs, beside zipkit-loader.mjs (which looks there first, C23.1), and once more as src/pinned/zipkit.mjs, beside the pinned recovery-report.mjs (C24.1). Nothing is converted: every
// file is a byte-for-byte copy, and zipkit.mjs is checked against its source (it is one of the five pinned files of the dump). Then pack the stage:
//   node scripts/build-chicla.mjs --out stage && node scripts/pack-release.mjs stage/chicla --out dist
// It never publishes (CLAUDE.md product rule 4). Exit 0 ok, 1 refused, 2 usage. With --json stdout is exactly one line.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const done = (code, obj, text) => { process.stdout.write(json ? JSON.stringify(obj) + '\n' : text.endsWith('\n') ? text : text + '\n'); process.exit(code); };
const usage = (m) => done(2, { ok: false, error: { code: 'EUSAGE', message: m } }, `✗ ${m}\nusage: build-chicla.mjs --out <dir> [--json]`);
const refuse = (code, m) => done(1, { ok: false, error: { code, message: m } }, `✗ ${code}: ${m}`);

let out;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') continue;
  if (a === '--out') { out = argv[++i]; if (!out) usage('--out needs a value'); }
  else usage(`unknown argument ${a}`);
}
if (!out) usage('no --out');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const meta = join(root, 'packages', 'chicla');
const kit = join(root, 'packages', 'chicla-kit');
const zipSrc = join(root, 'packages', 'chicla-zip', 'src', 'zipkit.mjs');
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const count = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(join(d, e.name)) : 1), 0);

for (const f of [join(meta, 'package.json'), join(meta, 'README.md'), join(meta, 'LICENSE'), join(kit, 'src', 'cli.mjs'), join(kit, 'src', 'zipkit-loader.mjs'), join(kit, 'templates'), zipSrc]) {
  if (!existsSync(f)) refuse('EMISSING', `${f.slice(root.length + 1)} is not in the tree`);
}
if (existsSync(join(kit, 'src', 'zipkit.mjs'))) refuse('ECONFLICT', 'packages/chicla-kit/src/zipkit.mjs exists: the zip module would be shipped twice');

out = resolve(out);
const stage = join(out, 'chicla');
if (existsSync(stage)) refuse('EEXISTS', `${stage} already exists; nothing was written (remove it, or use another --out)`);

// Built beside the final name and renamed at the end, so a failure leaves no half package.
const work = join(out, `.chicla-build-${process.pid}`);
process.on('exit', () => rmSync(work, { recursive: true, force: true }));
mkdirSync(work, { recursive: true });
for (const f of ['package.json', 'README.md', 'LICENSE']) copyFileSync(join(meta, f), join(work, f));
cpSync(join(kit, 'src'), join(work, 'src'), { recursive: true });
cpSync(join(kit, 'templates'), join(work, 'templates'), { recursive: true });
copyFileSync(zipSrc, join(work, 'src', 'zipkit.mjs'));
if (sha(join(work, 'src', 'zipkit.mjs')) !== sha(zipSrc)) refuse('EHASH', 'zipkit.mjs changed while being copied');
// C24.1 (AUDIT-8 F-1): the pinned recovery-report.mjs looks for zipkit.mjs beside itself (the layout of RECOVER/) and otherwise in ../../../chicla-zip (the monorepo);
// in the package neither exists, so `chicla recovery` died with ERR_MODULE_NOT_FOUND. The same bytes go beside it, in the built package only: no pinned file is edited.
const pinnedZip = join(work, 'src', 'pinned', 'zipkit.mjs');
if (!existsSync(join(work, 'src', 'pinned'))) refuse('EMISSING', 'src/pinned/ is not in the kit: nothing to put the zip module beside');
copyFileSync(zipSrc, pinnedZip);
if (sha(pinnedZip) !== sha(zipSrc)) refuse('EHASH', 'src/pinned/zipkit.mjs changed while being copied');
renameSync(work, stage);

const pkg = JSON.parse(readFileSync(join(stage, 'package.json'), 'utf8'));
const files = count(stage);
done(0, { ok: true, name: pkg.name, version: pkg.version, stage, files, zipkitSha256: sha(join(stage, 'src', 'zipkit.mjs')) }, `✓ ${pkg.name} ${pkg.version} assembled in ${stage} (${files} files; src/zipkit.mjs sha256 ${sha(join(stage, 'src', 'zipkit.mjs')).slice(0, 12)}…)\nnext: node scripts/pack-release.mjs ${join(stage)} --out <dist>`);
