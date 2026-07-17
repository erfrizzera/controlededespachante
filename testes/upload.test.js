/**
 * Teste do upload direto pro Drive.   Rodar:  node testes/upload.test.js
 *
 * Por que existe (é o único teste do projeto, e não é para virar moda): este
 * caminho só falha de verdade com um arquivo de dezenas de MB, em produção,
 * com o despachante esperando na frente da tela. Não dá para exercitar à mão,
 * e o iframe do Apps Script não deixa automatizar a tela publicada.
 *
 * Então ele recorta as funções REAIS do App.html (recorta do arquivo, não
 * copia) e roda com um `fetch` de mentira, conferindo o que a aritmética erra
 * quando ninguém olha: a conta dos pedaços, a retomada quando o Drive aceita
 * menos do que foi mandado, e a reserva de uma tacada só.
 *
 * Se você mexer no uploadFilePromise e isto quebrar, o arquivo grande quebra junto.
 */
const fs = require('fs');
const vm = require('vm');

const APP = require('path').join(__dirname, '..', 'apps-script', 'App.html');
const html = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');

function recortar(ini, fim, rot) {
  const a = html.indexOf(ini);
  if (a === -1) throw new Error('inicio nao achado: ' + rot);
  const b = html.indexOf(fim, a);
  if (b === -1) throw new Error('fim nao achado: ' + rot);
  return html.slice(a, b + fim.length);
}

const codigo = [
  recortar('const PEDACO_UPLOAD', ';', 'const'),
  recortar('    /** fetch com prazo.', '\n    }\n', 'buscarComPrazo'),
  recortar('    async function uploadFilePromise(file', '\n    }\n', 'uploadFilePromise'),
  recortar('    async function subirDeUmaVez(file', '\n    }\n', 'subirDeUmaVez'),
  recortar('    function formatarTamanho(bytes)', '\n    }\n', 'formatarTamanho'),
].join('\n');

// ---- dublês ----
let telas = [];
let chamadasServidor = [];
let pedidos = [];

function novoContexto(roteiroFetch) {
  pedidos = []; telas = []; chamadasServidor = [];
  const ctx = {
    Blob, File, AbortController, setTimeout, clearTimeout, Math, Date, JSON, Object, Number, String, Error,
    console,
    showLoading: (t) => telas.push(t),
    chamarServidor: async (fn, args) => {
      chamadasServidor.push({ fn, args });
      if (fn === 'prepararUploadDireto') return { token: 'TOKEN_FALSO', folderId: 'PASTA_123' };
      if (fn === 'finalizarUploadDireto') return { name: 'ata.pdf', url: 'https://drive/link', id: args[0], folderUrl: 'https://drive/pasta' };
      throw new Error('funcao inesperada: ' + fn);
    },
    fetch: async (url, op) => { pedidos.push({ url, op }); return roteiroFetch(url, op, pedidos.length); },
  };
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  return ctx;
}

function resposta(status, headers, corpo) {
  const h = new Map(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => h.get(k.toLowerCase()) ?? null },
    json: async () => corpo,
  };
}

function arquivoFalso(bytes) {
  return new File([Buffer.alloc(bytes, 7)], 'chancelada.pdf', { type: 'application/pdf' });
}

const P = 8 * 1024 * 1024;
let falhas = 0;
function conferir(nome, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) { falhas++; console.log('  FALHOU ' + nome + '\n    real:      ' + JSON.stringify(real) + '\n    esperado:  ' + JSON.stringify(esperado)); }
  else console.log('  ok  ' + nome);
}

(async () => {
  // ===== 1) Caminho feliz: 69 MB, Location presente =====
  console.log('\n1) 69 MB com sessao retomavel');
  {
    const tamanho = 69 * 1024 * 1024;
    const ctx = novoContexto((url, op, n) => {
      if (n === 1) return resposta(200, { Location: 'https://upload/sessao/abc' }, {});
      const total = Math.ceil(tamanho / P);
      if (n - 1 < total) return resposta(308, { Range: `bytes=0-${Math.min((n - 1) * P, tamanho) - 1}` }, {});
      return resposta(200, {}, { id: 'ARQ_9' });
    });
    const res = await ctx.uploadFilePromise(arquivoFalso(tamanho), 'chancelada.pdf', '0007', 'LINS', 'desc');
    conferir('devolve o link', res.url, 'https://drive/link');
    const puts = pedidos.filter(p => p.op.method === 'PUT');
    conferir('numero de pedacos', puts.length, Math.ceil(tamanho / P));
    conferir('1o Content-Range', puts[0].op.headers['Content-Range'], `bytes 0-${P - 1}/${tamanho}`);
    const ult = puts[puts.length - 1];
    conferir('ultimo Content-Range termina no fim', ult.op.headers['Content-Range'], `bytes ${(puts.length - 1) * P}-${tamanho - 1}/${tamanho}`);
    conferir('nenhum byte a mais', puts.reduce((s, p) => s + p.op.body.size, 0), tamanho);
    conferir('finalizou com o id certo', chamadasServidor.filter(c => c.fn === 'finalizarUploadDireto')[0].args[0], 'ARQ_9');
  }

  // ===== 2) O Drive aceitou MENOS do que mandamos =====
  console.log('\n2) Drive aceita so parte do pedaco (retomada)');
  {
    const tamanho = 20 * 1024 * 1024;
    let etapa = 0;
    const ctx = novoContexto((url, op, n) => {
      if (n === 1) return resposta(200, { Location: 'https://upload/sessao/abc' }, {});
      etapa++;
      if (etapa === 1) return resposta(308, { Range: 'bytes=0-1048575' }, {}); // aceitou so 1 MB dos 8
      if (etapa === 2) return resposta(308, { Range: `bytes=0-${9 * 1024 * 1024 - 1}` }, {});
      return resposta(200, {}, { id: 'ARQ_X' });
    });
    const res = await ctx.uploadFilePromise(arquivoFalso(tamanho), 'a.pdf', '1', 'E', 'd');
    const puts = pedidos.filter(p => p.op.method === 'PUT');
    conferir('2o pedaco recomeca em 1 MB', puts[1].op.headers['Content-Range'], `bytes 1048576-${9 * 1024 * 1024 - 1}/${tamanho}`);
    // Recomeça em 9 MB e manda mais 8 MB (o pedaço é limitado), nao ate o fim.
    conferir('3o pedaco recomeca em 9 MB', puts[2].op.headers['Content-Range'], `bytes ${9 * 1024 * 1024}-${17 * 1024 * 1024 - 1}/${tamanho}`);
    conferir('terminou', res.url, 'https://drive/link');
  }

  // ===== 3) Sem Location → cai pro envio de uma tacada =====
  console.log('\n3) Sem Location: reserva multipart');
  {
    const tamanho = 3 * 1024 * 1024;
    const ctx = novoContexto((url, op, n) => {
      if (n === 1) return resposta(200, {}, {}); // SEM Location
      return resposta(200, {}, { id: 'ARQ_M' });
    });
    const res = await ctx.uploadFilePromise(arquivoFalso(tamanho), 'nf.pdf', '2', 'E', 'd');
    conferir('devolveu link', res.url, 'https://drive/link');
    const post = pedidos[1];
    conferir('foi multipart', /uploadType=multipart/.test(post.url), true);
    conferir('nenhum PUT', pedidos.filter(p => p.op.method === 'PUT').length, 0);
    const texto = await post.op.body.slice(0, 400).text();
    conferir('metadados no corpo', /"name":"nf\.pdf"/.test(texto) && /"parents":\["PASTA_123"\]/.test(texto), true);
    const lim = post.op.headers['Content-Type'].split('boundary=')[1];
    conferir('boundary bate com o corpo', texto.startsWith('--' + lim), true);
    conferir('corpo maior que o arquivo', post.op.body.size > tamanho, true);
  }

  // ===== 4) Erros =====
  console.log('\n4) Erros terminam com mensagem');
  {
    const ctx = novoContexto(() => resposta(403, {}, {}));
    let erro = null;
    try { await ctx.uploadFilePromise(arquivoFalso(1024), 'x.pdf', '3', 'E', 'd'); } catch (e) { erro = e.message; }
    conferir('recusa vira erro legivel', /recusou o envio de "x\.pdf" \(c.digo 403\)/.test(erro || ''), true);
  }
  {
    const ctx = novoContexto(() => { throw new Error('rede caiu'); });
    let erro = null;
    try { await ctx.uploadFilePromise(arquivoFalso(1024), 'y.pdf', '4', 'E', 'd'); } catch (e) { erro = e.message; }
    conferir('queda de rede vira erro legivel', /Nao foi possivel|não foi possível|falar com o Drive/i.test(erro || ''), true);
  }
  {
    const ctx = novoContexto(() => resposta(200, { Location: 'https://s' }, {}));
    conferir('formatarTamanho 69MB', ctx.formatarTamanho(69 * 1024 * 1024), '69 MB');
    conferir('formatarTamanho 200KB', ctx.formatarTamanho(200 * 1024), '200 KB');
  }

  console.log('\n===== falhas: ' + falhas + ' =====');
  process.exit(falhas ? 1 : 0);
})();
