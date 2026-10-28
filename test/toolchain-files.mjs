// C11.1 slice 6a-0 (round 128, D91): the ONE place where the tests learn which files make up the recovery toolchain and what a fake project needs.
// Paths are relative to the project root, with forward slashes. When the four pinned files move into packages/chicla-kit/src/pinned/ (slices 6a-1 to 6c),
// only this file changes; the tests that copy or import them do not.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The project root (this file lives in <root>/test/). */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The four pinned files (CLAUDE.md pin; RECOVER/ carries them under their base name). */
export const PINNED = {
  baseline: 'packages/chicla-kit/src/pinned/baseline.mjs',
  manifest: 'packages/chicla-kit/src/pinned/manifest.mjs',
  policy: 'packages/chicla-kit/src/pinned/policy.mjs',
  'recovery-report': 'packages/chicla-kit/src/pinned/recovery-report.mjs',
};
/** The re-export shims of slices 6a that slice 6c deleted: they must not come back (test/pinned-shims-gone.test.mjs). */
export const REMOVED_SHIMS = { baseline: 'scripts/baseline.mjs', manifest: 'scripts/manifest.mjs', policy: 'scripts/policy.mjs' };
/** Wrappers in scripts/ that a fake project needs next to their pinned core (the kit CLI loads `scripts/recovery-report.mjs`). */
export const WRAPPERS = ['scripts/recovery-report.mjs'];
export const ZIPKIT = 'packages/chicla-zip/src/zipkit.mjs';

/** RECOVER/ name -> source path: the five files a dump carries and the pin hashes (sorted by name, as sha256sum prints them). */
export const TOOLCHAIN_SOURCES = {
  'baseline.mjs': PINNED.baseline,
  'manifest.mjs': PINNED.manifest,
  'policy.mjs': PINNED.policy,
  'recovery-report.mjs': PINNED['recovery-report'],
  'zipkit.mjs': ZIPKIT,
};

/** C13.5: how the kit reaches chicla-zip (by name, then by the monorepo path); `emergency-dump` and `make-delivery` import it. */
export const LOADER = 'packages/chicla-kit/src/zipkit-loader.mjs';

/** What a fake project needs to run `emergency-dump` (the wrapper, its core, the pinned files and zipkit). */
export const DUMP_COPY = [
  'scripts/emergency-dump.mjs',
  'packages/chicla-kit/src/emergency-dump.mjs',
  LOADER,
  PINNED.manifest,
  PINNED.baseline,
  PINNED.policy,
  PINNED['recovery-report'],
  ...WRAPPERS,
  ZIPKIT,
];

/** Copy `files` (project-relative paths) from `fromRoot` to `toRoot`, creating folders; `omit` skips paths. */
export function copyFiles(fromRoot, toRoot, files, { omit = [] } = {}) {
  for (const f of files) {
    if (omit.includes(f)) continue;
    mkdirSync(dirname(join(toRoot, f)), { recursive: true });
    copyFileSync(join(fromRoot, f), join(toRoot, f));
  }
}

/** Project-relative path of a pinned file: `pinnedPath('manifest')`. */
export const pinnedPath = (name) => {
  if (!(name in PINNED)) throw new Error(`not a pinned file: ${name}`);
  return PINNED[name];
};
/** Absolute path of a pinned file under `root`. */
export const pinnedFile = (root, name) => join(root, pinnedPath(name));
/** `import()` of a pinned file under `root` (default: this project), so a test never names the folder. */
export const importPinned = (name, root = ROOT) => import(pathToFileURL(pinnedFile(root, name)).href);

// What a fake project needs to run each wrapper (the wrapper, its core in the kit, and the pinned files the core reads).
// C17.1: `integrity.mjs` (the shared LF rule and status-file regex) is a sibling that check-manifest and bump-round import; it is not pinned.
export const INTEGRITY = 'packages/chicla-kit/src/integrity.mjs';
const WRAP = (name, ...pinned) => [`scripts/${name}.mjs`, `packages/chicla-kit/src/${name}.mjs`, ...pinned.map(pinnedPath)];
export const CHECK_BUILD_COPY = WRAP('check-build');
export const CHECK_MANIFEST_COPY = [...WRAP('check-manifest', 'manifest', 'policy'), INTEGRITY];
export const BUMP_ROUND_COPY = ['scripts/bump-round.mjs', 'packages/chicla-kit/src/bump-round.mjs', INTEGRITY];
export const VERIFY_DELIVERY_COPY = ['scripts/verify-delivery-zip.mjs', 'packages/chicla-kit/src/verify-delivery.mjs', ...['baseline', 'manifest', 'policy'].map(pinnedPath)];

/** The import specifier a source file (project-relative path) uses to reach `target` (project-relative path), e.g. specFrom(core, PINNED.manifest). */
export const specFrom = (fromFile, target) => {
  const r = relative(dirname(fromFile), target).split(sep).join('/');
  return r.startsWith('.') ? r : `./${r}`;
};
/** The specifier a source file uses for a pinned file, by relative path. */
export const pinnedSpec = (fromFile, name) => specFrom(fromFile, pinnedPath(name));
