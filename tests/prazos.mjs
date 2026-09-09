import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
process.env.TZ='America/Sao_Paulo';
let count=0;
for (const instante of ['2026-09-09T12:00:00-03:00','2026-09-09T23:30:00-03:00']) {
  class Clock extends Date { constructor(...args){super(...(args.length?args:[instante]));} static now(){return new Date(instante).getTime();} }
  const ctx=vm.createContext({Date:Clock,document:{addEventListener(){}}});
  vm.runInContext(readFileSync('ui.js','utf8'),ctx);
  for (const [expr,want] of [["hojeISO()",'2026-09-09'],["diasAte('2026-09-09')",0],["diasAte('2026-09-08')",-1],["diasAte('2026-09-10')",1],["diasAte('2026-02-30')",null],["diasAte('')",null],["diasAte('texto')",null]]) {
    assert.equal(vm.runInContext(expr,ctx),want,expr+' em '+instante); count++;
  }
}
const app=readFileSync('app.js','utf8');
const ctx=vm.createContext({S:{fila:[],erroSync:''},navigator:{onLine:true},toast:(...a)=>ctx.messages.push(a),messages:[],subirFila:async()=>{},puxar:async()=>{ctx.S.erroSync='Falha de conexão';},render(){}});
vm.runInContext(app.slice(app.indexOf('async function sincronizarAgora()'),app.indexOf('// Sair =')),ctx);
await vm.runInContext('sincronizarAgora()',ctx);
assert(ctx.messages.some(([s])=>s.includes('Não consegui sincronizar')));count++;
assert(!ctx.messages.some(([s])=>s==='Tudo em dia'));count++;
console.log(`${count} verificações passaram`);
