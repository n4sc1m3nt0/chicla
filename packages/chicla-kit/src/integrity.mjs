// C17.1 (round 243, D140, docs/plan-a1-integrity.md): the rules about the project's OWN state, in one place, for `check-manifest`, `bump-round --verify` and (C17.2) `verify-delivery`.
// PURE: no import, no I/O. A «view» is { names: string[], read(name) -> Buffer | null }; the caller brings its own reader (the disk, or its own reader of a zip), so a check of a zip
// never trusts the code that wrote it (CLAUDE.md rule 4). NOT pinned and not in RECOVER/: `recovery-report` and `emergency-dump` do not import it (D7).
// C17.1 holds the status-file regex and the LF rule; C17.2 adds the state rule (exactly one status file), the three-way fingerprint (instruction 11 a to c) and the toolchain pin, and the TOOLCHAIN map moves in
// from `bump-round`. The module has no crypto either: the caller passes `sha256(Buffer) -> hex`. A rule whose file is absent is skipped (D-242c), a file that is there but malformed is a failing row.
// A row is { id: "lf" | "pin" | "state" | "fingerprint", file, label, ok }; `verify-delivery` turns a failing row into a problem that starts with EINTEGRITY_<ID>.

/** The one status-file name: CHICLA_PROJECT_STATUS-<N>.md, in the project root. */
export const STATUS_FILE_RE = /^CHICLA_PROJECT_STATUS-\d+\.md$/;

/** The files that must have LF line endings only (CRLF broke the manifest in round 155 and passed every check for CLAUDE.md until round 233), plus the status file, which is any name of STATUS_FILE_RE. */
export const LF_FILES = Object.freeze(["CLAUDE.md", "AGENTS.md", "GEMINI.md", ".github/copilot-instructions.md", "CHANGELOG.md", "version.mjs", "FILES.manifest", "FILES.baseline.json"]);

const isLfFile = (name) => LF_FILES.includes(name) || STATUS_FILE_RE.test(name);

/**
 * The LF rule over a view: one row { id: "lf", file, label, ok } for each file of the list that is in `names` and can be read, in the order of `names`.
 * `skip` leaves files out (the ones a `--write` is about to regenerate). A bare CR inside a line is not CRLF; only the two bytes CR LF are.
 */
export function checkLf(view, { skip = [] } = {}) {
  const rows = [];
  for (const file of view.names) {
    if (!isLfFile(file) || skip.includes(file)) continue;
    const bytes = view.read(file);
    if (!bytes) continue;
    rows.push({ id: "lf", file, label: `${file} has LF line endings (no CRLF)`, ok: !bytes.includes("\r\n") });
  }
  return rows;
}

/** C9.4a: the recovery toolchain pinned in CLAUDE.md (`toolchain-digest: <hex>`): RECOVER/ name -> source path. `emergency-dump` keeps its own copy by design (D7); a test ties the two. */
export const TOOLCHAIN = Object.freeze({ "baseline.mjs": "packages/chicla-kit/src/pinned/baseline.mjs", "manifest.mjs": "packages/chicla-kit/src/pinned/manifest.mjs", "policy.mjs": "packages/chicla-kit/src/pinned/policy.mjs", "recovery-report.mjs": "packages/chicla-kit/src/pinned/recovery-report.mjs", "zipkit.mjs": "packages/chicla-zip/src/zipkit.mjs" });
export const PIN_RE = /toolchain-digest: ([0-9a-f]{64})/;

/** The fingerprint line of version.mjs and CHANGELOG.md, and the «Fingerprint:» paragraph of the status file (three legs, one triple). */
export const FP = /seq=(\d+) file=(\S+) app_sha256_12=([0-9a-f]{12}) changelog_sha256_12=([0-9a-f]{12})/;
export const PARA = /\*\*Fingerprint:\*\* seq=(\d+) · app=(\S+) ·\s*app_sha256_12=([0-9a-f]{12})[\s\S]*?changelog_sha256_12=([0-9a-f]{12})[\s\S]*?before doing anything else\./g;
/** `tail -n +n`, in bytes (n=1 is the whole file); and line n as text. */
export const tailFrom = (buf, n) => { let p = 0; for (let i = 1; i < n; i++) { const j = buf.indexOf(10, p); if (j < 0) return Buffer.alloc(0); p = j + 1; } return buf.subarray(p); };
export const lineOf = (buf, n) => tailFrom(buf, n).toString("utf8").split("\n", 1)[0];

/** The toolchain digest over a view: sha256 of `sha256sum RECOVER/*.mjs` (sorted by name), or null when one of the five files cannot be read. */
export function toolchainDigest(view, sha256) {
  const lines = [];
  for (const n of Object.keys(TOOLCHAIN).sort()) { const b = view.names.includes(TOOLCHAIN[n]) ? view.read(TOOLCHAIN[n]) : null; if (!b) return null; lines.push(`${sha256(b)}  RECOVER/${n}\n`); }
  return sha256(Buffer.from(lines.join("")));
}

/** The pin rule: one row, when CLAUDE.md holds a pin and the five files are all there; otherwise none. */
export function checkPin(view, sha256) {
  const claude = view.names.includes("CLAUDE.md") ? view.read("CLAUDE.md") : null;
  const pin = claude && (claude.toString("utf8").match(PIN_RE) ?? [])[1], d = pin && toolchainDigest(view, sha256);
  return d ? [{ id: "pin", file: "CLAUDE.md", label: `toolchain digest ${d.slice(0, 12)} = the pin in CLAUDE.md (${pin.slice(0, 12)})`, ok: d === pin }] : [];
}

/** The state rule and the fingerprint rows (the labels and their order are `bump-round --verify`'s). Not exactly one status file: one failing `state` row and no fingerprint rows. No app file or no CHANGELOG: no fingerprint rows. */
export function checkState(view, sha256, { appFile = "version.mjs" } = {}) {
  const st = view.names.filter((f) => STATUS_FILE_RE.test(f));
  if (st.length !== 1) return [{ id: "state", file: "", label: `there must be exactly 1 CHICLA_PROJECT_STATUS-N.md in the root (found ${st.length})`, ok: false }];
  const [name] = st, [app, cl, stBuf] = [appFile, "CHANGELOG.md", name].map((f) => (view.names.includes(f) ? view.read(f) : null));
  if (!app || !cl || !stBuf) return [];
  const seq = +name.match(/-(\d+)\.md$/)[1], appL = lineOf(app, 3), clL = lineOf(cl, 1), a = appL.match(FP), c = clL.match(FP), paras = [...stBuf.toString("utf8").matchAll(PARA)];
  const bad = !a || !appL.includes("STATUS_FILE_FINGERPRINT") ? [appFile, `${appFile}: line 3 is not a valid STATUS_FILE_FINGERPRINT`]
    : !c || !clL.includes("CHANGELOG_FINGERPRINT") ? ["CHANGELOG.md", "CHANGELOG.md: line 1 is not a valid CHANGELOG_FINGERPRINT"]
    : paras.length !== 1 ? [name, `${name}: there must be exactly 1 paragraph "**Fingerprint:** … before doing anything else." (found ${paras.length})`] : null;
  if (bad) return [{ id: "fingerprint", file: bad[0], label: bad[1], ok: false }];
  const p = paras[0], hApp = sha256(tailFrom(app, 4)).slice(0, 12), hCl = sha256(tailFrom(cl, 2)).slice(0, 12), eq = (x, y) => x === y;
  return [
    [`app: seq=${a[1]} = status file -${seq}`, eq(+a[1], seq), appFile], [`CHANGELOG: seq=${c[1]} = -${seq}`, eq(+c[1], seq), "CHANGELOG.md"], [`status file: seq=${p[1]} = -${seq}`, eq(+p[1], seq), name],
    [`file= points to ${name} (app and CHANGELOG)`, eq(a[2], name) && eq(c[2], name), "CHANGELOG.md"], [`app=${appFile} in the status file paragraph`, eq(p[2], appFile), name],
    [`app hash ${hApp} = app, CHANGELOG and status file`, [a[3], c[3], p[3]].every((h) => h === hApp), appFile], [`CHANGELOG hash ${hCl} = app, CHANGELOG and status file`, [a[4], c[4], p[4]].every((h) => h === hCl), "CHANGELOG.md"],
  ].map(([label, ok, file]) => ({ id: "fingerprint", file, label, ok }));
}

/** All the rules, in the order `bump-round --verify` prints them: pin, state and fingerprint, lf. `groups` picks some; `sha256(Buffer) -> hex` is the caller's. */
export function checkIntegrity(view, { sha256, appFile = "version.mjs", groups = ["pin", "state", "lf"] } = {}) {
  return [...(groups.includes("pin") ? checkPin(view, sha256) : []), ...(groups.includes("state") ? checkState(view, sha256, { appFile }) : []), ...(groups.includes("lf") ? checkLf(view) : [])];
}
