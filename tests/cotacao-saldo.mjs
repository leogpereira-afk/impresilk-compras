import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const dom = new JSDOM('<body><main></main></body>',{runScripts:'outside-only',url:'https://test.invalid/'});
const w=dom.window;
w.S={cfg:{obras:[],unidades:['un']},reg:{},quem:'Teste',_catalogo:{produtos:[]}};
w.eval(['ui.js','qualificacao.js','compras.js','rede.js','cotacao.js'].map(f=>readFileSync(f,'utf8')).join('\n'));
w.lista=c=>w.S.reg[c]||[];w.achar=(c,id)=>w.lista(c).find(x=>x.id===id);w.podeVer=()=>false;
w.hojeISO=()=> '2026-10-05';w.toast=()=>{};w.irPara=r=>{w.destino=r;};w.historiar=(r,t)=>[...(r.historico||[]),{o_que:t}];
let modal,aberturas=0,gravacoes=0;
w.abrirModal=opcoes=>{const fundo=w.document.createElement('div');fundo.innerHTML=opcoes.corpo;w.document.body.appendChild(fundo);modal={opcoes,fundo};aberturas++;return fundo;};
w.fecharEste=f=>{f.remove();modal.opcoes.aoFechar?.();};w.fecharModal=()=>w.fecharEste(modal.fundo);
w.salvar=(c,r)=>{gravacoes++;const arr=w.S.reg[c]||=[];const reg={...r,id:r.id||'nova'+gravacoes};const i=arr.findIndex(x=>x.id===reg.id);if(i<0)arr.push(reg);else arr[i]=reg;return reg;};
function iniciar(){w.S.reg={cot:[{id:'c1',codigo:'CT1',situacao:'aprovada',scIds:[],itens:[{id:'a',descricao:'ACM',qtd:2,unid:'un'},{id:'b',descricao:'Parafuso',qtd:3,unid:'un'}]}],oc:[{id:'o1',cotacaoId:'c1',situacao:'confirmada',itens:[{id:'a',qtd:2}]}]};w.destino='';}
const origem=()=>w.S.reg.cot[0];
let checks=0;async function test(nome,fn){await fn();checks++;console.log('✓ '+nome);}
await test('Cotação direta parcial mantém apenas o item não comprado',()=>{iniciar();const i=w.itensPendentesCotacao(origem());assert.equal(i.length,1);assert.equal(i[0].id,'b');assert.equal(i[0].qtd,3);});
await test('Compras de cotação-filha reduzem saldo da cotação original',()=>{iniciar();w.S.reg.cot.push({id:'c2',cotacaoOrigemId:'c1',situacao:'aprovada'});w.S.reg.oc.push({id:'o2',cotacaoId:'c2',situacao:'confirmada',itens:[{id:'b',qtd:2}]});assert.equal(w.itensPendentesCotacao(origem())[0].qtd,1);});
await test('Descrição igual com outro ID não abate saldo',()=>{iniciar();w.S.reg.oc.push({id:'o2',cotacaoId:'c1',situacao:'confirmada',itens:[{id:'x',descricao:'Parafuso',qtd:3}]});assert.equal(w.itensPendentesCotacao(origem())[0].qtd,3);});
await test('Cancelamento devolve item comprado à lista de pendências',()=>{iniciar();w.S.reg.oc[0].situacao='cancelada';assert.equal(w.itensPendentesCotacao(origem()).length,2);});
await test('Saldo de SC comprado por outro fluxo não é duplicado pela cotação',()=>{iniciar();origem().scIds=['s1'];w.S.reg.sc=[{id:'s1',itens:[{id:'b',qtd:3}]}];w.S.reg.oc.push({id:'o2',scIds:['s1'],situacao:'confirmada',itens:[{id:'b',qtd:3}]});assert.equal(w.itensPendentesCotacao(origem()).length,0);});
await test('Abrir o mesmo saldo duas vezes não empilha formulários',()=>{iniciar();const antes=aberturas;w.abrirNovaCotacao(null,[],{cotacaoOrigem:origem()});w.abrirNovaCotacao(null,[],{cotacaoOrigem:origem()});assert.equal(aberturas-antes,1);w.fecharModal();});
await test('Cancelar o rascunho permite abrir novamente sem criar registros',()=>{iniciar();const antes=gravacoes;w.abrirNovaCotacao(null,[],{cotacaoOrigem:origem()});w.fecharModal();w.abrirNovaCotacao(null,[],{cotacaoOrigem:origem()});assert.equal(gravacoes,antes);w.fecharModal();});
await test('Salvar o saldo preserva origem e reabrir leva à cotação existente',()=>{iniciar();w.abrirNovaCotacao(null,[],{cotacaoOrigem:origem()});modal.opcoes.acoes[1].aoClicar(modal.fundo);const filha=w.S.reg.cot.find(c=>c.cotacaoOrigemId==='c1');assert(filha);assert.equal(filha.itens.length,1);assert.equal(filha.itens[0].id,'b');assert.match(filha.historico[0].o_que,/saldo da CT1/);const antes=aberturas;w.abrirNovaCotacao(null,[],{cotacaoOrigem:origem()});assert.equal(aberturas,antes);assert.equal(w.destino,'cotacoes/'+filha.id);});
await test('Nova compra durante preenchimento impede salvar saldo desatualizado',()=>{iniciar();w.abrirNovaCotacao(null,[],{cotacaoOrigem:origem()});w.S.reg.oc.push({id:'o2',cotacaoId:'c1',situacao:'confirmada',itens:[{id:'b',qtd:3}]});const antes=gravacoes;modal.opcoes.acoes[1].aoClicar(modal.fundo);assert.equal(gravacoes,antes);w.fecharModal();});
await test('Compra em unidade diferente não reduz saldo da cotação',()=>{iniciar();w.S.reg.oc[0].itens[0].unid='m2';assert.equal(w.itensPendentesCotacao(origem()).length,2);});
console.log(`${checks} verificações de cotação do saldo passaram`);
