// Regressões dos cenários adversariais pós-publicação; sem rede/banco reais.
import assert from 'node:assert/strict';
import { servidor, oc, obra } from './backend-auditoria.mjs';
const nucleo='supabase/functions/compras-nucleo/index.ts', acervo='supabase/functions/compras-acervo/index.ts';
let n=0;
async function test(nome,fn){await fn();console.log('✓ pós-v18 '+nome);n++;}
const sc={id:'s1',situacao:'aprovada',itens:[{id:'i1',qtd:10,unid:'un'}],ocIds:[]};
const order=(id,qtd=10)=>({...oc,id,situacao:'rascunho',scIds:['s1'],itens:[{id:'i1',qtd,preco:10,unid:'un',origemScId:'s1',origemScItemId:'i1'}]});
const cot=(id,extra={})=>({id,situacao:'aberta',itens:[{id:'i1',qtd:10,unid:'un'}],fornecedores:[],...extra});
await test('rascunho não vira entregue pelo solicitante',async()=>{
 const h=servidor(nucleo,{'oc/o1':{...oc,situacao:'rascunho'}},'obra');const r=await(await h.call({action:'salvarLote',itens:[{colecao:'oc',registro:{id:'o1',situacao:'entregue'}}]})).json();assert.equal(r.salvos.length,0);assert.equal(h.records.get('oc/o1').situacao,'rascunho');
});
for(const patch of [{apagadoEm:'2026-10-05T12:00:00Z'},{ocIds:['o1']},{cotIds:['c1']},{numero:123},{aprovadaEm:'2026-10-05T12:00:00Z'}]) await test('SC recusa campo protegido '+Object.keys(patch)[0],async()=>{
 const old={...sc,situacao:'nova'};const h=servidor(nucleo,{'sc/s1':old},'obra');const r=await(await h.call({action:'salvarLote',itens:[{colecao:'sc',registro:{...old,...patch}}]})).json();assert.equal(r.salvos.length,0);assert.deepEqual(h.records.get('sc/s1'),old);
});
await test('SC nova normal aceita metadados locais e guarda autoria do servidor',async()=>{
 const h=servidor(nucleo,{},'obra');const r=await(await h.call({action:'salvarLote',itens:[{colecao:'sc',registro:{...sc,situacao:'nova',criadoEm:'2000-01-01',criadoPor:'forjado'}}]})).json();assert.equal(r.recusados.length,0);assert.equal(h.records.get('sc/s1').criadoPor,'Obra');assert.notEqual(h.records.get('sc/s1').criadoEm,'2000-01-01');
});
await test('mascara seguro/DIFAL e repõe valores durante recebimento',async()=>{
 const old={...oc,seguro:5,difalValor:12};const h=servidor(nucleo,{'oc/o1':old},'obra');const r=await(await h.call({action:'salvarLote',itens:[{colecao:'oc',registro:{id:'o1',_operacao:'recebimento',recebimentos:[{id:'r1',itens:[{itemId:'i1',qtd:2}]}]}}]})).json();assert.equal(r.salvos[0].seguro,undefined);assert.equal(r.salvos[0].difalValor,undefined);assert.equal(h.records.get('oc/o1').seguro,5);assert.equal(h.records.get('oc/o1').difalValor,12);
});
await test('leitura pendente só pelo dono; compartilhado finalizado continua legível',async()=>{
 const h=servidor(acervo,{'_arqmeta/a1':{id:'a1',pronto:false,donoId:'outro',partes:1,tamanho:3}},'obra');h.chunks.set('a1/p0',new TextEncoder().encode('ABC'));for(const action of ['meta','baixarParte'])assert.equal((await h.call({action,id:'a1',i:0})).status,403);h.records.get('_arqmeta/a1').donoId='u1';assert.equal((await h.call({action:'baixarParte',id:'a1',i:0})).status,200);h.records.get('_arqmeta/a1').donoId='outro';h.records.get('_arqmeta/a1').pronto=true;assert.equal((await h.call({action:'baixarParte',id:'a1',i:0})).status,200);
});
await test('duas OCs de IDs distintos disputam atomicamente a mesma SC',async()=>{
 const h=servidor(nucleo,{'sc/s1':sc});const rr=await Promise.allSettled([h.ctx.gravar('oc',order('o1'),'A'),h.ctx.gravar('oc',order('o2'),'B')]);assert.equal(rr.filter(x=>x.status==='fulfilled').length,1);assert.equal([...h.records.keys()].filter(k=>k.startsWith('oc/')).length,1);assert.match(rr.find(x=>x.status==='rejected').reason.message,/saldo/);
});
await test('cotação antiga não recompra saldo consumido por OC direta',async()=>{
 const h=servidor(nucleo,{'sc/s1':sc,'oc/direta':order('direta'),'cot/c1':cot('c1',{scIds:['s1']})});await assert.rejects(()=>h.ctx.gravar('oc',{...order('cot-c1'),cotacaoId:'c1'},'B'),/saldo/);
});
await test('redução da SC antes da decisão invalida quantidade antiga',async()=>{
 const h=servidor(nucleo,{'sc/s1':{...sc,itens:[{...sc.itens[0],qtd:3}]}});await assert.rejects(()=>h.ctx.gravar('oc',order('o1'),'A'),/saldo/);
});
await test('reduzir SC abaixo do comprometido é recusado',async()=>{
 const h=servidor(nucleo,{'sc/s1':sc,'oc/o1':order('o1')});await assert.rejects(()=>h.ctx.gravar('sc',{...sc,itens:[{...sc.itens[0],qtd:3}]},'A'),/saldo/);
});
await test('duas cotações-filhas abertas da mesma família são recusadas atomicamente',async()=>{
 const h=servidor(nucleo,{'cot/raiz':cot('raiz',{situacao:'aprovada'})});const rr=await Promise.allSettled(['a','b'].map(id=>h.ctx.gravar('cot',cot(id,{cotacaoOrigemId:'raiz'}),'A')));assert.equal(rr.filter(x=>x.status==='fulfilled').length,1);assert.match(rr.find(x=>x.status==='rejected').reason.message,/já existe/i);
});
await test('família sem SC impede duas ordens excedendo raiz',async()=>{
 const h=servidor(nucleo,{'cot/raiz':cot('raiz',{situacao:'aprovada'}),'cot/a':cot('a',{cotacaoOrigemId:'raiz'}),'cot/b':cot('b',{cotacaoOrigemId:'raiz'})});const rr=await Promise.allSettled(['a','b'].map(id=>h.ctx.gravar('oc',{...oc,id:'cot-'+id,cotacaoId:id,situacao:'rascunho',itens:[{id:'i1',qtd:10,unid:'un',preco:1}]},'A')));assert.equal(rr.filter(x=>x.status==='fulfilled').length,1);assert.match(rr.find(x=>x.status==='rejected').reason.message,/saldo.*família/);
});
await test('recebimento específico preserva pedido atual de15 ante snapshot10',async()=>{
 const atual={...oc,itens:[{...oc.itens[0],qtd:15}],versao:1};const h=servidor(nucleo,{'oc/o1':atual});await h.ctx.gravar('oc',{...oc,_operacao:'recebimento',recebimentos:[{id:'r1',itens:[{itemId:'i1',qtd:10}]}]},'A');const got=h.records.get('oc/o1');assert.equal(got.itens[0].qtd,15);assert.equal(got.situacao,'parcial');assert.equal(got.recebimentos.length,1);
});
await test('cliente antigo com snapshot divergente é recusado sem sobrescrever',async()=>{
 const atual={...oc,itens:[{...oc.itens[0],qtd:15}],versao:1};const h=servidor(nucleo,{'oc/o1':atual});await assert.rejects(()=>h.ctx.gravar('oc',{...oc,recebimentos:[{id:'r1',itens:[{itemId:'i1',qtd:10}]}]},'A'),/mudou desde/);assert.deepEqual(h.records.get('oc/o1'),atual);
});
await test('base atual permite editar; base antiga não reverte alteração posterior',async()=>{
 const h=servidor(nucleo,{'oc/o1':oc});await h.ctx.gravar('oc',{...oc,_versaoBase:0,itens:[{...oc.itens[0],qtd:15}]},'A');assert.equal(h.records.get('oc/o1').versao,1);await assert.rejects(()=>h.ctx.gravar('oc',{...oc,_versaoBase:0},'B'),/mudou desde/);assert.equal(h.records.get('oc/o1').itens[0].qtd,15);
});
for(const patch of [{unid:'kg'},{materialId:'outro'},{origemScId:'s2'}])await test('identidade de item recebido é imutável: '+Object.keys(patch)[0],async()=>{
 const old={...oc,situacao:'parcial',itens:[{...oc.itens[0],unid:'un'}],recebimentos:[{id:'r',itens:[{itemId:'i1',qtd:4}]}]};const h=servidor(nucleo,{'oc/o1':old});await assert.rejects(()=>h.ctx.gravar('oc',{...old,_versaoBase:0,itens:[{...old.itens[0],...patch}]},'A'),/identidade/);
});
await test('cancelar parcial é recusado; encerrar com falta libera só saldo6',async()=>{
 const old={...order('o1'),situacao:'parcial',recebimentos:[{id:'r',itens:[{itemId:'i1',qtd:4}]}]};const h=servidor(nucleo,{'sc/s1':sc,'oc/o1':old});await assert.rejects(()=>h.ctx.gravar('oc',{...old,situacao:'cancelada'},'A'),/Encerrar com falta/);await h.ctx.gravar('oc',{...old,situacao:'entregue',encerradaComFalta:'Fornecedor sem estoque'},'A');await h.ctx.gravar('oc',order('o2',6),'A');assert.equal(h.records.get('oc/o1').recebimentos[0].itens[0].qtd,4);await assert.rejects(()=>h.ctx.gravar('oc',order('o3',1),'A'),/saldo/);
});
await test('excedente registrado atende SC no máximo da quantidade OC',async()=>{
 const old={...order('o1',5),situacao:'confirmada'};const h=servidor(nucleo,{'sc/s1':sc,'oc/o1':old});await h.ctx.gravar('oc',{...old,_operacao:'recebimento',recebimentos:[{id:'r',itens:[{itemId:'i1',qtd:10}]}]},'A');const got=h.records.get('oc/o1');assert.equal(got.recebimentos[0].itens[0].qtd,10);assert.equal(h.ctx.saldoSolicitacao(sc,[got])[0].saldo,5);assert.equal(h.records.get('sc/s1').situacao,'em_compra');
});
await test('recebimento novo não usa unidade antiga após troca antes da entrega',async()=>{
 const atual={...oc,itens:[{...oc.itens[0],unid:'kg'}],versao:1};const h=servidor(nucleo,{'oc/o1':atual});await assert.rejects(()=>h.ctx.gravar('oc',{...oc,_operacao:'recebimento',recebimentos:[{id:'r',itens:[{itemId:'i1',qtd:4,unid:'un'}]}]},'A'),/unidade.*mudou/);assert.equal(h.records.get('oc/o1').recebimentos.length,0);
});
await test('troca da identidade SC não remove compromisso existente',async()=>{
 const h=servidor(nucleo,{'sc/s1':sc,'oc/o1':order('o1')});await assert.rejects(()=>h.ctx.gravar('sc',{...sc,itens:[{...sc.itens[0],unid:'kg'}]},'A'),/identidade/);
});
await test('recalcular SC repete snapshot se outra ordem muda durante CAS',async()=>{
 const o={...order('o1'),situacao:'confirmada'}, segunda={...order('o2',2),itens:[{id:'i2',qtd:2,unid:'un',preco:10,origemScId:'s1',origemScItemId:'i2'}]};
 const pedido={...sc,situacao:'em_compra',itens:[...sc.itens,{id:'i2',qtd:2,unid:'un'}]};const h=servidor(nucleo,{'sc/s1':pedido,'oc/o1':o});const rpc=h.ctx.db.rpc;let mudou=false;
 h.ctx.db.rpc=async(name,p)=>{if(name==='compras_gravar_contexto'&&p.p_colecao==='sc'&&!mudou){mudou=true;h.records.set('oc/o2',segunda);}return rpc(name,p);};
 await h.ctx.gravar('oc',{...o,_operacao:'recebimento',recebimentos:[{id:'r',itens:[{itemId:'i1',qtd:10,unid:'un'}]}]},'A');assert.equal(h.records.get('sc/s1').situacao,'em_compra');
});
await test('edição normal de SC nova mantém código e autoria protegidos',async()=>{
 const old={...sc,situacao:'nova',codigo:'SC-001',numero:1,criadoEm:'2026-10-01',criadoPor:'Equipe'};const h=servidor(nucleo,{'sc/s1':old},'obra');const r=await(await h.call({action:'salvarLote',itens:[{colecao:'sc',registro:{...old,justificativa:'Material para instalação',itens:[{...sc.itens[0],qtd:12}]}}]})).json();assert.equal(r.recusados.length,0);assert.equal(h.records.get('sc/s1').itens[0].qtd,12);assert.equal(h.records.get('sc/s1').criadoPor,'Equipe');
});
await test('retry de criação OC com metadados locais é idempotente após perda do ACK',async()=>{
 const h=servidor(nucleo);const novo={...oc,id:'nova',situacao:'rascunho',criadoEm:'2026-10-01',criadoPor:'Local'};await h.ctx.gravar('oc',novo,'Diretor');const criado=h.records.get('oc/nova').criadoEm;await h.ctx.gravar('oc',novo,'Diretor');assert.equal(h.records.get('oc/nova').criadoEm,criado);assert.equal(h.records.get('oc/nova').criadoPor,'Diretor');
});
await test('cotação-filha também limita sua própria quantidade',async()=>{
 const h=servidor(nucleo,{'cot/raiz':cot('raiz',{situacao:'aprovada'}),'cot/filha':cot('filha',{cotacaoOrigemId:'raiz',itens:[{id:'i1',qtd:3,unid:'un'}]})});await assert.rejects(()=>h.ctx.gravar('oc',{...oc,id:'cot-filha',cotacaoId:'filha',situacao:'rascunho',itens:[{id:'i1',qtd:4,unid:'un',preco:1}]},'A'),/saldo.*família/);
});
await test('restaurar OC antiga não duplica saldo já recomprado',async()=>{
 const h=servidor(nucleo,{'sc/s1':sc,'oc/atual':order('atual'),'oc/antiga':{...order('antiga'),apagadoEm:'2026-10-01'}});const r=await h.call({action:'restaurarItem',colecao:'oc',id:'antiga'});assert.equal(r.status,400);assert(h.records.get('oc/antiga').apagadoEm);
});
await test('origem explícita de item atualiza SC mesmo sem scIds no cabeçalho',async()=>{
 const old={...order('o1'),scIds:[],situacao:'confirmada'};const h=servidor(nucleo,{'sc/s1':sc,'oc/o1':old});await h.ctx.gravar('oc',{...old,_operacao:'recebimento',recebimentos:[{id:'r',itens:[{itemId:'i1',qtd:10,unid:'un'}]}]},'A');assert.equal(h.records.get('sc/s1').situacao,'atendida');
});
for (const perfil of ['obra','escritorio']) for (const referenciasErp of [[],[{id:'erp1',numero:'OC-ERP-101'}]]) await test('recebimento preserva ERP para '+perfil+' com '+referenciasErp.length+' referência(s)',async()=>{
 const atual={...oc,referenciasErp};const h=servidor(nucleo,{'oc/o1':atual},perfil);
 const enviar=registro=>h.call({action:'salvarLote',itens:[{colecao:'oc',registro}]}).then(r=>r.json());
 const r=await enviar({...atual,_operacao:'recebimento',recebimentos:[{id:'r1',itens:[{itemId:'i1',qtd:4}]}]});
 assert.equal(r.salvos.length,1,JSON.stringify(r.recusados));assert.equal(r.recusados.length,0);assert.equal(h.records.get('oc/o1').situacao,'parcial');assert.deepEqual(h.records.get('oc/o1').referenciasErp,referenciasErp);
 const indevida=await enviar({...h.records.get('oc/o1'),_versaoBase:h.records.get('oc/o1').versao,referenciasErp:[{id:'injetada'}]});assert.equal(indevida.salvos.length,0);assert.match(indevida.recusados[0].motivo,/referências do ERP/);
 const recebimento=await enviar({...atual,_operacao:'recebimento',referenciasErp:[{id:'injetada'}],recebimentos:[{id:'r2',itens:[{itemId:'i1',qtd:2}]}]});assert.equal(recebimento.salvos.length,1);assert.deepEqual(h.records.get('oc/o1').referenciasErp,referenciasErp);assert.equal(h.records.get('oc/o1').recebimentos.length,2);
});
await test('referência ERP concorrente é preservada na nova tentativa de recebimento',async()=>{
 const atual={...oc,referenciasErp:[]};const h=servidor(nucleo,{'oc/o1':atual},'escritorio');const rpc=h.ctx.db.rpc;let mudou=false;
 h.ctx.db.rpc=async(name,p)=>{if(name==='compras_gravar_contexto'&&!mudou){mudou=true;h.records.set('oc/o1',{...atual,referenciasErp:[{id:'erp-nova'}]});}return rpc(name,p);};
 const r=await(await h.call({action:'salvarLote',itens:[{colecao:'oc',registro:{...atual,_operacao:'recebimento',recebimentos:[{id:'r1',itens:[{itemId:'i1',qtd:4}]}]}}]})).json();assert.equal(r.salvos.length,1);assert.deepEqual(h.records.get('oc/o1').referenciasErp,[{id:'erp-nova'}]);assert.equal(h.records.get('oc/o1').recebimentos.length,1);
});
console.log(`${n} regressões adicionais pós-v18 passaram`);
