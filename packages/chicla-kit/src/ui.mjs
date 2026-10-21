// C11.5 slice a (D93): the drawing functions of the kit CLI. PURE: data in, text out; no imports, no process, no I/O, no dependencies (D3).
// A caller decides WHETHER to style (`shouldStyle`, from the stream and the environment it already holds) and passes `on`; with `on` false nothing here emits an escape code.
// Slice b (D93) wires `styleSummary` into the human output of the commands; slice c adds the navigable panel. `--json`, pipes, CI and NO_COLOR keep today's plain text.

const CODES = { bold: "1", dim: "2", red: "31", green: "32", yellow: "33", cyan: "36", blue: "1;94", white: "1;97" };
const ANSI = /\u001b\[[0-9;]*m/g;

/** Style only on an interactive terminal: a TTY, not --json, not CI, no NO_COLOR (an empty one does not count), not TERM=dumb. */
export function shouldStyle({ isTTY = false, env = {}, json = false } = {}) {
  if (!isTTY || json) return false;
  if (env.CI || env.NO_COLOR || env.TERM === "dumb") return false;
  return true;
}

export const stripAnsi = (s) => String(s).replace(ANSI, "");
/** Visible width: characters, not escape codes. */
export const width = (s) => [...stripAnsi(s)].length;

/** `paint("x", "green", on)`: the text unchanged when `on` is false. */
export function paint(text, style, on = false) {
  const code = CODES[style];
  if (code === undefined) throw new Error(`unknown style «${String(style).slice(0, 20)}»`);
  return on ? `\u001b[${code}m${text}\u001b[0m` : String(text);
}

/** Pad to `n` visible characters (never cuts). */
export function pad(s, n, align = "left") {
  const gap = Math.max(0, n - width(s));
  return align === "right" ? " ".repeat(gap) + s : s + " ".repeat(gap);
}

/** Cut a plain string to `n` characters, ending in «…» when it was cut. */
export function truncate(s, n) {
  const chars = [...String(s)];
  if (chars.length <= n) return chars.join("");
  return n <= 0 ? "" : chars.slice(0, n - 1).join("") + "…";
}

/** A box `width` characters wide: the title in the top edge, one padded line per entry (long lines are cut with «…», counting visible characters only). */
export function box(title, lines, { width: w = 60, on = false } = {}) {
  const t = truncate(title, Math.max(0, w - 6));
  const head = `┌─ ${paint(t, "bold", on)} ${"─".repeat(Math.max(0, w - width(t) - 5))}┐`;
  const body = lines.map((l) => `│ ${pad(width(l) <= w - 4 ? l : truncate(stripAnsi(l), w - 4), w - 4)} │`); // a painted line that fits keeps its codes; one that is too long is cut on its visible text (round 224)
  return [head, ...body, `└${"─".repeat(w - 2)}┘`].join("\n");
}

/** Aligned columns: a header, a rule, then the rows; `align` is one of "left" | "right" per column. The last left-aligned column is not padded. */
export function table(header, rows, { on = false, align = [] } = {}) {
  const cells = rows.map((r) => r.map(String));
  const w = header.map((h, i) => Math.max(width(h), ...cells.map((r) => width(r[i] ?? ""))));
  const line = (r, f) => r.map((c, i) => (i === r.length - 1 && align[i] !== "right" ? f(c) : pad(f(c), w[i], align[i]))).join("  ");
  return [line(header, (c) => paint(c, "bold", on)), paint(w.map((n) => "-".repeat(n)).join("  "), "dim", on), ...cells.map((r) => line(r, (c) => c))].join("\n");
}

/** A bar of `w` cells for a ratio clamped to 0..1 (NaN is 0). */
export function bar(ratio, w = 20) {
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  const full = Math.round(r * w);
  return "█".repeat(full) + "░".repeat(w - full);
}

export const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
/** The frame for step `i` (cycles, also for negative or huge values). */
export const spinnerFrame = (i) => SPINNER[((Math.trunc(i) % SPINNER.length) + SPINNER.length) % SPINNER.length];

const MARKS = { "✓": "green", "✗": "red", "⚠": "yellow" };
/** Slice b (D93 (b)): paint only the mark (✓ ✗ ⚠) that opens a summary line (after spaces, followed by a space); nothing else, so lists of files are never touched. With `on` false the text is returned unchanged. Stripping the codes always gives the input back. */
export function styleSummary(text, on = false) {
  if (!on) return text;
  return String(text).split("\n").map((l) => l.replace(/^( *)([✓✗⚠])(?= )/, (_, sp, m) => sp + paint(m, MARKS[m], true))).join("\n");
}
