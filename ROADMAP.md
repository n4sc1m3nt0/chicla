# Chicla — Roadmap

*Side project do Rodrigo · rascunho 1 · 2026-10-07 · nasce do zipkit e do framework de workflow do Cedar (que vem do Paper Golf)*

## 1. O que é

O Chicla dá a qualquer coding agent uma memória de projeto que sobrevive a sessões, contas e limites de utilização. Em Node puro, sem dependências. Tem duas peças:

- **chicla-zip** — ler, verificar, extrair em segurança, **escrever** e reparar zips, com os nomes UTF-8 certos em qualquer sistema e em qualquer leitor. Nasceu do zipkit.
- **chicla-kit** — o workflow completo: ficheiro de estado, fingerprints, política de «o que nunca sai», manifesto, entrega verificada, `/dump` e recovery mode, e instaladores para cada agente.

**Nome (2026-10-09):** **Chicla**, decidido pelo Rodrigo (D22). `chicla` foi abandonado: já existia no npm (`chicla-cli` instala um comando `chicla`) e no PyPI. Em 2026-10-08 não havia `chicla`, `chicla-cli`, `chiclakit` nem `@chicla/cli` no npm; em 2026-10-09 confirmei que `chicla`, `chicla-zip`, `chicla-kit` e `chicla-cli` continuam livres. O projeto não é publicado no npm (D12). GitHub, domínios e marcas: gate G-C1.

## 2. Decisões

| # | Decisão | Estado |
| --- | --- | --- |
| D1 | ~~Nome Chicla~~ → **Chicla** (D22); packages `chicla-zip` (núcleo) e `chicla-kit` (framework) | decidido (2026-10-08); renomeado em 2026-10-09 |
| D2 | O **escritor de zips** entra no âmbito desde o início | decidido |
| D3 | Zero dependências, Node 18+, ESM, tipos por JSDoc; `zlib.crc32` quando existir, com alternativa em JS. **Why (written down in round 58; the reasons are Claude's reconstruction, confirmed by Rodrigo asking for them to be recorded):** (1) a zip is hostile input and every dependency is third-party code on that path; owning the reader, extractor and writer lets each guarantee be proved by tests and mutants; (2) the same answer on every machine with Node 18+, independent of `unzip`, `zip`, `ditto` and their versions and locales (`docs/zip-handling.md`); (3) the kit runs in fresh chats where only Node and the zip exist, so an install step would fail exactly when recovery is needed; (4) no `node_modules`, no third-party security updates, no supply-chain exposure for whoever installs from npm. Cost, accepted: a zip stack that mature libraries (`fflate`, `yauzl`) already offer, and more work for things like the terminal UI (C11.5). Scope: the core packages; an OPTIONAL separate package with dependencies (e.g. a richer terminal UI) is not excluded | decided (proposed in the first rounds; confirmed by Rodrigo, 2026-10-09; reasons recorded 2026-10-10) |
| D4 | Repositório próprio, separado do Cedar; monorepo com dois packages versionados à parte | decided (proposed in the first rounds; confirmed by Rodrigo, 2026-10-09) |
| D5 | O Chicla usa o seu próprio workflow desde o M0 (rondas, ficheiro de estado, fingerprints, gates), começando por copiar os scripts do Cedar tal como estão | decided (proposed in the first rounds; confirmed by Rodrigo, 2026-10-09) |
| D6 | Segurança por omissão: extrai para pasta nova; o despejo só leva a raiz do projeto, o resto é opcional | decided (proposed in the first rounds; confirmed by Rodrigo, 2026-10-09) |
| D7 | O `/dump` nunca falha por causa do Chicla: mantém-se um caminho de emergência com `zip`/`tar` | regra herdada do Cedar |
| D8 | ~~Mensagens por chaves (pt e en)~~ **Substituída por D18** | cancelada (2026-10-08) |
| D9 | Licença | em aberto (G-C2) |
| D10 | `chicla update` existe mas é sempre manual (diff e confirmação); atualizações automáticas continuam fora de âmbito | decided (proposed in the first rounds; confirmed by Rodrigo, 2026-10-09) |
| D11 | Windows fora de âmbito no 0.1, mas o CLI recusa com mensagem clara (C11.4); a decisão de um marco próprio fica em G-C4 | decided (proposed in the first rounds; confirmed by Rodrigo, 2026-10-09) |
| D12 | Distribuição por GitHub, sem npm: repositório público, instalação com `npm i github:<utilizador>/chicla#v0.1.0` ou `.tgz` de um release; o `chicla update` (C11.3) trata das atualizações | decidido (2026-10-08); the «sem npm» part is replaced by D41 (2026-10-10) |
| D13 | A versão da app é o `version` do `package.json` da raiz e sobe em cada entrega; a perna app do fingerprint é `version.mjs`; as versões de `chicla-zip` e `chicla-kit` (D4) só mudam nos lançamentos | decidido (2026-10-08); confirmado por Rodrigo (2026-10-08) |
| D14 | Os ficheiros do workflow (`CLAUDE.md`, estado, `CHANGELOG.md`, `ROADMAP.md`, `FILES.manifest`) ficam na raiz, como no Cedar: os scripts procuram-nos aí e o Claude Code só carrega o `CLAUDE.md` da raiz | decidido (2026-10-08) |
| D15 | Orçamento de desempenho para 20 000 ficheiros pequenos: **3×** o `unzip` em tmpfs (era 2×). Razão: os cortes baratos esgotaram-se na ronda 9; chegar a 2× pedia um desenho maior (worker threads) com riscos que não compensam. Reabre-se só se o 3× deixar de se cumprir | decidido (Rodrigo, 2026-10-08) |
| D16 | Colisão de nomes equivalentes num sistema de ficheiros que as funde: erro `ECOLLISION`, nada escrito (a extração é atómica); nunca escrever por cima de um ficheiro já extraído do mesmo zip. Corrige o texto de §5 | decidido (Claude, por delegação de Rodrigo, 2026-10-08); confirmado por Rodrigo, 2026-10-09 |
| D17 | O Chicla não apaga pastas `.chicla-tmp-*` que não criou nesta chamada: apagar por padrão de nome na pasta de alguém é pior do que um resto visível após um crash (`SIGKILL`). O resto fica documentado; quem quiser, apaga à mão | decidido (Claude, por delegação de Rodrigo, 2026-10-08); confirmado por Rodrigo, 2026-10-09 |
| D18 | Messages are English only: no pt/en keys, no translation layer. Tests assert error `code`s, never message text. Replaces D8; the CLAUDE.md rule 6 follows | decided (Rodrigo, 2026-10-08) |
| D19 | Windows becomes its own milestone, M14, after the 0.1 line; until then the CLI refuses with a clear message (C11.4). Replaces the open question of D11 | decided (Rodrigo, 2026-10-08); G-C4 stays his to close |
| D20 | A deflate entry with 0 bytes of data is refused (as `unzip` does); an empty file is a stored entry or the 2-byte stream `03 00` | decided (Rodrigo, 2026-10-08); implemented in round 16 |
| D21 | Cedar is where the workflow was built by hand the second time (after Paper Golf) and where the idea of a distributable package came from; it will be the first project to use the package (C13.1). The projects stay separate: Cedar's own rounds and decisions are tracked in Cedar | decided (Rodrigo, 2026-10-08) |
| D22 | The project and the command are called **Chicla**: packages `chicla-zip` and `chicla-kit`, status file `CHICLA_PROJECT_STATUS-N.md`, delivery zips `chicla-roundN-YYYY-MM-DD.zip`, env vars `CHICLA_*`, temp folders `.chicla-tmp-*`, recovery marker `chicla-recovery-v1`. Replaces D1. History (older CHANGELOG entries, `docs/audits/AUDIT-1.md`) keeps the old name verbatim | decided (Rodrigo, 2026-10-09); implemented in round 17 |
| D23 | The npm names `chicla`, `chicla-zip` and `chicla-kit` are reserved with `0.0.0` placeholders (README only, `UNLICENSED`, no `bin`), published by Rodrigo from his own account. This amends D12 only on the name: distribution stays GitHub-first and no real release goes to npm until Rodrigo decides. Homebrew has no reservation; a personal tap `<user>/homebrew-chicla` is created at the first release (C5.5), homebrew-core is not a goal | decided (Rodrigo, 2026-10-09); npm placeholders published by Rodrigo on 2026-10-09 (registry shows `0.0.0-stage`, not `0.0.0`; harmless); G-C1 stays his to close |
| D24 | The repository is `https://github.com/n4sc1m3nt0/chicla` (Rodrigo's own account, created 2026-10-09). Whether it is public was NOT verified from the session (GitHub is not reachable from here); G-C1 asks for public so recovery works in a clean chat. The Homebrew tap `n4sc1m3nt0/homebrew-chicla` is created at the first release, not before | stated by Rodrigo (2026-10-09) |
| D25 | `writeZip` determinism (C3.4), proposed by Claude inside the card (the UTC part confirmed by Rodrigo): option `deterministic: true`; dates come from `epoch` (option), else `SOURCE_DATE_EPOCH`, else each source's `mtime`, else 1980-01-01 00:00, all written in **UTC** (so a Mac in Lisbon and a CI in UTC give the same bytes; the default stays local time, as Info-ZIP reads it) and clamped to 1980-01-01 00:00:00 .. 2107-12-31 23:59:58; an invalid epoch is an error, never ignored; modes 0644 (0755 for folders and files with the owner execute bit, as git); the order of the sources is kept (walking a tree in fixed order is C3.5) | decided (Rodrigo confirmed UTC, 2026-10-09; the rest was proposed by Claude in round 22 and he did not object) |
| D26 | `createZip(out, root, { exclude, symlinks, ...writeZipOptions }) -> { entries, bytes, skipped }` (C3.5), PROPOSED by Claude inside the card, for Rodrigo to confirm or overturn: depth-first walk, siblings sorted by the bytes of their names, a folder before its contents, the root itself not an entry; `exclude(rel, { isDir })`; symlinks never followed (`skip` reports them, `error` refuses with `ESYMLINK`; a file swapped for a symlink after listing is caught by `O_NOFOLLOW`); sockets, FIFOs and devices skipped as `special`; the output inside the tree is `ERECURSE` (symlinks resolved); a root that is a symlink to a folder is accepted (the user named it); a name on disk that is not valid UTF-8 or is unsafe is `EUNSAFE`; files are read whole until C3.7 | decided (proposed by Claude, round 24; confirmed by Rodrigo, 2026-10-09) |
| D27 | `sha256` and change detection (C3.6), PROPOSED by Claude inside the card, for Rodrigo to confirm or overturn: `writeZip(out, sources, { sha256: false })`: `true` adds `sha256` (hex) to every FILE entry returned (folders get none), computed in the same blocks as the crc32; off by default so nothing slows down for callers that do not need it; not a boolean is `EARG`. `createZip` passes it through and refuses with `ECHANGED` (nothing written) when a file is not the one listed or moves while it is read: size, mtime, ctime and inode are compared at the listing, at the open and after the read, and the bytes read must equal the size. Refusing, not skipping or retrying, because a zip of a half-written file looks valid to every reader; a `changed: "skip"` policy (like `symlinks`) is NOT built: say if the dump needs it. Limit: a rewrite of the same size inside the mtime/ctime clock resolution is not seen | decided (proposed by Claude, round 25; confirmed by Rodrigo, 2026-10-09; no `changed: "skip"` policy now, to be opened if the dump (C9) needs it) |
| D28 | UT extra in the writer (C3.8), PROPOSED by Claude inside the card, for Rodrigo to confirm or overturn: `writeZip(out, sources, { extendedTime: false })`; `true` writes the extended-timestamp extra (0x5455, flags 1, mtime as signed 32-bit seconds, 9 bytes) in every local header and central entry, from the same time the DOS stamp uses, cut to whole seconds and not clamped to 1980..2107; a time after 2038-01-19 03:14:07 UTC gets none (DOS stamp only). OPT-IN, not default, because it was measured that with ANY extra present Info-ZIP `unzip`/`zipinfo` 6.00 in a non-UTF-8 locale (C/POSIX) lists and extracts non-ASCII names as `caf#U00e9` (the same zip without an extra gives `café`; data and exit status are fine; UTF-8 locales are fine). Alternative: on by default (exact mtimes everywhere, but that mangling for C-locale `unzip` users). `createZip` passes the option through | decided (proposed by Claude, round 27; opt-in confirmed by Rodrigo, 2026-10-09) |
| D29 | `writeZipStream(sink, sources, opts) -> { entries, bytes }` (C3.7), PROPOSED by Claude inside the card, for Rodrigo to confirm or overturn: a separate function (not an option of `writeZip`) that writes to a Node Writable; sources `{ name, data }`, `{ name, stream }` (async or sync iterable, Readable, or a function returning one) and folders; options as `writeZip`. Every file is streamed: bit 3, local header with crc and sizes 0, deflate always (level 0 and already-compressed names use stored blocks, because a stored entry with a descriptor cannot be streamed), 24-byte descriptor with 8-byte sizes. Consequence, chosen for simplicity: sizes are unknown up front, so EVERY file entry is zip64 and `zip64: false` is `EZIP64` (a `size` hint that allows 4-byte descriptors is NOT built: say if a reader needs it). Side effect: Info-ZIP 6.00 in a C locale shows `caf#U00e9` for non-ASCII names of those entries (ROADMAP risks); data and exit status are fine. The sink is ended on success and destroyed on failure (a caller that wants an atomic file writes to `<out>.partial` and renames). `createZip` does NOT use it yet (C3.7b) | decided (proposed by Claude, round 29; confirmed by Rodrigo, 2026-10-09) |
| D30 | `createZip` in streaming mode (C3.7b), PROPOSED by Claude inside the card, for Rodrigo to confirm or overturn: `createZip(out, root, { stream = false, ... })`. `out` a Writable: always streamed to it (`stream: false` is `EARG`), ended on success and DESTROYED on any failure, also when createZip refuses before writing (a file stream's `path` still counts for `ERECURSE`). `out` a path and `stream: true`: written to `<out>.partial` through `writeZipStream`, fsync (second read-only descriptor), atomic rename; the `.partial` is removed on failure and an existing `out` is left as it was. Without `stream` nothing changes (files read whole, `writeZip`). The tree is LISTED first (lstat only); each file is opened when the writer reaches it and read in slices of at most 1 MiB; size, mtime, ctime and inode are compared at the listing, at the open and after EACH slice (a file that grows or moves stops the read at once), and the bytes read must be the size: `ECHANGED`. Choice to confirm: in this mode a file that vanished, became a symlink or stopped being a regular file after the listing is `ECHANGED` too (the entry is already planned, it cannot be skipped as in the whole-file mode). Consequence: the time between listing and open can be long on a big tree, and a mere `chmod` (ctime) in that gap refuses the run; there is still no `changed: "skip"` policy (D27). It builds on D29: if D29 is overturned, this changes with it | decided (proposed by Claude, round 30; confirmed by Rodrigo, 2026-10-09) |
| D31 | The WRITER refuses a name with an empty or `.` path segment (`./x`, `a//b`, `a/./b`, `a//`) with `EUNSAFE`, in `writeZip` and `writeZipStream`, before anything is written (AUDIT-2, A-3). Reason: such a name and its plain twin pass `unzip -t` and Python, Chicla's extractor refuses the pair as a duplicate and `unzip` keeps the last. The reader and the extractor are unchanged: a unique `./x` from another tool still extracts | decided (proposed by Claude, round 32; confirmed by Rodrigo, 2026-10-09) |
| D32 | Equivalent names in the writer (NFC/NFD, case-only) are REPORTED, never refused: a `collisions` list in the result of `writeZip`, `writeZipStream` and `createZip`, as the extractor does (AUDIT-2, B-1; card C3.9). Nothing is changed in the writer until Rodrigo confirms | decided (proposed by Claude, round 32; confirmed by Rodrigo, 2026-10-09) |
| D33 | `markUtf8Names` (C4.1) checks EVERY entry (local signature and bounds) before writing the first byte, so a bad entry leaves the file untouched; before, entries earlier in the list had already been patched when it threw. Behaviour otherwise as documented (bit 11 on non-ASCII, valid UTF-8, unflagged entries; idempotent) | decided (proposed by Claude, round 33; confirmed by Rodrigo, 2026-10-09) |
| D34 | Command line contract (C4.2a), PROPOSED by Claude inside the card, for Rodrigo to confirm or overturn: exit codes **0** ok, **1** the command ran and failed (any `ZipError`, or a system error such as `ENOENT` on the zip), **2** usage, **3** internal error (anything else, stack on stderr); warnings (unsafe names, missing UTF-8 flag) never change the code. `--json` (first on `ls` and `test`): exactly ONE line on stdout, `{ ok: true, command, ... }` or `{ ok: false, error: { code, message } }` (`EUSAGE` for exit 2, `EINTERNAL` for 3), stderr empty; without it a failure is «✗ message» on stderr and stdout stays empty. `cat` writes the raw bytes only and has no `--json` (usage error). An unknown option or a wrong number of arguments is a usage error (before, unknown options were ignored). `runCli(argv, { out, err })` is exported and never ends the process. `--json` is accepted by every command but `cat` since C4.2b | CONFIRMED by Rodrigo (round 37, 2026-10-09) |
| D35 | `create` on the command line replaces an existing output (as `createZip` does) while `extract` refuses an existing target without `--overwrite` (AUDIT-3 §3). PROPOSED by Claude (round 39): `create` refuses with `EEXIST` unless `--overwrite`; `--help`/`-h` exits 0 with the usage on stdout. Card C4.4 | CONFIRMED by Rodrigo (round 40, 2026-10-09) |
| D36 | C0.4 does not fit one round (13 files, about 360 lines with Portuguese; rule 16 allows 3 files), so it goes in slices, each a script and the smoke test that asserts its messages, changed together so the tree stays green: a, b, c, d, e as in the card. PROPOSED by Claude (round 44), for Rodrigo to confirm or overturn: slice d has 4 files; suggestion: allow the 4 (text only, one smoke test covers all three scripts; splitting would leave the smoke test red between rounds) | CONFIRMED by Rodrigo (round 45, 2026-10-09), including the 4 files of slice d |
| D37 | C5.2 differential test (round 49), PROPOSED by Claude, for Rodrigo to confirm or overturn: it lives in `npm test` with 30 random trees by default (about 10 s; `CHICLA_DIFF_N` and `CHICLA_DIFF_SEED` for a longer soak or one reproduction), and it runs unzip, zipinfo and Python with `LC_ALL=C.UTF-8` so the known unzip 6.00 non-UTF-8 quirk (C3.8) does not drown real differences; the oracle is the generated tree, not either implementation | decided (Rodrigo, 2026-10-10, round 50) |
| D38 | C5.3 mutants (round 50), PROPOSED by Claude, for Rodrigo to confirm or overturn: the list runs ON DEMAND (`npm run mutants`, about 65 s for 8 entries, each entry runs only the test files that must catch it) and is NOT part of `npm test` or CI, because it rewrites the source in a copy and grows with every round; its smoke test (`scripts/smoke-test-mutants.mjs`) is in `npm run smoke`, so CI checks the runner but not the list. An entry that survives without a written reason, whose text is no longer in the source, or that no longer parses, fails the run; an explained survivor that starts to die fails it too | decided (Rodrigo, 2026-10-10, round 51) |
| D39 | C5.3b writer split (round 53), PROPOSED by Claude, for Rodrigo to confirm or overturn (the original D39 text was lost with an interrupted session; this is a reconstruction from the comment in `mutants/list.mjs`): the writer mutants (M3) go in two slices: slice 3 = `writeZip` (23 entries, done in round 53), slice 4 = the same lines of `writeZipStream` and `createZip` | decided (confirmed by Rodrigo, 2026-10-10) |
| D40 | `ls --json` with a zip date of zero (round 57, card C4.5), PROPOSED by Claude, for Rodrigo to confirm or overturn: `mtime` is `null` in the JSON when the zip holds no valid date (DOS month or day 0, or an invalid date), the same as an unreadable date already is; the text output is unchanged; exit 0. One line in `runCli` plus a test and the mutant `M4-ls-json-mtime`. Alternative: leave it (zips with a zero date are rare; `unzip` shows `1980-00-00`) | CONFIRMED by Rodrigo (round 57 reply, 2026-10-10); to be built as C4.5 |
| D41 | `chicla-zip` and `chicla-kit` are ALSO published on npm from 0.1 (round 58). Replaces the «no npm» part of D12 and rule 4 of `CLAUDE.md`; G-C6 changes with it. GitHub stays the source (tag and release with the `.tgz`); the names are the ones reserved in D23. Rules: only Rodrigo publishes (login and 2FA), the AI never runs `npm publish`; the licence (G-C2) is decided BEFORE the first real publish; publication goes through CI with npm provenance when that exists; a `files` allowlist in each `package.json`; the placeholders' odd version `0.0.0-stage` is left alone. Open for later: who owns the `chicla` command name when both packages ship a `bin` | CONFIRMED by Rodrigo (2026-10-10, «d41 sim»); PROPOSED by Claude (round 57) |
| D45 | CI `bench` job (round 63, card C5.4): separate job, Linux, Node 22, tmpfs, `--runs 5 --budget 3`; it FAILS the CI when above 3x (D15); the other benches (`zip64-real`, `stream-real`, several GB) stay manual | PROPOSED by Claude, for Rodrigo to confirm or overturn |
| D44 | The `/dump` sentence stops saying «and the last delivery zip» (item 17, `CLAUDE.md`) only AFTER the G-C7 rehearsal shows a recovery with no zip (round 61) | CONFIRMED by Rodrigo (2026-10-10); PROPOSED by Claude; not applied yet |
| D43 | Baseline of the dump (round 60, card C9.6): a NEW file `FILES.baseline.json` written by `make-delivery-zip` after the manifest (path, size, sha256 of every file of the tree, itself excluded, with a sha256 seal over the list); `FILES.manifest` and C7.1 untouched; the old `--baseline <zip>` still accepted and wins; a cut or edited baseline is refused with `EBASELINE_PARSE`/`EBASELINE_FORMAT`/`EBASELINE_SEAL` | CONFIRMED by Rodrigo (2026-10-10); PROPOSED by Claude |
| D42 | Audience of 0.1 (round 58): `chicla-zip` is a product on its own for any programmer (safe extraction, deterministic zips, UTF-8 names); `chicla-kit` is the layer for work with coding agents, with the verified delivery (manifest, `verify-delivery`, the «never leaves» policy) as the bridge for people who code by hand. The README of 0.1 says it this way | CONFIRMED by Rodrigo (2026-10-10, «público sim»); PROPOSED by Claude (round 57) |

## 3. Regras de ferro

(Herdadas do Cedar, adaptadas.)

1. **Testes primeiro.** Cada cartão começa por testes que falham; se passarem antes do código, o teste não protege nada.
2. **Estragar de propósito.** No fim de cada marco, quebrar cada garantia e ver o teste respetivo ficar vermelho; depois automatizar a lista de mutantes.
3. **Um leitor independente confirma.** Tudo o que o Chicla escreve ou altera tem de ser aceite por `unzip -t` e pelo `zipfile` do Python, não só pelo próprio Chicla (foi assim que o bug do `mark` apareceu).
4. **Uma tarefa por ronda:** no máximo 3 ficheiros-fonte e cerca de 200 linhas; se crescer, parar na costura mais próxima.
5. **Honestidade:** dizer sempre o que não foi corrido; o que não se corre vira gate para ti.
6. **Nada meio ligado:** cada ronda entrega algo que compila, testa e não parte o resto.

## 4. Arquitetura

```
chicla/
  packages/
    chicla-zip/   src/{read,names,crc,extract,write,mark,cli}.mjs   test/
    chicla-kit/   src/{policy,manifest,fingerprint,delivery,dump,recovery,agents,cli,update}.mjs   templates/   test/
  CLAUDE.md   CHICLA_PROJECT_STATUS-N.md   CHANGELOG.md   ROADMAP.md   FILES.manifest   version.mjs
  scripts/   bump-round  check-manifest  check-build  make-delivery-zip  verify-delivery-zip
             archive-changelog  emergency-dump  recovery-report  smoke-test-*
  docs/      (nasce quando houver o que documentar: zip-handling, fingerprint, state-file)
```

API esboçada do `chicla-zip` (a fixar entre o M1 e o M3):

```js
const z = await openZip(path)      // handle reutilizável: entries, read(name), stream(name), test(), close()
await extractZip(path, dest, { maxTotalBytes, maxEntries, filter })
const r = await createZip(out, source, { exclude, symlinks, deterministic, hash })   // r = { entries, hashes }
markUtf8Names(path)                // só para reparar zips de terceiros
```

O `chicla-kit` só depende do `chicla-zip` por esta API; o dump importa-o dentro de `try/catch` e cai para `zip`/`tar` se falhar.

## 5. Garantias do chicla-zip (cada uma com teste)

**Leitor.** Nomes: extra 0x7075 com CRC > bit 11 > UTF-8 válido > cp437 (com opção `legacyEncoding`). CRC-32 e tamanho conferidos. Streaming: só a central directory e, em `read`, um ficheiro dentro do limite vão para memória. Recusas claras: cifra, outros métodos, várias partes, zip truncado, central directory corrompida.

**Extração.** Valida **tudo** antes de escrever: nomes inseguros, duplicados, conflitos ficheiro/pasta, limites de bytes e de entradas. Extrai para uma pasta temporária no mesmo volume e só no fim faz `rename`: se algo falhar, **o destino fica intocado**. Nunca cria nem atravessa symlinks, cria ficheiros em modo exclusivo, retira setuid/setgid, não confia nos tamanhos declarados. Colisões NFC/NFD e de maiúsculas são reportadas em `collisions` quando o sistema de ficheiros as distingue (Linux); num sistema que as funde (macOS, Windows) o segundo ficheiro é recusado com `ECOLLISION` e nada fica escrito (D16).

**Escritor.**

- Bit 11 sempre nos nomes não-ASCII; os nomes gravados são os verdadeiros do disco, sem normalizar.
- Stored ou deflate: deflate, exceto nomes de ficheiros já comprimidos (`NO_DEFLATE`), e só se o resultado for menor do que o original; nível configurável. Em stream todos os ficheiros vão em deflate (blocos stored no nível 0 e nos nomes `NO_DEFLATE`), D29.
- Saída para ficheiro: escreve para `<out>.partial` (o que lá estiver é removido primeiro e o ficheiro é criado em modo exclusivo, sem seguir symlinks: AUDIT-2 A-1), com os cabeçalhos locais já com CRC e tamanhos (os dados estão em memória: sem data descriptor), `fsync`, `rename` atómico e `fsync` da pasta. Saída para stream: data descriptor.
- zip64 automático (a partir de 4 GiB − 1 ou de 65 535 entradas; até ao C3.3 o escritor recusa com `EZIP64`).
- Determinístico (`deterministic: true`, C3.4, D25): mesmos bytes em qualquer máquina, dia e fuso. Datas de `epoch`, de `SOURCE_DATE_EPOCH` ou do mtime de cada origem (sem data: 1980-01-01 00:00), em UTC e limitadas a 1980–2107; modos 0644/0755; a ordem das origens mantém-se (a travessia de uma árvore em ordem fixa é do C3.5).
- Origem por lista ou raiz com **predicado de exclusão** (acaba com os padrões `-x` e com o passo do dump que repõe `.gitkeep` e `.env.example`).
- Nunca segue symlinks (política `skip` por omissão, com relatório); recusa nomes inseguros (incluindo segmentos vazios ou `.`, D31) e recusa escrever dentro da própria árvore de origem.
- Calcula **crc32 e sha256 na mesma passagem** e devolve-os (para o manifesto e o marcador do dump); deteta ficheiros que mudaram durante a leitura.
- Tudo o que escreve é lido pelo leitor do Chicla e pelas ferramentas independentes.

**Orçamento de desempenho.** Ficheiros grandes: no máximo 1,5× o `unzip`. 20 000 ficheiros pequenos: no máximo 3× o `unzip`, medido em tmpfs (D15; o rascunho estava em 14×).

## 6. Marcos e cartões

Tamanhos: S (ronda curta), M (uma ronda). Cada cartão escreve os testes antes.

### M0 — Fundação

| ID | Cartão | Tam. |
| --- | --- | --- |
| C0.1 | Repo, workspaces, CI com Node 18/20/22 em Linux e macOS | S |
| C0.2 | Copiar para o repo os 8 scripts do Cedar (bump-round, check-manifest, check-build, make/verify-delivery, archive-changelog, emergency-dump, recovery-report) e os 5 testes de fumo. Ajustes: nomes, `package.json` como marcador de raiz, `version.mjs` como perna app do fingerprint (D13), `check-build` passa a `node --check` e sai a regra `target/` do Cargo. Ainda usam `unzip` e `zip` | S |
| C0.3 | `CLAUDE.md`, `CHICLA_PROJECT_STATUS-1.md`, `CHANGELOG.md` com fingerprint, este roadmap | S |
| C0.4 | Messages and comments of the inherited scripts in `scripts/` from Portuguese to English (D18); their smoke tests must stay green. In slices (D36, rule 16 of 3 files): **a** `archive-changelog` + its smoke test (done, round 44); **b** `check-build` + smoke (done, round 45); **c** `bump-round` + smoke (done, round 46); **d** `make-delivery-zip`, `check-manifest`, `verify-delivery-zip` + `smoke-test-delivery-guards` (done, round 47); **e** `emergency-dump`, `recovery-report` + `smoke-test-emergency` (done, round 48; C0.4 closed) | S |

### M1 — Leitor

| ID | Cartão | Tam. |
| --- | --- | --- |
| C1.1 | Entrar o rascunho (`Readable.from` corrigido) e escrever primeiro os testes de leitura do plano; ver falhar | M |
| C1.2 | `openZip` com handle; `readCentral` devolve `cdOff`; `readZipFile` deixa de reler a central directory | S |
| C1.3 | Nomes (0x7075, bit 11, UTF-8, cp437) e `legacyEncoding` | S |
| C1.4 | CRC com `zlib.crc32` por deteção de funcionalidade e alternativa em JS; teste de equivalência (confirmado em 2026-10-08 pelas notas de lançamento do Node: existe desde o 20.15.0 e o 22.2.0; não no 18) | S |
| C1.5 | zip64 na leitura e recusas claras | S |

### M2 — Extração segura e atómica

| ID | Cartão | Tam. |
| --- | --- | --- |
| C2.1 | Pasta temporária + `rename`; uma falha nunca deixa nada no destino | M |
| C2.2 | Pré-validação completa (ficheiro vs pasta, duplicados, entrada `.` reportada, limites) | M |
| C2.3 | Caminho rápido para entradas pequenas e cache de pastas; cumprir o orçamento de 3× (D15) | M |
| C2.4 | Oráculo de fuga (fotografia da pasta-mãe antes e depois) e fuzz de extração | M |
| C2.5 | Colisões NFC/NFD e de maiúsculas em `collisions` | S |
| C2.6 | `extractZip` aceita e usa `legacyEncoding` (AUDIT-1, A-5) · feito na ronda 14 | S |
| C2.7 | Fusão em destino existente: reverter ou reportar os `rename` já feitos se um falhar (AUDIT-1, A-4) · feito na ronda 43: reverte; `EPARTIAL` com `leftBehind` e `backupDir` se o rollback falhar; `test/extract-rollback.test.mjs` (9 testes) | M |
| C2.8 | `EXDEV` num bind mount: recuar para a pasta temporária dentro do destino (AUDIT-1, A-6) · feito na ronda 42: `test/extract-exdev.test.mjs` (6 testes, um com `mount --bind` real) | S |

### M3 — Escritor

| ID | Cartão | Tam. |
| --- | --- | --- |
| C3.1 | Testes de interoperabilidade primeiro: `unzip -t`, Python `zipfile`, `zipinfo`, 7z se existir; ida e volta com o leitor · feito na ronda 15 (`test/interop.mjs`, `interop.test.mjs`, `write-interop.test.mjs`; ficam `todo` até o C3.2 exportar `writeZip`) | S |
| C3.2 | Núcleo: stored + deflate, bit 11, saída para ficheiro com correção de cabeçalhos e `rename` atómico. Ficheiros vazios em stored (o `unzip` recusa deflate vazio); contrato provisório em `write-interop.test.mjs` · feito na ronda 20 (`writeZip` em `zipkit.mjs`, `test/write.test.mjs`; fixou-se o contrato: `writeZip(out, sources, { level }) -> { entries, bytes }`) | M |
| C3.3 | zip64 e 65 535 entradas ou mais (0xFFFF e 0xFFFFFFFF são marcadores zip64: sem zip64 o máximo são 65 534 entradas e 4 294 967 294 bytes por valor; o C3.2 recusa com `EZIP64`) · feito na ronda 21: registos zip64 só onde um valor não cabe, `zip64: true` para tudo, `zip64: false` recusa com `EZIP64`; dados acima de 4 GiB comprimidos e somados por blocos; `bench/zip64-real.mjs` | M |
| C3.4 | Determinismo e datas · feito na ronda 22 (D25): `writeZip(..., { deterministic, epoch })`, datas em UTC e limitadas a 1980..2107, modos normalizados, `SOURCE_DATE_EPOCH`; `test/write-determinism.test.mjs` (15 testes) | S |
| C3.5 | Predicado de exclusão, política de symlinks, anti-recursão, nomes inseguros · feito na ronda 24 (D26): `createZip(out, root, opts)` em `zipkit.mjs`, `test/create.test.mjs` (18 testes); a travessia em ordem fixa também é daqui | S |
| C3.6 | crc32 + sha256 na mesma passagem; deteção de ficheiro alterado durante a leitura · feito na ronda 25 (D27): opção `sha256` em `writeZip` (e `createZip`), `ECHANGED` em `createZip`; `test/digest-changed.test.mjs` (15 testes) | S |
| C3.7 | Saída para stream com data descriptor (o `writeZip` de C3.2/C3.3 tem os dados em memória: ficheiros maiores do que a RAM só com este cartão) · feito na ronda 29 (D29, proposta): `writeZipStream(sink, sources, opts)` em `zipkit.mjs`; `test/write-stream.test.mjs` (18 testes); `bench/stream-real.mjs` (4,1 GiB em stream, pico de 61 MiB de RSS, `unzip`, Python e `testZip` aceitam) | S |
| C3.7b | `createZip` em stream: ler os ficheiros às fatias (com `ECHANGED` durante a leitura) e escrever com `writeZipStream`, para um ficheiro maior do que a RAM ir do disco ao zip; saída para um Writable ou para `<out>.partial` + `rename` · feito na ronda 30 (D30, proposta): `createZip(out, root, { stream: true })` e `createZip(<Writable>, root)` em `zipkit.mjs`; `test/create-stream.test.mjs` (18 testes); fecha o M3 | S |
| C3.8 | Extra de data estendida (UT, 0x5455) no escritor, para que o `mtime` volte exato no modo determinístico (o leitor já a prefere à data DOS, que lê como hora local) |  · feito na ronda 27 (D28): opção `extendedTime` (opt-in) em `writeZip` e `createZip`; `test/write-ut.test.mjs` (13 testes) | S |
| C3.9 | Relatar nomes equivalentes (NFC/NFD, só maiúsculas) no escritor: `collisions` no resultado de `writeZip`, `writeZipStream` e `createZip` (AUDIT-2, B-1; D32 confirmado pelo Rodrigo, 2026-10-09) · feito na ronda 34 (D32): `collisions` no resultado de `writeZip`, `writeZipStream` e `createZip` (mesma política do extractor, só relata); `test/write-collisions.test.mjs` (31 testes) | S |

### M4 — Reparação e linha de comandos

| ID | Cartão | Tam. |
| --- | --- | --- |
| C4.1 | `markUtf8Names` corrigido (offset absoluto), idempotente, confirmado por leitor independente · feito na ronda 33 (D33, proposta): `test/mark-utf8.test.mjs` (14 testes); abre o M4 | S |
| C4.2 | CLI `ls`, `test`, `cat`, `extract`, `create`, `mark`, com `--json` e códigos de saída; dividido na ronda 36 em C4.2a e C4.2b | M |
| C4.2a | `runCli` exportado, códigos de saída 0/1/2/3 e `--json` em `ls` e `test`; `cat` em bruto; `extract` e `mark` mantêm-se e ganham os códigos · feito na ronda 36 (D34, proposta): `test/cli.test.mjs` (28 testes, processos reais) | S |
| C4.2b | `create <zip> <folder>` (`--exclude`, `--stream`, `--deterministic`, mostra `collisions`) e `--json` em `extract` e `mark` · feito na ronda 38: `test/cli-create.test.mjs` (18 testes, processos reais, leitores independentes) | S |
| C4.3 | `docs/zip-handling.md`: porquê (bit 11, locales, `-UU` vs `ditto`), garantias, limites · feito na ronda 35: `docs/zip-handling.md` (só documentação; diz B-2, B-3, `collisions` e o que não foi verificado) | S |
| C4.4 | `create` refuses an existing output unless `--overwrite` (D35, proposta, como o `extract`) e `--help`/`-h` com saída 0 · feito na ronda 40: `test/cli-c44.test.mjs` (9 testes) | S |
| C4.5 | `ls --json` falha com `EINTERNAL` (saída 3) num zip cuja data DOS é 0 (mês ou dia 0): `dosDate` devolve `null` e `Number.isNaN(+null)` é falso, por isso `null.toISOString()` rebenta; achado na ronda 57 ao escrever o mutante `M4-ls-json-mtime` (fora da lista até haver correção); o `ls` em texto não usa a data. Corrigido na ronda 59 (D40 confirmada): `mtime: null` quando o zip não tem data válida; `test/cli-m4-gaps.test.mjs` +3 e 2 mutantes `M4-ls-json-mtime-*` · feito | S |

### M5 — Endurecimento e chicla-zip 0.1

| ID | Cartão | Tam. |
| --- | --- | --- |
| C5.1 | Fuzz de leitura: milhares de mutações de zips válidos; só pode sair `ZipError`, sem bloqueios nem escritas fora do destino · feito na ronda 41: `test/fuzz-read.test.mjs` (9 testes: fuzz com sementes + 8 casos «tem de ser recusado»); achou `testZip` a deixar passar um erro cru do zlib | M |
| C5.2 | Teste diferencial com o `zipfile` do Python em árvores aleatórias · feito na ronda 49 (D37): `test/differential-python.test.mjs` (31 testes: árvores aleatórias escritas pelo Chicla e lidas pelo Python, e escritas pelo Python e lidas e extraídas pelo Chicla); 430 árvores sem divergência; 8 mutantes, todos vermelhos | M |
| C5.3 | Lista automatizada de mutantes que têm de ficar vermelhos · feito na ronda 50 (D38): `scripts/mutants.mjs` (corre cada mutante numa cópia do pacote e exige que os testes indicados falhem; recusa mutantes obsoletos, que não compilam ou que sobrevivem sem explicação) + `packages/chicla-zip/mutants/list.mjs` com os 8 mutantes da ronda 49 (todos vermelhos) + `scripts/smoke-test-mutants.mjs`; `npm run mutants` | M |
| C5.3b | Repor na lista os mutantes das rondas anteriores (M2 a M4 e C5.1), um marco por ronda, cada um com o texto exato e os testes que o apanham · fatia 1 feita na ronda 51 (17 mutantes da AUDIT-1: V1 a V6, A1 a A3, A8 a A10, S2, P1, P6, R1, R2); fatia 2 feita na ronda 52 (22 mutantes de `extractZip`: S1, A12, A13, A15, C1, C2, X1, R14, os da C2.8 e da C2.7, e 7 sobreviventes explicados); fatia 3 feita na ronda 53 (23 mutantes de `writeZip`, M3-*, 2 sobreviventes explicados; D39 proposta); fatia 4 feita na ronda 54 (61 mutantes de `writeZipStream` e `createZip`, M3s-* e M3c-*, 11 sobreviventes explicados; `test/stream-limits.test.mjs`); fora de propósito P3, P4 e P5 (morrem noutro sistema de ficheiros ou fora de root); fatia 5 feita na ronda 56 (31 mutantes M2-*, rondas 7 a 12: nomes inseguros, colisões, fusão, contagens, `filter`, modos, datas, umask; 7 sobreviventes explicados; `test/extract-m2-gaps.test.mjs`); fatia 6 feita na ronda 57 (56 mutantes M4-* da linha de comandos: códigos de saída, análise dos argumentos, `--json`, escape de nomes, texto de cada comando; 3 sobreviventes explicados; `test/cli-m4-gaps.test.mjs`); fatia 7 feita na ronda 62 (9 mutantes C5.1-* do leitor, 3 sobreviventes explicados; lista de 229, corrida inteira): **C5.3b fechada** | M |
| C5.3c | O runner de mutantes escreve o progresso em stderr (baseline e uma linha `[i/n] ESTADO id segundos` por mutante); stdout igual · feito na ronda 55 | S |
| C5.4 | Benchmarks com orçamento no CI | S · feito na ronda 63 (job `bench`, orçamento 3×; a bench recusa argumentos ilegíveis); falta ver a primeira corrida no GitHub (G-C9) |
| C5.5 | Gates G-C3, G-C5, G-C6 → lançar `chicla-zip` 0.1.0 (tag e release no GitHub) | gate |

### M6 — Política única

| ID | Cartão | Tam. |
| --- | --- | --- |
| C6.1 | `policy` configurável com as regras «nunca sai» num só sítio (presets cargo, node, python); acaba a duplicação em 4 scripts e remove as regras herdadas do Cedar (`corpus/real-world`, `corpus/huge`) | M |
| C6.2 | Modo allowlist: o despejo só leva a raiz do projeto; o resto é opt-in | S |
| C6.3 | Lista alargada (`.ssh`, `.aws`, `.npmrc`, `.netrc`, `.git-credentials`, `*.pem`, `id_rsa*`) e detetor de padrões de segredos que exclui o ficheiro e reporta só o nome | M |
| C6.4 | Teste do marcador secreto estendido a estes casos | S |

### M7 — Manifesto

| ID | Cartão | Tam. |
| --- | --- | --- |
| C7.1 | Formato v2: caminho + crc32 + tamanho (sha256 opcional); lê o v1 | M |
| C7.2 | Verificar contra a central directory sem descomprimir; apanha ficheiros truncados, vazios ou trocados por versões antigas | S |
| C7.3 | Comparação em NFC e colisões | S |

### M8 — Entrega

| ID | Cartão | Tam. |
| --- | --- | --- |
| C8.1 | `make-delivery` com `createZip`, sem `zip` externo | M |
| C8.2 | `verify-delivery` com `chicla-zip`; bit 11 obrigatório só na entrega, não nos `--against` | S |
| C8.3 | `--against` e `--allow-removed` portados | S |

### M9 — Dump e recovery

| ID | Cartão | Tam. |
| --- | --- | --- |
| C9.1 | Dump com `createZip`: exclusão por predicado, hashes na mesma passagem, hash em streaming, limite de hash reportado no marcador | M |
| C9.2 | Pasta `RECOVER/` com nomes ASCII (`chicla-zip` + `recovery-report`) e o sha256 do toolchain no marcador; o arranque passa a `unzip -p dump.zip RECOVER/…`, sem listar com `-Z1` e filtrar com `grep` | M |
| C9.3 | Colisões NFC/NFD no topo do relatório e na consola; o despejo sai sempre | S |
| C9.4 | `recovery-report` extrai com `chicla-zip` e confere o hash do toolchain contra o valor fixado no `CLAUDE.md` | M |
| C9.5 | Caminho de emergência com `zip`/`tar`; teste que força a falha do módulo e confirma que o despejo sai | S |
| C9.6 | The dump carries its own baseline: a list of path, size and sha256 of the files of the last delivery (built from the delivery's manifest), so `recovery-report` and the final `make-delivery-zip --against` no longer need the previous delivery zip; with the old `--baseline <zip>` still accepted. Asked by Rodrigo after he found recovery mode weak: it always needed the previous round's zip (round 57). Needs a manifest with hashes (C7.1) or its own list; tests: a dump recovered with NO zip at hand, a dump whose baseline list was cut or edited is refused | M · confirmed by Rodrigo (2026-10-10) · feito na ronda 60 (D43) |
| C9.7 | `verify-delivery-zip` requires `FILES.baseline.json` and checks it against the zip (list, size, sha256; `EBASELINE_*`). Found in round 60 | S · confirmed by Rodrigo (2026-10-10) · feito na ronda 61 |

### M10 — Estado e fingerprints

| ID | Cartão | Tam. |
| --- | --- | --- |
| C10.1 | `bump-round` configurável (nome do ficheiro de estado, caminhos) | M |
| C10.2 | Perna «toolchain» no fingerprint (hash dos scripts) | S |
| C10.3 | Documentar que fingerprints e CRC são integridade, não autenticidade | S |
| C10.4 | Especificar as pernas do fingerprint em `docs/fingerprint.md`: o que cada perna cobre e como se calcula, extraído dos scripts do Cedar; teste que falha se a spec e o código divergirem | S |
| C10.5 | Formato do ficheiro de estado em `docs/state-file.md`: secções obrigatórias e o que a sessão seguinte lê primeiro; validação no `bump-round` (recusa um ficheiro de estado incompleto) | M |

### M11 — CLI do kit, atualização e Windows

| ID | Cartão | Tam. |
| --- | --- | --- |
| C11.1 | CLI `chicla` do kit: subcomandos `bump-round`, `check-manifest`, `make-delivery`, `verify-delivery`, `dump` e `recovery`, com `--json` e códigos de saída; os scripts passam a invólucros finos sobre o mesmo código | M |
| C11.2 | Testes do CLI: cada subcomando dá o mesmo resultado que o script que substitui; `dump` sai sempre com código 0, mesmo com o módulo avariado | S |
| C11.3 | `chicla update`: compara os templates e scripts do projeto com os da versão instalada, mostra o diff e não sobrescreve alterações locais sem confirmação; sempre manual | M |
| C11.4 | Windows: o CLI deteta o sistema e recusa com mensagem clara em vez de falhar a meio; o limite fica documentado e o caminho de emergência continua descrito | S |
| C11.5 | Terminal look of the kit CLI, with NO dependencies (D3): a `ui.mjs` of pure drawing functions (data in, text out: boxes, aligned tables, bars, spinners, colour) and, with no arguments on a TTY, a navigable panel (status, gates, open decisions, last delivery; arrows and `q`). Only on an interactive terminal: a pipe, `--json`, CI and `NO_COLOR` get today's plain text; exit codes and `--json` do not change. An optional `chicla-tui` package with dependencies (Ink) is NOT part of this card. After C11.1 (it needs the commands to show) | M · confirmed by Rodrigo (2026-10-10, «c11.5 sim») · NÃO feito |

### M12 — Agentes

| ID | Cartão | Tam. |
| --- | --- | --- |
| C12.1 | `chicla init` com templates de instruções: `CLAUDE.md` e `AGENTS.md` (confirmar quais agentes o leem à data) | M |
| C12.2 | `/dump` como comando do Claude Code; para os outros, regra de texto | S |
| C12.3 | Ciclo completo (dump → recovery → entrega) num projeto-modelo que não é o Cedar | M |
| C12.4 | Caminhos configuráveis (`/home/claude`, outputs) em vez de fixos | S |
| C12.5 | Matriz de agentes confirmada à data: que ficheiro de instruções lê cada um, como se invoca o `/dump` e onde ficam os caminhos; só entram na matriz os agentes confirmados | S |
| C12.6 | `chicla init --agent <nome>` para cada agente da matriz, com teste de que o ficheiro gerado fica no sítio certo e contém as regras (estado, política, dump) | M |

### M13 — Migração e lançamento

| ID | Cartão | Tam. |
| --- | --- | --- |
| C13.1 | Migrar o Cedar para o Chicla, um script de cada vez | M |
| C13.2 | `SECURITY.md`, `CONTRIBUTING`, documentação de utilizador | M |
| C13.3 | ~~Mensagens por chaves pt/en~~ cancelled by D18 | — |
| C13.4 | Gates G-C6 e G-C7 → lançar `chicla-kit` 0.1.0 (tag e release no GitHub) | gate |


### M14 — Windows (D19; decided 2026-10-08, scheduled after 0.1)

| ID | Card | Size |
| --- | --- | --- |
| C14.1 | Name safety for Windows as pure, testable functions (they run on Linux CI): reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1` to `COM9`, `LPT1` to `LPT9`, with or without extension), forbidden characters (`<>:"|?*`), trailing dots and spaces, alternate data streams (`name:stream`), drive-relative and UNC paths, backslash as separator. Tests first | M |
| C14.2 | `extractZip` and the writer apply C14.1 when the platform is Windows (or on request), reported in `skipped`/`problems` like the other unsafe names | M |
| C14.3 | Long paths (over 260 characters, `\\?\` prefix), `rename` over an existing folder, `EPERM`/`EBUSY` from antivirus or open handles (retry with a bound), symlink privileges | M |
| C14.4 | CI on `windows-latest` for Node 18, 20 and 22; the whole `chicla-zip` suite and the independent readers (`7z`, Python; `unzip` where available) | S |
| C14.5 | The CLI stops refusing on Windows (C11.4 is replaced by a support statement); the emergency path works without `zip` | S |

## 7. Primeiras rondas

1. **R0** — C0.1 a C0.3.
2. **R1** — C1.1: testes de leitura escritos e a falhar.
3. **R2** — C1.2 a C1.5: leitor verde.
4. **R3** — C2.1 e C2.2: extração atómica e pré-validação.
5. **R4** — C3.1: testes de interoperabilidade do escritor, a falhar.
6. **R5** — C3.2: núcleo do escritor.

Daqui para a frente, a ordem decide-se com o que os testes mostrarem.

## 8. Relationship with Cedar (rewritten 2026-10-08, D21)

- Cedar is the second project where Rodrigo built this workflow by hand (the first was Paper Golf). The idea of a distributable package came from there, and Cedar will use Chicla while it is developed (C13.1 migrates it, one script at a time).
- The two are separate projects. Cedar's rounds (its PDF engine, its own zip work) are tracked in Cedar and are not blocked by Chicla.
- The scripts of C0.2 come from `cedar-round1s-passo5-2026-10-07.zip`. Until M6 and M13 there are two copies evolving, Cedar's and Chicla's.
- The previous wording of this section (advice on closing Cedar's round 1s) is in the delivery zips up to round 15; the original plan is `docs/zipkit-plan-ronda-1s.md`.

## 9. Gates (só tu)

| Gate | O que fazes |
| --- | --- |
| G-C1 · Nome | Confirmar Chicla; criar o repositório no GitHub (público, para o recovery funcionar num chat limpo); ver que o comando `chicla` não colide com nenhum binário comum. Domínio fica fora |
| G-C2 · Licença | Escolher a licença (a avaliar: MIT ou Apache-2.0) |
| G-C3 · macOS | Correr as suites no teu Mac (Node 18+); inclui, desde a ronda 43, a fusão com `overwrite` num disco exFAT/FAT (o recuo por cópia do C2.7 não foi corrido) |
| G-C4 · Windows | Decidir: fora de âmbito declarado, ou um marco próprio mais tarde. Rodrigo's answer (2026-10-08): own milestone, M14 (D19); he marks the gate done |
| G-C5 · Revisão de segurança | Rever o leitor e o extrator (e, se possível, outra pessoa ou ferramenta) antes de publicar |
| G-C6 · Lançamento | Tag `v0.1.0` e release no GitHub com o `.tgz` de cada package (`npm pack`) e o sha256 nas notas; publicação também no npm (D41), feita pelo Rodrigo e só depois de G-C2 |
| G-C7 · Ensaio | `/dump` e recovery num chat limpo e com pelo menos um agente que não seja o Claude; recovery SEM o zip da última entrega (C9.6, `FILES.baseline.json`) |
| G-C8 · Windows real | Run the M14 suites on a real Windows machine (Node 18+), and report |

## 10. Riscos

- **Escopo.** É grande para um side project com tempo variável. Mitigação: M1 a M5 já são um produto útil e publicável (`chicla-zip`), por isso o resto só avança com isso fechado.
- **Zips que só alguns leitores abrem.** O escritor é código de formato novo; a matriz de interoperabilidade (C3.1) e o leitor independente servem para isto. Conhecido (ronda 21): o `unzip` 6.00 (Info-ZIP, também o da Apple) num locale não-UTF-8 mostra `caf#U00e9` e avisa «mismatching local filename» (`unzip -t` sai com 1) para nomes UTF-8 em entradas com extra zip64; os dados estão certos, o Python, o 7z e o leitor do Chicla leem bem, e com um locale UTF-8 não há aviso. Nada a corrigir no escritor; fica dito no README quando existir.
- **Saída em stream (C3.7).** Todas as entradas de ficheiro saem em zip64 com data descriptor (D29). Verificado com `unzip` 6.00, Python `zipfile` e o leitor do Chicla (também com 4,1 GiB reais); NÃO verificado em macOS (Finder / Archive Utility, `ditto`) nem com 7z. Para nomes não ASCII o `unzip` 6.00 em locale C mostra `caf#U00e9` (como com `zip64: true`).
- **`createZip` em stream (C3.7b).** A listagem e a abertura de cada ficheiro ficam separadas no tempo; numa árvore grande um `chmod` (muda o ctime) nesse intervalo recusa a corrida com `ECHANGED` (D30), e um ficheiro que desapareceu ou virou symlink depois da listagem também (no modo normal seria saltado). O `fsync` faz-se por um segundo descritor de leitura (um stream de `FileHandle` com `autoClose: false` deixa o `fh.close()` pendurado no Node 22). Corrido em Linux com Node 22; NÃO verificado em macOS nem em Node 18 e 20.
- **Datas DOS e fusos (C3.4).** Uma data DOS não tem fuso; as ferramentas leem-na como hora local. O modo determinístico escreve UTC para os bytes não dependerem do fuso, por isso, fora de UTC, quem lê mostra a hora deslocada (o `mtime` não volta exato) até se usar `extendedTime: true` (C3.8, D28), que acrescenta o extra UT. Medido na ronda 27: com qualquer extra presente (UT ou zip64), o `unzip` 6.00 num locale não-UTF-8 extrai nomes não-ASCII como `caf#U00e9`; por isso o UT é opt-in (D28).
- **Desempenho do JS.** Mitigado por `zlib.crc32`, pelo caminho rápido para entradas pequenas e por orçamentos no CI.
- **Convenções dos agentes mudam.** Ficam isoladas nos templates (M12).
- **Executar código vindo de um zip.** O recovery fixa o hash do toolchain (C9.2, C9.4).
- **Nome com colisões.** `chicla` não existia no npm, PyPI, crates.io nem Homebrew (verificado em 2026-10-08, e no npm de novo em 2026-10-09); com a publicação no npm (D41) os nomes reservados em D23 passam a ser usados. Falta verificar o comando `chicla` num sistema limpo e o GitHub (G-C1).
- **Windows.** O workflow só está previsto para Linux e macOS. Mitigação: o CLI recusa com mensagem clara (C11.4) e G-C4 decide se vira um marco.
- **Templates desatualizados nos projetos.** Um projeto iniciado com o `chicla init` não recebe correções sozinho. Mitigação: `chicla update` manual (C11.3).

## 11. Fora de âmbito (0.1)

Cifra (ZipCrypto e AES), métodos além de stored e deflate (bzip2, zstd…), zips em várias partes, suporte completo a Windows (separadores, nomes reservados; o CLI só avisa, C11.4), publicação no npm (D12), tar/7z, interface gráfica, nuvem, telemetria, plugins, atualizações automáticas (o `chicla update` é manual, C11.3).

## 12. Critérios de aceitação

**chicla-zip 0.1:** todos os casos hostis recusados sem escrever nada, também quando o erro só aparece a meio (CRC, tamanho, conflito); o fuzz não produz nenhum erro que não seja `ZipError`; tudo o que o escritor produz passa em `unzip -t` e no `zipfile` do Python, com os nomes certos em locale vazio e em macOS; orçamentos de desempenho cumpridos; `mark` não corrompe nada e a segunda corrida marca 0; suites verdes em Node 18, 20 e 22; mutantes todos vermelhos.

**chicla-kit 0.1:** nenhuma dependência de `zip`, `unzip` ou `ditto`; as regras «nunca sai» existem num só sítio; o despejo sai sempre (código 0), inclusive com o módulo avariado; o ciclo dump → recovery → entrega passa num projeto que não é o Cedar; um segredo plantado nunca entra num despejo; cada passo do workflow tem um subcomando `chicla`; as pernas do fingerprint e o formato do ficheiro de estado estão documentados e testados contra o código; `chicla update` nunca sobrescreve alterações locais sem confirmação; em Windows o CLI recusa com mensagem clara; cada agente da matriz tem um `init` testado.

## 13. Achados da auditoria ao rascunho

Feita a 2026-10-07 sobre `zipkit-RASCUNHO.mjs`; viram os primeiros testes (C1.1, C2.x, C4.1).

| # | Achado | Prova | Cartão |
| --- | --- | --- | --- |
| B1 | `markUtf8Names` grava a flag da central directory em `cdPos + 8`, que é relativo à central directory e não ao ficheiro: altera o campo do método da 1.ª entrada e corrompe o zip; a 2.ª corrida volta a marcar | `unzip -t`: «unknown compression method»; `testzip()` falha. Com offset absoluto: o Python lê os nomes, `unzip -t` passa, a 2.ª corrida marca 0 | C4.1 |
| B2 | A extração não é atómica: um erro a meio deixa ficheiros no destino | CRC mau no 2.º ficheiro deixa o 1.º | C2.1 |
| B3 | Conflito ficheiro/pasta só falha a meio da extração | `x` e `x/y` | C2.2 |
| B4 | 20 000 ficheiros pequenos: 8,7 s contra 0,6 s do `unzip`; `readZipFile` relê a central directory (cerca de 42 ms por chamada nesse zip). Perfilado na ronda 8: o custo era por ficheiro (cadeia de streams leitura + inflate + verificação + escrita, e `lstat` por segmento), não a CRC nem a central directory. Com o caminho rápido, em tmpfs: de ~15× para 2,1 a 2,8× o `unzip`; orçamento de 2× não cumprido; Rodrigo fixou 3× (D15) e a ronda 10 mediu 2,7 a 2,9× | fechado (ronda 10) | C1.2, C2.3 |
| B5 | CRC em JS: 288 ms por 100 MB contra 33 ms com `zlib.crc32` (Node 22) | medido | C1.4 |
| B6 | Entrada chamada `.` com dados é descartada sem aparecer em `skipped` | observado | C2.2 |
| B7 | `Transform.from([])` não existe (já conhecido) | `Readable.from([])` passa o `node --check`. **2026-10-08:** não reproduzido no Node 22 (`Transform.from` é herdado de `Duplex.from` e o teste do ficheiro vazio passa); trocado por `Readable.from([])` só como endurecimento (C1.1) | C1.1 |

Não testado: zip64, macOS, ficheiros acima de 4 GiB, cabeçalho local diferente da central directory, modos no disco.

## 14. Open questions (updated 2026-10-08)

1. ~~Cedar round 1s~~ Cedar's own decision, tracked in Cedar (D21).
2. Licence (G-C2): left open on purpose by Rodrigo.
3. ~~Command and project name~~ **Chicla**, decided by Rodrigo on 2026-10-09 (D22); `chicla` was dropped because npm `chicla-cli` installs a `chicla` command and PyPI has `chicla`. Checked on 2026-10-08: no npm package `chicla`, `chicla-cli`, `chiclakit`, `@chicla/cli`; nothing on PyPI, crates.io, Homebrew core or cask. The GitHub user `chicla` exists, which does not matter: the repository lives in Rodrigo's own account. Not checked: domains, trademarks, other package managers. «Chicla» is also a place name (a district in Peru).
4. ~~Messages pt/en~~ English only (D18).
5. Which agents enter the matrix (C12.5): to be decided together when M12 comes.
6. ~~Windows~~ own milestone M14 (D19).
7. ~~App version~~ confirmed (D13).
8. ~~ECOLLISION~~ D16. 9. ~~Stale `.chicla-tmp-*`~~ D17.
10. ~~Empty deflate entry~~ refused (D20).
