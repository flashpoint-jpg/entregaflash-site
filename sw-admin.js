const CACHE='entrega-flash-admin-v1';
const ASSETS=['./admin.html','./manifest-admin.json','./icon-admin-192.png','./icon-admin-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{})));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{}); return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./admin.html'))));
});
