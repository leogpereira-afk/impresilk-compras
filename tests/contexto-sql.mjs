// PostgreSQL real em WASM, banco efêmero. Nenhum acesso a rede ou produção.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create table public.compras_registros(colecao text not null,id text not null,registro jsonb not null,atualizado_em timestamptz not null default now(),apagado boolean not null default false,primary key(colecao,id));
alter table public.compras_registros enable row level security;
grant select,insert,update,delete on public.compras_registros to service_role;`);
for(const f of ['0003_gravacao_concorrente.sql','0004_contexto_compras.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
let n=0;
const test=async(nome,fn)=>{await fn();n++;console.log('OK '+nome);};
const snapshot=async()=> (await db.query('select public.compras_ler_contexto() as contexto')).rows[0].contexto;
const gravar=async(col,id,antigo,novo,hash)=> (await db.query('select public.compras_gravar_contexto($1,$2,$3,$4,$5) as ok',[col,id,antigo,novo,hash])).rows[0].ok;
const registro={id:'sc-teste',itens:[{id:'i',qtd:10}],situacao:'aprovada'};

await test('Migração preserva dados existentes quando reaplicada',async()=>{
  await db.query('insert into public.compras_registros(colecao,id,registro) values($1,$2,$3)',['sc',registro.id,registro]);
  await db.exec(readFileSync('supabase/migrations/0004_contexto_compras.sql','utf8'));
  assert.deepEqual((await db.query('select registro from public.compras_registros')).rows[0].registro,registro);
});
await test('Somente serviço executa as RPCs e grava no contexto esperado',async()=>{
  await db.exec('set role service_role');
  const antes=await snapshot();
  assert.equal(antes.registros[0]._col,'sc');
  assert.equal(await gravar('oc','oc-a',null,{id:'oc-a',scIds:['sc-teste'],itens:[{id:'i',qtd:6}]},antes.hash),true);
  await db.exec('reset role');
  for(const papel of ['anon','authenticated']){
    await db.exec('set role '+papel);
    await assert.rejects(snapshot,/permission denied/);
    await assert.rejects(()=>gravar('oc','oc-proibida',null,{id:'oc-proibida'},antes.hash),/permission denied/);
    await db.exec('reset role');
  }
});
await test('Segunda compra em documento diferente precisa reler saldo após mudança',async()=>{
  const antes=await snapshot();
  assert.equal(await gravar('oc','oc-b',null,{id:'oc-b',scIds:['sc-teste'],itens:[{id:'i',qtd:4}]},antes.hash),true);
  assert.equal(await gravar('oc','oc-c',null,{id:'oc-c',scIds:['sc-teste'],itens:[{id:'i',qtd:4}]},antes.hash),false);
  assert.equal((await db.query("select count(*)::int as n from public.compras_registros where id='oc-c'")).rows[0].n,0);
});
await test('Alterar SC ou cotação invalida a decisão baseada no contexto antigo',async()=>{
  let antes=await snapshot();
  await db.query("update public.compras_registros set registro=jsonb_set(registro,'{situacao}','\"recusada\"') where id='sc-teste'");
  assert.equal(await gravar('oc','oc-d',null,{id:'oc-d'},antes.hash),false);
  antes=await snapshot();
  await db.query('insert into public.compras_registros(colecao,id,registro) values($1,$2,$3)',['cot','cot-teste',{id:'cot-teste',situacao:'aberta'}]);
  assert.equal(await gravar('oc','oc-d',null,{id:'oc-d'},antes.hash),false);
});
await test('Contexto atual não autoriza substituir uma versão antiga do mesmo registro',async()=>{
  const contexto=await snapshot();
  assert.equal(await gravar('sc','sc-teste',registro,{...registro,situacao:'atendida'},contexto.hash),false);
});
await test('Escrita legada também invalida o contexto de outra compra',async()=>{
  const contexto=await snapshot();
  await db.query('select public.compras_gravar_se_atual($1,$2,$3,$4)',['oc','oc-legada',null,{id:'oc-legada',itens:[]}]);
  assert.equal(await gravar('oc','oc-d',null,{id:'oc-d'},contexto.hash),false);
});
await test('Registros auxiliares não invalidam o saldo e entradas inválidas são recusadas',async()=>{
  const contexto=await snapshot();
  await db.query('insert into public.compras_registros(colecao,id,registro) values($1,$2,$3)',['forn','forn-teste',{id:'forn-teste'}]);
  assert.equal((await snapshot()).hash,contexto.hash);
  await assert.rejects(()=>gravar('forn','x',null,{id:'x'},contexto.hash),/Contexto/);
  await assert.rejects(()=>gravar('oc','x',null,{id:'outro'},contexto.hash),/Registro inválido/);
});
await test('Rollback conserva os registros anteriores',async()=>{
  const contexto=await snapshot();
  await db.exec('begin');
  assert.equal(await gravar('oc','oc-rollback',null,{id:'oc-rollback'},contexto.hash),true);
  await db.exec('rollback');
  assert.equal((await snapshot()).hash,contexto.hash);
});
await test('RPCs permanecem invoker e hash estável com chave JSON reordenada',async()=>{
  const flags=await db.query("select proname,prosecdef from pg_proc where proname in ('compras_ler_contexto','compras_gravar_contexto')");
  assert.equal(flags.rows.length,2);assert(flags.rows.every(f=>f.prosecdef===false));
  const antes=await snapshot();
  await db.query('update public.compras_registros set registro=$1 where id=$2',[{situacao:'aberta',id:'cot-teste'},'cot-teste']);
  assert.equal((await snapshot()).hash,antes.hash);
});
console.log(`${n} verificações SQL passaram. Limite: conexão única; escalonamento de locks entre conexões não simulado.`);
await db.close();
