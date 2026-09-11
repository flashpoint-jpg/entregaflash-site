// build: 20260911-LIDER-CIDADE-1
const CACHE='entrega-flash-admin-v20-20260911-lider-cidade';
const TESTE_JS='/admin/teste-motoristas-online.js?v=20260911-lider-cidade-1';
const APP_SHELL=['/admin/admin.html?v=20260911-lider-cidade-1','/admin/index.html?v=20260911-lider-cidade-1','/admin/manifest-admin.json','/admin/icon-admin-192.png','/admin/icon-admin-512.png'];

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

async function injetarTeste(resp){
  try{
    if(!resp) return resp;
    const tipo=String(resp.headers.get('content-type')||'');
    if(!tipo.includes('text/html')) return resp;
    let html=await resp.text();
    if(!html.includes('teste-motoristas-online.js')){
      const tag=`<script src="${TESTE_JS}"></script>`;
      html=html.includes('</body>')?html.replace('</body>',`${tag}</body>`):html+tag;
    }
    const headers=new Headers(resp.headers); headers.delete('content-length');
    return new Response(html,{status:resp.status,statusText:resp.statusText,headers});
  }catch(e){ return resp; }
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  event.respondWith((async()=>{
    try{
      const resp=await fetch(event.request);
      const copy=resp.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
      return await injetarTeste(resp);
    }catch(e){
      const cached=await caches.match(event.request) || await caches.match('./admin.html');
      return cached ? await injetarTeste(cached) : new Response('Offline',{status:503});
    }
  })());
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
