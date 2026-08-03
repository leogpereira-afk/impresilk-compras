/* Seletor que aponta para atributo que ninguém gera.

   Foi assim que "Buscar O.S." — a integração com o Mubisys, carro-chefe do
   sistema — nunca funcionou: o campo é montado por entrada(), que emite
   data-campo, e o código procurava [name="osNumero"]. querySelector devolve
   null em silêncio, o número digitado ia para o lixo e a tela dizia "Digite o
   número da O.S." com o número na frente da pessoa. Mesma coisa no link do
   treinamento (name="link", e lerCampos só lê [data-campo]) e nos itens
   copiados da O.S. (as linhas usam data-i).

   node --check não vê nada disso: é sintaxe válida que encontra nada.

   Rádio e caixa de seleção usam name de verdade (é assim que o navegador
   agrupa) e são lidos por input[name=x]:checked — esses NÃO entram. */
import { readFileSync, readdirSync } from 'node:fs';

const arquivos = readdirSync('.').filter((f) => f.endsWith('.js'));
const fonte = arquivos.map((f) => readFileSync(f, 'utf8')).join('\n');
const linhasDe = (f) => readFileSync(f, 'utf8').split('\n');

// Toda chave criada pelos helpers: entrada('x'), areaTexto('x'), seletor('x').
const chavesHelper = new Set(
  [...fonte.matchAll(/(?:entrada|areaTexto|seletor)\(\s*'([a-zA-Z][\w.]*)'/g)].map((m) => m[1])
);
// Grupos de rádio/caixa escritos à mão: name legítimo.
const nomesDeGrupo = new Set(
  [...fonte.matchAll(/<input[^>]*type="(?:radio|checkbox)"[^>]*\sname="([^"]+)"/g)].map((m) => m[1])
);
const chavesItem = new Set(
  [...fonte.matchAll(/data-i="([^"]+)"/g)].map((m) => m[1])
);

const problemas = [];
for (const f of arquivos) {
  linhasDe(f).forEach((linha, i) => {
    const onde = `${f}:${i + 1}`;

    // 1. querySelector por [name="x"] quando x é campo de helper (que emite data-campo)
    for (const m of linha.matchAll(/\[name=["']?([\w.]+)["']?\]/g)) {
      const chave = m[1];
      if (nomesDeGrupo.has(chave)) continue;                 // rádio/caixa: name é real
      if (chavesHelper.has(chave)) problemas.push(`${onde}  busca [name="${chave}"], mas entrada()/seletor()/areaTexto() emitem data-campo`);
      else if (chavesItem.has(chave)) problemas.push(`${onde}  busca [name="${chave}"], mas a linha de item usa data-i`);
      else problemas.push(`${onde}  busca [name="${chave}"] e nada no app emite name="${chave}"`);
    }

    // 2. querySelector por [data-campo="x"] numa chave que é de linha de item
    for (const m of linha.matchAll(/\[data-campo=["']?([\w.]+)["']?\]/g)) {
      if (chavesItem.has(m[1]) && !chavesHelper.has(m[1]))
        problemas.push(`${onde}  busca [data-campo="${m[1]}"], mas a linha de item usa data-i`);
    }

    // 3. campo de texto escrito à mão com name= e sem data-campo, dentro de um
    //    formulário lido por lerCampos() — o valor chega sempre undefined
    const m3 = linha.match(/<(?:input|textarea|select)(?![^>]*type="(?:radio|checkbox)")[^>]*\sname="([^"]+)"/);
    if (m3 && !/data-campo=/.test(linha)) problemas.push(`${onde}  campo "${m3[1]}" com name= e sem data-campo — lerCampos() não lê`);
  });
}

problemas.forEach((p) => console.log('  RUIM  ' + p));
console.log(problemas.length ? `\n${problemas.length} seletor(es) que não encontram nada`
                             : 'nenhum seletor apontando para atributo inexistente');
process.exit(problemas.length ? 1 : 0);
