import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const dom=new JSDOM('<body><main></main><div id="toasts"></div></body>',{runScripts:'outside-only',url:'https://teste.invalid/'});
const w=dom.window;
w.eval(['ui.js','acervo.js','compras.js','rede.js'].map(f=>readFileSync(f,'utf8')).join('\n')+'\nwindow.__telas=TELAS;');
w.S={reg:{},cfg:{},quem:'Teste'};
w.lista=c=>w.S.reg[c]||[];w.achar=(c,id)=>w.lista(c).find(r=>r.id===id);
w.obras=()=>[{id:'empresa',nome:'Empresa'}];w.cfgLista=()=>['Comunicação visual'];w.podeEscrever=()=>true;
w.cabecalho=()=>{};w.render=()=>{};
let envios=0,modais=0,avisos=[];
w.toast=texto=>avisos.push(texto);
w.abrirModal=op=>{modais++;const f=w.document.createElement('div');f.innerHTML=op.corpo;w.document.body.append(f);return f;};
w.fecharEste=f=>f.remove();
w.enviarArquivo=async f=>{envios++;return {id:'ficticio',nome:f.name};};
let passou=0,falhou=0;
async function test(nome,fn){try{await fn();passou++;console.log('OK '+nome);}catch(e){falhou++;console.error('FALHOU '+nome+': '+e.message);}}

await test('Catálogos identifica todos os filtros por rótulo associado',()=>{
  w.__telas.catalogos(w.document.querySelector('main'));
  for(const id of ['pjBusca','pjObra','pjDisc']){
    const c=w.document.getElementById(id);assert(c);assert(c.labels.length>0,id+' sem rótulo');
    assert(c.labels[0].textContent.trim());
  }
});
await test('Arquivo acima do limite é recusado antes de abrir upload ou enviar bytes',async()=>{
  envios=0;modais=0;avisos=[];
  const metas=await w.subirArquivos([{name:'grande.pdf',size:1073741825}]);
  assert.equal(envios,0);assert.equal(modais,0);assert.equal(metas.length,0);assert(avisos.some(a=>a.includes('1 GB')));
});
await test('Arquivo no limite continua aceito sem alocar arquivo gigante',async()=>{
  envios=0;modais=0;
  const metas=await w.subirArquivos([{name:'limite.pdf',size:1073741824}]);
  assert.equal(envios,1);assert.equal(metas.length,1);
});
await test('Cadastro incompleto é informado e ISENTO não vira pendência de inscrição',()=>{
  assert.match(w.avisoCadastroEmpresa({nome:'Empresa'}),/CNPJ/);
  assert.match(w.avisoCadastroEmpresa({nome:'Empresa'}),/CEP/);
  assert.equal(w.avisoCadastroEmpresa({cnpj:'00.000.000/0001-00',ie:'ISENTO',cep:'00000-000'}),'');
});
await test('Diretório distingue ERP disponível, inativo e cadastro sem vínculo',()=>{
  const host=w.document.createElement('div');
  host.innerHTML=w.htmlDiretorioFornecedores([
    {id:'ativo',nome:'Ativo',origemMubi:'1'},
    {id:'inativo',nome:'Inativo ERP',origemMubi:'2',ativoNoErp:false},
    {id:'manual',nome:'Cadastro manual'}
  ]);
  assert.match(host.querySelector('[href="#/fornecedores/ativo"]').textContent,/Disponível para compra/);
  assert.match(host.querySelector('[href="#/fornecedores/inativo"]').textContent,/Inativo no ERP/);
  assert.match(host.querySelector('[href="#/fornecedores/manual"]').textContent,/Sem vínculo com ERP/);
  assert.match(host.textContent,/1 disponível/);
});
console.log(`${passou} verificações passaram; ${falhou} falharam`);
dom.window.close();if(falhou)process.exitCode=1;
