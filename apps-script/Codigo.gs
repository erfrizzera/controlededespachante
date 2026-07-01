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
  'Status Anterior'                  // 16
];


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
  return aba;
}

/** Devolve a aba "Usuarios" (whitelist de acesso: Email, Permissão, Senha). */
function getAbaUsuarios_(planilha) {
  planilha = planilha || getPlanilha_();
  var aba = planilha.getSheetByName(NOME_ABA_USUARIOS);
  if (!aba) {
    aba = planilha.insertSheet(NOME_ABA_USUARIOS);
    aba.getRange(1, 1, 1, 3).setValues([['Email', 'Permissão', 'Senha']])
      .setBackground('#1A365D').setFontColor('#FFFFFF').setFontWeight('bold');
    aba.setFrozenRows(1);
  }
  return aba;
}


/* ==========================================================================
 * 3. LER — devolve todas as atas para a tela
 * ========================================================================== */

function getAtas() {
  var aba = getAbaAtas_();
  var intervalo = aba.getDataRange();
  var dados = intervalo.getValues();
  if (dados.length <= 1) return [];

  var ricos = intervalo.getRichTextValues(); // links embutidos nas células
  var tz = aba.getParent().getSpreadsheetTimeZone() || 'America/Sao_Paulo';

  var atas = [];
  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    if (!linha[0]) continue;
    var rico = ricos[i];

    atas.push({
      id:                String(linha[0]),
      empresa:           String(linha[1]),
      descricao:         String(linha[2]),
      dataEnvio:         formatarData_(linha[3], tz),
      status:            String(linha[4]),
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
      statusAnterior:    String(linha[15] || '')
    });
  }
  return atas;
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

  var statusAntigo = '', dataEnvioAtual = null, dataProtocoloAtual = null, dataConclusaoAtual = null;
  if (linhaExistente !== -1) {
    statusAntigo       = String(dados[linhaExistente - 1][4] || '');
    dataEnvioAtual     = dados[linhaExistente - 1][3];
    dataProtocoloAtual = dados[linhaExistente - 1][12];
    dataConclusaoAtual = dados[linhaExistente - 1][14];
  }

  // Data do Protocolo: automática quando o número aparece.
  var dataProtocolo = dataProtocoloAtual;
  if (ata.protocolo && !dataProtocolo) dataProtocolo = new Date();
  else if (ata.dataProtocolo) dataProtocolo = new Date(ata.dataProtocolo + 'T12:00:00');

  // Data de Conclusão: automática quando vira "Concluído".
  var dataConclusao = dataConclusaoAtual;
  if (ata.status === 'Concluído' && !dataConclusao) dataConclusao = new Date();
  else if (ata.dataConclusao) dataConclusao = new Date(ata.dataConclusao + 'T12:00:00');

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
    ata.statusAnterior || ''
  ];

  var linhaAlvo;
  if (linhaExistente !== -1) {
    aba.getRange(linhaExistente, 1, 1, linhaValores.length).setValues([linhaValores]);
    linhaAlvo = linhaExistente;
  } else {
    aba.appendRow(linhaValores);
    linhaAlvo = aba.getLastRow();
  }

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
      copia.id = idFinal; copia.folderUrl = folderUrl;
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

/** Acha (ou cria) a pasta raiz de arquivos do sistema. */
function getPastaRaiz_() {
  var pastas = DriveApp.getFoldersByName(PASTA_RAIZ_DRIVE);
  return pastas.hasNext() ? pastas.next() : DriveApp.createFolder(PASTA_RAIZ_DRIVE);
}

/** Acha (ou cria) a subpasta de uma ata e devolve a URL dela. */
function getOrCreateAtaFolderUrl_(ataId, empresa, descricao) {
  try {
    var raiz = getPastaRaiz_();
    var prefixo = ataId + ' -';
    var sub = raiz.getFolders();
    while (sub.hasNext()) {
      var p = sub.next();
      if (p.getName().indexOf(prefixo) === 0) return p.getUrl();
    }
    var nova = raiz.createFolder(ataId + ' - ' + empresa + ' - ' + descricao);
    nova.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return nova.getUrl();
  } catch (e) {
    Logger.log('Pasta falhou: ' + e);
    return '';
  }
}

/**
 * Recebe o arquivo em base64 (vindo da tela), grava na pasta da ata e devolve
 * o nome + a URL para a tela guardar.
 */
function uploadFileToDrive(base64Data, fileName, ataId, empresa, descricao) {
  try {
    var raiz = getPastaRaiz_();
    var alvo = null, prefixo = ataId + ' -';
    var sub = raiz.getFolders();
    while (sub.hasNext()) {
      var p = sub.next();
      if (p.getName().indexOf(prefixo) === 0) { alvo = p; break; }
    }
    if (!alvo) {
      alvo = raiz.createFolder(ataId + ' - ' + empresa + ' - ' + descricao);
      alvo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }

    var partes = base64Data.split(',');
    var tipo = partes[0].substring(5, partes[0].indexOf(';'));
    var bytes = Utilities.base64Decode(partes[1]);
    var blob = Utilities.newBlob(bytes, tipo, fileName);

    var arquivo = alvo.createFile(blob);
    arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { name: arquivo.getName(), url: arquivo.getUrl(), id: arquivo.getId(), folderUrl: alvo.getUrl() };
  } catch (e) {
    Logger.log('Upload falhou: ' + e);
    return { error: 'Erro no servidor ao salvar arquivo: ' + e.message };
  }
}


/* ==========================================================================
 * 8. PENDÊNCIA — congela a ata em "Pendência Cobra" e depois restaura
 * ========================================================================== */

function toggleAtaPendency(id) {
  var aba = getAbaAtas_();
  var dados = aba.getDataRange().getValues();
  var linha = -1;
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][0]) === String(id)) { linha = i + 1; break; }
  }
  if (linha === -1) throw new Error('Ata não encontrada.');

  var atual = String(dados[linha - 1][4] || '');
  var anterior = String(dados[linha - 1][15] || '');

  var novoStatus, novoAnterior;
  if (atual === 'Pendência Cobra') {
    novoStatus = anterior || 'Enviado';
    novoAnterior = '';
  } else {
    novoStatus = 'Pendência Cobra';
    novoAnterior = atual;
  }

  aba.getRange(linha, 5).setValue(novoStatus);   // coluna Status
  aba.getRange(linha, 16).setValue(novoAnterior);// coluna Status Anterior

  try {
    var rico = aba.getRange(linha, 12).getRichTextValue();
    sendEmailsOnStatusChange_({
      id: id,
      empresa: String(dados[linha - 1][1] || ''),
      descricao: String(dados[linha - 1][2] || ''),
      folderUrl: rico ? (rico.getLinkUrl() || '') : ''
    }, atual, novoStatus);
  } catch (e) { Logger.log('E-mail pendência falhou: ' + e); }

  return 'Sucesso';
}


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

/** Monta e envia o e-mail bonito de mudança de status. */
function sendEmailsOnStatusChange_(ata, statusAntigo, statusNovo) {
  var emails = getNotificationEmails();
  if (!emails || emails.length === 0) return;

  var novo = !statusAntigo;
  var assunto = novo
    ? 'Nova Ata Societária: ' + ata.id + ' — ' + ata.empresa
    : 'Status Atualizado: Ata ' + ata.id + ' — ' + ata.empresa + ' (' + statusNovo + ')';

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
        (novo ? "Uma nova ata societária entrou no pipeline de processamento."
              : "O status de uma ata societária foi alterado.") + "</p>" +
      "<div style='background:#f8fafc;border-radius:8px;padding:20px;margin:24px 0;border-left:4px solid #2563eb;'>" +
        "<table style='width:100%;font-size:14px;'>" +
          "<tr><td style='padding:6px 0;font-weight:600;width:140px;color:#475569;'>ID da Ata:</td><td style='font-weight:600;'>" + ata.id + "</td></tr>" +
          "<tr><td style='padding:6px 0;font-weight:600;color:#475569;'>Empresa:</td><td>" + ata.empresa + "</td></tr>" +
          "<tr><td style='padding:6px 0;font-weight:600;color:#475569;'>Descrição:</td><td>" + (ata.descricao || '') + "</td></tr>" +
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
    body: 'Ata ' + ata.id + ' (' + ata.empresa + ') — status: ' + statusNovo,
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

  var achou = false, senhaOk = false;
  for (var i = 1; i < dados.length; i++) {
    if (dados[i][0] && String(dados[i][0]).trim().toLowerCase() === alvo) {
      achou = true;
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
  return { sucesso: true, token: token };
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
  return { sucesso: true, email: email };
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
