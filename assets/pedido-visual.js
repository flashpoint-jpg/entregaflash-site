/* Acompanhamento do cliente. Usa os dados e as ações existentes do pedido. */
function efEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function efArg(v){return efEsc(JSON.stringify(String(v??'')));}
function efIcone(tipo){
  const paths={voltar:'<path d="m15 18-6-6 6-6"/>',mais:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',chat:'<path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z"/><path d="M7 9h8M7 13h5"/>',telefone:'<path d="m7 3 3 5-3 3a16 16 0 0 0 6 6l3-3 5 3c-1 5-5 5-9 3C7 17 3 13 3 7c0-2 2-4 4-4Z"/>',pacote:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9M7 5.8l9 5v5"/>',compartilhar:'<path d="M12 15V2m-4 4 4-4 4 4M5 11H3v10h18V11h-2"/>',mapa:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',chevron:'<path d="m6 9 6 6 6-6"/>',alvo:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',escudo:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',pino:'<path d="M19 9c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2"/>',relogio:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',check:'<path d="m5 12 4 4L19 6"/>',pessoa:'<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',veiculo:'<path d="M3 16V6h11v10m0-7h4l3 4v3h-3M3 16H2m5 0h7"/><circle cx="5" cy="17" r="2"/><circle cx="16" cy="17" r="2"/>'};
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[tipo]||paths.pacote}</svg>`;
}
function efPedidoEmFoco(){
  if(estado.modo!=='cliente'||!estado.cliente?.logado||estado.parceiro?.aberto||estado.telaBoasVindas||estado.resetSenha?.aberto)return null;
  return (estado.pedidos||[]).find(p=>p.id===estado.pedidoBuscandoId&&p.clienteTelefone===estado.cliente.telefone)||null;
}
function efAbrirDetalhe(id){
  const p=(estado.pedidos||[]).find(x=>x.id===id&&x.clienteTelefone===estado.cliente.telefone);if(!p)return;
  estado.modo='cliente';estado.telaBoasVindas=false;estado.parceiro.aberto=false;estado.pedidoBuscandoId=id;estado.detalheMapaOculto=false;estado.detalheMenu=false;render();window.scrollTo(0,0);
}
function efResumoAcompanhamentoHTML(p){
  return `<article class="pedido ef-resumo-acompanhamento" id="pedido-${efEsc(p.id)}"><div class="linha-topo"><div class="end"><b>${efEsc(efStatusPedido(p))}</b><p>${efEsc(p.origem)}</p><p>→ ${efEsc(p.destino)}${p.paradas?.length?' · +'+p.paradas.length+' parada(s)':''}</p></div><div class="preco">${Number(p.preco||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div></div>${p.motoristaNome?`<p class="subtitulo">Motorista: ${efEsc(p.motoristaNome)}</p>`:''}<button type="button" class="btn btn-primario" onclick="efAbrirDetalhe(${efArg(p.id)})">${efIcone('mapa')} Acompanhar pedido</button></article>`;
}
function efFecharDetalhe(){
  const p=efPedidoEmFoco();estado.pedidoBuscandoId=null;estado.detalheMenu=false;estado.abaPedidosCliente=p&&['entregue','cancelado'].includes(p.status)?'historico':'ativos';render();
  document.getElementById(p?'pedido-'+p.id:'')?.scrollIntoView({block:'start'});
}
function efAlternarMapa(){
  estado.detalheMapaOculto=!estado.detalheMapaOculto;render();
  requestAnimationFrame(()=>{
    const alvo=estado.detalheMapaOculto?document.querySelector('.ef-motorista-card'):document.getElementById('ef-mapa-painel');
    alvo?.scrollIntoView({block:'start',behavior:'auto'});
  });
}
function efStatusPedido(p){
  if(p.status==='indo_coletar'&&p.chegadaColetaEm)return 'Motorista no local de retirada';
  return {buscando:'Buscando motorista parceiro',indo_coletar:'Motorista a caminho da retirada',coletado:'Pedido retirado',a_caminho:'Sua entrega está a caminho',entregue:'Entrega concluída',cancelado:'Entrega cancelada',aguardando_pagamento:'Aguardando pagamento'}[p.status]||'Acompanhe sua entrega';
}
function efCoordenada(c){return !!c&&c.lat!==null&&c.lon!==null&&c.lat!==''&&c.lon!==''&&Number.isFinite(Number(c.lat))&&Number.isFinite(Number(c.lon))&&Math.abs(Number(c.lat))<=90&&Math.abs(Number(c.lon))<=180;}
function efGpsRecente(p,agora=Date.now()){
  const idade=agora-Number(p.motoristaAtualizadoEm||0);
  return ['indo_coletar','coletado','a_caminho'].includes(p.status)&&efCoordenada(p.motoristaCoord)&&Number(p.motoristaAtualizadoEm)>0&&idade>=-30000&&idade<=180000;
}
function efEtapasPedido(p){
  const destinos=[{endereco:p.destino,coord:p.destinoCoord},...(p.paradas||[]).map((endereco,i)=>({endereco,coord:(p.paradasCoords||[])[i]}))];
  const retirado=['coletado','a_caminho','entregue'].includes(p.status),final=p.status==='entregue';
  return [{endereco:p.origem,coord:p.origemCoord,label:'Retirada',feito:retirado,atual:!retirado&&p.status!=='cancelado'},...destinos.map((d,i)=>({...d,label:destinos.length===1?'Entrega':`Entrega ${i+1}`,feito:final||retirado&&i<Number(p.paradaAtual||0),atual:!final&&retirado&&i===Number(p.paradaAtual||0)}))];
}
function efAlvoPedido(p){const e=efEtapasPedido(p);return (p.status==='indo_coletar'?e[0]:e.slice(1)[Number(p.paradaAtual||0)])?.coord||null;}
function efEstimativaPedido(p){
  const alvo=efAlvoPedido(p);if(!efGpsRecente(p)||!efCoordenada(alvo))return null;
  const rad=x=>x*Math.PI/180,a=p.motoristaCoord;
  const h=Math.sin(rad(alvo.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(alvo.lat))*Math.sin(rad(alvo.lon-a.lon)/2)**2;
  const km=6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  return {min:Math.max(1,Math.round(km/Number(VEICULOS[p.veiculo]?.veloc||25)*60)),label:p.status==='indo_coletar'?'até a retirada':'até a próxima entrega'};
}
function efDataPedido(p){
  const d=new Date(p.horarioAgendado||p.criadoEm);if(!Number.isFinite(d.getTime()))return '';
  return (d.toDateString()===new Date().toDateString()?'Hoje':d.toLocaleDateString('pt-BR'))+', '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
function efImagemSegura(url){return /^(https:\/\/|\/(?!\/))/.test(String(url||''))?String(url):'';}
function efMotoristaHTML(p){
  const encontrado=!!p.motoristaNome&&!['buscando','aguardando_pagamento','cancelado'].includes(p.status),foto=efImagemSegura(p.motoristaFotoUrl);
  const ativo=['indo_coletar','coletado','a_caminho'].includes(p.status),tel=String(p.motoristaTelefone||'').replace(/\D/g,'');
  const avaliacao=Number(p.motoristaTotalAvaliacoes)>0&&Number(p.motoristaNotaMedia)>0?Number(p.motoristaNotaMedia).toLocaleString('pt-BR',{maximumFractionDigits:2}):null;
  if(!encontrado)return `<section class="ef-track-card ef-procurando"><span class="ef-busca-sinal">${efIcone('veiculo')}</span><div><h2>${p.status==='cancelado'?'Pedido cancelado':p.status==='aguardando_pagamento'?'Aguardando confirmação':'Procurando seu motorista'}</h2><p>${p.status==='cancelado'?'Consulte os detalhes abaixo.':p.tipoRetirada==='agendado'?'Sua retirada está agendada. Os dados aparecem após o aceite.':'Assim que alguém aceitar, os dados e os botões de contato aparecerão aqui.'}</p></div></section>`;
  return `<section class="ef-track-card ef-motorista-card" aria-label="Dados do motorista">
    ${ativo?`<button class="ef-mapa-alternar" type="button" onclick="efAlternarMapa()" aria-expanded="${!estado.detalheMapaOculto}" aria-controls="ef-mapa-painel"><span>${estado.detalheMapaOculto?'Mostrar mapa':'Recolher mapa'}</span>${efIcone('chevron')}</button>`:''}
    <div class="ef-motorista-identidade"><div class="ef-motorista-texto"><span class="ef-overline">SEU MOTORISTA PARCEIRO</span><h2>${efEsc(p.motoristaNome)}</h2><div class="ef-veiculo-dados">${p.motoristaPlaca?`<strong class="ef-placa">${efEsc(p.motoristaPlaca)}</strong>`:''}<span>${efEsc(VEICULOS[p.motoristaVeiculoTipo||p.veiculo]?.label||p.motoristaVeiculoTipo||'Veículo')}</span></div>${p.motoristaMarca||p.motoristaCor?`<p class="ef-veiculo-modelo">${efEsc([p.motoristaMarca,p.motoristaCor].filter(Boolean).join(' · '))}</p>`:''}</div>
    <div class="ef-motorista-retrato">${foto?`<img src="${efEsc(foto)}" alt="Foto do motorista" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="ef-avatar" hidden>${efIcone('pessoa')}</span>`:`<span class="ef-avatar">${efIcone('pessoa')}</span>`}${avaliacao?`<span class="ef-nota" aria-label="Nota ${avaliacao} em ${Number(p.motoristaTotalAvaliacoes)} avaliações"><span aria-hidden="true">★</span> ${avaliacao}</span>`:'<span class="ef-sem-nota">Sem avaliações</span>'}</div></div>
    <p class="ef-conferir">${efIcone('escudo')} Confira nome, foto e placa antes da retirada.</p>
    ${ativo?`<div class="ef-contatos"><button type="button" onclick="abrirChat(${efArg(p.id)})">${efIcone('chat')}Chat${estado.chatNaoLidas?.[p.id]?`<span class="ef-nao-lidas">${Number(estado.chatNaoLidas[p.id])}</span>`:''}</button>${tel.length>=10&&tel.length<=13?`<a href="tel:${tel}">${efIcone('telefone')}Ligar</a>`:'<span class="ef-contato-indisponivel">Telefone indisponível</span>'}</div>`:''}
  </section>`;
}
function efTrajetoHTML(p){
  const etapas=efEtapasPedido(p);
  return `<section class="ef-track-card ef-trajeto-card"><div class="ef-card-titulo">${efIcone('pacote')}<h2>Entrega <span>· ${efEsc(VEICULOS[p.veiculo]?.label||'Veículo')}</span></h2>${podeEditar(p)?`<button type="button" onclick="abrirEdicaoPedido(${efArg(p.id)})">Editar</button>`:''}</div><ol class="ef-trajeto">${etapas.map((e,i)=>`<li class="${e.feito?'ef-etapa-feita':''} ${e.atual?'ef-etapa-atual':''}"><span class="ef-etapa-ponto">${e.feito?efIcone('check'):i===etapas.length-1?efIcone('pino'):'<i></i>'}</span><div><span class="ef-etapa-legenda">${efEsc(e.label)}${e.feito?' · concluída':e.atual&&p.status==='a_caminho'?' · em andamento':''}</span><h3>${efEsc(e.endereco||'Endereço não informado')}</h3>${i===0?`<time>${efEsc(efDataPedido(p))}${p.tipoRetirada==='agendado'?' · agendada':''}</time>`:''}${i===0&&(p.origemReferencia||p.origemComplemento)?`<p>${efEsc([p.origemComplemento,p.origemReferencia].filter(Boolean).join(' · '))}</p>`:''}${i===1&&(p.destinoReferencia||p.destinoComplemento)?`<p>${efEsc([p.destinoComplemento,p.destinoReferencia].filter(Boolean).join(' · '))}</p>`:''}</div></li>`).join('')}</ol><button type="button" class="ef-compartilhar" onclick="compartilharPedido(${efArg(p.id)})">${efIcone('compartilhar')}Compartilhar acompanhamento</button></section>`;
}
function efDetalhePedidoHTML(p){
  const encerrado=['cancelado','entregue'].includes(p.status),mapa=!estado.detalheMapaOculto&&!encerrado,eta=efEstimativaPedido(p);
  return `<div class="ef-detalhe" data-pedido="${efEsc(p.id)}"><header class="ef-track-header"><button type="button" class="ef-icon-btn" aria-label="Voltar aos meus pedidos" onclick="efFecharDetalhe()">${efIcone('voltar')}</button><div><span>ENTREGA <b>FLASH</b></span><h1>${efEsc(efStatusPedido(p))}</h1></div><button type="button" class="ef-icon-btn" aria-label="Opções do pedido" aria-expanded="${!!estado.detalheMenu}" aria-controls="ef-track-opcoes" onclick="estado.detalheMenu=!estado.detalheMenu;render()">${efIcone('mais')}</button></header>
    ${estado.detalheMenu?`<nav id="ef-track-opcoes" class="ef-track-opcoes" aria-label="Opções do pedido"><button onclick="copiarIdPedido(${efArg(p.id)})">Copiar código do pedido</button><button onclick="carregarPedidos()">Atualizar acompanhamento</button><button onclick="abrirSuporteGeral()">Falar com o suporte</button>${podeCancelar(p)?acoesPedidoHTML(p):''}</nav>`:''}
    <div class="ef-track-layout"><section id="ef-mapa-painel" class="ef-mapa-painel" ${mapa?'':'hidden'} aria-label="Localização da entrega"><div id="ef-mapa-detalhe" class="ef-mapa-detalhe"></div><div class="ef-mapa-aviso" id="ef-mapa-aviso" role="status">Carregando mapa…</div><div class="ef-eta-flutuante" id="ef-eta-detalhe" ${eta?'':'hidden'}><b>${eta?'~'+eta.min:''}<small>min</small></b><span id="ef-eta-label">${eta?eta.label:''}</span></div><button class="ef-centralizar" type="button" onclick="efCentralizarMapa()" aria-label="Centralizar trajeto">${efIcone('alvo')}</button><div class="ef-mapa-rodape"><span class="ef-gps-dot"></span><span id="ef-gps-detalhe">${efGpsRecente(p)?'Localização atualizada':'Aguardando localização recente'}</span></div></section>
    <div class="ef-track-dados ${mapa?'com-mapa':''}">${efMotoristaHTML(p)}${efTrajetoHTML(p)}
      <section class="ef-track-card ef-resumo-pedido"><div class="ef-card-titulo">${efIcone('pacote')}<h2>Informações do pedido</h2></div><dl><div><dt>Valor da corrida</dt><dd>${Number(p.preco||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</dd></div><div><dt>Código</dt><dd>${efEsc(p.id)}</dd></div>${p.descricao?`<div class="ef-descricao"><dt>O que vamos entregar</dt><dd>${efEsc(p.descricao)}</dd></div>`:''}</dl>${p.acrescimoValor>0?`<p>Acréscimo noturno/pico: ${empresaDinheiro(p.acrescimoValor)}</p>`:''}${p.taxaEsperaColeta||p.taxaEsperaEntrega?`<p>Taxa de espera: ${empresaDinheiro(Number(p.taxaEsperaColeta||0)+Number(p.taxaEsperaEntrega||0))}</p>`:''}${p.status==='cancelado'?`<p>${p.taxaCancelamento>0?'Taxa de cancelamento: '+empresaDinheiro(p.taxaCancelamento):'Cancelado sem custo.'}</p>`:''}${extrasHTML(p)}${seloPrioridadeHTML(p)}</section>
      ${pinEntregaClienteHTML(p)}${fotosHTML(p)}${avaliacaoHTML(p)}${favoritoMotoristaHTML(p)}${relogioCancelamentoHTML(p)}
      ${p.status==='buscando'?prioridadeBoostHTML(p):''}
      ${encerrado?`<button class="ef-novo-pedido" onclick="repetirPedido(${efArg(p.id)})">Pedir novamente ${efIcone('pacote')}</button>`:''}
      <p class="ef-track-ajuda">${efIcone('escudo')} Precisa de ajuda? <button type="button" onclick="abrirSuporteGeral()">Fale com o suporte</button></p>
    </div></div></div>${estado.edicaoPedido?modalEdicaoPedidoHTML():''}`;
}
let efMapaDetalhe=null;
function efLimparMapaDetalhe(){if(!efMapaDetalhe)return;clearInterval(efMapaDetalhe.timer);efMapaDetalhe.map?.remove();efMapaDetalhe=null;}
function efCentralizarMapa(){const m=efMapaDetalhe;if(m?.bounds?.length)m.map.fitBounds(m.bounds,{padding:[52,64],maxZoom:16});}
function efMontarMapaDetalhe(){
  const p=efPedidoEmFoco(),slot=document.getElementById('ef-mapa-detalhe');
  if(!p||!slot||['entregue','cancelado'].includes(p.status)){efLimparMapaDetalhe();return;}
  if(estado.detalheMapaOculto)return;
  const el=id=>document.getElementById(id);
  if(typeof L==='undefined'){el('ef-mapa-aviso').textContent='Mapa indisponível. Os detalhes do pedido continuam abaixo.';return;}
  const etapas=efEtapasPedido(p),pontos=etapas.filter(e=>efCoordenada(e.coord)).map(e=>[Number(e.coord.lat),Number(e.coord.lon)]);
  if(!pontos.length){efLimparMapaDetalhe();el('ef-mapa-aviso').textContent='Aguardando as coordenadas dos endereços.';return;}
  if(efMapaDetalhe?.id!==p.id)efLimparMapaDetalhe();
  if(!efMapaDetalhe){
    const div=document.createElement('div');div.className='ef-mapa-canvas';slot.appendChild(div);
    const map=L.map(div,{zoomControl:false,scrollWheelZoom:false,attributionControl:true}).setView(pontos[0],14);
    const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
    tiles.on('tileerror',()=>{if(efMapaDetalhe?.id===p.id)efMapaDetalhe.tileError=true;const aviso=el('ef-mapa-aviso');if(aviso){aviso.hidden=false;aviso.textContent='Não foi possível carregar o mapa. Confira sua conexão.';}});
    tiles.on('tileload',()=>{if(efMapaDetalhe?.id===p.id)efMapaDetalhe.tileError=false;});
    efMapaDetalhe={id:p.id,map,div,markers:L.layerGroup().addTo(map),signature:'',bounds:pontos,timer:setInterval(efMontarMapaDetalhe,15000)};
  }
  const m=efMapaDetalhe;if(m.div.parentElement!==slot)slot.appendChild(m.div);
  const assinatura=JSON.stringify(etapas.map(e=>[e.coord,e.feito,e.atual]));
  if(m.signature!==assinatura){
    m.markers.clearLayers();etapas.forEach((e,i)=>{if(!efCoordenada(e.coord))return;
      const icon=L.divIcon({className:'ef-marcador-parada',html:`<span class="${e.feito?'feito':e.atual?'atual':''}">${e.feito?'✓':i===0?'○':i}</span>`,iconSize:[30,30],iconAnchor:[15,15]});
      L.marker([e.coord.lat,e.coord.lon],{icon}).bindTooltip(e.label).addTo(m.markers);
    });
    // Liga apenas endereços consecutivos com coordenadas conhecidas. Não simula ruas.
    for(let i=1;i<etapas.length;i++){const a=etapas[i-1].coord,b=etapas[i].coord;if(efCoordenada(a)&&efCoordenada(b))L.polyline([[a.lat,a.lon],[b.lat,b.lon]],{color:'#ee7027',weight:3,opacity:.6,dashArray:'5 9'}).addTo(m.markers);}
    m.signature=assinatura;m.bounds=pontos;efCentralizarMapa();
  }
  const recente=efGpsRecente(p),eta=efEstimativaPedido(p);
  if(recente){
    const pos=[Number(p.motoristaCoord.lat),Number(p.motoristaCoord.lon)];
    if(!m.driver){m.driver=L.marker(pos,{icon:L.divIcon({className:'ef-marcador-veiculo',html:efIcone('veiculo'),iconSize:[44,44],iconAnchor:[22,22]}),zIndexOffset:1000}).bindTooltip('Motorista parceiro').addTo(m.map);m.bounds=[...pontos,pos];efCentralizarMapa();}
    else m.driver.setLatLng(pos);
    m.bounds=[...pontos,pos];
  }else if(m.driver){m.map.removeLayer(m.driver);m.driver=null;m.bounds=pontos;}
  el('ef-mapa-aviso').hidden=!m.tileError;
  el('ef-gps-detalhe').textContent=recente?'GPS atualizado às '+new Date(Number(p.motoristaAtualizadoEm)).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+' · Trajeto ilustrativo':'Aguardando localização recente · Trajeto ilustrativo';
  el('ef-eta-detalhe').hidden=!eta;
  if(eta){el('ef-eta-detalhe').querySelector('b').innerHTML='~'+eta.min+'<small>min</small>';el('ef-eta-label').textContent=eta.label+' · estimativa';}
  requestAnimationFrame(()=>m.map.invalidateSize());
}
