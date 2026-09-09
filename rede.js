/* Rede de suprimentos: identidades explícitas, sem agrupar por semelhança. */
function redeAtivos(col) {
  const registros = lista(col).filter(x => x.ativo !== false);
  if (col === 'forn') return ordenarFornecedores(registros);
  return registros.sort((a,b) => String(a.nome || a.nomeFornecedor || '').localeCompare(String(b.nome || b.nomeFornecedor || ''), 'pt-BR'));
}
function navRede(ativo) {
  return '<nav class="rede-nav" aria-label="Rede de suprimentos">' + [['fornecedores','🏢','Fornecedores'],['transportadoras','🚚','Transportadoras'],['materiais','📦','Materiais padrão']].map(([r,i,t]) => '<a class="btn' + (r === ativo ? ' primario' : '') + '" href="#/' + r + '"' + (r === ativo ? ' aria-current="page"' : '') + '>' + i + ' ' + t + '</a>').join('') + '</nav>';
}
function opcoesRede(col) { return redeAtivos(col).map(x => ({v:x.id,t:x.nome})); }
function ofertasFornecedor(id) { return redeAtivos('oferta').filter(x => x.fornecedorId === id); }
function ofertaMaterial(fornecedorId, item) {
  if (!item.materialId) return null;
  const m = achar('mat', item.materialId);
  if (!m || m.apagadoEm || m.ativo === false || m.unidade !== item.unid) return null;
  return ofertasFornecedor(fornecedorId).find(x => x.materialId === item.materialId && x.unidade === item.unid) || null;
}
function nomesParaFornecedor(fornecedorId, itens) {
  return Object.fromEntries((itens || []).flatMap(i => {
    const o = ofertaMaterial(fornecedorId,i);
    return o ? [[i.id,{nome:o.nomeFornecedor,codigo:o.codigo || '',unidade:o.unidade,materialId:i.materialId}]] : [];
  }));
}
function urlCatalogo(valor) {
  try { const u = new URL(String(valor || '').trim()); return ['https:','http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch (_) { return ''; }
}
function catalogosFornecedor(id) { return lista('proj').filter(p => p.fornecedorId === id); }
function htmlPortfolioFornecedor(f) {
  const ofertas = lista('oferta').filter(o=>o.fornecedorId===f.id), cats = catalogosFornecedor(f.id);
  return navRede('fornecedores') + '<section class="cartao rede-portfolio"><div class="rede-titulo"><div><span class="rede-kicker">Guia de fornecimento</span><h2>O que comprar aqui</h2><p class="legenda">' + esc(f.categorias || 'Descreva no cadastro o que este fornecedor vende.') + '</p></div><button class="btn primario" data-oferta-nova>+ Vincular material</button></div>' +
    (ofertas.length ? '<div class="rede-lista">' + ofertas.map(o => { const m=achar('mat',o.materialId); return '<article class="rede-linha"><span class="rede-icone">📦</span><div><b>' + esc(m ? m.nome : 'Material indisponível') + '</b><p>Vendido como <strong>' + esc(o.nomeFornecedor) + '</strong>' + (o.codigo ? ' · cód. '+esc(o.codigo) : '') + '</p><small>' + esc(o.unidade) + (o.embalagem ? ' · '+esc(o.embalagem) : '') + (o.obs ? ' · '+esc(o.obs) : '') + '</small>' + (o.ativo===false?'<p class="legenda">Vínculo arquivado</p>':'') + (o.catalogoId&&achar('proj',o.catalogoId)?'<p><button class="btn pequeno" data-portfolio-arquivo="'+esc(o.catalogoId)+'">Catálogo deste produto</button></p>':'') + '</div><button class="btn pequeno" data-oferta="'+esc(o.id)+'">Editar vínculo</button></article>'; }).join('') + '</div>' : '<div class="rede-vazio">Nenhum material vinculado. Cadastre o nome padrão e informe como este fornecedor chama o produto.</div>') +
    '<div class="rede-titulo"><div><h3>📚 Catálogos do fornecedor</h3><p class="legenda">Arquivos e links para consultar antes de cotar.</p></div><div class="acoes"><button class="btn" data-catalogo-arquivo>Enviar arquivo</button><button class="btn" data-catalogo-link>Adicionar link</button><button class="btn" data-catalogo-vincular>Vincular existente</button></div></div>' +
    (cats.length ? '<div class="rede-lista">'+ cats.map(p => '<article class="rede-linha"><span class="rede-icone">📄</span><div><b>'+esc(p.nome)+'</b><p>'+esc(p.descricao || p.disciplina || '')+'</p></div>'+(p.arquivoId ? '<button class="btn pequeno" data-portfolio-arquivo="'+esc(p.id)+'">Abrir</button>' : urlCatalogo(p.url) ? '<a class="btn pequeno" href="'+esc(urlCatalogo(p.url))+'" target="_blank" rel="noopener noreferrer">Abrir link ↗</a>' : '<span>Link inválido</span>')+'<button class="btn pequeno" data-catalogo-editar="'+esc(p.id)+'">Editar vínculo</button></article>').join('')+'</div>' : '<p class="legenda">Adicione o primeiro catálogo.</p>') + '</section>';
}
function ligarPortfolioFornecedor(el,f) {
  el.querySelector('[data-oferta-nova]').onclick=()=>editarOferta(null,f.id);
  el.querySelectorAll('[data-oferta]').forEach(b=>b.onclick=()=>editarOferta(b.dataset.oferta,f.id));
  el.querySelector('[data-catalogo-arquivo]').onclick=()=>{const i=document.createElement('input');i.type='file';i.multiple=true;i.onchange=()=>formularioCatalogo(i.files,f.id);i.click();};
  el.querySelector('[data-catalogo-link]').onclick=()=>editarLinkCatalogo(null,f.id);
  el.querySelector('[data-catalogo-vincular]').onclick=()=>vincularCatalogo(f.id);
  el.querySelectorAll('[data-portfolio-arquivo]').forEach(b=>b.onclick=()=>menuCatalogo(b.dataset.portfolioArquivo));
  el.querySelectorAll('[data-catalogo-editar]').forEach(b=>b.onclick=()=>editarLinkCatalogo(b.dataset.catalogoEditar,f.id));
}
function editarLinkCatalogo(id, fornecedorId) {
  const p=achar('proj',id)||{};
  abrirModal({titulo:id?'Editar catálogo':'Adicionar link do catálogo',corpo:'<div id="redeForm">'+campo('Título',entrada('nome',p.nome))+campo('Fornecedor',seletor('fornecedorId',p.fornecedorId||fornecedorId,opcoesRede('forn'),'Sem vínculo'))+(!p.arquivoId?campo('Link do catálogo',entrada('url',p.url,{tipo:'url',placeholder:'https://…'})):'')+campo('Descrição',areaTexto('descricao',p.descricao))+'</div>',acoes:[{texto:'Cancelar',aoClicar:f=>fecharEste(f)},{texto:'Salvar',classe:'primario',aoClicar:f=>{const d=lerCampos(f.querySelector('#redeForm'));if(!d.nome.trim()||(!p.arquivoId&&!urlCatalogo(d.url))){toast('Informe o título e um link http ou https válido.','ruim');return;}salvar('proj',{...p,...d,url:p.arquivoId?p.url:urlCatalogo(d.url)});fecharEste(f);render();}}]});
}
function vincularCatalogo(fornecedorId) {
  const ps=lista('proj').filter(p=>!p.fornecedorId);
  abrirModal({titulo:'Vincular catálogo existente',corpo:'<div id="redeForm">'+campo('Catálogo sem fornecedor',seletor('catalogoId','',ps.map(p=>({v:p.id,t:p.nome})),'Escolha um catálogo'))+'</div><p class="legenda">Catálogos já vinculados podem ser alterados pela ficha do fornecedor atual.</p>',acoes:[{texto:'Cancelar',aoClicar:f=>fecharEste(f)},{texto:'Vincular',classe:'primario',aoClicar:f=>{const d=lerCampos(f.querySelector('#redeForm'));const p=achar('proj',d.catalogoId);if(!p||p.fornecedorId){toast('Escolha um catálogo disponível.','ruim');return;}salvar('proj',{...p,fornecedorId});fecharEste(f);render();}}]});
}
function editarMaterial(id) {
  const m=achar('mat',id)||{};
  abrirModal({titulo:id?'Editar material padrão':'Novo material padrão',corpo:'<div id="redeForm">'+campo('Nome padrão, incluindo medida e especificação',entrada('nome',m.nome,{placeholder:'Ex.: ACM branco 3 mm — chapa 1,22 × 5 m'}))+ '<div class="linha">'+campo('Unidade de comparação',seletor('unidade',m.unidade||'un',[...new Set([...unidades(),m.unidade].filter(Boolean))]))+campo('Família / categoria',entrada('categoria',m.categoria))+'</div>'+campo('Especificação que deve ser igual em todos os fornecedores',areaTexto('especificacao',m.especificacao,'Medidas, espessura, composição, acabamento…'))+campo('Código no Mubisys (opcional)',entrada('mubiId',m.mubiId))+campo('Situação',seletor('situacao',m.ativo===false?'inativo':'ativo',[{v:'ativo',t:'Ativo'},{v:'inativo',t:'Arquivado — mantém o histórico'}]))+'</div><p class="legenda">Use materiais separados para espessuras, tamanhos ou unidades diferentes. Os nomes comerciais serão vinculados na ficha de cada fornecedor.</p>',acoes:[{texto:'Cancelar',aoClicar:f=>fecharEste(f)},{texto:'Salvar material',classe:'primario',aoClicar:f=>{const d=lerCampos(f.querySelector('#redeForm'));if(!d.nome.trim()){toast('Informe o nome padrão.','ruim');return;}if(id&&d.unidade!==m.unidade){toast('Crie outro material para uma unidade diferente.','ruim');return;}if(redeAtivos('mat').some(x=>x.id!==id&&chaveNome(x.nome)===chaveNome(d.nome)&&x.unidade===d.unidade)){toast('Já existe este nome padrão nesta unidade. Use o cadastro existente.','ruim');return;}salvar('mat',{...m,...d,nome:d.nome.trim(),ativo:d.situacao==='ativo'});fecharEste(f);render();}}]});
}
function editarOferta(id, fornecedorId, materialId) {
  const o=achar('oferta',id)||{};
  const mats=opcoesRede('mat');if(o.materialId&&!mats.some(x=>x.v===o.materialId)){const m=achar('mat',o.materialId);if(m)mats.push({v:m.id,t:m.nome+' (arquivado)'});}
  abrirModal({titulo:id?'Editar nome no fornecedor':'Vincular produto do fornecedor',corpo:'<div id="redeForm">'+campo('Fornecedor',seletor('fornecedorId',o.fornecedorId||fornecedorId,opcoesRede('forn'),'Escolha o fornecedor'))+campo('Material padrão',seletor('materialId',o.materialId||materialId,mats,'Escolha o material padrão'))+campo('Nome comercial neste fornecedor',entrada('nomeFornecedor',o.nomeFornecedor))+ '<div class="linha">'+campo('Código do produto neste fornecedor',entrada('codigo',o.codigo))+campo('Embalagem / apresentação',entrada('embalagem',o.embalagem,{placeholder:'Ex.: chapa avulsa'}))+'</div>'+campo('Catálogo deste produto (opcional)',seletor('catalogoId',o.catalogoId,lista('proj').filter(p=>p.fornecedorId).map(p=>({v:p.id,t:((achar('forn',p.fornecedorId)||{}).nome||'Fornecedor')+' · '+p.nome})),'Sem catálogo específico'))+campo('Observações para cotar',areaTexto('obs',o.obs))+campo('Situação',seletor('situacao',o.ativo===false?'inativo':'ativo',[{v:'ativo',t:'Disponível para cotar'},{v:'inativo',t:'Arquivado'}]))+'</div><p class="legenda">A cotação usa a unidade do material padrão. Só vincule produtos com a mesma especificação e unidade; não há conversão automática de caixas, rolos ou metros.</p>',acoes:[{texto:'Cancelar',aoClicar:f=>fecharEste(f)},{texto:'Salvar vínculo',classe:'primario',aoClicar:f=>{const d=lerCampos(f.querySelector('#redeForm')),m=achar('mat',d.materialId);if(!m||!d.fornecedorId||!d.nomeFornecedor.trim()){toast('Selecione fornecedor, material e nome comercial.','ruim');return;}if(redeAtivos('oferta').some(x=>x.id!==id&&x.fornecedorId===d.fornecedorId&&x.materialId===m.id)){toast('Este fornecedor já tem um vínculo com o material. Edite o vínculo existente.','ruim');return;}if(d.catalogoId&&(achar('proj',d.catalogoId)||{}).fornecedorId!==d.fornecedorId){toast('Escolha um catálogo deste mesmo fornecedor.','ruim');return;}salvar('oferta',{...o,...d,unidade:m.unidade,ativo:d.situacao==='ativo'});fecharEste(f);render();}}]});
}
TELAS.materiais=function(el,args){
  const m=args[0]?achar('mat',args[0]):null;
  cabecalho(m?m.nome:'Materiais padrão',m?'Uma especificação, os nomes de cada fornecedor.':'Encontre o mesmo material nos catálogos e compare na mesma unidade.',m?'<a class="btn" href="#/materiais">← Materiais</a><button class="btn" id="editarMat">Editar padrão</button><button class="btn primario" id="novaOferta">+ Vincular fornecedor</button>':'<button class="btn primario" id="novoMat">+ Novo material</button>');
  if(m){const os=redeAtivos('oferta').filter(o=>o.materialId===m.id);el.innerHTML=navRede('materiais')+'<div class="cartao"><span class="rede-kicker">'+esc(m.categoria||'Material')+' · '+esc(m.unidade)+'</span><h2>'+esc(m.nome)+'</h2><p>'+esc(m.especificacao||'Especificação ainda não informada.')+'</p></div><div class="rede-grid">'+os.map(o=>{const f=achar('forn',o.fornecedorId)||{};return '<article class="cartao rede-card"><h3>'+esc(f.nome||'Fornecedor indisponível')+'</h3><p>Vendido como <b>'+esc(o.nomeFornecedor)+'</b></p><p class="legenda">'+esc(o.codigo||'Sem código')+' · '+esc(o.unidade)+'</p><a class="btn" href="#/fornecedores/'+esc(o.fornecedorId)+'">Ver fornecedor e catálogo →</a></article>';}).join('')+'</div>'+(!os.length?vazio('🏢','Nenhum fornecedor vinculado','Vincule os nomes comerciais para usá-los nas cotações.'):'');document.getElementById('editarMat').onclick=()=>editarMaterial(m.id);document.getElementById('novaOferta').onclick=()=>editarOferta(null,'',m.id);return;}
  const ms=lista('mat').sort((a,b)=>String(a.nome).localeCompare(String(b.nome),'pt-BR'));
  el.innerHTML=navRede('materiais')+'<div class="rede-pesquisa">'+campo('Buscar material, especificação ou categoria','<input id="buscaRede" type="search" placeholder="Ex.: ACM, vinil, alumínio…">')+'</div><div class="rede-grid" id="redeCards">'+ms.map(x=>'<a class="cartao rede-card" data-rede-texto="'+esc([x.nome,x.especificacao,x.categoria].join(' ').toLowerCase())+'" href="#/materiais/'+esc(x.id)+'"><span class="rede-kicker">📦 '+esc(x.categoria||'Material')+'</span><h3>'+esc(x.nome)+'</h3><p>'+esc(x.especificacao||'Complete a especificação')+'</p><div class="rede-meta"><span>'+esc(x.unidade)+'</span><span>'+redeAtivos('oferta').filter(o=>o.materialId===x.id).length+' fornecedor(es)</span><span>'+(x.ativo===false?'Arquivado':'Ativo')+'</span></div></a>').join('')+'</div><p id="redeSemBusca" class="legenda" hidden>Nenhum material encontrado.</p>'+(!ms.length?vazio('📦','Crie seu primeiro material padrão','Os nomes antigos permanecem nas compras. Você escolhe quais produtos são equivalentes.'):'');document.getElementById('novoMat').onclick=()=>editarMaterial(null);ligarBuscaRede(el);
};
function ligarBuscaRede(el) {
  const busca = el.querySelector('#buscaRede');
  if (!busca) return;
  const linhas = [...el.querySelectorAll('[data-rede-texto]')];
  const limpar = el.querySelector('#limparBuscaForn');
  const aplicar = () => {
    const q = chaveNome(busca.value);
    let encontrados = 0;
    linhas.forEach(linha => {
      linha.hidden = !chaveNome(linha.dataset.redeTexto).includes(q);
      if (!linha.hidden) encontrados++;
    });
    const mensagem = el.querySelector('#redeSemBusca');
    if (mensagem) mensagem.hidden = encontrados > 0 || !q;
    const contagem = el.querySelector('#fornContagem');
    if (contagem) contagem.textContent = encontrados + ' de ' + linhas.length + ' fornecedores';
    if (limpar) limpar.hidden = !busca.value;
  };
  busca.oninput = aplicar;
  if (limpar) limpar.onclick = () => { busca.value = ''; aplicar(); busca.focus(); };
  aplicar();
}

function htmlDiretorioFornecedores(fs) {
  const ordenados = ordenarFornecedores(fs);
  return '<section class="forn-diretorio" aria-label="Diretório de fornecedores">' +
    '<div class="forn-busca"><div><label for="buscaRede">Buscar fornecedor ou produto</label>' +
      '<div class="forn-busca-campo"><input id="buscaRede" type="search" placeholder="Nome, material, nome comercial ou código…">' +
        '<button class="btn pequeno" id="limparBuscaForn" hidden>Limpar busca</button></div></div>' +
      '<span id="fornContagem" class="legenda" role="status" aria-live="polite">' + ordenados.length + ' fornecedores</span>' +
    '</div>' +
    (ordenados.length ? '<div class="forn-colunas" aria-hidden="true"><span>Fornecedor</span><span>O que fornece</span><span>Produtos e catálogos</span></div>' : '') +
    '<div class="forn-lista">' + ordenados.map(f => {
      const ofertas = ofertasFornecedor(f.id), catalogos = catalogosFornecedor(f.id);
      const materiais = [...new Set(ofertas.map(o => (achar('mat',o.materialId) || {}).nome || o.nomeFornecedor))];
      const contato = [f.contato, f.telefone ? fmt.telefone(f.telefone) : ''].filter(Boolean).join(' · ');
      const inicial = Array.from(String(f.nome || '').trim())[0] || 'F';
      const pesquisa = [f.nome, f.categorias, f.contato, f.cnpj, ...materiais,
        ...ofertas.map(o => [o.nomeFornecedor, o.codigo].filter(Boolean).join(' '))].filter(Boolean).join(' ');
      return '<a class="forn-linha" href="#/fornecedores/' + esc(f.id) + '" data-rede-texto="' + esc(pesquisa) + '">' +
        '<div class="forn-identidade"><span class="forn-inicial" aria-hidden="true">' + esc(inicial.toLocaleUpperCase('pt-BR')) + '</span><div>' +
          '<h3>' + esc(f.nome || 'Fornecedor sem nome') + '</h3>' +
          (contato ? '<p>' + esc(contato) + '</p>' : '<p>Contato não informado</p>') +
        '</div></div>' +
        '<div class="forn-produtos"><span class="forn-rotulo">O que fornece</span>' +
          '<p>' + esc(f.categorias || (materiais.length ? materiais.join(' · ') : 'Produtos ainda não descritos')) + '</p>' +
          (f.categorias && materiais.length ? '<small>' + esc(materiais.slice(0,3).join(' · ')) + (materiais.length > 3 ? ' + ' + (materiais.length - 3) : '') + '</small>' : '') +
        '</div>' +
        '<div class="forn-acervo"><div>' +
          '<span' + (!ofertas.length ? ' class="forn-pendente"' : '') + '>📦 ' + (ofertas.length ? ofertas.length + ' ' + (ofertas.length === 1 ? 'material' : 'materiais') : 'Sem material vinculado') + '</span>' +
          '<span' + (!catalogos.length ? ' class="forn-pendente"' : '') + '>📚 ' + (catalogos.length ? catalogos.length + ' ' + (catalogos.length === 1 ? 'catálogo' : 'catálogos') : 'Sem catálogo') + '</span>' +
        '</div><span class="forn-abrir">Abrir ficha <span aria-hidden="true">→</span></span></div>' +
      '</a>';
    }).join('') + '</div>' +
    (!ordenados.length ? vazio('🏢','Cadastre seu primeiro fornecedor','Informe o que ele vende e vincule seus materiais e catálogos.') : '') +
    '<div id="redeSemBusca" class="forn-sem-busca" hidden><b>Nenhum fornecedor encontrado.</b><p>Tente outro nome, material ou código de produto.</p></div>' +
  '</section>';
}
