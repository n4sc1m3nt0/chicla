import { renderPanel } from "/tmp/w/packages/chicla-kit/src/panel.mjs";
const d = { root: ".", prefix: "CHICLA", statusFile: "CHICLA_PROJECT_STATUS-307.md", version: "Current version: v1", updated: null, next: null, gates: [], delivery: null };
console.log(renderPanel(d, 0, { width: 80, on: false }));
