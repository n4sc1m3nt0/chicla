// C18.3 (round 251, D141, AUDIT-5 F-3): the hand mutants of the kit as a list `scripts/mutants.mjs` can run again. Slice 1: `src/integrity.mjs`.
//   npm run mutants:kit                       the whole list (about half an hour on 2 cores, detached: item 20 of the status file)
//   npm run mutants:kit -- --only K-INT-05 --timeout 60
// WHY `--pkg .`: the kit tests read the project root (`../../..`: the real status file, `CLAUDE.md`, the pinned files), so the runner must copy the whole tree, not packages/chicla-kit alone.
// Slice 2 (C18.4, round 253): the lines of `emergency-dump.mjs` and `recovery-report.mjs` that the coverage report does NOT show although tests reach them (their tests spawn the tool with a clean `env`, which drops NODE_V8_COVERAGE): each mutant here goes red, which is the proof that the line is reached. `recovery-report.mjs` is a pinned file: the mutant edits the COPY the runner makes, never the tree.
// Entry shape and rules: the header of `scripts/mutants.mjs`. Paths are relative to the project root. The shape and the anchors are held by `test/mutants-kit-list.test.mjs`.
// HONEST NOTE: the 26 hand mutants of rounds 243 and 244 existed only as counts in the CHANGELOG, so this list is RECONSTRUCTED from the guarantees of the module (one mutant per rule or per leg),
// not copied from them. Later slices (archive-changelog, check-manifest, bump-round, verify-delivery) get ids K-ARC-, K-CMN-, K-BMP-, K-VER- (K-MAN- is the crc32 of manifest.mjs). Slice 7 (C19.5, round 261): check-manifest.mjs, 20 entries; its 4 survivors were closed in C19.6 (round 262, core-check-manifest-gaps.test.mjs). Slice 8 (C19.5, round 263): verify-delivery.mjs, K-VER-01 and up.
const F = "packages/chicla-kit/src/integrity.mjs";
const LF = ["packages/chicla-kit/test/core-integrity.test.mjs"];                 // the LF rule, the regex, the callers of round 243
const ST = ["packages/chicla-kit/test/core-integrity-state.test.mjs"];           // the pin, state and fingerprint rules, and verify-delivery, of round 244
const m = (id, find, replace, tests, why, survives) => ({ id, file: F, find, replace, tests, why, ...(survives ? { survives } : {}) });

const D = "packages/chicla-kit/src/emergency-dump.mjs", R = "packages/chicla-kit/src/pinned/recovery-report.mjs";
const DF = ["test/emergency-fallback.test.mjs"], DA = ["test/dump-allow-held.test.mjs"], RC = ["packages/chicla-kit/test/cli-recovery.test.mjs"];
const M = "packages/chicla-kit/src/pinned/manifest.mjs", MC = ["test/manifest-crc-fallback.test.mjs"];
const MD = "packages/chicla-kit/src/make-delivery.mjs", MO = ["packages/chicla-kit/test/core-make-delivery-outdir.test.mjs"];
const MC5 = ["packages/chicla-kit/test/core-make-delivery-catch.test.mjs"];
const P = "packages/chicla-kit/src/panel.mjs", PT = ["packages/chicla-kit/test/panel.test.mjs"];
const BR = "packages/chicla-kit/src/bump-round.mjs", BT = ["packages/chicla-kit/test/core-bump-round-limits.test.mjs"];
const AC = "scripts/archive-changelog.mjs", AO = ["test/archive-options.test.mjs"];
const CM = "packages/chicla-kit/src/check-manifest.mjs";
const CMT = ["test/manifest.test.mjs", "test/collisions-nfc.test.mjs", "test/secret-allow.test.mjs", "test/policy-file.test.mjs", "test/check-manifest-one-read.test.mjs", "test/secret-names.test.mjs", "packages/chicla-kit/test/core-check-manifest.test.mjs", "packages/chicla-kit/test/cli-check-manifest.test.mjs"];
const CMG = ["packages/chicla-kit/test/core-check-manifest-gaps.test.mjs"];
const CMV = ["test/manifest-v2.test.mjs", "test/policy.test.mjs", "packages/chicla-kit/test/robustness-r233.test.mjs", "packages/chicla-kit/test/core-integrity.test.mjs", "packages/chicla-kit/test/name-rules-differential.test.mjs", ...CMT];
const x = (id, file, find, replace, tests, why, survives) => ({ id, file, find, replace, tests, why, ...(survives ? { survives } : {}) });

const VD = "packages/chicla-kit/src/verify-delivery.mjs";
const VDT = ["packages/chicla-kit/test/core-verify-delivery.test.mjs", "packages/chicla-kit/test/cli-verify-delivery.test.mjs", "packages/chicla-kit/test/core-integrity-state.test.mjs", "test/manifest-v2.test.mjs", "test/collisions-nfc.test.mjs", "test/secret-content.test.mjs", "test/secret-allow.test.mjs", "test/policy.test.mjs"]; // the fast files (about 60 s)
const VDG = ["packages/chicla-kit/test/core-git-rm-hint.test.mjs"], VDA = ["test/verify-against.test.mjs", "packages/chicla-kit/test/core-verify-delivery.test.mjs"]; // the `git rm` hint (48 s), the `--against` rules (43 s)
const VDW = [...VDT, "test/verify-nounzip.test.mjs", "test/manifest.test.mjs", "test/verify-against.test.mjs"]; // the fast files plus the three that build zips (about 165 s)
const VDAW = [...VDA, "test/verify-nounzip.test.mjs", "test/manifest.test.mjs"];
const VDX = ["packages/chicla-kit/test/core-verify-delivery-gaps.test.mjs"]; // C19.7: the gaps of the first pass, closed in round 264
const v = (id, find, replace, why, survives, tests = VDW) => x(id, VD, find, replace, tests, why, survives);

export default [
  // ---- the status-file regex and the LF rule (C17.1) ----
  m("K-INT-01", "/^CHICLA_PROJECT_STATUS-\\d+\\.md$/;", "/CHICLA_PROJECT_STATUS-\\d+\\.md$/;", LF, "STATUS_FILE_RE loses its start anchor: `old-CHICLA_PROJECT_STATUS-1.md` would count as a status file"),
  m("K-INT-02", "/^CHICLA_PROJECT_STATUS-\\d+\\.md$/;", "/^CHICLA_PROJECT_STATUS-\\d+\\.md/;", LF, "STATUS_FILE_RE loses its end anchor: `…-1.md.bak` would count as a status file"),
  m("K-INT-03", "\"AGENTS.md\", ", "", LF, "LF_FILES forgets AGENTS.md: CRLF there goes unseen"),
  m("K-INT-04", ", \"FILES.baseline.json\"]", "]", LF, "LF_FILES forgets FILES.baseline.json"),
  m("K-INT-05", "bytes.includes(\"\\r\\n\")", "bytes.includes(\"\\r\")", LF, "checkLf: a bare CR counts as CRLF"),
  m("K-INT-06", "ok: !bytes", "ok: bytes", LF, "checkLf: the verdict is inverted (CRLF passes, LF fails)"),
  m("K-INT-07", " || skip.includes(file)", " || false", LF, "checkLf: `skip` is ignored (a --write would fail on the files it is about to regenerate)"),
  m("K-INT-08", "if (!bytes) continue;", "", LF, "checkLf: an absent or unreadable file is not skipped (it throws)"),
  m("K-INT-09", "!isLfFile(file) || ", "", LF, "checkLf: every file of the view is checked, not only the list"),
  m("K-INT-10", " || STATUS_FILE_RE.test(name);", ";", LF, "isLfFile: the status file is no longer held to LF"),

  // ---- the toolchain map and the pin (C17.2) ----
  m("K-INT-11", ", \"zipkit.mjs\": \"packages/chicla-zip/src/zipkit.mjs\"", "", ST, "TOOLCHAIN loses zipkit.mjs: the pin stops covering the reader"),
  m("K-INT-12", "\"baseline.mjs\": \"packages/chicla-kit/src/pinned/baseline.mjs\"", "\"baseline.mjs\": \"packages/chicla-kit/src/baseline.mjs\"", ST, "TOOLCHAIN points baseline.mjs at the wrong source"),
  m("K-INT-13", "[0-9a-f]{64}", "[0-9a-f]{63}", ST, "PIN_RE takes 63 hex digits of the pin, not 64"),
  m("K-INT-14", "/seq=(\\d+) file=", "/seq=(\\d) file=", ST, "FP reads a one-digit seq: round 255 no longer matches"),
  m("K-INT-15", "before doing anything else\\./g;", "before doing anything else\\./;", ST, "PARA loses the g flag: `matchAll` throws"),
  m("K-INT-16", "i < n; i++", "i <= n; i++", ST, "tailFrom skips one line too many: every hash is off"),
  m("K-INT-17", ".split(\"\\n\", 1)[0]", ".split(\"\\n\")[1]", ST, "lineOf returns the second line, not the first"),
  m("K-INT-18", "Object.keys(TOOLCHAIN).sort()", "Object.keys(TOOLCHAIN).sort().reverse()", ST, "toolchainDigest hashes the five files in reverse order"),
  m("K-INT-19", "Object.keys(TOOLCHAIN).sort()", "Object.keys(TOOLCHAIN)", ST, "toolchainDigest stops sorting the five names", "equivalent mutant: the insertion order of TOOLCHAIN (baseline, manifest, policy, recovery-report, zipkit) is already the sorted order; it dies the day someone reorders the map without the sort"),
  m("K-INT-20", "if (!b) return null; ", "", ST, "toolchainDigest: an unreadable toolchain file is no longer «no digest»"),
  m("K-INT-21", "  RECOVER/${n}\\n", "  ${n}\\n", ST, "toolchainDigest: the line has no `RECOVER/` prefix, so the digest is not what `sha256sum RECOVER/*.mjs` prints"),
  m("K-INT-22", "ok: d === pin", "ok: true", ST, "checkPin: a wrong pin passes"),
  m("K-INT-23", "return d ? [{ id: \"pin\"", "return true ? [{ id: \"pin\"", ST, "checkPin: a project without a pin (or a toolchain file) is no longer skipped (D-242c)"),
  m("K-INT-24", "match(PIN_RE) ?? [])[1]", "match(PIN_RE) ?? [])[0]", ST, "checkPin: the pin is the whole `toolchain-digest: …` text, not the hex"),

  // ---- the state rule and the seven fingerprint rows (C17.2) ----
  m("K-INT-25", "st.length !== 1", "st.length < 1", ST, "checkState: two status files are accepted"),
  m("K-INT-26", "(found ${st.length})`, ok: false", "(found ${st.length})`, ok: true", ST, "checkState: the `state` row can no longer fail"),
  m("K-INT-27", "eq(+a[1], seq)", "eq(+a[1], +a[1])", ST, "fingerprint row 1: the app's seq is not compared with the status file number"),
  m("K-INT-28", "eq(+c[1], seq)", "eq(+c[1], +c[1])", ST, "fingerprint row 2: the CHANGELOG's seq is not compared"),
  m("K-INT-29", "eq(+p[1], seq)", "eq(+p[1], +p[1])", ST, "fingerprint row 3: the status paragraph's seq is not compared"),
  m("K-INT-30", "eq(a[2], name) && eq(c[2], name)", "eq(a[2], name)", ST, "fingerprint row 4: the CHANGELOG leg of `file=` is not compared (caught only after a test was added, round 244)"),
  m("K-INT-31", "eq(p[2], appFile)", "true", ST, "fingerprint row 5: `app=` in the status paragraph is not compared"),
  m("K-INT-32", "[a[3], c[3], p[3]].every", "[a[3], c[3]].every", ST, "fingerprint row 6: the status paragraph's app hash is not compared"),
  m("K-INT-33", "[a[4], c[4], p[4]].every", "[a[4], p[4]].every", ST, "fingerprint row 7: the CHANGELOG's own changelog hash is not compared"),
  m("K-INT-34", "tailFrom(app, 4)", "tailFrom(app, 3)", ST, "the app hash starts at line 3 (its own fingerprint comment) instead of line 4"),
  m("K-INT-35", "tailFrom(cl, 2)", "tailFrom(cl, 1)", ST, "the CHANGELOG hash starts at line 1 (its own fingerprint line) instead of line 2"),
  m("K-INT-36", "paras.length !== 1", "paras.length < 1", ST, "checkState: two «Fingerprint:» paragraphs are accepted"),
  m("K-INT-37", " || !appL.includes(\"STATUS_FILE_FINGERPRINT\")", "", ST, "checkState: line 3 of the app file need not say STATUS_FILE_FINGERPRINT"),
  m("K-INT-38", "if (!app || !cl || !stBuf) return [];", "if (!stBuf) return [];", ST, "checkState: a project without version.mjs or CHANGELOG is no longer skipped (D-242c)"),

  // ---- the caller's entry point ----
  m("K-INT-39", "groups.includes(\"lf\") ? checkLf(view) : []", "checkLf(view)", ST, "checkIntegrity: `groups` no longer leaves the LF rule out"),
  m("K-INT-40", "groups.includes(\"pin\") ? checkPin(view, sha256) : []", "checkPin(view, sha256)", ST, "checkIntegrity: `groups` no longer leaves the pin rule out"),
  m("K-INT-41", "checkState(view, sha256, { appFile })", "checkState(view, sha256)", ST, "checkIntegrity: the caller's `appFile` is not passed on"),

  // ---- slice 2 (C18.4): emergency-dump.mjs, the `allow` release (lines 191-195) and the external zip/tar fallback (336-367) ----
  x("K-DMP-01", D, "held.splice(i, 1);\n          if (!mod.policySkips", "if (!mod.policySkips", DA, "the `allow` release: a released file stays held back"),
  x("K-DMP-02", D, "if (!mod.policySkips(projRel(h.rel), pol)) workScan.files.push(h.file);", "workScan.files.push(h.file);", DA, "the `allow` release: a file the same policy also lists in names/paths comes back into the dump"),
  x("K-DMP-03", D, "pol.allow.has(projRel(h.rel).normalize(\"NFC\"))", "pol.allow.has(projRel(h.rel))", DA, "the `allow` release compares names as they are, not in NFC"),
  x("K-DMP-04", D, "else symlinkSync(WORK, join(stage, \"work\"));", "else {}", DF, "fallback: the stage has no `work/` (the dump would be empty)"),
  x("K-DMP-05", D, "copyFileSync(tmpTar, join(OUTDIR, finalName));", "", DF, "fallback: the .tar.gz is never copied to the output folder"),
  x("K-DMP-06", D, "return fail(\"EDUMP_FAILED\"", "return fail(\"EDUMP_X\"", DF, "fallback: the only failing case of a dump reports another code"),
  x("K-DMP-07", D, "if (keep.length) relay(", "if (false) relay(", DF, "fallback: .env.example is not put back after the zip -x sweep"),
  x("K-DMP-08", D, "if (projectOnly && project.dir) {", "if (false) {", DF, "fallback: --project-only takes the whole work folder"),
  x("K-DMP-09", D, "for (const k of Object.keys(hashes)) delete hashes[k];", "", DF, "fallback: the hashes of the failed writer run are not reset"),

  // ---- slice 2 (C18.4): recovery-report.mjs, the toolchain digest check when it runs from RECOVER/ (lines 105-112) ----
  x("K-REC-01", R, "if (given !== mine) {", "if (false) {", RC, "recovery: a RECOVER/ whose digest differs from the pin runs anyway"),
  x("K-REC-02", R, "if (!trustToolchain) return fail(", "if (false) return fail(", RC, "recovery: --trust-toolchain is not needed to run a RECOVER/ with the wrong digest"),
  x("K-REC-03", R, "if (leaf(HERE) === \"RECOVER\") {", "if (false) {", RC, "recovery: the digest is never checked, whatever the folder"),
  // ---- slice 2 (C18.4): manifest.mjs, the JS crc32 used when this Node has no zlib.crc32 (lines 59-60) ----
  x("K-MAN-01", M, "^ (c >>> 8);\n  return (c", "^ (c >>> 7);\n  return (c", MC, "the JS crc32 shifts by 7"),
  x("K-MAN-02", M, "return (c ^ 0xffffffff) >>> 0;\n};", "return c >>> 0;\n};", MC, "the JS crc32 forgets the final inversion"),
  // ---- slice 3 (C18.6, round 254): make-delivery.mjs, an `out` that is a folder ----
  x("K-DEL-01", MD, "if (lstatSync(outPath).isDirectory()) return stop(", "if (false) return stop(", MO, "the early refusal of a folder as `out` is gone (the old throw is back)"),
  x("K-DEL-02", MD, "try { if (!lstatSync(outPath).isDirectory()) rmSync(outPath); } catch { /* nothing to remove */ }", "if (existsSync(outPath)) rmSync(outPath);", MO, "the catch calls rmSync on whatever is at `out` again (it throws on a folder)", "equivalent while K-DEL-01 holds: a folder never reaches the catch (the early refusal returns first) and for a file the two removals do the same; it dies the day the early refusal is removed AND the catch is the only guard, which the other mutant forbids"),
  x("K-DEL-03", MD, "return stop(\"EDELIVERY_ERROR\", `\\n✗ EDELIVERY_ERROR: ${outPath} is a folder", "return stop(\"EDELIVERY_X\", `\\n✗ EDELIVERY_ERROR: ${outPath} is a folder", MO, "a folder as `out` reports another code"),
  // ---- C20.5 (round 269): the outer catch of makeDelivery, reached by a core that throws (allowRemoved is not a list) ----
  x("K-DEL-04", MD, "return stop(\"EDELIVERY_ERROR\", `\\n✗ EDELIVERY_ERROR: ${e.code ?", "return stop(\"EDELIVERY_X\", `\\n✗ EDELIVERY_ERROR: ${e.code ?", MC5, "an exception inside a core is reported with another code"),
  x("K-DEL-05", MD, "try { if (!lstatSync(outPath).isDirectory()) rmSync(outPath); } catch { /* nothing to remove */ }\n    return stop(", "\n    return stop(", MC5, "the catch leaves the zip that was written before the throw (a zip whose verification never finished could be delivered)"),
  // ---- slice 4 (C18.7, round 255): panel.mjs, a key it does not know ----
  x("K-PNL-01", P, "else return;\n      draw();", "else {}\n      draw();", PT, "an unknown key redraws the screen"),
  x("K-PNL-02", P, "else if (k === \"r\") data = readPanelData(root);", "else if (k === \"r\") data = data;", PT, "r no longer reloads the data"),
  // ---- slice 5 (C19.1, round 257): scripts/archive-changelog.mjs, an argument it does not know ----
  x("K-ARC-01", AC, "if (args.includes(\"--help\") || args.includes(\"-h\")) {", "if (false) {", AO, "--help is an unknown argument again (exit 2, or the old default run)"),
  x("K-ARC-02", AC, "console.log(USAGE); process.exit(0);", "console.log(USAGE); process.exit(1);", AO, "--help exits 1"),
  x("K-ARC-03", AC, "if (!FLAGS.has(args[i])) {", "if (false) {", AO, "an unknown option or a stray word falls through to the default command (the round 251 accident)"),
  x("K-ARC-04", AC, "); process.exit(2);", "); process.exit(1);", AO, "an unknown argument exits 1, which the count errors already use"),
  x("K-ARC-05", AC, "if (VALUED.has(args[i])) { i++; continue; }", "if (VALUED.has(args[i])) { continue; }", AO, "the value of --keep and its kin is read as a stray word"),
  x("K-ARC-06", AC, "\"--snapshot\", \"--rolling\"]", "\"--snapshot\"]", AO, "--rolling is rejected as unknown"),
  x("K-ARC-07", AC, "\"--keep-previous\", \"--keep-done\", \"--keep-clauses\"]);", "\"--keep-previous\", \"--keep-clauses\"]);", AO, "--keep-done is rejected as unknown"),
  // ---- slice 6 (C19.2, round 258): bump-round reports the archive limits it sees (AUDIT-6 F-1) ----
  x("K-BMP-01", BR, "previous: 5,", "previous: 6,", BT, "the «Previous» limit moves to 6: a 6th block goes unreported"),
  x("K-BMP-02", BR, "done: 10,", "done: 11,", BT, "the «Done» limit moves to 11"),
  x("K-BMP-03", BR, "rounds: 21,", "rounds: 22,", BT, "the CHANGELOG limit moves to 22 headings"),
  x("K-BMP-04", BR, "bytes: 4096 }", "bytes: 4097 }", BT, "the paragraph limit moves to 4097 bytes"),
  x("K-BMP-05", BR, "previous > LIMITS.previous", "previous >= LIMITS.previous", BT, "exactly 5 «Previous» blocks are reported (a warning on a file within the limit)"),
  x("K-BMP-06", BR, "done > LIMITS.done", "done >= LIMITS.done", BT, "exactly 10 «Done» lines are reported"),
  x("K-BMP-07", BR, "bytes > LIMITS.bytes", "bytes >= LIMITS.bytes", BT, "exactly 4096 bytes are reported"),
  x("K-BMP-08", BR, "rounds > LIMITS.rounds", "rounds >= LIMITS.rounds", BT, "exactly 21 CHANGELOG headings are reported"),
  x("K-BMP-09", BR, "Buffer.byteLength(row)", "row.length", BT, "the paragraph is measured in characters, not bytes"),
  x("K-BMP-10", BR, "for (const l of result.limits) say(\"out\", l.line);", ";", BT, "the lines are computed but never printed"),
  x("K-BMP-11", BR, "\"node scripts/archive-changelog.mjs --status\", s.statusName", "\"node scripts/archive-changelog.mjs --snapshot\", s.statusName", BT, "the «Previous» line names the wrong command"),
  x("K-BMP-12", BR, ", then node scripts/bump-round.mjs --refresh`", "`", BT, "the line stops naming the --refresh that follows the archiving"),
  x("K-BMP-13", BR, "    result.limits = archiveLimits(s);", "    result.limits = []; archiveLimits(s);", BT, "the limits are not reported in the result"),
  // C20.1 (round 266, AUDIT-7 F-1): the argument check of `scripts/bump-round.mjs`: `parseBumpArgs` in the core (K-BMP-14 to -17); the exit codes of the wrapper are held by `test/bump-round-options.test.mjs` and the smoke test, not mutated (the list mutates kit sources only).
  x("K-BMP-14", BR, 'if (args.includes("--help") || args.includes("-h")) return { help: true };', "if (false) return { help: true };", ["test/bump-round-options.test.mjs"], "--help is an unknown argument again (or the old default: a real bump)"),
  x("K-BMP-15", BR, "else if (!KNOWN.has(args[i])) bad = true;", "else if (false) bad = true;", ["test/bump-round-options.test.mjs"], "an unknown option or a stray word falls through to the default mode: a real bump (AUDIT-7 F-1)"),
  x("K-BMP-16", BR, 'if (args[i + 1] === undefined || args[i + 1].startsWith("--")) bad = true;', "if (false) bad = true;", ["test/bump-round-options.test.mjs"], "--note with no text, or followed by an option, is accepted"),
  x("K-BMP-17", BR, 'if (args.includes("--verify") && args.length > 1) bad = true;', "if (false) bad = true;", ["test/bump-round-options.test.mjs"], "--verify combined with another mode is accepted (the kit CLI refuses it)"),
  // ---- slice 7 (C19.5, round 261): check-manifest.mjs (AUDIT-6 F-5) ----
  x("K-CMN-01", CM, "if (!rootIsDir) return stop(", "if (false) return stop(", CMV, "a missing project folder is no longer a clean EMANIFEST_ROOT"),
  x("K-CMN-02", CM, "const SKIP_FILES = new Set([\".DS_Store\", \"FILES.manifest\"]);", "const SKIP_FILES = new Set([\".DS_Store\"]);", CMV, "FILES.manifest is listed in its own manifest"),
  x("K-CMN-03", CM, "name.endsWith(\".tsbuildinfo\")", "name.endsWith(\".tsbuildinfox\")", CMV, "a `*.tsbuildinfo` file enters the manifest"),
  x("K-CMN-04", CM, "/\\.pyc$/.test(name)", "/\\.pyd$/.test(name)", CMV, "a `.pyc` file enters the manifest"),
  x("K-CMN-05", CM, "isSecretEnv(name) || isSecretFileName(name))) continue;", "isSecretEnv(name))) continue;", CMV, "a secret-named file (key, token) enters the manifest by name"),
  x("K-CMN-06", CM, "ent.isSymbolicLink() ? statSync(p).isDirectory() : ent.isDirectory()", "ent.isDirectory()", CMV, "a symlink to a folder is not walked"),
  x("K-CMN-07", CM, "if (policySkips(rel, POLICY)) continue;", "if (false) continue;", CMV, "the `skip` of chicla.policy.json is ignored"),
  x("K-CMN-08", CM, "inspect(p, rel, !policyAllows(rel, POLICY))", "inspect(p, rel, true)", CMV, "an `allow`ed file is scanned for secrets anyway"),
  x("K-CMN-09", CM, "if (kind) { detected.push([rel, kind]); continue; }", "if (kind) { detected.push([rel, kind]); }", CMV, "a file whose content looks like a secret is reported and then listed anyway"),
  x("K-CMN-10", CM, "relative(ROOT, p).split(\"\\\\\").join(\"/\")", "relative(ROOT, p)", CMV, "paths keep the backslash of Windows in the manifest", "equivalent on POSIX: `relative` returns `/` there; only a Windows run can turn it red (G-C8, not run by Claude)"),
  x("K-CMN-11", CM, "{ skip: write ? [\"FILES.manifest\", \"FILES.baseline.json\"] : [] }", "{ skip: [] }", CMV, "`--write` stops on the CRLF of the two files it is about to regenerate"),
  x("K-CMN-12", CM, "existsSync(MANIFEST) ? [...current, \"FILES.manifest\"] : current", "current", CMV, "the LF rule no longer looks at FILES.manifest itself"),
  x("K-CMN-13", CM, "const k = nfc(f), first", "const k = f, first", CMV, "two names that differ only in NFC/NFD are not seen as a collision"),
  x("K-CMN-14", CM, "!have.has(nfc(f)) && !(STATUS_RE.test(f) && statusNow.length === 1)", "!have.has(nfc(f)) && !(STATUS_RE.test(f) && statusNow.length >= 1)", CMG, "two status files on disk count as a rename, not as a lost one"),
  x("K-CMN-15", CM, "!listedSet.has(nfc(f))", "!listedSet.has(f)", CMG, "a name on disk in NFD (macOS) is reported as new beside its NFC spelling in the manifest"),
  x("K-CMN-16", CM, "result.ok = false; result.code = \"EMANIFEST_LOST\";", "result.code = \"EMANIFEST_LOST\";", CMV, "a lost file prints but the result stays ok"),
  x("K-CMN-17", CM, "result.manifestMissing = true;\n", "", CMV, "a missing FILES.manifest is no longer flagged in the result"),
  x("K-CMN-18", CM, "added.slice(0, 15)", "added.slice(0, 16)", CMG, "the list of new files is cut at 16, not 15"),
  x("K-CMN-19", CM, "result.messages.filter((m) => m.stream === stream)", "result.messages.filter((m) => m.stream !== stream)", CMV, "the script prints each stream's text on the other stream"),
  x("K-CMN-20", CM, "`${m.text}\\n`).join(\"\")", "`${m.text}`).join(\"\")", CMG, "messages are printed with no line break"),
  // ---- verify-delivery.mjs (C19.5 slice 8, round 263): the rules of the header, one mutant each ----
  v("K-VER-01", "if (!zip) {", "if (false) {", "no zip given is no longer a clean EVERIFY_USAGE", undefined, VDT),
  v("K-VER-02", "|\\.tsbuildinfo$/;", "|\\.tsbuildinfox$/;", "a `*.tsbuildinfo` file inside the zip is no longer junk", undefined, VDX),
  v("K-VER-03", "|(^|\\/)\\.DS_Store$", "", "a `.DS_Store` inside the zip is no longer junk", undefined, VDW),
  v("K-VER-04", "if (!set.has(\"package.json\"))", "if (false)", "a wrapper folder (no package.json at the root) is accepted", undefined, VDX),
  v("K-VER-05", "else if (prior !== trueName) collisions.push", "else collisions.push", "the same name twice in the central directory counts as an NFC collision", undefined, VDX),
  v("K-VER-06", "d.readUInt32LE(1) === crc32(raw)", "true", "a Unicode Path field with the wrong crc32 is trusted", undefined, VDX),
  v("K-VER-07", "if (e.nonAscii && !(e.flags & 0x800))", "if (false)", "a non-ASCII name without the UTF-8 flag (EUTF8_FLAG) is accepted", undefined, VDW),
  v("K-VER-08", "policyAllows(name, POLICY) ? null : detectSecret(bytesOf(zip, name))", "detectSecret(bytesOf(zip, name))", "an `allow`ed file is scanned for secrets in the delivery anyway", undefined, VDT),
  v("K-VER-09", "|| name === BASELINE_FILE || !z) continue;", "|| !z) continue;", "FILES.baseline.json is held to a crc32 that the manifest cannot carry", undefined, VDT),
  v("K-VER-10", "else if (z.crc32 !== e.crc32) badCrc", "else if (false) badCrc", "a file whose crc32 differs from the manifest passes (EMANIFEST_CRC32)", undefined, VDT),
  v("K-VER-11", "f !== \"FILES.manifest\" && !listedSet.has(f)", "f !== \"FILES.manifest\" && false", "a file in the zip outside FILES.manifest passes", undefined, VDX),
  v("K-VER-12", "for (const k of want.keys()) if (!haveSet.has(k))", "for (const k of want.keys()) if (false)", "a file the baseline lists but the zip lacks passes (EBASELINE_MISMATCH)", undefined, VDX),
  v("K-VER-13", "[\"CLAUDE.md\", \"CHANGELOG.md\"]", "[\"CLAUDE.md\"]", "a zip without CHANGELOG.md passes", undefined, VDX),
  v("K-VER-14", "if (!m || m[1] !== n)", "if (!m)", "a status file number that disagrees with the CHANGELOG seq= passes", undefined, VDX),
  v("K-VER-15", "&& !allowSet.has(f));", ");", "`--allow-removed` is ignored", undefined, VDA),
  v("K-VER-16", "const real = lost.filter((f) => !STATUS_FILE_RE.test(f));", "const real = lost;", "a status file renamed by the round counts as a lost file", undefined, VDA),
  v("K-VER-17", "if (!problems.length && leftAll.size)", "if (leftAll.size)", "the `git rm` hint is printed for a zip that is rejected", undefined, [...VDG, ...VDA]),
  v("K-VER-18", "all.length > GIT_RM_MAX", "all.length >= GIT_RM_MAX", "exactly 30 names get no `git rm` command (the limit is 'more than 30')", undefined, VDG),
  v("K-VER-19", "\\u001f\\u007f]", "\\u001f]", "a DEL character in a name is printed in the `git rm` line", undefined, VDG),
  v("K-VER-20", "top.size === 1", "top.size >= 1", "an `--against` zip with several top folders is unwrapped", undefined, VDX),
  v("K-VER-21", ".filter((f) => !f.startsWith(\"__MACOSX/\"))", "", "`__MACOSX/` entries of an `--against` upload count as files that were lost", undefined, VDX),
  v("K-VER-22", "if (out.length !== e.size)", "if (false)", "an entry whose decoded size differs from the central directory is accepted (EZIP_DATA)", undefined, VDW),
  v("K-VER-23", "if (crc32(out) !== e.crc32)", "if (false)", "an entry whose crc32 differs from the central directory is accepted (EZIP_DATA)", undefined, VDW),
  v("K-VER-24", "`${m.text}\\n`", "`${m.text}`", "messages are printed with no line break", undefined, VDX),
  v("K-VER-26", "const all = [...new Set(paths)].sort();", "const all = [...paths];", "the `git rm` line keeps duplicate names and the order of the other zip", undefined, VDG),
  v("K-VER-25", "total === 0xffff ||", "", "a zip64 marker in the entry count is no longer refused", "equivalent by code: a zip64 count of 0xffff is EZIP_UNREADABLE with or without this test of the count (the loop then meets a bad central directory); only the wording differs, and tests assert codes (round 264)"),
];
