# Contexto para migração de conversa — Controle de Despachante

> Documento de handoff. Foco na **lógica** (o que se quer e por quê), não no passo-a-passo
> de implementação — porque o "como" que eu tentei provavelmente causou os erros. Uma
> conversa nova deve reimplementar do zero, com liberdade de método, respeitando as
> **armadilhas** listadas no fim.

---

## 1. O que é o sistema

Controla o ciclo de vida de **atas societárias** enviadas para registro na **Junta
Comercial**. Quem opera: a Cobra Brasil (dona) e um despachante. Cada ata passa por etapas
na Junta e, em paralelo, tem uma parte financeira (reembolsos, NF, honorários).

## 2. Arquitetura (padrão "Flufa": coletor → armazém → tela)

- **Armazém:** Google Sheets (planilha "Controle Despachante — Base de Dados").
- **Motor:** Google Apps Script (`apps-script/Codigo.gs`) — CRUD no Sheets, upload no Drive,
  e-mail, autenticação. Publicado como Web App.
- **Tela:** `apps-script/App.html` (servida pelo `doGet` do Apps Script) — dashboard,
  modais, tudo. Roda **dentro de um iframe**.
- **Moldura:** `index.html` no GitHub Pages embute o Web App num iframe, pra dar um endereço
  bonito (`erfrizzera.github.io/controlededespachante`) e esconder a URL gigante do Google.
- **Selo de versão:** lê de `version.json` (fonte única da versão). É só cosmético.

> **Importante:** o app roda **dentro de dois iframes aninhados** (GitHub Pages → Apps
> Script → googleusercontent). Isso é a raiz de várias armadilhas (ver seção 7).

## 3. Modelo de dados (planilha)

- Aba **`Atas`**: uma linha por ata. Colunas relevantes: ID, Empresa, Descrição, Data de
  Envio, **Status** (da Junta), documentos (links do Drive), Número/Data do Protocolo,
  Reembolso Taxas (soma), Honorários, Data de Conclusão, e **`Bola`** (V3: com quem está a
  vez — "Cobra" ou "Despachante").
- Aba **`Reembolsos`**: um pedido por linha (ID da Ata, Data/Hora, Autor, Valor,
  Justificativa, Arquivo(s), **Baixado Em**).
- Aba **`Pendencias`**: o histórico do **chat/devolução** (uma linha por mensagem).
- Aba **`Usuarios`**: whitelist de acesso (Email, Permissão, Senha) — perfis admin / cobra /
  despachante.

**Dados estão 100% íntegros** (13 atas). Nada foi perdido em nenhum momento.

## 4. O que está NO AR e FUNCIONANDO (a base sólida — "V3.0" + item 3)

Toda a reforma grande já está publicada e funcionando. Não mexer nisso, é a base:

- **A "bola"** (quem tem a vez): um toggle liga-desliga na coluna Status. **Cobra à
  esquerda (azul), despachante à direita (cinza).** Guardada na coluna `Bola`. **Só o chat
  a move** — quem escreve e envia está *devolvendo* a ação pro outro lado. Ata nova nasce
  com o despachante. Junta concluída → "Finalizado" (bola de ninguém).
- **Acabou a "Pendência"** que congelava a ata (modelo antigo). Não congela mais nada.
- **Chat = devolução:** cada mensagem passa a bola pro outro lado. Aceita vários anexos.
- **Financeiro num cifrão:** um ícone de $ nas Ações abre um painel lateral (da direita)
  com: upload de NF/comprovantes, lista de pedidos de reembolso — **cada um com sua própria
  "baixa" (dar como pago)** —, e honorários. O cifrão fica **vermelho** enquanto houver
  qualquer pedido sem baixa. A baixa é da Cobra/admin.
- **Coluna Arquivos virou botão de pasta** (ícone) nas Ações.
- **Upload direto pro Drive:** arquivos grandes (a ata chancelada tem ~69 MB) sobem do
  navegador **direto pro Drive**, sem passar pelo Apps Script (que não aguenta o tamanho).
- **"Protocolizado"** (item 3): o status "Em Protocolo" **aparece na tela como
  "Protocolizado"** (só o rótulo; o dado guardado continua "Em Protocolo").
- **Perfis** (admin/cobra/despachante) escondem botões conforme a permissão.

## 5. O que FALTA implementar — a LÓGICA de cada item

### Item 1 — Tempo de processo sai da coluna, vai pra descrição
- **O quê:** remover a coluna "Tempo de Processo" da tabela. O tempo decorrido passa a
  aparecer **dentro da célula da Descrição**, numa linha embaixo de "Envio: [data]", na
  mesma fonte pequena e cinza dos outros metadados (ID, Envio).
- **Por quê:** enxugar a tabela (menos colunas). O tempo é informação secundária e combina
  melhor junto do resto do "rodapé" da descrição.

### Item 2 — Coluna Status com "Situação" e "Próximo"
- **O quê:** a coluna Status passa a ter 3 linhas empilhadas:
  1. o **toggle da bola** (quem tem a vez),
  2. **"Situação: [status atual]"** (Enviado / Protocolizado / Registrada / Concluído),
  3. **"Próximo: [botão da próxima ação]"** — e esse botão (Protocolar / Registrar /
     Concluir Junta) **sai da coluna Ações e vem pra cá**.
- **Por quê:** juntar num lugar só as três perguntas que a pessoa faz olhando a linha —
  *de quem é a vez*, *em que pé está*, e *qual o próximo passo*. Isso limpa a coluna Ações
  (que fica só com cifrão, pasta, chat e os botões de admin).

### Item 5 — Uniformizar o painel financeiro
- **O quê:** dentro do painel financeiro (o que abre no cifrão), deixar **todo o texto em
  "primeira maiúscula"** (ex.: "Pedidos de reembolso", "Novo pedido", "Aguardando") — hoje
  tem coisa em CAIXA ALTA e coisa em primeira maiúscula, misturado. Padronizar tudo em
  primeira maiúscula. E deixar a **área de upload de NF clara** (rótulo tipo "Anexar NF e
  comprovantes").
- **Por quê:** consistência visual; a mistura de maiúsculas fica desleixada.

> Os três itens são **acabamentos cosméticos** em cima de um sistema que já funciona. São
> desejáveis, mas não críticos.

## 6. Item CANCELADO + limpeza pendente

- **Item 4 (e-mail represado) — CANCELADO.** A ideia era segurar os avisos e mandar só às
  10h e 15h. Foi descartado; os e-mails voltam a sair **na hora**.
- **Limpeza manual pendente:** no Apps Script → **Acionadores** (⏰), apagar os **2 gatilhos
  `enviarFilaEmails`** (10h e 15h) que foram criados pra esse item. Se não apagar, eles
  podem mandar e-mail de erro diário.

## 7. Armadilhas conhecidas — o "erro sistêmico" (LEIA antes de publicar)

Isto é o mais importante deste documento. Foi o que fez uma tarde inteira dar errado:

1. **NUNCA usar `ScriptApp.newTrigger` / `ScriptApp.getProjectTriggers` em código que o Web
   App executa.** Isso exige o escopo `script.scriptapp`. Num Web App **dentro de iframe**,
   o Google tenta mostrar uma tela de autorização que o iframe **bloqueia** → o app fica
   **em branco permanente**. Foi o pior erro do dia. Gatilhos de horário, se precisar, só
   pelo painel Acionadores, à mão — nunca por código chamado pela tela.

2. **Cold-start engana:** toda republicação deixa o servidor do Google "frio". Nos primeiros
   **20 a 60 segundos**, o app abre **branco ou com "0 atas"** enquanto acorda. **Isso é
   normal, não é bug e não é perda de dados.** Eu li esses estados intermediários como "o
   código quebrou" e revertí várias vezes à toa — o que só deixava o servidor mais instável.
   **Regra:** depois de publicar, **espere 1 minuto inteiro** e recarregue antes de julgar.

3. **Publicar pode "deslogar":** trocar a versão publicada às vezes derruba a sessão de
   login. Aí o app abre "0 atas" (deslogado), não porque quebrou. **Fazer login de novo**
   resolve. Some isso com o cold-start e um app que funciona parece quebrado.

4. **Teste local ANTES de publicar (chave pra não sofrer):** dá pra rodar o `App.html` no
   navegador local com um `google.script.run` **simulado** que devolve atas de mentira.
   Assim você vê a tela renderizar **sem tocar na produção**. Foi assim que provei que **o
   código de todos os itens está correto** (renderiza as 13 atas perfeitamente). Ou seja: o
   que "quebrava" no ar era **ambiente (cold-start/sessão), não o código**.

5. **Não republicar em série.** Cada deploy esfria o servidor. Ficar publicando/revertendo
   em sequência (fiz isso ~15 vezes) empilha instabilidade e faz tudo parecer pior.

> **Moral pra próxima conversa:** implemente os itens, **teste local com backend simulado**,
> publique **uma vez**, **espere 1 min + relogin**, e só então avalie. Não reverta no susto.

## 8. Referências técnicas

- **Repositório git:** branch `main`.
  - `42cf09c` = base estável V3.0 (= **versão 8** do Apps Script). É pra onde reverter em
    emergência: `clasp update-deployment -V 8 <deploymentId>`.
  - `74c1c63` = **todos os ajustes já escritos** (itens 1, 2, 3, 5; item 4 já removido).
    `git diff 42cf09c 74c1c63 -- apps-script/App.html` mostra cada mudança pronta —
    pode servir de referência, mas o método de aplicar é livre.
  - Versão **12** do Apps Script (no ar hoje) = V3.0 + só o item 3.
- **Deployment de produção (id):**
  `AKfycbz8FqcbL2DqwkqUH0vmoJ503Vui7G7wwD718-QZrGpVeSUXzNgSPN2g5JG9FrgWeMnF`
- **Publicar:** `clasp push --force` → `clasp create-version "..."` →
  `clasp update-deployment -V <n> <deploymentId>`. (Usar `npx @google/clasp`.)
- **Planilha:** "Controle Despachante — Base de Dados" no Drive do dono
  (id `1MJCUyMNBfQ-0C-_c_3CMhbykkZwAP6LEAoUG9Y0MwHk`). Abas: Atas, Reembolsos, Pendencias,
  Usuarios. **Dados íntegros.**
- **Site:** https://erfrizzera.github.io/controlededespachante/
- **Documento de decisões do projeto:** `CLAUDE.md` (na raiz) tem o histórico completo das
  versões e decisões de arquitetura.

## 9. Estado atual num parágrafo

Produção está na **versão 12** = base V3.0 (toda a reforma grande funcionando) **+ o item 3
("Protocolizado")**. As 13 atas aparecem, todos os botões funcionam. Faltam os itens **1, 2
e 5** (acabamentos cosméticos), cujo código já existe e foi validado localmente. O item 4
foi cancelado (falta só apagar 2 gatilhos no painel). Nenhum dado foi perdido em momento
algum.
