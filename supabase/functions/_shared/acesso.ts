// Quem é quem no COMPRAS, e o que cada um pode fazer. ÚNICO lugar disso.
//
// Diferença para a Domo (de onde este arquivo veio): a identidade não é mais
// senha conferida aqui — é o CRACHÁ da Central de Acessos (equipe-auth), o
// mesmo login do Brief e do PCP. Este arquivo só VALIDA o crachá (HS256 com o
// EQUIPE_JWT_SECRET) e traduz o papel para o perfil interno:
//
//   papel (equipe_contas)  →  perfil interno (herdado da Domo)
//   admin                     direcao      aprova, configura, apaga
//   comprador                 escritorio   cota, emite OC, fornecedores
//   solicitante               obra         pede material, registra recebimento
//
// Os nomes internos "direcao/escritorio/obra" foram MANTIDOS de propósito:
// o motor inteiro (nucleo + telas) foi lapidado em produção na Domo com esses
// nomes, e renomear identificador por estética é como nascem os bugs de porte.

export interface Quem {
  id: string;
  nome: string;
  cargo: string;
  perfil: "direcao" | "escritorio" | "obra";
  proprio: boolean;
}

const JWT_SECRET = Deno.env.get("EQUIPE_JWT_SECRET") ?? "";
const SISTEMA = "compras";

const PAPEL_PARA_PERFIL: Record<string, Quem["perfil"]> = {
  admin: "direcao",
  comprador: "escritorio",
  solicitante: "obra",
};

export const PERFIS: Record<string, {
  txt: string; tudo?: boolean; escreve?: string[]; le?: string[]; semPreco?: string[];
}> = {
  direcao: { txt: "Gestão / aprovação", tudo: true },
  escritorio: { txt: "Compras / cotação", tudo: false },
  obra: {
    txt: "Solicitante",
    tudo: false,
    escreve: ["sc", "oc"],
    le: ["sc", "oc", "forn", "doc", "proj", "trein"],
    semPreco: ["oc", "cot"],
  },
};

// Gestão de contas saiu daqui: quem cria/troca senha é a equipe-auth (Central).
export const ACOES_DIRECAO = ["salvarCfg", "esvaziarLixeira", "reiniciarNumeracao",
  "restaurar", "restaurarItem", "log", "backup"];

export const ACOES_NEGADAS_OBRA = ["apagar"];

/* ── Crachá ─────────────────────────────────────────────────────────────────
   Payload: { sis, sub, nome, papel, iat, exp } assinado pela equipe-auth. */
const enc = new TextEncoder();
const b64urlBytes = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function chaveHmac(segredo: string) {
  return await crypto.subtle.importKey("raw", enc.encode(segredo),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function identificarPorCracha(req: Request): Promise<Quem | null> {
  if (!JWT_SECRET) return null; // sem segredo configurado, ninguém entra — fail closed
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const p = m[1].split(".");
  if (p.length !== 3) return null;
  const ok = await crypto.subtle.verify("HMAC", await chaveHmac(JWT_SECRET),
    b64urlBytes(p[2]), enc.encode(`${p[0]}.${p[1]}`));
  if (!ok) return null;
  try {
    const corpo = JSON.parse(new TextDecoder().decode(b64urlBytes(p[1])));
    if (!corpo.exp || corpo.exp < Math.floor(Date.now() / 1000)) return null;
    if (corpo.sis !== SISTEMA) return null; // crachá do Brief não abre o Compras
    const perfil = PAPEL_PARA_PERFIL[String(corpo.papel)] ?? "obra";
    return { id: String(corpo.sub), nome: String(corpo.nome || corpo.sub), cargo: "", perfil, proprio: true };
  } catch { return null; }
}

// Sem hash no cfg (a senha mora na equipe_contas), mas a limpeza continua:
// se algum campo sensível entrar no cfg um dia, ele não sai daqui por engano.
export function cfgSemSegredo(cfg: any) {
  const c = { ...(cfg || {}) };
  delete c.senhaHash;
  c.usuarios = ((cfg && cfg.usuarios) || []).map((u: any) => {
    const x = { ...u };
    delete x.hash;
    return x;
  });
  return c;
}

export const perfilDe = (quem: Quem | null) => (quem && PERFIS[quem.perfil]) ? quem.perfil : "obra";

/* ── O que o solicitante pode mexer em cada coleção ─────────────────────────
   Esconder a tela no menu não protege nada: a porta é o servidor. */
const CAMPOS_OBRA: Record<string, string[]> = {
  oc: ["recebimentos", "historico", "situacao", "atualizadoEm", "atualizadoPor"],
};

const igual = (a: unknown, b: unknown) =>
  JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

// Devolve '' quando pode, ou o motivo da recusa.
export function motivoRecusa(quem: Quem | null, colecao: string, registro: any, atual: any): string {
  const perfil = perfilDe(quem);
  if (perfil !== "obra") return "";

  const escreve = PERFIS.obra.escreve!;
  if (!escreve.includes(colecao)) return "solicitante não grava " + colecao;

  if (colecao === "sc") {
    if (atual && atual.situacao !== "nova") return "a solicitação já saiu da fila";
    if (registro.situacao && registro.situacao !== "nova") return "solicitante não aprova a própria solicitação";
    return "";
  }

  if (!atual) return "";

  const permitidos = CAMPOS_OBRA[colecao] || [];
  for (const k of Object.keys(registro)) {
    if (permitidos.includes(k) || k === "id") continue;
    if (!igual(registro[k], atual[k])) return 'solicitante não altera "' + k + '" em ' + colecao;
  }
  return "";
}

export function podeFazer(quem: Quem | null, action: string): boolean {
  if (!quem) return false;
  const perfil = perfilDe(quem);
  if (perfil === "direcao") return true;
  if (ACOES_DIRECAO.includes(action)) return false;
  if (perfil === "obra" && ACOES_NEGADAS_OBRA.includes(action)) return false;
  return true;
}

/* ── Leitura: o celular do solicitante não leva preço para casa ────────────── */
const CAMPOS_VALOR = ["preco", "total", "totalLiquido", "totalBruto", "desconto", "frete",
  "valor", "liquido", "bruto", "retencao", "adiantamento", "condicaoPagamento", "banco"];

function semValores(o: any): any {
  if (Array.isArray(o)) return o.map(semValores);
  if (!o || typeof o !== "object") return o;
  const saida: any = {};
  for (const [k, v] of Object.entries(o)) {
    if (CAMPOS_VALOR.includes(k)) continue;
    saida[k] = semValores(v);
  }
  return saida;
}

export function filtrarLeitura(quem: Quem | null, registros: any[]): any[] {
  const p = PERFIS[perfilDe(quem)];
  if (!p || p.tudo || !p.le) return registros;
  return registros
    .filter((r) => p.le!.includes(r._col))
    .map((r) => {
      if (!(p.semPreco || []).includes(r._col)) return r;
      const limpo = semValores(r);
      delete limpo.medicoes;
      delete limpo.aditivos;
      return limpo;
    });
}
