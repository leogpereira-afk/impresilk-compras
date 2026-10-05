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
    ((sc.ocIds || []).includes(o.id) || (o.scIds || []).includes(sc.id)));
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
    ((sc.ocIds || []).includes(o.id) || (o.scIds || []).includes(sc.id)));
  if (ocs.length) {
    const saldos = saldoSolicitacao(sc, ocs);
    return saldos.length && saldos.every((s: any) => s.saldo <= 0.001) ? "atendida" : "em_compra";
  }
  if (cotacoes.some(c => c && !c.apagadoEm && !["cancelada", "recusada", "aprovada"].includes(c.situacao) &&
      ((sc.cotIds || []).includes(c.id) || (c.scIds || []).includes(sc.id)))) return "em_cotacao";
  return sc.aprovadaEm || ["aprovada", "em_cotacao", "em_compra", "atendida"].includes(sc.situacao) ? "aprovada" : "nova";
}
