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

## Domínio (V2): duas trilhas + perfis

- **Processo na Junta:** `Enviado → Em Protocolo → Registrada → Concluído`
  (+ o toggle **"Pendência"**, que congela e depois volta ao status anterior — agora
  com conversa e anexos numa aba `Pendencias`). *(Era "Pendência Cobra" até a V2.1.)*
- **Financeiro (trilha separada, independente da Junta):** `— → Custos lançados →
  Pendente pagamento Cobra → Pago`. Permite cobrar NF/reembolso antes do fim na Junta.
  A partir da V2.1, **cada ata pode ter vários pedidos de reembolso** (aba `Reembolsos`),
  cada um com valor + justificativa + anexo próprio; a coluna `Reembolso Taxas` da aba
  `Atas` guarda a **soma** deles. Honorários seguem como campo único à parte.
- **Perfis (coluna Permissão da aba `Usuarios`):** `admin` (tudo), `cobra` (sem E-mails,
  Sheets, Correção Manual, Excluir) e `despachante` (também sem Cadastrar e Drive Geral).

## Modelo de dados (aba `Atas`, 17 colunas)

Identificação: `ID` (sequencial 0001…), `Empresa` (lista fixa de empresas do grupo),
`Descrição`, `Data de Envio`, `Status`, `Status Anterior`, `Status Financeiro`.
Documentos (PDF no Drive; a célula guarda o link): `Ata Assinada`, `Ata Registrada`,
`Nota Fiscal`, `Comprovante de Despesa`, `Pasta no Drive`.
Protocolo: `Número do Protocolo`, `Data do Protocolo` (automática).
Financeiro: `Reembolso Taxas` (soma dos pedidos da aba `Reembolsos`), `Honorários Despachante`.
Conclusão: `Data de Conclusão` (automática).

Abas auxiliares: `Usuarios` (whitelist + perfil), `Pendencias` (conversa de pendência),
`Reembolsos` (um pedido por linha: `ID da Ata`, `Data/Hora`, `Autor`, `Valor`,
`Justificativa`, `Arquivo`). Na coluna **Arquivos** da tela mostra-se só o **ícone da
pasta** da ata no Drive — os documentos ficam arquivados lá dentro.

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

**V2.2.0 no código (2026-07-17).** Endereço: https://erfrizzera.github.io/controlededespachante/

Estado real da implantação (conferido com `clasp list-deployments` em 2026-07-17 — o texto
anterior aqui dizia que a V2.1 não tinha subido, e **estava errado**; ela é a versão 4 e está
no ar desde 10/07):

| Onde | O quê |
|---|---|
| Implantação de produção | `AKfycbz8FqcbL2DqwkqUH0vmoJ503Vui7G7wwD718-QZrGpVeSUXzNgSPN2g5JG9FrgWeMnF` |
| Versão servida hoje | **7** (V2.2.0) — no ar desde 17/07, conferido com `list-deployments` |
| Versões 5 e 6 | passos intermediários do mesmo dia; a 7 contém tudo |

**Nada pendente de implantação.** Código, versão e implantação estão alinhados.

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
- **Testes:** `node testes/upload.test.js` — o **único** teste do projeto, e de propósito. O
  upload grande só falha em produção, com arquivo de dezenas de MB; e a tela publicada não dá
  para automatizar (o iframe aninhado do Apps Script não aceita clique de fora). Mexeu no
  `uploadFilePromise`? Rode.
- Segurança por perfil é **na tela** (esconde botões). Endurecer no backend fica pra depois,
  junto da pendência da **senha em texto puro** na aba `Usuarios`.
