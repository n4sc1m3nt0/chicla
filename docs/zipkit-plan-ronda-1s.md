# Plano de trabalho — nomes UTF-8 nos zips (zipkit)

Cedar · ronda 1s (continuação) · entre o passo 5 e o passo 6 do plano NFC

## 1. Objetivo

Os zips de entrega e de despejo têm de ter os nomes não-ASCII corretos para **qualquer leitor**, em qualquer sistema, sem que isso parta o fluxo atual. Hoje o `zip` grava os nomes em UTF-8 sem o bit 11 (flag UTF-8): o `unzip` do Linux lê bem, o Python/Java/Windows mostram lixo.

Ligar o bit 11 sozinho não serve: medi que o `unzip` simples, em locale sem UTF-8 (o `LANG` vazio deste ambiente), extrai o nome como `relato#U0301rio…`, e o `check-manifest` passa a dar o ficheiro como perdido. O `-UU` do Info-ZIP resolve em Linux mas não existe no macOS (lá é `ditto`).

**Abordagem decidida (B):** um módulo de zip em Node, `scripts/zipkit.mjs`, é a única forma de listar, ler, verificar e extrair zips dentro dos scripts e dos testes. Mesmo código nos dois sistemas, testável aqui. Nada de ramos por sistema operativo.

Requisito adicional: isto vai ser generalizado num package para outros projetos. Por isso o módulo é autónomo (zero dependências, Node 18+, nada específico do Cedar), seguro contra zips hostis e tem a sua própria suite de testes.

## 2. Estado atual (honesto)

**Esta sessão foi só de planeamento: nada foi aplicado à árvore do projeto.**

- Árvore do projeto = zip do passo 5, sem alterações. Existe um **rascunho** do módulo, guardado em `zipkit-RASCUNHO.mjs` (a copiar para `scripts/zipkit.mjs` no arranque). Passa `node --check`; só corri `ls` com ele sobre um zip. **Não tem testes, não está no FILES.manifest, não está ligado a nada.**
- Revendo o código escrito, encontrei já um erro: em `streamEntry` uso `Transform.from([])`, que não existe; tem de ser `Readable.from([])`. Corrige-se no passo 1.
- Todos os outros scripts e testes estão exatamente como no passo 5 (smoke tests: guards 44/44, emergency verde, `check-manifest` limpo).
- O patch `1s-utf8-flag-NAO-APLICADO.patch` fica **descartado**: usava um módulo mais pequeno que esta abordagem substitui.

## 3. O que o zipkit tem de garantir (cada ponto com teste)

1. **Nomes:** extra Unicode Path (0x7075, com CRC) > bit 11 > UTF-8 válido > cp437 (regra da especificação). O nome devolvido é o verdadeiro; quem compara normaliza em NFC.
2. **Extração segura:** valida todas as entradas antes de escrever uma só; recusa caminhos absolutos, `..`, `\`, NUL, `C:`; nunca cria symlinks nem escreve através de um existente; cria ficheiros em modo exclusivo (nome repetido ou colisão NFC/NFD num sistema que normaliza falha em vez de sobrescrever); não confia nos tamanhos declarados; limites de bytes e de entradas (zip-bomb).
3. **Integridade:** CRC-32 e tamanho conferidos; ficheiro parcial apagado se algo falhar.
4. **Formato:** stored e deflate, zip64, modos Unix (sem setuid/setgid), datas. Cifra, outros métodos e zips em várias partes são recusados com mensagem clara.
5. **Streaming:** nada é lido por inteiro para memória, exceto a central directory e, em `readZipFile`, um ficheiro dentro do limite.
6. **Marcar bit 11:** liga-o nas entradas cujo nome não-ASCII é UTF-8 válido (2 bytes por entrada, local + central), idempotente, sem tocar em dados, tamanhos ou CRC, nem em nomes ASCII ou que não sejam UTF-8.

## 4. Passos

### Passo 0 — Ponto de partida
1. Confirmar que os smoke tests e `check-manifest` passam sobre a árvore atual (já confirmado após a reposição; repetir no início do trabalho).
2. Copiar `zipkit-RASCUNHO.mjs` para `scripts/zipkit.mjs` e corrigir `Transform.from([])` → `Readable.from([])`.

### Passo 1 — Testes primeiro
**1a. `scripts/smoke-test-zipkit.mjs` (novo, portável).** Gera os zips com um escritor mínimo dentro do próprio teste, para não depender do `zip` e poder fabricar zips adversariais. Casos:
- Nomes: com bit 11, sem bit 11 mas UTF-8 válido, sem bit 11 e inválido (→ cp437), extra 0x7075 com CRC certo e com CRC errado.
- `readZipFile`: stored e deflate; CRC errado, tamanho errado e dados truncados falham; NFC e NFD encontram o mesmo ficheiro.
- Extração: árvore completa com nomes acentuados/japoneses, byte a byte igual; ficheiro vazio; exec bit mantido, setuid retirado; datas.
- Hostis, todos com a pasta de destino a ficar **vazia**: `../x`, `/abs`, `a/../../b`, `\`, NUL, `C:/x`; symlink no zip (ignorado e reportado); symlink já existente no destino a apontar para fora; nome repetido; zip-bomb (total declarado acima do limite; fluxo que passa do declarado, sem sobras no disco).
- Recusas claras: método não suportado, cifrado, zip truncado, central directory corrompida.
- Colisões NFC/NFD e maiúsculas: aparecem em `collisions`, não bloqueiam.
- zip64: um zip64 escrito pelo próprio teste (e, se o `zip` daqui o permitir com `-fz`, um feito por ele).
- `markUtf8Names`: bit nos dois cabeçalhos, ASCII intocado, idempotente (2.ª vez = 0), dados intactos, zip64.
- Ficheiro grande (~20 MB) para exercitar o streaming, com o tempo registado.
- Interoperabilidade, só quando a ferramenta existir (com nota se faltar): `unzip -t`, `unzip -UU` e Python `zipfile` leem o zip marcado e dão os nomes certos.
- CLI: `ls`, `test`, `cat`, `extract`, `mark`, códigos de saída.

**1b. Testes de integração que têm de falhar hoje:**
- `smoke-test-delivery-guards` secção 9: `make-delivery-zip` dá o bit 11 (central e local); `verify-delivery-zip` recusa um zip entregue com nome não-ASCII sem o bit; um `--against` antigo sem o bit continua aceite.
- `smoke-test-emergency` T5: o zip de despejo traz o bit 11; o recovery-report lê-o em locale C.
- Recovery e verify com zip marcado em locale C (hoje partem: já vi 7 falhas).
- **T4 alargado (colisões visíveis):** com dois ficheiros que só diferem em NFC/NFD (se o sistema de ficheiros o permitir; senão, a função de deteção isolada): o zip cria-se e o `emergency-dump` sai com código 0; o `RECOVERY_REPORT.md` abre com a secção de colisões **antes de qualquer outra**, com a frase de que o diff não é fiável; a consola tem a linha própria; o `recovery-report` repete o aviso no `RECOVERY_DIFF.md` e na consola, lista os ficheiros e não os dá como Modificados nem como Novos/EM FALTA.

**1c. Teste dos testes:** depois de tudo verde, estragar de propósito cada garantia do zipkit (por exemplo, tirar a validação de `..`) e confirmar que o teste respetivo fica vermelho. Se não ficar, o teste não protege nada.

### Passo 2 — Ligar o zipkit (um script de cada vez, testes a cada passo)
1. `verify-delivery-zip.mjs`: apagar o parser próprio e o `unzip -p`; usar `listZip` e `readZipFile`; exigir o bit 11 **só** no zip entregue (os `--against` são uploads antigos).
2. `recovery-report.mjs`: as duas extrações (despejo e baseline) passam a `extractZip`; as colisões saem no topo do `RECOVERY_DIFF.md` e na consola, com a frase de que o diff não é fiável para esses ficheiros; erros de extração com mensagem própria. `.tar.gz` continua com `tar`.
3. `make-delivery-zip.mjs`: `markUtf8Names` depois de zipar e antes do verify; se falhar, aborta e apaga o zip (como já faz com o `zip`).
4. `emergency-dump.mjs`: (i) `markUtf8Names` por import dinâmico dentro de `try/catch`; (ii) o aviso de colisão sobe para o topo do relatório e ganha linha própria na consola (substitui a entrada atual na lista `errors`, que continua a existir para os outros problemas). **Mantém as regras do topo do ficheiro:** não corre guardas e não falha por isto; se o módulo faltar ou falhar, o despejo sai na mesma, só com um aviso.
5. Testes existentes: onde extraem com `unzip`, passam a usar `zipkit extract` (para correrem também no Mac, G-W6). `unzip -l/-p/-t` ficam apenas como inspeção independente de nomes ASCII. A lista `SCRIPTS` do teste de guardas passa a copiar o `zipkit.mjs`.

### Passo 3 — Processo e documentação
- **`docs/zip-handling.md` (novo):** o porquê (bit 11, locales, `-UU` vs `ditto`), o que o zipkit garante e não garante, tabela por sistema, limites conhecidos. Serve de base ao package.
- **Ficheiro de estado, itens 14 e 17, e CLAUDE.md:** rever o texto exato antes de mexer. Ponto delicado: **o primeiro passo não pode usar o script**, porque o zip é que traz o `scripts/`. A instrução passa a dar o comando cru por sistema (Linux: `unzip -UU <zip>`; Mac: `ditto -x -k <zip> <pasta>`) e, depois disso, `node scripts/zipkit.mjs …`. O item 17 usa hoje `unzip -Z1` e tem de ser reescrito com o mesmo cuidado.
- **Gates:** G-W9 e G-W6 ganham os testes no Mac (ver secção 6).

### Passo 4 — Correr tudo
1. `smoke-test-zipkit`, `smoke-test-delivery-guards`, `smoke-test-emergency`, `smoke-test-check-build`, `smoke-test-bump-round`, `smoke-test-archive-changelog`.
2. `node --check` em todos os scripts alterados e novos.
3. `check-manifest` e `check-build` (este último com o aviso habitual de que não há `cargo`).
4. Repetir o passo 5 do plano NFC (a reprodução manual), agora com zips marcados.

### Passo 5 — Fechar a ronda (o antigo passo 6)
CHANGELOG (P1–P5 e este achado, agora corrigido; "Not run" com o que falta), estado, manifesto (`check-manifest --write`, que passa a listar `zipkit.mjs`, o teste novo e `docs/zip-handling.md`), `make-delivery-zip` com `--against` do zip da 1r e verificação.

## 5. Critérios de aceitação

- Os zips de entrega e de despejo têm o bit 11 em todo o nome não-ASCII; `zipfile` do Python e `unzip -t` leem-nos bem.
- A entrega extrai-se com os nomes certos em locale C, com o zipkit, sem `#U…`; o `check-manifest` passa.
- Todos os casos hostis são recusados sem escrever nada.
- `emergency-dump` continua a não correr guardas e a não falhar por causa disto.
- Nenhum script do projeto depende de `unzip` ou `ditto` para ler ou extrair zips.
- Com colisões NFC/NFD, o despejo sai sempre (código 0), e a colisão é a primeira coisa que se vê no relatório, na consola do dump e no diff do recovery.
- Testes escritos antes, falham antes, passam depois, e o passo 1c mostra que protegem.

## 6. O que não consigo verificar aqui (vira gate teu, não "feito")

- `ditto -x -k` extrai bem os nomes (com e sem flag) e o que faz a `__MACOSX` e a resource forks.
- `zipkit` e as suites de testes passam no Mac (Node 18+; aqui corre Node 22).
- `make-delivery-zip` e a colagem por cima da entrega funcionam no Mac.
- Windows não está coberto (separadores, nomes reservados): fica fora do âmbito, e dito.

## 7. Decisões tomadas e em aberto

### Decidido
- **Colisões NFC/NFD: o despejo fica visivelmente suspeito, mas sai sempre.** Razão: no Linux os dois ficheiros existem e vão para o zip, e o zipkit recusa-se a sobrescrever na extração; o risco real é o relatório ficar cego (o `recovery-report` compara em NFC, os dois nomes viram a mesma chave e uma alteração a um deles passa despercebida). Por isso:
  - `RECOVERY_REPORT.md`: os nomes em colisão vão para o **topo**, antes de qualquer outra secção, com a frase "o diff NÃO é fiável para estes ficheiros";
  - consola do `emergency-dump`: linha própria no resumo final, além do contador de avisos;
  - `recovery-report`: o mesmo aviso no `RECOVERY_DIFF.md` e na consola, com os ficheiros em causa.
  - **Não** há campo novo no `RECOVERY_MARKER.json` (o recovery-report recalcula as colisões a partir da árvore extraída), **nem** pedido de confirmação, **nem** código de saída de erro: o despejo existe para sair sempre. Um bloqueio a sério pode ser acrescentado mais tarde por cima disto.
  - Âmbito: no despejo e no relatório continua a contar só NFC/NFD (o P5). O zipkit reporta também colisões por maiúsculas/minúsculas, que importam no macOS; fica registado em `docs/zip-handling.md`.

### Proposto, ainda não confirmado
- **O `verify-delivery-zip` exige o bit 11 no zip entregue** (e só nele; os `--against` antigos não). Confirmar no arranque.

### Riscos e outras notas

- **Mensagens em português**, como o resto do framework. Para o package convém centralizá-las; proponho **não** o fazer agora, mas registá-lo em `docs/zip-handling.md`.
- **Comportamento diferente do `unzip`:** o `recovery-report` tolerava o código de saída 1 (avisos); o zipkit é mais estrito (falha ou não falha) e recusa o que é inseguro. É intencional, e fica no CHANGELOG.
- **Desempenho:** o CRC em JavaScript é mais lento que o do `unzip`. O teste de 20 MB regista o tempo; se for um problema com despejos grandes, otimiza-se depois com dados reais.
- **Nome da ronda:** continua 1s (é a mesma ronda; o plano NFC só ganhou este passo).

## 8. Checklist

- [ ] Passo 0: testes verdes à partida; `Readable.from` corrigido
- [ ] Passo 1a: `smoke-test-zipkit` escrito
- [ ] Passo 1b: testes de integração escritos e a falhar
- [ ] Passo 1c: estragar cada garantia e ver o teste ficar vermelho
- [ ] Passo 2: verify, recovery-report, make-delivery-zip, emergency-dump e testes ligados ao zipkit; colisões no topo do relatório e na consola
- [ ] Passo 3: `docs/zip-handling.md`, itens 14 e 17, CLAUDE.md, gates
- [ ] Passo 4: todos os smoke tests, `node --check`, `check-manifest`, `check-build`, reprodução manual
- [ ] Passo 5: CHANGELOG, estado, manifesto, entrega verificada
