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
function htmlInteligenciaCompras() {
  if (!podeVer('compras')) return '';
  const r = resumoInteligencia();
  return '<section class="cartao"><div class="barra-acoes"><h3>Leitura das compras</h3>' +
    (ehDirecao() ? '<a class="btn" href="#/conferencia">Conferir com o Mubisys</a>' : '') + '</div>' +
    '<div class="grade g2"><div><p class="legenda">Material ainda não recebido · todos os períodos</p><strong class="valor-destaque">' + (r.valorItens==null?'Preço incompleto':fmt.brl(r.valorItens)) + '</strong>' +
    '<p class="legenda">Somente itens pendentes. Frete, impostos, seguro e desconto não rateados. Este valor não é saldo a pagar.</p></div>' +
    '<div><h4>Compras por O.S. · ' + esc(rotuloPeriodo()) + '</h4>' +
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
