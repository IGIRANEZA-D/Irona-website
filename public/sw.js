const SHELL_CACHE = 'irona-application-shell-v11';
const DATA_CACHE = 'irona-public-opportunities-v3';
const SHELL_FILES = ['/apply.html', '/opportunity.html', '/careers.html', '/programs.html', '/styles.css', '/app.js', '/assets/irona-logo.png', '/assets/blue-celebrating-15-years-impact.png', '/assets/friendly-irona-robot-mascot.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith('irona-application-') || key.startsWith('irona-public-opportunities-')) && ![SHELL_CACHE, DATA_CACHE].includes(key)).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (/^\/api\/public-(vacancies|programs)(\/[^/]+)?$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) { try { await cache.put(request, response.clone()); } catch { /* A full browser cache must not block the live response. */ } }
        return response;
      } catch {
        const saved = await cache.match(request);
        return saved || Response.json({ error: 'Opportunity details are not available offline yet.' }, { status: 503 });
      }
    })());
    return;
  }

  if (SHELL_FILES.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const saved = await cache.match(url.pathname);
      const update = fetch(request).then(response => {
        if (response.ok) cache.put(url.pathname, response.clone()).catch(() => {});
        return response;
      });
      if (saved) { event.waitUntil(update.catch(() => {})); return saved; }
      try { return await update; }
      catch { return new Response('This page is not available offline yet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
    })());
  }
});
