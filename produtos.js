/* Modelos de especificação. Não são estoque, ofertas ou equivalências de marcas. */
const CORES_MATERIAIS = [['Branco','#ffffff'],['Preto','#202733'],['Azul','#1754b8'],['Azul-marinho','#182d58'],['Vermelho','#c92735'],['Amarelo','#f5cd35'],['Verde','#258353'],['Laranja','#ed791b'],['Cinza','#92999f'],['Prata','#ccd2d8'],['Dourado','#bd9b51'],['Transparente','#edf5f8'],['Leitoso','#f0eee3']];
const FONTES_MATERIAIS = [
  {nome:'BOLD · mostruário de ACM',url:'https://institucional.bold.net/wp-content/uploads/2023/11/Mostruario_ACM_BOLD-2024.pdf'},
  {nome:'BOLD · materiais para comunicação visual',url:'https://institucional.bold.net/wp-content/uploads/2026/04/catalogo_comunicacao_visual_pdv.pdf'},
  {nome:'3M · filmes gráficos',url:'https://www.3m.com.br/3M/pt_BR/p/c/filmes-peliculas/filmes-graficos/'},
  {nome:'Imprimax · autoadesivos',url:'https://www.imprimax.com.br/'}
];
const atributosProduto = {
  cor: {rot:'Cor',op:CORES_MATERIAIS.map(c=>c[0]),padrao:'Branco'},
  acabamento:{rot:'Acabamento',op:['Brilho','Fosco','Metálico','Escovado','Amadeirado'],padrao:'Brilho'},
  espessura:{rot:'Espessura (mm)',numero:true,padrao:'3'},
  largura:{rot:'Largura (mm)',numero:true,padrao:'1220'},
  altura:{rot:'Comprimento da chapa (mm)',numero:true,padrao:'2440'},
  comprimento:{rot:'Comprimento do rolo (m)',numero:true,padrao:'50',rolo:true},
  gramatura:{rot:'Gramatura (g/m²)',numero:true,padrao:'440'},
  tensao:{rot:'Tensão de saída / operação',op:['12 V','24 V'],padrao:'12 V'},
  potencia:{rot:'Potência (W/m)',numero:true,padrao:''},
  corrente:{rot:'Corrente de saída (A)',numero:true,padrao:'20'},
  protecao:{rot:'Grau de proteção',op:['IP20','IP65','IP67','IP68'],padrao:'IP20'},
  luz:{rot:'Cor da luz',op:['Branco frio','Branco neutro','Branco quente','RGB'],padrao:'Branco frio'},
  tecnologia:{rot:'Construção do vinil',op:['Calandrado monomérico','Calandrado polimérico','Cast'],padrao:'Calandrado monomérico'},
  cola:{rot:'Adesivo',op:['Permanente','Removível','Reposicionável'],padrao:'Permanente'},
  base:{rot:'Material da fita',op:['Espuma acrílica','Espuma de polietileno','Não tecido'],padrao:'Espuma acrílica'}
};
const MODELOS_PRODUTOS = [
  {id:'acm-pe',nome:'ACM poliéster',icone:'▧',grupo:'Chapas',campos:['cor','acabamento','espessura','largura','altura'],unidades:['chapa','m²'],padrao:{altura:'5000'},dica:'Defina também a lâmina de alumínio, o núcleo e o código da cor quando o projeto exigir. Poliéster é o tipo de pintura.'},
  {id:'acm-pvdf',nome:'ACM PVDF',icone:'▧',grupo:'Chapas',campos:['cor','acabamento','espessura','largura','altura'],unidades:['chapa','m²'],padrao:{espessura:'4',altura:'5000'},dica:'Confira pintura, lâmina, núcleo e especificação do projeto. Mantenha separado do ACM poliéster.'},
  {id:'vinil-recorte',nome:'Adesivo vinílico para recorte',icone:'◒',grupo:'Adesivos',campos:['cor','acabamento','tecnologia','cola','largura','comprimento'],unidades:['m','bobina'],padrao:{largura:'1220'},dica:'A cor na tela é ilustrativa. Informe o código ou padrão da cor para comparar fornecedores.'},
  {id:'vinil-impressao',nome:'Adesivo para impressão',icone:'◒',grupo:'Adesivos',campos:['cor','acabamento','tecnologia','cola','largura','comprimento'],unidades:['m','bobina'],padrao:{largura:'1060'},dica:'Confira compatibilidade com a tinta, impressora, superfície e tempo de uso.'},
  {id:'vinil-blackout',nome:'Adesivo blackout',icone:'◒',grupo:'Adesivos',campos:['cor','acabamento','tecnologia','cola','largura','comprimento'],unidades:['m','bobina'],padrao:{largura:'1060',acabamento:'Fosco'},dica:'Confira a opacidade e a cor do adesivo no verso. Blackout não equivale a vinil branco comum.'},
  {id:'vinil-translucido',nome:'Adesivo translúcido',icone:'◒',grupo:'Adesivos',campos:['cor','acabamento','tecnologia','cola','largura','comprimento'],unidades:['m','bobina'],padrao:{largura:'1220'},dica:'Para comparar, confira referência de cor e transmissão de luz na ficha do produto.'},
  {id:'vinil-automotivo',nome:'Adesivo automotivo',icone:'◒',grupo:'Adesivos',campos:['cor','acabamento','tecnologia','cola','largura','comprimento'],unidades:['m','bobina'],padrao:{largura:'1270',tecnologia:'Cast'},dica:'Confira curvas, canais de ar, removibilidade e aplicação autorizada pelo fabricante.'},
  {id:'ps',nome:'PS — poliestireno',icone:'▤',grupo:'Chapas',campos:['cor','espessura','largura','altura'],unidades:['chapa','m²'],padrao:{cor:'Leitoso',espessura:'2'},dica:'Confirme o grau do PS e a difusão de luz. PS, PSAI e acrílico têm cadastros separados.'},
  {id:'psai',nome:'PSAI — alto impacto',icone:'▤',grupo:'Chapas',campos:['cor','espessura','largura','altura'],unidades:['chapa','m²'],padrao:{espessura:'2'},dica:'Registre o grau e a aplicação pretendida. Não vincule PS standard como equivalente.'},
  {id:'acrilico',nome:'Acrílico',icone:'◇',grupo:'Chapas',campos:['cor','espessura','largura','altura'],unidades:['chapa','m²'],padrao:{cor:'Leitoso',espessura:'2'},dica:'Informe cast ou extrudado e, para luminosos, a referência de transmissão de luz.'},
  {id:'pvc',nome:'PVC expandido',icone:'▤',grupo:'Chapas',campos:['cor','espessura','largura','altura'],unidades:['chapa','m²'],padrao:{espessura:'10'},dica:'Confira densidade, tolerância de espessura e superfície para impressão ou pintura.'},
  {id:'policarbonato',nome:'Policarbonato compacto',icone:'◇',grupo:'Chapas',campos:['cor','espessura','largura','altura'],unidades:['chapa','m²'],padrao:{cor:'Transparente',espessura:'5',largura:'2050',altura:'3000'},dica:'Confira proteção UV, face protegida e tamanho comercial. Não substitui automaticamente o alveolar.'},
  {id:'mdf',nome:'MDF cru',icone:'▥',grupo:'Chapas',campos:['espessura','largura','altura'],unidades:['chapa','m²'],padrao:{espessura:'3',largura:'1850',altura:'2750'},dica:'Separe espessuras e dimensões. Indique requisitos de umidade e acabamento quando aplicáveis.'},
  {id:'lona-front',nome:'Lona frontlight',icone:'▱',grupo:'Lonas',campos:['acabamento','gramatura','largura','comprimento'],unidades:['m','bobina'],padrao:{largura:'3200'},dica:'Confira trama, gramatura e compatibilidade de impressão. Metros lineares e bobinas não são a mesma unidade.'},
  {id:'canvas',nome:'Lona canvas',icone:'▱',grupo:'Lonas',campos:['gramatura','largura','comprimento'],unidades:['m','bobina'],padrao:{largura:'1520',gramatura:''},dica:'Informe composição, textura e tinta compatível. A gramatura depende do produto escolhido.'},
  {id:'fita-dupla',nome:'Fita dupla face',icone:'◎',grupo:'Fixação',campos:['base','espessura','largura','comprimento'],unidades:['rolo','m'],padrao:{espessura:'1.6',largura:'19',comprimento:'20'},dica:'Confira substratos, temperatura e exigência de fixação. Marcas e linhas não são equivalentes só pela medida.'},
  {id:'led',nome:'Fita LED',icone:'☀',grupo:'Iluminação',campos:['tensao','luz','potencia','protecao','comprimento'],unidades:['m','rolo'],padrao:{comprimento:'5'},dica:'Informe potência por metro e confirme tensão, proteção e comprimento antes de dimensionar a fonte.'},
  {id:'fonte',nome:'Fonte para LED',icone:'ϟ',grupo:'Iluminação',campos:['tensao','corrente','protecao'],unidades:['un'],dica:'Registre a entrada elétrica, dimensões e modelo na especificação complementar.'}
];
function camposModelo(modelo,unidade){return modelo.campos.filter(k=>!atributosProduto[k].rolo||['rolo','bobina'].includes(unidade));}
function valoresModelo(modelo){return Object.fromEntries(modelo.campos.map(k=>[k,modelo.padrao?.[k]??atributosProduto[k].padrao]));}
function opcoesAtributoProduto(modelo,k){const op=atributosProduto[k].op;if(k==='cor'&&modelo.id.startsWith('acm-'))return op.filter(c=>!['Transparente','Leitoso'].includes(c));if(k==='cor'&&modelo.id==='vinil-blackout')return ['Branco'];if(k==='acabamento'&&modelo.grupo==='Lonas')return ['Brilho','Fosco'];return op;}
function montarProduto(modeloId,dados){
  const modelo=MODELOS_PRODUTOS.find(m=>m.id===modeloId);
  if(!modelo||!modelo.unidades.includes(dados.unidade))throw new Error('Escolha uma unidade válida para este material.');
  const partes=[],parametros={};
  for(const k of camposModelo(modelo,dados.unidade)){
    const a=atributosProduto[k];let v=String(dados[k]??'').trim();
    if(a.numero){if(!/^\d+(?:[.,]\d+)?$/.test(v)||Number(v.replace(',','.'))<=0||Number(v.replace(',','.'))>100000)throw new Error('Preencha '+a.rot.toLowerCase()+' com uma medida válida.');v=String(Number(v.replace(',','.'))).replace('.',',');}
    else if(!opcoesAtributoProduto(modelo,k).includes(v))throw new Error('Selecione '+a.rot.toLowerCase()+'.');
    parametros[k]=v;partes.push(a.rot.replace(/ \((.*?)\)/,'')+': '+v+(a.numero&&a.rot.includes('(')?' '+a.rot.match(/\((.*?)\)/)[1]:''));
  }
  const referencia=String(dados.referencia||'').trim(),complemento=String(dados.complemento||'').trim();
  const resumo=Object.entries(parametros).filter(([k])=>!['largura','altura','comprimento'].includes(k)).map(([k,v])=>v+(atributosProduto[k].numero?' '+atributosProduto[k].rot.match(/\((.*?)\)/)[1]:''));
  if(parametros.largura)resumo.push(parametros.altura?parametros.largura+' × '+parametros.altura+' mm':'larg. '+parametros.largura+' mm');
  if(parametros.comprimento)resumo.push('rolo '+parametros.comprimento+' m');
  const nome=modelo.nome+' — '+resumo.join(' · ')+(referencia?' · ref. '+referencia:'');
  if(nome.length>300)throw new Error('Abrevie a referência para manter o nome em até 300 caracteres.');
  return {nome,unidade:dados.unidade,categoria:modelo.grupo,especificacao:partes.join('\n')+(referencia?'\nReferência exigida: '+referencia:'')+(complemento?'\n'+complemento:''),modeloId, parametros,referencia,complemento,ativo:true};
}
function materialModeloExistente(p){return redeAtivos('mat').find(m=>chaveNome(m.nome)===chaveNome(p.nome)&&m.unidade===p.unidade&&chaveNome(m.especificacao||'')===chaveNome(p.especificacao||''));}
function configurarProduto(modeloId,aoSalvar){
  const modelo=MODELOS_PRODUTOS.find(m=>m.id===modeloId);if(!modelo)return;
  const valores={...valoresModelo(modelo),unidade:modelo.unidades[0]};
  const fundo=abrirModal({titulo:'Montar '+modelo.nome,largo:true,corpo:'<div class="produto-config"><div><p class="legenda">Modelo pronto · ajuste as medidas à sua compra.</p><div id="produtoForm">'+campo('Unidade da cotação',seletor('unidade',valores.unidade,modelo.unidades))+'<div class="produto-campos">'+modelo.campos.map(k=>{const a=atributosProduto[k];return '<div data-atributo="'+k+'">'+campo(a.rot,a.numero?entrada(k,valores[k],{inputmode:'decimal'}):seletor(k,valores[k],opcoesAtributoProduto(modelo,k)))+(k==='cor'?'<div class="produto-cores">'+CORES_MATERIAIS.filter(([n])=>opcoesAtributoProduto(modelo,'cor').includes(n)).map(([n,c])=>'<button type="button" data-cor="'+esc(n)+'" style="--amostra:'+c+'" aria-label="Cor '+esc(n)+'" title="'+esc(n)+'"></button>').join('')+'</div>':'')+'</div>';}).join('')+'</div>'+campo('Referência exigida (opcional)',entrada('referencia','',{placeholder:'Código da cor, padrão, linha ou modelo'}))+campo('Especificação complementar',areaTexto('complemento','',modelo.dica))+'</div></div><aside class="produto-preview"><span class="rede-kicker">Assim vai para a cotação</span><h3 id="produtoNome"></h3><p id="produtoUnidade"></p><p class="legenda">'+esc(modelo.dica)+'</p><p class="legenda">Confirme a disponibilidade com o fornecedor. As cores são ilustrativas.</p><div id="produtoErro" class="aviso atencao" role="status" hidden></div></aside></div>',acoes:[{texto:'Cancelar',aoClicar:f=>fecharEste(f)},{texto:aoSalvar?'Salvar e usar no item':'Salvar produto',classe:'primario',aoClicar:f=>{
    try{const p=montarProduto(modeloId,lerCampos(f.querySelector('#produtoForm'))),existente=materialModeloExistente(p);if(!existente&&redeAtivos('mat').some(m=>chaveNome(m.nome)===chaveNome(p.nome)&&m.unidade===p.unidade))throw new Error('Já existe esse nome com outra especificação. Informe uma referência para diferenciar a variação.');const salvo=existente||salvar('mat',p);fecharEste(f);if(aoSalvar)aoSalvar(salvo);else{location.hash='#/materiais/'+salvo.id;render();}toast(existente?'Produto existente selecionado.':'Produto salvo para usar nas cotações.');}catch(e){toast(e.message,'ruim');}
  }}]});
  ligarRotulosRede(fundo);
  const form=fundo.querySelector('#produtoForm');
  function atualizar(){const d=lerCampos(form),visiveis=camposModelo(modelo,d.unidade);form.querySelectorAll('[data-atributo]').forEach(e=>e.hidden=!visiveis.includes(e.dataset.atributo));form.querySelectorAll('[data-cor]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cor===d.cor)));try{const p=montarProduto(modeloId,d);fundo.querySelector('#produtoNome').textContent=p.nome;fundo.querySelector('#produtoUnidade').textContent='Comparar por '+p.unidade;fundo.querySelector('#produtoErro').hidden=true;}catch(e){fundo.querySelector('#produtoNome').textContent=modelo.nome;fundo.querySelector('#produtoUnidade').textContent='Complete as especificações';const aviso=fundo.querySelector('#produtoErro');aviso.textContent=e.message;aviso.hidden=false;}}
  form.addEventListener('input',atualizar);form.addEventListener('change',atualizar);form.querySelectorAll('[data-cor]').forEach(b=>b.onclick=()=>{form.querySelector('[data-campo="cor"]').value=b.dataset.cor;atualizar();});atualizar();
}
function htmlBibliotecaProdutos(){return '<section class="cartao produto-biblioteca"><div class="rede-titulo"><div><span class="rede-kicker">Biblioteca Impresilk · '+MODELOS_PRODUTOS.length+' modelos</span><h2>Escolha o material. Ajuste a variação.</h2><p class="legenda">Cor, acabamento e medidas em uma descrição pronta para cotar.</p></div></div><div class="produto-modelos">'+MODELOS_PRODUTOS.map(m=>'<button class="produto-modelo" data-modelo="'+m.id+'" data-rede-texto="'+esc(m.nome+' '+m.grupo)+'"><span class="produto-simbolo" aria-hidden="true">'+m.icone+'</span><span><small>'+m.grupo+'</small><b>'+m.nome+'</b></span><span aria-hidden="true">↗</span></button>').join('')+'</div><details class="produto-fontes"><summary>Como usar os modelos</summary><p>Os modelos não representam estoque nem disponibilidade de um fornecedor. Salve a variação desejada e vincule os nomes comerciais. Compare apenas a mesma especificação e unidade; bobinas, chapas e metros não são convertidos automaticamente.</p><p>Referências de materiais: '+FONTES_MATERIAIS.map(f=>'<a href="'+esc(f.url)+'" target="_blank" rel="noopener noreferrer">'+esc(f.nome)+' ↗</a>').join(' · ')+'</p></details></section>';}
function ligarBibliotecaProdutos(el,aoSalvar){el.querySelectorAll('[data-modelo]').forEach(b=>b.onclick=()=>configurarProduto(b.dataset.modelo,aoSalvar));}
function escolherModeloProduto(aoSalvar){const f=abrirModal({titulo:'Produtos prontos para configurar',largo:true,corpo:htmlBibliotecaProdutos()});ligarBibliotecaProdutos(f,m=>{fecharEste(f);aoSalvar(m);});}
function historicoMateriais(){
  // A mesma compra pode ter SC e OC: priorize OC e não anuncie contagem de consumo.
  const vistos=new Map();
  for(const col of ['oc','sc'])for(const r of lista(col)){
    if(r.situacao==='cancelada')continue;
    for(const i of r.itens||[]){const nome=String(i.descricao||i.desc||'').trim();if(!nome)continue;const unidade=i.unid||'un',k=chaveNome(nome)+'|'+unidade;if(!vistos.has(k))vistos.set(k,{nome,unidade,codigo:r.codigo||'',rota:col==='oc'?'compras':'solicitacoes',id:r.id});}
  }
  return [...vistos.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
}
