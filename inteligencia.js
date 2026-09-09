/* Indicadores verificáveis, sem previsão financeira nem escolha automática. */
function saldoMaterial(o) {
  const itens = (o.itens || []).map(i => {
    const pedido = Math.max(0, Number(i.qtd) || 0);
    const recebido = jaRecebido(o, i.id);
    const falta = Math.max(0, pedido - recebido);
    const preco = i.preco !== '' && i.preco != null && Number.isFinite(Number(i.preco)) && Number(i.preco) >= 0 ? Number(i.preco) : null;
    return { ...i, falta, pendente: preco == null ? null : falta * preco };
  });
  return { itens, valorItens: itens.some(i => i.falta > 0 && i.pendente == null) ? null : itens.reduce((a,i) => a + (i.pendente || 0),0) };
}
function duplicidadeFornecedor(f, atuais) {
  const doc = String(f.cnpj || '').replace(/\D/g,'');
  return atuais.find(x => (f.idMubi && String(x.origemMubi || '') === String(f.idMubi)) || (doc && doc === String(x.cnpj || '').replace(/\D/g,'')));
}
function compararDocumentoOC(d, o) {
  const f = o.fornecedor || {};
  const cadastro = achar('forn', o.fornecedorId || f.id) || {};
  const doc = String(f.cnpj || cadastro.cnpj || '').replace(/\D/g,'');
  const id = String(f.origemMubi || cadastro.origemMubi || '');
  const identidade = !!((d.cnpj && doc && d.cnpj === doc) || (d.fornecedorId && id && String(d.fornecedorId) === id));
  const conflito = !!((d.cnpj && doc && d.cnpj !== doc) || (d.fornecedorId && id && String(d.fornecedorId) !== id));
  const valorOC = o.totalLiquido != null && o.totalLiquido !== '' && Number.isFinite(Number(o.totalLiquido)) ? Number(o.totalLiquido) : null;
  return { identidade, conflito, valorOC, diferenca: d.valor != null && valorOC != null ? Math.round((d.valor - valorOC) * 100) / 100 : null };
}
function resumoInteligencia() {
  const ocs = lista('oc').filter(o => !['cancelada','rascunho'].includes(o.situacao));
  const porOS = new Map();
  for (const o of ocs.filter(o=>noPeriodo(o))) {
    const chave = o.os?.numero || 'Sem O.S.';
    const x = porOS.get(chave) || { numero: chave, total: 0, quantidade: 0 };
    x.total += Number(o.totalLiquido) || 0; x.quantidade++; porOS.set(chave,x);
  }
  const pendentes = ocs.filter(o=>SIT_ESPERANDO.includes(o.situacao));
  const saldos = pendentes.map(saldoMaterial);
  return { porOS:[...porOS.values()].sort((a,b)=>b.total-a.total), pendentes, saldos, valorItens: saldos.some(s=>s.valorItens==null) ? null : saldos.reduce((a,s)=>a+s.valorItens,0) };
}
function comprasPorFornecedorPeriodo(ocs) {
  const mapa=new Map();
  for(const o of ocs.filter(o=>!['cancelada','rascunho'].includes(o.situacao)&&noPeriodo(o))){
    const f=o.fornecedor||{},chave=o.fornecedorId||f.origemMubi||String(f.cnpj||'').replace(/\D/g,'')||('ordem:'+o.id);
    const x=mapa.get(chave)||{nome:f.nome||'Fornecedor não informado',quantidade:0,total:0};
    x.quantidade++;const v=o.totalLiquido;
    x.total=x.total==null||v==null||v===''||!Number.isFinite(Number(v))?null:x.total+Number(v);mapa.set(chave,x);
  }
  return [...mapa.values()].sort((a,b)=>(b.total??-1)-(a.total??-1)||a.nome.localeCompare(b.nome,'pt-BR'));
}
function htmlInteligenciaCompras() {
  if (!podeVer('compras')) return '';
  const r=resumoInteligencia(),fornecedores=comprasPorFornecedorPeriodo(lista('oc'));
  return '<section class="cartao"><div class="barra-acoes"><h3>Distribuição das compras · '+esc(rotuloPeriodo())+'</h3>' +
    (ehDirecao() ? '<a class="btn" href="#/conferencia">Conferir com o Mubisys</a>' : '') + '</div>' +
    '<div class="grade g2"><div><h4>Fornecedores no período</h4>'+
    (fornecedores.length?fornecedores.slice(0,5).map(f=>'<div class="linha-resumo"><span>'+esc(f.nome)+' · '+f.quantidade+' ordem(ns)</span><b>'+(f.total==null?'Valor incompleto':fmt.brl(f.total))+'</b></div>').join(''):'<p class="legenda">Sem ordens neste período.</p>')+
    (fornecedores.length>5?'<p class="legenda">5 maiores de '+fornecedores.length+' fornecedores.</p>':'')+'</div>'+
    '<div><h4>Compras por O.S.</h4>' +
    (r.porOS.length ? r.porOS.slice(0,5).map(x=>'<div class="linha-resumo"><span>'+esc(x.numero==='Sem O.S.'?x.numero:'O.S. '+x.numero)+' · '+x.quantidade+' ordem(ns)</span><b>'+fmt.brl(x.total)+'</b></div>').join('') : '<p class="legenda">Sem ordens neste período.</p>') +
    (r.porOS.length>5?'<p class="legenda">5 maiores grupos de '+r.porOS.length+'.</p>':'') + '</div></div></section>';
}
function htmlApoioCotacao(c) {
  return '<section class="cartao"><h3>Decidir com contexto</h3><p class="legenda">Compare cobertura, frete, prazo e histórico. A escolha continua sendo sua.</p><div class="tabela-rolagem"><table><thead><tr><th>Fornecedor</th><th>Proposta</th><th>Total com frete informado</th><th>Entrega</th><th>Histórico</th></tr></thead><tbody>' +
    (c.fornecedores||[]).map(f=>{
      const cad = achar('forn',f.fornecedorId);
      const d = cad ? desempenhoFornecedor(cad) : null;
      const valor = respondeu(f)?fmt.brl(totalCotacao(c,f)):'Aguardando';
      return '<tr><td>'+esc(f.nome)+'</td><td>'+(!respondeu(f)?'Sem resposta':propostaCompleta(c,f)?'Todos os itens':'Proposta parcial')+'</td><td>'+valor+(f.frete==null||f.frete===''?'<div class="meta">Frete não informado</div>':'')+'</td><td>'+esc(f.prazoEntrega||'Não informado')+'</td><td>'+(d? d.entregues+' entrega(s) · '+d.medidas+' com prazo verificável'+(d.pontualidade!=null?' · '+Math.round(d.pontualidade*100)+'% no prazo':''):'Sem cadastro vinculado')+'</td></tr>';
    }).join('')+'</tbody></table></div></section>';
}

function prioridadesOperacionais(){
  const grupos=[{id:'decidir',icone:'💵',titulo:'Decidir cotações',itens:[]},{id:'solicitar',icone:'📋',titulo:'Dar andamento aos pedidos',itens:[]},{id:'entregar',icone:'🚚',titulo:'Acompanhar entregas',itens:[]},{id:'fretes',icone:'⚑',titulo:'Conferir transporte',itens:[]}];
  const add=(g,titulo,texto,rota,prioridade=2)=>{if(podeVer(rota.split('/')[0]))grupos[g].itens.push({titulo,texto,rota,prioridade});};
  for(const c of lista('cot').filter(c=>c.situacao==='aberta')){
    const fs=c.fornecedores||[],respostas=fs.filter(respondeu),completas=respostas.filter(f=>propostaCompleta(c,f));
    if(completas.length)add(0,c.codigo||'Cotação',completas.length+' proposta(s) completa(s) · comparar e decidir','cotacoes/'+c.id,1);
    else if(diasAte(c.prazoResposta)!=null&&diasAte(c.prazoResposta)<0)add(0,c.codigo||'Cotação','Prazo de resposta vencido · '+respostas.length+' de '+fs.length+' responderam','cotacoes/'+c.id,0);
    else if(!fs.length)add(0,c.codigo||'Cotação','Nenhum fornecedor convidado','cotacoes/'+c.id,2);
    else if(respostas.length)add(0,c.codigo||'Cotação','Respostas parciais · conferir itens sem preço','cotacoes/'+c.id,2);
  }
  for(const s of lista('sc').filter(solicitacaoPendente)){
    const cotViva=(s.cotIds||[]).some(id=>{const c=achar('cot',id);return c&&!c.apagadoEm&&c.situacao==='aberta';}),ocViva=(s.ocIds||[]).some(id=>{const o=achar('oc',id);return o&&!o.apagadoEm&&o.situacao!=='cancelada';});
    if(s.situacao==='nova'||s.situacao==='aprovada'&&!cotViva&&!ocViva)add(1,s.codigo||'Solicitação',acaoSolicitacao(s)+' · '+(s.solicitante?.nome||'equipe')+(s.necessidadeEm?' · precisa até '+fmt.data(s.necessidadeEm):''),'solicitacoes/'+s.id,prioridadeSolicitacao(s));
  }
  for(const {oc:o,itens} of comprasAguardandoTransporte()){
    const d=diasAte(o.entregaPrevista);if(d==null||d<=3)add(2,o.codigo||'Compra',(d==null?'Combinar uma data':d<0?(-d)+' dia(s) após a previsão':d===0?'Entrega prevista hoje':'Entrega em '+d+' dia(s)')+' · '+itens.length+' material(is) com saldo',podeVer('compras')?'compras/'+o.id:'recebimento',d!=null&&d<0?0:2);
  }
  for(const o of lista('oc').filter(o=>o.situacao==='emitida'))add(2,o.codigo||'Compra','Emitida · aguarda envio ao fornecedor','compras/'+o.id,2);
  if(podeVer('transportadoras'))for(const r of movimentosTransporte()){
    const ocorrencia=r.ocorrencia&&r.ocorrencia!=='nenhuma'&&r.ocorrenciaStatus!=='resolvida';
    if(ocorrencia||custoFretePendente(r)||!r.transportadoraId)add(3,r.codigo||'Entrega avulsa',[ocorrencia?'Ocorrência: '+r.ocorrencia:'',custoFretePendente(r)?'Frete a conferir':'',!r.transportadoraId?'Transportadora não vinculada':'',fmt.data(r.dataEntrega)].filter(Boolean).join(' · '),'transportadoras/'+(r.transportadoraId||'todas')+'/'+String(r.dataEntrega||'').slice(0,7),ocorrencia?0:2);
  }
  for(const g of grupos)g.itens.sort((a,b)=>a.prioridade-b.prioridade||a.titulo.localeCompare(b.titulo,'pt-BR'));
  return grupos;
}
function htmlCentralDecisoes(){
  const grupos=prioridadesOperacionais(),total=grupos.reduce((s,g)=>s+g.itens.length,0);
  return '<section class="cartao central-decisoes"><div class="rede-titulo"><div><span class="rede-kicker">Próximas ações · todos os períodos</span><h2>'+total+' registro(s) para acompanhar</h2><p class="legenda">Abra o registro para resolver. Pendências de meses anteriores continuam aqui.</p></div></div><div class="central-grupos">'+grupos.filter(g=>g.itens.length).map(g=>'<div class="central-grupo"><h3>'+g.icone+' '+g.titulo+' <span>'+g.itens.length+'</span></h3>'+g.itens.slice(0,3).map(i=>'<a class="central-acao" href="#/'+esc(i.rota)+'"><div><b>'+esc(i.titulo)+'</b><small>'+esc(i.texto)+'</small></div><span aria-hidden="true">→</span></a>').join('')+(g.itens.length>3?'<details><summary>Ver mais '+(g.itens.length-3)+'</summary>'+g.itens.slice(3).map(i=>'<a class="central-acao" href="#/'+esc(i.rota)+'"><div><b>'+esc(i.titulo)+'</b><small>'+esc(i.texto)+'</small></div><span aria-hidden="true">→</span></a>').join('')+'</details>':'')+'</div>').join('')+'</div>'+(!total?'<p class="legenda">Nenhuma pendência identificada nos registros carregados.</p>':'')+'</section>';
}
