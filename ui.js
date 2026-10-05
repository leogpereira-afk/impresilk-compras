/* UI — peças que todas as telas usam: formatação, etiquetas, modal, aviso.
   Tudo que vem do usuário passa por esc() antes de virar HTML. */

/* Situações em que a ordem de compra ainda está para chegar na empresa.
   Uma constante só: menu, tela de recebimento e painel precisam concordar. */
const SIT_ESPERANDO = ['enviada', 'confirmada', 'transito', 'parcial'];

/* Registro das telas. Precisa ser declarado AQUI, antes de compras.js e
   acervo.js, porque são eles que preenchem (TELAS.solicitacoes = ...). Se a
   declaração ficasse no app.js — que carrega por último — a atribuição
   estouraria e as telas simplesmente não existiriam. */
const TELAS = {};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmt = {
  brl(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },
  numero(n, casas = 2) {
    return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
  },
  data(iso) {
    if (!iso) return '—';
    const s = String(iso);
    const d = s.length === 10 ? new Date(s + 'T12:00:00') : new Date(s);
    return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR');
  },
  dataHora(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  },
  quando(iso) {
    if (!iso) return '';
    const seg = (Date.now() - new Date(iso).getTime()) / 1000;
    if (seg < 60) return 'agora';
    if (seg < 3600) return Math.floor(seg / 60) + ' min';
    if (seg < 86400) return Math.floor(seg / 3600) + ' h';
    if (seg < 172800) return 'ontem';
    if (seg < 2592000) return Math.floor(seg / 86400) + ' dias';
    return fmt.data(iso);
  },
  tamanho(b) {
    const n = Number(b) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  },
  telefone(t) {
    const d = String(t || '').replace(/\D/g, '');
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return t || '';
  },
  cnpj(v) {
    const d = String(v || '').replace(/\D/g, '');
    if (d.length !== 14) return v || '';
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  },
  // Fornecedor pode ser PJ (CNPJ) ou pessoa física (CPF) — o mesmo campo serve
  // para os dois, então quem formata precisa reconhecer os dois.
  doc(v) {
    const d = String(v || '').replace(/\D/g, '');
    if (d.length === 14) return fmt.cnpj(d);
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return v || '';
  }
};

const hojeISO = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};

function diasAte(dataISO) {
  const texto = String(dataISO || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const [ano, mes, dia] = texto.split('-').map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1, dia));
  if (alvo.toISOString().slice(0, 10) !== texto) return null;
  const hoje = new Date();
  return Math.round((alvo.getTime() - Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / 86400000);
}

/* ── Período (ano/mês) ──────────────────────────────────────────────────────
   O painel e as listas mostravam sempre "o mês corrente", sem dizer qual nem
   deixar olhar outro. No dia 1º isso é cruel: o mês zera e parece que a
   empresa parou de comprar. E na hora de fechar o mês ninguém consegue rever
   o mês passado sem abrir o banco.

   Um período só, guardado em S.periodo, serve painel, solicitações e ordens —
   assim as três telas nunca discordam sobre "quando". mes = 0 é o ano inteiro. */
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function periodoAtual() {
  if (!S.periodo) {
    const h = new Date();
    S.periodo = { ano: h.getFullYear(), mes: h.getMonth() + 1 };
  }
  return S.periodo;
}

// Anos que existem nos dados, mais o ano corrente -- nunca uma lista fixa que
// envelhece sozinha.
function anosComDados() {
  const anos = new Set([new Date().getFullYear()]);
  for (const c of ['sc', 'oc', 'cot']) {
    for (const r of lista(c)) {
      const d = String(r.dataEmissao || r.criadoEm || '').slice(0, 4);
      if (/^\d{4}$/.test(d)) anos.add(Number(d));
    }
  }
  return [...anos].sort((a, b) => b - a);
}

// A data que representa o registro: emissão quando existe (a ordem vale pela
// data que foi emitida, não pela que foi digitada no sistema).
const dataDoRegistro = (r) => String(r.dataEmissao || r.criadoEm || '').slice(0, 10);

function noPeriodo(r, per = periodoAtual()) {
  const d = dataDoRegistro(r);
  if (!d) return false;
  if (Number(d.slice(0, 4)) !== Number(per.ano)) return false;
  return !per.mes || Number(d.slice(5, 7)) === Number(per.mes);
}

const rotuloPeriodo = (per = periodoAtual()) =>
  (per.mes ? MESES[per.mes - 1] + ' de ' : '') + per.ano;

// Devolve o HTML dos dois seletores. `aoTrocar` é o nome de uma função global
// chamada quando muda -- render() basta na maioria das telas.
function seletorPeriodo() {
  const per = periodoAtual();
  return '<div class="periodo">' +
    '<select id="perMes" aria-label="Mês">' +
      '<option value="0"' + (per.mes ? '' : ' selected') + '>Ano inteiro</option>' +
      MESES.map((m, i) => '<option value="' + (i + 1) + '"' + (per.mes === i + 1 ? ' selected' : '') + '>' + m + '</option>').join('') +
    '</select>' +
    '<select id="perAno" aria-label="Ano">' +
      anosComDados().map((a) => '<option value="' + a + '"' + (per.ano === a ? ' selected' : '') + '>' + a + '</option>').join('') +
    '</select></div>';
}

function ligarSeletorPeriodo() {
  const m = document.getElementById('perMes');
  const a = document.getElementById('perAno');
  if (m) m.addEventListener('change', (e) => { periodoAtual().mes = Number(e.target.value) || 0; render(); });
  if (a) a.addEventListener('change', (e) => { periodoAtual().ano = Number(e.target.value); render(); });
}

/* ── Etiquetas de situação ─────────────────────────────────────────────────── */
const SITUACOES = {
  // solicitação
  nova: { txt: 'Nova', cls: 'et-nova' },
  aprovada: { txt: 'Aprovada', cls: 'et-aprovada' },
  cotacao: { txt: 'Em cotação', cls: 'et-cotacao' },
  em_cotacao: { txt: 'Em cotação', cls: 'et-cotacao' },
  em_compra: { txt: 'Em compra', cls: 'et-cotacao' },
  // cotação
  aberta: { txt: 'Aguardando preços', cls: 'et-nova' },
  recusada: { txt: 'Recusada', cls: 'et-recusada' },
  atendida: { txt: 'Atendida', cls: 'et-atendida' },
  // ordem de compra
  rascunho: { txt: 'Rascunho', cls: 'et-rascunho' },
  emitida: { txt: 'Emitida', cls: 'et-emitida' },
  enviada: { txt: 'Enviada ao fornecedor', cls: 'et-enviada' },
  confirmada: { txt: 'Confirmada/comprada', cls: 'et-comprado' },
  transito: { txt: 'A caminho', cls: 'et-transito' },
  parcial: { txt: 'Recebida em parte', cls: 'et-parcial' },
  entregue: { txt: 'Entregue', cls: 'et-entregue' },
  cancelada: { txt: 'Cancelada', cls: 'et-cancelada' },
};

const etiqueta = (s) => {
  const e = SITUACOES[s] || { txt: s || '—', cls: '' };
  return '<span class="etiqueta ' + e.cls + '">' + esc(e.txt) + '</span>';
};

const URGENCIAS = {
  normal: { txt: 'Normal', cls: '' },
  urgente: { txt: 'Urgente', cls: 'et-urgente' },
  critica: { txt: 'Parou a produção', cls: 'et-critica' }
};
const etiquetaUrgencia = (u) => {
  const e = URGENCIAS[u] || URGENCIAS.normal;
  return u && u !== 'normal' ? '<span class="etiqueta ' + e.cls + '">' + esc(e.txt) + '</span>' : '';
};

/* ── Avisos rápidos ────────────────────────────────────────────────────────── */
function toast(msg, tipo = '') {
  const modal = typeof _modalAberto !== 'undefined' && _modalAberto;
  let caixa = modal ? modal.fundo.querySelector('.toasts-modal') : document.getElementById('toasts');
  if (!caixa) {
    caixa = document.createElement('div');
    if (modal) {
      caixa.className = 'toasts-modal';
      modal.fundo.querySelector('.modal').appendChild(caixa);
    } else {
      caixa.id = 'toasts';
      document.body.appendChild(caixa);
    }
  }
  caixa.setAttribute('role', 'region');
  caixa.setAttribute('aria-label', 'Notificações');
  const mensagem = String(msg == null ? '' : msg);
  // Falhas repetidas de sincronização não empilham o mesmo aviso indefinidamente.
  if (Array.from(caixa.children).some(t => t.dataset.mensagem === mensagem && t.dataset.tipo === tipo)) return;
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.dataset.mensagem = mensagem;
  t.dataset.tipo = tipo;
  const texto = document.createElement('span');
  texto.setAttribute('role', tipo === 'ruim' ? 'alert' : 'status');
  texto.setAttribute('aria-atomic', 'true');
  t.appendChild(texto);
  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'toast-fechar';
  fechar.setAttribute('aria-label', 'Dispensar notificação');
  fechar.textContent = '×';
  fechar.addEventListener('click', () => {
    const tinhaFoco = t.contains(document.activeElement);
    t.remove();
    if (tinhaFoco) {
      if (_modalAberto) focarModal(_modalAberto);
      else focarElementoUI(document.getElementById('tituloTela'));
    }
  });
  t.appendChild(fechar);
  caixa.appendChild(t);
  texto.textContent = mensagem;
  if (modal && tipo === 'ruim') t.scrollIntoView?.({ block: 'nearest' });
  // Erros e alertas que exigem leitura ficam até a pessoa dispensar.
  if (tipo !== 'ruim' && tipo !== 'atencao') setTimeout(() => {
    if (!t.contains(document.activeElement) && !t.matches(':hover')) t.remove();
  }, 6000);
}

/* ── Modal ─────────────────────────────────────────────────────────────────── */
// Os modais ficam EMPILHADOS: abrir uma confirmação de dentro de um formulário
// não pode apagar o que já foi digitado embaixo.
// E o toque no fundo NÃO fecha: na fábrica, um toque torto ao rolar a tela
// apagava o recebimento inteiro (fotos já enviadas inclusive).
let _modalAberto = null;
const _pilhaModais = [];
let _sequenciaModal = 0;
let _focoBaseModal = null;
const _fundosInertes = new Map();

function elementoVisivelUI(el) {
  return !!(el && el.isConnected && !el.disabled && !el.closest('[hidden], [inert]') &&
    el.getClientRects().length && window.getComputedStyle(el).visibility !== 'hidden');
}

function focarElementoUI(el) {
  if (!elementoVisivelUI(el)) return false;
  if (!el.matches('a[href],button,input,select,textarea,summary,[tabindex]')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  return document.activeElement === el;
}

function focaveisModal(fundo) {
  return Array.from(fundo.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex]'))
    .filter(el => el.tabIndex >= 0 && elementoVisivelUI(el));
}

function focarModal(modal, preferido) {
  if (preferido && modal.fundo.contains(preferido) && focarElementoUI(preferido)) return;
  focarElementoUI(modal.fundo.querySelector('[data-titulo-modal]'));
}

function sincronizarMenuAcessivel() {
  const lateral = document.querySelector('.lateral'), botao = document.getElementById('btnMenu');
  if (!lateral || !botao) return;
  const pequeno = window.matchMedia('(max-width: 900px)').matches;
  const aberto = !pequeno || document.body.classList.contains('menu-aberto');
  lateral.id = lateral.id || 'lateralMenu';
  lateral.inert = !aberto;
  if (aberto) lateral.removeAttribute('aria-hidden');
  else lateral.setAttribute('aria-hidden', 'true');
  botao.setAttribute('aria-controls', lateral.id);
  botao.setAttribute('aria-expanded', String(aberto));
}

function abrirModal({ titulo, corpo, acoes = [], largo = false, aoFechar = null, semFechar = false }) {
  if (_modalAberto) {
    _modalAberto.foco = document.activeElement;
    _modalAberto.fundo.style.display = 'none';
    _modalAberto.fundo.inert = true;
    _modalAberto.fundo.setAttribute('aria-hidden', 'true');
    _pilhaModais.push(_modalAberto);
  } else {
    _focoBaseModal = document.activeElement;
    document.body.classList.add('modal-aberto');
    Array.from(document.body.children).forEach(el => {
      if (/^(SCRIPT|STYLE|LINK)$/.test(el.tagName)) return;
      _fundosInertes.set(el, el.inert);
      el.inert = true;
    });
  }
  const tituloId = 'titulo-modal-' + (++_sequenciaModal);
  const fundo = document.createElement('div');
  fundo.className = 'fundo-modal';
  fundo.innerHTML =
    '<div class="modal' + (largo ? ' largo' : '') + '" role="dialog" aria-modal="true" aria-labelledby="' + tituloId + '">' +
      '<header><h2 id="' + tituloId + '" data-titulo-modal tabindex="-1">' + esc(titulo) + '</h2>' +
      (semFechar ? '' : '<button type="button" class="fechar" data-fechar aria-label="Fechar">&times;</button>') + '</header>' +
      '<div class="corpo"></div>' +
      (acoes.length ? '<footer></footer>' : '') +
    '</div>';
  fundo.querySelector('.corpo').innerHTML = corpo;
  const rodape = fundo.querySelector('footer');
  acoes.forEach((a, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + (a.classe || '');
    b.textContent = a.texto;
    b.dataset.i = i;
    b.addEventListener('click', () => a.aoClicar && a.aoClicar(fundo));
    rodape.appendChild(b);
  });
  fundo.addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-fechar')) fecharModal();
  });
  document.body.appendChild(fundo);
  _modalAberto = { fundo, aoFechar, semFechar };
  associarRotulosUI(fundo);
  // O título recebe foco também no celular, sem abrir o teclado nem saltar o contexto.
  focarModal(_modalAberto);
  return fundo;
}

function fecharModal() {
  if (!_modalAberto) return;
  const { fundo, aoFechar } = _modalAberto;
  tirarDaPilha(fundo);
  fundo.remove();
  if (aoFechar) aoFechar();
}

document.addEventListener('keydown', (e) => {
  if (!_modalAberto) return;
  if (e.key === 'Escape' && !_modalAberto.semFechar) {
    e.preventDefault(); e.stopPropagation(); fecharModal();
  } else if (e.key === 'Tab') {
    const itens = focaveisModal(_modalAberto.fundo);
    const i = itens.indexOf(document.activeElement);
    if (!itens.length) { e.preventDefault(); focarModal(_modalAberto); }
    else if (e.shiftKey && i <= 0) { e.preventDefault(); itens[itens.length - 1].focus(); }
    else if (!e.shiftKey && (i < 0 || i === itens.length - 1)) { e.preventDefault(); itens[0].focus(); }
  }
});

document.addEventListener('focusin', (e) => {
  if (_modalAberto && !_modalAberto.fundo.contains(e.target)) focarModal(_modalAberto);
});

// Fecha sem disparar o aoFechar (usado quando a própria ação já resolveu a
// promessa). Precisa devolver a pilha ao estado certo, senão o modal de baixo
// fica escondido para sempre.
function fecharSilencioso(fundo) {
  tirarDaPilha(fundo);
  fundo.remove();
}

// Fecha ESTE modal (o do handler), não "o que estiver por cima". Depois de um
// await pode ter aparecido outro modal em cima — fechar o errado embaralha tudo.
function fecharEste(fundo) {
  if (!fundo) return fecharModal();
  const dono = (_modalAberto && _modalAberto.fundo === fundo)
    ? _modalAberto : _pilhaModais.find((m) => m.fundo === fundo);
  tirarDaPilha(fundo);
  fundo.remove();
  if (dono && dono.aoFechar) dono.aoFechar();
}

function tirarDaPilha(fundo) {
  if (_modalAberto && _modalAberto.fundo === fundo) {
    _modalAberto = _pilhaModais.pop() || null;
    if (_modalAberto) {
      _modalAberto.fundo.style.display = '';
      _modalAberto.fundo.inert = false;
      _modalAberto.fundo.removeAttribute('aria-hidden');
      focarModal(_modalAberto, _modalAberto.foco);
    } else {
      _fundosInertes.forEach((inert, el) => { if (el.isConnected) el.inert = inert; });
      _fundosInertes.clear();
      document.body.classList.remove('modal-aberto');
      if (!focarElementoUI(_focoBaseModal)) focarElementoUI(document.getElementById('tituloTela'));
      _focoBaseModal = null;
    }
    return;
  }
  const i = _pilhaModais.findIndex((m) => m.fundo === fundo);
  if (i >= 0) _pilhaModais.splice(i, 1);
}

function confirmar(texto, opts = {}) {
  return new Promise((resolve) => {
    abrirModal({
      titulo: opts.titulo || 'Confirmar',
      corpo: '<p>' + esc(texto) + '</p>',
      aoFechar: () => resolve(false),
      acoes: [
        { texto: opts.cancelar || 'Voltar', aoClicar: () => fecharModal() },
        {
          texto: opts.ok || 'Confirmar',
          classe: opts.perigo ? 'perigo' : 'primario',
          aoClicar: (fundo) => { fecharSilencioso(fundo); resolve(true); }
        }
      ]
    });
  });
}

// Caixa de texto simples (motivo, observação...). Devolve o texto ou null.
function perguntar(rotulo, opts = {}) {
  return new Promise((resolve) => {
    const id = 'pg' + Math.random().toString(36).slice(2, 7);
    const campo = opts.multi
      ? '<textarea id="' + id + '">' + esc(opts.valor || '') + '</textarea>'
      : '<input type="text" id="' + id + '" value="' + esc(opts.valor || '') + '">';
    abrirModal({
      titulo: opts.titulo || 'Informe',
      corpo: '<div class="campo"><label for="' + id + '">' + esc(rotulo) + '</label>' + campo + '</div>',
      aoFechar: () => resolve(null),
      acoes: [
        { texto: 'Voltar', aoClicar: () => fecharModal() },
        {
          texto: opts.ok || 'Salvar',
          classe: 'primario',
          aoClicar: (fundo) => {
            const v = fundo.querySelector('#' + id).value.trim();
            if (opts.obrigatorio && !v) { toast('Preencha o campo', 'ruim'); return; }
            fecharSilencioso(fundo); resolve(v);
          }
        }
      ]
    });
  });
}

// Pergunta uma data usando o calendário do aparelho. Texto livre já gravou
// data vazia em silêncio quando o formato digitado não batia.
function perguntarData(rotulo, opts = {}) {
  return new Promise((resolve) => {
    const id = 'dt' + Math.random().toString(36).slice(2, 7);
    abrirModal({
      titulo: opts.titulo || 'Informe a data',
      corpo: '<div class="campo"><label for="' + id + '">' + esc(rotulo) + '</label>' +
        '<input type="date" id="' + id + '" value="' + esc(opts.valor || '') + '"></div>',
      aoFechar: () => resolve(null),
      acoes: [
        ...(opts.pular ? [
          { texto: 'Voltar', aoClicar: () => fecharModal() },
          { texto: opts.pular, aoClicar: (fundo) => { fecharSilencioso(fundo); resolve(''); } }
        ] : [{ texto: 'Pular', aoClicar: () => fecharModal() }]),
        { texto: opts.ok || 'Salvar', classe: 'primario', aoClicar: (fundo) => {
          const v = fundo.querySelector('#' + id).value;
          if (!v) { toast('Escolha uma data', 'ruim'); return; }
          fecharSilencioso(fundo); resolve(v);
        } }
      ]
    });
  });
}

/* ── Peças de formulário ───────────────────────────────────────────────────── */
let _sequenciaCampoUI = 0;
const novoIdCampoUI = () => 'campo-ui-' + (++_sequenciaCampoUI);

function associarRotulosUI(raiz) {
  raiz.querySelectorAll('.campo').forEach(campoEl => {
    campoEl.querySelectorAll('label').forEach(label => {
      if (label.htmlFor || label.querySelector('input,select,textarea')) return;
      const controles = Array.from(campoEl.querySelectorAll('input:not([type="hidden"]),select,textarea'));
      const input = controles.find(el => !el.labels?.length && (label.compareDocumentPosition(el) & 4));
      if (!input) return;
      input.id = input.id || novoIdCampoUI();
      label.htmlFor = input.id;
    });
  });
}

function campo(rot, html, dica) {
  html = String(html || '');
  const controles = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)]
    .filter(m => !/\btype=["']hidden["']/i.test(m[0]));
  const idDica = dica ? novoIdCampoUI() + '-dica' : '';
  const ajuda = dica ? '<div class="dica" id="' + idDica + '">' + esc(dica) + '</div>' : '';
  if (controles.length > 1 && controles.every(m => /\btype=["'](?:radio|checkbox)["']/i.test(m[0]))) {
    return '<fieldset class="campo campo-grupo"' + (idDica ? ' aria-describedby="' + idDica + '"' : '') + '><legend>' + esc(rot) + '</legend>' + html + ajuda + '</fieldset>';
  }
  let id = '';
  if (controles.length === 1 && !/\btype=["'](?:radio|checkbox)["']/i.test(controles[0][0])) {
    const tag = controles[0][0];
    const idExistente = tag.match(/\sid=["']([^"']*)["']/i);
    id = idExistente?.[1] || novoIdCampoUI();
    let novaTag = idExistente ? tag.replace(/\sid=["'][^"']*["']/i, () => ' id="' + id + '"') : tag.replace(/>$/, () => ' id="' + id + '">');
    if (idDica) {
      if (/\baria-describedby=["']/i.test(novaTag)) novaTag = novaTag.replace(/(\baria-describedby=["'])([^"']*)(["'])/i, '$1$2 ' + idDica + '$3');
      else novaTag = novaTag.replace(/>$/, ' aria-describedby="' + idDica + '">');
    }
    html = html.slice(0, controles[0].index) + novaTag + html.slice(controles[0].index + tag.length);
  }
  return '<div class="campo"><label' + (id ? ' for="' + id + '"' : '') + '>' + esc(rot) + '</label>' + html + ajuda + '</div>';
}

function entrada(nome, valor, opts = {}) {
  const attrs = [
    'type="' + (opts.tipo || 'text') + '"',
    'data-campo="' + esc(nome) + '"',
    'value="' + esc(valor == null ? '' : valor) + '"',
    opts.placeholder ? 'placeholder="' + esc(opts.placeholder) + '"' : '',
    opts.inputmode ? 'inputmode="' + opts.inputmode + '"' : '',
    opts.passo ? 'step="' + opts.passo + '"' : '',
    opts.somenteLeitura ? 'readonly' : '',
    opts.max ? 'maxlength="' + opts.max + '"' : ''
  ].filter(Boolean).join(' ');
  return '<input ' + attrs + '>';
}

function areaTexto(nome, valor, placeholder) {
  return '<textarea data-campo="' + esc(nome) + '"' + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '>' +
    esc(valor || '') + '</textarea>';
}

function seletor(nome, valor, opcoes, vazio) {
  const itens = opcoes.map((o) => {
    const v = typeof o === 'string' ? o : o.v;
    const t = typeof o === 'string' ? o : o.t;
    return '<option value="' + esc(v) + '"' + (String(v) === String(valor) ? ' selected' : '') + '>' + esc(t) + '</option>';
  }).join('');
  return '<select data-campo="' + esc(nome) + '">' +
    (vazio ? '<option value="">' + esc(vazio) + '</option>' : '') + itens + '</select>';
}

// Lê todos os [data-campo] de um pedaço da tela e devolve um objeto
// ({'solicitante.nome': 'x'} vira {solicitante:{nome:'x'}}).
function lerCampos(raiz) {
  const obj = {};
  raiz.querySelectorAll('[data-campo]').forEach((el) => {
    const caminho = el.dataset.campo.split('.');
    let alvo = obj;
    for (let i = 0; i < caminho.length - 1; i++) alvo = alvo[caminho[i]] || (alvo[caminho[i]] = {});
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.numero !== undefined && typeof v === 'string') v = numeroBR(v);
    alvo[caminho[caminho.length - 1]] = v;
  });
  return obj;
}

// Aceita "1.234,56", "1234.56" e também "1.200" (ponto de milhar sem centavos).
// Sem o terceiro caso, uma quantidade de 1.200 sacos virava 1,2 — foi assim que
// o recebimento chegou a gravar mil vezes menos do que chegou na empresa.
/* O caminho de VOLTA do numeroBR: número vira texto para preencher o campo.

   Sem isso, 0.875 era escrito no input como "0.875" (ponto, do JS), e ao salvar
   de novo o numeroBR lia aquilo pela regra de milhar — `\d{1,3}` casa o "0",
   `(\.\d{3})+` casa o ".875" — e devolvia 875. Preço de R$ 0,875 por metro
   virava R$ 875 só de abrir a ordem e salvar sem tocar em nada. Escrevendo em
   pt-BR desde o começo, ida e volta fecham. */
function paraCampo(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v;          // já veio do teclado da pessoa
  const n = Number(v);
  if (!isFinite(n)) return '';
  return String(n).replace('.', ',');
}

function numeroBR(v) {
  if (typeof v === 'number') return v;
  // Tira "R$", "kg", "un" e qualquer outro enfeite: quem digita valor no
  // celular escreve "R$ 1.200,50" sem pensar, e isso virava ZERO calado.
  const s = String(v || '').trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  let limpo;
  if (s.includes(',')) limpo = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) limpo = s.replace(/\./g, ''); // 1.200 · 12.000 · 1.234.567
  else limpo = s;
  const n = parseFloat(limpo);
  return isFinite(n) ? n : 0;
}

/* ── WhatsApp ──────────────────────────────────────────────────────────────── */
function linkWhats(telefone, texto) {
  let d = String(telefone || '').replace(/\D/g, '');
  // Decide pelo TAMANHO, não pelo prefixo. Número brasileiro sem DDI tem 10 ou
  // 11 dígitos; com DDI, 12 ou 13. Testar `startsWith('55')` confundia o DDI
  // com o DDD 55 (Santa Maria, Uruguaiana e região no RS): o telefone
  // (55) 99999-8888 já "começava com 55", não ganhava DDI, e a mensagem ia
  // parar em outro número — sem erro nenhum, a conversa só abria errada.
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return 'https://wa.me/' + d + '?text=' + encodeURIComponent(texto || '');
}

function baixarTexto(nome, conteudo, tipo = 'application/json') {
  const b = new Blob([conteudo], { type: tipo });
  salvarNoAparelho(b, nome);
}

/* ── Estado vazio ──────────────────────────────────────────────────────────── */
const vazio = (icone, titulo, texto) =>
  '<div class="vazio"><span class="icone">' + icone + '</span><b>' + esc(titulo) + '</b>' +
  (texto ? '<div>' + esc(texto) + '</div>' : '') + '</div>';
