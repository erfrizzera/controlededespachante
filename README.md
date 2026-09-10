# Controle de Despachante — Cobra Brasil

Controle do ciclo de vida de **atas societárias** enviadas para registro na Junta Comercial
e, desde a V4, também dos **pedidos de outros documentos** ao despachante.
Arquitetura **Flufa V1** (ver [`CLAUDE.md`](CLAUDE.md) para as decisões).

## Como as peças se encaixam

```
    Você abre  ─▶  index.html (GitHub Pages, a "moldura")
                         │  embute em tela cheia
                         ▼
            App(Novo).html  ◀── servido pelo doGet do Apps Script (o "motor")
                         │  google.script.run
                         ▼
                   Codigo.gs  ─▶  Google Sheets (armazém) + Drive (PDFs) + e-mail
```

- **Moldura** (`index.html`) — dá um endereço bonito e esconde a URL do Google.
- **Motor** (`apps-script/`) — faz todo o trabalho: guardar, ler, subir arquivo, avisar.
- **Armazém** — Google Sheets (abas `Atas`, `Usuarios`, `Pendencias` e `Reembolsos`).

## Roadmap da construção

- [x] **Fundação** — estrutura, `version.json`, `CLAUDE.md`, manifesto, moldura.
- [x] **Motor: dados** — armazém + CRUD de atas + ID sequencial + datas automáticas.
- [x] **Tela do app** — dashboard, KPIs, tabela, filtros, formulário por etapa.
- [x] **Drive / upload** — pasta por ata + upload de PDF.
- [x] **E-mail** — aviso automático a cada mudança de status.
- [x] **Autenticação** — login por senha, whitelist na aba `Usuarios`.
- [x] **V4** — duas trilhas de cadastro (ata / outros documentos), central única de pedidos
      de pagamento, check "Pagamento no Navi" e conclusão derivada dos dois checks.
- [x] **V4.2** — tela nova (quadro por etapa + gaveta) vinda do handoff do Claude Design. Subiu em
      paralelo em `?ui=novo` e **virou o padrão em 10/09** (implantação 23); a V4.1 fica em `?ui=antigo`.
- [ ] **Deploy** — publicar como Web App anônimo + apontar a moldura (ver [`docs/GUIA_DEPLOY.md`](docs/GUIA_DEPLOY.md)).

## Rodar

O motor roda no Google Apps Script; a moldura no GitHub Pages. O passo a passo de
publicação entra em `docs/GUIA_DEPLOY.md` na etapa de deploy.
