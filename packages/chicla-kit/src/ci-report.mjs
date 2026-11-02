// C27.3 (round 307, D154): `chicla ci-report <logs.zip>` reads the zip of a GitHub Actions run («Download log archive») and says, per job, which tests failed and what the first error was.
//
//   chicla ci-report <logs.zip> [--json]     exit 0: no job failed; 1: a job failed, or the zip cannot be read; 2: usage
//
// The work is `ciReport({ zip, maxBytes })`, which never prints, exits or throws (as the other cores). The zip is hostile input: it is read in memory with the kit's own zip reader,
// never extracted; a name is only a label; a log above `maxBytes` (default 64 MiB) is not read and the job is listed as `unreadable` (a warning, not a verdict).
// Layout read: one combined log per job at the top, `<n>_<job>.txt`; if there are none, the per-step files `<job>/<n>_<step>.txt` are joined by job.
// Per line: the timestamp and colour codes are dropped; `not ok N - name` at the start of a line is a failing test (node --test, TAP); `# tests`, `# pass`, `# fail` are added up over
// the suites of the job; the first error is the first line of the `error:` block of the first failing test, else the first `##[error]` line. A job `failed` if it has a failing test,
// a `# fail` above 0 or an `##[error]` line.
import { loadZipkit } from "./zipkit-loader.mjs";

const MAX_BYTES = 64 * 1024 * 1024, MAX_LOGS = 5000;
const clean = (l) => l.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, "").replace(/\u001b\[[0-9;]*m/g, "").replace(/\r$/, "");

function parseLog(text) {
  const ls = text.split("\n").map(clean);
  const failing = []; let tests = null, pass = null, fail = null, errLine = null, testErr = null, firstFailAt = -1;
  const add = (cur, v) => (cur === null ? v : cur + v);
  ls.forEach((l, i) => {
    let m = /^not ok \d+ - (.*)$/.exec(l);
    if (m) { if (firstFailAt < 0) firstFailAt = i; const name = m[1].trim(); if (!failing.includes(name)) failing.push(name); return; }
    m = /^# (tests|pass|fail) (\d+)$/.exec(l);
    if (m) { const v = Number(m[2]); if (m[1] === "tests") tests = add(tests, v); else if (m[1] === "pass") pass = add(pass, v); else fail = add(fail, v); return; }
    m = /^##\[error\](.*)$/.exec(l);
    if (m && errLine === null) errLine = m[1].trim();
  });
  if (firstFailAt >= 0) { // the `error:` block of the first failing test: its inline text, or the first non-empty line under `error: |-`
    for (let i = firstFailAt + 1; i < Math.min(ls.length, firstFailAt + 60); i++) {
      if (/^not ok \d+ - /.test(ls[i])) break;
      const m = /^\s+error:\s*(.*)$/.exec(ls[i]);
      if (!m) continue;
      const inline = m[1].replace(/^\|[-+]?$/, "").trim();
      if (inline) testErr = inline; else for (let k = i + 1; k < Math.min(ls.length, i + 8); k++) if (ls[k].trim()) { testErr = ls[k].trim(); break; }
      break;
    }
  }
  return { failing, tests, pass, fail, firstError: testErr ?? errLine, failed: failing.length > 0 || (fail ?? 0) > 0 || errLine !== null };
}

/** Reads the logs zip. Returns { ok, code, zip, jobs: [{ name, failed, tests, pass, fail, failing, firstError, unreadable }], messages }. Never prints, exits or throws. */
export async function ciReport({ zip, maxBytes = MAX_BYTES } = {}) {
  const messages = [], say = (stream, text) => messages.push({ stream, text });
  const result = { ok: true, code: null, zip, jobs: [], messages };
  const stop = (code, text) => { say("err", `✗ ${code}: ${text}`); result.ok = false; result.code = code; return result; };
  let z;
  try {
    const { openZip } = await loadZipkit();
    z = openZip(zip);
    const names = z.entries.filter((e) => !e.isDir && /\.txt$/i.test(e.name)).map((e) => e.name).slice(0, MAX_LOGS);
    const num = (s) => Number(/(?:^|\/)(\d+)_/.exec(s)?.[1] ?? Infinity);
    const top = names.filter((s) => !s.includes("/") && /^\d+_.+\.txt$/i.test(s));
    const groups = new Map(); // job -> [file names]
    if (top.length) for (const s of top) groups.set(/^\d+_(.+)\.txt$/i.exec(s)[1], [s]);
    else for (const s of names) { const i = s.indexOf("/"); if (i > 0) groups.set(s.slice(0, i), [...(groups.get(s.slice(0, i)) ?? []), s]); }
    for (const [name, files] of [...groups].sort((a, b) => num(a[1][0]) - num(b[1][0]))) {
      let text = "", bad = false;
      for (const f of files.sort((a, b) => num(a) - num(b))) {
        try { text += z.read(f, { maxBytes }).toString("utf8") + "\n"; } catch { bad = true; break; }
      }
      result.jobs.push(bad ? { name, failed: false, unreadable: true, failing: [], tests: null, pass: null, fail: null, firstError: null } : { name, unreadable: false, ...parseLog(text) });
    }
  } catch (e) { return stop("ECIREPORT_ZIP", `cannot read ${String(zip).slice(0, 200)} as a zip (${e?.code ?? e?.message ?? "error"})`); }
  finally { try { z?.close(); } catch { /* nothing to do */ } }

  if (!result.jobs.length) return stop("ECIREPORT_EMPTY", "the zip has no job log (expected «<n>_<job>.txt» files or one folder per job)");
  for (const j of result.jobs) if (j.unreadable) say("err", `⚠ ${j.name}: a log is above ${maxBytes} bytes or cannot be read; this job was not judged`);
  const bad = result.jobs.filter((j) => j.failed);
  for (const j of bad) {
    const counts = j.tests === null ? "" : ` (${j.fail ?? 0} failed of ${j.tests} tests)`;
    say("err", `✗ ${j.name}${counts}${j.firstError ? `\n    first error: ${j.firstError}` : ""}${j.failing.length ? `\n    failing:\n${j.failing.slice(0, 15).map((f) => `      ${f}`).join("\n")}${j.failing.length > 15 ? `\n      … and ${j.failing.length - 15} more` : ""}` : ""}`);
  }
  if (bad.length) { result.ok = false; result.code = "ECIREPORT_FAILED"; say("err", `✗ ECIREPORT_FAILED: ${bad.length} of ${result.jobs.length} job(s) failed`); }
  else say("out", `✓ no failing job (${result.jobs.length} job(s) read)`);
  return result;
}

/** The text the command prints for a result, per stream. */
export function renderCiReport(result) {
  const text = (stream) => result.messages.filter((m) => m.stream === stream).map((m) => `${m.text}\n`).join("");
  return { out: text("out"), err: text("err") };
}
