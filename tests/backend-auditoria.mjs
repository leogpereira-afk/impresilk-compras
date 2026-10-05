import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
let count=0, failures=0;
async function test(name,fn){try{await fn();count++;console.log('✓ '+name);}catch(e){failures++;console.error('✗ '+name+': '+e.message);}}
function code(file){return stripTypeScriptTypes(readFileSync(file,'utf8')).replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,'').replace(/\bexport /g,'');}
function context(extra={}){return vm.createContext({console,TextEncoder,TextDecoder,URL,Uint8Array,crypto,atob,btoa,Request,Response,Deno:{env:{get:k=>({COMPRAS_TOKEN:'test',EQUIPE_JWT_SECRET:'test'}[k]||'')},serve(){}},...extra});}
const access=context({createClient:()=>({rpc:async()=>({data:false})})});
vm.runInContext(code('supabase/functions/_shared/acesso.ts'),access);
const run=s=>vm.runInContext(s,access);
const obra={id:'u1',nome:'Obra',perfil:'obra',proprio:true};
const oc={id:'o1',situacao:'confirmada',itens:[{id:'i1',qtd:10,preco:10}],recebimentos:[],total:100,tokenPublico:'private',dadosBancarios:'bank'};
access.obra=obra;access.oc=clone(oc);
await test('solicitante não cria OC',()=>assert.match(run("motivoRecusa(obra,'oc',{id:'nova',situacao:'emitida'},null)"),/solicitante/i));
await test('solicitante não cancela OC',()=>assert.match(run("motivoRecusa(obra,'oc',{id:'o1',situacao:'cancelada'},oc)"),/solicitante/i));
await test('leitura sem preço também oculta token público e banco',()=>{const r=run("filtrarLeitura(obra,[{...oc,_col:'oc'}])[0]");assert.equal(r.tokenPublico,undefined);assert.equal(r.dadosBancarios,undefined);assert.equal(r.total,undefined);});
await test('solicitante não modifica recebimento antigo',()=>assert(run("motivoRecusa(obra,'oc',{id:'o1',recebimentos:[{id:'r1',itens:[{itemId:'i1',qtd:9}]}]}, {...oc,recebimentos:[{id:'r1',itens:[{itemId:'i1',qtd:2}]}]})")));
// Handlers reais; apenas rede, persistência e identidade são simuladas.
function servidor(file,seed={},perfil='direcao'){
  const records=new Map(Object.entries(clone(seed)));let handler;
  const chunks=new Map();let rpcCalls=0;
  const hash=()=>JSON.stringify([...records].filter(([k])=>['sc','oc','cot'].includes(k.split('/')[0])).sort(([a],[b])=>a.localeCompare(b)));
  const db={rpc:async(name,p)=>{
    if(name==='compras_ler_contexto') return {data:{hash:hash(),registros:[...records].filter(([k])=>['sc','oc','cot'].includes(k.split('/')[0])).map(([k,v])=>({...clone(v),_col:k.split('/')[0]}))}};
    if(name==='compras_gravar_contexto' && p.p_contexto_hash!==hash())return {data:false};
    if(!['compras_gravar_se_atual','compras_gravar_contexto'].includes(name))return {data:false};
    rpcCalls++;const k=p.p_colecao+'/'+p.p_id,current=records.get(k)??null;
    if(JSON.stringify(current)!==JSON.stringify(p.p_esperado))return {data:false};
    records.set(k,clone(p.p_novo));return {data:true};
  }};
  const ctx=context({structuredClone,COLECOES:{sc:{pre:'SC'},oc:{pre:'OC'},cot:{pre:'CT'},forn:{pre:''}},
    db,agora:()=>new Date().toISOString(),idNovo:()=>crypto.randomUUID(),tokenCurto:()=>crypto.randomUUID(),
    lerUm:async(c,id)=>clone(records.get(c+'/'+id)??null),
    lerTudo:async(cols,all)=>[...records].filter(([k])=>(cols||all).includes(k.split('/')[0])).map(([k,v])=>({...clone(v),_col:k.split('/')[0]})),
    lerColecaoBruta:async(c)=>[...records].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({id:k.slice(c.length+1),registro:clone(v)})),
    gravarUm:async(c,id,r)=>{records.set(c+'/'+id,clone(r));},
    marcarMudanca:async()=>{},guardarIndiceNumero:async()=>{},proximoNumero:async()=>1,
    registrarLog:async()=>{},lerCfgBruta:async()=>({}),
    identificarPorCracha:async()=>({...obra,perfil}),
    ...Object.fromEntries(['cfgSemSegredo','podeFazer','motivoRecusa','reporEscondidos','filtrarLeitura','perfilDe'].map(k=>[k,run(k)])),
    validarRede:async()=>{},ErroRede:class ErroRede extends Error{},
    preflight:()=>null,json:(o,status=200)=>new Response(JSON.stringify(o),{status}),
    subirParte:async(k,b)=>{if(chunks.has(k))throw new Error('already exists');chunks.set(k,b);},
    baixarParte:async(k)=>chunks.get(k)??null,
  });
  ctx.Deno.serve=f=>{handler=f;};
  const dataCode=code('supabase/functions/_shared/dados.ts');
  const cas=dataCode.slice(dataCode.indexOf('async function atualizarRegistro('),dataCode.indexOf('// Todos os registros (com a lixeira'));
  if(cas)vm.runInContext(cas,ctx);
  vm.runInContext('Object.assign(globalThis, (()=>{'+code('supabase/functions/_shared/rede.ts')+';return {validarRede,ErroRede};})());',ctx);
  vm.runInContext(code('supabase/functions/_shared/integridade.ts'),ctx);
  vm.runInContext(code(file),ctx);
  return {ctx,records,chunks,rpcCalls:()=>rpcCalls,
    async call(body){return handler(new Request('https://test.invalid',{method:'POST',headers:{'content-type':'application/json','x-token':'test'},body:JSON.stringify(body)}));}};
}
const nucleo='supabase/functions/compras-nucleo/index.ts';
await test('dois recebimentos simultâneos preservam 4 + 6 e fecham OC',async()=>{
  const h=servidor(nucleo,{'oc/o1':oc});
  const rec=(id,qtd)=>({...oc,recebimentos:[{id,itens:[{itemId:'i1',qtd}]}]});
  await Promise.all([h.ctx.gravar('oc',rec('r1',4),'A'),h.ctx.gravar('oc',rec('r2',6),'B')]);
  const got=h.records.get('oc/o1');assert.equal(got.recebimentos.length,2);assert.equal(got.situacao,'entregue');
});
await test('cópia antiga não reverte frete público corrigido',()=>{
  const h=servidor(nucleo);const r=h.ctx.unirPorId([{id:'f1',frete:100,total:200,respondidoEm:'2026-10-05T10:00:00Z'}],[{id:'f1',frete:50,total:150,respondidoEm:'2026-10-05T09:00:00Z'}])[0];assert.equal(r.frete,100);assert.equal(r.total,200);
});
await test('retorno de salvarLote também mascara preços e token',async()=>{
  const h=servidor(nucleo,{'oc/o1':oc},'obra');const res=await h.call({action:'salvarLote',itens:[{colecao:'oc',registro:{id:'o1'}}]});const out=await res.json();assert.equal(res.status,200);assert.equal(out.salvos[0].total,undefined);assert.equal(out.salvos[0].tokenPublico,undefined);
});
await test('recebimento de apenas um item não fecha solicitação de dois',async()=>{
  const order={...oc,scIds:['s1'],itens:[{id:'a',qtd:1,preco:10}]};
  const h=servidor(nucleo,{'oc/o1':order,'sc/s1':{id:'s1',situacao:'em_compra',ocIds:['o1'],itens:[{id:'a',qtd:1},{id:'b',qtd:1}]}});
  await h.ctx.gravar('oc',{...order,recebimentos:[{id:'r1',itens:[{itemId:'a',qtd:1}]}]},'A');assert.equal(h.records.get('sc/s1').situacao,'em_compra');
});
await test('arquivo finalizado não aceita substituição de parte',async()=>{
  const h=servidor('supabase/functions/compras-acervo/index.ts',{'_arqmeta/a1':{id:'a1',pronto:true,partes:1,tamanho:3,donoId:'outro'}},'obra');const r=await h.call({action:'parte',id:'a1',i:0,dados:btoa('bad')});assert.equal(r.status,403);assert.equal(h.chunks.size,0);
});

await test('reenvio do mesmo recebimento é idempotente',async()=>{
  const h=servidor(nucleo,{'oc/o1':oc});const next={...oc,recebimentos:[{id:'r1',itens:[{itemId:'i1',qtd:4}]}]};
  await h.ctx.gravar('oc',next,'A');await h.ctx.gravar('oc',next,'A');assert.equal(h.records.get('oc/o1').recebimentos.length,1);assert.equal(h.records.get('oc/o1').situacao,'parcial');
});
await test('permissão é revalidada após disputa no banco',async()=>{
  const h=servidor(nucleo,{'oc/o1':oc},'obra');const rpc=h.ctx.db.rpc;let changed=false;
  h.ctx.db.rpc=async(name,p)=>{if(name==='compras_gravar_contexto'&&!changed){changed=true;h.records.set('oc/o1',{...oc,situacao:'cancelada'});}return rpc(name,p);};
  const r=await h.call({action:'salvarLote',itens:[{colecao:'oc',registro:{id:'o1',recebimentos:[{id:'r1',itens:[{itemId:'i1',qtd:1}]}],situacao:'parcial'}}]});
  const out=await r.json();assert.equal(out.salvos.length,0);assert.equal(out.recusados[0].id,'o1');assert.equal(out.recusados[0].colecao,'oc');assert.match(out.recusados[0].motivo,/cancelada/);assert.equal(h.records.get('oc/o1').recebimentos.length,0);
});
await test('solicitante recebe máscara, grava e preserva valores originais',async()=>{
  const h=servidor(nucleo,{'oc/o1':oc},'obra');const masked=access.filtrarLeitura(obra,[{...oc,_col:'oc'}])[0];
  masked.recebimentos=[{id:'r1',itens:[{itemId:'i1',qtd:4}]}];masked.situacao='parcial';
  const r=await h.call({action:'salvarLote',itens:[{colecao:'oc',registro:masked}]});const out=await r.json();assert.equal(out.recusados.length,0);assert.equal(h.records.get('oc/o1').total,100);assert.equal(h.records.get('oc/o1').itens[0].preco,10);assert.equal(out.salvos[0].itens[0].preco,undefined);
});
for(const patch of [{itens:[{id:'i1',qtd:-1,preco:10}]},{itens:[{id:'i1',qtd:10,preco:-5}]},{frete:-1},{desconto:101},{recebimentos:[{id:'r1',itens:[{itemId:'i1',qtd:-3}]}]},{recebimentos:[{id:'r1',itens:[{itemId:'alien',qtd:1}]}]}]){
  await test('valores e recebimentos inválidos são recusados',async()=>{const h=servidor(nucleo,{'oc/o1':oc});await assert.rejects(()=>h.ctx.gravar('oc',{...oc,...patch},'A'));assert.deepEqual(h.records.get('oc/o1'),oc);});
}
await test('servidor calcula o total a partir de itens e encargos',async()=>{
  const h=servidor(nucleo,{'oc/o1':oc});await h.ctx.gravar('oc',{...oc,_versaoBase:0,total:1,totalLiquido:1,frete:20,desconto:10},'A');const r=h.records.get('oc/o1');assert.equal(r.total,100);assert.equal(r.totalLiquido,110);
});
await test('encerramento manual preserva falta e não quita SC',async()=>{
  const order={...oc,scIds:['s1'],recebimentos:[{id:'r1',itens:[{itemId:'i1',qtd:4}]}],situacao:'parcial'};
  const h=servidor(nucleo,{'oc/o1':order,'sc/s1':{id:'s1',situacao:'em_compra',ocIds:['o1'],itens:[{id:'i1',qtd:10}]}});
  await h.ctx.gravar('oc',{...order,situacao:'entregue',encerradaComFalta:'Fornecedor não terá o restante'},'A',{perfil:'direcao'});assert.equal(h.records.get('oc/o1').situacao,'entregue');assert.equal(h.records.get('sc/s1').situacao,'em_compra');
});
await test('saldo confirmado por dois recebimentos fecha SC',async()=>{
  const order={...oc,scIds:['s1']};const h=servidor(nucleo,{'oc/o1':order,'sc/s1':{id:'s1',situacao:'em_compra',ocIds:['o1'],itens:[{id:'i1',qtd:10}]}});
  await Promise.all([4,6].map((q,i)=>h.ctx.gravar('oc',{...order,recebimentos:[{id:'r'+i,itens:[{itemId:'i1',qtd:q}]}]},'A')));assert.equal(h.records.get('sc/s1').situacao,'atendida');
});
await test('apagar OC recebida é recusado e preserva saldo da SC',async()=>{
  const order={...oc,scIds:['s1'],situacao:'entregue',recebimentos:[{id:'r1',itens:[{itemId:'i1',qtd:10}]}]};
  const h=servidor(nucleo,{'oc/o1':order,'sc/s1':{id:'s1',situacao:'atendida',ocIds:['o1'],itens:[{id:'i1',qtd:10}]}});const r=await h.call({action:'apagar',colecao:'oc',id:'o1'});assert.equal(r.status,400);assert.equal(h.records.get('sc/s1').situacao,'atendida');assert.equal(h.records.get('oc/o1').apagadoEm,undefined);
});
const cot={id:'c1',situacao:'aberta',itens:[{id:'i1',qtd:2}],fornecedores:[{id:'f1',nome:'A',token:'t1'},{id:'f2',nome:'B',token:'t2'}],historico:[]};
await test('duas respostas públicas simultâneas são preservadas',async()=>{
  const h=servidor(nucleo,{'cot/c1':cot});const rr=await Promise.all(['t1','t2'].map(t=>h.call({action:'responderCotacao',id:'c1',t,precos:{i1:10},frete:5})));assert(rr.every(r=>r.status===200));assert(h.records.get('cot/c1').fornecedores.every(f=>f.respondidoEm));assert.equal(h.records.get('cot/c1').historico.length,2);
});
await test('reenviar resposta pública idêntica não duplica histórico',async()=>{
  const h=servidor(nucleo,{'cot/c1':cot});const body={action:'responderCotacao',id:'c1',t:'t1',precos:{i1:10},frete:5};await h.call(body);await h.call(body);assert.equal(h.records.get('cot/c1').historico.length,1);
});
await test('resposta pública não reabre cotação cancelada concorrente',async()=>{
  const h=servidor(nucleo,{'cot/c1':cot});const rpc=h.ctx.db.rpc;h.ctx.db.rpc=async(name,p)=>{if(name==='compras_gravar_se_atual')h.records.set('cot/c1',{...cot,situacao:'cancelada'});return rpc(name,p);};
  const r=await h.call({action:'responderCotacao',id:'c1',t:'t1',precos:{i1:10}});assert.equal(r.status,400);assert.equal(h.records.get('cot/c1').situacao,'cancelada');assert.equal(h.records.get('cot/c1').fornecedores[0].respondidoEm,undefined);
});
await test('frete público negativo é recusado',async()=>{const h=servidor(nucleo,{'cot/c1':cot});const r=await h.call({action:'responderCotacao',id:'c1',t:'t1',precos:{i1:10},frete:-3});assert.equal(r.status,400);assert.deepEqual(h.records.get('cot/c1'),cot);});
await test('revogação indisponível recusa gravação, mesmo com cache de leitura',async()=>{
  let broken=false,calls=0;const ac=context({createClient:()=>({rpc:async()=>{calls++;return broken?{error:{message:'offline'}}:{data:false};}})});vm.runInContext(code('supabase/functions/_shared/acesso.ts'),ac);
  assert.equal(await ac.crachaRevogado('u1','solicitante'),false);broken=true;assert.equal(await ac.crachaRevogado('u1','solicitante',true),true);assert.equal(calls,2);
});
await test('upload completo, retry idêntico e finalização são seguros',async()=>{
  const h=servidor('supabase/functions/compras-acervo/index.ts',{},'obra');const init=await (await h.call({action:'iniciar',nome:'a.txt',tamanho:3,partes:1})).json();assert(init.id);const body={action:'parte',id:init.id,i:0,dados:btoa('abc')};
  assert.equal((await h.call(body)).status,200);assert.equal((await h.call(body)).status,200);assert.equal((await h.call({...body,dados:btoa('bad')})).status,409);
  assert.equal((await h.call({action:'finalizar',id:init.id})).status,200);assert.equal(h.records.get('_arqmeta/'+init.id).pronto,true);assert.equal((await h.call(body)).status,403);assert.equal((await h.call({action:'finalizar',id:init.id})).status,200);
});
await test('parte fora de faixa, incompleta e upload alheio são recusados',async()=>{
  const h=servidor('supabase/functions/compras-acervo/index.ts',{'_arqmeta/a1':{id:'a1',donoId:'u1',tamanho:3,partes:1,pronto:false}},'obra');
  for(const p of [{i:1,dados:btoa('abc')},{i:0,dados:btoa('ab')}])assert.equal((await h.call({action:'parte',id:'a1',...p})).status,400);
  h.records.set('_arqmeta/a1',{...h.records.get('_arqmeta/a1'),donoId:'outro'});assert.equal((await h.call({action:'finalizar',id:'a1'})).status,403);assert.equal((await h.call({action:'parte',id:'a1',i:0,dados:btoa('abc')})).status,403);
});

await test('recebimento sem material não conclui OC por troca de status',async()=>{
  const h=servidor(nucleo,{'oc/o1':oc},'obra');const r=await h.call({action:'salvarLote',itens:[{colecao:'oc',registro:{id:'o1',situacao:'entregue'}}]});const out=await r.json();assert.equal(out.salvos.length,0);assert.equal(out.recusados.length,1);assert.equal(h.records.get('oc/o1').situacao,'confirmada');
});
await test('solicitante não autoriza encerramento manual com falta',async()=>{
  const h=servidor(nucleo,{'oc/o1':oc},'obra');const r=await h.call({action:'salvarLote',itens:[{colecao:'oc',registro:{id:'o1',situacao:'entregue',encerradaComFalta:'não receberá'}}]});const out=await r.json();assert.equal(out.salvos.length,0);assert.match(out.recusados[0].motivo,/encerradaComFalta/);
});
await test('origem explícita preserva saldo com IDs distintos e descrição repetida',()=>{
  const h=servidor(nucleo);const sc={id:'s1',itens:[{id:'a',qtd:2,descricao:'ACM'},{id:'b',qtd:3,descricao:'ACM'}]};
  const orders=[{id:'o1',scIds:['s1'],situacao:'entregue',itens:[{id:'x',origemScId:'s1',origemScItemId:'a',qtd:2}],recebimentos:[{id:'r',itens:[{itemId:'x',qtd:2}]}]}];
  const r=h.ctx.saldoSolicitacao(sc,orders);assert.equal(r[0].saldo,0);assert.equal(r[1].saldo,3);assert.equal(h.ctx.situacaoSolicitacao(sc,orders,[]),'em_compra');
});
await test('conflitos persistentes não são confirmados como gravação',async()=>{
  const h=servidor(nucleo,{'oc/o1':oc});let n=0;const rpc=h.ctx.db.rpc;h.ctx.db.rpc=async(name,p)=>{if(name==='compras_ler_contexto')return rpc(name,p);n++;return {data:false};};await assert.rejects(()=>h.ctx.gravar('oc',oc,'A'),/continuam na fila/);assert.equal(n,8);assert.deepEqual(h.records.get('oc/o1'),oc);
});
await test('falha na RPC não vira confirmação nem fallback incondicional',async()=>{
  const h=servidor(nucleo,{'oc/o1':oc});const rpc=h.ctx.db.rpc;h.ctx.db.rpc=async(name,p)=>name==='compras_ler_contexto'?rpc(name,p):({error:{message:'database offline'}});await assert.rejects(()=>h.ctx.gravar('oc',{...oc,_versaoBase:0,frete:30},'A'),/confirmar a gravação/);assert.deepEqual(h.records.get('oc/o1'),oc);
});

await test('duas escolhas simultâneas da cotação preservam o primeiro fornecedor',async()=>{
  const h=servidor(nucleo,{'cot/c1':cot});const order={...oc,id:'cot-c1',cotacaoId:'c1',situacao:'rascunho',fornecedorId:'a',itens:[{id:'i1',qtd:2,preco:10}]};
  const results=await Promise.allSettled([h.ctx.gravar('oc',order,'A'),h.ctx.gravar('oc',{...order,fornecedorId:'b'},'B')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal([...h.records.keys()].filter(k=>k.startsWith('oc/')).length,1);assert.equal(h.records.get('oc/cot-c1').fornecedorId,'a');
  await h.ctx.gravar('oc',order,'A');assert.equal(h.records.get('oc/cot-c1').fornecedorId,'a');
});
await test('escolha recusada não altera vencedor via gravação posterior da cotação',async()=>{
  const order={...oc,id:'cot-c1',cotacaoId:'c1',fornecedorId:'a'};const h=servidor(nucleo,{'cot/c1':cot,'oc/cot-c1':order});
  const wrong={...cot,situacao:'aprovada',ocId:'cot-c1',fornecedores:cot.fornecedores.map(f=>({...f,fornecedorId:f.id==='f1'?'a':'b',escolhido:f.id==='f2'}))};
  await assert.rejects(()=>h.ctx.gravar('cot',wrong,'B'),/Outro fornecedor/);assert.equal(h.records.get('cot/c1').situacao,'aberta');
  await h.ctx.gravar('cot',{...wrong,fornecedores:wrong.fornecedores.map(f=>({...f,escolhido:f.id==='f1'}))},'A');assert.equal(h.records.get('cot/c1').situacao,'aprovada');
});
await test('cliente antigo não cria nova OC duplicada para cotação',async()=>{
  const h=servidor(nucleo,{'cot/c1':cot});await assert.rejects(()=>h.ctx.gravar('oc',{...oc,cotacaoId:'c1',fornecedorId:'a'},'A'),/Atualize o aplicativo/);assert.equal([...h.records.keys()].filter(k=>k.startsWith('oc/')).length,0);
});

await test('unidades incompatíveis não baixam saldo da solicitação',()=>{
  const h=servidor(nucleo);const sc={id:'s1',itens:[{id:'i1',qtd:2,unid:'m²'}]};
  const order={id:'o1',scIds:['s1'],situacao:'entregue',itens:[{id:'i1',qtd:2,unid:'m2'}],recebimentos:[{id:'r',itens:[{itemId:'i1',qtd:2}]}]};
  assert.equal(h.ctx.saldoSolicitacao(sc,[order])[0].saldo,2);assert.equal(h.ctx.situacaoSolicitacao(sc,[order],[]),'em_compra');
  order.itens[0].unid=' M² ';assert.equal(h.ctx.saldoSolicitacao(sc,[order])[0].saldo,0);
});
console.log(`${count} verificações passaram; ${failures} falharam`);
if(failures)process.exitCode=1;

export { servidor, oc, cot, obra, access };
