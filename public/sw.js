// Service worker mínimo: faz a app abrir sem rede (casca da aplicação em cache).
// Não mexe em pedidos a outros domínios (Microsoft Graph, login), só no próprio site.
// Ao publicar uma versão nova, mude CACHE para limpar a cache antiga.
const CACHE = 'inspecoes-shell-v1';
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

// Guarda a casca da app e os ficheiros JS/CSS que a página referencia (têm hash no nome em cada versão),
// para que a app abra offline logo depois da instalação.
async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);
  const page = await cache.match('./');
  if (!page) return;
  const html = await page.text();
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(
    (m) => new URL(m[1], self.location.href).href,
  );
  await Promise.all([...new Set(assets)].map((url) => cache.add(url).catch(() => undefined)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Páginas: tenta a rede primeiro; sem rede, usa a última versão guardada.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }

  // Restantes ficheiros (JS/CSS com hash no nome, ícones): cache primeiro.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
