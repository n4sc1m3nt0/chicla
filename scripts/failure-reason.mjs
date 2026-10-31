// C25.4: what to print when a command failed. The first line of a Node stack is `node:internal/modules/cjs/loader:1433`, a file and a line, not a reason (the Windows leg of the
// `tarball` job, CI of round 294). This picks the first line that says what failed (`Error: …`, an `ERR_…` or `MODULE_NOT_FOUND` code, «Cannot find module», an `npm error` line);
// with none, the first five non-empty lines, so nothing is lost. Pure: it reads no process and no platform, so it runs on any system.
const SAYS_WHAT = /(\w*Error\b\s*[:[])|ERR_[A-Z0-9_]+|MODULE_NOT_FOUND|Cannot find module|^npm (error|ERR!)/;
const MAX = 400;

/** @param {unknown} text stderr (or stdout) of the failed command @returns {string} one line, at most 400 characters */
export function failureReason(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return 'no output';
  const hit = lines.find((l) => SAYS_WHAT.test(l));
  const out = hit ?? lines.slice(0, 5).join(' | ');
  return out.length > MAX ? `${out.slice(0, MAX - 1)}…` : out;
}
