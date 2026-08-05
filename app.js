/* App — casca do sistema: menu lateral, roteador, painel inicial,
   configurações e as telas públicas (equipe e fornecedor). */

/* ── Rotas ─────────────────────────────────────────────────────────────────── */
const PUBLICAS = ['solicitar', 'acompanhar', 'ver', 'cotar'];

/* ── Perfis de acesso ──────────────────────────────────────────────────────────
   Espelho do que o servidor faz valer (nucleo.mjs). Aqui é só para não mostrar
   à pessoa botão que ela não pode apertar — quem tranca a porta é o servidor. */
const PERFIS_APP = {
  direcao: {
    txt: 'Direção',
    desc: 'Faz tudo, inclusive criar acessos, mexer nas configurações e apagar.',
    telas: null   // null = todas
  },
  escritorio: {
    txt: 'Compras',
    desc: 'O dia a dia inteiro de compras: cota, negocia, emite ordem e cobra o ' +
      'fornecedor. Não cria acessos, não mexe nas configurações e não esvazia a lixeira.',
    telas: ['painel', 'solicitacoes', 'cotacoes', 'compras', 'recebimento',
      'fornecedores', 'catalogos', 'manuais', 'treinamentos', 'acessos', 'config']
  },
  obra: {
    txt: 'Solicitante (produção / instalação)',
    desc: 'Pede material, registra o recebimento e consulta catálogo, manual e ' +
      'treinamento. Não aprova compra, não vê preço de cotação e não apaga nada.',
    // 'config' entra para TODOS: era por ali que a pessoa trocava a própria
    // senha, e a tela mostra a cada perfil só os cartões que são dele.
    telas: ['painel', 'solicitacoes', 'recebimento', 'catalogos', 'manuais', 'treinamentos', 'config']
  }
};

const perfilAtual = () => PERFIS_APP[S.perfil] ? S.perfil : 'direcao';
const ehDirecao = () => perfilAtual() === 'direcao';
function podeVer(rota) {
  const p = PERFIS_APP[perfilAtual()];
  return !p.telas || p.telas.includes(rota);
}

function rotaAtual() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const partes = h.split('/').filter((x) => x !== '');
  return { tela: partes[0] || 'painel', args: partes.slice(1) };
}

const irPara = (r) => { location.hash = '#/' + r; };

/* ── Menu ──────────────────────────────────────────────────────────────────── */
const MENU = [
  { grupo: 'Compras' },
  { rota: 'painel', icone: '◧', texto: 'Painel' },
  { rota: 'solicitacoes', icone: '📋', texto: 'Solicitações', bolha: () => lista('sc').filter((s) => s.situacao === 'nova').length },
  { rota: 'cotacoes', icone: '💵', texto: 'Cotações', bolha: () => lista('cot').filter((c) => c.situacao === 'aberta').length },
  { rota: 'compras', icone: '🧾', texto: 'Ordens de compra', bolha: () => lista('oc').filter((o) => ['emitida', ...SIT_ESPERANDO].includes(o.situacao)).length },
  { rota: 'recebimento', icone: '📦', texto: 'Recebimento', bolha: () => lista('oc').filter((o) => SIT_ESPERANDO.includes(o.situacao)).length },
  { rota: 'fornecedores', icone: '🏢', texto: 'Fornecedores' },
  // Acervo da comunicação visual: catálogo do que os fornecedores vendem,
  // manual do que a fábrica usa, e o treinamento de quem opera.
  { grupo: 'Acervo' },
  { rota: 'catalogos', icone: '📚', texto: 'Catálogos' },
  { rota: 'manuais', icone: '📘', texto: 'Manuais', bolha: () => docsVencendo(30).length },
  { rota: 'treinamentos', icone: '🎓', texto: 'Treinamentos' },
  { grupo: 'Sistema' },
  { rota: 'acessos', icone: '🔑', texto: 'Links para fornecedor' },
  // Os acessos da equipe moram DENTRO de Configurações: é configuração, e o
  // menu antes prometia "Minha senha" e abria a tela de gerenciar todo mundo.
  { rota: 'config', icone: '⚙️', texto: 'Configurações' }
];

/* ── Casca ─────────────────────────────────────────────────────────────────── */
function montarShell() {
  const app = document.getElementById('app');
  if (app.dataset.shell === '1') return;
  app.dataset.shell = '1';
  app.innerHTML =
    '<div class="app">' +
      '<aside class="lateral">' +
        '<div class="marca"><strong style="color:#fff;font-size:17px;letter-spacing:.5px">IMPRESILK</strong><small>Compras e suprimentos</small></div>' +
        '<nav class="menu" id="menu"></nav>' +
        '<div class="rodape-lateral" id="rodapeLateral"></div>' +
      '</aside>' +
      '<main class="conteudo">' +
        '<header class="topo">' +
          '<button class="hamburguer" id="btnMenu" aria-label="Menu">☰</button>' +
          '<div><h1 id="tituloTela">Painel</h1><div class="sub" id="subTela"></div></div>' +
          '<div class="dir" id="acoesTopo"></div>' +
        '</header>' +
        '<div class="pagina" id="pagina"></div>' +
      '</main>' +
    '</div>';

  document.getElementById('btnMenu').addEventListener('click', () => document.body.classList.toggle('menu-aberto'));
  document.getElementById('menu').addEventListener('click', (e) => {
    if (e.target.closest('a')) document.body.classList.remove('menu-aberto');
  });
}

function pintarMenu(telaAtiva) {
  const visivel = MENU.filter((m) => m.grupo || podeVer(m.rota));
  // Grupo sem nenhum item visível não aparece (o pessoal da empresa não vê o
  // título "Sistema" sozinho no meio do menu).
  const html = visivel.filter((m, i) => !m.grupo || (visivel[i + 1] && !visivel[i + 1].grupo)).map((m) => {
    if (m.grupo) return '<div class="grupo">' + esc(m.grupo) + '</div>';
    const n = m.bolha ? m.bolha() : 0;
    return '<a href="#/' + m.rota + '" class="' + (m.rota === telaAtiva ? 'ativo' : '') + '">' +
      '<span class="ic">' + m.icone + '</span>' + esc(typeof m.texto === 'function' ? m.texto() : m.texto) +
      (n ? '<span class="bolha">' + n + '</span>' : '') + '</a>';
  }).join('');
  document.getElementById('menu').innerHTML = html;

  const pend = S.fila.length;
  const rodape = document.getElementById('rodapeLateral');
  rodape.innerHTML =
    '<div><b>' + esc(S.quem || 'sem nome') + '</b>' +
      (S.perfil && S.perfil !== 'direcao' ? ' · ' + esc((PERFIS_APP[S.perfil] || {}).txt || '') : '') + '</div>' +
    '<div>' + (!S.online ? 'sem internet — salvando no aparelho'
      : pend ? pend + ' item(ns) esperando envio'
      : S.erroSync ? 'erro: ' + esc(S.erroSync)
      : 'tudo sincronizado') + '</div>' +
    '<div class="rodape-botoes">' +
      '<button id="btnSincronizar" title="Buscar novidades e enviar o que está esperando">' +
        (S.sincronizando ? '⏳ sincronizando…' : '🔄 Sincronizar' + (pend ? ' (' + pend + ')' : '')) + '</button>' +
      '<button id="btnSair" title="Trocar de usuário">🚪 Sair</button>' +
    '</div>' +
    '<div style="margin-top:6px">Compras Impresilk ' + esc(VERSAO) + '</div>';

  const bs = document.getElementById('btnSincronizar');
  if (bs) bs.addEventListener('click', sincronizarAgora);
  const bx = document.getElementById('btnSair');
  if (bx) bx.addEventListener('click', sair);
}

// Sincronizar na mão: na rua o sinal vai e volta, e esperar o ciclo
// automático de 90s com o caminhão parado no portão não serve.
async function sincronizarAgora() {
  if (!navigator.onLine) { toast('Sem internet agora. O que você fez está guardado no aparelho.', 'ruim'); return; }
  if (S.sincronizando) return;
  toast('Sincronizando…');
  const pendAntes = S.fila.length;
  try {
    await subirFila();
    await puxar();
    toast(pendAntes && !S.fila.length ? pendAntes + ' item(ns) enviado(s) · tudo em dia'
      : S.fila.length ? S.fila.length + ' item(ns) ainda esperando'
      : 'Tudo em dia', S.fila.length ? '' : 'bom');
  } catch (e) {
    toast('Não consegui sincronizar: ' + e.message, 'ruim');
  }
  render();
}

// Sair = trocar de usuário. Leva junto o cache do aparelho: os dados ficam em
// texto no celular e, sem isso, continuavam lá depois de a pessoa sair — ou de
// a direção desligar o acesso dela.
async function sair() {
  if (S.fila.length) {
    const ok = await confirmar(S.fila.length + ' alteração(ões) ainda não subiram para o servidor. ' +
      'Se você sair agora, esse trabalho se perde. Quer tentar sincronizar antes?',
      { perigo: true, ok: 'Sair mesmo assim', cancelar: 'Voltar e sincronizar' });
    if (!ok) { sincronizarAgora(); return; }
  } else if (!await confirmar('Sair do sistema? Você vai precisar da senha para entrar de novo.', { ok: 'Sair' })) {
    return;
  }
  try {
    AUTH.esquecer();
    localStorage.removeItem(K.perfil);
    localStorage.removeItem(K.usuario);
    localStorage.removeItem(K.cache);
    localStorage.removeItem(K.fila);
  } catch { /* modo privado */ }
  S.senhaHash = ''; S.perfil = 'direcao'; S.usuarioId = ''; S.acessoProprio = false;
  S.reg = regVazio(); S.fila = []; S.cfg = null;
  location.hash = '#/painel';
  render();
}

function cabecalho(titulo, sub, acoesHtml) {
  document.getElementById('tituloTela').textContent = titulo;
  document.getElementById('subTela').textContent = sub || '';
  document.getElementById('acoesTopo').innerHTML = acoesHtml || '';
}

/* ── Roteador ──────────────────────────────────────────────────────────────── */
/* (o objeto TELAS é declarado no ui.js, que carrega antes de quem o preenche) */
function render() {
  const { tela, args } = rotaAtual();

  if (PUBLICAS.includes(tela)) { renderPublico(tela, args); return; }
  if (!AUTH.temCracha()) { telaEntrar(); return; }

  montarShell();
  // O <datalist> tem de existir no documento para o list= dos campos funcionar.
  // Reescrito a cada render porque o catálogo pode ter acabado de ser trazido.
  let dl = document.getElementById('caixaDatalist');
  if (!dl) {
    dl = document.createElement('div');
    dl.id = 'caixaDatalist';
    dl.hidden = true;
    document.body.appendChild(dl);
  }
  dl.innerHTML = htmlDatalistProdutos();
  document.getElementById('app').style.display = '';
  pintarMenu(tela);
  const pagina = document.getElementById('pagina');
  const t = TELAS[tela];
  if (!t) { irPara('painel'); return; }
  // Digitar o endereço na mão não pula a trava: quem não vê a tela no menu
  // também não a abre pela URL.
  if (!podeVer(tela)) {
    cabecalho('Sem acesso', '');
    pagina.innerHTML = '<div class="cartao">' +
      vazio('🔒', 'Esta parte não é do seu acesso',
        'Seu acesso é "' + (PERFIS_APP[perfilAtual()] || {}).txt + '". Fale com a direção se precisar entrar aqui.') +
      '<div style="text-align:center"><a class="btn primario" href="#/painel">Voltar ao painel</a></div></div>';
    return;
  }
  t(pagina, args);
  // Agora sim a tela está mostrando os dados desta assinatura.
  if (S.assinaturaPendente) { S.assinatura = S.assinaturaPendente; S.assinaturaPendente = null; }
}

// Redesenha quando chegam dados novos — mas nunca por cima de quem está
// digitando (formulário aberto ou campo em foco perderiam o que foi escrito).
function renderSeSeguro() {
  // Tela pública (equipe preenchendo pedido) nunca é redesenhada por sincronização.
  if (PUBLICAS.includes(rotaAtual().tela)) return;
  if (document.querySelector('.fundo-modal')) { pintarMenuSeguro(); return; }
  const foco = document.activeElement;
  if (foco && foco.matches && foco.matches('input,textarea,select')) { pintarMenuSeguro(); return; }
  if (S.formAberto) { pintarMenuSeguro(); return; }
  render();
}
function pintarMenuSeguro() {
  if (document.getElementById('menu')) pintarMenu(rotaAtual().tela);
}

window.addEventListener('hashchange', () => {
  S.formAberto = false;
  render();
  window.scrollTo(0, 0);   // só na troca de tela, nunca no redesenho por sync
});
document.addEventListener('domo:dados', renderSeSeguro);
document.addEventListener('domo:status', pintarMenuSeguro);
document.addEventListener('domo:sempermissao', (e) => {
  const d = (e && e.detail) || {};
  const quais = (d.itens || []).map((x) => (x.codigo || x.colecao)).filter(Boolean).slice(0, 4).join(', ');
  toast('Não foi salvo: ' + (d.msg || 'seu acesso não permite') +
    (quais ? ' — ' + quais : '') + (d.qtd > 4 ? ' e mais ' + (d.qtd - 4) : ''), 'ruim');
  render();
});
document.addEventListener('domo:semsenha', () => {
  if (!AUTH.temCracha()) return;
  AUTH.esquecer();
  toast('Sua sessão venceu. Entre de novo.', 'ruim');
  render();
});

/* ── Entrada — login pela Central de Acessos (equipe-auth) ─────────────────── */
function telaEntrar() {
  const app = document.getElementById('app');
  app.dataset.shell = '';
  app.innerHTML =
    '<div class="publico"><div class="caixa" style="max-width:420px">' +
      '<div class="marca-topo"><strong style="font-size:22px;letter-spacing:.5px">IMPRESILK</strong><p>Compras e suprimentos</p></div>' +
      '<div class="cartao">' +
        '<h2>Entrar</h2>' +
        '<div class="campo"><label for="usuario">Usuário</label>' +
          '<input type="text" id="usuario" value="' + esc(localStorage.getItem(K.usuario) || '') + '" placeholder="seu usuário da equipe" autocomplete="username">' +
          '<div class="dica">O mesmo login da Central de Acessos. Sem acesso? Fale com a gestão.</div></div>' +
        '<div class="campo"><label for="senha">Senha</label>' +
          '<input type="password" id="senha" autocomplete="current-password"></div>' +
        '<button class="btn primario" id="btnEntrar" style="width:100%">Entrar</button>' +
        '<div id="erroEntrar" style="margin-top:10px"></div>' +
      '</div>' +
      '<div class="cartao">' +
        '<h3>Fornecedor?</h3>' +
        '<p class="legenda">Cotações e ordens de compra chegam por link direto — não precisa de login.</p>' +
      '</div>' +
    '</div></div>';

  // papel do crachá → perfil interno do motor (nomes herdados da Domo).
  const PAPEL_PERFIL = { admin: 'direcao', comprador: 'escritorio', solicitante: 'obra' };

  let entrando = false;
  const entrar = async () => {
    if (entrando) return;           // clique duplo não entra duas vezes
    const usuario = document.getElementById('usuario').value.trim();
    const senha = document.getElementById('senha').value;
    const erro = document.getElementById('erroEntrar');
    if (!usuario || !senha) { erro.innerHTML = '<div class="aviso ruim">Preencha usuário e senha.</div>'; return; }
    erro.innerHTML = '<div class="aviso info">Conferindo…</div>';
    entrando = true;
    document.getElementById('btnEntrar').disabled = true;
    try {
      const r = await AUTH.login(usuario, senha);
      S.quem = r.nome || usuario;
      S.usuarioId = r.usuario || usuario;
      S.acessoProprio = true;
      S.perfil = PAPEL_PERFIL[r.papel] || 'obra';
      localStorage.setItem(K.quem, S.quem);
      localStorage.setItem(K.perfil, S.perfil);
      localStorage.setItem(K.usuario, S.usuarioId);
      if (r.trocarSenha) setTimeout(() => toast('Sua senha é temporária. Troque em Configurações.', 'ruim'), 1200);
      await puxar();
      render();
    } catch (e) {
      erro.innerHTML = '<div class="aviso ruim">' + esc(e.message === 'Failed to fetch' ? 'Sem internet para conferir a senha.' : e.message) + '</div>';
      entrando = false;
      const b = document.getElementById('btnEntrar');
      if (b) b.disabled = false;
    }
  };
  document.getElementById('btnEntrar').addEventListener('click', entrar);
  app.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); }));
}

/* ── Painel inicial ────────────────────────────────────────────────────────── */
TELAS.painel = function (el) {
  const scs = lista('sc');
  const ocs = lista('oc');
  const cots = lista('cot');

  const novas = scs.filter((s) => s.situacao === 'nova');
  const emRota = ocs.filter((o) => SIT_ESPERANDO.includes(o.situacao));
  const atrasadas = emRota.filter((o) => o.entregaPrevista && diasAte(o.entregaPrevista) < 0);
  const vencendo = docsVencendo(30);

  const cotsAbertas = cots.filter((c) => c.situacao === 'aberta');
  const cotsProntas = cotsAbertas.filter((c) =>
    (c.fornecedores || []).length && (c.fornecedores || []).every((f) => f.respondidoEm));
  const cotsVencidas = cotsAbertas.filter((c) => c.prazoResposta && diasAte(c.prazoResposta) < 0);

  // Dinheiro do PERÍODO escolhido (antes era sempre "deste mês", sem dizer
  // qual e sem deixar olhar outro -- no dia 1º o painel zerava e parecia que a
  // empresa tinha parado de comprar).
  const per = periodoAtual();
  const doMes = ocs.filter((o) => !['cancelada', 'rascunho'].includes(o.situacao) && noPeriodo(o, per));
  const gastoMes = doMes.reduce((s, o) => s + (Number(o.totalLiquido) || 0), 0);
  const entregueMes = doMes.filter((o) => o.situacao === 'entregue')
    .reduce((s, o) => s + (Number(o.totalLiquido) || 0), 0);

  // Como estão as ordens do período, uma etiqueta por situação. Clicar leva
  // para a lista já filtrada -- o painel deixa de ser só leitura.
  const ORDEM_SIT = ['rascunho', 'emitida', 'enviada', 'confirmada', 'transito', 'parcial', 'entregue', 'cancelada'];
  const doPeriodoTodas = ocs.filter((o) => noPeriodo(o, per));
  const porSituacao = ORDEM_SIT
    .map((sit) => ({ sit, ocs: doPeriodoTodas.filter((o) => o.situacao === sit) }))
    .filter((x) => x.ocs.length);
  const aChegar = emRota.reduce((s, o) => s + (Number(o.totalLiquido) || 0), 0);

  // ── O que precisa de decisão HOJE ─────────────────────────────────────────
  const tarefas = [];
  const tarefa = (icone, texto, rota, urgente) => {
    if (podeVer(rota)) tarefas.push({ icone, texto, rota, urgente });
  };
  if (novas.length) tarefa('📋', novas.length + ' solicitação(ões) esperando você aprovar', 'solicitacoes',
    novas.some((s) => s.urgencia === 'critica'));
  // Solicitação aprovada que não tem cotação nem compra andando ficava
  // invisível: o painel só contava as "novas", e o pedido devolvido pelo
  // cancelamento de uma compra sumia da vista de todo mundo.
  const paradas = scs.filter((s) => s.situacao === 'aprovada' &&
    !(s.cotIds || []).some((id) => { const c = achar('cot', id); return c && !c.apagadoEm && c.situacao === 'aberta'; }) &&
    !(s.ocIds || []).some((id) => { const o = achar('oc', id); return o && !o.apagadoEm && o.situacao !== 'cancelada'; }));
  if (paradas.length) tarefa('⏸️', paradas.length + ' solicitação(ões) aprovada(s) sem cotação nem compra andando',
    'solicitacoes', paradas.some((s) => s.urgencia === 'critica'));
  if (cotsProntas.length) tarefa('💵', cotsProntas.length + ' cotação(ões) com todos os preços — falta decidir', 'cotacoes', true);
  if (cotsVencidas.length) tarefa('⏰', cotsVencidas.length + ' cotação(ões) passaram do prazo de resposta', 'cotacoes', true);
  if (atrasadas.length) tarefa('🚚', atrasadas.length + ' entrega(s) atrasada(s) — cobrar o fornecedor', 'recebimento', true);
  const docsVencidos = vencendo.filter((d) => diasAte(d.validadeEm) < 0);
  if (docsVencidos.length) tarefa('📘', docsVencidos.length + ' manual/documento vencido(s)', 'manuais', true);

  cabecalho('Painel', 'Visão geral das compras',
    seletorPeriodo() +
    '<button class="btn" data-acao="linkObra">🔗 Link da empresa</button>' +
    (podeVer('cotacoes') ? '<a class="btn primario" href="#/cotacoes">Pedir cotação</a>' : ''));

  el.innerHTML =
    // ── a caixa que o gestor abre de manhã ──
    '<div class="cartao" style="border-left:4px solid var(--azul)">' +
      '<h3>🎯 Para resolver hoje</h3>' +
      (tarefas.length
        ? '<div class="tarefas">' + tarefas.map((t) =>
            '<button class="tarefa' + (t.urgente ? ' urgente' : '') + '" data-ir="' + esc(t.rota) + '">' +
              '<span class="ic">' + t.icone + '</span><span>' + esc(t.texto) + '</span>' +
              '<span class="seta">›</span></button>').join('') + '</div>'
        : '<p class="legenda">Nada parado esperando decisão.</p>') +
    '</div>' +

    // ── como estão as compras do período ──
    (podeVer('compras') && porSituacao.length
      ? '<div class="cartao" style="margin-bottom:16px">' +
        '<h3>📊 Ordens de ' + esc(rotuloPeriodo()) + '</h3>' +
        '<div class="faixa-status">' +
        porSituacao.map((x) =>
          '<button class="chip-status" data-sit="' + esc(x.sit) + '">' +
            etiqueta(x.sit) +
            '<b>' + x.ocs.length + '</b>' +
            '<span>' + esc(fmt.brl(x.ocs.reduce((s, o) => s + (Number(o.totalLiquido) || 0), 0))) + '</span>' +
          '</button>').join('') +
        '</div></div>'
      : '') +

    // ── números ──
    // Quem é da empresa vê o movimento, não o dinheiro: o servidor nem manda os
    // valores para o aparelho dele, então aqui os cartões mudam de conteúdo.
    (podeVer('compras')
      ? '<div class="grade g3 compacto" style="margin-bottom:16px">' +
        indicador('Comprado em ' + rotuloPeriodo(), fmt.brl(gastoMes),
          doMes.length + ' ordem(ns) · ' + fmt.brl(entregueMes) + ' já entregue', '', 'compras') +
        indicador('A caminho', fmt.brl(aChegar),
          emRota.length + ' ordem(ns)' + (atrasadas.length ? ' · ' + atrasadas.length + ' atrasada(s)' : ' no prazo'),
          atrasadas.length ? 'alerta' : '', 'recebimento') +
        indicador('Solicitações abertas', String(lista('sc').filter((x) => x.situacao === 'nova').length),
          'esperando aprovação', '', 'solicitacoes') +
      '</div>'
      : '<div class="grade g3 compacto" style="margin-bottom:16px">' +
        indicador('Pedido em ' + rotuloPeriodo(), String(doMes.length), 'ordem(ns) de compra', '', '') +
        indicador('A caminho', String(emRota.length),
          atrasadas.length ? atrasadas.length + ' atrasada(s)' : 'no prazo',
          atrasadas.length ? 'alerta' : '', 'recebimento') +
        indicador('Minhas solicitações', String(lista('sc').filter((x) => x.situacao === 'nova').length), 'esperando aprovação', '', 'solicitacoes') +
      '</div>') +

    '<div class="grade g2">' +
      // ── chegando ──
      '<div class="cartao">' +
        '<h3>📦 Chegando</h3>' +
        (emRota.length ? emRota.slice(0, 6).map((o) => {
          const d = o.entregaPrevista ? diasAte(o.entregaPrevista) : null;
          const aviso = d == null ? '<span class="etiqueta">sem data</span>'
            : d < 0 ? '<span class="etiqueta et-vencido">' + (-d) + ' dia(s) de atraso</span>'
            : d === 0 ? '<span class="etiqueta et-vencendo">chega hoje</span>'
            : '<span class="etiqueta">em ' + d + ' dia(s)</span>';
          return '<div class="arquivo-solto clicavel" data-ir="' +
            (podeVer('compras') ? 'compras/' + esc(o.id) : 'recebimento') + '">' +
            '<span class="ic">🚚</span><div style="flex:1;min-width:0">' +
            '<div class="nome">' + esc(o.codigo || '—') +
              (podeVer('compras') ? ' · ' + fmt.brl(o.totalLiquido) : '') + '</div>' +
            '<div class="meta">' + esc((o.fornecedor || {}).nome || '—') + ' · ' +
              esc((o.itens || []).map((i) => i.descricao).join(', ').slice(0, 50)) + '</div></div>' +
            '<div class="acoes">' + aviso + '</div></div>';
        }).join('') : '<p class="legenda">Nada a caminho.</p>') +
      '</div>' +

    '</div>' +

    // ── cotações esperando fornecedor ──
    (cotsAbertas.length && podeVer('cotacoes') ? '<div class="cartao"><h3>💵 Cotações em aberto</h3>' +
      cotsAbertas.map((c) => {
        const fs = c.fornecedores || [];
        const faltam = fs.filter((f) => !f.respondidoEm);
        const d = c.prazoResposta ? diasAte(c.prazoResposta) : null;
        return '<div class="arquivo-solto clicavel" data-ir="cotacoes/' + esc(c.id) + '">' +
          '<span class="ic">' + (faltam.length ? '⏳' : '✅') + '</span><div style="flex:1;min-width:0">' +
          '<div class="nome">' + esc(c.codigo || '—') + ' · ' + (c.itens || []).length + ' item(ns)</div>' +
          '<div class="meta">' + (fs.length - faltam.length) + ' de ' + fs.length + ' responderam' +
            (faltam.length ? ' · falta ' + esc(faltam.map((f) => f.nome).join(', ')) : ' — pronta para decidir') + '</div></div>' +
          '<div class="acoes">' + (d == null ? '' : d < 0
            ? '<span class="etiqueta et-vencido">prazo venceu</span>'
            : '<span class="etiqueta">responder em ' + d + 'd</span>') + '</div></div>';
      }).join('') + '</div>' : '') +

    // ── documentos ──
    (vencendo.length ? '<div class="cartao"><h3>📘 Manuais e certidões que vencem</h3>' +
      '<table><tbody>' + vencendo.map((d) => {
        const dias = diasAte(d.validadeEm);
        return '<tr class="clicavel" data-ir="manuais"><td><b>' + esc(d.tipo) + '</b> ' + esc(d.nome || '') + '</td>' +
          '<td class="num">' + fmt.data(d.validadeEm) + '</td>' +
          '<td class="num"><span class="etiqueta ' + (dias < 0 ? 'et-vencido' : 'et-vencendo') + '">' +
          (dias < 0 ? 'vencido' : 'faltam ' + dias + ' dia(s)') + '</span></td></tr>';
      }).join('') + '</tbody></table></div>' : '');

  el.querySelectorAll('[data-ir]').forEach((n) => n.addEventListener('click', () => irPara(n.dataset.ir)));
  ligarSeletorPeriodo();
  // Clicar numa situação abre a lista de ordens JÁ FILTRADA por ela: o número
  // do painel e a lista passam a ser a mesma coisa vista de dois jeitos.
  el.querySelectorAll('[data-sit]').forEach((b) => b.addEventListener('click', () => {
    S.filtroOC = Object.assign({ busca: '' }, S.filtroOC, { situacao: b.dataset.sit });
    irPara('compras');
  }));
  document.querySelectorAll('[data-acao="linkObra"]').forEach((b) => b.addEventListener('click', mostrarLinkObra));
};

function indicador(rotulo, valor, pe, classe, ir) {
  return '<div class="indicador ' + (classe || '') + (ir ? ' clicavel' : '') + '"' + (ir ? ' data-ir="' + ir + '"' : '') + '>' +
    '<div class="rotulo">' + esc(rotulo) + '</div>' +
    '<div class="valor">' + esc(valor) + '</div>' +
    '<div class="pe">' + esc(pe || '') + '</div></div>';
}

function mostrarLinkObra() {
  const url = location.origin + location.pathname + '#/solicitar';
  abrirModal({
    titulo: 'Link para a equipe pedir material',
    corpo:
      '<p>Mande este link no grupo do WhatsApp da empresa. Quem abrir pede material <b>sem senha nenhuma</b> — o pedido cai direto em Solicitações.</p>' +
      '<div class="campo"><input type="text" id="linkObra" value="' + esc(url) + '" readonly></div>' +
      '<p class="legenda">Dica: peça pra salvarem na tela inicial do celular. Vira quase um aplicativo.</p>',
    acoes: [
      { texto: 'Copiar link', classe: 'primario', aoClicar: () => {
        const campo = document.getElementById('linkObra');
        if (!navigator.clipboard) { if (campo) campo.select(); toast('Selecione e copie à mão', 'ruim'); return; }
        navigator.clipboard.writeText(url)
          .then(() => toast('Link copiado', 'bom'))
          .catch(() => { if (campo) campo.select(); toast('Não consegui copiar — selecione e copie à mão', 'ruim'); });
      } },
      { texto: 'Mandar no WhatsApp', classe: 'zap', aoClicar: () => {
        window.open(linkWhats('', 'Pessoal, para pedir material da empresa usem este link: ' + url), '_blank');
      } },
      { texto: 'Fechar', aoClicar: () => fecharModal() }
    ]
  });
}

/* ── Acessos externos ──────────────────────────────────────────────────────────
   Tudo que dá para entregar a alguém de fora num lugar só. Ninguém precisa
   caçar link dentro de cada tela. Nenhum destes pede senha — cada um mostra
   apenas o que aquela pessoa precisa ver. */
/* ── Nossos dados para o fornecedor cadastrar ───────────────────────────────
   Fornecedor novo sempre pede a mesma coisa antes de faturar: razão social,
   CNPJ, inscrições, endereço e para onde mandar a nota. Isso ia e voltava por
   WhatsApp, digitado na mão toda vez — e CNPJ digitado na mão volta errado,
   nota sai com dado torto e o pagamento trava.

   O cartão sai pronto daqui, do mesmo cadastro que imprime a ordem de compra:
   um lugar só para manter certo. Campo em branco simplesmente não aparece —
   melhor faltar uma linha do que mandar "Inscrição municipal: —". */
function textoCadastroEmpresa() {
  const e = (S.cfg || {}).empresa || {};
  const linha = (rot, v) => (String(v || '').trim() ? rot + ': ' + String(v).trim() + '\n' : '');
  const cidade = String(e.cidade || '').trim();
  const cep = String(e.cep || '').trim();

  return 'DADOS PARA CADASTRO\n\n' +
    linha('Razão social', e.nome) +
    linha('CNPJ', e.cnpj ? fmt.cnpj(e.cnpj) : '') +
    linha('Inscrição estadual', e.ie) +
    linha('Inscrição municipal', e.im) +
    linha('Endereço', e.endereco) +
    // Cidade e CEP na mesma linha quando há as duas; sozinhas, cada uma na sua.
    // Concatenar sem olhar produzia "Cidade/UF: — CEP 39400-100" e o CEP repetido.
    (cidade ? linha('Cidade/UF', cidade + (cep ? ' — CEP ' + cep : '')) : linha('CEP', cep)) +
    linha('Telefone', e.telefone ? fmt.telefone(e.telefone) : '') +
    linha('E-mail', e.email) +
    linha('NF-e e boleto para', e.emailNfe) +
    '\nPedidos chegam por ordem de compra numerada, com os dados fiscais nela.';
}

// Quais campos estão faltando — dito na hora, não depois que o fornecedor
// responder "e a inscrição estadual?".
function faltamNoCadastro() {
  const e = (S.cfg || {}).empresa || {};
  return [
    ['Razão social', e.nome], ['CNPJ', e.cnpj], ['Inscrição estadual', e.ie],
    ['Endereço', e.endereco], ['Cidade/UF', e.cidade], ['E-mail para NF-e', e.emailNfe],
  ].filter(([, v]) => !String(v || '').trim()).map(([r]) => r);
}

/* `paraQuem` é opcional: com telefone, o botão do WhatsApp já vai direto para
   aquele fornecedor; sem, abre o WhatsApp para você escolher na agenda. */
function mandarNossosDados(paraQuem = {}) {
  const texto = textoCadastroEmpresa();
  const faltam = faltamNoCadastro();
  const tel = String(paraQuem.telefone || '').replace(/\D/g, '');
  const saudacao = 'Olá' + (paraQuem.contato ? ' ' + paraQuem.contato : '') + '! Seguem os dados da ' +
    (((S.cfg || {}).empresa || {}).nomeCurto || 'nossa empresa') + ' para o cadastro:\n\n';

  abrirModal({
    titulo: 'Nossos dados para cadastro',
    largo: true,
    corpo:
      (faltam.length
        ? '<div class="aviso atencao">Falta preencher: <b>' + esc(faltam.join(', ')) + '</b>. ' +
          'O fornecedor vai pedir esses campos — complete em Configurações antes de mandar.</div>'
        : '<div class="aviso bom">Cadastro completo — é só mandar.</div>') +
      '<p class="legenda">Isto é o que o fornecedor recebe:</p>' +
      '<textarea id="txtCadastro" rows="14" readonly ' +
        'style="width:100%;font-family:ui-monospace,monospace;font-size:.86rem">' +
        esc(texto) + '</textarea>',
    acoes: [
      { texto: 'Fechar', aoClicar: () => fecharModal() },
      { texto: 'Copiar', aoClicar: () => {
        const cx = document.getElementById('txtCadastro');
        if (!navigator.clipboard) { if (cx) { cx.removeAttribute('readonly'); cx.select(); } toast('Selecione e copie à mão', 'ruim'); return; }
        navigator.clipboard.writeText(texto)
          .then(() => toast('Dados copiados', 'bom'))
          .catch(() => toast('Não consegui copiar — selecione o texto à mão', 'ruim'));
      } },
      // O window.open fica DENTRO do clique: depois de um await o navegador não
      // reconhece mais o gesto e o bloqueador de pop-up engole a janela.
      { texto: 'Mandar no WhatsApp', classe: 'zap', aoClicar: () => {
        window.open(linkWhats(tel, saudacao + texto), '_blank');
      } }
    ]
  });
}

TELAS.acessos = function (el) {
  const base = location.origin + location.pathname;

  const linha = (icone, titulo, sub, url, tel, msg) =>
    '<div class="arquivo-solto"><span class="ic">' + icone + '</span>' +
    '<div style="flex:1;min-width:0">' +
      '<div class="nome">' + esc(titulo) + '</div>' +
      '<div class="meta">' + esc(sub) + '</div>' +
      '<input type="text" class="linkzin" value="' + esc(url) + '" readonly>' +
    '</div>' +
    '<div class="acoes">' +
      (tel ? '<button class="btn pequeno zap" data-zap="' + esc(tel) + '" data-msg="' + esc(msg || '') + '">WhatsApp</button>' : '') +
      '<button class="btn pequeno primario" data-copiar="' + esc(url) + '">Copiar</button>' +
    '</div></div>';

  const cotAbertas = lista('cot').filter((c) => c.situacao === 'aberta');
  const docsPublicos = lista('oc')
    .filter((o) => o.tokenPublico && !['rascunho', 'cancelada'].includes(o.situacao))
    .map((o) => ({ tipo: 'oc', r: o, quem: (o.fornecedor || {}).nome, tel: (o.fornecedor || {}).telefone }));

  cabecalho('Links para fornecedor e equipe', 'Endereços sem senha, para entregar a quem está fora do escritório', '');

  el.innerHTML =
    '<div class="aviso info">Nenhum destes links pede senha — e cada pessoa vê só o que é dela. ' +
    'Quem pede material não vê preço; quem responde cotação não vê o concorrente.</div>' +

    '<div class="cartao"><h3>🧾 Nossos dados para o fornecedor cadastrar</h3>' +
      '<p class="legenda">Razão social, CNPJ, inscrições e para onde mandar a nota — do mesmo cadastro que ' +
      'imprime a ordem de compra. Copie ou mande no WhatsApp em vez de digitar na mão.</p>' +
      '<div class="barra-acoes"><button class="btn primario" id="acNossosDados">📤 Abrir o cartão de cadastro</button></div>' +
    '</div>' +

    '<div class="cartao"><h3>🏭 Para a equipe (produção e instalação)</h3>' +
      linha('📋', 'Pedir material', 'Qualquer um da equipe abre e pede — vira solicitação numerada',
        base + '#/solicitar', '', 'Pessoal, para pedir material usem este link: ' + base + '#/solicitar') +
      linha('🔎', 'Andamento das compras', 'Mostra tudo que foi pedido e o que está a caminho',
        base + '#/acompanhar', '', 'Para acompanhar as compras: ' + base + '#/acompanhar') +
    '</div>' +

    '<div class="cartao"><h3>💵 Cotações em aberto</h3>' +
      (cotAbertas.length
        ? cotAbertas.map((c) => (c.fornecedores || []).map((f) =>
            linha(f.respondidoEm ? '✅' : '⏳', f.nome + ' — ' + (c.codigo || ''),
              (f.respondidoEm ? 'já respondeu' : 'aguardando preço') + ' · ' + (c.itens || []).length + ' item(ns)',
              base + '#/cotar/' + c.id + '/' + (f.token || ''), f.telefone,
              'Pedido de cotação ' + (c.codigo || '') + ' da ' + ((S.cfg.empresa || {}).nomeCurto || 'Impresilk') +
              '. Responda por aqui: ' + base + '#/cotar/' + c.id + '/' + (f.token || ''))).join('')).join('')
        : '<p class="legenda">Nenhuma cotação aberta.</p>') +
    '</div>' +

    '<div class="cartao"><h3>🧾 Documentos emitidos</h3>' +
      (docsPublicos.length
        ? docsPublicos.map((x) => linha('🧾',
            (x.r.codigo || '') + ' — ' + (x.quem || ''),
            'ordem de compra · ' + ((SITUACOES[x.r.situacao] || {}).txt || ''),
            base + '#/ver/' + x.tipo + '/' + x.r.id + '/' + x.r.tokenPublico, x.tel,
            'Ordem de compra ' + (x.r.codigo || '') +
            ': ' + base + '#/ver/' + x.tipo + '/' + x.r.id + '/' + x.r.tokenPublico)).join('')
        : '<p class="legenda">Nenhum documento emitido ainda.</p>') +
    '</div>';

  const bnd = document.getElementById('acNossosDados');
  if (bnd) bnd.addEventListener('click', () => mandarNossosDados());

  el.querySelectorAll('[data-copiar]').forEach((b) => b.addEventListener('click', () => {
    const url = b.dataset.copiar;
    if (!navigator.clipboard) { toast('Copie da caixa ao lado: ' + url, 'ruim'); return; }
    navigator.clipboard.writeText(url).then(() => toast('Link copiado', 'bom'))
      .catch(() => toast('Não consegui copiar — selecione e copie à mão', 'ruim'));
  }));
  el.querySelectorAll('[data-zap]').forEach((b) => b.addEventListener('click', () => {
    window.open(linkWhats(b.dataset.zap, b.dataset.msg), '_blank');
  }));
};

/* ── Configurações ─────────────────────────────────────────────────────────── */

/* ── Acessos da equipe (dentro de Configurações) ────────────────────────────
   As contas moram na CENTRAL DE ACESSOS (equipe-auth) — o mesmo login do Brief
   e do PCP. Daqui só se lista, cria e remove; senha nunca passa por este app.

   Era uma tela própria no menu. Virou cartão de Configurações porque é
   configuração, e porque o menu mostrava "Minha senha" para quem não é direção
   e abria a tela de gerenciar TODO MUNDO — que o servidor recusa. Agora quem
   não é direção abre Configurações e vê só o que é dele. */
/* Os dois desenhos de Configurações (direção e o resto) mostram os mesmos dois
   cartões de "minha senha" e "este aparelho" — então os ouvintes moram aqui, um
   lugar só. Duplicar isso é como um lado sai consertado e o outro não. */
function ligarSenhaEAparelho(el) {
  const bs = document.getElementById('trocarSenha');
  if (bs) bs.addEventListener('click', async () => {
    const atual = document.getElementById('senhaAtual').value;
    const a = document.getElementById('senhaNova').value;
    const b = document.getElementById('senhaNova2').value;
    if (!atual) { toast('Digite a senha atual', 'ruim'); return; }
    if (a.length < 6) { toast('Senha muito curta', 'ruim'); return; }
    if (a !== b) { toast('As duas senhas não são iguais', 'ruim'); return; }
    try {
      // A senha é da equipe-auth (Central de Acessos), não deste app.
      await AUTH.trocarMinhaSenha(atual, a);
      toast('Senha trocada', 'bom');
      ['senhaAtual', 'senhaNova', 'senhaNova2'].forEach((id) => { document.getElementById(id).value = ''; });
    } catch (e) { toast(e.message, 'ruim'); }
  });

  const bn = document.getElementById('salvarNome');
  if (bn) bn.addEventListener('click', () => {
    const n = document.getElementById('meuNome').value.trim();
    if (!n) return;
    S.quem = n; localStorage.setItem(K.quem, n); toast('Nome salvo', 'bom'); pintarMenu('config');
  });

  // Só apagava a chave da senha compartilhada, que nem é mais usada: o crachá
  // continuava no aparelho e a pessoa seguia dentro. Quem identifica é o crachá.
  const bx = document.getElementById('sair');
  if (bx) bx.addEventListener('click', async () => {
    if (S.fila.length && !await confirmar('Ainda tem ' + S.fila.length + ' item(ns) esperando envio. Sair mesmo assim?', { perigo: true })) return;
    AUTH.esquecer();
    localStorage.removeItem(K.senha);
    S.senhaHash = ''; S.acessoProprio = false; S.usuarioId = ''; S.perfil = 'obra';
    [K.perfil, K.usuario].forEach((k) => localStorage.removeItem(k));
    render();
  });
}

function cartaoAcessosEquipe() {
  return '<div class="cartao">' +
    '<h3>👥 Acessos da equipe</h3>' +
    '<p class="legenda">Contas do Compras na Central de Acessos. ' +
    'Papéis: <b>admin</b> aprova e configura · <b>comprador</b> cota e emite ordens · ' +
    '<b>solicitante</b> pede material e registra recebimento. A conta vale só para o Compras; ' +
    'Brief e PCP têm as suas na mesma Central.</p>' +
    '<div id="listaContas"><p class="legenda">Carregando contas…</p></div>' +
    '<div class="barra-acoes" style="margin-top:10px">' +
      '<button class="btn primario" id="novaConta">+ Criar acesso</button>' +
    '</div></div>';
}

function ligarAcessosEquipe() {
  const desenhar = async () => {
    const caixa = document.getElementById('listaContas');
    if (!caixa) return;
    try {
      const r = await AUTH.listarContas();
      const contas = r.contas || r.lista || [];
      caixa.innerHTML = contas.length
        ? '<div class="tabela-rolagem"><table><thead><tr><th>Usuário</th><th>Nome</th><th>Papel</th><th>Situação</th><th></th></tr></thead><tbody>' +
          contas.map((c) => '<tr><td>' + esc(c.usuario) + '</td><td>' + esc(c.nome || '—') + '</td>' +
            '<td>' + esc(c.papel || '—') + '</td>' +
            '<td>' + (c.ativo === false ? '<span class="etiqueta et-cancelada">desativado</span>' : '<span class="etiqueta et-entregue">ativo</span>') + '</td>' +
            '<td class="num"><button class="btn pequeno" data-remover="' + esc(c.usuario) + '">Remover</button></td></tr>').join('') +
          '</tbody></table></div>'
        : '<p class="legenda">Nenhuma conta ainda — crie a primeira.</p>';
      caixa.querySelectorAll('[data-remover]').forEach((b) => b.addEventListener('click', async () => {
        if (!await confirmar('Remover o acesso de "' + b.dataset.remover + '" ao Compras?', { perigo: true, ok: 'Remover' })) return;
        try { await AUTH.removerConta(b.dataset.remover); toast('Acesso removido', 'bom'); desenhar(); }
        catch (e) { toast(e.message, 'ruim'); }
      }));
    } catch (e) {
      caixa.innerHTML = '<div class="aviso ruim">' + esc(e.message || 'Sem permissão para listar') +
        '</div><p class="legenda">Só o papel <b>admin</b> (ou a Central do Léo) gerencia contas.</p>';
    }
  };
  desenhar();

  const bn = document.getElementById('novaConta');
  if (bn) bn.addEventListener('click', () => {
    abrirModal({
      titulo: 'Criar acesso ao Compras',
      corpo: '<div id="fConta">' +
        campo('Usuário (para entrar)', entrada('usuario', '')) +
        campo('Nome', entrada('nome', '')) +
        campo('Papel', seletor('papel', 'solicitante', [
          { v: 'admin', t: 'Admin — aprova e configura' },
          { v: 'comprador', t: 'Comprador — cota e emite ordens' },
          { v: 'solicitante', t: 'Solicitante — pede material' }])) +
        campo('Senha inicial (a pessoa troca no primeiro uso)', entrada('senha', '', { tipo: 'password' })) +
      '</div>',
      acoes: [
        { texto: 'Voltar', aoClicar: () => fecharModal() },
        { texto: 'Criar', classe: 'primario', aoClicar: async (fundo) => {
          const d = lerCampos(fundo.querySelector('#fConta'));
          if (!d.usuario || !d.senha) { toast('Preencha usuário e senha', 'ruim'); return; }
          try {
            await AUTH.salvarConta({ usuario: d.usuario, nome: d.nome, papel: d.papel, senha: d.senha });
            fecharEste(fundo); toast('Acesso criado', 'bom'); desenhar();
          } catch (e) { toast(e.message, 'ruim'); }
        } }
      ]
    });
  });
}

TELAS.config = function (el) {
  const cfg = S.cfg || {};
  const emp = cfg.empresa || {};
  const ass = cfg.assinaturas || {};
  // Quem não é direção abre esta tela só para trocar a própria senha e ajustar
  // o nome do aparelho — o resto é dela e o servidor recusaria de qualquer jeito.
  const manda = ehDirecao();
  cabecalho('Configurações',
    manda ? 'Empresa, destinos, acessos e backup' : 'Sua senha e este aparelho', '');
  S.formAberto = true;

  if (!manda) {
    el.innerHTML =
      '<div class="cartao">' +
        '<h3>🔒 Minha senha</h3>' +
        '<p class="legenda">Vale só para a sua conta, na Central de Acessos. ' +
        'Quem cria e remove acesso das outras pessoas é a direção.</p>' +
        '<div class="campo"><label>Senha atual</label><input type="password" id="senhaAtual"></div>' +
        '<div class="campo"><label>Senha nova</label><input type="password" id="senhaNova" placeholder="mínimo 6 letras/números"></div>' +
        '<div class="campo"><label>Repita a senha nova</label><input type="password" id="senhaNova2"></div>' +
        '<button class="btn primario" id="trocarSenha">Trocar minha senha</button>' +
      '</div>' +
      '<div class="cartao">' +
        '<h3>👤 Este aparelho</h3>' +
        '<div class="linha"><div class="campo"><label>Seu nome</label>' +
          '<input type="text" id="meuNome" value="' + esc(S.quem) + '"></div></div>' +
        '<div class="barra-acoes"><button class="btn" id="salvarNome">Salvar nome</button>' +
        '<button class="btn perigo" id="sair">Sair do painel neste aparelho</button></div>' +
      '</div>';
    ligarSenhaEAparelho(el);
    return;
  }

  el.innerHTML =
    '<div class="cartao" id="cEmpresa">' +
      '<h3>🏢 Dados da empresa</h3>' +
      '<p class="legenda">Vão no cabeçalho da ordem de compra e no cartão que você manda para o fornecedor te cadastrar.</p>' +
      '<div class="linha">' +
        campo('Razão social', entrada('empresa.nome', emp.nome)) +
        campo('Nome curto', entrada('empresa.nomeCurto', emp.nomeCurto)) +
      '</div>' +
      '<div class="linha">' +
        campo('CNPJ', entrada('empresa.cnpj', emp.cnpj, { inputmode: 'numeric' })) +
        campo('Inscrição estadual', entrada('empresa.ie', emp.ie),
          'Escreva ISENTO se for o caso — em branco o fornecedor liga para perguntar') +
        campo('Inscrição municipal', entrada('empresa.im', emp.im)) +
      '</div>' +
      '<div class="linha">' +
        campo('Endereço', entrada('empresa.endereco', emp.endereco, { placeholder: 'Rua, número, bairro' })) +
        campo('Cidade / UF', entrada('empresa.cidade', emp.cidade, { placeholder: 'Montes Claros/MG' })) +
        campo('CEP', entrada('empresa.cep', emp.cep, { inputmode: 'numeric' })) +
      '</div>' +
      '<div class="linha">' +
        campo('Telefone', entrada('empresa.telefone', emp.telefone, { tipo: 'tel' })) +
        campo('E-mail', entrada('empresa.email', emp.email, { tipo: 'email' })) +
        campo('E-mail para NF-e e boleto', entrada('empresa.emailNfe', emp.emailNfe, { tipo: 'email' }),
          'Para onde o fornecedor manda nota e cobrança') +
      '</div>' +
      '<h3 style="margin-top:16px">✍️ Assinaturas dos documentos</h3>' +
      '<p class="legenda">Quem assina a ordem de compra que vai para o fornecedor.</p>' +
      '<div class="linha">' +
        campo('Quem aprova a compra', entrada('assinaturas.diretor.nome', (ass.diretor || {}).nome)) +
        campo('Cargo', entrada('assinaturas.diretor.crea', (ass.diretor || {}).crea)) +
      '</div>' +
      '<div class="linha">' +
        campo('Responsável de compras', entrada('assinaturas.engenheiro.nome', (ass.engenheiro || {}).nome)) +
        campo('Cargo', entrada('assinaturas.engenheiro.crea', (ass.engenheiro || {}).crea)) +
      '</div>' +
      '<div class="barra-acoes">' +
        '<button class="btn primario" id="salvarEmpresa">Salvar</button>' +
        '<button class="btn" id="mandarDados">📤 Mandar nossos dados para um fornecedor</button>' +
      '</div>' +
    '</div>' +

    '<div class="cartao">' +
      '<h3>🏭 Destinos do material</h3>' +
      '<p class="legenda">Para onde o material vai: produção, estoque ou instalação em cliente. Toda solicitação e compra pertence a um destino.</p>' +
      '<table><thead><tr><th>Destino</th><th>Endereço</th><th></th></tr></thead><tbody>' +
      (cfg.obras || []).map((o, i) =>
        '<tr><td><b>' + esc(o.nome) + '</b>' + (o.ativa === false ? ' <span class="etiqueta">desativado</span>' : '') + '</td>' +
        '<td>' + esc(o.endereco || '—') + '</td>' +
        '<td class="num"><button class="btn pequeno" data-obra="' + i + '">Editar</button></td></tr>').join('') +
      '</tbody></table>' +
      '<div class="barra-acoes" style="margin-top:10px"><button class="btn" id="novoDestino">+ Novo destino</button></div>' +
    '</div>' +

    '<div class="grade g2">' +
      // Não existe mais senha compartilhada: cada pessoa entra com a conta dela
      // na Central de Acessos. Este cartão troca a SUA senha, pela equipe-auth.
      '<div class="cartao">' +
        '<h3>🔒 Minha senha</h3>' +
        '<p class="legenda">Vale só para a sua conta. Quem cria e remove acesso das outras pessoas é a ' +
        'direção, no cartão "Acessos da equipe"; quem tem o link da empresa não precisa de senha nenhuma.</p>' +
        '<div class="campo"><label>Senha atual</label><input type="password" id="senhaAtual"></div>' +
        '<div class="campo"><label>Senha nova</label><input type="password" id="senhaNova" placeholder="mínimo 6 letras/números"></div>' +
        '<div class="campo"><label>Repita a senha nova</label><input type="password" id="senhaNova2"></div>' +
        '<button class="btn primario" id="trocarSenha">Trocar minha senha</button>' +
      '</div>' +
      cartaoAcessosEquipe() +
      '<div class="cartao">' +
        '<h3>💾 Backup</h3>' +
        '<p class="legenda">Uma cópia de tudo é guardada sozinha todo dia no servidor (60 dias de histórico). Aqui você baixa uma cópia para o seu computador.</p>' +
        '<div class="barra-acoes">' +
          '<button class="btn" id="baixarBackup">Baixar backup agora</button>' +
          '<button class="btn" id="verLog">Ver histórico de acessos</button>' +
        '</div>' +
        '<div id="usoArq" class="legenda" style="margin-top:10px"></div>' +
      '</div>' +
    '</div>' +

    '<div class="cartao">' +
      '<h3>🔗 Links públicos</h3>' +
      '<p class="legenda">Não pedem senha. Podem ser mandados para qualquer pessoa.</p>' +
      '<div class="arquivo-solto"><span class="ic">📋</span><div><div class="nome">Pedir material (equipe)</div>' +
        '<div class="meta">' + esc(location.origin + location.pathname) + '#/solicitar</div></div>' +
        '<div class="acoes"><button class="btn pequeno" data-copiar="#/solicitar">Copiar</button></div></div>' +
      '<div class="arquivo-solto"><span class="ic">🔎</span><div><div class="nome">Andamento das compras (só o nome)</div>' +
        '<div class="meta">' + esc(location.origin + location.pathname) + '#/acompanhar</div></div>' +
        '<div class="acoes"><button class="btn pequeno" data-copiar="#/acompanhar">Copiar</button></div></div>' +
    '</div>' +

    '<div class="cartao">' +
      '<h3>🗑️ Lixeira</h3>' +
      '<p class="legenda">O que é apagado fica aqui por 90 dias antes de sumir de vez.</p>' +
      '<div id="lixeira"></div>' +
      '<div class="barra-acoes" style="margin-top:10px">' +
        '<button class="btn perigo" id="esvaziar">Esvaziar lixeira agora</button>' +
        '<button class="btn" id="renumerar">Recomeçar a numeração…</button>' +
      '</div>' +
    '</div>' +

    '<div class="cartao">' +
      '<h3>👤 Este aparelho</h3>' +
      '<div class="linha"><div class="campo"><label>Seu nome</label>' +
        '<input type="text" id="meuNome" value="' + esc(S.quem) + '"></div></div>' +
      '<div class="barra-acoes"><button class="btn" id="salvarNome">Salvar nome</button>' +
      '<button class="btn perigo" id="sair">Sair do painel neste aparelho</button></div>' +
    '</div>';

  // Empresa
  document.getElementById('mandarDados').addEventListener('click', () => mandarNossosDados());
  document.getElementById('salvarEmpresa').addEventListener('click', async () => {
    const dados = lerCampos(document.getElementById('cEmpresa'));
    const novo = Object.assign({}, S.cfg, dados);
    novo.assinaturas = Object.assign({}, S.cfg.assinaturas, dados.assinaturas);
    try {
      const r = await api('salvarCfg', { cfg: novo });
      S.cfg = r.cfg; gravarCache(); toast('Dados salvos', 'bom');
    } catch (e) { toast(e.message, 'ruim'); }
  });

  // Obras
  el.querySelectorAll('[data-obra]').forEach((b) => b.addEventListener('click', () => editarObra(Number(b.dataset.obra))));
  document.getElementById('novoDestino').addEventListener('click', () => editarObra(-1));

  ligarSenhaEAparelho(el);
  ligarAcessosEquipe();

  // Backup / log
  document.getElementById('baixarBackup').addEventListener('click', async () => {
    toast('Montando o backup…');
    try {
      const r = await api('backup');
      baixarTexto('backup-compras-' + hojeISO() + '.json', JSON.stringify(r, null, 2));
      toast('Backup baixado', 'bom');
    } catch (e) { toast(e.message, 'ruim'); }
  });
  document.getElementById('verLog').addEventListener('click', async () => {
    try {
      const r = await api('log', { limite: 150 });
      abrirModal({
        titulo: 'Histórico de acessos e alterações',
        largo: true,
        corpo: '<table><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th></tr></thead><tbody>' +
          (r.linhas || []).map((l) => '<tr><td>' + fmt.dataHora(l.em) + '</td><td>' + esc(l.por || '—') + '</td>' +
            '<td>' + esc(l.acao || '') + ' ' + esc(l.codigo || l.obra || '') + '</td></tr>').join('') +
          '</tbody></table>',
        acoes: [{ texto: 'Fechar', aoClicar: () => fecharModal() }]
      });
    } catch (e) { toast(e.message, 'ruim'); }
  });
  apiArq('uso').then((r) => {
    const d = document.getElementById('usoArq');
    if (d) d.textContent = 'Arquivos guardados: ' + r.arquivos + ' (' + fmt.tamanho(r.bytes) + ').';
  }).catch(() => {});

  // Links
  el.querySelectorAll('[data-copiar]').forEach((b) => b.addEventListener('click', () => {
    const url = location.origin + location.pathname + b.dataset.copiar;
    if (!navigator.clipboard) { toast('Copie da barra de endereço: ' + url, 'ruim'); return; }
    navigator.clipboard.writeText(url)
      .then(() => toast('Copiado', 'bom'))
      .catch(() => toast('Não consegui copiar. O link é: ' + url, 'ruim'));
  }));

  document.getElementById('esvaziar').addEventListener('click', async () => {
    if (!await confirmar('Apagar DE VEZ tudo que está na lixeira? Isso não tem volta.', { perigo: true, ok: 'Apagar de vez' })) return;
    try {
      const r = await api('esvaziarLixeira');
      await puxar(); render();
      toast(r.apagados + ' registro(s) apagado(s) de vez', 'bom');
    } catch (e) { toast(e.message, 'ruim'); }
  });

  document.getElementById('renumerar').addEventListener('click', () => {
    abrirModal({
      titulo: 'Recomeçar a numeração',
      corpo:
        '<p>Use na virada de ano ou depois de limpar testes. O próximo documento criado vai receber o número que você escolher.</p>' +
        '<div class="aviso atencao">Se já existir um documento com esse número, vai haver <b>número repetido</b>. ' +
        'Confira antes.</div>' +
        '<div id="fNum"><div class="linha">' +
          campo('Documento', seletor('colecao', 'sc', [
            { v: 'sc', t: 'Solicitações (SC)' }, { v: 'oc', t: 'Ordens de compra (OC)' }, { v: 'cot', t: 'Cotações (CT)' }])) +
          campo('Próximo número', entrada('proximo', '1', { inputmode: 'numeric' })) +
        '</div></div>',
      acoes: [
        { texto: 'Voltar', aoClicar: () => fecharModal() },
        { texto: 'Recomeçar', classe: 'perigo', aoClicar: async (fundo) => {
          const d = lerCampos(fundo.querySelector('#fNum'));
          try {
            const r = await api('reiniciarNumeracao', {
              colecao: d.colecao, proximo: Math.max(1, Math.round(numeroBR(d.proximo)) || 1)
            });
            fecharEste(fundo);
            toast('Próximo número: ' + r.proximo, 'bom');
          } catch (e) { toast(e.message, 'ruim'); }
        } }
      ]
    });
  });

  pintarLixeira();
};

function editarObra(i) {
  const obras = (S.cfg.obras || []).slice();
  const o = i >= 0 ? obras[i] : { id: 'obra' + Date.now().toString(36).slice(-4), nome: '', endereco: '', ativa: true };
  abrirModal({
    titulo: i >= 0 ? 'Editar destino' : 'Novo destino',
    corpo: '<div id="fObra">' +
      campo('Nome do destino', entrada('nome', o.nome, { placeholder: 'Ex.: Fábrica / produção' })) +
      campo('Endereço', entrada('endereco', o.endereco)) +
      campo('Situação', seletor('ativa', o.ativa === false ? 'nao' : 'sim', [{ v: 'sim', t: 'Ativo' }, { v: 'nao', t: 'Desativado' }])) +
      '</div>',
    acoes: [
      { texto: 'Voltar', aoClicar: () => fecharModal() },
      { texto: 'Salvar', classe: 'primario', aoClicar: async (fundo) => {
        const d = lerCampos(fundo.querySelector('#fObra'));
        if (!d.nome.trim()) { toast('Dê um nome ao destino', 'ruim'); return; }
        const nova = { id: o.id, nome: d.nome.trim(), endereco: d.endereco.trim(), ativa: d.ativa === 'sim' };
        if (i >= 0) obras[i] = nova; else obras.push(nova);
        try {
          const r = await api('salvarCfg', { cfg: Object.assign({}, S.cfg, { obras }) });
          S.cfg = r.cfg; gravarCache(); fecharModal(); render(); toast('Destino salvo', 'bom');
        } catch (e) { toast(e.message, 'ruim'); }
      } }
    ]
  });
}

function pintarLixeira() {
  const alvo = document.getElementById('lixeira');
  if (!alvo) return;
  const cols = { sc: 'Solicitação', oc: 'Ordem de compra', cot: 'Cotação', forn: 'Fornecedor',
    doc: 'Manual', proj: 'Catálogo', trein: 'Treinamento' };
  const itens = [];
  for (const c of Object.keys(cols)) {
    for (const r of (S.reg[c] || [])) if (r.apagadoEm) itens.push({ c, r });
  }
  if (!itens.length) { alvo.innerHTML = '<p class="legenda">Vazia.</p>'; return; }
  alvo.innerHTML = '<table><tbody>' + itens.map(({ c, r }) =>
    '<tr><td>' + esc(cols[c]) + '</td><td><b>' + esc(r.codigo || r.nome || r.id) + '</b></td>' +
    '<td>apagado ' + fmt.quando(r.apagadoEm) + ' por ' + esc(r.apagadoPor || '—') + '</td>' +
    '<td class="num"><button class="btn pequeno" data-restaurar="' + esc(c) + '|' + esc(r.id) + '">Restaurar</button></td></tr>'
  ).join('') + '</tbody></table>';
  alvo.querySelectorAll('[data-restaurar]').forEach((b) => b.addEventListener('click', async () => {
    const [c, id] = b.dataset.restaurar.split('|');
    try {
      await api('restaurarItem', { colecao: c, id });
      await puxar();
      pintarLixeira();          // a tela de Configurações não se redesenha sozinha
      toast('Restaurado', 'bom');
    } catch (e) { toast(e.message, 'ruim'); }
  }));
}

/* ── Telas públicas ────────────────────────────────────────────────────────── */
function molduraPublica(conteudo, sub) {
  document.getElementById('app').dataset.shell = '';
  document.getElementById('app').innerHTML =
    '<div class="publico"><div class="caixa">' +
      '<div class="marca-topo"><strong style="font-size:22px">IMPRESILK</strong>' +
      '<p>' + esc(sub || '') + '</p></div>' + conteudo + '</div></div>';
}

function renderPublico(tela, args) {
  if (tela === 'solicitar') return telaSolicitar();
  if (tela === 'acompanhar') return telaAcompanhar();
  if (tela === 'ver') return telaVerPublico(args);
  if (tela === 'cotar') return telaCotarPublico(args);
}

let _cfgPub = null;
async function cfgPublico() {
  if (_cfgPub) return _cfgPub;
  _cfgPub = await api('cfgPublico', {}, { publico: true });
  return _cfgPub;
}

async function telaSolicitar() {
  molduraPublica('<div class="cartao"><p class="legenda">Carregando…</p></div>', 'Solicitação de material');
  let cfg;
  try { cfg = await cfgPublico(); }
  catch { molduraPublica('<div class="cartao"><div class="aviso ruim">Sem internet. Tente de novo quando o sinal voltar.</div></div>', ''); return; }
  if (!cfg.obras || !cfg.obras.length) {
    molduraPublica('<div class="cartao"><div class="aviso atencao">Nenhum destino ativo no momento. ' +
      'Fale com o time de compras da Impresilk.</div></div>', 'Solicitação de material');
    return;
  }

  const lembrado = JSON.parse(localStorage.getItem('compras_solicitante') || '{}');
  const linhaItem = (i) =>
    '<div class="item-linha" data-item>' +
      '<div class="campo descricao"><label>Material</label><input type="text" data-i="descricao" placeholder="Ex.: Vinil branco brilho 1,00m"></div>' +
      '<div class="campo"><label>Unid.</label>' + seletorSimples('unid', cfg.unidades, 'un') + '</div>' +
      '<div class="campo"><label>Quantidade</label><input type="text" data-i="qtd" inputmode="decimal" placeholder="0"></div>' +
      '<button class="lixeira" data-tirar title="Tirar">✕</button>' +
    '</div>';

  molduraPublica(
    '<div class="cartao">' +
      '<h2>Pedir material</h2>' +
      '<p class="legenda">Preencha e envie. O setor de compras recebe na hora e você acompanha pelo número do pedido.</p>' +
      '<div class="linha">' +
        campo('Seu nome', '<input type="text" id="pNome" value="' + esc(lembrado.nome || '') + '" placeholder="Nome de quem está pedindo">') +
        campo('Seu WhatsApp', '<input type="tel" id="pTel" value="' + esc(lembrado.telefone || '') + '" inputmode="tel" placeholder="(38) 9 9999-9999">') +
      '</div>' +
      '<div class="linha">' +
        campo('Sua função', '<input type="text" id="pFuncao" value="' + esc(lembrado.funcao || '') + '" placeholder="Ex.: Encarregado">') +
        campo('Destino', '<select id="pObra">' + cfg.obras.map((o) => '<option value="' + esc(o.id) + '">' + esc(o.nome) + '</option>').join('') + '</select>') +
      '</div>' +
      '<div class="linha">' +
        campo('Setor', '<select id="pSetor">' + cfg.setores.map((s) => '<option>' + esc(s) + '</option>').join('') + '</select>') +
        campo('Precisa até', '<input type="date" id="pData" value="' + esc(hojeISO()) + '">') +
      '</div>' +
      campo('Urgência',
        '<div class="opcoes" id="pUrg">' +
          '<label class="opcao marcada"><input type="radio" name="urg" value="normal" checked>Normal</label>' +
          '<label class="opcao"><input type="radio" name="urg" value="urgente">Urgente</label>' +
          '<label class="opcao"><input type="radio" name="urg" value="critica">Parou a produção</label>' +
        '</div>') +
      '<h3 style="margin-top:18px">O que você precisa</h3>' +
      '<div id="pItens">' + linhaItem() + linhaItem() + '</div>' +
      '<button class="btn" id="pMais">+ Adicionar item</button>' +
      campo('Para quê / observação', '<textarea id="pObs" placeholder="Ex.: para a fachada da O.S. 4821 — instalar sexta"></textarea>') +
      '<div class="barra-acoes" style="margin-top:10px"><button class="btn primario" id="pEnviar" style="width:100%">Enviar solicitação</button></div>' +
      '<div id="pErro" style="margin-top:10px"></div>' +
    '</div>' +
    '<div style="text-align:center"><a class="btn fantasma" href="#/acompanhar">Ver o andamento das compras</a></div>',
    'Solicitação de material');

  const itens = document.getElementById('pItens');
  const ligarLinha = (linha) => linha.querySelector('[data-tirar]').addEventListener('click', () => {
    if (itens.children.length > 1) linha.remove();
  });
  Array.from(itens.children).forEach(ligarLinha);
  document.getElementById('pMais').addEventListener('click', () => {
    itens.insertAdjacentHTML('beforeend', linhaItem());
    ligarLinha(itens.lastElementChild);
    itens.lastElementChild.querySelector('input').focus();
  });
  document.getElementById('pUrg').addEventListener('change', (e) => {
    document.querySelectorAll('#pUrg .opcao').forEach((o) => o.classList.toggle('marcada', o.contains(e.target)));
  });

  document.getElementById('pEnviar').addEventListener('click', async () => {
    const erro = document.getElementById('pErro');
    const nome = document.getElementById('pNome').value.trim();
    const tel = document.getElementById('pTel').value.trim();
    if (!nome || tel.replace(/\D/g, '').length < 10) {
      erro.innerHTML = '<div class="aviso ruim">Escreva seu nome e um WhatsApp com DDD — é por ele que a gente te responde.</div>';
      return;
    }
    const linhas = Array.from(itens.querySelectorAll('[data-item]')).map((l) => ({
      descricao: l.querySelector('[data-i=descricao]').value.trim(),
      unid: l.querySelector('[data-i=unid]').value,
      qtd: numeroBR(l.querySelector('[data-i=qtd]').value)
    })).filter((x) => x.descricao);
    if (!linhas.length) { erro.innerHTML = '<div class="aviso ruim">Escreva pelo menos um material.</div>'; return; }

    const obraSel = document.getElementById('pObra');
    const opcaoObra = obraSel.options[obraSel.selectedIndex];
    if (!opcaoObra) {
      erro.innerHTML = '<div class="aviso ruim">Nenhum destino ativo no momento. Fale com o escritório.</div>';
      return;
    }
    const registro = {
      obraId: obraSel.value,
      obra: opcaoObra.text,
      solicitante: { nome, telefone: tel, funcao: document.getElementById('pFuncao').value.trim() },
      setor: document.getElementById('pSetor').value,
      necessidadeEm: document.getElementById('pData').value,
      urgencia: (document.querySelector('input[name=urg]:checked') || {}).value || 'normal',
      justificativa: document.getElementById('pObs').value.trim(),
      itens: linhas
    };
    localStorage.setItem('compras_solicitante', JSON.stringify(registro.solicitante));

    erro.innerHTML = '<div class="aviso info">Enviando…</div>';
    try {
      const r = await api('novaSolicitacao', { registro }, { publico: true });
      molduraPublica(
        '<div class="cartao" style="text-align:center">' +
          '<div style="font-size:3rem">✅</div>' +
          '<h2>Pedido enviado</h2>' +
          '<p>Seu número é <b style="font-size:1.4rem;color:var(--azul)">' + esc(r.codigo) + '</b></p>' +
          '<p class="legenda">O setor de compras já recebeu. Para ver o andamento é só abrir o mesmo link e escrever seu nome.</p>' +
          '<div class="barra-acoes" style="justify-content:center">' +
            '<a class="btn primario" href="#/acompanhar">Ver o andamento</a>' +
            '<button class="btn" onclick="location.reload()">Fazer outro pedido</button>' +
          '</div>' +
        '</div>', 'Solicitação registrada');
    } catch (e) {
      erro.innerHTML = '<div class="aviso ruim">' + esc(e.message === 'Failed to fetch' ? 'Sem internet. Tente de novo em instantes.' : e.message) + '</div>';
    }
  });
}

const seletorSimples = (nome, opcoes, padrao) =>
  '<select data-i="' + nome + '">' + opcoes.map((o) =>
    '<option' + (o === padrao ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';

// Quadro de andamento das compras. Abre JÁ com tudo na tela — quem está na
// quer ver, não preencher formulário. O nome é opcional e serve só para separar
// "meus pedidos" do resto. Sem preço e sem valor de ordem: isso é informação
// comercial e o link circula no grupo do WhatsApp.
async function telaAcompanhar() {
  const lembrado = JSON.parse(localStorage.getItem('compras_solicitante') || '{}');

  molduraPublica(
    '<div id="aSaida"><div class="cartao"><div class="aviso info">Carregando o andamento…</div></div></div>' +
    '<div class="cartao">' +
      '<div class="linha" style="align-items:flex-end">' +
        campo('Destacar os pedidos de (opcional)',
          '<input type="text" id="aNome" value="' + esc(lembrado.nome || '') + '" placeholder="Seu nome" autocomplete="name">') +
        '<div style="flex:0 0 auto"><button class="btn" id="aAtualizar">Atualizar</button></div>' +
      '</div>' +
    '</div>' +
    '<div style="text-align:center"><a class="btn primario" href="#/solicitar">Fazer um novo pedido</a></div>',
    'Andamento das compras');

  let pedidos = [];
  let emQuando = '';

  const pintar = () => {
    const saida = document.getElementById('aSaida');
    if (!saida) return;
    const nome = (document.getElementById('aNome') || {}).value || '';
    if (!pedidos.length) {
      saida.innerHTML = '<div class="cartao">' + vazio('📋', 'Nada pedido ainda',
        'Assim que alguém pedir material, aparece aqui.') + '</div>';
      return;
    }
    const meus = nome.trim().length >= 3 ? pedidos.filter((p) => mesmaPessoa(p.quem, nome)) : [];
    const outros = pedidos.filter((p) => !meus.includes(p));
    saida.innerHTML =
      (meus.length ? '<div class="cartao"><h3>Meus pedidos</h3>' + meus.map(cartaoPedido).join('') + '</div>' : '') +
      '<div class="cartao"><h3>' + (meus.length ? 'Outros pedidos da empresa' : 'Pedidos da empresa') +
        ' <span class="etiqueta">' + outros.length + '</span></h3>' +
        (outros.length ? outros.map(cartaoPedido).join('') : '<p class="legenda">Nenhum outro pedido.</p>') + '</div>' +
      '<p class="legenda" style="text-align:center">Atualizado ' + esc(emQuando) + '.</p>';
  };

  const carregar = async () => {
    try {
      const r = await api('andamento', { nome: (document.getElementById('aNome') || {}).value || '' }, { publico: true });
      pedidos = r.pedidos || [];
      emQuando = fmt.quando(r.em);
      pintar();
    } catch (e) {
      const saida = document.getElementById('aSaida');
      if (saida) saida.innerHTML = '<div class="cartao"><div class="aviso ruim">' +
        esc(e.message === 'Failed to fetch' ? 'Sem internet. Tente de novo quando o sinal voltar.' : e.message) +
        '</div></div>';
    }
  };

  document.getElementById('aAtualizar').addEventListener('click', carregar);
  // Digitar o nome só reorganiza a tela; não precisa ir ao servidor de novo.
  document.getElementById('aNome').addEventListener('input', () => {
    const n = document.getElementById('aNome').value.trim();
    localStorage.setItem('compras_solicitante', JSON.stringify(Object.assign({}, lembrado, { nome: n })));
    pintar();
  });

  carregar();
}

// "chico" e "Chico Encarregado" são a mesma pessoa para efeito de destaque.
function mesmaPessoa(a, b) {
  const limpa = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const A = limpa(a), B = limpa(b);
  return !!A && !!B && (A === B || A.startsWith(B) || B.startsWith(A));
}

// Um pedido no quadro: o que foi pedido, em que pé está e quando chega.
function cartaoPedido(p) {
  const compras = p.compras || [];
  const chegando = compras.filter((c) => !['cancelada'].includes(c.situacao));
  const proxima = chegando.map((c) => c.entregaPrevista).filter(Boolean).sort()[0];
  const dias = proxima ? diasAte(proxima) : null;

  const previsao = !chegando.length ? ''
    : dias == null ? '<span class="etiqueta">sem data de entrega</span>'
    : dias < 0 ? '<span class="etiqueta et-vencido">' + (-dias) + ' dia(s) de atraso</span>'
    : dias === 0 ? '<span class="etiqueta et-vencendo">chega hoje</span>'
    : '<span class="etiqueta">chega em ' + dias + ' dia(s)</span>';

  return '<div class="arquivo-solto" style="align-items:flex-start">' +
    '<span class="ic">' + (p.situacao === 'atendida' ? '✅' : p.situacao === 'recusada' ? '⛔' : '📦') + '</span>' +
    '<div style="flex:1;min-width:0">' +
      '<div class="nome">' + esc(p.codigo || '—') + ' · ' + esc(p.quem) +
        ' ' + etiqueta(p.situacao) + ' ' + etiquetaUrgencia(p.urgencia) + '</div>' +
      '<div class="meta">' + esc(p.obra || '') + (p.setor ? ' · ' + esc(p.setor) : '') +
        ' · pedido ' + fmt.quando(p.criadoEm) + '</div>' +
      '<div class="meta">' + (p.itens || []).map((i) =>
        esc(i.descricao) + ' (' + fmt.numero(i.qtd) + ' ' + esc(i.unid || '') + ')').join(' · ') + '</div>' +
      (p.motivoRecusa ? '<div class="meta" style="color:var(--vermelho)">Recusado: ' + esc(p.motivoRecusa) + '</div>' : '') +
      (chegando.length
        ? '<div class="meta" style="margin-top:4px">' + chegando.map((c) =>
            '🧾 ' + esc(c.codigo || '') + ' — ' + esc((SITUACOES[c.situacao] || {}).txt || c.situacao) +
            (c.fornecedor ? ' · ' + esc(c.fornecedor) : '') +
            (c.entregaPrevista ? ' · previsto ' + fmt.data(c.entregaPrevista) : '')).join('<br>') +
          ' ' + previsao + '</div>'
        : '') +
    '</div></div>';
}

// #/ver/oc/<id>/<token> — o que o fornecedor abre pelo WhatsApp
async function telaVerPublico(args) {
  const [tipo, id, t] = args;   // tipo é sempre 'oc': só ordem de compra tem link público
  molduraPublica('<div class="cartao"><p class="legenda">Abrindo documento…</p></div>', '');
  try {
    const r = await api('verPublico', { tipo, id, t }, { publico: true });
    const d = r.registro;

    molduraPublica(
      '<div class="cartao">' +
        '<div class="barra-acoes" style="justify-content:space-between">' +
          '<h2 style="margin:0">' + esc(d.codigo) + '</h2>' + etiqueta(d.situacao) +
        '</div>' +
        '<p class="legenda">' + esc(r.cfg.empresa.nome) + (r.cfg.empresa.cnpj ? ' · CNPJ ' + esc(fmt.cnpj(r.cfg.empresa.cnpj)) : '') + '</p>' +
        '<div class="linha" style="margin-top:10px">' +
          '<div><b>Fornecedor</b><br>' + esc((d.fornecedor || {}).nome || '—') + '</div>' +
          '<div><b>Destino</b><br>' + esc(d.obra || '—') +
            ((d.os && d.os.numero) ? '<div class="meta">O.S. ' + esc(d.os.numero) + '</div>' : '') + '</div>' +
          '<div><b>Prazo de entrega</b><br>' + esc(d.prazoEntrega || '—') + '</div>' +
        '</div>' +
        '<div class="tabela-rolagem" style="margin-top:14px"><table><thead><tr><th>#</th><th>Descrição</th><th class="num">Qtd</th><th class="num">Unit.</th><th class="num">Total</th></tr></thead><tbody>' +
        (d.itens || []).map((i, n) => '<tr><td>' + (n + 1) + '</td><td>' + esc(i.descricao) +
          (i.marca ? '<div class="meta" style="font-size:.8rem;color:var(--texto-fraco)">' + esc(i.marca) + '</div>' : '') + '</td>' +
          '<td class="num">' + fmt.numero(i.qtd) + ' ' + esc(i.unid || '') + '</td>' +
          '<td class="num">' + fmt.brl(i.preco) + '</td><td class="num">' + fmt.brl((Number(i.qtd) || 0) * (Number(i.preco) || 0)) + '</td></tr>').join('') +
        '</tbody><tfoot><tr><td colspan="4">Total</td><td class="num">' + fmt.brl(d.totalLiquido != null ? d.totalLiquido : d.total) + '</td></tr></tfoot></table></div>' +
        (d.observacoes ? '<p style="margin-top:12px"><b>Observações:</b> ' + esc(d.observacoes) + '</p>' : '') +
        '<div class="barra-acoes" style="margin-top:14px"><button class="btn primario" id="vPdf">Baixar em PDF</button></div>' +
      '</div>', 'Ordem de compra');
    document.getElementById('vPdf').addEventListener('click', () => {
      pdfOC(d, r.cfg);
    });
  } catch (e) {
    molduraPublica('<div class="cartao"><div class="aviso ruim">' + esc(e.message) + '</div></div>', '');
  }
}

/* ── Partida ───────────────────────────────────────────────────────────────── */
lerCache();
render();
// Era `if (S.senhaHash) puxar()` — e S.senhaHash vem da chave da senha
// compartilhada, que ninguém escreve desde que o login virou crachá. Resultado:
// o app NUNCA sincronizava ao abrir. Quem chegava de manhã via o cache de
// ontem até fazer alguma ação que puxasse. Quem identifica hoje é o crachá.
if (AUTH.temCracha()) puxar();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
