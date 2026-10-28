# Status file archive — «Previous» blocks of rounds 233b-234

Moved out of `CHICLA_PROJECT_STATUS-245.md` verbatim by `scripts/archive-changelog.mjs --status`. Nothing was edited or deleted.
Find a block with `grep -n "^\*\*Previous (round 12)" docs/status-archive-previous-*.md`.

**Previous (round 234):** 2026-10-22. Rodrigo confirmed D138 «depois» and D-235a «c16.1 avança». C16.1 done: `chicla recovery` refuses a `.tar.gz`, `.tgz`, `.tar` or any gzip stream with `ERECOVERY_FORMAT` before creating anything (the system `tar` is gone from the pinned file), and where its default is not `/home/claude/recovered` it extracts into a fresh `mkdtemp` folder (`recoveryOutPlan`); `recovery-hardening.test.mjs` (6, red first), 8 hand mutants all red. A PINNED file changed: the pin moved. Next: C16.2 (CI hardening).

**Previous (round 233b):** 2026-10-22. Rodrigo asked for an audit of security, performance and token efficiency and confirmed D-234a («sim»), D-234b (docs round first) and D-234c (`recovery` refuses a `.tar.gz`): `docs/audits/AUDIT-4.md` records the measured findings and a plan of six rounds, ROADMAP has D137 (confirmed), D138 (proposed, not scheduled) and milestone M16 (C16.1 to C16.6); `test/audit4-docs.test.mjs` (6, red first). Docs and one test, no source, the pin did not move. Nothing of the audit is fixed yet; the next task is C16.1.

