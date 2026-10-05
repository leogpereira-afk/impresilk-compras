/* Store — conversa com o servidor, guarda tudo no aparelho e segura a fila
   quando cai a internet.

   Regra de ouro (offline-first): o dado é salvo NO APARELHO primeiro e só
   depois sobe. Quem está na empresa sem sinal continua trabalhando; quando a
   internet volta, a fila sobe sozinha. */

// TODAS as coleções do sistema. Ao criar uma nova, acrescente AQUI (e no
// COLECOES do nucleo.mjs) — era em dois lugares e a cotação chegava do
// servidor mas era jogada fora por não existir nesta lista.
const COLECOES_APP = ['sc', 'cot', 'oc', 'forn', 'equipe', 'doc', 'proj', 'trein', 'transp', 'mat', 'oferta', 'frete'];
const regVazio = () => COLECOES_APP.reduce((a, c) => { a[c] = []; return a; }, {});

const S = {
  cfg: null,
  reg: regVazio(),
  fila: [],
  quem: '',
  senhaHash: '',
  // Quem entrou: perfil manda no menu e nos botões. A porta de verdade é o
  // servidor — isto aqui só evita mostrar o que a pessoa não pode fazer.
  perfil: 'obra',
  usuarioId: '',
  acessoProprio: false,
  seqFila: 0,
  sincronizando: false,
  ultimoPull: 0,
  online: navigator.onLine,
  erroSync: '',
  erroCache: '',
  cacheDisponivel: false
};

const K = {
  cache: 'compras_cache_v1',
  cacheLimpo: 'compras_cache_limpo_em',
  fila: 'compras_fila_v1',
  quem: 'compras_quem',
  senha: 'compras_senha_legado', // não usado: a identidade é o crachá (auth.js)
  perfil: 'compras_perfil',
  usuario: 'compras_usuario'
};

// Espelho do que o servidor faz valer (lib/acesso.mjs). Serve só para não
// mostrar botão que a pessoa não pode apertar — a porta é o servidor.
const ESCRITA_POR_PERFIL = { obra: ['sc', 'oc'] };
function podeEscrever(colecao) {
  const permitidas = ESCRITA_POR_PERFIL[S.perfil];
  return !permitidas || permitidas.includes(colecao);
}

// A fila conserva o trabalho recusado para revisão, mas nunca é uma fonte
// autorizada para exibir preços. A máscara também vale ao recuperar cache,
// trocar perfil e reabrir o navegador (não apenas no primeiro snapshot).
const LEITURA_OBRA_LOCAL = ['sc','oc','forn','equipe','doc','proj','trein','mat','transp'];
const PRIVADO_LOCAL = ['preco','total','totalLiquido','totalBruto','desconto','frete','seguro','difalValor','valor','liquido','bruto','retencao','adiantamento','condicaoPagamento','banco','dadosBancarios','tokenPublico','token'];
function registroVisivelLocal(col, registro, perfil = S.perfil) {
  if (perfil !== 'obra') return registro;
  if (!LEITURA_OBRA_LOCAL.includes(col)) return null;
  if (col !== 'oc') return registro;
  const limpar = value => {
    if (Array.isArray(value)) return value.map(limpar);
    if (!value || typeof value !== 'object') return value;
    const saida = {};
    for (const [k,v] of Object.entries(value)) if (!PRIVADO_LOCAL.includes(k) && !['medicoes','aditivos'].includes(k)) saida[k] = limpar(v);
    return saida;
  };
  const textoSeguro = value => {
    if (typeof value === 'string') return value.replace(/R\$\s*-?[\d.]+(?:,\d{1,2})?/g,'R$ •••');
    if (Array.isArray(value)) return value.map(textoSeguro);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,textoSeguro(v)]));
  };
  const saida = limpar(registro);
  if (Array.isArray(saida.historico)) saida.historico = textoSeguro(saida.historico);
  return saida;
}
function registrosVisiveisLocais(reg, perfil = S.perfil) {
  return Object.fromEntries(COLECOES_APP.map(col => [col,(reg[col] || []).map(r=>registroVisivelLocal(col,r,perfil)).filter(Boolean)]));
}
function cfgVisivelLocal(cfg, perfil = S.perfil) {
  if (!cfg || perfil === 'direcao') return cfg;
  const saida = {...cfg}; delete saida.usuarios; delete saida.senhaHash;
  return saida;
}

// Uma só aba pode alterar o armazenamento compartilhado. Web Locks é um
// mutex do navegador: não vence por relógio nem é roubado de uma aba suspensa.
// As outras abas consultam normalmente, mas não alteram fila, cache ou sessão.
let _controleAbasIniciado = false, _tentativaAba = null;
function abaPodeEscrever() { return !_controleAbasIniciado || S.abaEscrita === true; }
function exigirAbaEscrita() {
  if (!abaPodeEscrever()) {
    const msg = S.avisoAba || 'Esta aba está somente para consulta. Feche a outra aba e use Assumir edição.';
    toast(msg, 'ruim'); throw new Error(msg);
  }
}
async function iniciarControleAbas() {
  if (_controleAbasIniciado && S.abaEscrita) return true;
  if (_tentativaAba) return _tentativaAba;
  _controleAbasIniciado = true; S.abaEscrita = false;
  const semSuporte = 'Este navegador não oferece edição segura em várias abas. Consulte os dados ou abra o Compras em um navegador atualizado para editar.';
  if (!navigator.locks || typeof navigator.locks.request !== 'function') { S.avisoAba = semSuporte; return false; }
  _tentativaAba = new Promise(resolve => {
    Promise.resolve().then(() => navigator.locks.request('compras-escrita-local-v19', {mode:'exclusive',ifAvailable:true}, async lock => {
      if (!lock) {
        S.avisoAba = 'Somente consulta: o Compras está aberto para edição em outra aba. Feche a outra aba e clique em Assumir edição.';
        resolve(false); return;
      }
      // A aba pode ter ficado em consulta por horas. Atualizar sua memória é
      // obrigatório ANTES de liberar qualquer nova escrita ou confirmação.
      try {
        S.reg = regVazio(); S.cfg = null; S.fila = [];
        await lerCache();
        S.abaEscrita = true; S.avisoAba = '';
        resolve(true);
      } catch (e) {
        S.avisoAba = 'Não foi possível recuperar a fila deste aparelho. Recarregue antes de editar.';
        resolve(false); return;
      }
      // A vida deste documento é a vida do lock; fechar a aba libera o mutex.
      // Não liberar no logout: uma confirmação antiga ainda pode estar em voo.
      await new Promise(() => {});
    })).catch(() => { S.abaEscrita = false; S.avisoAba = semSuporte; resolve(false); });
  });
  const resultado = await _tentativaAba; _tentativaAba = null;
  return resultado;
}

// Uma resposta pertence à sessão que iniciou a chamada. Logout/login muda a
// geração antes de limpar dados: nenhuma resposta antiga pode ressuscitá-los.
let _geracaoSessao = 0;
const _requisicoesPrivadas = new Set();
function capturarSessaoDados() {
  return {geracao:_geracaoSessao,usuario:S.usuarioId,token:typeof AUTH !== 'undefined' && typeof AUTH.cracha === 'function' ? AUTH.cracha() : null};
}
function sessaoDadosAtual(s) {
  const atual = capturarSessaoDados();
  return s.geracao === atual.geracao && s.usuario === atual.usuario && s.token === atual.token;
}
function erroSessaoAlterada() { return Object.assign(new Error('Operação encerrada porque a sessão mudou.'), {canceladoPorSessao:true}); }
function invalidarSessaoDados() {
  _geracaoSessao++;
  for (const ctrl of _requisicoesPrivadas) ctrl.abort();
  _requisicoesPrivadas.clear();
  _subindo = null; _puxando = null; S.sincronizando = false;
}
const ACOES_CONSULTA_LOCAL = new Set(['ping','snapshot','list','getCfg','backup','log','buscarOS','fornecedoresMubi','produtosMubi','conferenciaMubi','diagMubi','meta','baixarParte','uso']);

/* ── SHA-256 (a senha nunca viaja em texto puro) ───────────────────────────── */
async function sha256(txt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ── Chamada ao servidor ───────────────────────────────────────────────────── */
async function api(action, dados = {}, opts = {}) {
  if (!opts.publico && !ACOES_CONSULTA_LOCAL.has(action)) exigirAbaEscrita();
  const sessao = opts.publico ? null : capturarSessaoDados();
  const headers = { 'Content-Type': 'application/json', 'x-token': TOKEN };
  if (!opts.publico && typeof AUTH !== 'undefined' && AUTH.temCracha()) headers['Authorization'] = 'Bearer ' + AUTH.cracha();
  if (S.quem) headers['x-quem'] = encodeURIComponent(S.quem);
  const ctrl = new AbortController();
  if (sessao) _requisicoesPrivadas.add(ctrl);
  const prazo = setTimeout(() => ctrl.abort(), opts.prazoMs || 60000);
  try {
    const r = await fetch(opts.url || API, {
      method: 'POST', headers, body: JSON.stringify(Object.assign({ action }, dados)), signal: ctrl.signal
    });
    if (sessao && !sessaoDadosAtual(sessao)) throw erroSessaoAlterada();
    let j = null;
    try { j = await r.json(); } catch { /* resposta inválida */ }
    if (sessao && !sessaoDadosAtual(sessao)) throw erroSessaoAlterada();
    if (!r.ok) {
      const e = new Error((j && (j.error || j.message)) || ('Erro ' + r.status));
      e.status = r.status; e.semSenha = !!(j && j.semSenha); e.semPermissao = !!(j && j.semPermissao);
      throw e;
    }
    return j;
  } catch (e) {
    if (sessao && !sessaoDadosAtual(sessao)) throw erroSessaoAlterada();
    throw (e && e.name === 'AbortError') ? new Error('A internet demorou demais para responder') : e;
  } finally { clearTimeout(prazo); _requisicoesPrivadas.delete(ctrl); }
}

const apiArq = (action, dados = {}, opts = {}) => api(action, dados, Object.assign({ url: API_ARQ }, opts));

/* ── Cache local ───────────────────────────────────────────────────────────── */
async function lerCache() {
  try {
    const c = await lerSnapshotLocal();
    if (c && c.reg) { S.reg = Object.assign(S.reg, c.reg); S.cfg = c.cfg || null; S.ultimoPull = c.em || 0; }
  } catch { /* cache corrompido: começa limpo */ }
  try { S.fila = JSON.parse(localStorage.getItem(K.fila) || '[]'); } catch { S.fila = []; }
  // O contador PRECISA continuar de onde parou. Se recomeçar do zero, um número
  // novo colide com um já gravado e o envio apaga da fila algo que nunca subiu.
  // Entradas de versões antigas do app (sem seq) ganham um número aqui.
  S.seqFila = S.fila.reduce((m, f) => Math.max(m, Number(f.seq) || 0), 0);
  let faltando = false;
  for (const f of S.fila) if (!f.seq) { f.seq = ++S.seqFila; faltando = true; }
  if (faltando && abaPodeEscrever()) { try { localStorage.setItem(K.fila, JSON.stringify(S.fila)); } catch { /* segue */ } }
  S.quem = localStorage.getItem(K.quem) || '';
  S.senhaHash = localStorage.getItem(K.senha) || '';
  S.perfil = localStorage.getItem(K.perfil) || 'obra';
  S.usuarioId = localStorage.getItem(K.usuario) || '';
  S.acessoProprio = !!S.usuarioId;
  S.reg = registrosVisiveisLocais(S.reg);
  S.cfg = cfgVisivelLocal(S.cfg);
  // Se o cache tiver se perdido, recuperar o trabalho ainda não confirmado.
  reconstituirFilaLocal();
}
function reconstituirFilaLocal() {
  for (const f of S.fila) {
    const visivel = registroVisivelLocal(f.colecao, f.registro);
    if (!visivel) continue;
    const arr = S.reg[f.colecao] || (S.reg[f.colecao] = []);
    const i = arr.findIndex((r) => r.id === f.registro.id);
    const rec = Object.assign({}, visivel, { _pendente: true });
    if (i >= 0) arr[i] = rec; else arr.unshift(rec);
  }
}

// O snapshot volumoso usa IndexedDB; a fila pequena continua síncrona para
// garantir persistência ANTES de o formulário anunciar que foi guardado.
let _cacheDB = null;
let _cacheEscrita = Promise.resolve();
let _cacheVersao = 0;
function abrirCacheDB() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Armazenamento ampliado indisponível'));
  if (_cacheDB) return _cacheDB;
  _cacheDB = new Promise((resolve, reject) => {
    const req = indexedDB.open('compras_local_v2', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('dados')) req.result.createObjectStore('dados'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { _cacheDB = null; reject(req.error); };
    req.onblocked = () => { _cacheDB = null; reject(new Error('Feche outras abas antigas para atualizar a cópia local')); };
  });
  return _cacheDB;
}
async function cacheDB(acao, valor) {
  const db = await abrirCacheDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dados', acao === 'get' ? 'readonly' : 'readwrite');
    const store = tx.objectStore('dados');
    const req = acao === 'get' ? store.get('snapshot') : acao === 'delete' ? store.delete('snapshot') : store.put(valor, 'snapshot');
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error || req.error);
    tx.onabort = () => reject(tx.error || new Error('Cópia local interrompida'));
  });
}
async function lerSnapshotLocal() {
  let db = null, legado = null;
  try { db = await cacheDB('get'); } catch { /* armazenamento temporariamente indisponível */ }
  try { legado = JSON.parse(localStorage.getItem(K.cache) || 'null'); } catch { /* sem cópia */ }
  const versao = c => Number(c?.salvoEm || c?.em || 0);
  const invalidadoEm = Number(localStorage.getItem(K.cacheLimpo) || 0);
  const usuario = localStorage.getItem(K.usuario) || '';
  const valido = c => c && (!invalidadoEm || versao(c) > invalidadoEm) && (!c.usuarioId || c.usuarioId === usuario);
  if (!valido(db)) db = null;
  if (!valido(legado)) legado = null;
  const c = legado && (!db || versao(legado) > versao(db)) ? legado : db;
  _cacheVersao = Math.max(_cacheVersao, versao(c));
  S.cacheDisponivel = !!c;
  return c;
}
function gravarCache() {
  // Clonar agora: uma gravação posterior nunca deve trocar o conteúdo desta.
  _cacheVersao = Math.max(Date.now(), _cacheVersao + 1);
  if (!abaPodeEscrever()) return Promise.resolve();
  const sessao = capturarSessaoDados();
  const snapshot = JSON.parse(JSON.stringify({reg:registrosVisiveisLocais(S.reg),cfg:cfgVisivelLocal(S.cfg),em:S.ultimoPull,salvoEm:_cacheVersao,usuarioId:S.usuarioId}));
  _cacheEscrita = _cacheEscrita.catch(() => {}).then(async () => {
    if (!sessaoDadosAtual(sessao) || !abaPodeEscrever()) return;
    try {
      await cacheDB('put', snapshot);
      // Só remove o snapshot legado depois de confirmar a transação nova.
      try { localStorage.removeItem(K.cache); } catch { /* sem efeito na fila */ }
      S.erroCache = ''; S.cacheDisponivel = true;
    } catch (e) {
      try {
        localStorage.setItem(K.cache, JSON.stringify(snapshot));
        S.erroCache = ''; S.cacheDisponivel = true;
      } catch {
        S.erroCache = 'Cópia local indisponível. Mantenha conexão para consultar dados atualizados.';
        S.cacheDisponivel = false;
      }
    }
    document.dispatchEvent(new CustomEvent('domo:status'));
  });
  return _cacheEscrita;
}
async function limparCacheLocal() {
  exigirAbaEscrita();
  // Mesmo se o IndexedDB estiver temporariamente indisponível para apagar,
  // a cópia antiga não pode ressurgir no próximo login/reload.
  _cacheVersao = Math.max(Date.now(), _cacheVersao + 1);
  try { localStorage.setItem(K.cacheLimpo, String(_cacheVersao)); } catch { /* ainda tenta apagar o banco */ }
  await _cacheEscrita.catch(() => {});
  try { await cacheDB('delete'); } catch { /* indisponível */ }
  try { localStorage.removeItem(K.cache); } catch { /* modo restrito */ }
  S.cacheDisponivel = false; S.erroCache = '';
}

// A fila é o que segura o trabalho feito sem internet: se ela não couber no
// aparelho, o usuário PRECISA saber (o cache pode falhar calado, a fila não).
function gravarFila(fila = S.fila) {
  if (!abaPodeEscrever()) { toast(S.avisoAba, 'ruim'); return false; }
  try {
    localStorage.setItem(K.fila, JSON.stringify(fila));
    return true;
  } catch (e) {
    // Tenta abrir espaço jogando fora o cache (ele se refaz no próximo snapshot).
    try {
      localStorage.removeItem(K.cache);
      localStorage.setItem(K.fila, JSON.stringify(fila));
      return true;
    } catch (e2) {
      S.erroSync = 'memória do aparelho cheia — não consigo guardar offline';
      document.dispatchEvent(new CustomEvent('domo:status'));
      toast('Memória do aparelho cheia. Conecte à internet antes de continuar.', 'ruim');
      return false;
    }
  }
}

/* ── Consultas ─────────────────────────────────────────────────────────────── */
// Lista de uma coleção já sem a lixeira e com o mais novo em cima.
function lista(col, incluirApagados = false) {
  return (S.reg[col] || [])
    .filter((r) => incluirApagados || !r.apagadoEm)
    .sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
}

const achar = (col, id) => (S.reg[col] || []).find((r) => r.id === id) || null;

/* ── Gravação ──────────────────────────────────────────────────────────────── */
// Salva no aparelho na hora e empurra pra fila. Devolve o registro local.
function salvar(col, registro, opts = {}) {
  exigirAbaEscrita();
  const id = registro.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const local = Object.assign({}, achar(col, id) || {}, registro, {
    id,
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: S.quem || '—',
    _pendente: true
  });
  if (!local.criadoEm) { local.criadoEm = local.atualizadoEm; local.criadoPor = S.quem || '—'; }
  // A intenção pertence a esta chamada, não ao registro já aberto. Uma edição
  // depois de receber não pode herdar o marcador e perder campos comerciais.
  if (col === 'oc' && !Object.prototype.hasOwnProperty.call(registro, '_operacao')) delete local._operacao;

  const anteriorPendente = S.fila.find(f => f.colecao === col && f.registro.id === id);
  if (col === 'oc' && local._operacao === 'recebimento' && anteriorPendente && anteriorPendente.registro._operacao !== 'recebimento') {
    // Receber depois de editar offline não transforma a edição inteira em
    // recebimento (o servidor ignoraria seus campos comerciais).
    delete local._operacao;
    if (anteriorPendente.registro._versaoBase !== undefined) local._versaoBase = anteriorPendente.registro._versaoBase;
    else delete local._versaoBase;
  }
  const proximaFila = S.fila.filter((f) => !(f.colecao === col && f.registro.id === id));
  proximaFila.push({ colecao: col, registro: local, seq: S.seqFila + 1 });
  if (!gravarFila(proximaFila)) throw new Error('Não foi possível guardar a alteração. Libere espaço e tente novamente; o formulário foi preservado.');
  S.seqFila++;
  S.fila = proximaFila;
  const arr = S.reg[col] || (S.reg[col] = []);
  const i = arr.findIndex((r) => r.id === id);
  if (i >= 0) arr[i] = local; else arr.unshift(local);
  gravarCache();
  document.dispatchEvent(new CustomEvent('domo:status'));

  if (!opts.semSubir) subirFila();
  return local;
}

// Acrescenta uma linha no histórico do registro (quem fez, quando, o quê).
function historiar(registro, o_que) {
  const h = Array.isArray(registro.historico) ? registro.historico.slice() : [];
  h.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    em: new Date().toISOString(),
    por: S.quem || '—',
    o_que
  });
  return h;
}

let _subindo = null;
async function subirFila() {
  if (_subindo || !S.fila.length || !navigator.onLine || !abaPodeEscrever()) return;
  const rodada = {}, sessao = capturarSessaoDados();
  _subindo = rodada;
  const enviando = S.fila.filter(f => !f.erro).slice(0, 25);
  if (!enviando.length) { _subindo = null; return; }
  try {
    const r = await api('salvarLote', {
      itens: enviando.map((f) => ({ colecao: f.colecao, registro: limparParaEnvio(f.registro) }))
    });
    if (!sessaoDadosAtual(sessao) || !abaPodeEscrever()) return;
    // Tira da fila SÓ o que foi enviado (pelo número da entrada). Se o usuário
    // mexeu de novo no mesmo registro durante o envio, a alteração nova fica.
    // Remove pelas PRÓPRIAS entradas enviadas (identidade), não pelo número —
    // assim nem um seq repetido leva junto o que não foi enviado.
    const recusados = r.recusados || [];
    const chave = (col, id) => col + '|' + id;
    const aceitas = new Set((r.salvos || []).map(x => chave(x._col, x.id)));
    const enviadas = new Set(enviando);
    const proximaFila = S.fila.filter(f => !(enviadas.has(f) && aceitas.has(chave(f.colecao, f.registro.id)))).map(f => {
      const recusa = enviadas.has(f) && recusados.find(x => x.colecao === f.colecao && x.id === f.registro.id);
      return recusa ? {...f, erro: recusa.motivo || 'Gravação recusada pelo servidor'} : f;
    });
    if (!gravarFila(proximaFila)) throw new Error('Resposta recebida, mas a fila local não pôde ser atualizada. Sincronize novamente.');
    S.fila = proximaFila;
    if (recusados.length) document.dispatchEvent(new CustomEvent('domo:sempermissao', {
      detail: { qtd: recusados.length, msg: recusados[0].motivo, itens: recusados }
    }));
    const aindaNaFila = new Set(S.fila.map((f) => f.colecao + '|' + f.registro.id));
    for (const confirmado of (r.salvos || [])) {
      const col = confirmado._col;
      const salvo = registroVisivelLocal(col, confirmado);
      if (!salvo) continue;
      // Registro com alteração mais nova esperando: não sobrescreve a tela.
      if (aindaNaFila.has(col + '|' + salvo.id)) continue;
      const arr = S.reg[col] || (S.reg[col] = []);
      const i = arr.findIndex((x) => x.id === salvo.id);
      if (i >= 0) arr[i] = salvo; else arr.unshift(salvo);
    }
    gravarCache();
    S.erroSync = S.fila.some(f => f.erro) ? 'Há alterações recusadas; conteúdo preservado neste aparelho.' : '';
    document.dispatchEvent(new CustomEvent('domo:dados'));
    if (S.fila.some(f => !f.erro)) setTimeout(subirFila, 300);
  } catch (e) {
    if (!sessaoDadosAtual(sessao) || e.canceladoPorSessao) return;
    S.erroSync = e.message || 'falha ao enviar';
    if (e.semSenha) document.dispatchEvent(new CustomEvent('domo:semsenha'));
    // Ação inteira negada (não é mais o caso do salvarLote, que recusa item a
    // item): a fila nunca passaria, então sai — mas o usuário fica sabendo
    // exatamente o que não foi salvo, com o código de cada documento.
    if (e.semPermissao) {
      const enviadas = new Set(enviando);
      const bloqueadas = S.fila.map(f => enviadas.has(f) ? {...f, erro:e.message} : f);
      if (gravarFila(bloqueadas)) S.fila = bloqueadas;
      document.dispatchEvent(new CustomEvent('domo:sempermissao', {
        detail: {qtd:enviando.length,msg:e.message,itens:enviando.map(f=>({colecao:f.colecao,id:f.registro.id,codigo:f.registro.codigo||''}))}
      }));
    }
    console.warn('fila:', e.message);
  } finally {
    if (_subindo === rodada) _subindo = null;
    if (sessaoDadosAtual(sessao)) document.dispatchEvent(new CustomEvent('domo:status'));
  }
}

const limparParaEnvio = (r) => { const c = Object.assign({}, r); delete c._pendente; delete c._col; return c; };

// Impressão digital barata do que está na tela: id + quando mudou.
function assinaturaDados() {
  const partes = [];
  for (const col of Object.keys(S.reg)) {
    for (const r of S.reg[col]) partes.push(col + r.id + (r.atualizadoEm || '') + (r.apagadoEm || ''));
  }
  partes.sort();
  return partes.join('|') + '#' + JSON.stringify(S.cfg || null);
}

/* ── Puxar do servidor ─────────────────────────────────────────────────────── */
let _puxando = null;
async function puxar() {
  if (typeof PUBLICAS !== 'undefined' && typeof rotaAtual === 'function' && PUBLICAS.includes(rotaAtual().tela)) return;
  if (_puxando || !navigator.onLine || (typeof AUTH !== 'undefined' && !AUTH.temCracha())) return;
  const rodada = {}, sessao = capturarSessaoDados();
  _puxando = rodada;
  S.sincronizando = true;
  document.dispatchEvent(new CustomEvent('domo:status'));
  try {
    await subirFila();
    if (!sessaoDadosAtual(sessao)) return;
    const r = await api('snapshot');
    if (!sessaoDadosAtual(sessao)) return;
    if (!abaPodeEscrever()) {
      // A fila pode ter sido confirmada/editada pela aba principal enquanto
      // esta consultava o servidor; não manter sua cópia velha indefinidamente.
      try { const fila = JSON.parse(localStorage.getItem(K.fila) || '[]'); if (Array.isArray(fila)) S.fila = fila; } catch { /* conservar última leitura válida */ }
      reconstituirFilaLocal();
    }
    const perfilServidor = r.eu?.perfil || S.perfil;
    const novo = regVazio();
    for (const reg of (r.registros || [])) {
      const col = reg._col, visivel = registroVisivelLocal(col, reg, perfilServidor);
      if (novo[col] && visivel) novo[col].push(visivel);
    }
    // Não descarta o que este aparelho acabou de mexer. A LISTAGEM do Blobs
    // tem consistência eventual (~1min): um registro recém-gravado pode não
    // vir no snapshot e sumiria da tela de quem o criou.
    const GRACA_MS = 3 * 60 * 1000;
    const recente = (o) => {
      const t = o.atualizadoEm || o.criadoEm;
      return t && (Date.now() - new Date(t).getTime()) < GRACA_MS;
    };
    const naFila = new Set(S.fila.map((f) => f.colecao + '|' + f.registro.id));
    for (const col of Object.keys(novo)) {
      const vindos = new Set(novo[col].map((x) => x.id));
      for (const anterior of (S.reg[col] || [])) {
        const local = registroVisivelLocal(col, anterior, perfilServidor);
        if (!local) continue;
        const chave = col + '|' + local.id;
        if (naFila.has(chave)) {
          // Alteração ainda não enviada SEMPRE ganha da versão do servidor,
          // mesmo que o servidor já conheça o registro — senão o recebimento
          // feito sem sinal era desfeito na tela do próprio autor.
          novo[col] = novo[col].filter((x) => x.id !== local.id);
          novo[col].push({...local, _pendente:true});
        } else if (!vindos.has(local.id) && recente(local)) {
          novo[col].push(local);
        }
      }
    }
    S.reg = novo;
    S.cfg = cfgVisivelLocal(r.cfg || S.cfg, perfilServidor);
    // O servidor diz o perfil a cada sincronização: se a direção mudar o
    // acesso de alguém, o menu daquela pessoa acompanha sem precisar sair.
    if (r.eu && r.eu.perfil) {
      S.perfil = r.eu.perfil;
      S.acessoProprio = !!r.eu.proprio;
      S.usuarioId = r.eu.proprio ? r.eu.id : '';
      if (r.eu.proprio && r.eu.nome) S.quem = r.eu.nome;
      try {
        if (!abaPodeEscrever()) throw new Error('Aba de consulta');
        localStorage.setItem(K.perfil, S.perfil);
        localStorage.setItem(K.usuario, S.usuarioId);
        if (S.quem) localStorage.setItem(K.quem, S.quem);
      } catch { /* modo privado: segue sem lembrar */ }
    }
    S.ultimoPull = Date.now();
    S.erroSync = S.fila.some(f => f.erro) ? 'Há alterações recusadas; conteúdo preservado neste aparelho.' : '';
    gravarCache();
    // Só avisa a tela quando algo REALMENTE mudou. Antes, o sync de 90s
    // redesenhava a página do nada e jogava a rolagem pro topo no meio da leitura.
    const assinatura = assinaturaDados();
    if (assinatura !== S.assinatura) {
      // A assinatura só é dada por consumida quando a tela REALMENTE redesenhar
      // (o app.js confirma). Com modal aberto o redesenho é adiado, e sem isso
      // a tela ficaria desatualizada para sempre depois de fechar o modal.
      S.assinaturaPendente = assinatura;
      document.dispatchEvent(new CustomEvent('domo:dados'));
    }
  } catch (e) {
    if (!sessaoDadosAtual(sessao) || e.canceladoPorSessao) return;
    S.erroSync = e.message || 'falha ao baixar';
    if (e.semSenha) document.dispatchEvent(new CustomEvent('domo:semsenha'));
  } finally {
    if (_puxando === rodada) { _puxando = null; S.sincronizando = false; }
    if (sessaoDadosAtual(sessao)) document.dispatchEvent(new CustomEvent('domo:status'));
  }
}

/* ── Arquivos grandes (projetos, documentos, fotos) ────────────────────────── */
// 2,5MB por pedaço: em base64 vira ~3,4MB, com folga no limite de corpo que
// a Edge Function do acervo (compras-acervo) aceita por requisição.
const TAM_PARTE = 2.5 * 1024 * 1024;

function bytesParaBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

function base64ParaBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Sobe um File em partes. onProgresso(0..1) pra barra de progresso.
// Cada parte tem 3 tentativas: no 4G da empresa uma falha isolada no meio de uma
// planta de 40MB não pode jogar fora o upload inteiro.
async function enviarArquivo(file, onProgresso, cancelar) {
  const partes = Math.max(1, Math.ceil(file.size / TAM_PARTE));
  const ini = await apiArq('iniciar', {
    nome: file.name, mime: file.type || 'application/octet-stream', tamanho: file.size, partes
  });
  for (let i = 0; i < partes; i++) {
    if (cancelar && cancelar.pedido) throw new Error('envio cancelado');
    const pedaco = file.slice(i * TAM_PARTE, Math.min(file.size, (i + 1) * TAM_PARTE));
    const dados = bytesParaBase64(await pedaco.arrayBuffer());
    let ultimoErro = null;
    for (let tent = 0; tent < 3; tent++) {
      try { await apiArq('parte', { id: ini.id, i, dados }, { prazoMs: 180000 }); ultimoErro = null; break; }
      catch (e) {
        ultimoErro = e;
        // Erro definitivo (senha, parte inválida, arquivo não iniciado) não
        // melhora com insistência — e não vale esperar depois da última tentativa.
        if (e.status && e.status < 500 && e.status !== 429) break;
        if (tent < 2) await new Promise((r) => setTimeout(r, 800 * (tent + 1)));
      }
    }
    if (ultimoErro) throw ultimoErro;
    if (onProgresso) onProgresso((i + 1) / partes);
  }
  const fim = await apiArq('finalizar', { id: ini.id });
  return fim.meta || ini.meta;
}

// Baixa juntando as partes no navegador e devolve um Blob.
async function baixarArquivo(id, onProgresso) {
  const { meta } = await apiArq('meta', { id });
  const pedacos = [];
  const total = meta.partes || 1;
  for (let i = 0; i < total; i++) {
    const r = await apiArq('baixarParte', { id, i }, { prazoMs: 180000 });
    pedacos.push(base64ParaBytes(r.dados));
    if (onProgresso) onProgresso((i + 1) / total);
  }
  return { blob: new Blob(pedacos, { type: meta.mime || 'application/octet-stream' }), meta };
}

function salvarNoAparelho(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome || 'arquivo';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ── Rede ──────────────────────────────────────────────────────────────────── */
window.addEventListener('online', () => { S.online = true; subirFila(); puxar(); });
window.addEventListener('offline', () => { S.online = false; document.dispatchEvent(new CustomEvent('domo:status')); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - S.ultimoPull > 45000) puxar();
});
setInterval(() => { if (!document.hidden) puxar(); }, 90000);
