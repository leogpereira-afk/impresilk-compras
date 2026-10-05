// ============================================================================
// Supabase Edge Function "acervo" — arquivos grandes (projetos, documentos,
// fotos de recebimento e do diário).
//
// Porte de netlify/functions/acervo.mjs. MANTÉM o protocolo em partes que o
// cliente já usa (iniciar → parte → finalizar → baixarParte): o limite de corpo
// de uma Edge Function é parecido com o do Netlify, e trocar o protocolo
// obrigaria a reescrever o upload do app — que funciona no 4G da rua e já foi
// testado. As partes viram objetos no bucket "arquivos" do Storage:
//
//   <id>/meta   → metadados (na tabela registros, coleção interna "_arqmeta")
//   <id>/p0, p1 → os pedaços
// ============================================================================
import { json, preflight } from "../_shared/cors.ts";
import { identificarPorCracha, podeFazer } from "../_shared/acesso.ts";
import {
  agora,
  idNovo,
  lerUm,
  gravarUm,
  lerCfgBruta,
  subirParte,
  baixarParte,
  apagarArquivo,
  apagarDeVez,
  lerColecaoBruta, atualizarRegistro,
} from "../_shared/dados.ts";

// Coleção interna: guarda o "meta" de cada arquivo (nome, tamanho, partes).
// Não aparece em COLECOES porque não é dado do negócio — é encanamento.
const META = "_arqmeta";
const TAM_PARTE = 2.5 * 1024 * 1024;
const MAX_ARQUIVO = 1024 * 1024 * 1024;
const mesmoConteudo = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const uploadProprio = (meta: any, eu: { id: string }) => meta.donoId && meta.donoId === eu.id;

const b64ParaBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesParaB64 = (b: Uint8Array) => {
  let s = "";
  // Em pedaços: passar 2,5MB de uma vez para String.fromCharCode estoura a pilha.
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const h = Object.fromEntries(req.headers);
  const TOKEN = Deno.env.get("COMPRAS_TOKEN");
  if (!TOKEN || (h["x-token"] || body.token) !== TOKEN) return json({ error: "Não autorizado" }, 401);

  const cfg = await lerCfgBruta();
  // Mesma identidade do nucleo: o crachá da Central de Acessos. O acervo guarda
  // foto de recebimento e projeto — se ele aceitasse outra régua, seria a porta
  // dos fundos do controle de acesso que o nucleo aplica.
  const eu = await identificarPorCracha(req, ["iniciar", "parte", "finalizar", "apagar"].includes(body.action));
  if (!eu) return json({ error: "Entre de novo: sessão inválida ou vencida.", semSenha: true }, 401);

  // 'apagar' e 'uso' mexem no acervo inteiro — a mesma régua do nucleo vale
  // aqui, senão o perfil solicitante ganharia pelo acervo o poder de apagar que o
  // nucleo nega.
  const ACAO_EQUIVALENTE: Record<string, string> = { apagar: "apagar", uso: "log" };
  const equivalente = ACAO_EQUIVALENTE[body.action];
  if (equivalente && !podeFazer(eu, equivalente)) {
    return json({ error: "Seu acesso não permite isso. Fale com a direção.", semPermissao: true }, 403);
  }

  // O nome do histórico vem do cadastro quando o acesso é próprio.
  const quem = (eu.proprio && eu.nome) ||
    String(h["x-quem"] ? decodeURIComponent(h["x-quem"]) : (body.por || "—")).slice(0, 60);

  try {
    switch (body.action) {

      // Abre um arquivo novo e devolve o id que as partes vão usar.
      case "iniciar": {
        const tamanho = Number(body.tamanho), partes = Number(body.partes);
        if (!Number.isSafeInteger(tamanho) || tamanho < 0 || tamanho > MAX_ARQUIVO ||
            !Number.isInteger(partes) || partes !== Math.max(1, Math.ceil(tamanho / TAM_PARTE))) {
          return json({ ok: false, error: "Tamanho ou quantidade de partes inválidos (limite de 1 GB)." }, 400);
        }
        const id = idNovo() + Math.random().toString(36).slice(2, 6);
        const meta = {
          id,
          nome: String(body.nome || "arquivo").slice(0, 200),
          // O CLIENTE manda o tipo no campo 'mime' (store.js). O porte estava
          // lendo 'body.tipo' — que nunca chega — e gravava tudo como
          // octet-stream, então o PDF baixava sem abrir. `?? body.tipo` deixa
          // tolerante a qualquer chamador futuro.
          mime: String(body.mime ?? body.tipo ?? "application/octet-stream").slice(0, 100),
          tamanho, partes, donoId: eu.id,
          recebidas: 0,
          criadoEm: agora(),
          criadoPor: quem,
          pronto: false,
        };
        await gravarUm(META, id, meta);
        return json({ ok: true, id, meta });
      }

      case "parte": {
        const { id, dados } = body;
        // O CLIENTE manda o índice do pedaço no campo 'i' (store.js). O porte
        // lia 'body.n' — que chega vazio — e Number(undefined) vira NaN: TODA
        // parte era gravada na mesma chave 'id/pNaN' (uma por cima da outra) e
        // nenhum upload concluía. Aceita os dois nomes, mas exige um número.
        const idx = Number(body.i ?? body.n);
        if (!Number.isInteger(idx) || idx < 0) return json({ ok: false, error: "Índice de parte inválido" }, 400);
        const meta = await lerUm(META, id);
        if (!meta) return json({ ok: false, error: "Arquivo não encontrado" }, 404);
        if (meta.pronto || !uploadProprio(meta, eu)) return json({ ok: false, error: "Este arquivo não pode ser alterado. Inicie um novo envio." }, 403);
        if (idx >= meta.partes) return json({ ok: false, error: "Índice fora do arquivo" }, 400);
        if (typeof dados !== "string" || dados.length > Math.ceil(TAM_PARTE / 3) * 4) return json({ ok: false, error: "Parte inválida ou muito grande" }, 400);
        let bytes: Uint8Array;
        try { bytes = b64ParaBytes(dados); } catch { return json({ ok: false, error: "Conteúdo de parte inválido" }, 400); }
        const esperado = Math.min(TAM_PARTE, meta.tamanho - idx * TAM_PARTE);
        if (bytes.length !== esperado) return json({ ok: false, error: "A parte não tem o tamanho declarado" }, 400);
        const chave = id + "/p" + idx;
        // Objetos imutáveis: o reenvio idêntico é permitido, nunca substituição.
        // Mesmo uma parte iniciada antes de finalizar não pode trocar bytes.
        try { await subirParte(chave, bytes); }
        catch (e) {
          const existente = await baixarParte(chave);
          if (!existente) throw e;
          if (!mesmoConteudo(existente, bytes)) return json({ ok: false, error: "Esta parte já foi enviada com outro conteúdo. Inicie um novo envio." }, 409);
        }
        const salvo = await atualizarRegistro(META, id, atual => {
          if (!atual || !uploadProprio(atual, eu)) throw new Error("Envio indisponível");
          if (atual.pronto) return null;
          return { ...atual, recebidas: Math.max(Number(atual.recebidas) || 0, idx + 1) };
        });
        return json({ ok: true, recebidas: salvo.recebidas, partes: salvo.partes });
      }

      case "finalizar": {
        const meta = await lerUm(META, body.id);
        if (!meta) return json({ ok: false, error: "Arquivo não encontrado" }, 404);
        if (!uploadProprio(meta, eu)) return json({ ok: false, error: "Somente quem iniciou o envio pode concluí-lo. Inicie um novo envio." }, 403);
        if (meta.pronto) return json({ ok: true, meta });
        let tamanho = 0;
        for (let i = 0; i < meta.partes; i++) {
          const p = await baixarParte(body.id + "/p" + i);
          if (!p || p.length !== Math.min(TAM_PARTE, meta.tamanho - i * TAM_PARTE)) return json({ ok: false, error: "Falta ou está incompleta a parte " + i + " de " + meta.partes }, 400);
          tamanho += p.length;
        }
        if (tamanho !== meta.tamanho) return json({ ok: false, error: "Arquivo incompleto. Reenvie as partes pendentes." }, 400);
        const salvo = await atualizarRegistro(META, body.id, atual => {
          if (!atual || !uploadProprio(atual, eu)) throw new Error("Envio indisponível");
          return atual.pronto ? null : { ...atual, pronto: true, recebidas: atual.partes, concluidoEm: agora() };
        });
        return json({ ok: true, meta: salvo });
      }

      case "meta": {
        const meta = await lerUm(META, body.id);
        if (!meta) return json({ ok: false, error: "Arquivo não encontrado" }, 404);
        if (!meta.pronto && !uploadProprio(meta, eu)) return json({ ok: false, error: "Envio ainda não compartilhado." }, 403);
        return json({ ok: true, meta });
      }

      case "baixarParte": {
        const idx = Number(body.i ?? body.n);
        if (!Number.isInteger(idx) || idx < 0) return json({ ok: false, error: "Índice de parte inválido" }, 400);
        const meta = await lerUm(META, body.id);
        if (!meta) return json({ ok: false, error: "Arquivo não encontrado" }, 404);
        if (!meta.pronto && !uploadProprio(meta, eu)) return json({ ok: false, error: "Envio ainda não compartilhado." }, 403);
        if (idx >= meta.partes) return json({ ok: false, error: "Índice fora do arquivo" }, 400);
        const bytes = await baixarParte(body.id + "/p" + idx);
        if (!bytes) return json({ ok: false, error: "Parte não encontrada" }, 404);
        return json({ ok: true, dados: bytesParaB64(bytes), partes: meta.partes, meta });
      }

      case "apagar": {
        const meta = await lerUm(META, body.id);
        if (!meta) return json({ ok: true });
        const chaves: string[] = [];
        for (let i = 0; i < (meta.partes || 1); i++) chaves.push(body.id + "/p" + i);
        await apagarArquivo(chaves);
        await apagarDeVez(META, body.id);
        return json({ ok: true });
      }

      case "uso": {
        // Conta pelo metadado, não pelo Storage: listar pasta por pasta seria
        // uma chamada por arquivo, e o tamanho já está guardado aqui. Paginado
        // para não parar em 1000 arquivos.
        const linhas = await lerColecaoBruta(META, "registro");
        let bytes = 0, arquivos = 0;
        for (const l of linhas) {
          const m = l.registro as any;
          if (!m || !m.pronto) continue;
          bytes += Number(m.tamanho) || 0;
          arquivos++;
        }
        return json({ ok: true, arquivos, bytes });
      }

      default:
        return json({ error: "Ação desconhecida: " + body.action }, 400);
    }
  } catch (e) {
    console.error("[acervo] erro:", e);
    return json({ error: (e as Error)?.message || String(e) }, 500);
  }
});
