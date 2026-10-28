# Status file archive — «Done» lines of the Snapshot, rounds 248-248

Moved out of `CHICLA_PROJECT_STATUS-262.md` verbatim by `scripts/archive-changelog.mjs --snapshot`. Nothing was edited or deleted.
Find a line with `grep -n "round 12" docs/status-archive-done-*.md`.

- Done: round 248 (2026-10-26; Rodrigo: «avança», then «sim» to the audit). AUDIT-5 (D141): `docs/audits/AUDIT-5.md` after M16 and M17, five measured findings (F-1 archives overdue; F-2 two paragraphs of this file grow by hand; F-3 about 110 hand mutants not in a repeatable list; F-4 kit coverage floor, `emergency-dump.mjs` 86 %, `policy.mjs` 86 %, `recovery-report.mjs` 92 % lines; F-5 item 20 timing stale), no new security finding; ROADMAP D141 and milestone M18 (C18.1 to C18.4, proposed); `test/audit5-docs.test.mjs` (6, red first). Docs and one test, no source, the pin did not move. Nothing was fixed. Not run by Claude: the CI, Node 18/20, `npm run smoke`, mutants (package list), macOS, Windows, coverage of the root `test/`.
