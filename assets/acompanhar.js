(() => {
  const endpoint='https://rgcclordmqjmwuzrrfbd.supabase.co/functions/v1/empresas-portal';
  const key=location.hash.slice(1),el=id=>document.getElementById(id);
  const names={aguardando_pagamento:'Aguardando confirmação',buscando:'Procurando um entregador',indo_coletar:'Entregador a caminho da retirada',coletado:'Pedido retirado',a_caminho:'Sua entrega está a caminho',entregue:'Entrega concluída',cancelado:'Entrega cancelada'};
  let map,marker,destination,busy=false,timer,finished=false;
  async function refresh(){
    if(busy||document.hidden)return;busy=true;el('atualizar').disabled=true;
    const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),12000);
    try{
      if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Abra o link completo enviado por quem solicitou a entrega.');
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao:'rastrear',chave:key}),signal:controller.signal});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível consultar a entrega.');
      const p=data.pedido;el('status').textContent=names[p.status]||'Acompanhando sua entrega';el('mensagem').className='';
      el('mensagem').textContent=p.status==='entregue'?'O recebimento foi registrado.':p.status==='cancelado'?'Fale com quem solicitou para combinar os próximos passos.':p.agendado&&p.status==='buscando'?'Retirada agendada para '+new Date(p.agendado).toLocaleString('pt-BR')+'.':'Esta página atualiza automaticamente enquanto a entrega está em andamento.';
      el('detalhes').hidden=false;el('destino').textContent=p.destino;el('condutor').textContent=p.motorista||'Aguardando aceite';el('pedido-id').textContent=p.id;
      let stops=[];try{stops=Array.isArray(p.paradas)?p.paradas:JSON.parse(p.paradas||'[]');}catch{}
      el('paradas').textContent=stops.length?`Entrega com ${stops.length+1} destinos. Etapa atual: ${Math.min(stops.length+1,Number(p.paradaAtual||0)+1)}.`:'';
      el('atualizacao').textContent='Consulta realizada às '+new Date().toLocaleTimeString('pt-BR')+'.';
      finished=['entregue','cancelado'].includes(p.status);
      const gps=p.lat!=null&&p.lng!=null&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng));
      el('mapa-card').hidden=finished;
      if(!finished&&window.L){
        if(!map){map=L.map('mapa',{scrollWheelZoom:false}).setView([-14.2,-51.9],4);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(map);}
        if(gps){const point=[p.lat,p.lng];if(!marker)marker=L.circleMarker(point,{radius:10,color:'#ff9f24',fillColor:'#ff9f24',fillOpacity:1}).bindTooltip('Entregador').addTo(map);else marker.setLatLng(point);map.setView(point,14);}
        else if(marker){map.removeLayer(marker);marker=null;}
        if(p.destinoLat!=null&&p.destinoLng!=null&&!destination){destination=L.circleMarker([p.destinoLat,p.destinoLng],{radius:8,color:'#60b4ff'}).bindTooltip('Destino').addTo(map);if(!gps)map.setView([p.destinoLat,p.destinoLng],13);}
        map.invalidateSize();el('gps-info').textContent=gps?'Localização recebida às '+new Date(p.localizacaoAtualizadaEm).toLocaleTimeString('pt-BR')+'.':'Aguardando uma localização recente do entregador. O status acima continua disponível.';
      }else if(!finished){el('mapa-card').hidden=true;}
    }catch(e){el('mensagem').className='error';el('mensagem').textContent=e.name==='AbortError'?'A conexão demorou. Toque em atualizar para tentar novamente.':e.message;el('status').textContent='Acompanhamento indisponível';el('mapa-card').hidden=true;el('detalhes').hidden=true;}
    finally{clearTimeout(deadline);busy=false;el('atualizar').disabled=false;clearTimeout(timer);if(!finished)timer=setTimeout(refresh,15000);}
  }
  el('atualizar').addEventListener('click',refresh);document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)refresh();});refresh();
})();
