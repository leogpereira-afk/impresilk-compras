/* Service worker — deixa o app abrir sem internet (a obra costuma ter sinal ruim).
   Regra do kit: SUBIR o número do CACHE a cada publicação, senão o navegador
   continua servindo o arquivo velho. */
const CACHE = 'compras-shell-v15';
const ARQUIVOS = [
  './', './index.html', './styles.css', './config.js', './store.js', './ui.js',
  './pdf.js', './qualificacao.js', './compras.js', './acervo.js', './cotacao.js', './app.js',
  './libs/jspdf.umd.min.js', './auth.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'
];

// cache:'reload' na instalação: sem isto o SW guarda o que estava no cache
// HTTP do navegador (o Pages manda max-age=600) e passa a servir a versão
// velha até o próximo bump — a equipe não recebe a correção recém-publicada.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Nunca cachear a API: o dado tem que ser o do momento (offline é a fila do
  // store.js que resolve). O backend é o Supabase.
  //
  // A regra do Netlify saiu em 04/08/2026: os sites do Netlify foram apagados
  // e este app passou a morar no GitHub Pages, então o caminho
  // /.netlify/functions/ não existe mais em lugar nenhum. Linha morta em
  // arquivo de cache confunde: dá a impressão de que ainda há um backend lá.
  if (url.hostname.endsWith('supabase.co')) return;
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then((achou) => achou || fetch(e.request).then((r) => {
      if (r.ok && url.origin === location.origin) {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
      }
      return r;
    }).catch(() => caches.match('./index.html')))
  );
});
