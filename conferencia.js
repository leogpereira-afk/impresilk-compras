/* Conferência sob demanda. Documentos do ERP ficam apenas em memória nesta tela.
   Guarda na OC somente a referência que a direção confirmar. */
let consultaERP = null;
TELAS.conferencia = function(el) {
  if (!ehDirecao()) { cabecalho('Conferência', 'Acesso da direção'); el.innerHTML=vazio('🔒','Disponível para a direção'); return; }
  S.formAberto = true; // preservar a conferência enquanto a sincronização atualiza outras coleções
  cabecalho('Conferência com o Mubisys', 'Notas recebidas e contas a pagar', '<a class="btn" href="#/painel">Voltar ao painel</a>');
  const fim=hojeISO(), inicio=new Date(fim+'T12:00:00'); inicio.setDate(inicio.getDate()-6);
  el.innerHTML='<section class="cartao"><h2>Buscar documentos</h2><p class="legenda">Consulte até 7 dias por vez. Notas usam a data de entrada; contas usam o vencimento. A busca não gera pagamentos nem confirma recebimentos.</p>'+
    '<form id="consultaERP" class="filtros"><label>Consultar<select id="erpTipo"><option value="notas">Notas recebidas</option><option value="contas">Contas a pagar · direção</option></select></label><label>De<input id="erpInicio" type="date" value="'+inicio.toISOString().slice(0,10)+'" required></label><label>Até<input id="erpFim" type="date" value="'+fim+'" required></label><button class="btn primario" type="submit">Buscar no Mubisys</button></form></section><div id="erpResultado" aria-live="polite"></div>';
  // New screen = explicit new query; no stale record from another login.
  consultaERP = null;
  const box=el.querySelector('#erpResultado');
  let busy=false;
  async function buscar(pagina=1) {
    if(busy)return;
    const filtros=pagina===1?{tipo:el.querySelector('#erpTipo').value,inicio:el.querySelector('#erpInicio').value,fim:el.querySelector('#erpFim').value}:consultaERP.filtros;
    if(!filtros.inicio||!filtros.fim||filtros.fim<filtros.inicio||(Date.parse(filtros.fim)-Date.parse(filtros.inicio))/86400000>6){toast('Escolha um intervalo de até 7 dias.','ruim');return;}
    busy=true;
    el.querySelectorAll('#consultaERP input,#consultaERP select,#consultaERP button').forEach(x=>x.disabled=true);
    box.innerHTML='<div class="aviso info">Consultando página '+pagina+'… Aguarde a resposta do Mubisys.</div>';
    try {
      const r=await api('conferenciaMubi',{...filtros,pagina});
      if(r.ok!==true||!Array.isArray(r.dados))throw new Error('A consulta não devolveu uma lista válida.');
      if(!box.isConnected || !ehDirecao())return;
      consultaERP={...r,filtros};
      desenhar();
    } catch(e) {consultaERP=null;box.innerHTML='<div class="aviso ruim">'+esc(e.message)+'</div>';}
    finally{busy=false;el.querySelectorAll('#consultaERP input,#consultaERP select,#consultaERP button').forEach(x=>x.disabled=false);}
  }
  function desenhar() {
    const r=consultaERP;
    box.innerHTML='<section class="cartao"><h3>'+ (r.filtros.tipo==='notas'?'Notas recebidas':'Contas a pagar')+'</h3><p class="legenda">Mubisys · consultado '+esc(fmt.dataHora(r.consultadoEm))+' · '+fmt.data(r.filtros.inicio)+' a '+fmt.data(r.filtros.fim)+' · página '+r.pagina+(r.paginas?' de '+r.paginas:'')+'</p>'+
      '<div class="aviso info">Conferência manual. Campos não reconhecidos aparecem como “não informado”; confira os dados de origem. Mesmo fornecedor e valor não provam vínculo.</div>'+
      (r.dados.length?'<div class="tabela-rolagem"><table><thead><tr><th>Documento / fornecedor</th><th>Data</th><th>Valor informado</th><th>Situação no ERP</th><th></th></tr></thead><tbody>'+r.dados.map((d,i)=>'<tr><td><b>'+esc(d.numero||d.id||'Sem identificação')+'</b><div class="meta">'+esc(d.fornecedor||'Fornecedor não informado')+'</div></td><td>'+fmt.data(d.data)+'</td><td>'+ (d.valor==null?'Não informado':fmt.brl(d.valor))+'</td><td>'+esc(d.status||'Não informado')+'</td><td><button class="btn pequeno" data-conferir="'+i+'">Conferir</button></td></tr>').join('')+'</tbody></table></div>':'<p>Nenhum documento nesta página.</p>')+
      '<div class="barra-acoes">'+(r.pagina>1?'<button class="btn" id="erpAnterior">Página anterior</button>':'')+(r.temMais?'<button class="btn" id="erpProxima">Carregar próxima página</button>':'<span class="legenda">Fim da consulta desse período.</span>')+'</div></section>';
    box.querySelector('#erpAnterior')?.addEventListener('click',()=>buscar(r.pagina-1));
    box.querySelector('#erpProxima')?.addEventListener('click',()=>buscar(r.pagina+1));
    box.querySelectorAll('[data-conferir]').forEach(b=>b.addEventListener('click',()=>conferirDocumento(r.dados[Number(b.dataset.conferir)],r)));
  }
  el.querySelector('#consultaERP').addEventListener('submit',e=>{e.preventDefault();buscar();});
};
function conferirDocumento(d, consulta) {
  const ordens=lista('oc').filter(o=>!['cancelada','rascunho'].includes(o.situacao));
  const vinculadas=ordens.filter(o=>(o.referenciasErp||[]).some(r=>!r.desvinculadoEm&&r.tipo===d.tipo&&r.documentoId===d.id));
  const fundo=abrirModal({titulo:'Conferir documento e ordem',largo:true,corpo:
    '<p><b>'+esc(d.numero||d.id||'Documento sem ID')+'</b> · '+esc(d.fornecedor||'Fornecedor não informado')+'</p>'+
    (vinculadas.length?'<div class="aviso info">Referência já presente em '+esc(vinculadas.map(o=>o.codigo||o.id).join(', '))+'. Confira se o documento cobre mais de uma ordem.</div>':'')+
    '<details><summary>Dados de origem do Mubisys</summary><dl class="dados-erp">'+(d.campos||[]).map(c=>'<dt>'+esc(c.campo)+'</dt><dd>'+esc(c.valor)+'</dd>').join('')+'</dl></details>'+
    '<label class="campo">Ordem para comparar<select id="erpOC"><option value="">Escolha uma ordem</option>'+ordens.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.codigo||o.id)+' · '+esc(o.fornecedor?.nome||'Sem fornecedor')+'</option>').join('')+'</select></label><div id="erpComparacao"></div><label class="confirmacao-erp"><input id="erpAceite" type="checkbox">Conferi o documento de origem e confirmo que pertence a esta ordem.</label>',acoes:[{texto:'Fechar',aoClicar:()=>fecharModal()},{texto:'Guardar referência',classe:'primario',aoClicar:()=>{
      const o=achar('oc',fundo.querySelector('#erpOC').value);
      if(!ehDirecao()||!o||!d.id||!fundo.querySelector('#erpAceite').checked){toast('Escolha a ordem, confira os dados e marque a confirmação. Documento precisa ter ID.','ruim');return;}
      if(['cancelada','rascunho'].includes(o.situacao)){toast('A ordem mudou de situação. Atualize a tela.','ruim');return;}
      const refs=o.referenciasErp||[];
      if(refs.some(r=>!r.desvinculadoEm&&r.tipo===d.tipo&&r.documentoId===d.id)){toast('Esta referência já está guardada.');return;}
      // Apenas identificação. Sem valor financeiro no cache compartilhado.
      const ref={id:crypto.randomUUID(),tipo:d.tipo,documentoId:d.id,numero:d.numero,consultadoEm:consulta.consultadoEm,confirmadoEm:new Date().toISOString(),por:S.quem};
      const n={...o,referenciasErp:[...refs,ref]};n.historico=historiar(o,'Referência do Mubisys conferida: '+d.tipo+' '+(d.numero||d.id));
      if(salvar('oc',n)===false)return;
      fecharEste(fundo);toast('Referência guardada. Nenhum pagamento ou recebimento foi alterado.','bom');
    }}]});
  fundo.querySelector('#erpOC').addEventListener('change',()=>{
    fundo.querySelector('#erpAceite').checked=false;
    const o=achar('oc',fundo.querySelector('#erpOC').value), box=fundo.querySelector('#erpComparacao');
    if(!o){box.innerHTML='';return;}
    const c=compararDocumentoOC(d,o);
    box.innerHTML='<div class="aviso '+(c.conflito?'ruim':'info')+'">'+(c.conflito?'Fornecedor diverge por ID/CNPJ. Confira antes de associar.':c.identidade?'ID/CNPJ corresponde. Confira também o documento e os itens.':'Não há identificação suficiente para confirmar o fornecedor automaticamente.')+'</div><p>Valor da ordem: '+(c.valorOC==null?'não informado':fmt.brl(c.valorOC))+' · documento: '+(d.valor==null?'não informado':fmt.brl(d.valor))+'</p><p class="legenda">'+(c.diferenca==null?'Sem dados para comparar valores.':'Diferença documento − ordem: '+fmt.brl(c.diferenca)+'. Parcelas, frete e notas parciais podem explicar diferenças.')+'</p>'+
      (d.itens?.length?'<div class="tabela-rolagem"><table><thead><tr><th>Item na nota</th><th>Quantidade</th><th>Unidade</th></tr></thead><tbody>'+d.itens.map(i=>'<tr><td>'+esc(i.descricao||i.codigo)+'</td><td>'+(i.quantidade==null?'—':fmt.numero(i.quantidade))+'</td><td>'+esc(i.unidade||'—')+'</td></tr>').join('')+'</tbody></table></div><p class="legenda">Confira descrição e unidade com a ordem; nenhuma equivalência de itens é presumida.</p>':'<p class="legenda">A resposta não trouxe itens reconhecidos para conferência automática.</p>');
  });
}
function htmlReferenciasERP(o) {
  const refs=(o.referenciasErp||[]).filter(r=>!r.desvinculadoEm);
  if(!ehDirecao()||!refs.length)return '';
  return '<section class="cartao"><h3>Referências conferidas no ERP</h3><p class="legenda">Vínculos manuais; não confirmam quitação nem entrega.</p>'+refs.map(r=>'<div class="linha-resumo"><span>'+esc(r.tipo)+' · '+esc(r.numero||r.documentoId)+'<small class="meta"> · '+esc(r.por)+' · '+fmt.dataHora(r.confirmadoEm)+'</small></span><button class="btn pequeno" data-desvincular="'+esc(r.id)+'">Desvincular</button></div>').join('')+'</section>';
}
function ligarReferenciasERP(el, o) {
  el.querySelectorAll('[data-desvincular]').forEach(b=>b.addEventListener('click',()=>{
    if(!ehDirecao())return;
    const atual=achar('oc',o.id);
    const ref=(atual?.referenciasErp||[]).find(r=>r.id===b.dataset.desvincular);
    if(!ref)return;
    const n={...atual,referenciasErp:atual.referenciasErp.map(r=>r.id===ref.id?{...r,desvinculadoEm:new Date().toISOString()}:r)};
    n.historico=historiar(atual,'Referência ERP desvinculada: '+ref.tipo+' '+(ref.numero||ref.documentoId));
    salvar('oc',n);render();toast('Vínculo desfeito; o histórico foi preservado.');
  }));
}
