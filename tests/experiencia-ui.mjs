// DOM sintético: não abre navegador, não acessa rede nem dados de usuários.
// Requer jsdom no ambiente de teste (resolução padrão do Node ou NODE_PATH).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const base = process.env.COMPRAS_UI_SOURCE || process.cwd();
const source = readFileSync(resolve(base, 'ui.js'), 'utf8');
const css = readFileSync(resolve(base, 'styles.css'), 'utf8');
const dom = new JSDOM('<!doctype html><body><main id="app"><button id="origem">Abrir</button><h1 id="tituloTela">Compras</h1></main><aside id="inativo" inert></aside><div id="toasts"></div></body>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.invalid/' });
const { window } = dom, { document } = window;
const timers = [];
window.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
window.matchMedia = () => ({ matches: true });
if (!Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'inert')) Object.defineProperty(window.HTMLElement.prototype, 'inert', {
  get() { return this.hasAttribute('inert'); }, set(v) { this.toggleAttribute('inert', !!v); }
});
// jsdom não calcula geometria. Modelamos apenas visibilidade para isolar foco;
// transbordamento, tamanho físico e zoom são conferidos em navegador separado.
window.HTMLElement.prototype.getClientRects = function () {
  if (!this.isConnected || this.closest('[hidden], [inert]')) return [];
  for (let el = this; el; el = el.parentElement) if (window.getComputedStyle(el).display === 'none') return [];
  const fechado = this.closest('details:not([open])');
  if (fechado && this !== fechado.querySelector('summary') && !fechado.querySelector('summary')?.contains(this)) return [];
  return [{ x: 0, y: 0, width: 100, height: 44 }];
};
window.eval(source);
let checks = 0, failures = 0;
async function test(nome, fn) {
  try { await fn(); checks++; console.log('OK ' + nome); }
  catch (e) { failures++; console.error('FALHOU ' + nome + ': ' + e.message); }
}
function fragment(html) { const el = document.createElement('div'); el.innerHTML = html; return el; }
function tab(shiftKey = false) { document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })); }
function escape() { document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); }

await test('Rótulo e dica apontam para o controle criado, inclusive sem id prévio', () => {
  const f = fragment(window.campo('Data da entrega', window.entrada('data', '', { tipo: 'date' }), 'Data efetiva da entrega'));
  const i = f.querySelector('input'); assert(i.id); assert.equal(f.querySelector('label').htmlFor, i.id);
  assert.equal(f.querySelector('.dica').id, i.getAttribute('aria-describedby'));
});
await test('Id explícito e descrição anterior são preservados', () => {
  const f = fragment(window.campo('Forma', '<select id="forma" aria-describedby="externa"><option>Pix</option></select>', 'Escolha a forma'));
  assert.equal(f.querySelector('label').htmlFor, 'forma');
  assert(f.querySelector('select').getAttribute('aria-describedby').startsWith('externa '));
});
await test('Data-id não é confundido com id do controle', () => {
  const f = fragment(window.campo('Item', '<input data-id="registro" id="">'));
  assert(f.querySelector('input').id); assert.notEqual(f.querySelector('input').id, 'registro');
  assert.equal(f.querySelector('label').htmlFor, f.querySelector('input').id);
});
await test('Itens criados em momentos diferentes não repetem ids', () => {
  const f = fragment([1, 2, 3].map(() => window.campo('Quantidade', window.entrada('qtd', ''))).join(''));
  const ids = [...f.querySelectorAll('input')].map(i => i.id); assert.equal(new Set(ids).size, 3);
  assert([...f.querySelectorAll('input')].every(i => i.labels.length === 1));
});
await test('Urgência conserva rádios nativos e recebe legenda de grupo', () => {
  const f = fragment(window.campo('Urgência', '<div class="opcoes"><label class="opcao"><input type="radio" name="urg" checked>Normal</label><label class="opcao"><input type="radio" name="urg">Urgente</label></div>'));
  assert.equal(f.querySelector('fieldset legend').textContent, 'Urgência');
  assert.equal(f.querySelectorAll('input[type=radio]').length, 2);
  assert(!/\.opcao input\s*\{[^}]*display:\s*none/.test(css));
});
await test('Rótulos e dicas não executam conteúdo recebido', () => {
  const f = fragment(window.campo('<img src=x onerror=alert(1)>', '<input>', '<script>1</script>'));
  assert.equal(f.querySelectorAll('script,img').length, 0);
  assert.equal(f.querySelector('label').textContent, '<img src=x onerror=alert(1)>');
});
await test('HTML legado com dois rótulos associa cada controle correto', () => {
  const f = fragment('<div class="campo"><label>Material</label><select><option>ACM</option></select><label>Descrição</label><input></div>');
  window.associarRotulosUI(f);
  const labels = f.querySelectorAll('label'); assert.equal(labels[0].htmlFor, f.querySelector('select').id); assert.equal(labels[1].htmlFor, f.querySelector('input').id);
});

const origem = document.getElementById('origem'); origem.focus();
let primeiro, segundo;
await test('Modal tem nome, entra com foco e torna fundo inerte em tela móvel', () => {
  primeiro = window.abrirModal({ titulo: 'Registrar recebimento', corpo: window.campo('Nota fiscal', window.entrada('nota', '')) + '<button disabled>Indisponível</button><button hidden>Oculto</button><details><summary>Detalhes</summary><button id="fechado">Dentro de details fechado</button></details>', acoes: [{ texto: 'Cancelar' }, { texto: 'Salvar' }] });
  const dialog = primeiro.querySelector('[role=dialog]'); assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent, 'Registrar recebimento');
  assert(primeiro.contains(document.activeElement)); assert(document.getElementById('app').inert);
});
await test('Tab e Shift+Tab circulam só pelos controles disponíveis no modal', () => {
  const itens = window.focaveisModal(primeiro); assert(!itens.some(el => el.disabled || el.hidden || el.id === 'fechado'));
  itens.at(-1).focus(); tab(); assert.equal(document.activeElement, itens[0]);
  itens[0].focus(); tab(true); assert.equal(document.activeElement, itens.at(-1));
});
await test('Foco programático no fundo é trazido ao diálogo', () => { origem.focus(); assert(primeiro.contains(document.activeElement)); });
await test('Modal empilhado oculta anterior e restaura seu controle de origem', () => {
  const campo = primeiro.querySelector('input'); campo.focus();
  segundo = window.abrirModal({ titulo: 'Confirmar', corpo: 'Conferir', acoes: [{ texto: 'Voltar' }] });
  assert(primeiro.inert); assert.equal(primeiro.style.display, 'none'); assert(segundo.contains(document.activeElement));
  window.fecharEste(segundo); assert.equal(primeiro.inert, false); assert.equal(document.activeElement, campo);
});
await test('Escape fecha e restaura foco e estado inerte original do fundo', () => {
  escape(); assert.equal(document.querySelectorAll('.fundo-modal').length, 0); assert.equal(document.activeElement, origem);
  assert.equal(document.getElementById('app').inert, false); assert.equal(document.getElementById('inativo').inert, true);
});
await test('Fechamento assíncrono de modal inferior não rouba foco do superior', () => {
  origem.focus(); const a = window.abrirModal({ titulo: 'A', corpo: '' }); const b = window.abrirModal({ titulo: 'B', corpo: '' });
  window.fecharEste(a); assert(b.contains(document.activeElement)); window.fecharEste(b); assert.equal(document.activeElement, origem);
});
await test('Modal obrigatório não fecha ao pressionar Escape', () => {
  const f = window.abrirModal({ titulo: 'Aguarde', corpo: '', semFechar: true }); escape(); assert(f.isConnected); window.fecharEste(f);
});
await test('Erro é anunciado, persiste e não se duplica', () => {
  timers.length = 0; window.toast('Fornecedor obrigatório', 'ruim'); window.toast('Fornecedor obrigatório', 'ruim');
  assert.equal(document.querySelectorAll('#toasts .toast.ruim').length, 1); assert.equal(document.querySelector('#toasts [role=alert]').textContent, 'Fornecedor obrigatório');
  assert.equal(timers.length, 0); document.querySelector('#toasts button').click(); assert.equal(document.querySelectorAll('#toasts .toast').length, 0);
});
await test('Erro de modal fica dentro do ciclo de teclado e pode ser dispensado', () => {
  const f = window.abrirModal({ titulo: 'Receber', corpo: '' }); window.toast('Informe a quantidade', 'ruim');
  const b = f.querySelector('.toasts-modal button'); assert(b); assert(window.focaveisModal(f).includes(b)); b.focus(); b.click(); assert(f.contains(document.activeElement)); window.fecharEste(f);
});
await test('Confirmação breve é status; temporizador não remove notificação em foco', () => {
  timers.length = 0; window.toast('Registro salvo', 'bom'); const t = document.querySelector('#toasts .toast.bom');
  assert.equal(t.querySelector('[role=status]').textContent, 'Registro salvo'); t.querySelector('button').focus(); timers[0].fn(); assert(t.isConnected); t.remove();
});
await test('Data permite escolha explícita sem previsão e cancelamento separado', async () => {
  const p = window.perguntarData('Previsão', { pular: 'Confirmar sem previsão' });
  const b = [...document.querySelectorAll('.modal footer button')].find(b => b.textContent === 'Confirmar sem previsão'); b.click(); assert.equal(await p, '');
  const cancelamento = window.perguntarData('Previsão', { pular: 'Confirmar sem previsão' }); escape(); assert.equal(await cancelamento, null);
});
await test('Menu fechado fica inerte e botão anuncia o estado', () => {
  document.getElementById('app').insertAdjacentHTML('beforeend', '<aside class="lateral"><a href="#">Painel</a></aside><button id="btnMenu">Menu</button>');
  window.sincronizarMenuAcessivel(); assert(document.querySelector('.lateral').inert); assert.equal(document.getElementById('btnMenu').getAttribute('aria-expanded'), 'false');
  document.body.classList.add('menu-aberto'); window.sincronizarMenuAcessivel(); assert.equal(document.querySelector('.lateral').inert, false); assert.equal(document.getElementById('btnMenu').getAttribute('aria-expanded'), 'true');
});

function luminancia(hex) { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722; }
function contraste(a, b) { const l = [luminancia(a), luminancia(b)].sort((a, b) => a - b); return (l[1] + .05) / (l[0] + .05); }
function variavel(nome) { return [...css.matchAll(new RegExp('--' + nome + ':\\s*(#[0-9a-f]{6})', 'gi'))].at(-1)[1]; }
await test('Etiquetas e texto secundário alcançam contraste de texto normal', () => {
  assert(contraste(variavel('ambar'), variavel('ambar-claro')) >= 4.5);
  const rascunho = css.match(/\.et-rascunho\s*\{[^}]*background:\s*(#[\da-f]{6});\s*color:\s*(#[\da-f]{6})/i);
  assert(contraste(rascunho[1], rascunho[2]) >= 4.5);
  assert(contraste(variavel('texto-fraco'), variavel('fundo')) >= 4.5);
});
await test('Foco e limite de campo têm contraste suficiente sobre branco', () => {
  assert(contraste(variavel('azul'), '#ffffff') >= 3); assert(contraste(variavel('borda-campo'), '#ffffff') >= 3);
  assert(/:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--azul\)/.test(css));
});
dom.window.close();
console.log(`${checks} verificações de experiência passaram; ${failures} falharam. Geometria/VoiceOver exigem teste em navegador.`);
if (failures) process.exitCode = 1;
