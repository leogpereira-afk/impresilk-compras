/* Todo alvo de navegação tem que ter uma tela do outro lado.
   Existe porque renomear TELAS.documentos para TELAS.manuais deixou um
   data-ir="documentos" para trás: o roteador não achava a tela e devolvia a
   pessoa ao painel EM SILÊNCIO — nenhum erro no console, nada quebrado à
   vista, só um card do painel que não abria nada. `node --check` não vê isso. */
import { readFileSync, readdirSync } from 'node:fs';

const arquivos = readdirSync('.').filter((f) => f.endsWith('.js'));
const fonte = arquivos.map((f) => readFileSync(f, 'utf8')).join('\n');

const telas = new Set([...fonte.matchAll(/^TELAS\.([a-zA-Z]+)\s*=/gm)].map((m) => m[1]));
const publicas = new Set(
  (fonte.match(/const PUBLICAS = \[([^\]]*)\]/) || [, ''])[1]
    .split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean)
);

const alvos = new Map();   // rota -> como foi escrita
const anota = (re, rotulo) => {
  for (const m of fonte.matchAll(re)) {
    if (!alvos.has(m[1])) alvos.set(m[1], rotulo + ' ' + JSON.stringify(m[0].slice(0, 40)));
  }
};
anota(/data-ir="([a-zA-Z]+)"/g, 'data-ir');
anota(/irPara\('([a-zA-Z]+)/g, 'irPara');
anota(/href="#\/([a-zA-Z]+)/g, 'href');

const orfaos = [...alvos].filter(([r]) => !telas.has(r) && !publicas.has(r));

// E o contrário: rota no menu sem tela é botão que não abre nada.
const menu = [...fonte.matchAll(/\{\s*rota:\s*'([a-zA-Z]+)'/g)].map((m) => m[1]);
const menuOrfao = menu.filter((r) => !telas.has(r));

console.log(`telas: ${[...telas].sort().join(', ')}`);
console.log(`públicas: ${[...publicas].sort().join(', ')}`);
console.log(`alvos de navegação: ${[...alvos.keys()].sort().join(', ')}`);

let mau = 0;
for (const [r, onde] of orfaos) { console.log(`  RUIM  "${r}" é alvo de navegação mas não existe TELAS.${r} nem é rota pública  (${onde})`); mau++; }
for (const r of menuOrfao) { console.log(`  RUIM  o menu aponta para "${r}" e não existe TELAS.${r}`); mau++; }
console.log(mau ? `\n${mau} rota(s) morta(s)` : '\nnenhuma rota morta');
process.exit(mau ? 1 : 0);
