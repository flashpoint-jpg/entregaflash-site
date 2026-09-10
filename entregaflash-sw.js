// build: 20260910-CANCELA-TROCA-ONLINE-1
// Entrega Flash - Service Worker com atualização forçada + reparo de Push + despacho progressivo global
const EF_VERSION = '20260910-CANCELA-TROCA-ONLINE-1';
const EF_HOME = './index.html?v=' + EF_VERSION;
const EF_PUSH_REPAIR = '/push-repair.js?v=' + EF_VERSION;
const EF_PUSH_RAIO = '/push-despacho-raio.js?v=' + EF_VERSION;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const nomes = await caches.keys();
      await Promise.all(nomes.map((nome) => caches.delete(nome)));
    } catch (e) {}

    await self.clients.claim();

    const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const cliente of clientes) {
      try {
        const u = new URL(cliente.url);
        if (u.origin === self.location.origin && !u.pathname.startsWith('/admin/')) {
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

async function injetarScripts(resp) {
  try {
    if (!resp || !resp.ok) return resp;
    const tipo = String(resp.headers.get('content-type') || '');
    if (!tipo.includes('text/html')) return resp;

    let html = await resp.text();
    let tags = '';

    if (!html.includes('push-repair.js')) {
      tags += `<script src="${EF_PUSH_REPAIR}"></script>`;
    }
    if (!html.includes('push-despacho-raio.js')) {
      tags += `<script src="${EF_PUSH_RAIO}"></script>`;
    }

    if (tags) {
      html = html.includes('</body>')
        ? html.replace('</body>', `${tags}</body>`)
        : html + tags;
    }

    const headers = new Headers(resp.headers);
    headers.delete('content-length');
    return new Response(html, { status: resp.status, statusText: resp.statusText, headers });
  } catch (_) {
    return resp;
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  try {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/admin/')) return;

    if (url.pathname.endsWith('/entregaflash.html')) {
      event.respondWith(Response.redirect(new URL(EF_HOME, self.registration.scope).href, 302));
      return;
    }

    if (url.pathname === '/' || url.pathname.endsWith('/index.html')) {
      event.respondWith(fetch(event.request).then(injetarScripts));
    }
  } catch (e) {}
});

self.addEventListener('push', (event) => {
  let dados = { title: 'Entrega Flash', body: '', url: EF_HOME };
  try {
    if (event.data) dados = { ...dados, ...event.data.json() };
  } catch (e) {
    if (event.data) dados.body = event.data.text();
  }

  const opcoes = {
    body: dados.body || '',
    icon: 'icon-192-modern.png',
    badge: 'icon-192-modern.png',
    vibrate: [120, 60, 120],
    data: { url: normalizarUrl(dados.url) },
    tag: dados.tag || undefined,
    renotify: !!dados.tag
  };

  const titulo = String(dados.title || 'Entrega Flash').includes('Entrega Flash')
    ? String(dados.title || 'Entrega Flash')
    : `Entrega Flash · ${dados.title || 'Aviso'}`;

  event.waitUntil(self.registration.showNotification(titulo, opcoes));
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
