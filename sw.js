/* Tentaplugg — offline cache for the whole site.
   The app files are cached on install and served cache-first, so the site opens
   instantly and works offline. Course files are fetched network-first, so a
   course uploaded to the courses folder shows up straight away, with the cached
   copy used when there is no signal. CACHE changes with the content, so a new
   upload replaces the old cache. */
const CACHE = 'tp-0db3daa6f0';
const ASSETS = [
  "./",
  "index.html",
  "idsv.html",
  "course.html",
  "app/core.js",
  "app/style.css",
  "app/library.js",
  "app/library-db.js",
  "app/course.js",
  "questions.js",
  "context.js",
  "flashcards.js",
  "python.js",
  "compendium.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "favicon.ico",
  "fig/fig01-dark.png",
  "fig/fig01-light.png",
  "fig/fig02-dark.png",
  "fig/fig02-light.png",
  "fig/fig03-dark.png",
  "fig/fig03-light.png",
  "fig/fig04-dark.png",
  "fig/fig04-light.png",
  "fig/fig05-dark.png",
  "fig/fig05-light.png",
  "fig/fig06-dark.png",
  "fig/fig06-light.png",
  "fig/fig07-dark.png",
  "fig/fig07-light.png",
  "fig/fig08-dark.png",
  "fig/fig08-light.png",
  "fig/fig09-dark.png",
  "fig/fig09-light.png",
  "fig/fig13-dark.png",
  "fig/fig13-light.png",
  "fig/fig14-dark.png",
  "fig/fig14-light.png",
  "fig/fig15-dark.png",
  "fig/fig15-light.png",
  "fig/fig16-dark.png",
  "fig/fig16-light.png",
  "fig/fig18-dark.png",
  "fig/fig18-light.png",
  "fig/fig19-dark.png",
  "fig/fig19-light.png",
  "fig/fig20-dark.png",
  "fig/fig20-light.png",
  "fig/fig22-dark.png",
  "fig/fig22-light.png",
  "fig/fig23-dark.png",
  "fig/fig23-light.png",
  "fig/fig24-dark.png",
  "fig/fig24-light.png",
  "fig/fig25-dark.png",
  "fig/fig25-light.png",
  "fig/fig26-dark.png",
  "fig/fig26-light.png"
];

self.addEventListener('install', e => {
  // bypass the browser's HTTP cache, so a fresh upload never gets cached with yesterday's files
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // remove this site's older caches, including the one from the IDSV-only version
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE && (k.startsWith('tp-') || k.startsWith('idsv-'))).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            /* fonts and the GitHub listing go to the network */
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;   /* another site on the same github.io address */
  const put = res => { if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
  if (/\/courses\/[^/]+\.json$/.test(url.pathname)) {
    e.respondWith(fetch(req).then(put).catch(() => caches.match(req)));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(put).catch(() =>
      req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});
