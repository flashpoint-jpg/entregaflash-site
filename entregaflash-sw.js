// build: 20260922-MANUTENCAO-APP-1
// Entrega Flash - Service Worker com atualização forçada + reparo de Push + integração Vendaí
const EF_VERSION = '20260922-MANUTENCAO-APP-1';
const EF_HOME = './manutencao.html?v=' + EF_VERSION;
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
        const principal = u.pathname === '/' || u.pathname.endsWith('/index.html') || u.pathname.endsWith('/entregaflash.html') || u.pathname.endsWith('/manutencao.html');
        if (u.origin === self.location.origin && !u.pathname.startsWith('/admin/') && !u.pathname.startsWith('/lider') && principal) {
          const destino = new URL(EF_HOME, self.registration.scope);
          if (u.searchParams.get('ef_native') === '1') destino.searchParams.set('ef_native','1');
          const vc = u.searchParams.get('ef_app_version');
          const vn = u.searchParams.get('ef_app_version_name');
          if (vc) destino.searchParams.set('ef_app_version', vc);
          if (vn) destino.searchParams.set('ef_app_version_name', vn);
          await cliente.navigate(destino.href);
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

    if (url.pathname.startsWith('/admin/') || url.pathname.startsWith('/lider')) return;

    if (
      url.pathname === '/' ||
      url.pathname.endsWith('/index.html') ||
      url.pathname.endsWith('/entregaflash.html') ||
      url.pathname.endsWith('/manutencao.html')
    ) {
      const destino = new URL(EF_HOME, self.registration.scope);
      if (url.searchParams.get('ef_native') === '1') destino.searchParams.set('ef_native','1');
      const vc = url.searchParams.get('ef_app_version');
      const vn = url.searchParams.get('ef_app_version_name');
      if (vc) destino.searchParams.set('ef_app_version', vc);
      if (vn) destino.searchParams.set('ef_app_version_name', vn);

      event.respondWith(
        fetch(destino.href, { cache:'no-store', credentials:'include', redirect:'follow' })
          .catch(() => Response.redirect(destino.href, 302))
      );
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