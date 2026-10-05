import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Executa o código de produção com apenas UI/rede substituídos. Não há rede ou
// alterações em compras reais. Um arquivo-base opcional permite provar a regressão.
const source = process.argv[2] || 'compras.js';
const ctx = vm.createContext({ console, Intl, URL, Date, Math, crypto,
  S: { cfg: { empresa: { nomeCurto: 'Teste' } }, reg: {}, quem: 'Operador teste' },
  document: { addEventListener() {}, getElementById() { return null; } }, localStorage: { getItem() { return null; } },
  window: {}, setTimeout(fn) { fn(); }, clearTimeout() {} });
for (const f of ['ui.js', 'qualificacao.js', source, 'rede.js']) vm.runInContext(readFileSync(f, 'utf8'), ctx);
vm.runInContext(`
  var gravacoes = [], confirmacoes = [], retornoData = null, retornoTexto = null, retornoConfirmar = false;
  var popup = {}, atual = null, ultimoModal = null;
  function salvar(c, r) { gravacoes.push({colecao:c, registro:r}); return r; }
  function achar(c, id) { return (S.reg[c] || []).find(x => x.id === id) || (c === 'oc' ? atual : null); }
  function lista(c) { return S.reg[c] || []; }
  function historiar(o, texto) { return [...(o.historico || []), {o_que: texto, por:'Operador'}]; }
  function render() {}
  function toast() {}
  function perguntarData() { return Promise.resolve(retornoData); }
  function perguntar() { return Promise.resolve(retornoTexto); }
  function confirmar(t, o) { confirmacoes.push({texto:t,opcoes:o}); return Promise.resolve(retornoConfirmar); }
  function fecharEste() {}
  function fecharModal() {}
  function abrirModal(opcoes) { ultimoModal = opcoes; return {}; }
  window.open = () => popup;
`, ctx);
const run = s => vm.runInContext(s, ctx);
let passed = 0;
const test = async (nome, fn) => { await fn(); passed++; console.log('✓ ' + nome); };
const reset = () => run('gravacoes=[];confirmacoes=[];retornoData=null;retornoTexto=null;retornoConfirmar=false;popup={};atual=null;S.reg={};');

await test('Fechar previsão de entrega não avança nem grava histórico', async () => {
  reset(); await run("avancarOC({id:'1',situacao:'enviada'},'confirmada')"); assert.equal(run('gravacoes.length'), 0);
});
await test('Pular data explicitamente confirma sem inventar prazo', async () => {
  reset(); run("retornoData='' "); await run("avancarOC({id:'1',situacao:'enviada'},'confirmada')");
  assert.equal(run('gravacoes[0].registro.situacao'), 'confirmada'); assert.equal(run('gravacoes[0].registro.entregaPrevista'), undefined);
});
await test('Confirmar data preserva a data informada', async () => {
  reset(); run("retornoData='2026-10-09'"); await run("avancarOC({id:'1',situacao:'enviada'},'confirmada')"); assert.equal(run('gravacoes[0].registro.entregaPrevista'), '2026-10-09');
});
await test('Voltar na nota fiscal não marca trânsito', async () => {
  reset(); await run("avancarOC({id:'1',situacao:'confirmada'},'transito')"); assert.equal(run('gravacoes.length'), 0);
});
await test('Confirmar saída sem NF avança uma única vez', async () => {
  reset(); run("retornoTexto=''"); await run("avancarOC({id:'1',situacao:'confirmada'},'transito')"); assert.equal(run('gravacoes.length'), 1); assert.equal(run('gravacoes[0].registro.situacao'), 'transito');
});
await test('Confirmar saída com NF preserva o número', async () => {
  reset(); run("retornoTexto='NF 231'"); await run("avancarOC({id:'1',situacao:'confirmada'},'transito')"); assert.equal(run('gravacoes[0].registro.nf'), 'NF 231');
});
await test('Popup bloqueado não registra envio', async () => {
  reset(); run('popup=null;retornoConfirmar=true'); await run("enviarOCWhats({id:'1',situacao:'emitida'},'https://example.test/oc')"); assert.equal(run('gravacoes.length'), 0); assert.equal(run('confirmacoes.length'), 0);
});
await test('Abrir WhatsApp e desistir não registra envio', async () => {
  reset(); await run("enviarOCWhats({id:'1',situacao:'rascunho'},'https://example.test/oc')"); assert.equal(run('gravacoes.length'), 0); assert.equal(run('confirmacoes[0].opcoes.ok'), 'Confirmei o envio');
});
await test('Confirmação explícita registra envio e preserva campos atuais', async () => {
  reset(); run("retornoConfirmar=true;atual={id:'1',situacao:'emitida',frete:80}");
  await run("enviarOCWhats({id:'1',situacao:'rascunho',frete:10},'https://example.test/oc')");
  assert.equal(run('gravacoes.length'), 1); assert.equal(run('gravacoes[0].registro.situacao'), 'enviada'); assert.equal(run('gravacoes[0].registro.frete'), 80);
});
await test('Ordem cancelada durante WhatsApp não é reaberta', async () => {
  reset(); run("retornoConfirmar=true;atual={id:'1',situacao:'cancelada'}");
  await run("enviarOCWhats({id:'1',situacao:'emitida'},'https://example.test/oc')"); assert.equal(run('gravacoes.length'), 0);
});
await test('Cobrança não confirmada não aparece como enviada', async () => {
  reset(); await run("cobrarAtrasoZap({id:'1',entregaPrevista:'2026-10-01'})"); assert.equal(run('gravacoes.length'), 0);
});
await test('Busca ignora acentos e encontra campos da operação', () => {
  assert.equal(run("correspondeBuscaOC({fornecedor:{nome:'Comercial Matão'},itens:[]},'matao')"), true);
  assert.equal(run("correspondeBuscaOC({os:{numero:'22826'},itens:[]},'22826')"), true);
  assert.equal(run("correspondeBuscaOC({itens:[{descricao:'Aço galvanizado'}]},'aco')"), true);
});
await test('Busca não retorna tokens e histórico invisível', () => {
  assert.equal(run("correspondeBuscaOC({tokenPublico:'confidencial',historico:[{o_que:'cancelamento XPTO'}]},'confidencial')"), false);
  assert.equal(run("correspondeBuscaOC({historico:[{o_que:'cancelamento XPTO'}]},'XPTO')"), false);
});
await test('Matriz e filial de CNPJs diferentes não são fundidas', () => {
  assert.equal(run("correspondenciaFornecedorMubi({idMubi:'2',cnpj:'12.123.123/0002-11'},[{id:'1',origemMubi:'1',cnpj:'12.123.123/0001-11'}])"), null);
});
await test('Cadastros duplicados não são escolhidos por nome', () => {
  assert.throws(() => run("correspondenciaFornecedorMubi({idMubi:'2',cnpj:'123'},[{id:'1',cnpj:'123'},{id:'2',cnpj:'123'}])"), /mais de um cadastro/);
});
await test('Recebimento começa vazio e informa o saldo correto', () => {
  const html = run("htmlItensRecebimento({itens:[{id:'a',descricao:'ACM <teste>',qtd:10,unid:'chapa'}],recebimentos:[{itens:[{itemId:'a',qtd:4}]}]})");
  assert.match(html, /value=""/); assert.match(html, /data-saldo="6"/); assert.match(html, /ACM &lt;teste&gt;/);
  assert(!html.includes('<table')); assert.match(html, /aria-label="Chegou agora:/);
});
await test('Saldo já quitado não gera quantidade negativa', () => {
  assert.match(run("htmlItensRecebimento({itens:[{id:'a',qtd:2}],recebimentos:[{itens:[{itemId:'a',qtd:3}]}]})"), /data-saldo="0"/);
});

// Liga o evento real do editor de itens a controles mínimos; simula a alteração
// editorial e a decisão sobre unidade incompatível sem depender do browser.
run(`
  function controle(nome, valor) { return {dataset:{i:nome}, value:valor, options:[{value:valor}], ev:{}, addEventListener(n,f){(this.ev[n] ||= []).push(f)},setAttribute(){}, add(o){this.options.push(o)} }; }
  var controles, linha, caixa;
  function prepararItem() {
    controles={materialId:controle('materialId','m1'),unid:controle('unid','m2'),descricao:controle('descricao','Chapa'),qtd:controle('qtd','1')};
    linha={dataset:{id:'i1',origemScId:'s1',origemScItemId:'si1',nomeFornecedor:'Chapa',codigoFornecedor:'F1'},querySelector(s){const n=s.match(/data-i=([^\\]]+)/)?.[1];return controles[n] || null;},querySelectorAll(){return Object.values(controles)}};
    caixa={children:[linha],dataset:{},querySelectorAll(){return [linha]}};
    S.reg.mat=[{id:'m1',unidade:'m2',nome:'Chapa'}];
    ligarRotulosRede=()=>{}; associarRotulosUI=()=>{}; ligarItens(caixa,false);
  }
`);
await test('Editar descrição preserva material e origem da solicitação', async () => {
  reset(); run("prepararItem();controles.descricao.value='Chapa — acabamento fosco'");
  for (const fn of run("controles.descricao.ev.input || []")) await fn();
  assert.equal(run('controles.materialId.value'), 'm1'); assert.equal(run('lerItens(caixa,false)[0].origemScItemId'), 'si1');
});
await test('Cancelar troca de unidade preserva o vínculo', async () => {
  reset(); run("prepararItem();controles.unid.value='un'");
  for (const fn of run('controles.unid.ev.change')) await fn();
  assert.equal(run('controles.materialId.value'), 'm1'); assert.equal(run('controles.unid.value'), 'm2');
});
await test('Trocar unidade exige decisão e passa a descrição livre', async () => {
  reset(); run("prepararItem();retornoConfirmar=true;controles.unid.value='un'");
  for (const fn of run('controles.unid.ev.change')) await fn();
  assert.equal(run('controles.materialId.value'), ''); assert.equal(run('controles.unid.value'), 'un'); assert.equal(run('linha.dataset.codigoFornecedor'), '');
});
run(`
  var scTeste;
  function prepararSaldo() {
    scTeste = {id:'sc1',situacao:'em_compra',ocIds:['oc1'],itens:[{id:'i1',descricao:'ACM',qtd:10,unid:'chapa'},{id:'i2',descricao:'Parafuso',qtd:20,unid:'un'}]};
    S.reg.sc=[scTeste]; S.reg.oc=[{id:'oc1',scIds:['sc1'],situacao:'confirmada',itens:[{id:'a',origemScId:'sc1',origemScItemId:'i1',qtd:4}],recebimentos:[]}];
  }
`);
await test('Compra parcial deixa saldo por item, sem copiar o que já foi comprometido', () => {
  reset(); run('prepararSaldo()');
  assert.equal(run('itensPendentesSC(scTeste)[0].qtd'), 6);
  assert.equal(run('itensPendentesSC(scTeste)[1].qtd'), 20);
  assert.equal(run('itensPendentesSC(scTeste)[0].origemScItemId'), 'i1');
});
await test('Itens com mesmo texto não são unidos sem identidade', () => {
  reset(); run("prepararSaldo();S.reg.oc[0].itens=[{id:'outro',descricao:'ACM',qtd:10}]");
  assert.equal(run('saldoScPorItem(scTeste)[0].comprado'), 0);
});
await test('Item legado com ID exato e solicitação vinculada é reconhecido', () => {
  reset(); run("prepararSaldo();S.reg.oc[0].itens=[{id:'i1',qtd:7}]");
  assert.equal(run('itensPendentesSC(scTeste)[0].qtd'), 3);
});
await test('Mesmo ID em outra solicitação não reduz o saldo', () => {
  reset(); run("prepararSaldo();S.reg.oc[0].scIds=['outra'];S.reg.oc[0].itens=[{id:'i1',qtd:10}]");
  assert.equal(run('saldoScPorItem(scTeste)[0].comprado'), 0);
});
await test('Cancelamento de OC devolve os itens para compra', () => {
  reset(); run("prepararSaldo();S.reg.oc[0].situacao='cancelada'"); assert.equal(run('itensPendentesSC(scTeste)[0].qtd'), 10);
});
await test('Encerramento com falta mantém saldo para nova compra', () => {
  reset(); run("prepararSaldo();S.reg.oc[0].situacao='entregue';S.reg.oc[0].recebimentos=[{itens:[{itemId:'a',qtd:3}]}]");
  assert.equal(run('itensPendentesSC(scTeste)[0].qtd'), 7);
});
await test('Uma ordem entregue não encerra solicitação com item nunca comprado', () => {
  reset(); run("prepararSaldo();S.reg.oc[0].situacao='entregue';S.reg.oc[0].recebimentos=[{itens:[{itemId:'a',qtd:4}]}];recalcularSC('sc1','teste')");
  assert.equal(run('gravacoes.length'), 0); // continua em_compra, já era o estado anterior
});
await test('Solicitação atendida reabre após remover sua única compra', () => {
  reset(); run("prepararSaldo();scTeste.situacao='atendida';S.reg.oc=[];recalcularSC('sc1','teste')");
  assert.equal(run('gravacoes[0].registro.situacao'), 'aprovada');
});
await test('Solicitação só vira atendida quando todos os itens têm recebimento', () => {
  reset(); run("prepararSaldo();S.reg.oc[0].itens=[{id:'i1',qtd:10},{id:'i2',qtd:20}];S.reg.oc[0].recebimentos=[{itens:[{itemId:'i1',qtd:10},{itemId:'i2',qtd:20}]}];recalcularSC('sc1','teste')");
  assert.equal(run('gravacoes[0].registro.situacao'), 'atendida');
});
await test('Unidades divergentes não abatem o saldo nem encerram a solicitação', () => {
  reset(); run("prepararSaldo();S.reg.oc[0].itens[0].unid='m2';S.reg.oc[0].recebimentos=[{itens:[{itemId:'a',qtd:10}]}]");
  assert.equal(run('saldoScPorItem(scTeste)[0].comprado'), 0); assert.equal(run('saldoScPorItem(scTeste)[0].recebido'), 0);
});
await test('Unidades só normalizam caixa e espaços; não inferem conversão', () => {
  assert.equal(run("unidadesCompativeisSaldo(' UN ', 'un')"), true);
  assert.equal(run("unidadesCompativeisSaldo('m²', 'm2')"), false);
});
console.log(`${passed} verificações da auditoria de formulários passaram`);
