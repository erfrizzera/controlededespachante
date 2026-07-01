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
  (+ o toggle **"Pendência Cobra"**, que congela e depois volta ao status anterior — agora
  com conversa e anexos numa aba `Pendencias`).
- **Financeiro (trilha separada, independente da Junta):** `— → Custos lançados →
  Pendente pagamento Cobra → Pago`. Permite cobrar NF/reembolso antes do fim na Junta.
- **Perfis (coluna Permissão da aba `Usuarios`):** `admin` (tudo), `cobra` (sem E-mails,
  Sheets, Correção Manual, Excluir) e `despachante` (também sem Cadastrar e Drive Geral).

## Modelo de dados (aba `Atas`, 17 colunas)

Identificação: `ID` (sequencial 0001…), `Empresa` (lista fixa de empresas do grupo),
`Descrição`, `Data de Envio`, `Status`, `Status Anterior`, `Status Financeiro`.
Documentos (PDF no Drive; a célula guarda o link): `Ata Assinada`, `Ata Registrada`,
`Nota Fiscal`, `Comprovante de Despesa`, `Pasta no Drive`.
Protocolo: `Número do Protocolo`, `Data do Protocolo` (automática).
Financeiro: `Reembolso Taxas`, `Honorários Despachante`.
Conclusão: `Data de Conclusão` (automática).

## Regras da Flufa aplicadas

- **Versão mora só em `version.json`** (raiz). O selo discreto na tela lê dele e **falha em
  silêncio**. Ninguém digita número de versão na tela.
- **Segredos** vivem nas *Script Properties* do Apps Script (o "cofre" equivalente ao
  GitHub Secrets aqui), nunca no código.
- **Arquivo pesado (PDF) fica no Drive**; o Sheets guarda só o link. Mantém a planilha leve.
- **Dois track records:** histórico de dados (aba no Sheets) ≠ histórico de código
  (`version.json` + git). Nunca juntar.

## Deploy (pontos críticos — detalhe em `docs/GUIA_DEPLOY.md` quando chegarmos lá)

- `appsscript.json`: `access: ANYONE_ANONYMOUS`, `executeAs: USER_DEPLOYING`.
- **Não usar** `Session.getActiveUser()` nem `Session.getScriptTimeZone()` — disparam a
  tela de login do Google. Timezone vem da planilha: `sheet.getParent().getSpreadsheetTimeZone()`.
- O clasp **não atualiza** o nível de acesso de um deploy já existente — ajustar manual no
  painel do Apps Script (Implantar → Gerenciar implantações → editar → Nova versão).

## Estrutura

```
Controle de Despachante/
├── CLAUDE.md            ← este arquivo (decisões do projeto)
├── README.md            ← visão geral + roadmap
├── version.json         ← fonte única da versão (Flufa)
├── index.html           ← MOLDURA (GitHub Pages) que embute o app do Apps Script
└── apps-script/         ← o MOTOR (enviado ao Apps Script via clasp ou copiar/colar)
    ├── appsscript.json  ← manifesto (acesso anônimo, roda como dono)
    ├── Codigo.gs        ← backend: CRUD, Drive, e-mail, auth
    └── App.html         ← a tela do app (servida pelo doGet)
```

## Status

**V2.0.0 no ar (2026-07-01).** Endereço: https://erfrizzera.github.io/controlededespachante/
Produção (implantação Apps Script `AKfycbz8Fq…`) reimplantada na **versão 2**; moldura e URL inalteradas.

- **V1:** motor reescrito do zero + interface portada (`App.html`) + moldura no GitHub Pages.
  Correção: ID sequencial **reservado no servidor** (`reservarProximoId`) evita pasta órfã.
- **V2:** perfis (admin/cobra/despachante), trilha financeira separada (coluna `Status
  Financeiro`), pendência com **conversa** (aba `Pendencias`; anexos vão pra pasta da ata).
- Segurança por perfil é **na tela** (esconde botões). Endurecer no backend fica pra depois,
  junto da pendência da **senha em texto puro** na aba `Usuarios`.
