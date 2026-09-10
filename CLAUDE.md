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

## V4.2 — a tela nova (quadro por etapa), em paralelo

Veio de um handoff do Claude Design (`Novo Frontend/`, design system **Industry**): o mesmo
domínio, outra tela. Sai a tabela com filtros e entra um **quadro de 4 colunas** (A protocolar ·
Na Junta · Conferência · Concluído) mais uma **gaveta sobreposta** por pedido, com chat,
checklist e pagamentos em abas.

**Subiu em paralelo e só depois virou o padrão (10/09).** Por dias, `doGet` serviu `AppNovo.html`
só a quem pedia **`?ui=novo`**, com a V4.1 como padrão — a rede de segurança que faltou na V3.1.
Hoje é o contrário: **`AppNovo` é o padrão e a V4.1 responde em `?ui=antigo`**, até ninguém mais
precisar dela.

A moldura repassa o `?ui=` que estiver no endereço, mas **isso só vale depois que a produção
servir o `AppNovo.html`** — ela aponta para a implantação fixa (hoje a 22, anterior à tela nova),
e `?ui=novo` ali não acha arquivo nenhum. Enquanto a produção não trocar, o teste é pela URL do
`@HEAD`, direto, logado como dono:
`https://script.google.com/macros/s/AKfycbziAqlOmFD_P-BEc2dZhnmguCjdt4cxaAQGYDgYA4U/exec?ui=novo`

> **O `@HEAD` pede login do Google, a produção não.** São implantações diferentes, com níveis de
> acesso diferentes, e o clasp **não** mexe no nível de acesso de implantação que já existe (a
> mesma armadilha que o guia de deploy já registrava). Não é bug da tela: é o `@HEAD` sendo um
> deploy de teste. Logado como dono, o app roda normal e o login por senha do sistema continua
> valendo por cima.

### O "Concluído" volta a ser gravado — e exige o checklist inteiro
A V4.1 matou o botão de concluir e derivou tudo dos dois checks. **A tela nova traz o botão de
volta** (`CONCLUIR PEDIDO`, bloqueado até os **três** itens do checklist), porque foi o que o
design pediu e um botão que não muda dado seria teatro.

**A regra da coluna "Concluído" é o E das duas coisas:** o Status gravado diz `Concluído` **e** os
três checks estão marcados. Uma só não basta, nos dois sentidos — só o status é o caso do registro
antigo (gravado antes de os checks existirem: mostrá-lo como concluído afirmaria uma conferência
que ninguém fez); só os checks tiraria do botão a única coisa que ele faz.

- `concluirPedido` grava `Concluído` na coluna Status e carimba a Data de Conclusão. A checagem
  dos três itens é **refeita no servidor** — botão desabilitado é cortesia visual, não garantia.
- **Desmarcar um check devolve o cartão para a etapa de entrega**, mesmo com `Concluído` na
  planilha. O status gravado não se perde: volta a valer sozinho quando o checklist fechar de novo.
- **Consequência visível:** ata antiga gravada como `Concluído` **sem** os três checks aparece em
  "Conferência". Como o 3º check nasceu agora e está vazio em todo mundo, **todo o histórico
  concluído volta para a lista na tela nova** até alguém marcar o e-mail e apertar o botão. É a
  mesma verdade que a V4.1 já contava sobre esses registros, agora com um item a mais. Se o volume
  incomodar, dá para preencher as colunas 19, 20 e 22 da aba `Atas` em lote, direto na planilha.

### O terceiro check
`Verificado e-mail de atualização interna` virou a **coluna 22** da aba `Atas`, com a mesma
receita dos outros dois (guarda a data, `setEmailVerificado` marca/desmarca). **Não precisou de
migração:** `getAbaAtas_` já reescreve o cabeçalho e insere coluna faltante a cada leitura.

Quem pode marcar o quê segue os perfis da V4.1 — Rede é do admin, Navi é de quem tem `Navi=SIM`,
e-mail é de todo mundo menos o despachante. Os três aparecem **sempre**, mesmo travados: esconder
um item faria o `CONCLUIR PEDIDO` parecer bloqueado sem motivo.

### O que a tela nova NÃO inventou de coluna
Coisas do design que não viraram schema, de propósito:
- **Prazo desejado** e **observação** do cadastro viram a **primeira mensagem do chat** (é onde o
  despachante lê mesmo). Arquivo extra do cadastro vai junto como anexo dessa mensagem — a linha
  só tem um campo de arquivo de entrada.
- **Data do registro/devolução** fica só na nota do sistema. Não existe coluna para ela e criar
  uma para exibir um texto seria schema por vaidade.
- **`\rede\Juridico\...`** — o handoff já marcava o caminho UNC como pendência ("navegador não
  abre UNC"). Aqui "Abrir pasta" é a **pasta do Drive** que o sistema já cria.

### Peças novas no motor
- `getResumoChats()` — devolve, numa varredura só da aba `Pendencias`, o total de mensagens e os
  horários das do despachante por pedido. É o que alimenta o badge de **não lidas** sem fazer
  dezenas de chamadas para desenhar o quadro. Quem é "não lida" o navegador decide, comparando
  com a última abertura guardada no `localStorage` (a planilha não guarda leitura). Primeira vez
  que alguém vê um pedido não vira passivo: marca e conta dali para frente.
- `postDevolucao` aceita **`semEmail`**, e as **notas do sistema** (transições e pagamentos,
  papel `Sistema`) **não mexem na pendência** — ver "A regra da pendência", abaixo. A nota de
  encerramento não manda e-mail: avisar que alguém "aguarda retorno" num pedido encerrado seria
  mentira. *(Uma primeira versão deixava a nota decidir a bola pela etapa. Saiu: eram duas regras
  para o mesmo dado.)*
- **Quatro tipos de pagamento** (`Reembolso`, `Serviço`, `Taxa / DARE`, `Cartório`) via
  `TIPOS_PAGAMENTO` + `normalizarTipoPagamento_`. Pedido antigo sem tipo continua lido como
  `Reembolso`.

### O rodapé do cartão: saiu a próxima ação, entrou o que falta
O protótipo punha a próxima ação no pé de cada cartão (`PROTOCOLAR`, `REGISTRAR`,
`CONFERIR E ARQUIVAR`, `DEVOLVER DOCUMENTO`, `ENCERRADO`). **Saiu de todas as colunas.** A coluna
em que o cartão está já diz a etapa; repetir isso em cada cartão gastava a única linha livre do
rodapé para não acrescentar nada.

No lugar entraram **etiquetas**, e cada coluna mostra só o que ela precisa dizer:

- **"A protocolar", "Na Junta" e "Conferência" — de quem é a vez.** `Cobra` (azul) ou
  `Despachante` (roxo), lido da coluna `Bola`. Quem escreve no chat está *devolvendo*, então a bola
  vai para o **outro** lado: falou o despachante, a etiqueta vira `Cobra`, e vice-versa. A
  Conferência entrou depois de uma primeira versão que a deixava de fora ("o pedido já voltou, o
  trabalho é interno") — errado: ali ainda corre o **debate dos pagamentos** com o despachante, e
  a bola continua trocando de lado. Só o Concluído não tem.
  Fica em **linha própria no rodapé, sob o rótulo "Pendente de quem:"**, separada das demais: na
  mesma linha, o rótulo seria lido como legenda de todas as etiquetas, e não é.
- **"A protocolar" — prazo, junto com a de cima.** `Novo` (verde) com menos de **2** dias corridos
  de envio; `Atrasado` (vermelho) a partir de **5** dias sem sair da coluna. Os limites são
  `DIAS_NOVO` e `DIAS_ATRASO`, e as faixas não se sobrepõem: entre 2 e 4 dias não há etiqueta de
  prazo, porque não há nada a dizer.
- **"Conferência" — pendência.** Sob o rótulo **"Pendente do que:"**, `Rede`, `E-mail`, `Navi` —
  as que **faltam**, não as que já foram, na mesma ordem do checklist da gaveta. **Cada uma tem a
  sua cor** (Rede âmbar, E-mail rosa, Navi petróleo), para reconhecer de relance qual falta sem
  ler; as três ficam de propósito **fora** das cores que já têm significado no quadro (azul = Cobra,
  roxo = despachante, verde = novo, vermelho = atrasado) — nenhuma cor quer dizer duas coisas.
  Com as três marcadas vira **`Pronto para concluir`** (preenchida, sem rótulo: nada está
  pendente): sumir seria pior justamente no momento em que o cartão pede ação.

> **Os rótulos têm espaçamento .06em, não o .12em dos outros micro-rótulos — por medida.** Na
> coluna mínima (240px) o cartão tem 178px úteis; "PENDENTE DE QUEM:" a .12em (104px) + a etiqueta
> `DESPACHANTE` (71px) + o gap davam 181, e a etiqueta caía sozinha para a linha de baixo.
- **"Concluído" — nada.** Acabou.

A etiqueta de responsável **diz "Cobra", não "Jurídico"** como o protótipo propunha — e a gaveta
foi alinhada junto (`aguardandoDe`). O mesmo fato não pode ter dois nomes na mesma tela.

> **Verde, vermelho e roxo são exceção ao design system**, que é de acento único (azul-aço).
> Entraram a pedido do cliente — verde/vermelho no prazo, roxo no despachante. São tons surdos, no
> mesmo peso das tags de status (a "Na Junta" é `#d6ebff`/`#2c455d`), não cores de semáforo: um
> par saturado brigaria com o resto da tela.

> **O botão de administração já foi um "sol".** A primeira versão era só um ícone, desenhado como
> círculo mais raios — e ninguém adivinhou o que era. Virou a engrenagem de verdade do Lucide
> **com o rótulo "Admin" ao lado**. Ícone sozinho só funciona quando o desenho é óbvio; quando há
> dúvida, o rótulo é mais barato do que a dúvida.

> **O prazo vale para a coluna toda, ata e documento.** O pedido de documento não tira protocolo,
> mas fica na mesma fila do despachante e envelhece igual: ali "Atrasado" quer dizer "parado tempo
> demais", que é o que interessa.

O rodapé **só existe quando tem o que dizer** — sem etiquetas e sem não lidas, o cartão termina na
descrição, em vez de exibir uma linha divisória vazia. O campo `proximo` saiu do mapa `ETAPAS`
junto, porque ficou sem chamador; o rótulo do botão de ação continua em `ACOES[].rotulo`.

### A busca acha pelo que o cartão mostra
Além de empresa, descrição, protocolo e id, o campo procura nas **etiquetas** do cartão: digitar
`navi` lista quem espera a baixa no Navi, `rede` quem falta arquivar, `pronto` quem só espera o
botão. As etiquetas eram a única coisa visível no quadro que não dava para filtrar.

A regra que segura isso é uma função só, `etiquetasDe`, que devolve **texto**, não HTML — o cartão
desenha a partir dela e a busca procura nela. Vindo da mesma fonte, **a busca nunca promete o que
a tela não mostra, nem esconde o que ela mostra**. Se as etiquetas mudarem, a busca acompanha
sozinha.

A comparação passa por `normalizar`, que reduz os dois lados a **letras e números** — sem acento,
sem espaço, sem pontuação. `PECÉM` responde a `pecem` e `E-mail` responde a `email`. Isso é mais
sutil do que parece: a primeira versão trocava pontuação por *espaço*, e aí `E-mail` virava
`e mail` e quem digitasse `email` não achava nada. Separador tem de sumir de vez, não virar outro
separador.

### A gaveta tem QUATRO abas (ajuste pós-primeiro-uso)
No protótipo os "Arquivos vinculados" eram um bloco fixo logo abaixo do resumo. No uso real um
pedido com muitos anexos empurrava as abas e o chat para fora da tela — quanto mais o pedido
andava, mais escondido ficava o que importa.

Primeiro a lista desceu para o pé da gaveta, com dobra. Não bastou: **virou aba própria.** A regra
que ficou é mais geral que o caso — *lista que cresce sem limite não divide espaço com o que o
usuário olha o tempo todo*. Numa aba ela tem a tela inteira e mostra tudo, sem dobra.

Ordem das abas: **Chat · Pagamentos · Checklist · Arquivos**. O rótulo do chat **não tem
contador** (era "Chat 9"): número na aba compete com o nome e não diz nada acionável — quem
precisa da conversa abre a conversa. A gaveta ficou resumo → abas → conteúdo da aba →
administração, e as ações de admin ("Corrigir dados", "Excluir pedido") são botões ghost sob um
rótulo "Administração" no rodapé, longe do composer.

Três coisas quebraram no caminho e ficam registradas porque não são óbvias:
- O composer do chat era `position:sticky; bottom:0`. Com blocos **depois** dele, um elemento
  grudado no fim da área visível passa por cima deles. Virou estático — a lista de mensagens já
  tem rolagem própria, que é o que o design pede.
- O bloco do chat era `flex:1` dentro da coluna que rola. Enquanto ele era o último, isso queria
  dizer "ocupe o que sobrar"; com blocos embaixo, virou "ceda tudo para eles" — um pedido com 11
  anexos espremeu o chat em **97px**. Agora tem altura própria (piso 240px, teto 52vh) e
  `flex:none`. **`flex:1` só significa "ocupe o resto" quando não há mais nada embaixo.**
- Com quatro abas em vez de três, cada uma cai para ~82px na gaveta mais estreita (340px), e
  "PAGAMENTOS" no corpo antigo (11px + .14em) estourava. Corpo 10.5px e espaçamento .1em: o
  rótulo mais largo mede 59px em 82px disponíveis.

> **A prévia do navegador entrega imagem rasgada.** Duas vezes um screenshot mostrou blocos
> sobrepostos que não existiam. O que vale é medir: `getBoundingClientRect` nos blocos da gaveta
> denuncia sobreposição de verdade — e foi assim que o chat espremido a 97px apareceu, coisa que
> o screenshot não mostrava. Para largura de texto, `scrollWidth` também mente quando o overflow
> é visível; medir com um `<span>` fantasma na mesma fonte.

### A Data de Conclusão não se apaga mais (implantação 24)
Entre 09 e 10/09 os pedidos **9 a 14** — concluídos em julho e agosto — perderam a Data de
Conclusão. A causa era `carimbarConclusao_`, da V4.1: ao **desmarcar** Rede ou Navi, ela limpava a
data. Era a única escrita do sistema que apagava a coluna 15 (o `saveAta` preserva, o
`concluirPedido` só grava), e com a tela nova em uso, marcar e desmarcar um check virou coisa de
todo dia.

Agora ela **só carimba** (quando Rede + Navi fecham e ainda não há data) e **nunca apaga**. Data é
registro do que aconteceu; "está concluído agora?" é outra pergunta, respondida por status + checks.
A **migração V6** (`ensureMigracaoV6_`, `MIGRADO_V6`) devolveu as seis datas a partir da leitura
da planilha de 09/09, antes do apagamento (03/08/2026 em todos, menos o 10: 31/07/2026) — só em
célula vazia e só se a descrição ainda for a da reeleição de julho.

### O que veio junto sem estar no design
O design tem duas rotas e nada de administração. Como o admin usa isso, ficou o botão **"Admin"**
no cabeçalho (só admin) e um **rodapé discreto na gaveta** (só admin) com "Corrigir dados" e
"Excluir pedido". Ninguém perdeu ferramenta.

**O painel Admin é a porta para os bastidores.** Tem um atalho para **cada aba da planilha que
alimenta o site** — Atas, Usuarios, Pendencias, Reembolsos, cada uma com uma linha dizendo o que
guarda —, a planilha inteira, a pasta raiz do Drive e o editor do Apps Script (onde se rodam as
funções de manutenção), além dos e-mails de notificação. Aba que o site não lê (a `FilaEmails` do
item 4 cancelado) aparece num grupo à parte, **"não alimentam o site"**: em branco ela pareceria
uma variável do sistema, e alguém editaria achando que muda algo.

> **Bug do primeiro uso: "Sessão inválida" para quem estava logado.** As duas telas moram na mesma
> origem e dividem o storage, então a tela nova aceita também o token da antiga (`SGAS_SessionToken`).
> A validação usava esse token — mas não o **guardava**. O Admin lia só `CD_SessionToken`, mandava
> token **vazio** e o servidor recusava, com razão. O Sair tinha o mesmo defeito: não revogava a
> sessão vinda da tela antiga, e recarregar logava de volta sem senha. **Hoje o token validado mora
> em `state.token`**, preenchido por `lembrarSessao` nos três lugares onde uma sessão nasce (link do
> e-mail, sessão guardada, login com senha); Admin e Sair leem dali. O Sair limpa as duas chaves:
> é a mesma pessoa no mesmo navegador. **Lição:** quem aceita credencial de duas fontes tem de
> guardá-la num lugar só — senão cada consumidor adivinha uma fonte diferente.

Os links vêm de `getLinksAdmin(token)`, que **confere a sessão e só responde a admin**. Esconder o
botão é cortesia; qualquer um chama a função pelo console, e a aba Usuarios guarda senha em texto
puro. O link do editor usa o ID do projeto **escrito** em `SCRIPT_ID_PROJETO`, não
`ScriptApp.getScriptId()`: `ScriptApp` puxa o escopo `script.scriptapp`, o mesmo que já deixou o
app em branco dentro do iframe.

### O checklist: Navi por último
Ordem da gaveta: **Rede → E-mail → Navi**. O pagamento no Navi é o último passo do fechamento na
prática, então fica no fim da lista. As etiquetas de pendência seguem a mesma ordem.

O vocabulário da tela é o do design (**pedido**, **ato societário**, **Jurídico**); o que a
planilha guarda continua com os nomes antigos (`Ata`, `Cobra`, `Em Protocolo`). A tradução mora
num lugar só, no mapa `ETAPAS` do `AppNovo.html` — mesma regra do `ROTULO_ETAPA` da V4.

### Manutenção pontual: os pedidos 22 e 23 (09/09/2026)
Nasceram duplicados num envio duplo do formulário — as duas pastas do Drive foram criadas com
**meio segundo de diferença** (13:11:16.7 e 13:11:17.2), mesma empresa, mesma descrição, mesmo PDF
(5.051.744 bytes nos dois). O **23** era o que tinha história (a mensagem do despachante de 09/09
pedindo as identidades dos representantes); o 22 não tinha chat nem pagamento.

`corrigirPedidosDuplicados` foi escrita para fazer o serviço inteiro — **e saiu do código sem nunca
ter rodado**, porque a correção acabou feita à mão e a migração V5 terminou o resto (ver abaixo).
Fica o registro do que o serviço envolvia, que é maior do que parece:

1. confere que as duas linhas são mesmo duplicatas (empresa **e** descrição iguais) e **aborta sem
   tocar em nada** se não forem;
2. exclui a linha do 22 e renumera o 23 para 22;
3. **remapeia as abas filhas** — `Pendencias` e `Reembolsos` apontam para o ID, e sem isso a
   conversa viraria órfã;
4. renomeia as pastas do Drive: a do 23 vira `0022 - …`, a do 22 ganha o sufixo
   `— DUPLICADO, pedido excluído em …`. **Renomear, não apagar** — o PDF lá dentro é o mesmo, mas
   apagar arquivo do cliente não é decisão de rotina de manutenção;
5. devolve `LAST_ID` para 22, senão o próximo pedido seria 24 e o 23 ficaria como buraco.

Foi ensaiada antes de tocar no dado real, contra uma planilha simulada com as linhas de verdade:
12 conferências, incluindo as duas travas (rodar de novo aborta; par não-duplicado aborta).

> **A lição que fica é do cadastro, não da correção:** nada impedia um duplo-clique de criar dois
> pedidos. `reservarProximoId` tem `LockService` e faz o certo — devolve 22 e 23, dois números
> diferentes. Quem tinha de barrar o segundo clique era a tela: o id é reservado **antes** do
> "Salvando…" aparecer, e um segundo clique nessa janela reservava outro número. **Consertado nas
> duas telas (implantação 24):** enquanto um cadastro está em andamento, o botão fica desabilitado
> e novos envios são ignorados (`criarPedido` na nova, `handleFormSubmit` na antiga); se der erro,
> o botão volta.

**O que de fato aconteceu (10/09):** a função não chegou a rodar — a correção foi feita **à mão
na planilha** (apagada a linha do 22, o 23 redigitado como 22). As pastas do Drive ficaram com os
nomes antigos, que é como se soube, porque renomeá-las é o primeiro passo da função. E a mensagem
do despachante **continuou gravada com o ID 23** na aba `Pendencias`: o pedido 22 ficou sem a
conversa dele, e o contador continuou em 23. A migração V5 (abaixo) terminou o serviço. **Lição:**
o ID de um pedido não mora numa célula só — `Pendencias` e `Reembolsos` apontam para ele. Mexer
no ID direto na planilha deixa órfão tudo que pendura nele.

### A regra da pendência ("Pendente de quem") — uma só
**A pendência é de quem NÃO falou por último entre as pessoas.** Última mensagem do despachante →
`Cobra`; da Cobra, ou nenhuma → `Despachante` (o pedido nasce com ele). Notas do sistema não
contam, não são de ninguém. É `postDevolucao` que aplica isso a cada mensagem, e só ele (a tela
antiga só lê a coluna `Bola`).

**Migração V5 (`ensureMigracaoV5_`, `MIGRADO_V5`)** — roda uma vez no primeiro `getAtas`, como a V3
e a V4:
1. `terminarCorrecaoDuplicados_` — religa ao 22 o chat que ficou com o ID 23, devolve `LAST_ID`
   para 22 e renomeia as pastas (a órfã ganha `— DUPLICADO`, a que ficou vira `0022 - …`). Só age
   no estado exato em que a correção parou: se já existir um 23 legítimo, não toca em nada.
2. `recalcularPendencias_` — refaz a coluna `Bola` de **todos** os pedidos pela regra.

**A ordem é obrigatória**, e o ensaio mostra por quê: recalcular antes de religar o chat faria o 22
parecer sem mensagem e o mandaria para o Despachante — errado, a última palavra ali foi do
despachante. Ensaiada contra os dados reais de 10/09: **só o pedido 2 (LINS 04) muda** (Cobra →
Despachante; a última mensagem é da Cobra, em 27/07). Os outros 20 já batiam. O que mudou fica
em `MIGRADO_V5_LOG`, nas Script Properties.

**Correção manual** — no **Corrigir dados** da gaveta (só admin), campo "Pendente de quem".
`setPendencia(token, id, valor)` confere a sessão de admin no servidor e **deixa rastro no chat**
("Pendência corrigida manualmente: … (por …)"): sem isso a etiqueta contradiria a última mensagem
visível e ninguém saberia por quê. **Vale até a próxima mensagem de uma pessoa**, que reaplica a
regra. É correção, não trava.

> **Dois defeitos do "Corrigir dados" que o campo novo expôs.** (1) O formulário mora na caixa de
> aviso, que tem `white-space: pre-wrap` para mensagens de várias linhas — e o formulário, que é
> HTML, herdava isso: a indentação do template virava linhas em branco entre os campos. Com um
> campo a mais, os botões de salvar saíram da tela. Agora o formulário liga `white-space: normal`,
> `avisar`/`confirmar` devolvem o pre-wrap, e a caixa tem teto de altura com rolagem. (2) Se o nome
> da empresa gravado não estivesse **exatamente** na lista, o seletor caía na primeira opção
> ("OUTRA") e **salvar trocaria a empresa em silêncio**. Agora o nome gravado entra como opção
> quando falta na lista. Conferido em 10/09: as 20 empresas reais estão todas na lista — o conserto
> é preventivo (nome digitado à mão na planilha, empresa nova).

### Os e-mails automáticos, no visual novo
Os dois e-mails (mudança de status e nova mensagem no chat) ganharam a linguagem da tela: cantos
retos, borda de 1px, azul-aço como acento único, barra da marca como o cabeçalho do quadro, rótulos
em caixa-alta espaçada, a etapa como **tag com as mesmas cores do quadro** e a mensagem na mesma
"bolha" do chat (azul para a Cobra, neutra para o despachante, só contorno para o sistema). **Texto,
assunto e momento de envio não mudaram** — só a apresentação (e os emojis dos botões saíram).

Cliente de e-mail não é navegador: Gmail não carrega fonte da web e o Outlook ignora `rgba` e metade
do CSS. Então a Barlow vem com fallback, as cores de opacidade da tela chegam **já achatadas** sobre o
fundo (o `.62` vira `#6e6f70`) e o layout é em `<table>`. A **montagem** (`montarEmailStatus_`,
`montarEmailDevolucao_`) ficou separada do **envio**: dá para ver o HTML exato de um e-mail sem mandar
nada. De brinde, o texto da mensagem agora é escapado (`escHtml_`) — antes, um `<` no chat
desmontava o e-mail.

## Modelo de dados (aba `Atas`, 22 colunas)

Identificação: `ID` (sequencial 0001…), `Empresa` (lista fixa de empresas do grupo),
`Descrição`, `Data de Envio`, `Status`, `Status Anterior` (legado V2, não usado na V3),
`Status Financeiro` (legado V2), `Bola` (V3: `Cobra` | `Despachante`),
`Arquivado na Rede` (V3.2, guarda a data), `Pagamento no Navi` (V4, guarda a data),
`Tipo` (V4: `Ata` | `Documento`), `E-mail Verificado` (V4.2: 3º check do checklist, guarda a data).
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
    ├── AppNovo.html     ← a tela V4.2 (quadro por etapa) — o PADRÃO, servida pelo doGet
    └── App.html         ← a tela V4.1, servida só com ?ui=antigo (rede de segurança)
```

`Novo Frontend/` guarda o handoff do Claude Design que originou a V4.2 (protótipo, tokens do
design system Industry e `spec/fluxos.md`). É **material de origem**, não código de produção — e
**não vai para o git**, de propósito: o GitHub Pages publica o repositório inteiro na web, e o pacote
tem capturas de tela do sistema. O mesmo vale para `design/`.

## Status

**V4.2.0 no ar (2026-09-10, implantação 24).** Endereço:
https://erfrizzera.github.io/controlededespachante/

A V4 foi a maior mudança desde a V3 — cadastro, financeiro, coluna Status, e-mail e esquema de
dados de uma vez. Subiu em dois tempos no mesmo dia: a **V4.0** foi testada no deploy `@HEAD`
antes de ir para a produção (foi lá que apareceu o bug de ordem do Navi, ver abaixo), e a
**V4.1** trouxe as correções de rumo pedidas depois de ver a coisa funcionando.

> **O deploy `@HEAD` é a rede de segurança que faltou na V3.1.** `clasp push` sozinho atualiza
> só ele; a produção continua onde estava até o `update-deployment`. Testar lá primeiro custa
> nada e teria poupado a saga do item 1. Use sempre.

> **Bug de ordem, achado no @HEAD (V4.0 → V4.1):** o check "Pagamento no Navi" não aparecia,
> embora a coluna `Navi` estivesse com `SIM` na planilha. O login (`temNavi_`) roda **antes**
> do primeiro `getAtas`, e era o `getAtas` que chamava `ensureMigracaoV4_` — então a primeira
> sessão lia a coluna ainda vazia. Planilha certa, tela errada. `temNavi_` passou a chamar a
> migração antes de ler. **Lição:** migração que semeia dado usado pelo login tem que rodar no
> login também, não só na leitura da lista.

Estado real da implantação (conferido com `clasp list-deployments` em 2026-08-21):

| Onde | O quê |
|---|---|
| Implantação de produção | `AKfycbz8FqcbL2DqwkqUH0vmoJ503Vui7G7wwD718-QZrGpVeSUXzNgSPN2g5JG9FrgWeMnF` |
| Versão servida hoje | **24** (V4.2 + Data de Conclusão que não se apaga + trava de duplo clique) — 10/09 |
| Primeira da V4.2 | **23** (tela nova como padrão) — 10/09 |
| Base estável anterior | **22** = V4.1 (o porto seguro pré-V4.2); **21** = V3.2; **19** = V3.1 |
| Reverter para | versão **22** (`update-deployment -V 22 <deploymentId>`) — volta código **e** padrão |

**V3.2 = V3.1 + ordenação pelo cabeçalho + filtro "Exibir" + "Arquivado na Rede".** Saiu em dois
tempos: a versão **20** (03/08) levou o filtro e o checkbox; a **21** (21/08) acrescentou a
ordenação. Sem sustos desta vez — subiu de uma vez e funcionou.

**V3.1 = base V3.0 + item 2 (Situação/Próximo) + item 3 (Protocolizado) + item 5 (financeiro em
primeira maiúscula) + cifrão por último + coluna "Tempo de Processo" removida.** Itens 2, 5 e a
remoção da coluna foram publicados **um de cada vez** (versões 16→19) porque o item 1 original
(tempo na descrição) quebrava o app no ar; ver a lição em "Domínio (V3)".

**V4.2 no ar (10/09, implantação 23; ajustes na 24): a tela nova é o padrão.** Quem abre o endereço cai no quadro
por etapa; a V4.1 continua em `?ui=antigo`. Antes de virar padrão, a V4.2 passou pelo `@HEAD` em
`?ui=novo`, com várias rodadas de ajuste de uso real. O histórico abaixo é de quando ela ainda
estava só lá.

*(histórico)* **V4.2 no `@HEAD`, aguardando o aval para virar produção (push em 2026-09-09).** O
`clasp push` subiu os 4 arquivos (`AppNovo.html` incluído) e o remoto foi conferido: bate byte a
byte com o local. A implantação **22** continua servindo a V4.1 — ela está presa à *versão* 22,
que é anterior à tela nova, então `?ui=novo` na produção não acha nada. Conferido depois do push:
a produção responde anônima, 200, com a tela de login da V4.1, igual a antes.

Quando a tela nova for aprovada, é o rito de sempre:
`create-version` → `update-deployment -V <n> AKfycbz8FqcbL2DqwkqUH0vmoJ503Vui7G7wwD718-QZrGpVeSUXzNgSPN2g5JG9FrgWeMnF`.
Para reverter, a base estável é a **22**.

**`version.json` foi para 4.2.0 junto com a troca de padrão** — antes disso o selo mentiria,
porque dizia o que o usuário via e ele ainda via a V4.1.

> **O GitHub estava 6 commits atrás.** As rodadas da V3.2 à V4.1 foram commitadas e nunca
> enviadas: o sistema não sentiu, porque as telas vivem no Apps Script, mas a moldura e o selo no
> Pages ficaram velhos. **O `git push` pede login do GitHub** (Git Credential Manager) — num
> terminal interativo abre o navegador; rodado pelo Claude em segundo plano, ele fica **esperando
> um login que ninguém vê, para sempre**. Push é do dono, no terminal dele.

**O que olhar nos primeiros dias:** com o Concluído derivado, ata antiga gravada como
`Concluído` **sem** os dois checks voltou a aparecer na lista, como `Registrado` com os checks
pendentes. É o comportamento correto, mas se for volume grande dá para resolver marcando as
colunas 19 e 20 da aba `Atas` em lote, direto na planilha.

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
  `uploadFilePromise` (V4.1) ou no `subirArquivo` (V4.2)? Rode. Desde a V4.2 a bateria roda
  **duas vezes**, uma por tela: são duas cópias do mesmo algoritmo, e cópia sem teste diverge
  em silêncio.
- Segurança por perfil é **na tela** (esconde botões). Endurecer no backend fica pra depois,
  junto da pendência da **senha em texto puro** na aba `Usuarios`.
