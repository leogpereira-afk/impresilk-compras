// auth.js — login pela CENTRAL DE ACESSOS (equipe-auth), sistema "compras".
//
// A senha nunca é conferida aqui: vai para o servidor, volta um CRACHÁ assinado
// (30 dias — o app segue funcionando offline depois de um login com internet).
// O crachá viaja em TODA chamada ao nucleo, que é quem decide o que cada papel
// pode fazer. Mesmo desenho do Brief/PCP — um login só para a equipe inteira.
const AUTH = (() => {
  const K_TOKEN = 'compras_cracha';
  const SISTEMA = 'compras';

  const pegar = () => localStorage.getItem(K_TOKEN) || '';
  const guardar = (t) => { if (t) localStorage.setItem(K_TOKEN, t); };
  const esquecer = () => localStorage.removeItem(K_TOKEN);

  async function chamar(acao, corpo, comCracha) {
    const cab = { 'Content-Type': 'application/json' };
    if (comCracha) cab['Authorization'] = 'Bearer ' + pegar();
    const r = await fetch(API_AUTH, {
      method: 'POST', headers: cab,
      body: JSON.stringify(Object.assign({ acao, sistema: SISTEMA }, corpo || {})),
    });
    let dados = {};
    try { dados = await r.json(); } catch { /* sem corpo */ }
    if (!r.ok) throw Object.assign(new Error(dados.erro || ('HTTP ' + r.status)), { status: r.status });
    return dados;
  }

  return {
    temCracha: () => !!pegar(),
    cracha: pegar,
    esquecer,
    async login(usuario, senha) { const r = await chamar('login', { usuario, senha }); guardar(r.token); return r; },
    // null = sem internet (segue com o que está no aparelho); false = crachá morto.
    async eu() { try { return await chamar('eu', {}, true); } catch (e) { return e.status === 401 ? false : null; } },
    trocarMinhaSenha(senhaAtual, novaSenha) { return chamar('trocarMinhaSenha', { senhaAtual, novaSenha }, true); },
    listarContas() { return chamar('listarContas', {}, true); },
    salvarConta(c) { return chamar('salvarConta', c, true); },
    removerConta(usuario) { return chamar('removerConta', { usuario }, true); },
  };
})();
