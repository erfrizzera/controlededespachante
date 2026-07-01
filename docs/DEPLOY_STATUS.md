# Status do Deploy — Controle de Despachante

**Data:** 2026-07-01 · **Feito por:** Claude (via clasp autenticado como erfrizzera@gmail.com)

## Recursos já criados (motor)

| Item | Valor |
|---|---|
| Projeto Apps Script (editor) | https://script.google.com/d/1y720zyUSAysHkcOLLKRawzYFwZZ6aBLCGn_1BOQZz8g_9_hW__3nTn3q/edit |
| scriptId | `1y720zyUSAysHkcOLLKRawzYFwZZ6aBLCGn_1BOQZz8g_9_hW__3nTn3q` |
| Deployment (Web App) | `AKfycbz8FqcbL2DqwkqUH0vmoJ503Vui7G7wwD718-QZrGpVeSUXzNgSPN2g5JG9FrgWeMnF` |
| URL do Web App (/exec) | https://script.google.com/macros/s/AKfycbz8FqcbL2DqwkqUH0vmoJ503Vui7G7wwD718-QZrGpVeSUXzNgSPN2g5JG9FrgWeMnF/exec |

Código enviado (`Codigo.gs` + `App.html` + `appsscript.json`). A URL acima já está
colada na moldura (`index.html`).

## ⛔ O que trava agora: 403 "Acesso negado"

O `clasp` cria a implantação **restrita** e não consegue: (a) trocar o acesso para
*Qualquer pessoa*, nem (b) aprovar as permissões de Drive/Planilha/Gmail. Ambas são telas
de consentimento do Google que **só o dono da conta** pode aprovar no navegador.

## ✅ Sua parte (uma vez, ~3 min) — só cliques

1. Abra o **editor** do projeto (link acima).
2. **Autorizar permissões:** selecione a função `getAtas` no topo e clique **▶ Executar**.
   Vai abrir a tela de permissões → **Revisar permissões** → escolha sua conta →
   *"Isto não foi verificado"* → **Avançado → Acessar (não seguro)** → **Permitir**.
   (É seu próprio script; o aviso é padrão do Google para projetos pessoais.)
3. **Deixar público:** menu **Implantar → Gerenciar implantações → ✏️ (editar)** →
   em **Quem tem acesso** escolha **Qualquer pessoa** → **Implantar**.
   *(Mantenha "Executar como: Eu".)* A URL do /exec continua a mesma.
4. Me avise — eu testo a URL de novo e confirmo que abriu a tela de login do sistema.

## Depois disso: a moldura (GitHub Pages)

Falta publicar o `index.html` no GitHub Pages (precisa da sua conta GitHub — não há `gh` CLI
nesta máquina). Repo local já preparado (git init + commit). Passos em `GUIA_DEPLOY.md`,
Parte 2. Como a URL do app já está na moldura, é só subir e ligar o Pages.
