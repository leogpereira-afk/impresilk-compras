import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
let checks=0,failures=0;
async function test(nome,fn){try{await fn();checks++;console.log('✓ '+nome);}catch(e){failures++;console.error('✗ '+nome+': '+e.message);}}
function ambiente(opts={}){
  const dados=opts.dados||new Map(), eventos=[], timers=[], elements=new Map();
  const db={snapshot:opts.snapshot||null,falhar:opts.falharDB||false};
  const settings={falharFila:false,falharCache:false,...opts};
  const node=(id)=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',dataset:{},listeners:{},addEventListener(t,f){this.listeners[t]=f;},querySelectorAll(){return [];}});return elements.get(id);};
  const c=vm.createContext({console:{...console,warn(){},error(){}},navigator:{onLine:false},location:{hash:'#/painel'},TELAS:{},
    document:{dispatchEvent(e){eventos.push(e)},addEventListener(){},getElementById:id=>elements.get(id)||null},window:{addEventListener(){}},
    CustomEvent:class{constructor(type,opts={}){this.type=type;this.detail=opts.detail;}},setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){},setInterval(){},TextEncoder,crypto,
    toast(){},esc:x=>String(x||''),confirmar:async()=>true,AUTH:{temCracha:()=>true,esquecer(){c.esqueceu=true;},login:async()=>({usuario:'leo',nome:'Léo',papel:'solicitante'})},
    sessionStorage:{length:0,key(){},removeItem(){}},
    localStorage:{getItem:k=>dados.get(k)||null,removeItem:k=>dados.delete(k),setItem(k,v){if(settings.falharFila&&k==='compras_fila_v1'||settings.falharCache&&k==='compras_cache_v1')throw new Error('quota');dados.set(k,v);}}});
  vm.runInContext(readFileSync('store.js','utf8'),c);
  c.cacheDB=async(acao,valor)=>{if(db.falhar)throw new Error('IndexedDB indisponível');if(acao==='get')return clone(db.snapshot);if(acao==='put')db.snapshot=clone(valor);if(acao==='delete')db.snapshot=null;};
  const run=s=>vm.runInContext(s,c);
  const loadApp=()=>{vm.runInContext(readFileSync('app.js','utf8').replace(/^iniciarCompras\(\)\.catch\(.*\);$/m,''),c);c.render=()=>{};c.permitirSaidaEdicao=async()=>true;};
  return {c,dados,db,settings,eventos,timers,node,run,loadApp,flush:()=>run('_cacheEscrita')};
}
const recent=new Date().toISOString();
const snapshot=(nome,salvoEm,em=10)=>({reg:{oc:[{id:'o1',nome}]},cfg:{},em,salvoEm});
await test('quota da fila impede falso salvamento e não altera tela',()=>{
  const h=ambiente({falharFila:true});assert.throws(()=>h.run("salvar('oc',{id:'o1',itens:[]},{semSubir:true})"),/guardar|salv|espaço/i);assert.equal(h.run('S.fila.length'),0);assert.equal(h.run('S.reg.oc.length'),0);
});
await test('alteração só entra na tela depois de persistir na fila',async()=>{
  const h=ambiente();h.run("salvar('oc',{id:'o1',itens:[]},{semSubir:true})");assert.equal(JSON.parse(h.dados.get('compras_fila_v1'))[0].registro.id,'o1');assert.equal(h.run('S.reg.oc[0]._pendente'),true);await h.flush();
});
await test('fallback recente prevalece sobre IndexedDB antigo',async()=>{
  const h=ambiente({snapshot:snapshot('antigo',100),dados:new Map([['compras_cache_v1',JSON.stringify(snapshot('novo',200))]])});assert.equal((await h.c.lerSnapshotLocal()).reg.oc[0].nome,'novo');
});
await test('IndexedDB novo prevalece sobre fallback antigo',async()=>{
  const h=ambiente({snapshot:snapshot('novo',300),dados:new Map([['compras_cache_v1',JSON.stringify(snapshot('antigo',100))]])});assert.equal((await h.c.lerSnapshotLocal()).reg.oc[0].nome,'novo');
});
await test('cache antigo sem salvoEm continua recuperável',async()=>{
  const h=ambiente({dados:new Map([['compras_cache_v1',JSON.stringify(snapshot('legado',undefined,100))]])});assert.equal((await h.c.lerSnapshotLocal()).reg.oc[0].nome,'legado');
});
await test('falha de IndexedDB salva fallback e não apaga trabalho',async()=>{
  const h=ambiente({falharDB:true});h.run("S.reg.oc=[{id:'o1',nome:'novo'}];gravarCache()");await h.flush();assert.equal(JSON.parse(h.dados.get('compras_cache_v1')).reg.oc[0].nome,'novo');assert.equal(h.run('S.cacheDisponivel'),true);
});
await test('fallback só é removido após confirmar gravação nova',async()=>{
  const h=ambiente({dados:new Map([['compras_cache_v1',JSON.stringify(snapshot('legado',10))]])});let liberar;h.c.cacheDB=async(acao,valor)=>{if(acao==='put'){await new Promise(r=>liberar=r);h.db.snapshot=clone(valor);}};
  h.run("S.reg.oc=[{id:'o1',nome:'novo'}];gravarCache()");await Promise.resolve();await Promise.resolve();assert(h.dados.has('compras_cache_v1'));liberar();await h.flush();assert.equal(h.dados.has('compras_cache_v1'),false);
});
await test('falha dos dois caches é informada sem perder fila',async()=>{
  const h=ambiente({falharDB:true,falharCache:true});h.run("salvar('oc',{id:'o1',itens:[]},{semSubir:true})");await h.flush();assert.match(h.run('S.erroCache'),/indisponível/);assert.equal(h.run('S.cacheDisponivel'),false);assert.equal(JSON.parse(h.dados.get('compras_fila_v1')).length,1);
});
await test('limpar cache aguarda escrita pendente e elimina as duas cópias',async()=>{
  const h=ambiente();let liberar;const cache=h.c.cacheDB;h.c.cacheDB=async(a,v)=>{if(a==='put')await new Promise(r=>liberar=r);return cache(a,v);};h.run('gravarCache()');await Promise.resolve();await Promise.resolve();const limpando=h.c.limparCacheLocal();liberar();await limpando;assert.equal(h.db.snapshot,null);assert.equal(h.dados.has('compras_cache_v1'),false);
});
function pendente(h){h.run("S.perfil='direcao';S.usuarioId='leo';salvar('oc',{id:'o1',total:100,itens:[{id:'i',qtd:2,preco:50}],tokenPublico:'privado',atualizadoEm:'"+recent+"'},{semSubir:true})");h.c.navigator.onLine=true;}
await test('recusa por item mantém fila e indicador pendente após novo snapshot',async()=>{
  const h=ambiente();pendente(h);h.c.api=async action=>action==='salvarLote'?{ok:true,salvos:[],recusados:[{colecao:'oc',id:'o1',motivo:'Revisar quantidade'}]}:{ok:true,registros:[{_col:'oc',id:'o1',total:80}],eu:{perfil:'direcao',id:'leo',proprio:true},cfg:{}};
  await h.c.subirFila();assert.equal(h.run('S.fila.length'),1);assert.match(h.run('S.fila[0].erro'),/Revisar/);assert.equal(h.run('S.reg.oc[0]._pendente'),true);await h.c.puxar();assert.equal(h.run('S.reg.oc[0].total'),100);assert.equal(h.run('S.reg.oc[0]._pendente'),true);assert.equal(JSON.parse(h.dados.get('compras_fila_v1')).length,1);
});
await test('resposta sem confirmação explícita não retira trabalho da fila',async()=>{
  const h=ambiente();pendente(h);h.c.api=async()=>({ok:true,salvos:[],recusados:[]});await h.c.subirFila();assert.equal(h.run('S.fila.length'),1);assert.equal(h.run('S.reg.oc[0]._pendente'),true);
});
await test('confirmação de outra coleção não confirma registro homônimo',async()=>{
  const h=ambiente();pendente(h);h.c.api=async()=>({ok:true,salvos:[{_col:'sc',id:'o1'}],recusados:[]});await h.c.subirFila();assert.equal(h.run('S.fila.length'),1);
});
await test('confirmação correta limpa apenas alteração enviada',async()=>{
  const h=ambiente();pendente(h);h.c.api=async()=>({ok:true,salvos:[{_col:'oc',id:'o1',total:100}],recusados:[]});await h.c.subirFila();assert.equal(h.run('S.fila.length'),0);assert.equal(h.run('S.reg.oc[0]._pendente'),undefined);assert.equal(JSON.parse(h.dados.get('compras_fila_v1')).length,0);
});
await test('edição feita durante envio não é apagada pela resposta anterior',async()=>{
  const h=ambiente();pendente(h);let liberar;h.c.api=async()=>new Promise(r=>liberar=r);const envio=h.c.subirFila();h.run("salvar('oc',{id:'o1',total:120},{semSubir:true})");liberar({ok:true,salvos:[{_col:'oc',id:'o1',total:100}],recusados:[]});await envio;assert.equal(h.run('S.fila.length'),1);assert.equal(h.run('S.fila[0].registro.total'),120);assert.equal(h.run('S.reg.oc[0].total'),120);assert.equal(h.run('S.reg.oc[0]._pendente'),true);
});
await test('falha ao persistir confirmação não elimina fila original',async()=>{
  const h=ambiente();pendente(h);h.settings.falharFila=true;h.c.api=async()=>({ok:true,salvos:[{_col:'oc',id:'o1',total:100}]});await h.c.subirFila();assert.equal(h.run('S.fila.length'),1);assert.match(h.run('S.erroSync'),/fila local/);assert.equal(h.run('S.reg.oc[0]._pendente'),true);
});
await test('negação da ação inteira mantém conteúdo recuperável',async()=>{
  const h=ambiente();pendente(h);h.c.api=async()=>{throw Object.assign(new Error('Permissão alterada'),{semPermissao:true});};await h.c.subirFila();assert.equal(h.run('S.fila.length'),1);assert.equal(h.run('S.fila[0].erro'),'Permissão alterada');assert.equal(h.run('S.reg.oc[0]._pendente'),true);
});
await test('redução de perfil remove valores e coleções privadas do snapshot',async()=>{
  const h=ambiente();h.c.navigator.onLine=true;h.run("S.perfil='direcao';S.usuarioId='leo';S.reg.oc=[{id:'o1',total:100,tokenPublico:'privado',atualizadoEm:'"+recent+"'}];S.reg.cot=[{id:'c1',total:99,atualizadoEm:'"+recent+"'}]");h.c.api=async()=>({ok:true,registros:[{_col:'oc',id:'o1',itens:[{id:'i',qtd:2}]}],cfg:{},eu:{perfil:'obra',id:'leo',proprio:true}});await h.c.puxar();assert.equal(h.run('S.reg.cot.length'),0);assert.equal(h.run('S.reg.oc[0].total'),undefined);assert.equal(h.run('S.reg.oc[0].tokenPublico'),undefined);
});
await test('fila recusada continua pendente e mascarada depois de reduzir perfil e recarregar',async()=>{
  const h=ambiente();pendente(h);h.c.api=async action=>action==='salvarLote'?{ok:true,salvos:[],recusados:[{colecao:'oc',id:'o1',motivo:'Novo perfil sem permissão'}]}:{ok:true,registros:[{_col:'oc',id:'o1',itens:[{id:'i',qtd:2}]}],cfg:{},eu:{perfil:'obra',id:'leo',proprio:true}};
  await h.c.puxar();await h.c.puxar();await h.flush();assert.equal(h.run('S.reg.oc[0].total'),undefined);assert.equal(h.run('S.reg.oc[0]._pendente'),true);
  const reload=ambiente({dados:h.dados,snapshot:h.db.snapshot});await reload.c.lerCache();assert.equal(reload.run('S.reg.oc[0].total'),undefined);assert.equal(reload.run('S.reg.oc[0].tokenPublico'),undefined);assert.equal(reload.run('S.reg.oc[0].itens[0].preco'),undefined);assert.equal(reload.run('S.reg.oc[0]._pendente'),true);assert.equal(reload.run('S.fila.length'),1);
});
await test('login do mesmo usuário com perfil reduzido não reaproveita cotação privada recente',async()=>{
  const h=ambiente();h.loadApp();h.node('app');h.node('usuario').value='leo';h.node('senha').value='test';h.node('erroEntrar');h.node('btnEntrar');h.run("S.perfil='direcao';S.usuarioId='leo';S.reg.cot=[{id:'c1',total:99,atualizadoEm:'"+recent+"'}]");h.c.navigator.onLine=true;h.c.api=async()=>({ok:true,registros:[],cfg:{},eu:{perfil:'obra',id:'leo',proprio:true}});h.c.telaEntrar();await h.node('btnEntrar').listeners.click();assert.equal(h.run('S.reg.cot.length'),0);
});
await test('botão Sair em Configurações também elimina cache e fila',async()=>{
  const h=ambiente({snapshot:snapshot('privado',100)});h.loadApp();h.node('sair');h.run("S.usuarioId='leo';S.perfil='direcao';S.reg.oc=[{id:'o1',total:100}]");h.dados.set('compras_cache_v1',JSON.stringify(snapshot('privado',90)));h.c.ligarSenhaEAparelho({});await h.node('sair').listeners.click();assert.equal(h.db.snapshot,null);assert.equal(h.dados.has('compras_cache_v1'),false);assert.equal(h.run('S.reg.oc.length'),0);assert.equal(h.run('S.fila.length'),0);assert.equal(h.c.esqueceu,true);
});

await test('cache de outro usuário não é recuperado',async()=>{
  const cache={...snapshot('outro usuário',100),usuarioId:'antigo'};const h=ambiente({snapshot:cache,dados:new Map([['compras_usuario','novo'],['compras_cache_v1',JSON.stringify(cache)]])});assert.equal(await h.c.lerSnapshotLocal(),null);
});
await test('falha para apagar IndexedDB não ressuscita snapshot após logout',async()=>{
  const h=ambiente({snapshot:snapshot('privado',100),falharDB:true});await h.c.limparCacheLocal();assert(h.db.snapshot);h.db.falhar=false;assert.equal(await h.c.lerSnapshotLocal(),null);
});
await test('gravação nova após limpar cache continua recuperável',async()=>{
  const h=ambiente({snapshot:snapshot('antigo',100)});await h.c.limparCacheLocal();h.run("S.reg.sc=[{id:'s1',nome:'novo'}];gravarCache()");await h.flush();assert.equal((await h.c.lerSnapshotLocal()).reg.sc[0].nome,'novo');
});
console.log(`${checks} verificações de persistência, fila e isolamento passaram; ${failures} falharam`);
if(failures)process.exitCode=1;
