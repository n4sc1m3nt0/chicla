// C11.5 slice c (D93 (a)): the navigable panel of the kit CLI, opened by `chicla` with NO arguments on an interactive terminal (cli.mjs decides: stdout and stdin are TTYs, `shouldStyle`).
// It only READS: the highest-numbered CHICLA_PROJECT_STATUS-N.md of the project and the newest chicla-round*.zip NEXT TO the project; it writes nothing. Zero dependencies (D3).
// Keys: → / Tab next page, ← previous, r re-read, q or Ctrl-C leave. Streams are injected by the caller (`stdin`, `stdout`), so tests never need a real TTY.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { box, paint, table, truncate } from "./ui.mjs";

export const PAGES = ["Status", "Gates", "Decisions", "Delivery"];
const clean = (s) => s.replace(/\*\*/g, "").replace(/`/g, "").trim();
const attempt = (f) => { try { return f(); } catch { return null; } };
const section = (text, head) => { const m = text.match(new RegExp(`^## ${head}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m")); return m ? m[1].trim() : null; };

/** Reads what the panel shows; every part that is missing or unreadable is null (or an empty list). Never writes, never throws. */
export function readPanelData(root) {
  const d = { root, statusFile: null, version: null, updated: null, next: null, gates: [], delivery: null };
  const names = attempt(() => readdirSync(root).filter((n) => /^CHICLA_PROJECT_STATUS-\d+\.md$/.test(n))) ?? [];
  d.statusFile = names.sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10)).pop() ?? null;
  const text = d.statusFile === null ? null : attempt(() => readFileSync(join(root, d.statusFile), "utf8"));
  if (text !== null) {
    const line = (re) => { const m = text.match(re); return m ? clean(m[0]) : null; };
    d.version = line(/^\*\*Current version:\*\*.*$/m); d.updated = line(/^\*\*Last updated \(round[^\n]*$/m);
    d.next = section(text, "Next up");
    const gates = section(text, "Gates") ?? "";
    d.gates = gates.split("\n").filter((l) => /^\| G-/.test(l)).map((l) => { const c = l.split("|").map((x) => x.trim()); return { id: c[1], state: clean(c.slice(3, -1).join(" | ")) }; });
  }
  const best = (attempt(() => readdirSync(dirname(root))) ?? []).filter((n) => /^chicla-round.*\.zip$/.test(n))
    .map((n) => ({ n, t: attempt(() => statSync(join(dirname(root), n)).mtimeMs) ?? 0 })).sort((a, b) => a.t - b.t || (a.n < b.n ? -1 : 1)).pop();
  d.delivery = best ? best.n : null;
  return d;
}

const wrap = (s, w) => { const out = []; let cur = ""; for (const word of String(s).split(/\s+/).filter(Boolean)) { if (cur && [...cur].length + 1 + [...word].length > w) { out.push(cur); cur = word; } else cur = cur ? `${cur} ${word}` : word; } return cur ? [...out, cur] : out; };

/** The screen for page `i` (0 to PAGES.length - 1) as one string; `width` columns, `on` = paint. */
export function renderPanel(d, i, { width = 80, on = false } = {}) {
  const w = Math.max(30, width), inner = w - 4;
  const bar = PAGES.map((p, k) => (k === i ? paint(`[${p}]`, "bold", on) : paint(` ${p} `, "dim", on))).join(" ");
  let lines;
  if (i === 0) lines = d.statusFile === null ? ["no status file (CHICLA_PROJECT_STATUS-<N>.md) in this folder"] : [d.statusFile, "", ...wrap(d.version ?? "no «Current version» line", inner), "", ...wrap(d.updated ?? "no «Last updated» entry", inner)];
  else if (i === 1) lines = d.gates.length ? table(["Gate", "State"], d.gates.map((g) => [g.id, truncate(g.state, Math.max(10, inner - 10))]), { on }).split("\n") : ["no gates found"];
  else if (i === 2) lines = d.next ? d.next.split("\n").flatMap((l) => (l.trim() ? wrap(clean(l), inner) : [""])) : ["no «Next up» section found"];
  else lines = [d.delivery ?? "no chicla-round*.zip next to the project"];
  return [bar, box(PAGES[i], lines, { width: w, on }), paint("←/→ or Tab: page   r: re-read   q: quit", "dim", on)].join("\n");
}

/** Runs the panel until `q`, Ctrl-C or the end of the input; always restores raw mode and the cursor. Resolves 0. */
export function runPanel({ stdin, stdout, root, env = {} }) {
  return new Promise((resolve) => {
    let data = readPanelData(root), page = 0;
    const width = Math.min(100, Number.isInteger(stdout.columns) && stdout.columns > 0 ? stdout.columns : 80);
    const draw = () => stdout.write(`\u001b[2J\u001b[H${renderPanel(data, page, { width, on: true })}\n`);
    const done = () => { stdin.removeListener("data", onData); stdin.removeListener("end", done); stdin.setRawMode?.(false); stdin.pause?.(); stdout.write("\u001b[?25h"); resolve(0); };
    const onData = (chunk) => {
      const k = String(chunk);
      if (k === "q" || k === "Q" || k === "\u0003") return done();
      if (k === "\u001b[C" || k === "\t" || k === "l") page = (page + 1) % PAGES.length;
      else if (k === "\u001b[D" || k === "h") page = (page + PAGES.length - 1) % PAGES.length;
      else if (k === "r") data = readPanelData(root);
      else return;
      draw();
    };
    stdout.write("\u001b[?25l"); stdin.setEncoding?.("utf8"); stdin.setRawMode?.(true); stdin.on("data", onData); stdin.on("end", done); stdin.resume?.(); draw();
  });
}
