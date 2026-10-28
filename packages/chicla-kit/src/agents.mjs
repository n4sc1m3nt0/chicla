// C12.5: the agent matrix. An agent enters only when the file it reads was confirmed in a source. Round 167 used a survey; on 2026-10-22 (round 231, gate G-C15, closed
// by Rodrigo) the four entries and Cursor and Windsurf were read on the vendors' own pages (code.claude.com, learn.chatgpt.com, geminicli.com, docs.github.com, cursor.com, docs.devin.ai).
// `default: true` = `chicla init` writes the file for everybody; the others are added by `chicla init --agent <name>`. Cursor and Windsurf read AGENTS.md as well, so they need no entry of their own.
export const AGENTS = {
  claude: { file: "CLAUDE.md", template: "CLAUDE.md", default: true },
  codex: { file: "AGENTS.md", template: "AGENTS.md", default: true },
  gemini: { file: "GEMINI.md", template: "GEMINI.md", default: false },
  copilot: { file: ".github/copilot-instructions.md", template: "copilot-instructions.md", default: false },
};

/** @param {string[]} names @returns {{ ok: true, agents: string[] } | { ok: false, code: "EAGENT", name: string, message: string }} names are exact (no case folding); the result is deduplicated, in matrix order */
export function resolveAgents(names) {
  for (const n of names) if (!Object.hasOwn(AGENTS, n)) return { ok: false, code: "EAGENT", name: n, message: `unknown agent «${String(n).slice(0, 40)}» (known: ${Object.keys(AGENTS).join(", ")})` };
  return { ok: true, agents: Object.keys(AGENTS).filter((k) => names.includes(k)) };
}
