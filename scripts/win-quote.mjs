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

// C25.5: a bare command name (`npm`) stays bare. `npm.cmd` finds its own files through %~dp0; started as `"npm"` cmd.exe does not resolve the name through PATH and %~dp0 is the
// current folder, so the Windows leg of `tarball` ended `Cannot find module '<cwd>\node_modules\npm\bin\npm-prefix.js'` (CI of round 295; the cause is inferred from that path). A command with a
// path or a space is quoted: with a full path %~dp0 is right. Anything cmd.exe reads (& | < > ^ %) is not bare.
const BARE = /^[A-Za-z0-9_.-]+$/;
const quoteCmd = (cmd) => (BARE.test(String(cmd)) ? String(cmd) : quoteWin(cmd));

/** The command (bare when it is a plain name) and its arguments (always quoted) as one command line. */
export const winLine = (cmd, args = []) => [quoteCmd(cmd), ...args.map(quoteWin)].join(' ');
