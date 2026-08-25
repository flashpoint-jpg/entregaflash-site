// Service Worker do Entrega Flash
// Cuida de: (1) receber notificações push mesmo com o app fechado,
// (2) abrir/focar o app quando a pessoa toca na notificação.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Recebe a notificação push enviada pela Edge Function "enviar-push"
// (payload: { title, body, url }) e mostra na bandeja do sistema,
// mesmo que o navegador/app esteja fechado.
self.addEventListener('push', (event) => {
  let dados = { title: 'Entrega Flash', body: '', url: '/entregaflash.html' };
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
    data: { url: dados.url || '/entregaflash.html' },
    tag: dados.tag || undefined,
    renotify: !!dados.tag
  };

  event.waitUntil(self.registration.showNotification(dados.title || 'Entrega Flash', opcoes));
});

// Ao tocar na notificação: foca uma aba já aberta do app, ou abre uma nova.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlAlvo = (event.notification.data && event.notification.data.url) || '/entregaflash.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((listaClientes) => {
      for (const cliente of listaClientes) {
        if (cliente.url.includes('entregaflash.html') && 'focus' in cliente) {
          return cliente.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlAlvo);
      }
    })
  );
});
