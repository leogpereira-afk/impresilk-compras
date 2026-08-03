/* Acervo — Catálogos, Manuais e Treinamentos.
   Arquivo grande sobe em partes (ver store.js) e volta remontado no navegador,
   então catálogo em PDF de 40MB funciona igual a um arquivo pequeno.

   As três telas usam o MESMO motor (subir em partes, versionar, baixar). O que
   muda é o vocabulário e a coleção:
     proj  → Catálogos    (o que o fornecedor vende: chapa, lona, perfil, LED)
     doc   → Manuais      (o que a fábrica usa: ficha técnica, norma, garantia)
     trein → Treinamentos (como se faz: vídeo, passo a passo, checklist)
   As chaves de coleção ficaram como estavam para não migrar dado à toa —
   quem lê a tela vê Catálogo, quem lê o banco vê `proj`. */

const ICONES = { pdf: '📕', dwg: '📐', dxf: '📐', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', doc: '📄', docx: '📄', xls: '📊', xlsx: '📊', zip: '🗜️', rar: '🗜️' };
const iconeArquivo = (nome) => ICONES[String(nome || '').split('.').pop().toLowerCase()] || '📎';

/* Sobe um ou vários arquivos mostrando o progresso. Devolve os metadados. */
async function subirArquivos(files, aoTerminarCada) {
  const arquivos = Array.from(files || []);
  if (!arquivos.length) return [];
  // semFechar (um toque errado matava o envio de uma prancha de 40MB), mas com
  // saída consciente: o botão Cancelar interrompe entre as partes.
  const cancelar = { pedido: false };
  const fundo = abrirModal({
    titulo: 'Enviando ' + arquivos.length + ' arquivo(s)',
    corpo: '<div id="subLista"></div>',
    semFechar: true,
    acoes: [{ texto: 'Cancelar envio', classe: 'perigo', aoClicar: () => {
      cancelar.pedido = true;
      toast('Cancelando… aguarde a parte atual terminar.', 'ruim');
    } }]
  });
  const caixa = fundo.querySelector('#subLista');
  const metas = [];
  let falhas = 0;
  for (const f of arquivos) {
    if (cancelar.pedido) { falhas++; continue; }
    const linha = document.createElement('div');
    linha.className = 'arquivo-solto';
    linha.innerHTML = '<span class="ic">' + iconeArquivo(f.name) + '</span>' +
      '<div style="flex:1"><div class="nome">' + esc(f.name) + '</div>' +
      '<div class="meta">' + fmt.tamanho(f.size) + '</div>' +
      '<div class="progresso"><i></i></div></div>';
    caixa.appendChild(linha);
    const barra = linha.querySelector('.progresso i');
    try {
      const meta = await enviarArquivo(f, (p) => { barra.style.width = (p * 100) + '%'; }, cancelar);
      barra.style.background = 'var(--verde)';
      metas.push(meta);
      if (aoTerminarCada) aoTerminarCada(meta, f);
    } catch (e) {
      falhas++;
      linha.querySelector('.meta').innerHTML = '<span style="color:var(--vermelho)">falhou: ' + esc(e.message) + '</span>';
      barra.style.background = 'var(--vermelho)';
    }
  }
  fecharEste(fundo);
  if (falhas) toast(falhas + ' arquivo(s) não subiram.', 'ruim');
  return metas;
}

// Baixa mostrando barra de progresso: numa prancha de 40MB o usuário ficava
// olhando uma tela parada e clicava de novo, começando um segundo download.
let _baixando = false;
async function baixar(arquivoId, nome) {
  if (_baixando) { toast('Já tem um download em andamento', 'ruim'); return; }
  _baixando = true;
  const fundo = abrirModal({
    titulo: 'Baixando ' + (nome || 'arquivo'),
    corpo: '<div class="progresso"><i id="barraBaixa"></i></div>' +
      '<p class="legenda" style="margin-top:8px">Arquivo grande pode levar alguns minutos.</p>',
    semFechar: true, acoes: []
  });
  try {
    const { blob, meta } = await baixarArquivo(arquivoId, (p) => {
      const b = document.getElementById('barraBaixa');
      if (b) b.style.width = (p * 100) + '%';
    });
    fecharEste(fundo);
    salvarNoAparelho(blob, nome || meta.nome);
  } catch (e) {
    fecharEste(fundo);
    toast('Não consegui baixar: ' + e.message, 'ruim');
  } finally {
    _baixando = false;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   PROJETOS
   ══════════════════════════════════════════════════════════════════════════ */
TELAS.catalogos = function (el) {
  const todos = lista('proj');
  const filtro = S.filtroProj || { obra: '', disciplina: '', busca: '' };
  S.filtroProj = filtro;
  const filtrados = todos.filter((p) =>
    (!filtro.obra || p.obraId === filtro.obra) &&
    (!filtro.disciplina || p.disciplina === filtro.disciplina) &&
    (!filtro.busca || (p.nome + ' ' + (p.descricao || '')).toLowerCase().includes(filtro.busca.toLowerCase())));

  const porDisciplina = {};
  for (const p of filtrados) (porDisciplina[p.disciplina || 'Outros'] || (porDisciplina[p.disciplina || 'Outros'] = [])).push(p);

  // Quem é da produção CONSULTA o catálogo; quem sobe e revisa é o time de
  // compras. O servidor recusa a gravação — mostrar o botão só fazia a pessoa
  // preencher um formulário que sumia depois.
  const podeMexer = typeof podeEscrever !== 'function' || podeEscrever('proj');
  cabecalho('Catálogos', todos.length + ' arquivo(s) · sempre a versão mais nova',
    podeMexer ? '<button class="btn primario" id="subirProj">⬆️ Subir catálogo</button>' : '');

  el.innerHTML =
    '<div class="filtros">' +
      '<input type="search" id="pjBusca" placeholder="Buscar catálogo…" value="' + esc(filtro.busca) + '">' +
      '<select id="pjObra"><option value="">Todos os destinos</option>' +
        obras().map((o) => '<option value="' + esc(o.id) + '"' + (filtro.obra === o.id ? ' selected' : '') + '>' + esc(o.nome) + '</option>').join('') +
      '</select>' +
      '<select id="pjDisc"><option value="">Todas as linhas</option>' +
        cfgLista('disciplinas').map((d) => '<option' + (filtro.disciplina === d ? ' selected' : '') + '>' + esc(d) + '</option>').join('') +
      '</select>' +
    '</div>' +
    (podeMexer ? '<div class="solta-aqui" id="solta">Arraste os arquivos aqui ou clique para escolher<br>' +
      '<small>PDF, DWG, imagens, planilhas — qualquer tamanho</small></div>' : '') +
    (filtrados.length ? Object.keys(porDisciplina).sort().map((d) =>
      '<div class="cartao"><h3>' + esc(d) + ' <span class="etiqueta">' + porDisciplina[d].length + '</span></h3>' +
      porDisciplina[d].map((p) =>
        '<div class="arquivo-solto">' +
          '<span class="ic">' + iconeArquivo(p.arquivoNome || p.nome) + '</span>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="nome">' + esc(p.nome) + ' <span class="etiqueta">' + esc(p.revisao || 'R00') + '</span></div>' +
            '<div class="meta">' + esc(nomeObra(p.obraId)) + ' · ' + fmt.tamanho(p.tamanho) + ' · enviado ' + fmt.quando(p.criadoEm) +
            ' por ' + esc(p.criadoPor || '—') + ((p.versoes || []).length ? ' · ' + (p.versoes.length + 1) + ' versões' : '') + '</div>' +
            (p.descricao ? '<div class="meta">' + esc(p.descricao) + '</div>' : '') +
          '</div>' +
          '<div class="acoes">' +
            '<button class="btn pequeno primario" data-baixar="' + esc(p.id) + '">Baixar</button>' +
            '<button class="btn pequeno" data-proj="' + esc(p.id) + '">⋯</button>' +
          '</div>' +
        '</div>').join('') + '</div>').join('')
      : '<div class="cartao">' + vazio('📚', 'Nenhum catálogo', 'Suba os catálogos dos fornecedores para a equipe consultar sem pedir por WhatsApp.') + '</div>');

  // Filtros
  const aplicar = () => {
    filtro.obra = document.getElementById('pjObra').value;
    filtro.disciplina = document.getElementById('pjDisc').value;
    render();
  };
  document.getElementById('pjObra').addEventListener('change', aplicar);
  document.getElementById('pjDisc').addEventListener('change', aplicar);
  let t;
  document.getElementById('pjBusca').addEventListener('input', (e) => {
    clearTimeout(t); const v = e.target.value;
    t = setTimeout(() => {
      filtro.busca = v; render();
      const c = document.getElementById('pjBusca'); if (c) c.focus();
    }, 400);
  });

  // Envio
  const escolher = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true;
    inp.addEventListener('change', () => formularioCatalogo(inp.files));
    inp.click();
  };
  const bsp = document.getElementById('subirProj');
  if (bsp) bsp.addEventListener('click', escolher);
  const solta = document.getElementById('solta');
  if (solta) solta.addEventListener('click', escolher);
  if (solta) ['dragenter', 'dragover'].forEach((ev) => solta.addEventListener(ev, (e) => {
    e.preventDefault(); solta.classList.add('por-cima');
  }));
  if (solta) ['dragleave', 'drop'].forEach((ev) => solta.addEventListener(ev, (e) => {
    e.preventDefault(); solta.classList.remove('por-cima');
  }));
  if (solta) solta.addEventListener('drop', (e) => formularioCatalogo(e.dataTransfer.files));

  el.querySelectorAll('[data-baixar]').forEach((b) => b.addEventListener('click', () => {
    const p = achar('proj', b.dataset.baixar);
    if (!p) { toast('Este catálogo não existe mais — atualize a tela', 'ruim'); return; }
    baixar(p.arquivoId, p.arquivoNome || p.nome);
  }));
  el.querySelectorAll('[data-proj]').forEach((b) => b.addEventListener('click', () => menuCatalogo(b.dataset.proj)));
};

// Pergunta destino/linha e só então manda os arquivos.
function formularioCatalogo(files) {
  const arquivos = Array.from(files || []);
  if (!arquivos.length) return;
  abrirModal({
    titulo: 'Subir ' + arquivos.length + ' catálogo(s)',
    corpo: '<div id="fProj">' +
      '<p class="legenda">' + arquivos.map((f) => esc(f.name) + ' (' + fmt.tamanho(f.size) + ')').join('<br>') + '</p>' +
      '<div class="linha">' +
        campo('Destino', seletor('obraId', (obras()[0] || {}).id, obras().map((o) => ({ v: o.id, t: o.nome })))) +
        campo('Linha de produto', seletor('disciplina', (cfgLista('disciplinas')[0] || 'Comunicação visual'), cfgLista('disciplinas'))) +
        campo('Revisão', entrada('revisao', 'R00', { placeholder: 'R00' })) +
      '</div>' +
      campo('Descrição (opcional)', entrada('descricao', '', { placeholder: 'Ex.: catálogo de perfis de alumínio 2026' })) +
    '</div>',
    acoes: [
      { texto: 'Voltar', aoClicar: () => fecharModal() },
      { texto: 'Enviar', classe: 'primario', aoClicar: async (fundo) => {
        const d = lerCampos(fundo.querySelector('#fProj'));
        fecharEste(fundo);
        const metas = await subirArquivos(arquivos, (meta, file) => {
          salvar('proj', {
            nome: file.name.replace(/\.[^.]+$/, ''),
            arquivoNome: file.name,
            arquivoId: meta.id,
            tamanho: file.size,
            mime: file.type,
            obraId: d.obraId,
            obra: nomeObra(d.obraId),
            disciplina: d.disciplina,
            revisao: d.revisao || 'R00',
            descricao: d.descricao,
            versoes: []
          });
        });
        render();
        if (!metas.length) { toast('Nenhum arquivo subiu — nada foi salvo. Tente de novo.', 'ruim'); return; }
        toast(metas.length < arquivos.length
          ? metas.length + ' de ' + arquivos.length + ' catálogos salvos'
          : 'Catálogo disponível para a equipe', metas.length < arquivos.length ? 'ruim' : 'bom');
      } }
    ]
  });
}

function menuCatalogo(id) {
  const p = achar('proj', id);
  if (!p) return;
  abrirModal({
    titulo: p.nome,
    corpo:
      '<p class="legenda">' + esc(nomeObra(p.obraId)) + ' · ' + esc(p.disciplina) + ' · ' + esc(p.revisao || 'R00') +
      ' · ' + fmt.tamanho(p.tamanho) + '</p>' +
      ((p.versoes || []).length ? '<h3>Versões anteriores</h3>' +
        p.versoes.slice().reverse().map((v) =>
          '<div class="arquivo-solto"><span class="ic">🕓</span><div style="flex:1">' +
          '<div class="nome">' + esc(v.revisao) + '</div><div class="meta">' + fmt.dataHora(v.em) + ' · ' +
          esc(v.por || '') + ' · ' + fmt.tamanho(v.tamanho) + '</div></div>' +
          '<div class="acoes"><button class="btn pequeno" data-vbaixar="' + esc(v.arquivoId) + '" data-vnome="' + esc(v.arquivoNome || p.nome) + '">Baixar</button></div></div>').join('')
        : '<p class="legenda">Só existe a versão atual.</p>'),
    acoes: [
      ((typeof podeEscrever === 'function' && !podeEscrever('proj')) ? null :
      { texto: 'Nova revisão', aoClicar: () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.addEventListener('change', async () => {
          const file = inp.files[0];
          if (!file) return;
          const rev = await perguntar('Número da nova revisão', { titulo: 'Nova revisão', valor: proximaRevisao(p.revisao), ok: 'Enviar' });
          if (rev === null) return;
          const metas = await subirArquivos([file]);
          if (!metas.length) return;
          const versoes = [...(p.versoes || []), {
            id: p.arquivoId, revisao: p.revisao || 'R00', arquivoId: p.arquivoId,
            arquivoNome: p.arquivoNome, tamanho: p.tamanho, em: p.atualizadoEm || p.criadoEm, por: p.atualizadoPor || p.criadoPor
          }];
          salvar('proj', Object.assign({}, p, {
            arquivoId: metas[0].id, arquivoNome: file.name, tamanho: file.size, revisao: rev || proximaRevisao(p.revisao), versoes
          }));
          fecharModal(); render(); toast('Revisão enviada — a equipe já baixa a nova', 'bom');
        });
        inp.click();
      } }),
      ((typeof podeEscrever === 'function' && !podeEscrever('proj')) ? null :
      { texto: 'Apagar', classe: 'perigo', aoClicar: async () => {
        if (!await confirmar('Apagar este catálogo? Vai para a lixeira.', { perigo: true, ok: 'Apagar' })) return;
        try { await api('apagar', { colecao: 'proj', id: p.id }); } catch (e) { toast('Não consegui apagar: ' + e.message, 'ruim'); return; }
        await puxar(); fecharModal(); render();
      } }),
      { texto: 'Baixar atual', classe: 'primario', aoClicar: () => baixar(p.arquivoId, p.arquivoNome || p.nome) },
      { texto: 'Fechar', aoClicar: () => fecharModal() }
    ].filter(Boolean)
  });
  document.querySelectorAll('[data-vbaixar]').forEach((b) =>
    b.addEventListener('click', () => baixar(b.dataset.vbaixar, b.dataset.vnome)));
}

function proximaRevisao(atual) {
  const m = String(atual || 'R00').match(/^R?(\d+)$/i);
  if (!m) return 'R01';
  return 'R' + String(Number(m[1]) + 1).padStart(2, '0');
}

/* ══════════════════════════════════════════════════════════════════════════
   DOCUMENTOS
   ══════════════════════════════════════════════════════════════════════════ */
// Documentos que vencem nos próximos N dias (ou já venceram). Usado no painel.
function docsVencendo(dias) {
  return lista('doc').filter((d) => {
    if (!d.validadeEm) return false;
    const n = diasAte(d.validadeEm);
    return n !== null && n <= dias;
  }).sort((a, b) => String(a.validadeEm).localeCompare(String(b.validadeEm)));
}

function situacaoDoc(d) {
  if (!d.validadeEm) return { cls: '', txt: 'sem validade' };
  const n = diasAte(d.validadeEm);
  if (n < 0) return { cls: 'et-vencido', txt: 'vencido há ' + (-n) + ' dia(s)' };
  if (n <= 30) return { cls: 'et-vencendo', txt: 'vence em ' + n + ' dia(s)' };
  return { cls: 'et-valido', txt: 'válido' };
}

TELAS.manuais = function (el) {
  const todos = lista('doc');
  const vencendo = docsVencendo(30);
  const podeMexer = typeof podeEscrever !== 'function' || podeEscrever('doc');
  cabecalho('Manuais', todos.length + ' manual(is) e ficha(s) técnica(s)',
    podeMexer ? '<button class="btn primario" id="novoDoc">+ Novo manual</button>' : '');

  const grupos = {};
  for (const d of todos) {
    const g = d.obraId && d.obraId !== 'empresa' ? nomeObra(d.obraId) : 'Empresa';
    (grupos[g] || (grupos[g] = [])).push(d);
  }

  el.innerHTML =
    (vencendo.length ? '<div class="aviso atencao"><b>' + vencendo.length + ' manual(is)</b> vencidos ou vencendo nos próximos 30 dias. ' +
      'Certidão vencida trava pagamento, licitação e cadastro em cliente grande.</div>' : '') +
    (podeMexer ? '<div class="solta-aqui" id="soltaDoc">Arraste um documento aqui ou clique para escolher</div>' : '') +
    (todos.length ? Object.keys(grupos).sort().map((g) =>
      '<div class="cartao"><h3>' + esc(g) + '</h3>' +
      '<div class="tabela-rolagem"><table><thead><tr><th>Tipo</th><th>Documento</th><th>Nº</th>' +
      '<th>Validade</th><th>Situação</th><th></th></tr></thead><tbody>' +
      grupos[g].map((d) => {
        const s = situacaoDoc(d);
        return '<tr><td><b>' + esc(d.tipo) + '</b></td>' +
          '<td>' + esc(d.nome || '—') + (d.orgao ? '<div style="font-size:.8rem;color:var(--texto-fraco)">' + esc(d.orgao) + '</div>' : '') + '</td>' +
          '<td>' + esc(d.numero || '—') + '</td>' +
          '<td>' + (d.validadeEm ? fmt.data(d.validadeEm) : '—') + '</td>' +
          '<td><span class="etiqueta ' + s.cls + '">' + esc(s.txt) + '</span></td>' +
          '<td class="num">' +
            (d.arquivoId ? '<button class="btn pequeno primario" data-dbaixar="' + esc(d.id) + '">Baixar</button> ' : '') +
            (podeMexer ? '<button class="btn pequeno" data-deditar="' + esc(d.id) + '">Editar</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>').join('')
      : '<div class="cartao">' + vazio('🗂️', 'Nenhum documento', 'Guarde ficha técnica, manual de máquina, CNPJ e certidões aqui — ' +
        'assim ninguém mais procura em pasta de e-mail.') + '</div>');

  const bnd = document.getElementById('novoDoc');
  if (bnd) bnd.addEventListener('click', () => editarDocumento(null));
  const solta = document.getElementById('soltaDoc');
  const escolher = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.addEventListener('change', () => editarDocumento(null, inp.files[0]));
    inp.click();
  };
  if (solta) {
    solta.addEventListener('click', escolher);
    ['dragenter', 'dragover'].forEach((ev) => solta.addEventListener(ev, (e) => { e.preventDefault(); solta.classList.add('por-cima'); }));
    ['dragleave', 'drop'].forEach((ev) => solta.addEventListener(ev, (e) => { e.preventDefault(); solta.classList.remove('por-cima'); }));
    solta.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) editarDocumento(null, e.dataTransfer.files[0]); });
  }

  el.querySelectorAll('[data-dbaixar]').forEach((b) => b.addEventListener('click', () => {
    const d = achar('doc', b.dataset.dbaixar);
    if (!d) { toast('Este documento não existe mais — atualize a tela', 'ruim'); return; }
    baixar(d.arquivoId, d.arquivoNome || d.nome);
  }));
  el.querySelectorAll('[data-deditar]').forEach((b) => b.addEventListener('click', () => editarDocumento(b.dataset.deditar)));
};

function editarDocumento(id, arquivo) {
  const d = id ? achar('doc', id) : {};
  const opcoesObra = [{ v: 'empresa', t: 'Empresa (Impresilk)' }].concat(obras().map((o) => ({ v: o.id, t: o.nome })));
  abrirModal({
    titulo: id ? 'Editar manual' : 'Novo manual',
    corpo: '<div id="fDoc">' +
      (arquivo ? '<div class="aviso info">Arquivo: <b>' + esc(arquivo.name) + '</b> (' + fmt.tamanho(arquivo.size) + ')</div>' : '') +
      '<div class="linha">' +
        campo('Tipo', seletor('tipo', d.tipo || 'CNPJ', cfgLista('tiposDoc'))) +
        campo('Pertence a', seletor('obraId', d.obraId || 'empresa', opcoesObra)) +
      '</div>' +
      '<div class="linha">' +
        campo('Nome / descrição', entrada('nome', d.nome, { placeholder: 'Ex.: Ficha técnica do vinil' })) +
        campo('Número', entrada('numero', d.numero)) +
      '</div>' +
      '<div class="linha">' +
        campo('Órgão emissor', entrada('orgao', d.orgao, { placeholder: 'Ex.: Prefeitura de Montes Claros' })) +
        campo('Emissão', entrada('emissaoEm', d.emissaoEm, { tipo: 'date' })) +
        campo('Validade', entrada('validadeEm', d.validadeEm, { tipo: 'date' })) +
      '</div>' +
      campo('Observação', areaTexto('obs', d.obs)) +
      (id && d.arquivoId ? '<p class="legenda">Arquivo atual: ' + esc(d.arquivoNome || '—') + '</p>' : '') +
      (!arquivo ? '<div class="campo"><label>Arquivo (opcional)</label><input type="file" id="docArq"></div>' : '') +
    '</div>',
    acoes: [
      (id ? { texto: 'Apagar', classe: 'perigo', aoClicar: async () => {
        if (!await confirmar('Apagar este manual?', { perigo: true, ok: 'Apagar' })) return;
        try { await api('apagar', { colecao: 'doc', id }); } catch (e) { toast('Não consegui apagar: ' + e.message, 'ruim'); return; }
        await puxar(); fecharModal(); render();
      } } : null),
      { texto: 'Voltar', aoClicar: () => fecharModal() },
      { texto: 'Salvar', classe: 'primario', aoClicar: async (fundo) => {
        const dados = lerCampos(fundo.querySelector('#fDoc'));
        const escolhido = arquivo || (fundo.querySelector('#docArq') && fundo.querySelector('#docArq').files[0]);
        if (!dados.nome.trim()) dados.nome = dados.tipo;
        // O formulário só fecha DEPOIS do upload: se o arquivo falhar, tudo que
        // foi digitado (tipo, número, órgão, validade) continua na tela.
        let extra = {};
        if (escolhido) {
          const metas = await subirArquivos([escolhido]);
          if (!metas.length) {
            toast('O arquivo não subiu — nada foi salvo. Confira a internet e tente de novo.', 'ruim');
            return;
          }
          extra = { arquivoId: metas[0].id, arquivoNome: escolhido.name, tamanho: escolhido.size, mime: escolhido.type };
        }
        fecharEste(fundo);
        salvar('doc', Object.assign({}, d, dados, extra, { obra: dados.obraId === 'empresa' ? 'Empresa' : nomeObra(dados.obraId) }));
        render();
        toast('Documento salvo', 'bom');
      } }
    ].filter(Boolean)
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   TREINAMENTOS — como se faz.

   Mesmo motor do catálogo (subir em partes, baixar remontado), com uma
   diferença que importa na prática: treinamento quase sempre é VÍDEO, e vídeo
   não cabe (nem deve) no armazenamento do sistema. Então cada item aceita um
   ARQUIVO ou um LINK (YouTube, Drive) — e a maioria vai ser link.
   ══════════════════════════════════════════════════════════════════════════ */
TELAS.treinamentos = function (el) {
  const todos = lista('trein');
  const podeMexer = typeof podeEscrever !== 'function' || podeEscrever('trein');
  cabecalho('Treinamentos', todos.length + ' treinamento(s) da equipe',
    podeMexer ? '<button class="btn primario" id="novoTrein">+ Novo treinamento</button>' : '');

  const grupos = {};
  for (const t of todos) (grupos[t.area || 'Geral'] || (grupos[t.area || 'Geral'] = [])).push(t);

  el.innerHTML = todos.length
    ? Object.keys(grupos).sort().map((g) =>
        '<div class="cartao"><h3>' + esc(g) + '</h3>' +
        grupos[g].map((t) => {
          const ehLink = !!t.link && !t.arquivoId;
          return '<div class="arquivo-solto">' +
            '<span class="ic">' + (ehLink ? '▶️' : iconeArquivo(t.arquivoNome)) + '</span>' +
            '<div style="flex:1;min-width:0">' +
              '<div class="nome">' + esc(t.nome) + '</div>' +
              '<div class="meta">' + esc(t.descricao || '') +
                (t.duracao ? ' · ' + esc(t.duracao) : '') +
                (t.arquivoNome ? ' · ' + esc(t.arquivoNome) : '') + '</div>' +
            '</div>' +
            '<div class="acoes">' +
              (ehLink
                ? '<a class="btn pequeno primario" href="' + esc(t.link) + '" target="_blank" rel="noopener">Assistir ↗</a>'
                : '<button class="btn pequeno" data-tbaixar="' + esc(t.id) + '">Baixar</button>') +
              (podeMexer ? '<button class="btn pequeno" data-tapagar="' + esc(t.id) + '">Apagar</button>' : '') +
            '</div></div>';
        }).join('') + '</div>').join('')
    : '<div class="cartao">' + vazio('🎓', 'Nenhum treinamento ainda',
        'Guarde aqui o passo a passo de aplicação, calandragem, corte e instalação — quem entra na equipe aprende sem depender de alguém estar livre.') + '</div>';

  el.querySelectorAll('[data-tbaixar]').forEach((b) => b.addEventListener('click', async () => {
    const t = achar('trein', b.dataset.tbaixar);
    if (!t) { toast('Este treinamento não existe mais — atualize a tela', 'ruim'); return; }
    await baixar(t.arquivoId, t.arquivoNome);
  }));
  el.querySelectorAll('[data-tapagar]').forEach((b) => b.addEventListener('click', async () => {
    if (!await confirmar('Apagar este treinamento? Vai para a lixeira.', { perigo: true, ok: 'Apagar' })) return;
    try { await api('apagar', { colecao: 'trein', id: b.dataset.tapagar }); } catch (e) { toast('Não consegui apagar: ' + e.message, 'ruim'); return; }
    await puxar(); render(); toast('Treinamento apagado', 'bom');
  }));
  const bn = document.getElementById('novoTrein');
  if (bn) bn.addEventListener('click', formularioTreinamento);
};

function formularioTreinamento() {
  abrirModal({
    titulo: 'Novo treinamento',
    corpo: '<div id="fTrein">' +
      campo('Título', entrada('nome', '', { placeholder: 'Ex.: Aplicação de vinil em ACM' })) +
      '<div class="linha">' +
        campo('Área', seletor('area', 'Produção', ['Produção', 'Instalação', 'Acabamento', 'Segurança', 'Atendimento', 'Geral'])) +
        campo('Duração (opcional)', entrada('duracao', '', { placeholder: 'Ex.: 12 min' })) +
      '</div>' +
      campo('Descrição', areaTexto('descricao', '')) +
      '<div class="campo"><label>Link do vídeo (YouTube, Drive…)</label>' +
        '<input type="url" name="link" placeholder="https://…">' +
        '<div class="dica">Vídeo pesa demais para guardar aqui — cole o link. Se for PDF ou apostila, use o arquivo abaixo.</div></div>' +
      '<div class="campo"><label>Ou um arquivo (PDF, apostila)</label>' +
        '<input type="file" id="treinArq"></div>' +
    '</div>',
    acoes: [
      { texto: 'Voltar', aoClicar: () => fecharModal() },
      { texto: 'Salvar', classe: 'primario', aoClicar: async (fundo) => {
        const d = lerCampos(fundo.querySelector('#fTrein'));
        if (!d.nome) { toast('Dê um título ao treinamento', 'ruim'); return; }
        const arq = fundo.querySelector('#treinArq');
        const file = arq && arq.files && arq.files[0];
        if (!d.link && !file) { toast('Cole um link OU escolha um arquivo', 'ruim'); return; }
        fecharEste(fundo);
        let meta = null;
        if (file) {
          const metas = await subirArquivos([file]);
          if (!metas.length) { toast('O arquivo não subiu — nada foi salvo.', 'ruim'); return; }
          meta = metas[0];
        }
        salvar('trein', {
          nome: d.nome, area: d.area, duracao: d.duracao, descricao: d.descricao,
          link: d.link || '',
          arquivoId: meta ? meta.id : '',
          arquivoNome: file ? file.name : '',
          tamanho: file ? file.size : 0,
        });
        render();
        toast('Treinamento salvo', 'bom');
      } }
    ]
  });
}
