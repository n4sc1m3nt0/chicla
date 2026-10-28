// C19.2→C19.3 (round 259, AUDIT-6 F-3): the ONE way a root test reads the status file for a name (a card, an audit, a decision, a round).
// Those names live in lines that `archive-changelog.mjs --status`, `--snapshot` and `--rolling` move, verbatim, to docs/status-archive-*.md; a test that greps the live file
// alone goes red in the round that archives its line (round 252: `plan-a1-docs`). `statusWithArchives` is the live file plus every archive, so it cannot.
// A test that needs the STRUCTURE of the live file (how many blocks it keeps, the Instructions block) reads `statusText` and says why in `test/status-reads.test.mjs`.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATUS_RE = /^CHICLA_PROJECT_STATUS-(\d+)\.md$/;

/** The newest status file name in `root` (highest number), or undefined. */
export const statusName = (root = HERE) => readdirSync(root).filter((f) => STATUS_RE.test(f)).sort((a, b) => a.match(STATUS_RE)[1] - b.match(STATUS_RE)[1]).pop();
/** The live status file, as text. */
export const statusText = (root = HERE) => readFileSync(join(root, statusName(root)), 'utf8');
/** The names of the verbatim archives of the status file (`docs/status-archive-*.md`), relative to `root`. */
export const statusArchives = (root = HERE) => (existsSync(join(root, 'docs')) ? readdirSync(join(root, 'docs')).filter((f) => /^status-archive-.*\.md$/.test(f)).sort().map((f) => `docs/${f}`) : []);
/** The live status file followed by every archive of it: what to grep for a card, audit, decision or round name. */
export const statusWithArchives = (root = HERE) => [statusText(root), ...statusArchives(root).map((f) => readFileSync(join(root, f), 'utf8'))].join('\n');
