// Isolamento real do código em VM; rede e Web Locks modelados sem servidor.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('✓ '+name)}catch(e){failed++;console.error('✗ '+name+': '+e.message)}}
function lockManager(){let owner=null;return {forTab(id){return {request:async(name,opts,fn)=>{if(owner)return fn(null);owner=id;return fn({name})}}},close(id){if(owner===id)owner=null}}}
function env(opts={}){
 const data=opts.data||new Map(),db=opts.db||{snapshot:null},events=[],timers=[],els=new Map(),listeners={};
 const node=id=>{if(!els.has(id))els.set(id,{value:'',innerHTML:'',dataset:{},listeners:{},addEventListener(t,f){this.listeners[t]=f;},querySelectorAll(){return []}});return els.get(id)};
 const c=vm.createContext({console:{...console,warn(){},error(){}},navigator:{onLine:false,...opts.navigator},location:{hash:'#/painel'},TELAS:{},TOKEN:'fixture',API:'https://fixture.invalid',API_ARQ:'https://fixture.invalid/acervo',
 document:{dispatchEvent(e){events.push(e)},addEventListener(){},getElementById:id=>els.get(id)||null},window:{addEventListener(t,f){(listeners[t]||=[]).push(f)}},
 CustomEvent:class {constructor(type,o={}){this.type=type;this.detail=o.detail}},AbortController,setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){},setInterval(){},TextEncoder,crypto,
 toast(message){events.push({toast:message})},esc:x=>String(x||''),confirmar:async()=>true,AUTH:{temCracha:()=>!c.loggedOut,cracha:()=>c.loggedOut?'':c.token||'old-token',esquecer(){c.loggedOut=true},login:async()=>{c.loggedOut=false;c.token='new-token';return {usuario:'leo',nome:'Léo',papel:'solicitante'}}},
 sessionStorage:{length:0,key(){},removeItem(){}},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}});
 vm.runInContext(readFileSync('store.js','utf8'),c);
 c.cacheDB=async(a,v)=>{if(a==='get')return clone(db.snapshot);if(a==='put')db.snapshot=clone(v);if(a==='delete')db.snapshot=null};
 const run=s=>vm.runInContext(s,c);
 const app=()=>{vm.runInContext(readFileSync('app.js','utf8').replace(/^iniciarCompras\(\)\.catch\(.*\);$/m,''),c);c.render=()=>{};c.permitirSaidaEdicao=async()=>true};
 const start=async()=>{if(c.iniciarControleAbas)await c.iniciarControleAbas();await c.lerCache()};
 return {c,data,db,events,timers,listeners,run,node,app,start,flush:()=>run('_cacheEscrita')};
}
const sharedData=()=>new Map([['compras_usuario','leo'],['compras_perfil','direcao']]);
function twoTabs(){const data=sharedData(),db={snapshot:null},locks=lockManager();return {locks,a:env({data,db,navigator:{locks:locks.forTab('a')}}),b:env({data,db,navigator:{locks:locks.forTab('b')}})}}
await test('duas abas offline não sobrescrevem a fila nem o cache uma da outra',async()=>{
 const {a,b}=twoTabs();await a.start();await b.start();a.run("salvar('sc',{id:'A'},{semSubir:true})");await a.flush();assert.throws(()=>b.run("salvar('sc',{id:'B'},{semSubir:true})"),/aba|consulta/i);await b.flush();const reload=env({data:a.data,db:a.db});await reload.c.lerCache();assert.deepEqual(clone(reload.run('S.fila.map(f=>f.registro.id)')),['A']);assert.equal(reload.run('S.reg.sc[0].id'),'A');
});
await test('segunda aba não confirma, reenvia ou regrava a fila da primeira',async()=>{
 const {a,b}=twoTabs();await a.start();a.run("salvar('sc',{id:'A'},{semSubir:true})");await b.start();b.c.navigator.onLine=true;let calls=0;b.c.api=async()=>{calls++;return {salvos:[]}};await b.c.subirFila();assert.equal(calls,0);assert.equal(b.c.gravarFila([]),false);assert.equal(JSON.parse(a.data.get('compras_fila_v1')).length,1);
});
await test('somente consulta permite snapshot e download, bloqueia mutação direta e upload',async()=>{
 const {a,b}=twoTabs();await a.start();await b.start();let calls=0;b.c.fetch=async()=>{calls++;return {ok:true,json:async()=>({ok:true})}};await b.c.api('snapshot');await b.run("apiArq('meta',{id:'arq'})");await assert.rejects(b.c.api('apagar',{id:'A'}),/aba|consulta/i);await assert.rejects(b.run("apiArq('iniciar',{nome:'foto.jpg'})"),/aba|consulta/i);assert.equal(calls,2);
});
await test('links públicos independem da aba interna que edita',async()=>{
 const {a,b}=twoTabs();await a.start();await b.start();let called=0;b.c.fetch=async()=>{called++;return {ok:true,json:async()=>({ok:true})}};await b.c.api('novaSolicitacao',{}, {publico:true});assert.equal(called,1);
});
await test('assumir após fechar a primeira aba recarrega a fila antes de permitir escrita',async()=>{
 const {a,b,locks}=twoTabs();await a.start();await b.start();a.run("salvar('sc',{id:'A'},{semSubir:true})");await a.flush();locks.close('a');assert.equal(await b.c.iniciarControleAbas(),true);b.run("salvar('sc',{id:'B'},{semSubir:true})");assert.deepEqual(JSON.parse(b.data.get('compras_fila_v1')).map(f=>f.registro.id).sort(),['A','B']);
});
await test('sem Web Locks não há escrita silenciosa nem promessa que fica pendurada',async()=>{
 const h=env();assert.equal(await h.c.iniciarControleAbas(),false);assert.match(h.run('S.avisoAba'),/navegador|segura/i);assert.throws(()=>h.run("salvar('sc',{id:'A'},{semSubir:true})"),/navegador|aba|consulta/i);
});
await test('erro na aquisição de Web Locks falha com aviso e preserva leitura',async()=>{
 const h=env({navigator:{locks:{request:async()=>{throw new Error('SecurityError')}}}});assert.equal(await h.c.iniciarControleAbas(),false);assert.match(h.run('S.avisoAba'),/aba|navegador|consulta/i);
});
await test('snapshot após Sair não restaura dados, cache ou identidade',async()=>{
 const h=env();h.app();h.run("S.usuarioId='leo';S.perfil='direcao'");h.data.set('compras_usuario','leo');h.c.navigator.onLine=true;let release;h.c.api=async()=>new Promise(r=>release=r);const p=h.c.puxar();await Promise.resolve();await Promise.resolve();await h.c.sair();release({registros:[{_col:'oc',id:'o1',total:9000}],cfg:{},eu:{perfil:'direcao',id:'leo',proprio:true}});await p;await h.flush();assert.equal(h.run('S.reg.oc.length'),0);assert.equal(h.db.snapshot,null);assert.equal(h.data.has('compras_usuario'),false);
});
await test('ACK após Sair não recria cache sem dono',async()=>{
 const h=env();h.app();h.run("S.usuarioId='leo';S.perfil='direcao';salvar('oc',{id:'o1',total:9000},{semSubir:true})");await h.flush();h.c.navigator.onLine=true;let release;h.c.api=async()=>new Promise(r=>release=r);const p=h.c.subirFila();await h.c.sair();release({salvos:[{_col:'oc',id:'o1',total:9000}],recusados:[]});await p;await h.flush();assert.equal(h.run('S.reg.oc.length'),0);assert.equal(h.db.snapshot,null);assert.equal(h.data.has('compras_fila_v1'),false);
});
await test('resposta antiga não altera a nova identidade nem o erro da nova sessão',async()=>{
 const h=env();h.app();h.run("S.usuarioId='leo';S.perfil='direcao'");h.c.navigator.onLine=true;let release;h.c.api=async()=>new Promise(r=>release=r);const p=h.c.puxar();await Promise.resolve();await Promise.resolve();await h.c.sair();h.c.loggedOut=false;h.c.token='another';h.run("S.usuarioId='ana';S.perfil='obra';S.erroSync='erro da nova sessão'");release({registros:[{_col:'oc',id:'privado',total:800}],cfg:{},eu:{perfil:'direcao',id:'leo',proprio:true}});await p;assert.equal(h.run('S.usuarioId'),'ana');assert.equal(h.run('S.perfil'),'obra');assert.equal(h.run('S.reg.oc.length'),0);assert.equal(h.run('S.erroSync'),'erro da nova sessão');
});
await test('API privada aborta requisição ativa e não devolve resposta de sessão antiga',async()=>{
 const h=env();let release,signal;h.c.fetch=async(u,o)=>{signal=o.signal;return new Promise(r=>release=r)};const p=h.c.api('snapshot');h.c.invalidarSessaoDados();assert.equal(signal.aborted,true);release({ok:true,json:async()=>({registros:[]})});await assert.rejects(p,e=>e.canceladoPorSessao===true);
});
await test('redução de papel mascara imediatamente mesmo se snapshot falhar',async()=>{
 const h=env();h.app();h.node('app');h.node('usuario').value='leo';h.node('senha').value='test';h.node('erroEntrar');h.node('btnEntrar');h.run("S.usuarioId='leo';S.perfil='direcao';S.reg.oc=[{id:'o',total:999,seguro:4,difalValor:7,itens:[{id:'i',preco:333}],tokenPublico:'secret'}];S.reg.cot=[{id:'c'}];S.cfg={usuarios:[{nome:'privado'}]}");h.c.navigator.onLine=true;h.c.api=async()=>{throw new Error('offline')};h.c.telaEntrar();await h.node('btnEntrar').listeners.click();await h.flush();assert.equal(h.run('S.perfil'),'obra');assert.equal(h.run('S.reg.oc[0].total'),undefined);assert.equal(h.run('S.reg.cot.length'),0);assert.equal(h.run('S.reg.oc[0].seguro'),undefined);assert.equal(h.run('S.reg.oc[0].difalValor'),undefined);assert.equal(h.run('S.cfg.usuarios'),undefined);assert.equal(h.db.snapshot.reg.oc[0].tokenPublico,undefined);
});
await test('segunda aba não sai apagando fila pendente da principal',async()=>{
 const {a,b}=twoTabs();await a.start();a.run("salvar('sc',{id:'A'},{semSubir:true})");await b.start();b.app();await b.c.sair();assert.equal(JSON.parse(a.data.get('compras_fila_v1')).length,1);assert.equal(b.c.loggedOut,undefined);assert(b.events.some(e=>e.toast&&/aba|consulta/i.test(e.toast)));
});
await test('edição comercial pendente seguida de recebimento conserva intenção e base original',()=>{
 const h=env();h.run("S.usuarioId='leo';S.perfil='direcao';salvar('oc',{id:'o1',total:400,_versaoBase:7},{semSubir:true});salvar('oc',{id:'o1',_operacao:'recebimento',recebimentos:[{id:'r1'}]},{semSubir:true})");assert.equal(h.run('S.fila[0].registro._operacao'),undefined);assert.equal(h.run('S.fila[0].registro._versaoBase'),7);assert.equal(h.run('S.fila[0].registro.total'),400);assert.equal(h.run('S.fila[0].registro.recebimentos.length'),1);
});
await test('recebimento puro mantém marcador até envio, sem criar base comercial',()=>{
 const h=env();h.run("S.usuarioId='leo';S.perfil='direcao';S.reg.oc=[{id:'o1',versao:3}];salvar('oc',{id:'o1',_operacao:'recebimento',recebimentos:[{id:'r1'}]},{semSubir:true})");assert.equal(h.run('S.fila[0].registro._operacao'),'recebimento');assert.equal(h.run('S.fila[0].registro._versaoBase'),undefined);
});

await test('mesmo registro aberto em duas abas não aceita sobrescrita na aba de consulta',async()=>{
 const {a,b}=twoTabs();await a.start();await b.start();a.run("salvar('oc',{id:'o1',total:30},{semSubir:true})");assert.throws(()=>b.run("salvar('oc',{id:'o1',total:80},{semSubir:true})"),/consulta|aba/i);assert.equal(JSON.parse(a.data.get('compras_fila_v1'))[0].registro.total,30);
});
await test('snapshot de consulta não regrava o cache compartilhado nem mantém fila já confirmada',async()=>{
 const {a,b}=twoTabs();await a.start();a.run("salvar('sc',{id:'s1',nome:'pendente'},{semSubir:true})");await a.flush();await b.start();a.c.navigator.onLine=true;a.c.api=async()=>({salvos:[{_col:'sc',id:'s1',nome:'confirmado'}],recusados:[]});await a.c.subirFila();await a.flush();const cache=clone(a.db.snapshot);
 b.c.navigator.onLine=true;b.c.api=async()=>({registros:[{_col:'sc',id:'s1',nome:'no servidor'}],cfg:{},eu:{perfil:'direcao',id:'leo',proprio:true}});await b.c.puxar();await b.flush();assert.equal(b.run('S.fila.length'),0);assert.equal(b.run('S.reg.sc[0].nome'),'no servidor');assert.deepEqual(a.db.snapshot,cache);
});
await test('logout mantém a exclusividade até a aba ser fechada',async()=>{
 const {a,b}=twoTabs();await a.start();a.app();await a.c.sair();assert.equal(await b.c.iniciarControleAbas(),false);
});
await test('erro tardio de sessão antiga não apaga erro ou identidade da sessão seguinte',async()=>{
 const h=env();h.app();h.run("S.usuarioId='leo';S.perfil='direcao'");h.c.navigator.onLine=true;let reject;h.c.api=async()=>new Promise((r,j)=>reject=j);const p=h.c.puxar();await Promise.resolve();await Promise.resolve();await h.c.sair();h.run("S.usuarioId='ana';S.perfil='obra';S.erroSync='nova falha'");reject(new Error('erro antigo'));await p;assert.equal(h.run('S.erroSync'),'nova falha');assert.equal(h.run('S.usuarioId'),'ana');
});
await test('snapshot anterior não libera o bloqueio de uma nova sincronização',async()=>{
 const h=env();h.app();h.run("S.usuarioId='leo';S.perfil='direcao'");h.c.navigator.onLine=true;let first;h.c.api=async()=>new Promise(r=>first=r);const old=h.c.puxar();await Promise.resolve();await Promise.resolve();await h.c.sair();h.c.loggedOut=false;h.c.token='new';h.run("S.usuarioId='ana';S.perfil='obra'");let second;h.c.api=async()=>new Promise(r=>second=r);const current=h.c.puxar();await Promise.resolve();await Promise.resolve();first({registros:[],cfg:{},eu:{perfil:'direcao',id:'leo',proprio:true}});await old;assert.equal(h.run('S.sincronizando'),true);second({registros:[],cfg:{},eu:{perfil:'obra',id:'ana',proprio:true}});await current;assert.equal(h.run('S.sincronizando'),false);
});
await test('troca do token em outra aba não recupera cache privado da identidade anterior',async()=>{
 const h=env({db:{snapshot:{reg:{oc:[{id:'segredo',total:900}]},cfg:{},usuarioId:'leo',salvoEm:10}}});h.app();h.run("S.usuarioId='leo';S.perfil='direcao';S.reg.oc=[{id:'segredo',total:900}]");h.c.token='new-user-token';h.c.puxar=()=>{};await h.listeners.storage[0]({key:'compras_cracha'});assert.equal(h.run('S.reg.oc.length'),0);assert.equal(h.run('S.perfil'),'obra');assert.equal(h.run('S.usuarioId'),'');
});

await test('página pública não sincroniza dados privados nem escreve cache de outra aba',async()=>{
 const h=env();h.app();h.c.location.hash='#/solicitar';h.c.navigator.onLine=true;let calls=0;h.c.api=async()=>{calls++;return {registros:[]}};await h.c.iniciarCompras();await h.c.puxar();assert.equal(calls,0);assert.equal(h.db.snapshot,null);
});

await test('edição após recebimento pendente não herda intenção de recebimento',()=>{
 const h=env();h.run("S.usuarioId='leo';S.perfil='direcao';S.reg.oc=[{id:'o1',versao:3,total:20}];salvar('oc',{id:'o1',_operacao:'recebimento',recebimentos:[{id:'r1'}]},{semSubir:true});var editar={...achar('oc','o1'),total:80,_versaoBase:3};delete editar._operacao;salvar('oc',editar,{semSubir:true})");assert.equal(h.run('S.fila[0].registro._operacao'),undefined);assert.equal(h.run('S.fila[0].registro._versaoBase'),3);assert.equal(h.run('S.fila[0].registro.total'),80);assert.equal(h.run('S.fila[0].registro.recebimentos.length'),1);
});

await test('exceção síncrona do navegador ao pedir lock vira aviso recuperável',async()=>{
 const h=env({navigator:{locks:{request(){throw new Error('SecurityError')}}}});assert.equal(await h.c.iniciarControleAbas(),false);assert.match(h.run('S.avisoAba'),/navegador|segura/i);
});
console.log(`${passed} verificações v19 passaram; ${failed} falharam`);if(failed)process.exitCode=1;
