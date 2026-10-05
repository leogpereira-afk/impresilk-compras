import { ErroRede } from "./rede.ts";
const exigir = (ok: unknown, mensagem: string) => { if (!ok) throw new ErroRede(mensagem); };
const numero = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const qtd = (v: unknown) => numero(v) && (v as number) > 0 && (v as number) <= 1e9;
const naoNegativo = (v: unknown) => numero(v) && (v as number) >= 0 && (v as number) <= 1e12;

// Valida antes de persistir: HTML pode ser contornado, e a fila offline pode
// trazer pacotes incompletos. O registro já contém os campos anteriores.
export function validarDocumento(col: string, novo: any, antigo: any) {
  if (!["sc", "cot", "oc"].includes(col)) return;
  exigir(Array.isArray(novo.itens) && novo.itens.length > 0 && novo.itens.length <= 500, "Inclua de 1 a 500 itens no documento.");
  const ids = new Set<string>();
  for (const i of novo.itens) {
    exigir(i && typeof i.id === "string" && i.id && !ids.has(i.id), "Cada item precisa ter uma identificação única.");
    ids.add(i.id);
    exigir(qtd(i.qtd), "Informe uma quantidade positiva e válida para cada item.");
    if (i.preco != null) exigir(naoNegativo(i.preco), "Preço unitário inválido: use um valor igual ou maior que zero.");
  }
  if (col === "cot") for (const f of (novo.fornecedores || [])) {
    if (f.frete != null) exigir(naoNegativo(f.frete), "Frete da proposta inválido.");
    for (const p of Object.values(f.precos || {})) exigir(naoNegativo(p), "Preço da proposta inválido.");
  }
  if (col !== "oc") return;
  for (const k of ["frete", "seguro", "desconto", "difalValor", "ipiPerc", "icmsPerc"]) {
    if (novo[k] != null) exigir(naoNegativo(novo[k]), "Valor inválido em " + k + ".");
  }
  if (antigo && (antigo.recebimentos || []).length) {
    exigir(!(novo.situacao === "cancelada" && antigo.situacao !== "cancelada") && !(novo.apagadoEm && !antigo.apagadoEm), "Esta ordem já recebeu materiais. Use Encerrar com falta para cancelar apenas o saldo restante.");
    for (const anterior of (antigo.itens || [])) {
      if (totalRecebido(antigo, anterior.id) <= 0) continue;
      const atual = novo.itens.find((i: any) => i.id === anterior.id);
      exigir(atual, "Não remova um item que já teve recebimento.");
      for (const campo of ["unid", "materialId", "origemScId", "origemScItemId", "codigoFornecedor"]) {
        const normalizar = (v: any) => campo === "unid" ? String(v || "").trim().toLowerCase() : String(v || "");
        exigir(normalizar(atual[campo]) === normalizar(anterior[campo]), "A unidade e a identidade de um item recebido não podem ser alteradas. Crie outro item para a nova compra.");
      }
      exigir(atual.qtd >= Math.min(anterior.qtd, totalRecebido(antigo, anterior.id)), "A quantidade do pedido não pode ficar abaixo do que já foi recebido.");
    }
  }
  const recebimentos = new Set<string>();
  for (const r of (novo.recebimentos || [])) {
    exigir(r && typeof r.id === "string" && r.id && !recebimentos.has(r.id), "Recebimento sem identificação ou duplicado.");
    recebimentos.add(r.id);
    exigir(Array.isArray(r.itens) && r.itens.length, "Informe o que chegou no recebimento.");
    const recebidos = new Set<string>();
    for (const i of r.itens) {
      exigir(ids.has(i.itemId) && !recebidos.has(i.itemId), "O recebimento contém item desconhecido ou repetido.");
      recebidos.add(i.itemId);
      exigir(qtd(i.qtd), "Quantidade recebida inválida: use um número positivo.");
      const itemPedido = novo.itens.find((x: any) => x.id === i.itemId);
      const recebimentoExistente = (antigo?.recebimentos || []).some((x: any) => x.id === r.id);
      if (!recebimentoExistente && i.unid && itemPedido?.unid) exigir(unidade(i.unid) === unidade(itemPedido.unid), "A unidade do material mudou desde a abertura do recebimento. Atualize a ordem antes de registrar.");
    }
    const anterior = (antigo?.recebimentos || []).find((a: any) => a.id === r.id);
    if (anterior) exigir(JSON.stringify(anterior.itens) === JSON.stringify(r.itens), "As quantidades de um recebimento já registrado não podem ser substituídas. Registre uma ocorrência para revisão.");
  }
  if (novo.encerradaComFalta) exigir(typeof novo.encerradaComFalta === "string" && novo.encerradaComFalta.trim().length >= 3, "Descreva o motivo para encerrar com falta.");
  const total = novo.itens.reduce((s: number, i: any) => s + i.qtd * (i.preco || 0), 0);
  const liquido = total + total * ((novo.ipiPerc || 0) + (novo.icmsPerc || 0)) / 100 +
    (novo.temDifal ? (novo.difalValor || 0) : 0) + (novo.frete || 0) + (novo.seguro || 0) - (novo.desconto || 0);
  exigir(naoNegativo(total) && naoNegativo(liquido), "O desconto não pode superar o valor da compra.");
  novo.total = total;
  novo.totalLiquido = liquido;
}

export function totalRecebido(oc: any, itemId: string): number {
  return (oc.recebimentos || []).reduce((s: number, r: any) => s + (r.itens || [])
    .filter((i: any) => i.itemId === itemId).reduce((t: number, i: any) => t + (Number(i.qtd) || 0), 0), 0);
}

// Só conta vínculos explícitos; nomes iguais nunca bastam para baixar saldo.
// IDs preservados no fluxo antigo continuam compatíveis.
export function saldoSolicitacao(sc: any, ordens: any[]) {
  const ativas = ordens.filter(o => o && !o.apagadoEm && o.situacao !== "cancelada" &&
    ((sc.ocIds || []).includes(o.id) || (o.scIds || []).includes(sc.id) || (o.itens || []).some((i: any) => i.origemScId === sc.id)));
  return (sc.itens || []).map((i: any) => {
    let recebido = 0;
    for (const o of ativas) for (const item of (o.itens || [])) {
      const explicito = item.origemScId === sc.id && item.origemScItemId === i.id;
      const legado = !item.origemScId && !item.origemScItemId && item.id === i.id;
      if (!explicito && !legado) continue;
      const unidadePedido = String(i.unid || "").trim().toLowerCase();
      const unidadeCompra = String(item.unid || "").trim().toLowerCase();
      if (unidadePedido && unidadeCompra && unidadePedido !== unidadeCompra) continue;
      // Um recebimento excedente de uma OC não quita outra compra/item.
      recebido += Math.min(Number(item.qtd) || 0, totalRecebido(o, item.id));
    }
    return { itemId: i.id, pedido: Number(i.qtd) || 0, recebido, saldo: Math.max(0, (Number(i.qtd) || 0) - recebido) };
  });
}

export function situacaoSolicitacao(sc: any, ordens: any[], cotacoes: any[]): string {
  if (sc.apagadoEm || ["recusada", "cancelada"].includes(sc.situacao)) return sc.situacao;
  const ocs = ordens.filter(o => o && !o.apagadoEm && o.situacao !== "cancelada" &&
    ((sc.ocIds || []).includes(o.id) || (o.scIds || []).includes(sc.id) || (o.itens || []).some((i: any) => i.origemScId === sc.id)));
  if (ocs.length) {
    const saldos = saldoSolicitacao(sc, ocs);
    return saldos.length && saldos.every((s: any) => s.saldo <= 0.001) ? "atendida" : "em_compra";
  }
  if (cotacoes.some(c => c && !c.apagadoEm && !["cancelada", "recusada", "aprovada"].includes(c.situacao) &&
      ((sc.cotIds || []).includes(c.id) || (c.scIds || []).includes(sc.id)))) return "em_cotacao";
  return sc.aprovadaEm || ["aprovada", "em_cotacao", "em_compra", "atendida"].includes(sc.situacao) ? "aprovada" : "nova";
}

const unidade = (v: any) => String(v || '').trim().toLowerCase();
const unidadeCompativel = (a: any, b: any) => !unidade(a) || !unidade(b) || unidade(a) === unidade(b);
export function comprometidoItem(o: any, i: any): number {
  if (o.apagadoEm || o.situacao === 'cancelada') return 0;
  return o.encerradaComFalta || o.situacao === 'entregue' ? Math.min(i.qtd, totalRecebido(o, i.id)) : i.qtd;
}

// Conferência no snapshot usado pela RPC contextual: compras de documentos
// diferentes disputam o mesmo saldo, e não apenas a mesma linha do banco.
export function validarCompromissos(col: string, novo: any, antigo: any, contexto: any[]) {
  if (!['sc', 'oc', 'cot'].includes(col)) return;
  const antes = contexto;
  const depois = contexto.filter(r => !(r._col === col && r.id === novo.id)).concat([{ ...novo, _col: col }]);
  const ordens = (lista: any[]) => lista.filter(r => r._col === 'oc');
  const somaSC = (sc: any, item: any, lista: any[]) => ordens(lista).reduce((s, o) => s + (o.itens || []).reduce((n: number, i: any) => {
    const explicito = i.origemScId === sc.id && i.origemScItemId === item.id;
    const legado = !i.origemScId && !i.origemScItemId && i.id === item.id && ((o.scIds || []).includes(sc.id) || (sc.ocIds || []).includes(o.id));
    return n + ((explicito || legado) && unidadeCompativel(i.unid, item.unid) ? comprometidoItem(o, i) : 0);
  }, 0), 0);
  if (col === 'sc' && antigo) for (const item of antigo.itens || []) {
    if (somaSC(antigo, item, antes) <= 0.001) continue;
    const atual = novo.itens.find((i: any) => i.id === item.id);
    exigir(atual && unidade(atual.unid) === unidade(item.unid) && String(atual.materialId || '') === String(item.materialId || ''), 'Não remova nem troque a identidade de material já comprometido em uma compra.');
  }
  for (const sc of depois.filter(r => r._col === 'sc' && !r.apagadoEm)) for (const item of (sc.itens || [])) {
    const atual = somaSC(sc, item, depois), anterior = somaSC(sc, item, antes);
    const itemAntigo = antes.find(r => r._col === 'sc' && r.id === sc.id)?.itens?.find((i: any) => i.id === item.id);
    const reduziu = col === 'sc' && sc.id === novo.id && itemAntigo && item.qtd < itemAntigo.qtd;
    exigir(!(atual > item.qtd + 0.001 && (atual > anterior + 0.001 || reduziu)), 'O saldo desta solicitação já foi comprometido por outra compra. Atualize e compre somente o saldo disponível.');
  }
  if (col === 'oc' && !novo.apagadoEm && novo.situacao !== 'cancelada') for (const i of novo.itens || []) {
    if (!i.origemScId) continue;
    const sc = depois.find(r => r._col === 'sc' && r.id === i.origemScId && !r.apagadoEm);
    const item = sc?.itens?.find((x: any) => x.id === i.origemScItemId);
    exigir(sc && item && unidadeCompativel(item.unid, i.unid), 'A origem ou unidade deste item mudou na solicitação. Atualize antes de comprar.');
  }
  const cots = depois.filter(r => r._col === 'cot');
  const raiz = (id: string): string => {
    const vistos = new Set<string>(); let atual = id;
    while (atual) {
      exigir(!vistos.has(atual), 'A origem das cotações contém um ciclo.'); vistos.add(atual);
      const pai = cots.find(c => c.id === atual)?.cotacaoOrigemId;
      if (!pai) return atual;
      exigir(cots.some(c => c.id === pai && !c.apagadoEm), 'Cotação de origem não encontrada.'); atual = pai;
    }
    return id;
  };
  if (col === 'cot') {
    exigir(!antigo || (antigo.cotacaoOrigemId || '') === (novo.cotacaoOrigemId || ''), 'A origem de uma cotação existente não pode ser trocada.');
    if (novo.cotacaoOrigemId) {
      const idRaiz = raiz(novo.id), principal = cots.find(c => c.id === idRaiz);
      for (const i of novo.itens || []) {
        const base = principal?.itens?.find((x: any) => x.id === i.id);
        exigir(base && unidadeCompativel(base.unid, i.unid), 'O item ou unidade não pertence à cotação original.');
      }
    }
  }
  if (col === 'cot' && novo.cotacaoOrigemId && !novo.apagadoEm && novo.situacao === 'aberta' && (!antigo || antigo.situacao !== 'aberta')) {
    const idRaiz = raiz(novo.id);
    exigir(!cots.some(c => c.id !== novo.id && c.cotacaoOrigemId && !c.apagadoEm && c.situacao === 'aberta' && raiz(c.id) === idRaiz), 'Já existe uma cotação de saldo aberta nesta família. Abra a cotação existente.');
  }
  const pertence = (id: string, ancestral: string) => {
    const vistos = new Set<string>(); let atual = id;
    while (atual && !vistos.has(atual)) {
      if (atual === ancestral) return true;
      vistos.add(atual); atual = cots.find(c => c.id === atual)?.cotacaoOrigemId;
    }
    return false;
  };
  for (const cot of cots.filter(c => !c.apagadoEm)) for (const item of cot.itens || []) {
    const contar = (lista: any[]) => ordens(lista).filter(o => o.cotacaoId && pertence(o.cotacaoId, cot.id)).reduce((s, o) => s + (o.itens || []).filter((i: any) => i.id === item.id && unidadeCompativel(i.unid, item.unid)).reduce((n: number, i: any) => n + comprometidoItem(o, i), 0), 0);
    const atual = contar(depois), anterior = contar(antes);
    const anteriorItem = antes.find(r => r._col === 'cot' && r.id === cot.id)?.itens?.find((i: any) => i.id === item.id);
    const reduziu = col === 'cot' && novo.id === cot.id && anteriorItem && item.qtd < anteriorItem.qtd;
    exigir(!(atual > item.qtd + 0.001 && (atual > anterior + 0.001 || reduziu)), 'O saldo da família desta cotação já foi comprado. Atualize antes de escolher a proposta.');
  }
}
