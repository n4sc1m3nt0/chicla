# Cairn — Roadmap

*Side project do Rodrigo · rascunho 1 · 2026-10-07 · nasce do zipkit e do framework de workflow do Cedar (que vem do Paper Golf)*

## 1. O que é

O Cairn dá a qualquer coding agent uma memória de projeto que sobrevive a sessões, contas e limites de utilização. Em Node puro, sem dependências. Tem duas peças:

- **cairn-zip** — ler, verificar, extrair em segurança, **escrever** e reparar zips, com os nomes UTF-8 certos em qualquer sistema e em qualquer leitor. Nasceu do zipkit.
- **cairn-kit** — o workflow completo: ficheiro de estado, fingerprints, política de «o que nunca sai», manifesto, entrega verificada, `/dump` e recovery mode, e instaladores para cada agente.

**Nome (2026-10-08):** `cairn` e `cairnkit` já existem no npm, tal como `zipkit`. Não faz diferença, porque o projeto não é publicado no npm (D12): o nome só tem de ser único como repositório. Não verifiquei GitHub, domínios nem marcas (gate G-C1).

## 2. Decisões

| # | Decisão | Estado |
| --- | --- | --- |
| D1 | Nome **Cairn**; packages `cairn-zip` (núcleo) e `cairn-kit` (framework) | decidido (2026-10-08) |
| D2 | O **escritor de zips** entra no âmbito desde o início | decidido |
| D3 | Zero dependências, Node 18+, ESM, tipos por JSDoc; `zlib.crc32` quando existir, com alternativa em JS | proposto |
| D4 | Repositório próprio, separado do Cedar; monorepo com dois packages versionados à parte | proposto |
| D5 | O Cairn usa o seu próprio workflow desde o M0 (rondas, ficheiro de estado, fingerprints, gates), começando por copiar os scripts do Cedar tal como estão | proposto |
| D6 | Segurança por omissão: extrai para pasta nova; o despejo só leva a raiz do projeto, o resto é opcional | proposto |
| D7 | O `/dump` nunca falha por causa do Cairn: mantém-se um caminho de emergência com `zip`/`tar` | regra herdada do Cedar |
| D8 | Mensagens por chaves (pt e en) desde o início do package | proposto; reverte o «não agora» do plano zipkit |
| D9 | Licença | em aberto (G-C2) |
| D10 | `cairn update` existe mas é sempre manual (diff e confirmação); atualizações automáticas continuam fora de âmbito | proposto |
| D11 | Windows fora de âmbito no 0.1, mas o CLI recusa com mensagem clara (C11.4); a decisão de um marco próprio fica em G-C4 | proposto |
| D12 | Distribuição por GitHub, sem npm: repositório público, instalação com `npm i github:<utilizador>/cairn#v0.1.0` ou `.tgz` de um release; o `cairn update` (C11.3) trata das atualizações | decidido (2026-10-08) |
| D13 | A versão da app é o `version` do `package.json` da raiz e sobe em cada entrega; a perna app do fingerprint é `version.mjs`; as versões de `cairn-zip` e `cairn-kit` (D4) só mudam nos lançamentos | decidido (2026-10-08), provisório: confirmar |
| D14 | Os ficheiros do workflow (`CLAUDE.md`, estado, `CHANGELOG.md`, `ROADMAP.md`, `FILES.manifest`) ficam na raiz, como no Cedar: os scripts procuram-nos aí e o Claude Code só carrega o `CLAUDE.md` da raiz | decidido (2026-10-08) |

## 3. Regras de ferro

(Herdadas do Cedar, adaptadas.)

1. **Testes primeiro.** Cada cartão começa por testes que falham; se passarem antes do código, o teste não protege nada.
2. **Estragar de propósito.** No fim de cada marco, quebrar cada garantia e ver o teste respetivo ficar vermelho; depois automatizar a lista de mutantes.
3. **Um leitor independente confirma.** Tudo o que o Cairn escreve ou altera tem de ser aceite por `unzip -t` e pelo `zipfile` do Python, não só pelo próprio Cairn (foi assim que o bug do `mark` apareceu).
4. **Uma tarefa por ronda:** no máximo 3 ficheiros-fonte e cerca de 200 linhas; se crescer, parar na costura mais próxima.
5. **Honestidade:** dizer sempre o que não foi corrido; o que não se corre vira gate para ti.
6. **Nada meio ligado:** cada ronda entrega algo que compila, testa e não parte o resto.

## 4. Arquitetura

```
cairn/
  packages/
    cairn-zip/   src/{read,names,crc,extract,write,mark,cli}.mjs   test/
    cairn-kit/   src/{policy,manifest,fingerprint,delivery,dump,recovery,agents,cli,update}.mjs   templates/   test/
  CLAUDE.md   CAIRN_PROJECT_STATUS-N.md   CHANGELOG.md   ROADMAP.md   FILES.manifest   version.mjs
  scripts/   bump-round  check-manifest  check-build  make-delivery-zip  verify-delivery-zip
             archive-changelog  emergency-dump  recovery-report  smoke-test-*
  docs/      (nasce quando houver o que documentar: zip-handling, fingerprint, state-file)
```

API esboçada do `cairn-zip` (a fixar entre o M1 e o M3):

```js
const z = await openZip(path)      // handle reutilizável: entries, read(name), stream(name), test(), close()
await extractZip(path, dest, { maxTotalBytes, maxEntries, filter })
const r = await createZip(out, source, { exclude, symlinks, deterministic, hash })   // r = { entries, hashes }
markUtf8Names(path)                // só para reparar zips de terceiros
```

O `cairn-kit` só depende do `cairn-zip` por esta API; o dump importa-o dentro de `try/catch` e cai para `zip`/`tar` se falhar.

## 5. Garantias do cairn-zip (cada uma com teste)

**Leitor.** Nomes: extra 0x7075 com CRC > bit 11 > UTF-8 válido > cp437 (com opção `legacyEncoding`). CRC-32 e tamanho conferidos. Streaming: só a central directory e, em `read`, um ficheiro dentro do limite vão para memória. Recusas claras: cifra, outros métodos, várias partes, zip truncado, central directory corrompida.

**Extração.** Valida **tudo** antes de escrever: nomes inseguros, duplicados, conflitos ficheiro/pasta, limites de bytes e de entradas. Extrai para uma pasta temporária no mesmo volume e só no fim faz `rename`: se algo falhar, **o destino fica intocado**. Nunca cria nem atravessa symlinks, cria ficheiros em modo exclusivo, retira setuid/setgid, não confia nos tamanhos declarados. Colisões NFC/NFD e de maiúsculas são reportadas, não bloqueiam.

**Escritor.**

- Bit 11 sempre nos nomes não-ASCII; os nomes gravados são os verdadeiros do disco, sem normalizar.
- Stored ou deflate (por extensão e razão de compressão); nível configurável.
- Saída para ficheiro: escreve para `<out>.partial`, corrige os cabeçalhos locais com CRC e tamanhos (sem data descriptor), `fsync` e `rename` atómico. Saída para stream: data descriptor.
- zip64 automático (mais de 4 GiB ou 65 535 entradas).
- Determinístico: ordem fixa, datas de `SOURCE_DATE_EPOCH` ou mtime limitado a 1980–2107, modos normalizáveis.
- Origem por lista ou raiz com **predicado de exclusão** (acaba com os padrões `-x` e com o passo do dump que repõe `.gitkeep` e `.env.example`).
- Nunca segue symlinks (política `skip` por omissão, com relatório); recusa nomes inseguros e recusa escrever dentro da própria árvore de origem.
- Calcula **crc32 e sha256 na mesma passagem** e devolve-os (para o manifesto e o marcador do dump); deteta ficheiros que mudaram durante a leitura.
- Tudo o que escreve é lido pelo leitor do Cairn e pelas ferramentas independentes.

**Orçamento de desempenho.** Ficheiros grandes: no máximo 1,5× o `unzip`. 20 000 ficheiros pequenos: no máximo 2× o `unzip` (o rascunho está em 14×).

## 6. Marcos e cartões

Tamanhos: S (ronda curta), M (uma ronda). Cada cartão escreve os testes antes.

### M0 — Fundação

| ID | Cartão | Tam. |
| --- | --- | --- |
| C0.1 | Repo, workspaces, CI com Node 18/20/22 em Linux e macOS | S |
| C0.2 | Copiar para o repo os 8 scripts do Cedar (bump-round, check-manifest, check-build, make/verify-delivery, archive-changelog, emergency-dump, recovery-report) e os 5 testes de fumo. Ajustes: nomes, `package.json` como marcador de raiz, `version.mjs` como perna app do fingerprint (D13), `check-build` passa a `node --check` e sai a regra `target/` do Cargo. Ainda usam `unzip` e `zip` | S |
| C0.3 | `CLAUDE.md`, `CAIRN_PROJECT_STATUS-1.md`, `CHANGELOG.md` com fingerprint, este roadmap | S |

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
| C2.3 | Caminho rápido para entradas pequenas e cache de pastas; cumprir o orçamento de 2× | M |
| C2.4 | Oráculo de fuga (fotografia da pasta-mãe antes e depois) e fuzz de extração | M |
| C2.5 | Colisões NFC/NFD e de maiúsculas em `collisions` | S |

### M3 — Escritor

| ID | Cartão | Tam. |
| --- | --- | --- |
| C3.1 | Testes de interoperabilidade primeiro: `unzip -t`, Python `zipfile`, `zipinfo`, 7z se existir; ida e volta com o leitor | S |
| C3.2 | Núcleo: stored + deflate, bit 11, saída para ficheiro com correção de cabeçalhos e `rename` atómico | M |
| C3.3 | zip64 e mais de 65 535 entradas | M |
| C3.4 | Determinismo e datas | S |
| C3.5 | Predicado de exclusão, política de symlinks, anti-recursão, nomes inseguros | S |
| C3.6 | crc32 + sha256 na mesma passagem; deteção de ficheiro alterado durante a leitura | S |
| C3.7 | Saída para stream com data descriptor | S |

### M4 — Reparação e linha de comandos

| ID | Cartão | Tam. |
| --- | --- | --- |
| C4.1 | `markUtf8Names` corrigido (offset absoluto), idempotente, confirmado por leitor independente | S |
| C4.2 | CLI `ls`, `test`, `cat`, `extract`, `create`, `mark`, com `--json` e códigos de saída | M |
| C4.3 | `docs/zip-handling.md`: porquê (bit 11, locales, `-UU` vs `ditto`), garantias, limites | S |

### M5 — Endurecimento e cairn-zip 0.1

| ID | Cartão | Tam. |
| --- | --- | --- |
| C5.1 | Fuzz de leitura: milhares de mutações de zips válidos; só pode sair `ZipError`, sem bloqueios nem escritas fora do destino | M |
| C5.2 | Teste diferencial com o `zipfile` do Python em árvores aleatórias | M |
| C5.3 | Lista automatizada de mutantes que têm de ficar vermelhos | M |
| C5.4 | Benchmarks com orçamento no CI | S |
| C5.5 | Gates G-C3, G-C5, G-C6 → lançar `cairn-zip` 0.1.0 (tag e release no GitHub) | gate |

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
| C8.2 | `verify-delivery` com `cairn-zip`; bit 11 obrigatório só na entrega, não nos `--against` | S |
| C8.3 | `--against` e `--allow-removed` portados | S |

### M9 — Dump e recovery

| ID | Cartão | Tam. |
| --- | --- | --- |
| C9.1 | Dump com `createZip`: exclusão por predicado, hashes na mesma passagem, hash em streaming, limite de hash reportado no marcador | M |
| C9.2 | Pasta `RECOVER/` com nomes ASCII (`cairn-zip` + `recovery-report`) e o sha256 do toolchain no marcador; o arranque passa a `unzip -p dump.zip RECOVER/…`, sem listar com `-Z1` e filtrar com `grep` | M |
| C9.3 | Colisões NFC/NFD no topo do relatório e na consola; o despejo sai sempre | S |
| C9.4 | `recovery-report` extrai com `cairn-zip` e confere o hash do toolchain contra o valor fixado no `CLAUDE.md` | M |
| C9.5 | Caminho de emergência com `zip`/`tar`; teste que força a falha do módulo e confirma que o despejo sai | S |

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
| C11.1 | CLI `cairn` do kit: subcomandos `bump-round`, `check-manifest`, `make-delivery`, `verify-delivery`, `dump` e `recovery`, com `--json` e códigos de saída; os scripts passam a invólucros finos sobre o mesmo código | M |
| C11.2 | Testes do CLI: cada subcomando dá o mesmo resultado que o script que substitui; `dump` sai sempre com código 0, mesmo com o módulo avariado | S |
| C11.3 | `cairn update`: compara os templates e scripts do projeto com os da versão instalada, mostra o diff e não sobrescreve alterações locais sem confirmação; sempre manual | M |
| C11.4 | Windows: o CLI deteta o sistema e recusa com mensagem clara em vez de falhar a meio; o limite fica documentado e o caminho de emergência continua descrito | S |

### M12 — Agentes

| ID | Cartão | Tam. |
| --- | --- | --- |
| C12.1 | `cairn init` com templates de instruções: `CLAUDE.md` e `AGENTS.md` (confirmar quais agentes o leem à data) | M |
| C12.2 | `/dump` como comando do Claude Code; para os outros, regra de texto | S |
| C12.3 | Ciclo completo (dump → recovery → entrega) num projeto-modelo que não é o Cedar | M |
| C12.4 | Caminhos configuráveis (`/home/claude`, outputs) em vez de fixos | S |
| C12.5 | Matriz de agentes confirmada à data: que ficheiro de instruções lê cada um, como se invoca o `/dump` e onde ficam os caminhos; só entram na matriz os agentes confirmados | S |
| C12.6 | `cairn init --agent <nome>` para cada agente da matriz, com teste de que o ficheiro gerado fica no sítio certo e contém as regras (estado, política, dump) | M |

### M13 — Migração e lançamento

| ID | Cartão | Tam. |
| --- | --- | --- |
| C13.1 | Migrar o Cedar para o Cairn, um script de cada vez | M |
| C13.2 | `SECURITY.md`, `CONTRIBUTING`, documentação de utilizador | M |
| C13.3 | Mensagens por chaves pt/en | M |
| C13.4 | Gates G-C6 e G-C7 → lançar `cairn-kit` 0.1.0 (tag e release no GitHub) | gate |

## 7. Primeiras rondas

1. **R0** — C0.1 a C0.3.
2. **R1** — C1.1: testes de leitura escritos e a falhar.
3. **R2** — C1.2 a C1.5: leitor verde.
4. **R3** — C2.1 e C2.2: extração atómica e pré-validação.
5. **R4** — C3.1: testes de interoperabilidade do escritor, a falhar.
6. **R5** — C3.2: núcleo do escritor.

Daqui para a frente, a ordem decide-se com o que os testes mostrarem.

## 8. Relação com o Cedar

- A ronda 1s do Cedar já tem o NFC feito (passos 0 a 5). O que falta é fechá-la (passo 6). **Recomendo fechá-la só com o NFC**, sem zipkit, e tratar o resto no Cairn: o NFC não depende do módulo de zip.
- Os passos 2 a 5 do plano zipkit passam a ser o C13.1; o `Plano_zipkit_ronda_1s` fica substituído por este roadmap.
- O Round 2 do Cedar (motor de PDF) não fica bloqueado pelo Cairn.
- Os scripts do C0.2 vêm de `cedar-round1s-passo5-2026-10-07.zip`. Até o M6 e o M13 ficam duas cópias a evoluir, a do Cedar e a do Cairn.

## 9. Gates (só tu)

| Gate | O que fazes |
| --- | --- |
| G-C1 · Nome | Confirmar Cairn; criar o repositório no GitHub (público, para o recovery funcionar num chat limpo); ver que o comando `cairn` não colide com nenhum binário comum. Domínio fica fora |
| G-C2 · Licença | Escolher a licença (a avaliar: MIT ou Apache-2.0) |
| G-C3 · macOS | Correr as suites no teu Mac (Node 18+) |
| G-C4 · Windows | Decidir: fora de âmbito declarado, ou um marco próprio mais tarde |
| G-C5 · Revisão de segurança | Rever o leitor e o extrator (e, se possível, outra pessoa ou ferramenta) antes de publicar |
| G-C6 · Lançamento | Tag `v0.1.0` e release no GitHub com o `.tgz` de cada package (`npm pack`) e o sha256 nas notas; sem npm (D12) |
| G-C7 · Ensaio | `/dump` e recovery num chat limpo e com pelo menos um agente que não seja o Claude |

## 10. Riscos

- **Escopo.** É grande para um side project com tempo variável. Mitigação: M1 a M5 já são um produto útil e publicável (`cairn-zip`), por isso o resto só avança com isso fechado.
- **Zips que só alguns leitores abrem.** O escritor é código de formato novo; a matriz de interoperabilidade (C3.1) e o leitor independente servem para isto.
- **Desempenho do JS.** Mitigado por `zlib.crc32`, pelo caminho rápido para entradas pequenas e por orçamentos no CI.
- **Convenções dos agentes mudam.** Ficam isoladas nos templates (M12).
- **Executar código vindo de um zip.** O recovery fixa o hash do toolchain (C9.2, C9.4).
- **Nome com colisões.** `cairn` e `cairnkit` existem no npm, mas sem npm (D12) não há conflito de publicação; README claro para quem pesquise o nome e verificar o comando `cairn`.
- **Windows.** O workflow só está previsto para Linux e macOS. Mitigação: o CLI recusa com mensagem clara (C11.4) e G-C4 decide se vira um marco.
- **Templates desatualizados nos projetos.** Um projeto iniciado com o `cairn init` não recebe correções sozinho. Mitigação: `cairn update` manual (C11.3).

## 11. Fora de âmbito (0.1)

Cifra (ZipCrypto e AES), métodos além de stored e deflate (bzip2, zstd…), zips em várias partes, suporte completo a Windows (separadores, nomes reservados; o CLI só avisa, C11.4), publicação no npm (D12), tar/7z, interface gráfica, nuvem, telemetria, plugins, atualizações automáticas (o `cairn update` é manual, C11.3).

## 12. Critérios de aceitação

**cairn-zip 0.1:** todos os casos hostis recusados sem escrever nada, também quando o erro só aparece a meio (CRC, tamanho, conflito); o fuzz não produz nenhum erro que não seja `ZipError`; tudo o que o escritor produz passa em `unzip -t` e no `zipfile` do Python, com os nomes certos em locale vazio e em macOS; orçamentos de desempenho cumpridos; `mark` não corrompe nada e a segunda corrida marca 0; suites verdes em Node 18, 20 e 22; mutantes todos vermelhos.

**cairn-kit 0.1:** nenhuma dependência de `zip`, `unzip` ou `ditto`; as regras «nunca sai» existem num só sítio; o despejo sai sempre (código 0), inclusive com o módulo avariado; o ciclo dump → recovery → entrega passa num projeto que não é o Cedar; um segredo plantado nunca entra num despejo; cada passo do workflow tem um subcomando `cairn`; as pernas do fingerprint e o formato do ficheiro de estado estão documentados e testados contra o código; `cairn update` nunca sobrescreve alterações locais sem confirmação; em Windows o CLI recusa com mensagem clara; cada agente da matriz tem um `init` testado.

## 13. Achados da auditoria ao rascunho

Feita a 2026-10-07 sobre `zipkit-RASCUNHO.mjs`; viram os primeiros testes (C1.1, C2.x, C4.1).

| # | Achado | Prova | Cartão |
| --- | --- | --- | --- |
| B1 | `markUtf8Names` grava a flag da central directory em `cdPos + 8`, que é relativo à central directory e não ao ficheiro: altera o campo do método da 1.ª entrada e corrompe o zip; a 2.ª corrida volta a marcar | `unzip -t`: «unknown compression method»; `testzip()` falha. Com offset absoluto: o Python lê os nomes, `unzip -t` passa, a 2.ª corrida marca 0 | C4.1 |
| B2 | A extração não é atómica: um erro a meio deixa ficheiros no destino | CRC mau no 2.º ficheiro deixa o 1.º | C2.1 |
| B3 | Conflito ficheiro/pasta só falha a meio da extração | `x` e `x/y` | C2.2 |
| B4 | 20 000 ficheiros pequenos: 8,7 s contra 0,6 s do `unzip`; `readZipFile` relê a central directory (cerca de 42 ms por chamada nesse zip). Perfilado na ronda 8: o custo era por ficheiro (cadeia de streams leitura + inflate + verificação + escrita, e `lstat` por segmento), não a CRC nem a central directory. Com o caminho rápido, em tmpfs: de ~15× para 2,1 a 2,8× o `unzip`; orçamento de 2× ainda não cumprido | em curso | C1.2, C2.3 |
| B5 | CRC em JS: 288 ms por 100 MB contra 33 ms com `zlib.crc32` (Node 22) | medido | C1.4 |
| B6 | Entrada chamada `.` com dados é descartada sem aparecer em `skipped` | observado | C2.2 |
| B7 | `Transform.from([])` não existe (já conhecido) | `Readable.from([])` passa o `node --check`. **2026-10-08:** não reproduzido no Node 22 (`Transform.from` é herdado de `Duplex.from` e o teste do ficheiro vazio passa); trocado por `Readable.from([])` só como endurecimento (C1.1) | C1.1 |

Não testado: zip64, macOS, ficheiros acima de 4 GiB, cabeçalho local diferente da central directory, modos no disco.

## 14. Questões em aberto

1. Fechar a ronda 1s do Cedar só com o NFC (recomendado) ou esperar pelo Cairn?
2. Licença.
3. O comando `cairn` colide com algum binário comum?
4. Mensagens pt/en desde o início (D8) ou só em português até ao 0.1?
5. Que agentes entram na matriz (C12.5)?
6. Windows: só aviso no 0.1 (D11) ou marco próprio mais tarde (G-C4)?
7. A versão da app é a do `package.json` da raiz (D13): confirmas?
