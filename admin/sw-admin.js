const CACHE='entrega-flash-admin-v5-20260829-mobilefix';
const APP_SHELL=['/admin/admin.html?v=20260829-mobilefix-1','/admin/manifest-admin.json','/admin/icon-admin-192.png','/admin/icon-admin-512.png'];
self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).catch(()=>{}));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('entrega-flash-admin-')&&k!==CACHE).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  event.respondWith(fetch(event.request).then(resp=>{
    const copy=resp.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
    return resp;
  }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./admin.html'))));
});
self.addEventListener('push',event=>{
  let data={};
  try{ data=event.data?event.data.json():{}; }catch(e){ data={body:event.data?event.data.text():''}; }
  event.waitUntil(self.registration.showNotification(data.title||'Entrega Flash Admin',{
    body:data.body||'Você tem uma nova atualização.',
    icon:'./icon-admin-192.png', badge:'./icon-admin-192.png',
    data:{url:data.url||'./admin.html'}, vibrate:[120,60,120]
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=(event.notification.data&&event.notification.data.url)||'./admin.html';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){ if('focus' in client) { client.navigate(target); return client.focus(); } }
    if(clients.openWindow) return clients.openWindow(target);
  }));
});
