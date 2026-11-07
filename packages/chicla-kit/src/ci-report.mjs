// C27.3 (round 307, D154): `chicla ci-report <logs.zip>` reads the zip of a GitHub Actions run («Download log archive») and says, per job, which tests failed and what the first error was.
//
//   chicla ci-report <logs.zip> [--allow <text>]... [--json]     exit 0: no job failed and every job was judged; 1: a job failed, something was not judged (C29.3), or the zip cannot be read; 2: usage
//
// The work is `ciReport({ zip, maxBytes })`, which never prints, exits or throws (as the other cores). The zip is hostile input: it is read in memory with the kit's own zip reader,
// never extracted; a name is only a label; a log above `maxBytes` (default 64 MiB) is not read and the job is listed as `unreadable`: it was NOT JUDGED (C29.3, D-317a: that makes the run not ok, it is no longer «✓»).
// Layout read: one combined log per job at the top, `<n>_<job>.txt`; if there are none, the per-step files `<job>/<n>_<step>.txt` are joined by job.
// Per line: the timestamp and colour codes are dropped; `not ok N - name` at the start of a line is a failing test (node --test, TAP); `# tests`, `# pass`, `# fail` are added up over
// the suites of the job; the first error is the first line of the `error:` block of the first failing test, else the first `##[error]` line. A job `failed` if it has a failing test,
// a `# fail` above 0 or an `##[error]` line.
// C28.3 (AUDIT-10 F-2, D-310b): `--allow <text>` (repeatable) names jobs that MAY fail, such as the Windows leg of `tarball` (`continue-on-error`: reported, not promised). A job whose name
// contains the text (case-sensitive, a part of the name) gets `allowed: true`; if it failed it is still read and printed (name, first error, failing tests) but it does not count and does
// not change the exit code. An entry with a `.` or `..` segment in its name is no log: it is not read and never becomes a job label (C28.4). `failed` keeps the raw verdict. A typo or a wrong case matches nothing, so the job counts as failed (the safe side). Without the option nothing changes.
// C29.3 (AUDIT-11 F-3, F-4; D-317a): what was not judged is no green. An `unreadable` job and the log entries beyond `maxLogs` (default 5000, counted in `unjudgedEntries`) end in ECIREPORT_UNJUDGED:
// exit 1, no «✓» line. `--allow` can allow an unjudged JOB by name; nothing allows entries beyond the cap (they have no name); a job that FAILED keeps ECIREPORT_FAILED (a certain failure outranks a doubt).
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

/** Reads the logs zip. Returns { ok, code, zip, jobs: [{ name, failed, allowed, tests, pass, fail, failing, firstError, unreadable }], messages }. Never prints, exits or throws. */
export async function ciReport({ zip, maxBytes = MAX_BYTES, allow = [], maxLogs = MAX_LOGS } = {}) {
  const messages = [], say = (stream, text) => messages.push({ stream, text });
  const result = { ok: true, code: null, zip, jobs: [], unjudgedJobs: [], unjudgedEntries: 0, messages };
  const stop = (code, text) => { say("err", `✗ ${code}: ${text}`); result.ok = false; result.code = code; return result; };
  if (!Array.isArray(allow) || allow.some((a) => typeof a !== "string" || a === "")) return stop("ECIREPORT_ALLOW", "allow must be a list of non-empty texts");
  let z;
  try {
    const { openZip } = await loadZipkit();
    z = openZip(zip);
    const logs = z.entries.filter((e) => !e.isDir && /\.txt$/i.test(e.name) && !e.name.split("/").some((seg) => seg === "." || seg === "..")).map((e) => e.name); // an entry with a `.` or `..` segment is no log (C28.4, F-9)
    const names = logs.slice(0, maxLogs); result.unjudgedEntries = logs.length - names.length; // the rest is not read: it is NOT judged (C29.3, F-4)
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
  if (result.unjudgedEntries) say("err", `⚠ ${result.unjudgedEntries} log entr${result.unjudgedEntries === 1 ? "y" : "ies"} beyond the first ${maxLogs} ${result.unjudgedEntries === 1 ? "was" : "were"} not read: no job in ${result.unjudgedEntries === 1 ? "it" : "them"} was judged`);
  for (const j of result.jobs) j.allowed = allow.some((t) => j.name.includes(t));
  result.unjudgedJobs = result.jobs.filter((j) => j.unreadable).map((j) => j.name);
  const failedJobs = result.jobs.filter((j) => j.failed), bad = failedJobs.filter((j) => !j.allowed), allowedRed = failedJobs.filter((j) => j.allowed);
  const unjudgedBad = result.jobs.filter((j) => j.unreadable && !j.allowed), allowedUnjudged = result.jobs.filter((j) => j.unreadable && j.allowed);
  const doubt = unjudgedBad.length + result.unjudgedEntries > 0;
  const doubtText = `${unjudgedBad.length} job(s) and ${result.unjudgedEntries} log entr${result.unjudgedEntries === 1 ? "y" : "ies"} not judged`;
  const detail = (j) => {
    const counts = j.tests === null ? "" : ` (${j.fail ?? 0} failed of ${j.tests} tests)`;
    return `${j.name}${counts}${j.firstError ? `\n    first error: ${j.firstError}` : ""}${j.failing.length ? `\n    failing:\n${j.failing.slice(0, 15).map((f) => `      ${f}`).join("\n")}${j.failing.length > 15 ? `\n      … and ${j.failing.length - 15} more` : ""}` : ""}`;
  };
  for (const j of bad) say("err", `✗ ${detail(j)}`);
  for (const j of allowedRed) say("err", `⚠ ${detail(j)}\n    (allowed to fail: not counted)`);
  if (bad.length) { result.ok = false; result.code = "ECIREPORT_FAILED"; say("err", `✗ ECIREPORT_FAILED: ${bad.length} of ${result.jobs.length} job(s) failed${allowedRed.length ? ` (${allowedRed.length} more allowed to fail)` : ""}${doubt ? `; also ${doubtText}` : ""}`); }
  else if (doubt) { result.ok = false; result.code = "ECIREPORT_UNJUDGED"; say("err", `✗ ECIREPORT_UNJUDGED: ${doubtText}; a run that was not fully judged is not known to be green`); }
  else say("out", `✓ no failing job (${result.jobs.length} job(s) read${allowedRed.length + allowedUnjudged.length ? `; ${allowedRed.length + allowedUnjudged.length} allowed to fail or not judged, see above` : ""})`);
  return result;
}

/** The text the command prints for a result, per stream. */
export function renderCiReport(result) {
  const text = (stream) => result.messages.filter((m) => m.stream === stream).map((m) => `${m.text}\n`).join("");
  return { out: text("out"), err: text("err") };
}
