# Controle de Despachante — Cobra Brasil

Controle do ciclo de vida de **atas societárias** enviadas para registro na Junta Comercial.
Arquitetura **Flufa V1** (ver [`CLAUDE.md`](CLAUDE.md) para as decisões).

## Como as peças se encaixam

```
    Você abre  ─▶  index.html (GitHub Pages, a "moldura")
                         │  embute em tela cheia
                         ▼
                   App.html  ◀── servido pelo doGet do Apps Script (o "motor")
                         │  google.script.run
                         ▼
                   Codigo.gs  ─▶  Google Sheets (armazém) + Drive (PDFs) + e-mail
```

- **Moldura** (`index.html`) — dá um endereço bonito e esconde a URL do Google.
- **Motor** (`apps-script/`) — faz todo o trabalho: guardar, ler, subir arquivo, avisar.
- **Armazém** — Google Sheets (aba `Atas` + aba `Usuarios`).

## Roadmap da construção

- [x] **Fundação** — estrutura, `version.json`, `CLAUDE.md`, manifesto, moldura.
- [x] **Motor: dados** — armazém + CRUD de atas + ID sequencial + datas automáticas.
- [x] **Tela do app** — dashboard, KPIs, tabela, filtros, formulário por etapa.
- [x] **Drive / upload** — pasta por ata + upload de PDF.
- [x] **E-mail** — aviso automático a cada mudança de status.
- [x] **Autenticação** — login por senha, whitelist na aba `Usuarios`.
- [ ] **Deploy** — publicar como Web App anônimo + apontar a moldura (ver [`docs/GUIA_DEPLOY.md`](docs/GUIA_DEPLOY.md)).

## Rodar

O motor roda no Google Apps Script; a moldura no GitHub Pages. O passo a passo de
publicação entra em `docs/GUIA_DEPLOY.md` na etapa de deploy.
