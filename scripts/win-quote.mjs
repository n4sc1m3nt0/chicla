// C25.1 (AUDIT-9 F-1, F-5): quoting for the Windows shell. `spawnSync(cmd, args, { shell: true })` joins the arguments with spaces and quotes nothing (and Node 24 deprecates
// the form, DEP0190), so a path with a space splits. These two functions build ONE command line with every part in double quotes; the caller then passes a string and no array.
// Pure: no process, no platform test, so it runs on any system.
const bad = (m) => Object.assign(new Error(m), { code: 'EQUOTE' });

/** One part of a command line for cmd.exe, in double quotes. A double quote or a line break cannot be quoted safely: refused, never guessed. */
export function quoteWin(part) {
  const s = String(part);
  if (/["\r\n]/.test(s)) throw bad('an argument with a double quote or a line break cannot be quoted for cmd.exe');
  return `"${s}"`;
}

/** The command and its arguments as one quoted command line. */
export const winLine = (cmd, args = []) => [cmd, ...args].map(quoteWin).join(' ');
