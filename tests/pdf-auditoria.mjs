// Usa o jsPDF distribuído com o app, sem navegador, rede, clientes ou gravação.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const base=process.env.COMPRAS_PDF_SOURCE || process.cwd();
const c=vm.createContext({console,atob,btoa,Blob,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,setTimeout,clearTimeout,navigator:{userAgent:'Node PDF regression'}});
c.window=c; c.self=c;
vm.runInContext(readFileSync(resolve(base,'libs/jspdf.umd.min.js'),'utf8'),c);
const RealPDF=c.jspdf.jsPDF;
let ultimo,fetches=[];
c.jspdf.jsPDF=function(opts){
  const doc=new RealPDF(opts),textos=[],imagens=[];
  const text=doc.text.bind(doc),image=doc.addImage.bind(doc);
  doc.text=function(valor,x,y,...args){
    const linhas=Array.isArray(valor)?valor:[String(valor)];
    const passo=doc.getFontSize()/doc.internal.scaleFactor*doc.getLineHeightFactor();
    linhas.forEach((linha,i)=>textos.push({texto:String(linha),x,y:y+i*passo,pagina:doc.internal.getCurrentPageInfo().pageNumber}));
    return text(valor,x,y,...args);
  };
  doc.addImage=function(imagem,tipo,x,y,w,h,...resto){imagens.push({tipo,x,y,w,h});return image(imagem,tipo,x,y,w,h,...resto);};
  doc.save=nome=>{doc.nome=nome;return doc;};
  doc.textos=textos; doc.imagens=imagens; ultimo=doc; return doc;
};
c.fetch=async url=>{fetches.push(url);throw new Error('Teste sem rede');};
c.fmt={cnpj:v=>v||'',telefone:v=>v||'',data:v=>v||'',numero:v=>String(v||0),brl:v=>'R$ '+Number(v||0).toFixed(2)};
c.totaisOC=o=>{const total=(o.itens||[]).reduce((n,i)=>n+Number(i.qtd||0)*Number(i.preco||0),0);return {total,totalLiquido:total,ipi:0,icms:0,difal:0};};
vm.runInContext(readFileSync(resolve(base,'pdf.js'),'utf8'),c);

let checks=0,failures=0;
async function test(nome,fn){try{await fn();checks++;console.log('OK '+nome);}catch(e){failures++;console.error('FALHOU '+nome+': '+e.message);}}
const ordem=(extra={})=>({codigo:'OC-TESTE',dataEmissao:'2026-10-05',fornecedor:{nome:'Fornecedor fictício',endereco:'Rua de teste, 1'},itens:[{descricao:'Material fictício',qtd:2,preco:10,unid:'UN'}],...extra});
const cfg={empresa:{nome:'Empresa fictícia',nomeCurto:'Teste'},clausulasOC:[]};
async function gerar(o,config=cfg){await c.pdfOC(o,config);return ultimo;}
function noPapel(doc){
  const fora=doc.textos.filter(x=>x.y>276&&x.y!==289);
  assert.equal(fora.length,0,fora.slice(0,3).map(x=>`p${x.pagina} y=${x.y.toFixed(1)} ${x.texto.slice(0,55)}`).join(' | '));
}
function completo(doc,prefixo,total){
  for(let i=0;i<total;i++)assert.equal(doc.textos.filter(x=>x.texto===prefixo+i).length,1,'Conteúdo ausente ou duplicado: '+prefixo+i);
}

await test('OC comum produz PDF válido sem texto além da área de conteúdo',async()=>{
  const doc=await gerar(ordem());noPapel(doc);
  assert(doc.output().startsWith('%PDF-'));
  assert(doc.nome.startsWith('OC-TESTE-'));
  assert(doc.textos.some(x=>x.texto==='VALOR LÍQUIDO FINAL'));
});
await test('Logo usa arquivo existente e mantém sua proporção original',()=>{
  assert.equal(fetches[0],'icons/logo-impresilk.png');
  const doc=new c.jspdf.jsPDF({unit:'mm',format:'a4'});
  const logo='data:image/png;base64,'+readFileSync('icons/logo-impresilk.png').toString('base64');
  const original=doc.getImageProperties(logo);
  c.cabecalhoPDF(doc,logo,cfg,'TESTE','TESTE');
  assert.equal(doc.imagens.length,1);
  assert(Math.abs(doc.imagens[0].w/doc.imagens[0].h-original.width/original.height)<0.0001);
});
await test('Campos longos preservam o final do conteúdo sem ultrapassar a página',async()=>{
  const doc=await gerar(ordem({fornecedor:{nome:'Fornecedor',endereco:Array.from({length:90},(_,i)=>'ENDERECO-'+i).join('\n')+'\nFIM-DO-ENDERECO'}}));
  assert(doc.textos.some(x=>x.texto.includes('FIM-DO-ENDERECO')),'Final do endereço foi descartado');completo(doc,'ENDERECO-',90);noPapel(doc);
});
await test('Títulos e cabeçalhos respeitam a margem depois de campos com muitas linhas',async()=>{
  for(let linhas=20;linhas<=65;linhas++){
    const doc=await gerar(ordem({dadosBancarios:Array.from({length:linhas},(_,i)=>'DADO-'+i).join('\n')}));
    try{noPapel(doc);}catch(e){throw new Error('Dados bancários com '+linhas+' linhas: '+e.message);}
  }
});
await test('Descrição de um único item maior que uma página não é cortada',async()=>{
  const doc=await gerar(ordem({itens:[{descricao:Array.from({length:100},(_,i)=>'DESCRICAO-'+i).join('\n')+'\nFIM-DO-ITEM',qtd:1,preco:10}]}));
  assert(doc.textos.some(x=>x.texto==='FIM-DO-ITEM'));completo(doc,'DESCRICAO-',100);noPapel(doc);
});
await test('Observações extensas mantêm todas as linhas em páginas válidas',async()=>{
  const doc=await gerar(ordem({observacoes:Array.from({length:150},(_,i)=>'OBSERVACAO-'+i).join('\n')+'\nFIM-DAS-OBSERVACOES'}));
  assert(doc.textos.some(x=>x.texto==='FIM-DAS-OBSERVACOES'));completo(doc,'OBSERVACAO-',150);noPapel(doc);
});
await test('Cláusula extensa mantém todas as linhas em páginas válidas',async()=>{
  const doc=await gerar(ordem(),{...cfg,clausulasOC:[Array.from({length:150},(_,i)=>'CLAUSULA-'+i).join('\n')+'\nFIM-DAS-CLAUSULAS']});
  assert(doc.textos.some(x=>x.texto==='FIM-DAS-CLAUSULAS'));
  assert(doc.textos.some(x=>x.texto==='1. CLAUSULA-0'));
  for(let i=1;i<150;i++)assert.equal(doc.textos.filter(x=>x.texto==='CLAUSULA-'+i).length,1);
  noPapel(doc);
});

console.log(`${checks} verificações de PDF passaram; ${failures} falharam.`);
if(failures)process.exitCode=1;
