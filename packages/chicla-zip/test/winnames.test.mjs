// M14, C14.1 (D96): Windows name safety as PURE functions; they run on Linux CI and on every platform. `windowsNameProblems(path)` returns the codes of what Windows
// cannot hold or treats specially (never renames, never throws on a name); C14.2 (round 141) wires it into the extractor and the writers in `windows-names.test.mjs`; since D97 it lives in zipkit.mjs. Tests assert codes, never wording (D18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { windowsNameProblems, WIN_CODES } from "../src/zipkit.mjs";

const codes = (p) => windowsNameProblems(p);
const has = (p, c) => assert.ok(codes(p).includes(c), `${JSON.stringify(p)} should report ${c}, got ${JSON.stringify(codes(p))}`);
const only = (p, ...c) => assert.deepEqual(codes(p), c, JSON.stringify(p));

test("the codes are exactly the seven of D96, frozen, in a stable order", () => {
  assert.deepEqual([...WIN_CODES], ["EWIN_BACKSLASH", "EWIN_DRIVE", "EWIN_UNC", "EWIN_RESERVED", "EWIN_CHAR", "EWIN_TRAILING", "EWIN_STREAM"]);
  assert.ok(Object.isFrozen(WIN_CODES));
});

test("ordinary names have no problem: unicode, dots, spaces inside, near-misses of reserved names", () => {
  for (const p of ["a.txt", "dir/sub/file.tar.gz", "résumé.txt", "café/日本語.txt", ".gitignore", "a/.hidden", ".git/config", "a b.txt", "CONSOLE.txt", "COM10", "COM0", "LPT0", "nul-x", "con-1/x", "aux_.c", "dir/"]) only(p);
});

test("reserved device names, any case, with or without extension, in ANY segment; COM/LPT 1 to 9 and the superscript digits", () => {
  for (const p of ["CON", "con", "Con.txt", "prn", "AUX.tar.gz", "nul.txt", "COM1", "com9.log", "LPT1", "lpt9", "COM¹", "LPT²", "COM³.x", "CONIN$", "conout$", "dir/nul/x", "a/b/AUX"]) only(p, "EWIN_RESERVED");
  only("NUL .txt", "EWIN_RESERVED"); // Windows ignores the space before the dot
  only("CON:", "EWIN_RESERVED", "EWIN_STREAM");
});

test("forbidden characters < > \" | ? * and control characters (the colon is a stream, see below); a slash is a separator, not a character", () => {
  for (const c of ["<", ">", '"', "|", "?", "*", "\u0000", "\u0001", "\t", "\n", "\u001f"]) only(`a${c}b`, "EWIN_CHAR");
  only("a\u007fb"); // DEL is allowed
  only("a/b");
});

test("trailing dot or space in any segment; «.» and «..» segments are not this check's business", () => {
  for (const p of ["name.", "name ", "a.b.", "a../b", "dir /x", "...", "x/y. "]) only(p, "EWIN_TRAILING");
  only("a/./b"); only("a/../b"); only("./a"); only("..");
});

test("alternate data streams: a colon in a segment after the optional drive letter", () => {
  only("name:stream", "EWIN_STREAM"); only("dir/file.txt:Zone.Identifier", "EWIN_STREAM"); only("ab:c:d", "EWIN_STREAM"); only("a:b:c", "EWIN_DRIVE", "EWIN_STREAM"); // «a:» is a drive letter
  only("file.txt::$DATA", "EWIN_STREAM");
});

test("drive-relative and absolute drive paths", () => {
  only("C:foo", "EWIN_DRIVE"); only("c:", "EWIN_DRIVE"); only("Z:/x/y", "EWIN_DRIVE");
  only("C:\\x", "EWIN_BACKSLASH", "EWIN_DRIVE");
  has("C:foo:bar", "EWIN_DRIVE"); has("C:foo:bar", "EWIN_STREAM");
  only("1:foo", "EWIN_STREAM"); // a digit is not a drive letter
});

test("UNC and device paths", () => {
  has("//server/share/f", "EWIN_UNC"); has("\\\\server\\share\\f", "EWIN_UNC"); has("\\\\server\\share\\f", "EWIN_BACKSLASH");
  has("\\\\?\\C:\\x", "EWIN_UNC"); has("\\\\.\\COM1", "EWIN_UNC"); has("//?/C:/x", "EWIN_UNC");
  only("/abs/path/ok"); // a single leading slash is not UNC (the extractor refuses absolute names already)
});

test("backslash anywhere", () => {
  only("a\\b", "EWIN_BACKSLASH"); only("dir\\", "EWIN_BACKSLASH");
  has("a\\nul", "EWIN_RESERVED"); // backslash is a separator on Windows, so the segment «nul» counts
});

test("several problems at once come back deduplicated, in the order of WIN_CODES", () => {
  const r = codes("C:\\dir\\nul.txt:s*?.");
  assert.deepEqual(r, WIN_CODES.filter((c) => r.includes(c)), "stable order");
  assert.equal(new Set(r).size, r.length, "no duplicate");
  for (const c of ["EWIN_BACKSLASH", "EWIN_DRIVE", "EWIN_RESERVED", "EWIN_CHAR", "EWIN_STREAM"]) assert.ok(r.includes(c), c);
});

test("the order follows WIN_CODES even when the segments hit in another order", () => {
  only("ab:c/nul", "EWIN_RESERVED", "EWIN_STREAM"); only("x./a?/CON", "EWIN_RESERVED", "EWIN_CHAR", "EWIN_TRAILING");
});

test("a name that is not a string is a TypeError; the empty string has no problem; the same input gives the same output", () => {
  for (const bad of [undefined, null, 42, {}, [], Buffer.from("a"), new String("CON")]) assert.throws(() => windowsNameProblems(bad), TypeError);
  only("");
  assert.deepEqual(codes("a:b"), codes("a:b")); assert.notEqual(codes("a:b"), codes("a:b"), "a new array each time");
});

test("D97: the functions live in zipkit.mjs, the one shipped file; winnames.mjs is gone and nothing imports it", () => {
  assert.ok(!existsSync(new URL("../src/winnames.mjs", import.meta.url)));
  assert.ok(!/winnames/.test(readFileSync(new URL("../src/zipkit.mjs", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "")));
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(pkg.files, ["src/zipkit.mjs", "README.md", "LICENSE"]);
});
