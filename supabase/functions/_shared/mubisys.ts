// Consultas somente GET. Recurso e parâmetros são definidos pelo servidor.
export const RECURSOS_MUBI = ['usuario', 'usuario/vendedor', 'fornecedor', 'cliente', 'produto', 'materia-prima', 'nota-fiscal-recebida', 'contas-pagar'];
export function dataMubi(v: unknown): string {
  const s = String(v ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Informe datas válidas.');
  const d = new Date(s + 'T12:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new Error('Data inválida.');
  return s;
}
export function parametrosConferencia(body: any) {
  const recurso = body.tipo === 'notas' ? 'nota-fiscal-recebida' : body.tipo === 'contas' ? 'contas-pagar' : '';
  if (!recurso) throw new Error('Escolha notas recebidas ou contas a pagar.');
  const inicio = dataMubi(body.inicio), fim = dataMubi(body.fim);
  if (fim < inicio || (Date.parse(fim) - Date.parse(inicio)) / 86400000 > 6) throw new Error('Consulte até 7 dias por busca.');
  const pagina = Number(body.pagina ?? 1);
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > 200) throw new Error('Página inválida.');
  return { recurso, params: { status: 'TODOS', filtrodata: body.tipo === 'notas' ? 'ENTRADA' : 'VENCIMENTO', datainicial: inicio, datafinal: fim, page: String(pagina), per_page: '100' } };
}
export async function consultarMubi(recurso: string, params: Record<string,string>, options: any = {}) {
  if (!RECURSOS_MUBI.includes(recurso)) throw new Error('Consulta não permitida.');
  const env = options.env || ((k: string) => Deno.env.get(k));
  const base = String(env('MUBI_BASE_URL') || 'https://api.mubisys.com/api').replace(/\/+$/, '');
  const urlBase = new URL(base);
  if (urlBase.protocol !== 'https:' || urlBase.hostname !== 'api.mubisys.com' || urlBase.pathname !== '/api' || urlBase.search || urlBase.hash || urlBase.username || urlBase.password || urlBase.port) throw new Error('Base do Mubisys inválida.');
  const key = env('MUBI_PUBLIC_KEY'), token = env('MUBI_TOKEN');
  if (!key || !token) throw new Error('Credenciais do Mubisys não configuradas no servidor.');
  const pedir = options.fetch || fetch;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), options.timeoutMs || 25000);
    try {
      const res = await pedir(`${base}/${encodeURIComponent(key)}/${recurso}?${new URLSearchParams(params)}`, {
        method: 'GET', headers: { Accept: 'application/json', 'Access-Token': token }, signal: ctrl.signal, redirect: 'error'
      });
      // Nunca transforma erro de autenticação, rota inexistente ou schema em vazio.
      if ([429, 502, 503, 504].includes(res.status) && tentativa === 0) { await res.body?.cancel(); continue; }
      if (![200, 201].includes(res.status)) throw new Error(`Mubisys respondeu ${res.status}. A consulta não foi concluída; nenhum registro foi importado.`);
      const j = await res.json();
      const dados = Array.isArray(j) ? j : j?.data;
      if (!Array.isArray(dados)) throw new Error('Formato de resposta do Mubisys não reconhecido. Não é possível afirmar que a consulta está vazia.');
      const pag = j.pagination || {};
      const pagina = Number(pag.current_page ?? params.page ?? 1);
      const paginas = Number(pag.last_page ?? pagina);
      if (!Number.isInteger(pagina) || pagina !== Number(params.page || 1) || !Number.isInteger(paginas) || paginas < pagina) throw new Error('Paginação do Mubisys inconsistente.');
      // Sem metadados, página cheia exige consultar a seguinte; não declarar carga completa.
      const temMais = pag.last_page != null ? pagina < paginas : dados.length >= Number(params.per_page || 100);
      return { dados, pagina, paginas: pag.last_page != null ? paginas : null, total: pag.total != null ? Number(pag.total) : null, temMais, consultadoEm: new Date().toISOString() };
    } catch (e) {
      if (ctrl.signal.aborted) throw new Error('Mubisys excedeu o tempo de resposta. Tente um período menor.');
      if (e instanceof TypeError) throw new Error('Não foi possível conectar ao Mubisys. Tente novamente.');
      throw e;
    } finally { clearTimeout(timer); }
  }
  throw new Error('Mubisys indisponível.');
}

const texto = (x: any) => typeof x === 'string' || typeof x === 'number' ? String(x).slice(0, 300) : '';
export function normalizarConferencia(r: any, tipo: string) {
  // Campos ausentes continuam ausentes. Valor desconhecido nunca vira zero.
  const numero = (v: any) => (typeof v === 'string' || typeof v === 'number') && String(v).trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
  const f = r.fornecedor || r.emitente || {};
  return {
    id: texto(r.id), tipo,
    numero: texto(r.numero ?? r.numero_nota ?? r.documento),
    fornecedor: texto(f.razao_social ?? f.nome ?? (typeof f === 'string' ? f : '') ?? '') || texto(r.razao_social),
    fornecedorId: texto(f.id ?? r.fornecedor_id), cnpj: texto(f.cnpj_cpf ?? f.cnpj ?? r.cnpj_cpf).replace(/\D/g, ''),
    valor: numero(tipo === 'contas' ? r.valor_titulo ?? r.valor : r.valor_total ?? r.valor),
    data: texto(tipo === 'notas' ? r.data_entrada : r.data_vencimento).slice(0, 10),
    status: texto(r.status), chave: texto(r.chave ?? r.chave_acesso),
    itens: (Array.isArray(r.itens) ? r.itens : []).map((i: any) => ({ codigo: texto(i.codigo), descricao: texto(i.descricao ?? i.nome), unidade: texto(i.unidade), quantidade: numero(i.quantidade ?? i.qtde), valor: numero(i.valor_total) })),
    // Permite conferir campos que variam entre contas sem presumir seu significado.
    campos: Object.entries(r).filter(([k,v]) => !/token|senha|password|secret/i.test(k) && (typeof v === 'string' || typeof v === 'number')).slice(0,60).map(([campo,valor]) => ({ campo, valor: texto(valor) }))
  };
}
