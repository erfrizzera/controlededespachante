# CLAUDE.md — Controle de Despachante (Cobra Brasil)

Sistema que controla o ciclo de vida de **atas societárias** enviadas para registro na
**Junta Comercial**. Recriado do zero a partir de um projeto de referência em
`C:\Users\EricodosReisFrizzera\Documents\Controle de Atas` — aquela pasta é **somente
leitura** (fonte de referência); nada é editado lá.

## Arquitetura — Flufa V1 (pragmática, com tela no GitHub)

Segue a Flufa V1 (`~/.claude/flufa-v1.md`): **coletor → armazém → tela**.

- **Armazém:** Google Sheets. Aba `Atas` (os registros) + aba `Usuarios` (whitelist de acesso).
- **Motor / coletor:** Google Apps Script (pasta `apps-script/`) — faz o CRUD no Sheets,
  upload de PDF no Drive, e-mail de notificação e autenticação. Gerenciado por clasp ou
  colado no editor web do Apps Script.
- **Tela:** GitHub Pages hospeda uma **moldura** (`index.html` na raiz) que abre o app do
  Apps Script dentro de um `<iframe>` em tela cheia. Isso esconde a URL gigante do Google
  e dá um endereço bonito (`usuario.github.io/...`, e no futuro um domínio próprio).

### Exceção consciente à Flufa V1
A Flufa diz *"telas nunca servidas por `doGet()` do Apps Script"*. Aqui o **app em si**
(dashboard, formulários) É servido pelo `doGet`, porque ele precisa de backend — gravar
dados, subir arquivo, mandar e-mail, autenticar —, coisa que o GitHub Pages estático não
faz sozinho. O GitHub Pages entra como **moldura / porta de entrada (Opção 2)**, o que
devolve a "tela" para o Pages e mantém o motor como **peça única**. Decisão tomada por
**intervenção mínima**: um motor só para manter, sem CORS nem deploy duplo.

## Domínio (V4): duas trilhas de cadastro + perfis

- **Processo na Junta (coluna Status):** `Enviado → Em Protocolo → Registrada → Concluído`.
  Só isso — o status é **só sobre a Junta**. A "Pendência" que congelava a ata **acabou na V3**.
  Na tela (V3.1) a coluna Status mostra 3 linhas: **toggle da bola**, **Situação:** (o status) e
  **Próximo:** (a próxima ação — Protocolar/Registrar/Concluir, que saiu da coluna Ações). O
  rótulo **"Em Protocolo" aparece como "Protocolizado"** (`nomeStatus`, só display; o dado
  guardado continua `Em Protocolo`). A coluna **"Tempo de Processo" foi removida** da tabela
  (item 1). A ideia original de mover o tempo pra dentro da descrição foi **descartada**: aquela
  versão quebrava o app no ambiente real do Apps Script (tela vazia + botões travados), embora
  renderizasse certo no teste local. Ficou só a remoção da coluna, que é estável.
- **E-mails na hora (item 4 cancelado):** a ideia de represar os avisos e mandar só às 10h/15h
  (aba `FilaEmails` + gatilhos `enviarFilaEmails`) foi **abandonada**. Os avisos voltaram a sair
  **na hora**. A função `enviarFilaEmails` saiu do código e os 2 gatilhos foram apagados à mão no
  painel Acionadores. **Lição que ficou:** nunca criar/instalar gatilho por código chamado pela
  tela (escopo `script.scriptapp` → auth bloqueada pelo iframe → app em branco permanente).
- **A bola (V3):** com quem está a vez de agir. Fica na coluna Status, um toggle **liga-desliga**
  em cima do status (**Cobra azul à esquerda, despachante cinza à direita**). Guardada na coluna
  `Bola` da aba `Atas`. **Só o chat a move:** quem escreve e envia está *devolvendo* — a bola vai
  pro outro lado (`postDevolucao` grava a mensagem e vira a `Bola`; nada congela). Ata nova nasce
  com o **despachante**. Junta concluída → "Finalizado" (bola de ninguém). O financeiro **não**
  entra na bola.
- **Financeiro (V3) — fora do Status, num cifrão nas Ações.** O cifrão abre um painel lateral com
  NF/reembolsos: cada pedido tem valor + justificativa + **vários anexos** e uma **baixa própria**
  (coluna `Baixado Em` na aba `Reembolsos`). O cifrão fica **vermelho** enquanto houver **qualquer**
  pedido sem baixa (`financeiroVermelho`, calculado no `getAtas`). A baixa é da **Cobra/admin**;
  lançar o pedido já é o "pedido de pagamento" (não existe mais "Pedir/Confirmar pagamento" como
  passo). Honorários seguem como campo único no mesmo painel. *(O `Status Financeiro` da V2 virou
  legado — a fonte da verdade agora é a baixa por pedido.)*
- **Perfis (coluna Permissão da aba `Usuarios`):** `admin` (tudo), `cobra` (sem E-mails,
  Sheets, Correção Manual, Excluir) e `despachante` (também sem Cadastrar e Drive Geral).
- **Navi (V4) é uma lista à parte do perfil** — coluna `Navi` (SIM/NÃO) na aba `Usuarios`.
  Diz quem enxerga e marca o check **"Pagamento no Navi"**. Mora na planilha de propósito:
  ligar/desligar gente não pode exigir republicação de código. A migração V4 já marca
  `SIM` para quem tem e-mail começando em `juridico@` ou `erico.frizzera@`.

### Item 1 (V4) — a lista já abre filtrada
`state.selectedViewFilter` nasce em `'ativas'` e o `<option>` correspondente é o primeiro
do select. Quem entra vê só o que está em aberto; "Todas (inclui finalizadas)" continua a
um clique.

### Item 2 (V4.1) — "Concluído" é derivado, não é um botão
**Ninguém conclui nada.** O despachante entrega (`Registrado` na ata, `Devolvido` no
documento) e a Cobra marca os dois checks empilhados na coluna Status — `Arquivado na Rede`
(só admin) e, logo abaixo, `Pagamento no Navi` (só Navi=SIM). Marcou os dois: `estaConcluido`
passa a valer e a situação vira **Concluído**. Desmarcou um: volta para a etapa de entrega.

Por que derivado e não gravado: com duas fontes (um status escrito à mão *e* dois checks) elas
inevitavelmente se contradizem, e aí não dá para saber qual está certa. Derivando, o dado da
planilha **nunca** pode discordar da tela, porque a tela não lê o status cru — lê `situacaoDe`.

Consequências que valem lembrar:
- **Sumiu o botão "Concluir Junta"** e o modo `workflow_concluir`.
- **Sumiram "Finalizado" e "Encerrando"** (que existiram só na V4.0): Concluído já é o fim.
- No modo admin o seletor de status oferece **só as etapas reais** — Concluído não é escolhível.
- Registro antigo gravado como `Concluído` sem os dois checks é lido como a **etapa final da
  sua trilha** (`Registrada` / `Devolvido`), não como concluído. Algumas atas voltaram para a
  lista quando isso entrou — é a verdade sobre elas, não um bug.
- A **Data de Conclusão** passou a ser carimbada pelo segundo check (`carimbarConclusao_`),
  não mais pelo `saveAta`.

### Item 3 (V4.1) — vocabulário: a "bola" acabou
Na tela, o toggle virou **"Aguardando: Cobra / Despachante"** (classes CSS `aguard-*`). Nos
e-mails, **"responsável atual"**: assunto `Ata 0012 — aguardando retorno: Cobra Brasil`, corpo
com "Nova manifestação registrada". Os e-mails também sabem se o registro é ata ou documento.

A **coluna `Bola` da planilha e o campo `ata.bola` ficaram com o nome antigo**, de propósito:
renomear dado histórico é risco sem retorno. A gíria sumiu de tudo que o usuário lê.

### Item 4 (V4) — central única de pedidos de pagamento
Acabou a divisão entre "reembolso" e "NF". O cifrão abre **uma central só**, e cada pedido
carrega o mínimo para virar histórico defensável: **objeto** (texto livre), **tipo de
pagamento** (`Reembolso` | `Serviço`), **valor** e **anexo de lastro** (obrigatório).

**V4.1: a central não controla mais tempo.** Saíram a baixa por pedido, o selo "Aguardando" e
o alerta do topo — ela virou um lugar de **consolidar o que foi pedido**, e nada mais. Quem diz
se o pagamento saiu é o check **"Pagamento no Navi"**, que vale para o registro inteiro. Por
tabela, o **cifrão vermelho** passou a significar "tem pedido lançado e o Navi ainda não foi
marcado" (`atasComPedido_` + o check), e é essa mesma regra que alimenta o KPI "Pagamento
pendente" e o filtro. A coluna `Baixado Em` e as funções `darBaixaReembolso`/`reabrirReembolso`
saíram de cena (a coluna fica com o histórico das baixas antigas).
**Honorários deixaram de ser campo solto na ata** — viram pedido do tipo `Serviço`. A coluna
`Honorários Despachante` fica na planilha só com o histórico, e `setHonorarios` perdeu o
chamador. Os campos de NF/comprovante/valores saíram do modal da ata inteiros.

### Item 5 (V4) — a trilha "Outros Documentos"
Nem tudo que vai pro despachante é ata. A coluna `Tipo` separa duas trilhas:
- `Ata` — `Enviado → Protocolizado → Registrado` **→ Concluído** (derivado).
- `Documento` — `Solicitado → Devolvido` **→ Concluído** (derivado), **sem protocolo**. A Cobra
  abre descrevendo o que precisa (anexo opcional); o despachante devolve anexando o documento.
  Chat, Aguardando, pedidos de pagamento e os dois checks funcionam igual.

**Os rótulos são de tela; a planilha guarda outra coisa.** `Em Protocolo` aparece como
**Protocolizado** e `Registrada` como **Registrado** — a tradução mora num lugar só
(`ROTULO_ETAPA`/`nomeStatus`). Renomear valor histórico na planilha é risco sem retorno, e o
projeto já fazia isso com o Protocolizado desde a V3.1.

O tipo é escolhido **só no cadastro** — registro existente nunca troca de trilha (o
`saveAta` ignora `ata.tipo` quando a linha já tem tipo gravado). Na tela, o documento se
identifica por uma etiqueta "Documento" ao lado do ID, e o "Documento devolvido" reaproveita
a coluna `Ata Registrada` (mesma coluna, rótulo diferente — igual ao que já se faz com a aba
`Pendencias`).

## Modelo de dados (aba `Atas`, 21 colunas)

Identificação: `ID` (sequencial 0001…), `Empresa` (lista fixa de empresas do grupo),
`Descrição`, `Data de Envio`, `Status`, `Status Anterior` (legado V2, não usado na V3),
`Status Financeiro` (legado V2), `Bola` (V3: `Cobra` | `Despachante`),
`Arquivado na Rede` (V3.2, guarda a data), `Pagamento no Navi` (V4, guarda a data),
`Tipo` (V4: `Ata` | `Documento`).
Documentos (PDF no Drive; a célula guarda o link): `Ata Assinada`, `Ata Registrada`,
`Nota Fiscal`, `Comprovante de Despesa`, `Pasta no Drive`.
Protocolo: `Número do Protocolo`, `Data do Protocolo` (automática).
Financeiro: `Reembolso Taxas` (soma de **todos** os pedidos da aba `Reembolsos`, inclusive os
de tipo Serviço), `Honorários Despachante` (**legado V4** — só histórico).
Conclusão: `Data de Conclusão` (automática).

Abas auxiliares: `Usuarios` (whitelist + perfil + **`Navi`** SIM/NÃO da V4); `Pendencias` (o
**chat/devolução** — mesmo nome de antes pra não perder histórico; anexos como JSON
`[{nome,url}]` na coluna `Arquivo`); `Reembolsos` (a **central de pedidos de pagamento**; o
nome da aba fica pelo histórico — um pedido por linha: `ID da Ata`, `Data/Hora`, `Autor`,
`Valor`, `Objeto` (era `Justificativa`), `Arquivo` (JSON de vários anexos), `Baixado Em`,
`Tipo` (V4: `Reembolso` | `Serviço`)). *(A aba `FilaEmails` era do
item 4 — e-mail represado, cancelado; pode ser ignorada/apagada, não é mais usada.)* Não há mais
coluna **Arquivos** na tela — a pasta do Drive virou um botão nas Ações.

**Migração V3 (`ensureMigracaoV3_`):** roda uma vez (guardada por Script Property `MIGRADO_V3`)
no primeiro `getAtas` após o deploy — destrava atas em "Pendência" (volta ao status anterior) e
semeia `Bola='Despachante'`. Idempotente.

**Migração V4 (`ensureMigracaoV4_`):** mesma receita (`MIGRADO_V4`), também no primeiro
`getAtas` — semeia `Tipo='Ata'` em todo registro antigo (tudo que existia era ata) e marca
`Navi='SIM'` para quem tem e-mail começando em `juridico@` ou `erico.frizzera@`, **sem tocar
em quem já tiver a célula preenchida**. Pedido de pagamento antigo sem `Tipo` é lido como
`Reembolso` na hora da leitura (não precisa migrar linha).

## Regras da Flufa aplicadas

- **Versão mora só em `version.json`** (raiz). O selo discreto na tela lê dele e **falha em
  silêncio**. Ninguém digita número de versão na tela.
- **Segredos** vivem nas *Script Properties* do Apps Script (o "cofre" equivalente ao
  GitHub Secrets aqui), nunca no código.
- **Arquivo pesado (PDF) fica no Drive**; o Sheets guarda só o link. Mantém a planilha leve.
  Acima de ~3 MB de base64 o arquivo **sobe em pedaços de 512 KB** (`receberPedacoUpload` →
  `montarArquivoUpload`): o `google.script.run` não carrega dezenas de MB num pedido só — ele
  morre no caminho **sem resposta**, e uma promessa sem prazo deixa a tela girando para sempre.
  Regra que ficou: **toda chamada ao servidor passa por `chamarServidor()`**, que tem prazo,
  trata resposta vazia e nunca fica pendurada.
- **Dois track records:** histórico de dados (aba no Sheets) ≠ histórico de código
  (`version.json` + git). Nunca juntar.

## Deploy (pontos críticos — detalhe em `docs/GUIA_DEPLOY.md` quando chegarmos lá)

- `appsscript.json`: `access: ANYONE_ANONYMOUS`, `executeAs: USER_DEPLOYING`.
- **Não usar** `Session.getActiveUser()` nem `Session.getScriptTimeZone()` — disparam a
  tela de login do Google. Timezone vem da planilha: `sheet.getParent().getSpreadsheetTimeZone()`.
- O clasp **não atualiza** o nível de acesso de um deploy já existente — ajustar manual no
  painel do Apps Script (Implantar → Gerenciar implantações → editar → Nova versão).
- **Usar o clasp v3** (`npx @google/clasp@latest`): o login em `~/.clasprc.json` está no
  formato v3 (`tokens.default`), e o clasp v2 não lê — dá "Cannot read properties of
  undefined (reading 'access_token')", que parece falta de login mas não é.
- Publicar = **três passos**, e o 2º sem o 3º não muda nada para o usuário:
  1. `clasp push` (manda o código; já vale no deploy `@HEAD`, o de teste)
  2. `clasp create-version "..."` (tira a foto imutável)
  3. `clasp update-deployment <id> -V <n>` (aponta a produção pra foto nova)
- Antes de `clasp push`, conferir se o remoto bate com o git (`clasp pull` **numa pasta
  separada** — pull na pasta do projeto atropela o que ainda não foi commitado).

## Estrutura

```
Controle de Despachante/
├── CLAUDE.md            ← este arquivo (decisões do projeto)
├── README.md            ← visão geral + roadmap
├── version.json         ← fonte única da versão (Flufa)
├── index.html           ← MOLDURA (GitHub Pages) que embute o app do Apps Script
├── testes/
│   └── upload.test.js   ← único teste: o upload grande (node testes/upload.test.js)
└── apps-script/         ← o MOTOR (enviado ao Apps Script via clasp ou copiar/colar)
    ├── appsscript.json  ← manifesto (acesso anônimo, roda como dono)
    ├── Codigo.gs        ← backend: CRUD, Drive, e-mail, auth
    └── App.html         ← a tela do app (servida pelo doGet)
```

## Status

**V4.0.0 escrita e testada localmente em 2026-09-09 — AINDA NÃO PUBLICADA.**
No ar continua a **V3.2.0** (implantação 21). Endereço:
https://erfrizzera.github.io/controlededespachante/

A V4 é a maior mudança desde a V3: mexe em cadastro, financeiro, coluna Status, e-mail e
esquema de dados de uma vez. Foi validada num navegador de verdade (servidor local + página
carregada, console limpo, os cinco itens conferidos um a um) — mas a lição do item 1 da V3.1
manda desconfiar de teste local. **Se der tela vazia / logout travado depois de publicar:
esperar ~1 min, `Ctrl+Shift+R`, relogar. Se voltar na hora ao reverter para a versão 21, é a
versão nova — aí isole item a item.**

Estado real da implantação (conferido com `clasp list-deployments` em 2026-08-21):

| Onde | O quê |
|---|---|
| Implantação de produção | `AKfycbz8FqcbL2DqwkqUH0vmoJ503Vui7G7wwD718-QZrGpVeSUXzNgSPN2g5JG9FrgWeMnF` |
| Versão servida hoje | **21** (V3.2 completa) — no ar desde 21/08 |
| Base estável anterior | versão **20** = V3.2 sem a ordenação; **19** = V3.1; **8** = V3.0 puro |
| Reverter para | versão **21** (`update-deployment -V 21 <deploymentId>`) |

**V3.2 = V3.1 + ordenação pelo cabeçalho + filtro "Exibir" + "Arquivado na Rede".** Saiu em dois
tempos: a versão **20** (03/08) levou o filtro e o checkbox; a **21** (21/08) acrescentou a
ordenação. Sem sustos desta vez — subiu de uma vez e funcionou.

**V3.1 = base V3.0 + item 2 (Situação/Próximo) + item 3 (Protocolizado) + item 5 (financeiro em
primeira maiúscula) + cifrão por último + coluna "Tempo de Processo" removida.** Itens 2, 5 e a
remoção da coluna foram publicados **um de cada vez** (versões 16→19) porque o item 1 original
(tempo na descrição) quebrava o app no ar; ver a lição em "Domínio (V3)".

**Pendente de implantação: a V4 inteira.** O código no git e o `version.json` já estão em
4.0.0; a implantação ainda serve a versão 21.

> **Armadilha reconfirmada em 29/07 (deploy):** logo após cada `update-deployment` o app pode abrir
> **vazio / com logout travado** por causa do cold-start + deslogamento — esperar ~1 min, dar
> `Ctrl+Shift+R` e relogar antes de julgar. **MAS:** se reverter pra versão estável e ela volta a
> funcionar na hora enquanto a nova continua quebrada, aí **não é cold-start — é a versão nova**, e
> a saída é isolar item a item (foi assim que se achou que o item 1 na descrição era o culpado).

> **Máquina nova precisa de Node (descoberto em 21/08):** o projeto vive numa pasta sincronizada
> pelo Drive, então ele *aparece* em qualquer computador — mas o **Node/npm e o login do clasp
> não vêm junto**. Sem eles o `npx` nem existe e a publicação para. Nesta máquina resolveu-se com
> `winget install --id OpenJS.NodeJS.LTS --scope user` (instala portátil, sem admin, e **não entra
> no PATH da sessão atual** — chame pelo caminho completo ou abra um terminal novo) seguido de
> `clasp login`, que só o dono da conta pode aprovar no navegador.

Para publicar uma versão nova (o `clasp` **não** está instalado; use `npx`):

```
npx @google/clasp push --force
npx @google/clasp create-version "descricao"
npx @google/clasp update-deployment -V <n> <deploymentId>
```

O `deploymentId` é **argumento posicional** — no clasp 3.x **não existe** a flag `-i`
(o CLAUDE.md já errou isso uma vez). Confira depois com `npx @google/clasp list-deployments`.
No painel, o mesmo: Implantar → Gerenciar implantações → lápis → versão → Implantar.

- **V1:** motor reescrito do zero + interface portada (`App.html`) + moldura no GitHub Pages.
  Correção: ID sequencial **reservado no servidor** (`reservarProximoId`) evita pasta órfã.
- **V2:** perfis (admin/cobra/despachante), trilha financeira separada (coluna `Status
  Financeiro`), pendência com **conversa** (aba `Pendencias`; anexos vão pra pasta da ata).
- **V2.1:** múltiplos **reembolsos** por ata (aba `Reembolsos`, anexo por pedido, total somado
  na coluna `Reembolso Taxas`); status **"Pendência"** (largou o "Cobra"); coluna **Arquivos**
  virou o **ícone da pasta** do Drive; selo **"— sem custos"** removido do Status.
- **V2.1.1:** conserto do botão **Registrar** travando: a ata chancelada volta escaneada da Junta
  (dezenas de MB) e o envio num pedido só morria calado. Agora vai em pedaços, com porcentagem.
  Junto: prazo em toda chamada ao servidor, erro visível **dentro** da tela via `avisar()` (não
  dá pra confiar no `alert()` rodando em iframe) e o modal passou a descartar o arquivo anterior.
- **V2.1.2:** o **Excluir** (ata e pedido de reembolso) não fazia nada — e sem aviso nenhum.
  O Chrome **ignora** `alert`/`confirm`/`prompt` chamados de iframe de outra origem, que é
  exatamente como o app roda (Pages → Apps Script → googleusercontent). O `confirm()` devolve
  `false` calado, e o padrão `if (!confirm(...)) return;` lia isso como "o usuário cancelou" —
  então a função voltava na porta, toda vez. Medido no Chrome: dentro de iframe cross-origin o
  `confirm()` devolve `false` em ~8 ms, sem caixa nenhuma. Agora existe `confirmar()` — janela
  na própria tela, devolve Promise —, irmã do `avisar()` da V2.1.1; os `alert()` que sobravam
  também viraram `avisar()`. **Não sobrou nenhuma chamada a `alert`/`confirm`/`prompt`** no
  `App.html`: dentro do iframe elas não funcionam, então não são uma opção aqui.
- **V2.2:** o **Registrar** travava com a ata chancelada real (**69 MB**, escaneada). O upload
  em pedaços da V2.1.1 **não resolvia**: para gravar, o Apps Script teria que carregar o
  arquivo inteiro na memória (~300 MB de pico, com o base64 inflando 1/3), muito além do que
  ele aguenta e do teto de 6 min por execução. Agora o navegador fala **direto com a API do
  Drive** (sessão retomável, pedaços de 8 MB, porcentagem na tela); o Apps Script só prepara a
  pasta (`prepararUploadDireto`) e libera o link no fim (`finalizarUploadDireto`) — **os bytes
  não passam mais por ele**, então tamanho deixou de ser problema. A máquina de pedaços do
  servidor foi removida. A tela também guarda o **`File`** em vez do base64: o `readAsDataURL`
  era assíncrono e, num PDF grande, quem salvasse rápido enviava **vazio, sem erro**.
  - **Preço a pagar:** o navegador recebe uma **chave temporária do Google** (~1 h, do dono do
    sistema). É o que permite falar direto com o Drive. Aceito conscientemente: sem isso não há
    arquivo grande.
  - **Não confirmado antes de publicar:** se o Google expõe o cabeçalho `Location` (o endereço
    da sessão) ao nosso domínio. Se não expuser, o código cai sozinho no envio de **uma tacada
    só** (`subirDeUmaVez`) — perde a porcentagem e o retomar, não o envio.
- **V3:** a **bola** (com quem está a vez, coluna `Bola`, movida só pelo chat/devolução); fim da
  **"Pendência"** que congelava a ata; **financeiro no cifrão** (painel lateral com NF/reembolsos,
  baixa por pedido, cifrão vermelho enquanto houver pedido sem baixa). Upload direto pro Drive.
- **V3.1:** acabamentos, publicados **um de cada vez** (implantações 16→19): **"Protocolizado"**
  (rótulo de display do "Em Protocolo"); coluna Status com **"Situação:"** e **"Próximo:"** (os
  botões da Junta migraram das Ações pra lá); **painel financeiro em primeira maiúscula**; cifrão
  **por último** nos ícones de ação; coluna **"Tempo de Processo" removida**.
  - **A saga do item 1 (lição cara):** a 1ª ideia — mover o tempo pra dentro da descrição —
    passava no **teste local com backend simulado** mas **quebrava o app no ar** (tela vazia +
    logout travado). Backend e manifesto eram idênticos à versão boa, então o suspeito era só o
    `App.html`. Como o sintoma era **idêntico** ao cold-start, foi confundido com ambiente várias
    vezes. O que **isolou de verdade**: reverter pra versão estável fazia tudo voltar **na hora**
    (logo não era cold-start), e publicar **item a item** mostrou que só o item 1 quebrava. Solução
    pragmática: **desistir de mover pra descrição e só remover a coluna** — estável. O porquê exato
    do item-1-original quebrar ficou **sem diagnóstico** (aberto, se um dia interessar).
- **V4:** cinco mudanças pedidas de uma vez. (1) o filtro **já abre ocultando finalizadas**;
  (2) check **"Pagamento no Navi"** abaixo do "Arquivado na Rede", visível por coluna `Navi`
  na aba `Usuarios`, e **"Finalizado" passou a exigir os dois checks** além do Concluído —
  o meio-termo virou o selo **"Encerrando"**; (3) o e-mail trocou "bola com" por
  **"responsável atual"**; (4) o financeiro virou **uma central única de pedidos de
  pagamento** (objeto + tipo Reembolso/Serviço + valor + lastro), sem a divisão
  reembolso/NF e sem o campo Honorários solto; (5) nasceu a trilha **"Outros Documentos"**
  (`Solicitado → Concluído`, sem protocolo), escolhida no cadastro.
  - **Limpeza que veio junto:** saíram do `App.html` os modos mortos do modal
    (`workflow_financeiro`, `workflow_pagar`, `fin_lancar`, `fin_pagar`), os campos de
    NF/comprovante/valores, o `getFinanceiroBadge` e o `calculateDuration` — todos sem
    chamador. Menos código morto = menos superfície para o próximo susto.
- **Testes:** `node testes/upload.test.js` — o **único** teste do projeto, e de propósito. O
  upload grande só falha em produção, com arquivo de dezenas de MB; e a tela publicada não dá
  para automatizar (o iframe aninhado do Apps Script não aceita clique de fora). Mexeu no
  `uploadFilePromise`? Rode.
- Segurança por perfil é **na tela** (esconde botões). Endurecer no backend fica pra depois,
  junto da pendência da **senha em texto puro** na aba `Usuarios`.
