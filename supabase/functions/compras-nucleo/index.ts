// ============================================================================
// compras-nucleo — backend do COMPRAS da Impresilk.
//
// Porte do nucleo da Domo Construtora (o fluxo solicitação → cotação → OC →
// WhatsApp → recebimento foi lapidado lá em produção; portar, não reescrever).
// O que mudou em relação à Domo:
//   - tabelas com prefixo compras_ (projeto Supabase COMPARTILHADO com RH/
//     Brief/PCP/DRE/Painel — objeto sem prefixo sobrescreve o RH em produção);
//   - identidade pelo CRACHÁ da Central de Acessos (equipe-auth, sistema
//     "compras"), não mais senha própria — gestão de contas mora na Central;
//   - ação nova buscarOS: lê a O.S. importada do Mubisys pelo PCP (mesmo
//     banco, tabela pcp_registros) e devolve cliente/contato/itens para o
//     pedido nascer preenchido.
//
// Duas camadas de autenticação:
//   1. TOKEN (header x-token) — barra robô/curioso. Viaja no navegador, é leve.
//   2. CRACHÁ (Authorization: Bearer) — validado aqui, assinado pela equipe-auth.
// Ações públicas (só o TOKEN) são as telas que o FORNECEDOR abre por link:
// responder cotação e ver a ordem de compra. Nelas nunca sai preço de
// concorrente nem telefone de terceiro.
//
// verify_jwt = false no config.toml: o preflight CORS chega sem token e o
// gateway barraria antes de o código rodar. A autorização é AQUI DENTRO.
// ============================================================================
import { json, preflight } from "../_shared/cors.ts";
import { COLECOES } from "../_shared/colecoes.ts";
import {
  cfgSemSegredo, podeFazer, motivoRecusa, reporEscondidos,
  filtrarLeitura, identificarPorCracha, perfilDe, type Quem,
} from "../_shared/acesso.ts";
import {
  db, agora, idNovo, tokenCurto, lerUm, gravarUm, lerTudo, apagarDeVez,
  lerCfgBruta, gravarCfg, proximoNumero, guardarIndiceNumero, lerNumeracao,
  definirNumeracao, registrarLog, lerLog, gravarBackup, apagarArquivo,
  marcarMudanca,
} from "../_shared/dados.ts";

const NOMES_COLECOES = Object.keys(COLECOES);

// ── Configuração padrão ─────────────────────────────────────────────────────
const CFG_PADRAO = {
  empresa: {
    nome: "IMPRESILK COMUNICACAO VISUAL LTDA",
    nomeCurto: "Impresilk",
    cnpj: "", ie: "", endereco: "", telefone: "", email: "",
  },
  // "obras" virou o DESTINO da compra (a chave do dado ficou obraId de propósito:
  // renomear identificador que já roda em produção é como nascem bugs de porte).
  obras: [
    { id: "producao", nome: "Produção (fábrica)", endereco: "", ativa: true },
    { id: "estoque", nome: "Estoque", endereco: "", ativa: true },
    { id: "instalacao", nome: "Instalação em cliente", endereco: "", ativa: true },
    { id: "escritorio", nome: "Escritório", endereco: "", ativa: true },
  ],
  setores: ["Impressão digital", "Recorte / plotter", "Marcenaria e ACM", "Serralheria",
    "Letra caixa", "Elétrica e LED", "Acabamento", "Instalação", "Escritório",
    "Ferramentas/EPI", "Manutenção", "Outros"],
  unidades: ["un", "pç", "m", "m²", "kg", "L", "cx", "rolo", "bobina", "chapa", "barra", "cj", "vb"],
  // Linha de produto — organiza catálogos, manuais e treinamentos.
  disciplinas: ["Impressão digital", "Vinil e recorte", "ACM e chapas", "Letra caixa",
    "LED e elétrica", "Perfis e estruturas", "Lona e tecido", "Adesivo e laminação",
    "Máquinas e manutenção", "Instalação", "EPI e segurança", "Outros"],
  tiposDoc: ["CNPJ", "Contrato Social", "Alvará", "CND Federal", "CND Estadual", "CND Municipal",
    "CND FGTS", "CND Trabalhista", "Licença Ambiental", "Seguro", "Certificado Digital",
    "Ficha técnica", "Certificado de garantia", "Outros"],
  assinaturas: {
    diretor: { nome: "", cargo: "Direção", crea: "" },
    engenheiro: { nome: "", cargo: "Responsável de compras", crea: "" },
  },
  clausulasOC: [
    "Esta Ordem de Compra tem força de contrato de aquisição, sendo regida pela legislação civil e comercial vigente.",
    "O fornecedor deverá emitir Nota Fiscal correspondente ao valor integral desta OC, com os dados fiscais do contratante.",
    "A entrega fora do prazo estabelecido sujeitará o fornecedor a multa de 0,5% ao dia sobre o valor dos materiais não entregues.",
    "Materiais entregues em desacordo com as especificações — cor, gramatura, medida, lote ou acabamento — serão rejeitados e devolvidos às custas do fornecedor.",
    "O pagamento será liberado após recebimento, conferência e aceite formal dos materiais pelo responsável de compras.",
    "A presente OC somente produz efeitos após assinatura de ambas as partes e é válida pelo prazo indicado no campo Validade da Proposta.",
  ],
  senhaHash: null,
  usuarios: [] as any[],
  atualizadoEm: null,
};

async function lerCfg(): Promise<any> {
  const salvo = await lerCfgBruta();
  return { ...CFG_PADRAO, ...(salvo || {}) };
}

/* ── União de listas de dois donos ─────────────────────────────────────────── */
// Listas em que os dois lados TÊM RAZÃO ao mesmo tempo: em vez de o último a
// gravar apagar o do outro, o servidor junta item a item pelo id.
// 'fornecedores' é a lista de convidados da cotação: dois compradores mexendo na
// mesma cotação em celulares diferentes não podem apagar a resposta um do outro.
const CAMPOS_UNIAO = ["historico", "recebimentos", "cotacoes", "anexos", "versoes",
  "documentos", "avaliacoes", "fornecedores"];

// Dentro de cada item unido, estas listas também se juntam em vez de se
// sobrepor (os preços moram DENTRO do fornecedor convidado).
const SUBLISTAS_UNIAO = ["itens_recebidos"];
const SUBOBJETOS_UNIAO = ["precos"];

function unirPorId(antigo: any, novo: any): any[] {
  const a = Array.isArray(antigo) ? antigo : [];
  const b = Array.isArray(novo) ? novo : [];
  const vistos = new Map<string, any>();
  for (const it of a.concat(b)) {
    if (!it) continue;
    const k = it.id || (it.em || "") + "|" + (it.o_que || it.texto || "");
    const anterior = vistos.get(k) || {};
    const unido: any = { ...anterior, ...it };
    for (const sub of SUBLISTAS_UNIAO) {
      if (Array.isArray(anterior[sub]) || Array.isArray(it[sub])) unido[sub] = unirPorId(anterior[sub], it[sub]);
    }
    for (const sub of SUBOBJETOS_UNIAO) {
      if (anterior[sub] || it[sub]) unido[sub] = { ...(anterior[sub] || {}), ...(it[sub] || {}) };
    }
    vistos.set(k, unido);
  }
  return Array.from(vistos.values());
}

// Todos os arquivos que pertencem a este registro: projeto/documento (com as
// revisões antigas) e as fotos de recebimento e do diário.
function arquivosDoRegistro(o: any): string[] {
  const ids: string[] = [];
  if (o.arquivoId) ids.push(o.arquivoId);
  for (const v of (o.versoes || [])) if (v && v.arquivoId) ids.push(v.arquivoId);
  for (const r of (o.recebimentos || [])) for (const f of (r.fotos || [])) if (f) ids.push(f);
  for (const d of (o.diario || [])) for (const f of (d.fotos || [])) if (f) ids.push(f);
  for (const d of (o.documentos || [])) if (d && d.arquivoId) ids.push(d.arquivoId);
  return Array.from(new Set(ids));
}

/* ── Gravação: onde mora a inteligência do sistema ─────────────────────────── */
async function gravar(col: string, registro: any, por: string): Promise<any> {
  if (!COLECOES[col]) throw new Error("Coleção desconhecida: " + col);
  const id = registro.id || idNovo();
  const antigo = await lerUm(col, id);
  const novo: any = { ...(antigo || {}), ...registro, id };

  for (const campo of CAMPOS_UNIAO) {
    if (antigo && (antigo[campo] || registro[campo])) novo[campo] = unirPorId(antigo[campo], registro[campo]);
  }

  // A situação de uma ordem de compra é DECIDIDA AQUI, depois de juntar os
  // recebimentos dos dois aparelhos. Cada celular só enxerga os recebimentos
  // que ele mesmo conhece: se o estoque registra 40 e o comprador 80 de um
  // pedido de 120, nenhum dos dois via "entregue" — a conta é do servidor.
  //
  // A situação que MANDA é a guardada, não a que veio do navegador: um modal de
  // recebimento aberto há dez minutos trazia o retrato velho e ressuscitava uma
  // compra que o escritório tinha acabado de cancelar.
  const situacaoValida = (antigo && antigo.situacao) || novo.situacao;
  if (antigo && antigo.situacao === "cancelada") novo.situacao = "cancelada";
  // Cancelar é decisão deliberada de quem tem acesso e MANDA — o recálculo
  // abaixo não pode desfazê-la. Antes, `situacaoValida` vinha da situação
  // GUARDADA ('parcial'), o recálculo rodava assim mesmo e devolvia a ordem
  // para 'parcial': o comprador cancelava, escrevia o motivo, e a compra
  // continuava viva. A trava da linha acima cuida do caso inverso — modal
  // velho tentando ressuscitar o que já estava cancelado.
  if (col === "oc" && novo.situacao !== "cancelada" &&
      Array.isArray(novo.recebimentos) && novo.recebimentos.length &&
      !["cancelada", "rascunho"].includes(situacaoValida)) {
    const recebidoDoItem = (itemId: string) => novo.recebimentos.reduce((s: number, r: any) => {
      const achado = (r.itens || []).find((i: any) => i.itemId === itemId);
      return s + ((achado && Number(achado.qtd)) || 0);
    }, 0);
    const completo = (novo.itens || []).length > 0 &&
      (novo.itens || []).every((i: any) => recebidoDoItem(i.id) + 0.001 >= (Number(i.qtd) || 0));
    // 'entregue' manual (encerrar mesmo com falta) não é rebaixado para parcial.
    if (completo) novo.situacao = "entregue";
    else if (novo.situacao !== "entregue") novo.situacao = "parcial";

    // Quem decidiu que chegou tudo foi o servidor — então é ele que fecha as
    // solicitações ligadas. O navegador sozinho não enxerga os recebimentos do
    // outro aparelho e deixaria a solicitação presa em "em compra".
    if (novo.situacao === "entregue" && (!antigo || antigo.situacao !== "entregue")) {
      for (const sid of (novo.scIds || [])) {
        try {
          const sc = await lerUm("sc", sid);
          if (!sc || sc.situacao === "atendida" || sc.apagadoEm) continue;
          // Só fecha quando TODAS as ordens daquela solicitação chegaram. Um
          // pedido dividido em duas compras virava "atendida" na primeira
          // entrega e o resto do material sumia do radar de todo mundo.
          let faltaAlguma = false;
          for (const oid of (sc.ocIds || [])) {
            if (oid === id) continue;
            const outra = await lerUm("oc", oid);
            if (!outra || outra.apagadoEm || outra.situacao === "cancelada") continue;
            if (outra.situacao !== "entregue") { faltaAlguma = true; break; }
          }
          if (faltaAlguma) continue;
          sc.situacao = "atendida";
          sc.historico = unirPorId(sc.historico, [{
            id: idNovo(), em: agora(), por: por || "—",
            o_que: "Material recebido (" + (novo.codigo || "") + ")",
          }]);
          sc.atualizadoEm = agora();
          await gravarUm("sc", sid, sc);
        } catch { /* fechar a solicitação não pode derrubar a gravação da ordem */ }
      }
    }
  }

  if (!novo.criadoEm) { novo.criadoEm = agora(); novo.criadoPor = por || registro.criadoPor || "—"; }
  novo.atualizadoEm = agora();
  novo.atualizadoPor = por || novo.atualizadoPor || "—";

  const pre = COLECOES[col].pre;
  if (pre && !novo.numero) {
    novo.numero = await proximoNumero(col);
    novo.codigo = pre + "-" + String(novo.numero).padStart(4, "0");
    try { await guardarIndiceNumero(col, novo.numero, id); } catch { /* índice é atalho */ }
  }
  if (pre && !novo.codigo && novo.numero) novo.codigo = pre + "-" + String(novo.numero).padStart(4, "0");
  if (col === "oc" && !novo.tokenPublico) novo.tokenPublico = tokenCurto();

  // Cada fornecedor convidado ganha um endereço próprio para responder — é o
  // link que vai no WhatsApp. Um token por convite: um fornecedor nunca vê a
  // resposta do outro.
  if (col === "cot") {
    novo.fornecedores = (novo.fornecedores || []).map((f: any) =>
      f && !f.token ? { ...f, token: tokenCurto() } : f);
  }

  await gravarUm(col, id, novo);
  await marcarMudanca(col);
  novo._col = col;
  return novo;
}

/* ── Limpeza do que vem de fora (solicitação pública) ──────────────────────── */
const txt = (v: unknown, max?: number) => String(v == null ? "" : v).slice(0, max || 200).trim();
const num = (v: unknown) => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : 0; };

function limparSolicitacao(r: any) {
  const itens = (Array.isArray(r.itens) ? r.itens : []).slice(0, 40).map((it: any, i: number) => ({
    id: it.id || idNovo(), n: i + 1,
    descricao: txt(it.descricao, 300),
    unid: txt(it.unid, 10),
    qtd: num(it.qtd),
    obs: txt(it.obs, 200),
  })).filter((it: any) => it.descricao);
  return {
    obraId: txt(r.obraId, 40) || "producao",
    obra: txt(r.obra, 120),
    solicitante: {
      nome: txt(r.solicitante && r.solicitante.nome, 80),
      telefone: txt(r.solicitante && r.solicitante.telefone, 30),
      funcao: txt(r.solicitante && r.solicitante.funcao, 60),
    },
    setor: txt(r.setor, 60),
    urgencia: ["normal", "urgente", "critica"].includes(r.urgencia) ? r.urgencia : "normal",
    necessidadeEm: txt(r.necessidadeEm, 10),
    justificativa: txt(r.justificativa, 800),
    itens,
    situacao: "nova",
    origem: "link público",
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const h = Object.fromEntries(req.headers);
  const token = h["x-token"] || body.token;
  const TOKEN = Deno.env.get("COMPRAS_TOKEN");
  if (!TOKEN || token !== TOKEN) return json({ error: "Não autorizado" }, 401);

  const { action } = body;
  const cfg = await lerCfg();

  // Identidade: o crachá da Central de Acessos no header Authorization.
  const quem: Quem | null = await identificarPorCracha(req);
  const autenticado = !!quem;
  // Nome que vai para o histórico: se o acesso é próprio, o nome do cadastro
  // manda — assim ninguém assina no lugar de outro trocando o campo do login.
  const por = (quem && quem.proprio && quem.nome) ||
    txt(h["x-quem"] ? decodeURIComponent(h["x-quem"]) : (body.por || ""), 60) || "—";

  // "list"/"getCfg" entram aqui porque quem chama é o BACKUP DO HUB (painel-
  // backup), servidor-a-servidor com o x-token deste sistema — não há pessoa
  // logada, logo não há crachá. O x-token é o gate: é secret do Supabase, não
  // viaja para navegador nenhum além do próprio app.
  const PUBLICAS = ["ping", "cfgPublico", "list", "getCfg", "novaSolicitacao", "andamento", "verPublico",
    "verCotacao", "responderCotacao"];
  if (!PUBLICAS.includes(action) && !autenticado) return json({ error: "Entre de novo: sessão inválida ou vencida.", semSenha: true }, 401);
  if (!PUBLICAS.includes(action) && !podeFazer(quem, action)) {
    await registrarLog({ acao: "bloqueado: " + action, por, perfil: quem!.perfil });
    return json({ error: "Seu acesso não permite isso. Fale com a direção.", semPermissao: true }, 403);
  }

  try {
    switch (action) {

      // Não devolve se a senha bate: isso virava um oráculo para testar senha
      // em massa sem deixar rastro. Quem quer conferir a senha usa 'entrar'.
      case "ping":
        return json({ ok: true, runtime: "supabase" });

      // ── Vínculo com a O.S. do Mubisys ──────────────────────────────────────
      // O PCP importa as O.S. do ERP de hora em hora para o MESMO banco
      // (pcp_registros). Ler dali é mais rápido e mais confiável do que chamar
      // o Mubisys de novo (25-40s por requisição, e engasga com 4+ paralelas).
      // Devolve só o que o pedido precisa: cliente, contato e itens — sem
      // valores de venda (o preço da O.S. não é assunto do Compras).
      case "buscarOS": {
        const numero = String(body.numero ?? "").replace(/\D/g, "");
        if (!numero) return json({ error: "Informe o número da O.S." }, 400);
        const { data } = await db.from("pcp_registros").select("registro")
          .eq("colecao", "os").eq("apagado", false)
          .eq("registro->>numero", numero).limit(1).maybeSingle();
        if (!data) return json({ ok: true, os: null });
        const r: any = data.registro || {};
        return json({
          ok: true,
          os: {
            numero: String(r.numero ?? numero),
            cliente: String(r.cliente ?? ""),
            contato: String(r.contato ?? ""),
            whatsapp: String(r.whatsapp ?? ""),
            endereco: String(r.endereco ?? ""),
            servico: String(r.servico ?? ""),
            vendedor: String(r.vendedor ?? ""),
            previsaoEntrega: String(r.previsaoEntrega ?? ""),
            itens: Array.isArray(r.itens) ? r.itens.map((i: any) => ({
              descricao: String(i?.descricao ?? i?.item ?? ""),
              qtde: Number(i?.qtde ?? 0) || 0,
              medidas: String(i?.medidas ?? ""),
            })) : [],
          },
        });
      }

      case "cfgPublico":
        return json({
          ok: true,
          empresa: { nome: cfg.empresa.nome, nomeCurto: cfg.empresa.nomeCurto },
          obras: (cfg.obras || []).filter((o: any) => o.ativa !== false).map((o: any) => ({ id: o.id, nome: o.nome })),
          setores: cfg.setores,
          unidades: cfg.unidades,
        });

      // Tudo que o painel precisa numa requisição só.
      case "snapshot": {
        const todos = await lerTudo(body.colecoes || null, NOMES_COLECOES);
        // O celular do solicitante não leva preço nem contrato para casa: o cache fica
        // em texto no aparelho e sobrevive ao desligamento do acesso.
        const registros = filtrarLeitura(quem, todos);
        const cfgSaida = cfgSemSegredo(cfg);
        if (perfilDe(quem) !== "direcao") cfgSaida.usuarios = [];
        return json({
          ok: true, cfg: cfgSaida, registros, em: agora(),
          eu: { id: quem!.id, nome: quem!.nome, perfil: quem!.perfil, proprio: quem!.proprio },
        });
      }

      // Recusa item a item, NUNCA o pacote inteiro: quem recebe manda o
      // recebimento e a solicitação no mesmo lote, e barrar tudo por causa de
      // um item fazia o app descartar o recebimento junto — trabalho de uma
      // manhã inteira sumindo por causa de uma linha proibida.
      case "salvarLote": {
        const itens = Array.isArray(body.itens) ? body.itens : [];
        if (!itens.length) return json({ ok: true, salvos: [] });
        const salvos: any[] = [];
        const recusados: any[] = [];
        for (const it of itens) {
          if (!it || !it.colecao || !it.registro) continue;
          const atual = it.registro.id ? await lerUm(it.colecao, it.registro.id) : null;
          // Repõe o que a máscara de leitura tinha tirado, ANTES de comparar e
          // de gravar: sem isso, o solicitante era recusado por "alterar" um
          // preço que ele nunca viu — e, se passasse, apagaria esse preço.
          const reg = reporEscondidos(quem, it.colecao, it.registro, atual);
          const motivo = motivoRecusa(quem, it.colecao, reg, atual);
          if (motivo) { recusados.push({ colecao: it.colecao, id: it.registro.id, motivo }); continue; }
          salvos.push(await gravar(it.colecao, reg, por));
        }
        if (recusados.length) {
          await registrarLog({
            acao: "recusou gravação", por, perfil: perfilDe(quem),
            detalhe: recusados.map((r) => r.colecao + ":" + r.motivo).join(" | "),
          });
        }
        await registrarLog({ acao: "salvou", por, qtd: salvos.length, cols: itens.map((i: any) => i.colecao).join(",") });
        return json({ ok: true, salvos, recusados });
      }

      // Lixeira: marca apagadoEm em vez de sumir com o registro.
      case "apagar": {
        const { colecao, id } = body;
        const r = await lerUm(colecao, id);
        if (!r) return json({ ok: true });
        r.apagadoEm = agora();
        r.apagadoPor = por;
        await gravarUm(colecao, id, r);
        await marcarMudanca(colecao);
        await registrarLog({ acao: "apagou", por, colecao, id, codigo: r.codigo || r.nome });
        return json({ ok: true });
      }

      // Apaga DE VEZ tudo que está na lixeira (o botão em Configurações), junto
      // com os arquivos que só aquele registro usava — senão uma planta de 60MB
      // ficaria ocupando espaço para sempre depois de apagada.
      case "esvaziarLixeira": {
        const { data } = await db.from("compras_registros").select("colecao, id, registro").eq("apagado", true);
        let apagados = 0, arquivos = 0;
        for (const linha of (data || [])) {
          const o = linha.registro as any;
          for (const idArq of arquivosDoRegistro(o)) {
            const meta = await lerUm("_arqmeta", idArq);
            const partes = (meta && meta.partes) || 1;
            const chaves = [idArq + "/meta"];
            for (let i = 0; i < partes; i++) chaves.push(idArq + "/p" + i);
            await apagarArquivo(chaves);
            await apagarDeVez("_arqmeta", idArq);
            arquivos++;
          }
          await apagarDeVez(linha.colecao, linha.id);
          apagados++;
        }
        await registrarLog({ acao: "esvaziou a lixeira", por, qtd: apagados, arquivos });
        return json({ ok: true, apagados, arquivos });
      }

      // Recomeça a numeração de uma coleção (virada de ano, ou depois de
      // limpar os testes).
      case "reiniciarNumeracao": {
        const col = body.colecao;
        if (!COLECOES[col] || !COLECOES[col].pre) return json({ ok: false, error: "Coleção sem numeração" }, 400);
        const proximo = Math.max(1, parseInt(body.proximo, 10) || 1);
        const { data } = await db.from("compras_seq_idx").delete().eq("colecao", col).gte("numero", proximo).select("numero");
        await definirNumeracao(col, proximo - 1);
        await registrarLog({ acao: "reiniciou a numeração", por, colecao: col, proximo });
        return json({ ok: true, proximo, soltas: (data || []).length });
      }

      case "restaurarItem": {
        const { colecao, id } = body;
        const r = await lerUm(colecao, id);
        if (!r) return json({ ok: false, error: "Não encontrado" }, 404);
        delete r.apagadoEm; delete r.apagadoPor;
        r.atualizadoEm = agora(); r.atualizadoPor = por;
        await gravarUm(colecao, id, r);
        await marcarMudanca(colecao);
        return json({ ok: true, registro: r });
      }

      // ── PÚBLICO: a equipe pede material sem senha ───────────────────────────
      case "novaSolicitacao": {
        const limpo: any = limparSolicitacao(body.registro || {});
        if (!limpo.solicitante.nome) return json({ ok: false, error: "Informe seu nome" }, 400);
        if (!limpo.itens.length) return json({ ok: false, error: "Inclua pelo menos um item" }, 400);
        const autor = limpo.solicitante.nome;
        limpo.historico = [{ id: idNovo(), em: agora(), por: autor, o_que: "Solicitação registrada pelo link público" }];
        const salvo = await gravar("sc", limpo, autor);
        await registrarLog({ acao: "nova solicitação", por: autor, codigo: salvo.codigo, obra: salvo.obra });
        return json({ ok: true, codigo: salvo.codigo, id: salvo.id, numero: salvo.numero });
      }

      // ── PÚBLICO: quadro de andamento da obra ───────────────────────────────
      // Basta abrir o link: a pessoa vê TODOS os pedidos e o que está por
      // chegar. O que NÃO sai daqui: preço unitário, valor da ordem e telefone
      // de quem pediu — informação comercial e dado pessoal de terceiro.
      case "andamento": {
        // Cache de 60s: sem ele, cada abertura varre a base inteira — e esta é
        // uma rota aberta, que pode ser chamada em rajada.
        const { data: cacheLinha } = await db.from("compras_meta").select("valor").eq("chave", "andamento_cache").maybeSingle();
        const cache = cacheLinha?.valor as any;
        if (cache && cache.em && (Date.now() - new Date(cache.em).getTime()) < 60000) {
          return json({ ok: true, em: cache.em, pedidos: cache.pedidos, doCache: true });
        }

        const todos = await lerTudo(["sc", "oc"], NOMES_COLECOES);
        const ocs = todos.filter((x: any) => x._col === "oc" && !x.apagadoEm);
        const porId = new Map(ocs.map((o: any) => [o.id, o]));
        const pedidos = todos
          .filter((x: any) => x._col === "sc" && !x.apagadoEm)
          .sort((a: any, b: any) => String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")))
          .slice(0, 150)
          .map((s: any) => ({
            codigo: s.codigo, situacao: s.situacao, obra: s.obra, setor: s.setor, urgencia: s.urgencia,
            quem: (s.solicitante && s.solicitante.nome) || "—",
            criadoEm: s.criadoEm, necessidadeEm: s.necessidadeEm, motivoRecusa: s.motivoRecusa,
            itens: (s.itens || []).map((i: any) => ({ descricao: i.descricao, qtd: i.qtd, unid: i.unid })),
            compras: (s.ocIds || []).map((id: string) => porId.get(id)).filter(Boolean).map((o: any) => ({
              codigo: o.codigo, situacao: o.situacao,
              fornecedor: (o.fornecedor && o.fornecedor.nome) || "",
              entregaPrevista: o.entregaPrevista, recebidoEm: o.recebidoEm,
            })),
            historico: (s.historico || []).slice(-6).map((x: any) => ({ em: x.em, por: x.por, o_que: x.o_que })),
          }));

        const em = agora();
        try {
          await db.from("compras_meta").upsert({ chave: "andamento_cache", valor: { em, pedidos }, atualizado_em: em });
        } catch { /* sem cache, só fica mais lento */ }
        return json({ ok: true, em, pedidos });
      }

      // ── PÚBLICO: fornecedor abre a OC/OS pelo link do WhatsApp ─────────────
      case "verPublico": {
        const { id } = body;
        const tipo = "oc";
        if (body.tipo && body.tipo !== "oc") return json({ ok: false, error: "Tipo inválido" }, 400);
        const r = await lerUm(tipo, id);
        if (!r || r.apagadoEm) return json({ ok: false, error: "Documento não encontrado" }, 404);
        if (!r.tokenPublico || r.tokenPublico !== body.t) return json({ ok: false, error: "Link inválido" }, 403);
        if (r.situacao === "rascunho") return json({ ok: false, error: "Documento ainda não emitido" }, 403);

        // LISTA BRANCA (nunca lista negra): só sai o que o documento precisa
        // mostrar. Lista negra sempre fica para trás quando um módulo novo passa
        // a guardar campo novo dentro do mesmo registro.
        const campos = ["id", "codigo", "situacao", "obra", "dataEmissao", "entregaPrevista", "fornecedor",
          "localEntrega", "prazoEntrega", "validadeProposta", "modalidade", "condicaoPagamento",
          "formaPagamento", "dadosBancarios", "garantia", "notaFiscalObrigatoria", "itens",
          "ipiPerc", "icmsPerc", "frete", "seguro", "desconto", "total", "totalLiquido", "observacoes"];
        const enxuto: any = {};
        for (const c of campos) if (r[c] !== undefined) enxuto[c] = r[c];

        const publico = { empresa: cfg.empresa, assinaturas: cfg.assinaturas, clausulasOC: cfg.clausulasOC };
        return json({ ok: true, registro: enxuto, cfg: publico });
      }

      // ── PÚBLICO: o fornecedor abre a cotação pelo link ─────────────────────
      case "verCotacao": {
        const c = await lerUm("cot", body.id);
        if (!c || c.apagadoEm) return json({ ok: false, error: "Cotação não encontrada" }, 404);
        const f = (c.fornecedores || []).find((x: any) => x.token && x.token === body.t);
        if (!f) return json({ ok: false, error: "Link inválido" }, 403);
        if (c.situacao === "cancelada") return json({ ok: false, error: "Esta cotação foi cancelada" }, 403);
        // O fornecedor vê SÓ o que precisa: os itens e a resposta dele. Nunca o
        // preço nem o nome dos concorrentes.
        return json({
          ok: true,
          empresa: { nome: cfg.empresa.nome, nomeCurto: cfg.empresa.nomeCurto },
          cotacao: {
            codigo: c.codigo, obra: c.obra, prazoResposta: c.prazoResposta,
            observacoes: c.observacoes, encerrada: c.situacao !== "aberta",
            itens: (c.itens || []).map((i: any) => ({ id: i.id, descricao: i.descricao, unid: i.unid, qtd: i.qtd })),
          },
          minhaResposta: {
            nome: f.nome, contato: f.contato, precos: f.precos || {}, frete: f.frete,
            prazoEntrega: f.prazoEntrega, condicaoPagamento: f.condicaoPagamento,
            validade: f.validade, obs: f.obs, respondidoEm: f.respondidoEm,
          },
        });
      }

      case "responderCotacao": {
        const c = await lerUm("cot", body.id);
        if (!c || c.apagadoEm) return json({ ok: false, error: "Cotação não encontrada" }, 404);
        if (c.situacao !== "aberta") return json({ ok: false, error: "Esta cotação já foi encerrada" }, 403);
        const i = (c.fornecedores || []).findIndex((x: any) => x.token && x.token === body.t);
        if (i < 0) return json({ ok: false, error: "Link inválido" }, 403);

        const precos: Record<string, number> = {};
        for (const it of (c.itens || [])) {
          const v = num((body.precos || {})[it.id]);
          if (v > 0) precos[it.id] = v;
        }
        if (!Object.keys(precos).length) return json({ ok: false, error: "Informe o preço de pelo menos um item" }, 400);

        const f = c.fornecedores[i];
        const total = (c.itens || []).reduce((s2: number, it: any) =>
          s2 + (precos[it.id] || 0) * (Number(it.qtd) || 0), 0) + num(body.frete);

        c.fornecedores[i] = {
          ...f, precos, frete: num(body.frete), total,
          prazoEntrega: txt(body.prazoEntrega, 60),
          condicaoPagamento: txt(body.condicaoPagamento, 60),
          validade: txt(body.validade, 40),
          obs: txt(body.obs, 500),
          contato: txt(body.contato, 80) || f.contato,
          respondidoEm: agora(),
        };
        c.historico = unirPorId(c.historico, [{
          id: idNovo(), em: agora(), por: f.nome || "fornecedor",
          o_que: "Cotação respondida por " + (f.nome || "—") + ": " +
            total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        }]);
        c.atualizadoEm = agora();
        await gravarUm("cot", c.id, c);
        await marcarMudanca("cot");
        return json({ ok: true, total });
      }

      // ── Configurações ──────────────────────────────────────────────────────
      case "salvarCfg": {
        const novo = { ...cfg, ...(body.cfg || {}) };
        novo.senhaHash = cfg.senhaHash;      // senha só muda pela ação própria
        novo.usuarios = cfg.usuarios || [];  // idem os acessos: o cliente nem vê os hashes
        novo.atualizadoEm = agora();
        novo.atualizadoPor = por;
        await gravarCfg(novo);
        await registrarLog({ acao: "mudou configuração", por });
        return json({ ok: true, cfg: cfgSemSegredo(novo) });
      }

      /* ── Acessos da equipe ─────────────────────────────────────────────────
         Um acesso por pessoa: o histórico passa a dizer QUEM aprovou, e
         desligar alguém não obriga a trocar a senha de todo mundo. */




      // ── Log e backup ───────────────────────────────────────────────────────
      case "log":
        return json({ ok: true, linhas: await lerLog(body.limite || 200) });

      // ── Protocolo do BACKUP DO HUB (painel-backup) ─────────────────────────
      // O Painel puxa cada sistema com {action:"list", after} até nextAfter
      // vir null, e depois {action:"getCfg"}. São as duas únicas ações que ele
      // conhece — o "backup" logo abaixo é o export manual da própria tela e
      // devolve tudo de uma vez, o que estouraria o tempo num sistema grande.
      case "list": {
        const PASSO = 500;
        const de = Number(body.after ?? 0) || 0;
        const { data, error } = await db.from("compras_registros")
          .select("colecao, id, registro, apagado, atualizado_em")
          .order("colecao").order("id").range(de, de + PASSO - 1);
        if (error) throw new Error(error.message);
        const linhas = (data ?? []).map((l: any) => ({ _col: l.colecao, ...l.registro }));
        // nextAfter só quando a página veio CHEIA: página parcial é o fim, e
        // devolver um cursor aqui faria o Painel pedir uma página vazia para
        // sempre (o laço dele só para quando isto vem null).
        return json({ ok: true, registros: linhas, nextAfter: linhas.length === PASSO ? de + PASSO : null });
      }

      case "getCfg":
        return json({ ok: true, cfg: cfgSemSegredo(cfg) });

      case "backup": {
        const registros = await lerTudo(null, NOMES_COLECOES);
        // O arquivo do backup sai do servidor e vai parar no computador de
        // alguém: nenhum hash de senha viaja junto.
        const limpo = cfgSemSegredo(cfg);
        // A numeração entra no backup: sem ela, uma restauração recomeçaria em
        // SC-0001 e repetiria número de documento que já foi para fornecedor.
        const seq = await lerNumeracao();
        return json({ ok: true, em: agora(), cfg: limpo, registros, seq });
      }

      case "restaurar": {
        const registros = Array.isArray(body.registros) ? body.registros : [];
        let n = 0;
        const maiorNumero: Record<string, number> = {};
        for (const r of registros) {
          const col = r._col;
          if (!COLECOES[col] || !r.id) continue;
          const copia = { ...r };
          delete copia._col;
          await gravarUm(col, r.id, copia);
          if (r.numero) maiorNumero[col] = Math.max(maiorNumero[col] || 0, Number(r.numero) || 0);
          n++;
        }
        // A numeração acompanha o que foi restaurado, senão o próximo documento
        // sairia com um número que já existe.
        const atual = await lerNumeracao();
        for (const [col, maior] of Object.entries(maiorNumero)) {
          const ja = atual["ultimo_" + col];
          if (!ja || (ja.n || 0) < maior) await definirNumeracao(col, maior);
        }
        await marcarMudanca(Object.keys(maiorNumero));
        await registrarLog({ acao: "restaurou backup", por, qtd: n });
        return json({ ok: true, restaurados: n });
      }

      default:
        return json({ error: "Ação desconhecida: " + action }, 400);
    }
  } catch (e) {
    console.error("[nucleo] erro:", e);
    return json({ error: (e as Error)?.message || String(e) }, 500);
  }
});
