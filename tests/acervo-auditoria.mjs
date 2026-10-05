import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const dom = new JSDOM('<body><main></main></body>', { runScripts:'outside-only',url:'https://test.invalid/' });
const w = dom.window;
w.eval(readFileSync('ui.js','utf8')+'\n'+readFileSync('acervo.js','utf8'));
let modal, uploads, salvos, falhar;
w.abrirModal = opts => { const fundo=w.document.createElement('div'); fundo.innerHTML=opts.corpo+'<footer><button>Salvar</button></footer>';w.document.body.appendChild(fundo);modal={opts,fundo};return fundo; };
w.toast=()=>{};w.render=()=>{};w.fecharEste=f=>f.remove();
w.subirArquivos=async ([file]) => { uploads.push(file.name);return [{id:'arquivo-'+file.name}]; };
w.salvar=(_c,r)=>{if(falhar){falhar=false;throw new Error('sem espaço');}salvos.push(r);return r;};
function iniciar(){uploads=[];salvos=[];falhar=true;w.formularioTreinamento();modal.fundo.querySelector('[data-campo=nome]').value='Instalação';}
function arquivo(nome){Object.defineProperty(modal.fundo.querySelector('#treinArq'),'files',{configurable:true,value:nome?[new w.File(['conteúdo '+nome],nome,{type:'application/pdf'})]:[]});}
async function salvar(){await modal.opts.acoes.find(a=>a.texto==='Salvar').aoClicar(modal.fundo);}
let checks=0;
for(const [nome,teste] of [
 ['Retentativa do mesmo arquivo não reenvia upload concluído',async()=>{iniciar();arquivo('A.pdf');await salvar();await salvar();assert.deepEqual(uploads,['A.pdf']);assert.equal(salvos[0].arquivoId,'arquivo-A.pdf');}],
 ['Trocar arquivo após falha grava o conteúdo e o nome novos',async()=>{iniciar();arquivo('A.pdf');await salvar();arquivo('B.pdf');await salvar();assert.deepEqual(uploads,['A.pdf','B.pdf']);assert.equal(salvos[0].arquivoId,'arquivo-B.pdf');assert.equal(salvos[0].arquivoNome,'B.pdf');}],
 ['Remover arquivo e usar link não mantém anexo anterior',async()=>{iniciar();arquivo('A.pdf');await salvar();arquivo(null);modal.fundo.querySelector('[data-campo=link]').value='https://example.test/video';await salvar();assert.equal(salvos[0].arquivoId,'');assert.equal(salvos[0].arquivoNome,'');}]
]){await teste();checks++;console.log('✓ '+nome);}
console.log(`${checks} verificações de identidade de anexos passaram`);
