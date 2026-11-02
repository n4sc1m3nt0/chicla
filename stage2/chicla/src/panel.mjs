// C11.5 slice c (D93 (a)): the navigable panel of the kit CLI, opened by `chicla` with NO arguments on an interactive terminal (cli.mjs decides: stdout and stdin are TTYs, `shouldStyle`).
// It only READS: the highest-numbered CHICLA_PROJECT_STATUS-N.md of the project and the newest chicla-round*.zip NEXT TO the project; it writes nothing. Zero dependencies (D3).
// Keys: → / Tab next page, ← previous, r re-read, q or Ctrl-C leave. Streams are injected by the caller (`stdin`, `stdout`), so tests never need a real TTY.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { box, pad, paint, table, truncate } from "./ui.mjs";

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

// Round 224 (panel polish): the colour of a gate state, read from the first word of the project's own text; unknown wording stays unpainted.
const tone = (state) => (/^(closed|done)\b/i.test(state) ? "green" : /^(open|proposed|waiting)\b/i.test(state) ? "yellow" : /^(red|failed|blocked)\b/i.test(state) ? "red" : null);
const LABEL = 9;
/** `Label    text`, the text wrapped under itself (not under the label); the label is dim when `on`. */
const field = (label, text, inner, on) => wrap(text, inner - LABEL).map((l, k) => (k === 0 ? paint(pad(label, LABEL), "dim", on) : " ".repeat(LABEL)) + l);
const gateSummary = (gates, on) => {
  if (!gates.length) return "none";
  const n = (t) => gates.filter((g) => tone(g.state) === t).length, closed = n("green"), open = n("yellow"), other = gates.length - closed - open;
  return [paint(`${closed} closed`, "green", on), paint(`${open} open`, "yellow", on), ...(other ? [`${other} other`] : [])].join(", ");
};
const statusLines = (d, inner, on) => {
  if (d.statusFile === null) return ["no status file (CHICLA_PROJECT_STATUS-<N>.md) in this folder"];
  const ver = d.version?.match(/Current version:\s*(\S+)/), upd = d.updated?.match(/^Last updated \(round ([^)]*)\):\s*(\d{4}-\d{2}-\d{2})\.?\s*(.*)$/);
  return [...field("File", d.statusFile, inner, on), ...field("Version", ver ? ver[1] : d.version ?? "no «Current version» line", inner, on),
    ...(upd ? [...field("Round", upd[1], inner, on), ...field("Updated", upd[2], inner, on)] : []), paint(pad("Gates", LABEL), "dim", on) + gateSummary(d.gates, on), "",
    ...field("Latest", upd ? upd[3] || "(no text)" : d.updated ?? "no «Last updated» entry", inner, on)];
};

// Round 228 (the Decisions page): the «Open decisions» paragraph of «Next up» is one long line with each round in parentheses. It is read by SHAPE, not by wording: a depth-1 group that starts with «round N:» or «earlier…:» is an entry,
// everything else stays text. The newest entry is shown whole, the older ones as one line each («…» when cut); «**Rodrigo's to do:**» becomes a labelled bullet list (items split at «; »). Nothing is dropped except the older entries' tails.
const ENTRY = /^\s*(round\s+[\w.]+|earlier[^:]{0,20}):\s*/i, TODO = /\*\*Rodrigo's to do:?\*\*:?/;
/** Splits at «; » outside parentheses only, so a bullet never breaks inside a bracketed remark. */
const splitTop = (s) => { const out = []; let depth = 0, cur = ""; for (let i = 0; i < s.length; i++) { const ch = s[i]; if (ch === "(") depth++; else if (ch === ")" && depth > 0) depth--; if (ch === ";" && depth === 0 && s[i + 1] === " ") { out.push(cur.trim()); cur = ""; i++; } else cur += ch; } out.push(cur.trim()); return out; };
const decisionBlocks = (raw) => {
  const body = raw.replace(/^\s*\*\*Open decisions:?\*\*:?\s*/i, ""), out = []; let depth = 0, cur = "", plain = "";
  const flush = () => { if (plain.trim()) out.push({ head: null, text: plain.trim() }); plain = ""; };
  for (const ch of body) {
    if (ch === "(") { if (depth > 0) cur += ch; else cur = ""; depth++; }
    else if (ch === ")" && depth > 0) {
      depth--;
      if (depth > 0) cur += ch;
      else { const m = cur.match(ENTRY); if (m) { flush(); out.push({ head: m[1][0].toUpperCase() + m[1].slice(1), text: cur.slice(m[0].length) }); } else plain += `(${cur})`; cur = ""; }
    } else if (depth > 0) cur += ch; else plain += ch;
  }
  if (depth > 0) { const m = cur.match(ENTRY); if (m) { flush(); out.push({ head: m[1][0].toUpperCase() + m[1].slice(1), text: cur.slice(m[0].length) }); } else plain += `(${cur}`; } // a group that never closes (the real file has one) still counts as an entry
  flush();
  return out;
};
const decisionLines = (raw, inner, on) => {
  const blocks = decisionBlocks(raw), heads = blocks.some((b) => b.head), lines = [paint("Open decisions", "bold", on), ""];
  let seen = false, old = false;
  for (const b of blocks) {
    if (b.head && seen) { // an older entry: one line
      if (!old) lines.push(paint("Older entries, shortened (full text in the status file):", "dim", on)); old = true;
      lines.push(paint(truncate(clean(`${b.head}: ${b.text}`), inner), "dim", on)); continue;
    }
    if (old) lines.push(""); old = false; if (b.head) seen = true;
    const [notes, ...todo] = b.text.split(TODO), items = splitTop(clean(todo.join(" "))).filter(Boolean);
    if (b.head || heads) lines.push(paint(b.head ?? "Note", "bold", on));
    const ind = b.head || heads ? "  " : "";
    const said = clean(notes).replace(/[;\s]+$/, ""); if (said) lines.push(...wrap(said, inner - ind.length).map((l) => ind + l));
    if (items.length) { lines.push(`${ind}${paint("To do", "yellow", on)}`); for (const it of items) lines.push(...wrap(it, inner - ind.length - 2).map((l, k) => `${ind}${k === 0 ? "• " : "  "}${l}`)); }
    lines.push("");
  }
  if (!blocks.length) lines.push("no open decisions listed");
  while (lines.at(-1) === "") lines.pop();
  return lines;
};
const nextLines = (next, inner, on) => next.split("\n").flatMap((l) => (!l.trim() ? [""] : /^\s*\*\*Open decisions/i.test(l) ? decisionLines(l, inner, on) : wrap(clean(l), inner)));

// Rounds 225 and 226: the footer keys are white LETTERS (no background; the label after each stays dim); the plain text is unchanged.
const KEYS = [["←/→", " or "], ["Tab", ": page   "], ["r", ": re-read   "], ["q", ": quit"]];
const keys = (on) => KEYS.map(([k, t]) => paint(k, "white", on) + paint(t, "dim", on)).join("");

/** The screen for page `i` (0 to PAGES.length - 1) as one string; `width` columns, `on` = paint. */
export function renderPanel(d, i, { width = 80, on = false } = {}) {
  const w = Math.max(30, width), inner = w - 4;
  const bar = PAGES.map((p, k) => (k === i ? paint(`[${p}]`, "blue", on) : paint(` ${p} `, "dim", on))).join(" "); // the active tab: bold blue letters, no background (round 226)
  let lines;
  if (i === 0) lines = statusLines(d, inner, on);
  else if (i === 1) lines = d.gates.length ? table(["Gate", "State"], d.gates.map((g) => { const t = truncate(g.state, Math.max(10, inner - 10)), c = tone(g.state); return [g.id, c ? paint(t, c, on) : t]; }), { on }).split("\n") : ["no gates found"];
  else if (i === 2) lines = d.next ? nextLines(d.next, inner, on) : ["no «Next up» section found"];
  else lines = d.delivery ? field("Zip", d.delivery, inner, on) : ["no chicla-round*.zip next to the project"];
  return [bar, box(PAGES[i], lines, { width: w, on }), keys(on)].join("\n");
}

/** Runs the panel until `q`, Ctrl-C or the end of the input; always restores raw mode, the cursor and the main screen (it runs in the alternate screen, so pages never reach the scrollback). Resolves 0. */
export function runPanel({ stdin, stdout, root, env = {} }) {
  return new Promise((resolve) => {
    let data = readPanelData(root), page = 0;
    const width = Math.min(100, Number.isInteger(stdout.columns) && stdout.columns > 0 ? stdout.columns : 80);
    const draw = () => stdout.write(`\u001b[2J\u001b[H${renderPanel(data, page, { width, on: true })}\n`);
    const done = () => { stdin.removeListener("data", onData); stdin.removeListener("end", done); stdin.setRawMode?.(false); stdin.pause?.(); stdout.write("\u001b[?25h\u001b[?1049l"); resolve(0); };
    const onData = (chunk) => {
      const k = String(chunk);
      if (k === "q" || k === "Q" || k === "\u0003") return done();
      if (k === "\u001b[C" || k === "\t" || k === "l") page = (page + 1) % PAGES.length;
      else if (k === "\u001b[D" || k === "h") page = (page + PAGES.length - 1) % PAGES.length;
      else if (k === "r") data = readPanelData(root);
      else return;
      draw();
    };
    stdout.write("\u001b[?1049h\u001b[?25l"); stdin.setEncoding?.("utf8"); stdin.setRawMode?.(true); stdin.on("data", onData); stdin.on("end", done); stdin.resume?.(); draw();
  });
}
