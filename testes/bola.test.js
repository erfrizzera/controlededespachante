/**
 * Teste da lógica da V3: a bola e o cifrão vermelho.   node testes/bola.test.js
 *
 * Recorta deQuemEhAVez do App.html (código real) e verifica os casos. Também
 * checa, com as MESMAS regras do backend (replicadas aqui em 1 linha cada), o
 * flip da bola no chat e o "vermelho = há pedido sem baixa".
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'App.html'), 'utf8').replace(/\r\n/g, '\n');
function corta(ini, fim) { const a = html.indexOf(ini); const b = html.indexOf(fim, a); return html.slice(a, b + fim.length); }

const ctx = {};
vm.createContext(ctx);
vm.runInContext(corta('function deQuemEhAVez(ata) {', '\n    }\n') + '\nthis.deQuemEhAVez = deQuemEhAVez;', ctx);

let falhas = 0;
function ok(nome, real, esperado) {
  if (JSON.stringify(real) !== JSON.stringify(esperado)) { falhas++; console.log('  FALHOU ' + nome + ' -> ' + JSON.stringify(real) + ' (esperado ' + JSON.stringify(esperado) + ')'); }
  else console.log('  ok  ' + nome);
}

console.log('1) deQuemEhAVez (toggle)');
ok('Enviado + bola Despachante', ctx.deQuemEhAVez({ status: 'Enviado', bola: 'Despachante' }), 'despachante');
ok('Em Protocolo + bola Cobra',  ctx.deQuemEhAVez({ status: 'Em Protocolo', bola: 'Cobra' }), 'cobra');
ok('Registrada + bola Cobra',    ctx.deQuemEhAVez({ status: 'Registrada', bola: 'Cobra' }), 'cobra');
ok('Concluído sempre = fim',     ctx.deQuemEhAVez({ status: 'Concluído', bola: 'Cobra' }), 'fim');
ok('sem bola cai no despachante',ctx.deQuemEhAVez({ status: 'Enviado', bola: '' }), 'despachante');

console.log('2) flip da bola no chat (quem escreve devolve pro outro)');
const flip = (papel) => (String(papel).toLowerCase() === 'despachante') ? 'Cobra' : 'Despachante';
ok('despachante escreve -> Cobra', flip('Despachante'), 'Cobra');
ok('cobra escreve -> Despachante', flip('Cobra'), 'Despachante');
ok('admin (papel Cobra) -> Despachante', flip('Cobra'), 'Despachante');

console.log('3) cifrão vermelho = há pedido sem baixa');
const vermelho = (pedidos) => pedidos.some(p => !p.baixado);
ok('nenhum pedido -> apagado', vermelho([]), false);
ok('1 pendente -> vermelho', vermelho([{ baixado: false }]), true);
ok('1 pago -> apagado', vermelho([{ baixado: true }]), false);
ok('1 pago + 1 pendente -> vermelho', vermelho([{ baixado: true }, { baixado: false }]), true);

console.log('\n===== falhas: ' + falhas + ' =====');
process.exit(falhas ? 1 : 0);
