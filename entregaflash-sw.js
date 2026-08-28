// Entrega Flash - Service Worker com atualização automática
// Versão: 20260828-1
const EF_VERSION = '20260828-1';
const EF_HOME = './index.html?v=' + EF_VERSION;

self.addEventListener('install', (event) => {
  // Não deixa a versão nova parada em "waiting".
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Remove qualquer cache antigo criado por versões anteriores do app.
    try {
      const nomes = await caches.keys();
      await Promise.all(nomes.map((nome) => caches.delete(nome)));
    } catch (e) {}

    // Assume imediatamente as abas/apps já abertos.
    await self.clients.claim();

    // Quem ainda estiver na URL antiga é levado para o index atual.
    const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const cliente of clientes) {
      try {
        const u = new URL(cliente.url);
        if (u.pathname.endsWith('/entregaflash.html')) {
          await cliente.navigate(new URL(EF_HOME, self.registration.scope).href);
        }
      } catch (e) {}
    }
  })());
});

function normalizarUrl(url) {
  try {
    if (!url) return EF_HOME;
    const texto = String(url);
    if (texto.includes('entregaflash.html')) return EF_HOME;
    return texto;
  } catch (e) {
    return EF_HOME;
  }
}

// Corrige inclusive instalações antigas cujo atalho ainda tenta abrir entregaflash.html.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  try {
    const url = new URL(event.request.url);
    if (url.pathname.endsWith('/entregaflash.html')) {
      event.respondWith(Response.redirect(new URL(EF_HOME, self.registration.scope).href, 302));
    }
  } catch (e) {}
});

// Push em segundo plano.
self.addEventListener('push', (event) => {
  let dados = { title: 'Entrega Flash', body: '', url: EF_HOME };
  try {
    if (event.data) dados = { ...dados, ...event.data.json() };
  } catch (e) {
    if (event.data) dados.body = event.data.text();
  }

  const opcoes = {
    body: dados.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [120, 60, 120],
    data: { url: normalizarUrl(dados.url) },
    tag: dados.tag || undefined,
    renotify: !!dados.tag
  };

  event.waitUntil(self.registration.showNotification(dados.title || 'Entrega Flash', opcoes));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlAlvo = normalizarUrl(event.notification.data && event.notification.data.url);

  event.waitUntil((async () => {
    const listaClientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const cliente of listaClientes) {
      if ('navigate' in cliente) {
        try { await cliente.navigate(new URL(urlAlvo, self.registration.scope).href); } catch (e) {}
      }
      if ('focus' in cliente) return cliente.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(urlAlvo);
  })());
});
