/**
 * ==========================================================================
 * CONTROLE DE DESPACHANTE — COBRA BRASIL
 * MOTOR (backend) — Google Apps Script
 * ==========================================================================
 *
 * O "motor" da Flufa: fala com o armazém (Google Sheets), com o Drive e com o
 * e-mail. A tela (App.html) NUNCA fala direto com a planilha — ela só chama as
 * funções daqui via google.script.run.
 */

// -------- Nomes fixos (num lugar só, para não se repetirem soltos) --------
var NOME_ABA_ATAS      = 'Atas';
var NOME_ABA_USUARIOS  = 'Usuarios';
var PASTA_RAIZ_DRIVE   = 'Controle Despachante — Arquivos';

// A ordem deste array É a ordem das colunas na planilha. Mudar aqui = mudar a planilha.
var CABECALHO_ATAS = [
  'ID da Ata',                       // 1
  'Empresa',                         // 2
  'Descrição',                       // 3
  'Data de Envio',                   // 4
  'Status',                          // 5
  'Arquivo: Ata Assinada',           // 6
  'Número do Protocolo',             // 7
  'Arquivo: Ata Registrada',         // 8
  'Reembolso Taxas',                 // 9
  'Honorários Despachante',          // 10
  'Arquivo: Nota Fiscal',            // 11
  'Pasta no Drive',                  // 12
  'Data do Protocolo',               // 13
  'Arquivo: Comprovante de Despesa', // 14
  'Data de Conclusão',               // 15
  'Status Anterior',                 // 16
  'Status Financeiro',               // 17  (legado V2; a V3 usa a baixa por pedido na aba Reembolsos)
  'Bola',                            // 18  (V3: com quem está a bola — 'Cobra' | 'Despachante')
  'Arquivado na Rede',               // 19  (V3.2: admin marcou que arquivou o doc na rede; guarda a data)
  'Pagamento no Navi',               // 20  (V4: baixa do pagamento no Navi; guarda a data. Só quem tem Navi=SIM)
  'Tipo'                             // 21  (V4: 'Ata' | 'Documento' — duas trilhas de cadastro)
];

// V4: os dois tipos de registro. 'Ata' segue o fluxo completo da Junta;
// 'Documento' é o pedido simples (Solicitado → Concluído), sem protocolo.
var TIPO_ATA       = 'Ata';
var TIPO_DOCUMENTO = 'Documento';

// V4.1 — a ÚLTIMA etapa que o despachante escreve em cada trilha. Depois dela
// ninguém "conclui" nada: 'Concluído' é DERIVADO dos dois checks da Cobra
// (Arquivado na Rede + Pagamento no Navi). Por isso o status nunca é gravado
// como 'Concluído' — quem decide isso é a leitura, não a escrita.
var ETAPA_FINAL_ATA = 'Registrada';   // exibida como "Registrado"
var ETAPA_FINAL_DOC = 'Devolvido';


/* ==========================================================================
 * 1. PORTA DE ENTRADA — serve a tela do app
 * ========================================================================== */

/**
 * O Google chama esta função quando alguém abre a URL do Web App.
 * - Usa TEMPLATE para injetar o token do magic link (quando vier na URL).
 * - XFrameOptions ALLOWALL é o que deixa a MOLDURA (index.html no GitHub Pages)
 *   embutir esta tela num iframe.
 */
function doGet(e) {
  var token = (e && e.parameter && e.parameter.token) || '';
  var template = HtmlService.createTemplateFromFile('App');
  template.urlToken = token;

  return template.evaluate()
    .setTitle('Controle Despachante')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}


/* ==========================================================================
 * 2. ARMAZÉM — garante que a planilha e as abas existem
 * ========================================================================== */

/** Devolve a planilha do sistema, criando-a na 1ª vez. O ID fica no "cofre". */
function getPlanilha_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');

  if (id) {
    try { return SpreadsheetApp.openById(id); }
    catch (e) { /* apagada — cria outra abaixo */ }
  }

  var planilha = SpreadsheetApp.create('Controle Despachante — Base de Dados');
  props.setProperty('SPREADSHEET_ID', planilha.getId());
  return planilha;
}

/** Devolve a aba "Atas", criando/migrando o cabeçalho se necessário. */
function getAbaAtas_() {
  var planilha = getPlanilha_();
  var aba = planilha.getSheetByName(NOME_ABA_ATAS);

  if (!aba) {
    aba = planilha.insertSheet(NOME_ABA_ATAS);
    aba.getRange(1, 1, 1, CABECALHO_ATAS.length).setValues([CABECALHO_ATAS])
      .setBackground('#1A365D').setFontColor('#FFFFFF').setFontWeight('bold');
    aba.setFrozenRows(1);
    var padrao = planilha.getSheetByName('Página1') || planilha.getSheetByName('Sheet1');
    if (padrao) { try { planilha.deleteSheet(padrao); } catch (e) {} }
  } else {
    if (aba.getMaxColumns() < CABECALHO_ATAS.length) {
      aba.insertColumnsAfter(aba.getMaxColumns(), CABECALHO_ATAS.length - aba.getMaxColumns());
    }
    aba.getRange(1, 1, 1, CABECALHO_ATAS.length).setValues([CABECALHO_ATAS])
      .setBackground('#1A365D').setFontColor('#FFFFFF').setFontWeight('bold');
  }

  getAbaUsuarios_(planilha);
  getAbaPendencias_(planilha);
  getAbaReembolsos_(planilha);
  return aba;
}

/** Devolve a aba "Usuarios" (whitelist: Email, Permissão, Senha, Navi).
 *  A coluna "Navi" (V4) é um SIM/NÃO à parte do perfil: diz quem enxerga e
 *  marca o check "Pagamento no Navi". Fica na planilha justamente para o dono
 *  ligar/desligar pessoas sem republicar código. */
function getAbaUsuarios_(planilha) {
  planilha = planilha || getPlanilha_();
  var aba = planilha.getSheetByName(NOME_ABA_USUARIOS);
  if (!aba) {
    aba = planilha.insertSheet(NOME_ABA_USUARIOS);
    aba.getRange(1, 1, 1, 4).setValues([['Email', 'Permissão', 'Senha', 'Navi']])
      .setBackground('#1A365D').setFontColor('#FFFFFF').setFontWeight('bold');
    aba.setFrozenRows(1);
  } else if (aba.getMaxColumns() < 4 || String(aba.getRange(1, 4).getValue()).trim() !== 'Navi') {
    if (aba.getMaxColumns() < 4) aba.insertColumnsAfter(aba.getMaxColumns(), 4 - aba.getMaxColumns());
    aba.getRange(1, 4).setValue('Navi')
      .setBackground('#1A365D').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  return aba;
}

/** V4: este e-mail pode ver/marcar o "Pagamento no Navi"? (coluna Navi = SIM)
 *  Chama a migração antes de ler: o login acontece ANTES do primeiro getAtas,
 *  então sem isto a primeira sessão depois do deploy leria a coluna ainda vazia
 *  e devolveria false — o check só apareceria no segundo acesso. */
function temNavi_(email) {
  if (!email) return false;
  ensureMigracaoV4_();
  var alvo = String(email).trim().toLowerCase();
  try {
    var dados = getAbaUsuarios_().getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      if (dados[i][0] && String(dados[i][0]).trim().toLowerCase() === alvo) {
        var v = String(dados[i][3] || '').trim().toLowerCase();
        return v === 'sim' || v === 'x' || v === 'true' || v === 'verdadeiro';
      }
    }
  } catch (e) { Logger.log('temNavi_ falhou: ' + e); }
  return false;
}


/* ==========================================================================
 * 3. LER — devolve todas as atas para a tela
 * ========================================================================== */

function getAtas() {
  ensureMigracaoV3_();   // uma vez só: destrava "Pendência" e semeia a Bola
  ensureMigracaoV4_();   // uma vez só: semeia Tipo='Ata' e liga o Navi de quem já era

  var aba = getAbaAtas_();
  var intervalo = aba.getDataRange();
  var dados = intervalo.getValues();
  if (dados.length <= 1) return [];

  var ricos = intervalo.getRichTextValues(); // links embutidos nas células
  var tz = aba.getParent().getSpreadsheetTimeZone() || 'America/Sao_Paulo';
  var comPedido = atasComPedido_(); // { ataId: true } — quem tem algum pedido lançado

  var atas = [];
  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    if (!linha[0]) continue;
    var rico = ricos[i];
    var id = String(linha[0]);

    // Bola: 'Cobra' | 'Despachante'. Sem valor gravado → nasce com o despachante.
    var bola = String(linha[17] || '').trim();
    if (bola !== 'Cobra' && bola !== 'Despachante') bola = 'Despachante';

    // Arquivado na Rede (V3.2): a célula guarda a data em que o admin marcou.
    var arqRede = linha[18];
    // Pagamento no Navi (V4): mesma ideia — a célula guarda a data da baixa.
    var navi = linha[19];
    // Tipo (V4): registro sem tipo gravado é ata (todo o histórico anterior é ata).
    var tipo = String(linha[20] || '').trim() === TIPO_DOCUMENTO ? TIPO_DOCUMENTO : TIPO_ATA;

    // Situação (V4.1) — derivada, nunca lida crua da célula.
    // Registro antigo gravado como 'Concluído' vira a etapa final da sua trilha:
    // sem os dois checks ele não está concluído, e mostrar o contrário mentiria.
    var etapaFinal = (tipo === TIPO_DOCUMENTO) ? ETAPA_FINAL_DOC : ETAPA_FINAL_ATA;
    var statusCru  = String(linha[4] || '');
    var etapa      = (statusCru === 'Concluído') ? etapaFinal : statusCru;
    var concluido  = !!(arqRede && String(arqRede).trim()) &&
                     !!(navi && String(navi).trim()) &&
                     etapa === etapaFinal;

    atas.push({
      id:                id,
      empresa:           String(linha[1]),
      descricao:         String(linha[2]),
      dataEnvio:         formatarData_(linha[3], tz),
      status:            etapa,          // etapa gravada, já normalizada
      concluido:         concluido,      // V4.1: derivado dos dois checks
      etapaFinal:        etapaFinal,
      arquivoAssinada:   String(linha[5] || ''),
      urlAssinada:       lerLink_(rico[5]),
      protocolo:         String(linha[6] || ''),
      arquivoRegistrada: String(linha[7] || ''),
      urlRegistrada:     lerLink_(rico[7]),
      reembolso:         Number(linha[8]) || 0,
      honorarios:        Number(linha[9]) || 0,
      arquivoNotaFiscal: String(linha[10] || ''),
      urlNotaFiscal:     lerLink_(rico[10]),
      folderUrl:         lerLink_(rico[11]),
      dataProtocolo:     formatarData_(linha[12], tz),
      arquivoComprovante:String(linha[13] || ''),
      urlComprovante:    lerLink_(rico[13]),
      dataConclusao:     formatarData_(linha[14], tz),
      statusAnterior:    String(linha[15] || ''),
      statusFinanceiro:  String(linha[16] || ''),
      bola:              bola,
      // V4.1: a baixa por pedido acabou. O que diz se o pagamento saiu é o check
      // "Pagamento no Navi" — então o cifrão acende quando há pedido e ele não
      // foi marcado. Uma fonte de verdade só, em vez de duas se contradizendo.
      financeiroVermelho: !!comPedido[id] && !(navi && String(navi).trim()),
      arquivadoRede:     !!(arqRede && String(arqRede).trim()), // V3.2: doc arquivado na rede (só admin marca)
      arquivadoRedeEm:   arqRede instanceof Date ? Utilities.formatDate(arqRede, tz, 'dd/MM/yyyy') : String(arqRede || ''),
      pagamentoNavi:     !!(navi && String(navi).trim()),          // V4: baixa do pagamento no Navi
      pagamentoNaviEm:   navi instanceof Date ? Utilities.formatDate(navi, tz, 'dd/MM/yyyy') : String(navi || ''),
      tipo:              tipo                                       // V4: 'Ata' | 'Documento'
    });
  }
  return atas;
}

/**
 * V3: destrava atas que ficaram em "Pendência" (modelo antigo, congelava) e
 * garante que toda ata tenha uma Bola. Roda UMA vez, guardado por Script Property.
 * Idempotente: se rodar de novo, não faz nada.
 */
function ensureMigracaoV3_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIGRADO_V3') === 'ok') return;
  try {
    var aba = getAbaAtas_();
    var dados = aba.getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      if (!dados[i][0]) continue;
      var linha = i + 1;
      var status = String(dados[i][4] || '');
      // "Pendência"/"Pendência Cobra" volta ao status anterior (ou Enviado).
      if (status === 'Pendência' || status === 'Pendência Cobra') {
        var anterior = String(dados[i][15] || '') || 'Enviado';
        aba.getRange(linha, 5).setValue(anterior);
        aba.getRange(linha, 16).setValue('');
      }
      // Semeia a Bola no despachante quando estiver vazia.
      var bola = String(dados[i][17] || '').trim();
      if (bola !== 'Cobra' && bola !== 'Despachante') {
        aba.getRange(linha, 18).setValue('Despachante');
      }
    }
    props.setProperty('MIGRADO_V3', 'ok');
  } catch (e) { Logger.log('Migração V3 falhou (tenta de novo no próximo load): ' + e); }
}

/**
 * V4: semeia o Tipo ('Ata') nos registros antigos e liga a coluna Navi de quem
 * o dono pediu (juridico@… e erico.frizzera@…, em qualquer domínio — a lista de
 * verdade é a coluna, isto aqui só é o primeiro empurrão). Roda UMA vez,
 * guardado por Script Property. Idempotente.
 */
function ensureMigracaoV4_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIGRADO_V4') === 'ok') return;
  try {
    // 1) Todo registro que já existia é uma ata.
    var aba = getAbaAtas_();
    var dados = aba.getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      if (!dados[i][0]) continue;
      if (!String(dados[i][20] || '').trim()) aba.getRange(i + 1, 21).setValue(TIPO_ATA);
    }

    // 2) Liga o Navi para o jurídico e o Erico (pelo começo do e-mail).
    var abaU = getAbaUsuarios_();
    var users = abaU.getDataRange().getValues();
    for (var j = 1; j < users.length; j++) {
      var email = String(users[j][0] || '').trim().toLowerCase();
      if (!email) continue;
      if (String(users[j][3] || '').trim()) continue;         // já respondido — não mexe
      var conta = email.split('@')[0];
      if (conta === 'juridico' || conta === 'erico.frizzera') abaU.getRange(j + 1, 4).setValue('SIM');
    }

    props.setProperty('MIGRADO_V4', 'ok');
  } catch (e) { Logger.log('Migração V4 falhou (tenta de novo no próximo load): ' + e); }
}


/** Conjunto de registros com ao menos um pedido de pagamento lançado. */
function atasComPedido_() {
  var mapa = {};
  try {
    var aba = getAbaReembolsos_();
    var dados = aba.getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      var id = String(dados[i][0] || '');
      if (id) mapa[id] = true;
    }
  } catch (e) { Logger.log('atasComPedido_ falhou: ' + e); }
  return mapa;
}


/* ==========================================================================
 * 4. ID SEQUENCIAL — reservado no servidor, com trava contra corrida
 * ========================================================================== */

/**
 * Reserva e devolve o próximo ID (0001, 0002…). A tela chama isto ANTES de
 * subir arquivos de uma ata nova, para que a pasta no Drive e o registro usem
 * o MESMO id (a referência tinha um bug aqui: subia com um id temporário e
 * gravava com outro, deixando a pasta órfã).
 * O LockService evita que dois cadastros simultâneos peguem o mesmo número.
 */
function reservarProximoId() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var ultimo = parseInt(props.getProperty('LAST_ID'), 10);

    if (isNaN(ultimo)) { // 1ª vez: inicializa pelo maior número já na planilha
      var dados = getAbaAtas_().getDataRange().getValues();
      ultimo = 0;
      for (var i = 1; i < dados.length; i++) {
        var n = parseInt(dados[i][0], 10);
        if (!isNaN(n) && n > ultimo) ultimo = n;
      }
    }
    var proximo = ultimo + 1;
    props.setProperty('LAST_ID', String(proximo));
    return ('0000' + proximo).slice(-4);
  } finally {
    lock.releaseLock();
  }
}


/* ==========================================================================
 * 5. GRAVAR — cria ou atualiza uma ata (pasta no Drive + e-mail automático)
 * ========================================================================== */

function saveAta(ata) {
  var aba = getAbaAtas_();
  var dados = aba.getDataRange().getValues();

  var linhaExistente = -1;
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][0]) === String(ata.id)) { linhaExistente = i + 1; break; }
  }

  // ID final: mantém o existente, ou reserva um novo (segurança se vier vazio).
  var idFinal = ata.id || reservarProximoId();

  var statusAntigo = '', dataEnvioAtual = null, dataProtocoloAtual = null, dataConclusaoAtual = null, statusFinanceiroAtual = '', bolaAtual = '', tipoAtual = '';
  if (linhaExistente !== -1) {
    statusAntigo          = String(dados[linhaExistente - 1][4] || '');
    dataEnvioAtual        = dados[linhaExistente - 1][3];
    dataProtocoloAtual    = dados[linhaExistente - 1][12];
    dataConclusaoAtual    = dados[linhaExistente - 1][14];
    statusFinanceiroAtual = String(dados[linhaExistente - 1][16] || '');
    bolaAtual             = String(dados[linhaExistente - 1][17] || '');
    tipoAtual             = String(dados[linhaExistente - 1][20] || '');
  }
  // Tipo (V4): registro existente NUNCA troca de trilha — o tipo gravado manda.
  // Só o cadastro novo escolhe, e sem escolha nasce ata.
  var tipoFinal = tipoAtual
    ? (tipoAtual === TIPO_DOCUMENTO ? TIPO_DOCUMENTO : TIPO_ATA)
    : (ata.tipo === TIPO_DOCUMENTO ? TIPO_DOCUMENTO : TIPO_ATA);
  // Bola: ata nova nasce com o despachante; ata existente preserva a que tem.
  var bolaFinal = (bolaAtual === 'Cobra' || bolaAtual === 'Despachante') ? bolaAtual : 'Despachante';

  // Data do Protocolo: automática quando o número aparece.
  var dataProtocolo = dataProtocoloAtual;
  if (ata.protocolo && !dataProtocolo) dataProtocolo = new Date();
  else if (ata.dataProtocolo) dataProtocolo = new Date(ata.dataProtocolo + 'T12:00:00');

  // Data de Conclusão: V4.1 — quem grava não é mais o status (que nunca vira
  // 'Concluído' por aqui), e sim o segundo check, em carimbarConclusao_.
  var dataConclusao = dataConclusaoAtual;
  if (ata.dataConclusao) dataConclusao = new Date(ata.dataConclusao + 'T12:00:00');

  var dataEnvio = dataEnvioAtual ? dataEnvioAtual
                 : (ata.dataEnvio ? new Date(ata.dataEnvio + 'T12:00:00') : new Date());

  // Garante a pasta da ata no Drive (usa o id FINAL — sem órfãs).
  var folderUrl = ata.folderUrl || '';
  if (!folderUrl) folderUrl = getOrCreateAtaFolderUrl_(idFinal, ata.empresa, ata.descricao);

  var linhaValores = [
    idFinal, ata.empresa, ata.descricao, dataEnvio, ata.status,
    ata.arquivoAssinada || '', ata.protocolo || '', ata.arquivoRegistrada || '',
    Number(ata.reembolso) || 0, Number(ata.honorarios) || 0,
    ata.arquivoNotaFiscal || '', folderUrl ? 'Abrir Pasta' : '',
    dataProtocolo || '', ata.arquivoComprovante || '', dataConclusao || '',
    ata.statusAnterior || '',
    (ata.statusFinanceiro !== undefined && ata.statusFinanceiro !== null && ata.statusFinanceiro !== '')
      ? ata.statusFinanceiro : statusFinanceiroAtual,
    bolaFinal
  ];

  var linhaAlvo;
  if (linhaExistente !== -1) {
    aba.getRange(linhaExistente, 1, 1, linhaValores.length).setValues([linhaValores]);
    linhaAlvo = linhaExistente;
  } else {
    aba.appendRow(linhaValores);
    linhaAlvo = aba.getLastRow();
  }

  // Tipo fica FORA do bloco acima de propósito: as colunas 19 (Arquivado na
  // Rede) e 20 (Pagamento no Navi) têm dono próprio e não podem ser pisadas
  // por um save comum, então o setValues para na 18 e o Tipo vai à parte.
  aba.getRange(linhaAlvo, 21).setValue(tipoFinal);

  // Links clicáveis dos arquivos.
  setLinkCell_(aba, linhaAlvo, 6,  ata.arquivoAssinada,   ata.urlAssinada);
  setLinkCell_(aba, linhaAlvo, 8,  ata.arquivoRegistrada, ata.urlRegistrada);
  setLinkCell_(aba, linhaAlvo, 11, ata.arquivoNotaFiscal, ata.urlNotaFiscal);
  setLinkCell_(aba, linhaAlvo, 12, folderUrl ? 'Abrir Pasta' : '', folderUrl);
  setLinkCell_(aba, linhaAlvo, 14, ata.arquivoComprovante, ata.urlComprovante);

  // E-mail automático quando o status muda (falha em silêncio).
  if (statusAntigo !== ata.status) {
    try {
      var copia = Object.assign({}, ata);
      copia.id = idFinal; copia.folderUrl = folderUrl; copia.tipo = tipoFinal;
      sendEmailsOnStatusChange_(copia, statusAntigo, ata.status);
    } catch (e) { Logger.log('E-mail falhou: ' + e); }
  }

  return 'Sucesso';
}


/* ==========================================================================
 * 6. EXCLUIR
 * ========================================================================== */

function deleteAta(id) {
  var aba = getAbaAtas_();
  var dados = aba.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][0]) === String(id)) { aba.deleteRow(i + 1); return 'Sucesso'; }
  }
  return 'Não encontrado';
}


/* ==========================================================================
 * 7. DRIVE — uma pasta por ata; o PDF mora aqui, a planilha guarda só o link
 * ========================================================================== */

/** Acha (ou cria) a pasta raiz de arquivos do sistema.
 *  Blindagem (2026-07-24): lembra o ID da pasta e o ID do PAI dela nas Script
 *  Properties. Assim: (a) sobrevive a renomear/mover a pasta (acha pelo ID);
 *  e (b) se um dia a pasta sumir, recria DENTRO do pai lembrado (a pasta do
 *  projeto) em vez de soltar na RAIZ do Meu Drive. */
function getPastaRaiz_() {
  var props = PropertiesService.getScriptProperties();

  // 1) Tenta pelo ID guardado (sobrevive a renomear/mover).
  var idSalvo = props.getProperty('PASTA_RAIZ_ID');
  if (idSalvo) {
    try {
      var f = DriveApp.getFolderById(idSalvo);
      if (!f.isTrashed()) return f;
    } catch (e) { /* ID inválido — cai no nome */ }
  }

  // 2) Acha pelo nome; ao achar, memoriza o ID e o pai.
  var achadas = DriveApp.getFoldersByName(PASTA_RAIZ_DRIVE);
  var pasta;
  if (achadas.hasNext()) {
    pasta = achadas.next();
    var pais = pasta.getParents();
    if (pais.hasNext()) props.setProperty('PASTA_PAI_ID', pais.next().getId());
  } else {
    // 3) Sumiu — recria DENTRO do pai lembrado; nunca na raiz.
    var paiId = props.getProperty('PASTA_PAI_ID');
    var pai = null;
    if (paiId) { try { pai = DriveApp.getFolderById(paiId); } catch (e) { pai = null; } }
    pasta = pai ? pai.createFolder(PASTA_RAIZ_DRIVE) : DriveApp.createFolder(PASTA_RAIZ_DRIVE);
  }

  props.setProperty('PASTA_RAIZ_ID', pasta.getId());
  return pasta;
}

/** Acha (ou cria) a subpasta de uma ata e devolve a PASTA. */
function getOrCreateAtaFolder_(ataId, empresa, descricao) {
  var raiz = getPastaRaiz_();
  var prefixo = ataId + ' -';
  var sub = raiz.getFolders();
  while (sub.hasNext()) {
    var p = sub.next();
    if (p.getName().indexOf(prefixo) === 0) return p;
  }
  var nova = raiz.createFolder(ataId + ' - ' + empresa + ' - ' + descricao);
  nova.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return nova;
}

/** Acha (ou cria) a subpasta de uma ata e devolve a URL dela. */
function getOrCreateAtaFolderUrl_(ataId, empresa, descricao) {
  try {
    return getOrCreateAtaFolder_(ataId, empresa, descricao).getUrl();
  } catch (e) {
    Logger.log('Pasta falhou: ' + e);
    return '';
  }
}

/** Transforma um data URL ("data:application/pdf;base64,XXXX") em arquivo no Drive. */
function gravarNaPastaDaAta_(tipo, base64Corpo, fileName, ataId, empresa, descricao) {
  var alvo = getOrCreateAtaFolder_(ataId, empresa, descricao);
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Corpo), tipo || 'application/pdf', fileName);
  var arquivo = alvo.createFile(blob);
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { name: arquivo.getName(), url: arquivo.getUrl(), id: arquivo.getId(), folderUrl: alvo.getUrl() };
}

/**
 * Recebe o arquivo em base64, grava na pasta da ata e devolve o nome + a URL.
 * A tela NÃO chama mais isto: tudo sobe direto pro Drive (seção 7b) e manda só
 * o link. Fica aqui como reserva/compatibilidade; sem chamadores hoje.
 */
function uploadFileToDrive(base64Data, fileName, ataId, empresa, descricao) {
  try {
    var partes = base64Data.split(',');
    var tipo = partes[0].substring(5, partes[0].indexOf(';'));
    return gravarNaPastaDaAta_(tipo, partes[1], fileName, ataId, empresa, descricao);
  } catch (e) {
    Logger.log('Upload falhou: ' + e);
    return { error: 'Erro no servidor ao salvar arquivo: ' + e.message };
  }
}


/* ==========================================================================
 * 7b. UPLOAD DIRETO — o navegador manda o arquivo pro Drive sem passar por aqui
 * ==========================================================================
 * A ata chancelada volta escaneada da Junta e passa dos 60 MB. Não adianta
 * cortar em pedaços e remontar aqui: para gravar, o Apps Script teria que
 * carregar o arquivo INTEIRO na memória (o base64 ainda infla isso em 1/3), e
 * ele morre bem antes — além do teto de 6 minutos por execução. Esse caminho
 * em pedaços existiu na V2.1.1 e foi removido na V2.2: não aguentava o caso
 * real que devia resolver.
 *
 * Agora a tela fala DIRETO com a API do Drive: pede aqui uma chave temporária
 * (~1 h) e a pasta de destino, sobe os bytes por conta própria em sessão
 * retomável, e no fim pede para liberar o link. Os bytes nunca passam por
 * este script — por isso o tamanho deixou de ser problema.
 */

/**
 * Prepara o envio direto: garante a pasta da ata e devolve a chave + o destino.
 * A chave é do dono do sistema (o web app roda como USER_DEPLOYING), então o
 * arquivo cai no Drive dele, como sempre foi.
 */
function prepararUploadDireto(ataId, empresa, descricao) {
  try {
    var pasta = getOrCreateAtaFolder_(ataId, empresa, descricao);
    return { token: ScriptApp.getOAuthToken(), folderId: pasta.getId() };
  } catch (e) {
    Logger.log('prepararUploadDireto falhou: ' + e);
    return { error: 'Erro ao preparar o envio: ' + e.message };
  }
}

/**
 * Fecha o envio direto: libera o link do arquivo que o navegador acabou de
 * subir e devolve os dados que a tela guarda na planilha.
 */
function finalizarUploadDireto(fileId) {
  try {
    var arquivo = DriveApp.getFileById(fileId);
    arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var pais = arquivo.getParents();
    return {
      name: arquivo.getName(),
      url: arquivo.getUrl(),
      id: arquivo.getId(),
      folderUrl: pais.hasNext() ? pais.next().getUrl() : ''
    };
  } catch (e) {
    Logger.log('finalizarUploadDireto falhou: ' + e);
    return { error: 'O arquivo subiu, mas deu erro ao liberar o link: ' + e.message };
  }
}


/* ==========================================================================
 * 8. (removido na V3) — a "Pendência" que congelava a ata deixou de existir.
 * Agora a bola passa entre as partes pelo chat (seção 14: postDevolucao).
 * ========================================================================== */


/* ==========================================================================
 * 9. E-MAIL — avisa a lista a cada mudança de status
 * ========================================================================== */

/** Lista de destinatários (guardada no "cofre"). */
function getNotificationEmails() {
  try {
    var json = PropertiesService.getScriptProperties().getProperty('NOTIFICATION_EMAILS');
    return json ? JSON.parse(json) : [];
  } catch (e) { return []; }
}

/** Salva a lista de destinatários. */
function saveNotificationEmails(lista) {
  PropertiesService.getScriptProperties().setProperty('NOTIFICATION_EMAILS', JSON.stringify(lista || []));
  return 'Sucesso';
}

/** Endereço do sistema para o botão do e-mail (a MOLDURA, se configurada). */
function getSystemUrl_() {
  var url = PropertiesService.getScriptProperties().getProperty('SYSTEM_URL');
  if (url) return url;
  try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; }
}

/* (V3.1 — item 4 CANCELADO) O represamento de e-mail (fila + gatilhos de 10h/15h)
 * foi removido a pedido do dono. Os avisos voltam a sair NA HORA, como sempre.
 * Se um dia quiser represar de novo, NÃO instale gatilho por código chamado pelo
 * web app (o escopo script.scriptapp trava o app dentro do iframe). E lembre de
 * apagar os dois gatilhos antigos de enviarFilaEmails no painel Acionadores. */

/** Monta e envia o e-mail bonito de mudança de status. */
function sendEmailsOnStatusChange_(ata, statusAntigo, statusNovo) {
  var emails = getNotificationEmails();
  if (!emails || emails.length === 0) return;

  var novo = !statusAntigo;
  var ehDoc = (ata.tipo === TIPO_DOCUMENTO);
  var rotulo = ehDoc ? 'Documento' : 'Ata';
  var assunto = novo
    ? (ehDoc ? 'Novo pedido de documento: ' : 'Nova ata societária: ') + ata.id + ' — ' + ata.empresa
    : 'Status atualizado: ' + rotulo + ' ' + ata.id + ' — ' + ata.empresa + ' (' + statusNovo + ')';

  var textoStatus = novo
    ? 'Cadastrada com status inicial: <strong>' + statusNovo + '</strong>'
    : 'Alterado de <strong>' + statusAntigo + '</strong> para <strong>' + statusNovo + '</strong>';

  var sistemaUrl = getSystemUrl_();

  var html =
    "<div style='font-family:Arial,sans-serif;max-width:600px;border:1px solid #cbd5e1;border-radius:12px;padding:28px;color:#0f172a;background:#fff;'>" +
      "<div style='text-align:center;margin-bottom:24px;'>" +
        "<h2 style='color:#1e3a8a;margin:0;font-size:22px;'>Cobra Brasil</h2>" +
        "<p style='color:#475569;margin:4px 0 0;font-size:13px;text-transform:uppercase;letter-spacing:1px;'>Controle Despachante</p>" +
      "</div>" +
      "<hr style='border:0;border-top:1px solid #cbd5e1;margin-bottom:24px;'/>" +
      "<p style='font-size:15px;color:#334155;'>" +
        (novo ? (ehDoc ? "Um novo pedido de documento foi registrado."
                       : "Uma nova ata societária entrou no pipeline de processamento.")
              : "O status de " + (ehDoc ? "um pedido de documento" : "uma ata societária") + " foi alterado.") + "</p>" +
      "<div style='background:#f8fafc;border-radius:8px;padding:20px;margin:24px 0;border-left:4px solid #2563eb;'>" +
        "<table style='width:100%;font-size:14px;'>" +
          "<tr><td style='padding:6px 0;font-weight:600;width:140px;color:#475569;'>" + (ehDoc ? 'ID do Pedido:' : 'ID da Ata:') + "</td><td style='font-weight:600;'>" + ata.id + "</td></tr>" +
          "<tr><td style='padding:6px 0;font-weight:600;color:#475569;'>Empresa:</td><td>" + ata.empresa + "</td></tr>" +
          "<tr><td style='padding:6px 0;font-weight:600;color:#475569;'>Descrição:</td><td>" + (ata.descricao || '') + "</td></tr>" +
          "<tr><td style='padding:6px 0;font-weight:600;color:#475569;'>Tipo:</td><td>" + (ehDoc ? 'Outros documentos' : 'Ata societária') + "</td></tr>" +
          "<tr><td style='padding:6px 0;font-weight:600;color:#475569;'>Status:</td><td>" + textoStatus + "</td></tr>" +
        "</table>" +
      "</div>" +
      "<div style='text-align:center;margin-top:28px;'>" +
        (ata.folderUrl ? "<a href='" + ata.folderUrl + "' style='display:inline-block;background:#10b981;color:#fff;padding:12px 22px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;margin-right:10px;'>📂 Pasta no Drive</a>" : "") +
        (sistemaUrl ? "<a href='" + sistemaUrl + "' style='display:inline-block;background:#2563eb;color:#fff;padding:12px 22px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;'>🖥️ Acessar Sistema</a>" : "") +
      "</div>" +
      "<hr style='border:0;border-top:1px solid #cbd5e1;margin-top:32px;margin-bottom:16px;'/>" +
      "<p style='font-size:11px;color:#94a3b8;text-align:center;margin:0;'>Aviso automático do Controle Despachante — Cobra Brasil.</p>" +
    "</div>";

  MailApp.sendEmail({
    to: emails.join(','),
    subject: assunto,
    body: rotulo + ' ' + ata.id + ' (' + ata.empresa + ') — status: ' + statusNovo,
    htmlBody: html,
    name: 'Cobra Brasil',
    noReply: true
  });
}


/* ==========================================================================
 * 10. AUTENTICAÇÃO — login por senha + sessão de 7 dias (whitelist na planilha)
 * ==========================================================================
 * NOTA: hoje a senha é comparada em texto puro na aba "Usuarios" (igual ao
 * sistema de referência). É o ponto frágil que combinamos revisitar depois
 * (magic link puro ou senha com hash).
 */

/** Confere se o e-mail está na aba "Usuarios". */
function isEmailAuthorized_(email) {
  if (!email) return false;
  var alvo = email.trim().toLowerCase();
  var aba = getAbaUsuarios_();
  var dados = aba.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (dados[i][0] && String(dados[i][0]).trim().toLowerCase() === alvo) return true;
  }
  return false;
}

/** Login por e-mail + senha. Devolve um token de sessão (válido por 7 dias). */
function loginWithPassword(email, senha) {
  if (!email || !senha) return { sucesso: false, erro: 'E-mail e senha são obrigatórios.' };

  var alvo = email.trim().toLowerCase();
  var aba = getAbaUsuarios_();
  var dados = aba.getDataRange().getValues();

  var achou = false, senhaOk = false, permissao = 'admin';
  for (var i = 1; i < dados.length; i++) {
    if (dados[i][0] && String(dados[i][0]).trim().toLowerCase() === alvo) {
      achou = true;
      permissao = dados[i][1] ? String(dados[i][1]).trim().toLowerCase() : 'admin';
      var senhaBanco = dados[i][2] ? String(dados[i][2]).trim() : '';
      if (senhaBanco === String(senha).trim()) senhaOk = true;
      break;
    }
  }
  if (!achou)   return { sucesso: false, erro: 'E-mail não está autorizado no sistema.' };
  if (!senhaOk) return { sucesso: false, erro: 'Senha incorreta.' };

  var token = Utilities.getUuid().replace(/-/g, '');
  var expira = new Date().getTime() + 7 * 24 * 60 * 60 * 1000;
  PropertiesService.getScriptProperties().setProperty('TOKEN_' + token, alvo + '|' + expira + '|session');
  return { sucesso: true, token: token, permissao: permissao, navi: temNavi_(alvo) };
}

/** Valida um token de sessão guardado no navegador. */
function validateSessionToken(token) {
  if (!token) return { sucesso: false };
  var props = PropertiesService.getScriptProperties();
  var valor = props.getProperty('TOKEN_' + token);
  if (!valor) return { sucesso: false };

  var partes = valor.split('|');
  var email = partes[0], expira = parseInt(partes[1], 10), tipo = partes[2];

  if (new Date().getTime() > expira) { props.deleteProperty('TOKEN_' + token); return { sucesso: false, erro: 'Sessão expirada.' }; }
  if (tipo === 'url') return { sucesso: false, aguardandoAtivacao: true };
  if (!isEmailAuthorized_(email)) { props.deleteProperty('TOKEN_' + token); return { sucesso: false, erro: 'Usuário não autorizado.' }; }
  return { sucesso: true, email: email, permissao: getPermissao_(email), navi: temNavi_(email) };
}

/** Ativa uma sessão vinda por link na URL (magic link — reservado p/ futuro). */
function activateSession(token) {
  if (!token) return { sucesso: false, erro: 'Token inválido.' };
  var props = PropertiesService.getScriptProperties();
  var valor = props.getProperty('TOKEN_' + token);
  if (!valor) return { sucesso: false, erro: 'Token inválido ou expirado.' };

  var partes = valor.split('|');
  var email = partes[0], expira = parseInt(partes[1], 10);
  if (new Date().getTime() > expira) { props.deleteProperty('TOKEN_' + token); return { sucesso: false, erro: 'Link expirado.' }; }
  if (!isEmailAuthorized_(email)) { props.deleteProperty('TOKEN_' + token); return { sucesso: false, erro: 'Usuário não autorizado.' }; }

  var novoExpira = new Date().getTime() + 7 * 24 * 60 * 60 * 1000;
  props.setProperty('TOKEN_' + token, email + '|' + novoExpira + '|session');
  return { sucesso: true, email: email };
}

/** Logout: apaga o token no servidor. */
function removeSessionToken(token) {
  if (token) { try { PropertiesService.getScriptProperties().deleteProperty('TOKEN_' + token); } catch (e) {} }
  return { sucesso: true };
}


/* ==========================================================================
 * 11. UTILIDADES E MENU DE ADMIN
 * ========================================================================== */

/** URL da planilha (atalho na tela). */
function getSpreadsheetUrl() {
  try { return getPlanilha_().getUrl(); } catch (e) { return ''; }
}

/** Menu "Admin" quando a planilha é aberta (reset do contador, autorizações). */
function onOpen() {
  try {
    var planilha = SpreadsheetApp.getActiveSpreadsheet();
    if (planilha) getAbaUsuarios_(planilha);
    SpreadsheetApp.getUi().createMenu('Controle Despachante — Admin')
      .addItem('Sincronizar contador de ID', 'resetLastId')
      .addToUi();
  } catch (e) { /* fora do contexto de planilha */ }
}

/** Zera o contador de ID: o próximo cadastro recalcula pelo maior da planilha. */
function resetLastId() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_ID');
  try { SpreadsheetApp.getUi().alert('Contador sincronizado. O próximo ID será recalculado pela planilha.'); } catch (e) {}
}


/* -------------------------- ajudantes pequenos --------------------------- */

function formatarData_(valor, tz) {
  if (valor instanceof Date) return Utilities.formatDate(valor, tz, 'yyyy-MM-dd');
  return valor ? String(valor) : '';
}

function lerLink_(rico) {
  return rico ? (rico.getLinkUrl() || '') : '';
}

function setLinkCell_(aba, linha, coluna, texto, url) {
  var celula = aba.getRange(linha, coluna);
  if (texto && url) {
    celula.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(texto).setLinkUrl(url).build());
  } else {
    celula.setValue(texto || '');
  }
}


/* ==========================================================================
 * 12. PERFIS (V2) — admin / cobra / despachante
 * ========================================================================== */

/** Devolve o perfil de um e-mail na aba Usuarios (coluna Permissão). */
function getPermissao_(email) {
  if (!email) return 'admin';
  var alvo = email.trim().toLowerCase();
  var dados = getAbaUsuarios_().getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (dados[i][0] && String(dados[i][0]).trim().toLowerCase() === alvo) {
      return dados[i][1] ? String(dados[i][1]).trim().toLowerCase() : 'admin';
    }
  }
  return 'admin';
}


/* ==========================================================================
 * 13. TRILHA FINANCEIRA (V2) — independente do status da Junta
 * ========================================================================== */

/**
 * V3.2 — marca/desmarca "Arquivado na Rede" (coluna 19). Guarda a data quando
 * marca, limpa quando desmarca. Só o admin usa isto (checado na tela). Não mexe
 * em status nem na bola: é um controle interno da Cobra de que o documento já
 * foi guardado na rede física.
 */
function setArquivadoRede(ataId, valor) {
  var aba = getAbaAtas_();
  var dados = aba.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][0]) === String(ataId)) {
      aba.getRange(i + 1, 19).setValue(valor ? new Date() : '');
      carimbarConclusao_(aba, i + 1);
      return 'Sucesso';
    }
  }
  return 'Não encontrado';
}

/**
 * V4.1 — a Data de Conclusão segue os dois checks, porque são eles que definem
 * o "Concluído". Marcou os dois: carimba (se ainda não tiver data). Desmarcou
 * qualquer um: limpa, porque o registro deixou de estar concluído.
 */
function carimbarConclusao_(aba, linha) {
  try {
    var arqRede = String(aba.getRange(linha, 19).getValue() || '').trim();
    var navi    = String(aba.getRange(linha, 20).getValue() || '').trim();
    var atual   = aba.getRange(linha, 15).getValue();
    if (arqRede && navi) {
      if (!atual) aba.getRange(linha, 15).setValue(new Date());
    } else if (atual) {
      aba.getRange(linha, 15).setValue('');
    }
  } catch (e) { Logger.log('carimbarConclusao_ falhou: ' + e); }
}

/**
 * V4 — marca/desmarca "Pagamento no Navi" (coluna 20). Guarda a data quando
 * marca, limpa quando desmarca. Só quem tem Navi=SIM na aba Usuarios enxerga o
 * check (a tela esconde); junto com "Arquivado na Rede" é o que fecha o
 * registro como Finalizado.
 */
function setPagamentoNavi(ataId, valor) {
  var aba = getAbaAtas_();
  var dados = aba.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][0]) === String(ataId)) {
      aba.getRange(i + 1, 20).setValue(valor ? new Date() : '');
      carimbarConclusao_(aba, i + 1);
      return 'Sucesso';
    }
  }
  return 'Não encontrado';
}

/** Muda só o Status Financeiro de uma ata (legado V2; sem chamador na V4). */
function setStatusFinanceiro(ataId, novo) {
  var aba = getAbaAtas_();
  var dados = aba.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][0]) === String(ataId)) {
      aba.getRange(i + 1, 17).setValue(novo || '');
      return 'Sucesso';
    }
  }
  return 'Não encontrado';
}


/* ==========================================================================
 * 14. DEVOLUÇÕES (V3) — o chat entre as partes; cada mensagem passa a bola
 * ==========================================================================
 * A aba continua se chamando "Pendencias" (para não perder o histórico), mas a
 * semântica mudou: não congela mais nada. Quem escreve está DEVOLVENDO a ação —
 * a bola vai para o OUTRO lado. Cada linha pode ter vários anexos (JSON na
 * coluna Arquivo).
 */

/** Aba "Pendencias": uma linha por mensagem do chat/devolução. */
function getAbaPendencias_(planilha) {
  planilha = planilha || getPlanilha_();
  var aba = planilha.getSheetByName('Pendencias');
  if (!aba) {
    aba = planilha.insertSheet('Pendencias');
    aba.getRange(1, 1, 1, 6).setValues([['ID da Ata', 'Data/Hora', 'Autor', 'Papel', 'Mensagem', 'Arquivo']])
      .setBackground('#1A365D').setFontColor('#FFFFFF').setFontWeight('bold');
    aba.setFrozenRows(1);
  }
  return aba;
}

/** Lê a célula Arquivo (col 6) como lista [{nome,url}]: aceita JSON (novo) ou link único (antigo). */
function lerArquivosCelula_(texto, rico) {
  var t = String(texto || '').trim();
  if (t.charAt(0) === '[') {
    try { var arr = JSON.parse(t); if (Array.isArray(arr)) return arr; } catch (e) {}
  }
  if (t) return [{ nome: t, url: rico ? (rico.getLinkUrl() || '') : '' }];
  return [];
}

/** Devolve o histórico do chat de uma ata, em ordem cronológica. */
function getPendencias(ataId) {
  var aba = getAbaPendencias_();
  var intervalo = aba.getDataRange();
  var dados = intervalo.getValues();
  var ricos = intervalo.getRichTextValues();
  var tz = aba.getParent().getSpreadsheetTimeZone() || 'America/Sao_Paulo';
  var msgs = [];
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][0]) !== String(ataId)) continue;
    msgs.push({
      dataHora: dados[i][1] instanceof Date ? Utilities.formatDate(dados[i][1], tz, 'dd/MM/yyyy HH:mm') : String(dados[i][1] || ''),
      autor:    String(dados[i][2] || ''),
      papel:    String(dados[i][3] || ''),
      mensagem: String(dados[i][4] || ''),
      arquivos: lerArquivosCelula_(dados[i][5], ricos[i][5])
    });
  }
  return msgs;
}

/**
 * Registra uma mensagem no chat e PASSA A BOLA para o outro lado.
 * dados = { ataId, autor, papel, mensagem, arquivos:[{nome,url}] }
 * Não congela status. A bola vira o contrário de quem escreveu (papel).
 */
function postDevolucao(dados) {
  var abaAtas = getAbaAtas_();
  var linhas = abaAtas.getDataRange().getValues();
  var linha = -1;
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) === String(dados.ataId)) { linha = i + 1; break; }
  }
  if (linha === -1) throw new Error('Ata não encontrada.');

  var empresa   = String(linhas[linha - 1][1] || '');
  var descricao = String(linhas[linha - 1][2] || '');
  var tipo      = String(linhas[linha - 1][20] || '') === TIPO_DOCUMENTO ? TIPO_DOCUMENTO : TIPO_ATA;
  var arquivos  = Array.isArray(dados.arquivos) ? dados.arquivos.filter(function (a) { return a && a.nome; }) : [];

  // Grava a mensagem (se houver texto ou anexo). Anexos como JSON na coluna 6.
  if (dados.mensagem || arquivos.length) {
    var abaP = getAbaPendencias_();
    abaP.appendRow([dados.ataId, new Date(), dados.autor || '', dados.papel || '', dados.mensagem || '', arquivos.length ? JSON.stringify(arquivos) : '']);
  }

  // Passa a bola: quem escreveu devolve pro outro lado.
  var papel = String(dados.papel || '').toLowerCase();
  var novaBola = (papel === 'despachante') ? 'Cobra' : 'Despachante';
  abaAtas.getRange(linha, 18).setValue(novaBola);

  // E-mail de aviso (falha em silêncio).
  try {
    var folderRico = abaAtas.getRange(linha, 12).getRichTextValue();
    sendDevolucaoEmail_({
      id: dados.ataId, empresa: empresa, descricao: descricao, tipo: tipo,
      folderUrl: folderRico ? (folderRico.getLinkUrl() || '') : '',
      papel: dados.papel || '', mensagem: dados.mensagem || '', novaBola: novaBola
    });
  } catch (e) { Logger.log('E-mail devolução falhou: ' + e); }

  return { sucesso: true, bola: novaBola };
}

/**
 * E-mail curto avisando de nova manifestação no chat.
 * A "bola" é vocabulário interno da tela — no e-mail, que sai para fora do time,
 * a mesma ideia é dita como RESPONSÁVEL ATUAL.
 */
function sendDevolucaoEmail_(p) {
  var emails = getNotificationEmails();
  if (!emails || emails.length === 0) return;
  var responsavel = (p.novaBola === 'Cobra') ? 'Cobra Brasil' : 'Despachante';
  var rotulo = (p.tipo === TIPO_DOCUMENTO) ? 'Documento' : 'Ata';
  var titulo = rotulo + ' ' + p.id + ' — aguardando retorno: ' + responsavel;
  var sistemaUrl = getSystemUrl_();
  var html =
    "<div style='font-family:Arial,sans-serif;max-width:600px;border:1px solid #cbd5e1;border-radius:12px;padding:24px;color:#0f172a;'>" +
      "<h2 style='color:#1e3a8a;margin:0 0 4px;'>Nova manifestação registrada</h2>" +
      "<p style='color:#475569;margin:0 0 16px;font-size:13px;'>" + rotulo + " " + p.id + " — " + p.empresa + " · responsável atual: <strong>" + responsavel + "</strong></p>" +
      (p.mensagem ? "<div style='background:#f8fafc;border-left:4px solid #2563eb;border-radius:8px;padding:14px;margin-bottom:16px;'><strong>" + p.papel + ":</strong> " + p.mensagem + "</div>" : "") +
      "<div style='text-align:center;'>" +
        (p.folderUrl ? "<a href='" + p.folderUrl + "' style='display:inline-block;background:#10b981;color:#fff;padding:10px 18px;text-decoration:none;border-radius:8px;font-weight:600;font-size:13px;margin-right:8px;'>📂 Pasta no Drive</a>" : "") +
        (sistemaUrl ? "<a href='" + sistemaUrl + "' style='display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;text-decoration:none;border-radius:8px;font-weight:600;font-size:13px;'>🖥️ Abrir sistema</a>" : "") +
      "</div>" +
    "</div>";
  MailApp.sendEmail({ to: emails.join(','), subject: titulo, htmlBody: html, body: titulo, name: 'Cobra Brasil', noReply: true });
}


/* ==========================================================================
 * 15. CENTRAL DE PEDIDOS DE PAGAMENTO (V4) — era "Reembolsos" (V2.1)
 * ==========================================================================
 * A V4 acabou com a divisão entre "reembolso" e "NF": existe UMA central de
 * pedidos de pagamento. Cada pedido é uma linha na aba "Reembolsos" (o nome da
 * aba fica, para não perder o histórico) com: Objeto (texto livre), Tipo
 * (Reembolso | Serviço), Valor e anexos de lastro.
 * Honorários, que eram um campo solto na ata, entram aqui como Tipo=Serviço.
 * V4.1: a BAIXA POR PEDIDO acabou. A central virou um lugar de consolidar o que
 * foi pedido — sem controle de tempo, sem "aguardando". Quem diz que o pagamento
 * saiu é o check "Pagamento no Navi", que vale para o registro inteiro. A coluna
 * "Baixado Em" fica na planilha só com o histórico das baixas antigas.
 * A coluna "Reembolso Taxas" da aba Atas guarda a SOMA de todos os pedidos.
 */

var TIPO_PAG_REEMBOLSO = 'Reembolso';
var TIPO_PAG_SERVICO   = 'Serviço';

/** Aba "Reembolsos": uma linha por pedido. Col 7 = "Baixado Em" (legado V4.1);
 *  col 8 = "Tipo". */
function getAbaReembolsos_(planilha) {
  planilha = planilha || getPlanilha_();
  var aba = planilha.getSheetByName('Reembolsos');
  var CAB = ['ID da Ata', 'Data/Hora', 'Autor', 'Valor', 'Objeto', 'Arquivo', 'Baixado Em', 'Tipo'];
  if (!aba) {
    aba = planilha.insertSheet('Reembolsos');
    aba.getRange(1, 1, 1, CAB.length).setValues([CAB])
      .setBackground('#1A365D').setFontColor('#FFFFFF').setFontWeight('bold');
    aba.setFrozenRows(1);
  } else if (aba.getMaxColumns() < CAB.length || String(aba.getRange(1, 8).getValue()).trim() !== 'Tipo') {
    if (aba.getMaxColumns() < CAB.length) aba.insertColumnsAfter(aba.getMaxColumns(), CAB.length - aba.getMaxColumns());
    aba.getRange(1, 1, 1, CAB.length).setValues([CAB])
      .setBackground('#1A365D').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  return aba;
}

/** Devolve os pedidos de pagamento de uma ata (com anexos e estado de baixa). */
function getReembolsos(ataId) {
  var aba = getAbaReembolsos_();
  var intervalo = aba.getDataRange();
  var dados = intervalo.getValues();
  var ricos = intervalo.getRichTextValues();
  var tz = aba.getParent().getSpreadsheetTimeZone() || 'America/Sao_Paulo';
  var itens = [];
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][0]) !== String(ataId)) continue;
    // Pedido antigo (pré-V4) não tem tipo gravado: tudo que existia era reembolso.
    var tipoPag = String(dados[i][7] || '').trim() === TIPO_PAG_SERVICO ? TIPO_PAG_SERVICO : TIPO_PAG_REEMBOLSO;
    itens.push({
      linha:        i + 1,
      dataHora:     dados[i][1] instanceof Date ? Utilities.formatDate(dados[i][1], tz, 'dd/MM/yyyy HH:mm') : String(dados[i][1] || ''),
      autor:        String(dados[i][2] || ''),
      valor:        Number(dados[i][3]) || 0,
      objeto:       String(dados[i][4] || ''),
      tipo:         tipoPag,
      arquivos:     lerArquivosCelula_(dados[i][5], ricos[i][5])
    });
  }
  return itens;
}

/** Soma TODOS os pedidos de pagamento de uma ata e grava na coluna 9 (Reembolso Taxas). */
function recomputarTotalReembolso_(ataId) {
  var itens = getReembolsos(ataId);
  var total = 0;
  for (var i = 0; i < itens.length; i++) total += itens[i].valor;

  var abaAtas = getAbaAtas_();
  var dados = abaAtas.getDataRange().getValues();
  for (var j = 1; j < dados.length; j++) {
    if (String(dados[j][0]) === String(ataId)) {
      abaAtas.getRange(j + 1, 9).setValue(total);
      break;
    }
  }
  return total;
}

/**
 * Registra um novo pedido de pagamento.
 * dados = { ataId, autor, valor, objeto, tipo, arquivos:[{nome,url}] }
 * Os anexos já subiram direto pro Drive; aqui só guardamos os links (JSON).
 */
function postReembolso(dados) {
  var abaAtas = getAbaAtas_();
  var linhas = abaAtas.getDataRange().getValues();
  var linha = -1;
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) === String(dados.ataId)) { linha = i + 1; break; }
  }
  if (linha === -1) throw new Error('Ata não encontrada.');

  var arquivos = Array.isArray(dados.arquivos) ? dados.arquivos.filter(function (a) { return a && a.nome; }) : [];

  var tipoPag = (dados.tipo === TIPO_PAG_SERVICO) ? TIPO_PAG_SERVICO : TIPO_PAG_REEMBOLSO;
  var objeto  = dados.objeto || dados.justificativa || '';   // 'justificativa' era o nome na V3

  var abaR = getAbaReembolsos_();
  abaR.appendRow([dados.ataId, new Date(), dados.autor || '', Number(dados.valor) || 0, objeto, arquivos.length ? JSON.stringify(arquivos) : '', '', tipoPag]);

  var total = recomputarTotalReembolso_(dados.ataId);
  return { sucesso: true, total: total };
}

/* (V4.1) darBaixaReembolso e reabrirReembolso removidas: a baixa por pedido
 * deixou de existir. O controle do pagamento é o check "Pagamento no Navi". */

/** Exclui um pedido de pagamento (pela linha) e recalcula o total. */
function deleteReembolso(ataId, linha) {
  var aba = getAbaReembolsos_();
  var dados = aba.getDataRange().getValues();
  var alvo = Number(linha);
  // Confere que a linha realmente pertence a esta ata antes de apagar.
  if (alvo >= 2 && alvo <= dados.length && String(dados[alvo - 1][0]) === String(ataId)) {
    aba.deleteRow(alvo);
    recomputarTotalReembolso_(ataId);
    return 'Sucesso';
  }
  return 'Não encontrado';
}

/** Grava os Honorários Despachante (coluna 10). LEGADO V3: na V4 os honorários
 *  são um pedido de pagamento do tipo Serviço; a coluna fica só com o histórico
 *  e esta função não tem mais chamador na tela. */
function setHonorarios(ataId, valor) {
  var aba = getAbaAtas_();
  var dados = aba.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][0]) === String(ataId)) {
      aba.getRange(i + 1, 10).setValue(Number(valor) || 0);
      return 'Sucesso';
    }
  }
  return 'Não encontrado';
}
