async function carregarEmpresasAdmin(){
  const a=estado.admin;if(!a.logado||!adminEhDono()||a.empresasCarregando)return;
  a.empresasCarregando=true;a.empresasErro='';render();
  try{const r=await empresaAPI('admin_listar',{senha:a.senhaDigitada});a.empresas=r.empresas||[];}
  catch(e){a.empresasErro=e.message;}
  finally{a.empresasCarregando=false;render();}
}
async function salvarEmpresaAdmin(id){
  const a=estado.admin;if(!adminEhDono()||a.empresaSalvando)return;
  const status=document.getElementById('empresa-status-'+id)?.value,observacao=document.getElementById('empresa-nota-'+id)?.value||'';
  a.empresaSalvando=id;
  try{await empresaAPI('admin_atualizar',{senha:a.senhaDigitada,id,status,observacao});await carregarEmpresasAdmin();mostrarToast('Situação da empresa salva.','sucesso');}
  catch(e){mostrarToast(e.message,'erro');}
  finally{a.empresaSalvando=null;render();}
}
function adminEmpresasHTML(){
  const a=estado.admin,all=a.empresas||[],q=(a.empresasBusca||'').toLocaleLowerCase('pt-BR'),f=a.empresasFiltro||'todos';
  const lista=all.filter(e=>(f==='todos'||e.status===f)&&[e.estabelecimento,e.responsavel,e.cidade,e.whatsapp].join(' ').toLocaleLowerCase('pt-BR').includes(q));
  const status={novo:'Novo cadastro',em_contato:'Em contato',ativo:'Parceria ativa',sem_interesse:'Sem interesse / arquivado'};
  return `<div class="empresa-admin"><h2>Empresas parceiras</h2><p>Organize os cadastros, acompanhe o contato e consulte a proposta comercial.</p><div class="empresa-acoes"><button class="btn btn-secundario" onclick="carregarEmpresasAdmin()" ${a.empresasCarregando?'disabled':''}>${a.empresasCarregando?'Carregando…':'Atualizar empresas'}</button><a class="btn btn-primario" href="/proposta-entrega-flash-empresas.pdf" target="_blank" rel="noopener">Abrir proposta em PDF</a><a class="btn btn-secundario" href="/empresas" target="_blank" rel="noopener">Página para empresas</a></div>
  <div class="empresa-indicadores" style="margin-top:20px"><div><strong>${all.filter(x=>x.status==='novo').length}</strong><span>Novos cadastros</span></div><div><strong>${all.filter(x=>x.status==='em_contato').length}</strong><span>Em contato</span></div><div><strong>${all.filter(x=>x.status==='ativo').length}</strong><span>Parcerias ativas</span></div></div>
  <div class="empresa-form-grid"><div><label for="empresa-admin-busca">Buscar empresa, cidade ou telefone</label><input id="empresa-admin-busca" value="${parceiroEsc(a.empresasBusca||'')}" oninput="estado.admin.empresasBusca=this.value" onchange="render()" onkeydown="if(event.key==='Enter'){this.blur();render()}" placeholder="Nome, cidade ou telefone"><button class="btn btn-secundario" onclick="render()">Buscar</button></div><div><label for="empresa-admin-filtro">Situação</label><select id="empresa-admin-filtro" onchange="estado.admin.empresasFiltro=this.value;render()"><option value="todos">Todas</option>${Object.entries(status).map(([k,v])=>`<option value="${k}" ${f===k?'selected':''}>${v}</option>`).join('')}</select></div></div>
  ${a.empresasErro?`<p class="parceiro-erro" role="alert">${parceiroEsc(a.empresasErro)}</p>`:''}
  ${lista.length?lista.map(e=>`<article class="empresa-pedido"><div class="empresa-pedido-topo"><h3>${parceiroEsc(e.estabelecimento)}</h3><b>${parceiroEsc(status[e.status]||e.status)}</b></div><p>${parceiroEsc(EF_EMPRESA_TIPOS[e.tipo_negocio]||e.tipo_negocio)} · ${parceiroEsc(e.cidade)} · ${parceiroEsc(e.entregas_dia||'Volume não informado')} entregas/dia</p><p>Responsável: <b>${parceiroEsc(e.responsavel)}</b><br>WhatsApp: ${parceiroEsc(e.whatsapp)}<br>Retirada: ${parceiroEsc(e.endereco||'Não informada')}</p>${e.mensagem?`<p>${parceiroEsc(e.mensagem)}</p>`:''}<p class="empresa-condicao">Recebido em ${empresaData(e.criado_em)} · ${e.cliente_telefone?'Conta vinculada':'Aguardando vínculo com conta'}</p><label for="empresa-status-${e.id}">Situação da parceria</label><select id="empresa-status-${e.id}">${Object.entries(status).map(([k,v])=>`<option value="${k}" ${e.status===k?'selected':''}>${v}</option>`).join('')}</select><label for="empresa-nota-${e.id}">Anotação interna</label><textarea id="empresa-nota-${e.id}" maxlength="1500">${parceiroEsc(e.observacao_admin||'')}</textarea><div class="empresa-acoes"><button class="btn btn-primario" onclick="salvarEmpresaAdmin('${e.id}')" ${a.empresaSalvando?'disabled':''}>Salvar situação</button><a class="btn btn-secundario" href="https://wa.me/55${normalizarWhatsParceiro(e.whatsapp)}" target="_blank" rel="noopener">Abrir WhatsApp</a></div></article>`).join(''):`<div class="empresa-vazio">${a.empresasCarregando?'Carregando empresas…':'Nenhuma empresa nesta lista.'}</div>`}</div>`;
}
async function carregarFluxoPedidosAdmin(){
  const a=estado.admin;if(!a.logado||!adminEhDono()||a.fluxoCarregando)return;a.fluxoCarregando=true;render();
  try{const r=await empresaAPI('admin_fluxo',{senha:a.senhaDigitada});a.fluxo=r;a.fluxoErro='';}
  catch(e){a.fluxoErro=e.message;}
  finally{a.fluxoCarregando=false;render();}
}
function adminFluxoPedidosHTML(){
  const a=estado.admin,d=a.fluxo||{pedidos:[],eventos:[]};
  return `<section class="empresa-admin"><h2>Caminho dos pedidos</h2><p>Veja o que foi registrado desde a criação até o aceite. Sem registro significa que esta etapa ainda não foi confirmada pelo sistema.</p><button class="btn btn-secundario" onclick="carregarFluxoPedidosAdmin()" ${a.fluxoCarregando?'disabled':''}>${a.fluxoCarregando?'Atualizando…':'Atualizar acompanhamento'}</button>${a.fluxoErro?`<p role="alert" class="parceiro-erro">${parceiroEsc(a.fluxoErro)}</p>`:''}<p class="empresa-condicao">Últimos 200 pedidos. Despacho registrado não garante que o celular recebeu a notificação.${d.limitado?' Há limite de registros nesta consulta.':''}</p>${d.pedidos.length?d.pedidos.map(p=>{
    const events=d.eventos.filter(e=>e.pedido_id===p.id),has=t=>events.some(e=>e.tipo===t),recebidos=events.filter(e=>e.tipo==='pedido_recebido_motorista').length,vistos=events.filter(e=>e.tipo==='pedido_visualizado_motorista').length,recusados=events.filter(e=>String(e.tipo).includes('recus')).length;
    const aceito=!!p.aceito_em||['indo_coletar','coletado','a_caminho','entregue'].includes(p.status),waiting=p.status==='buscando'&&!p.horario_agendado;
    const etapas=[['Criado',true],['Despacho',has('pedido_push_disparado')],['App recebeu'+(recebidos?' ('+recebidos+')':''),recebidos>0],['Visualizado'+(vistos?' ('+vistos+')':''),vistos>0],['Aceito',aceito],['Entregue',p.status==='entregue']];
    return `<article class="empresa-pedido ${waiting?'empresa-fluxo-alerta':''}"><div class="empresa-pedido-topo"><b>${parceiroEsc(p.id)}</b><strong>${parceiroEsc(ROTULOS_ESTAGIO[p.status]||p.status)}</strong></div><p>${parceiroEsc(p.origem)} → ${parceiroEsc(p.destino)}</p><ul class="empresa-fluxo-etapas">${etapas.map(([nome,ok])=>`<li class="${ok?'confirmado':'pendente'}">${ok?'✓ ':''}${nome}${ok?'':' · sem registro'}</li>`).join('')}</ul>${waiting?`<p>Aguardando aceite há ${Math.max(0,Math.floor((Date.now()-Number(p.criado_em))/60000))} minuto(s).</p>`:''}${p.horario_agendado?`<p>Retirada agendada: ${empresaData(p.horario_agendado)}</p>`:''}${recusados?`<p>${recusados} registro(s) de recusa.</p>`:''}${p.cancelado_por?`<p>Cancelamento registrado por: ${parceiroEsc(p.cancelado_por)}</p>`:''}<small>${empresaData(p.criado_em)}</small></article>`;
  }).join(''):'<div class="empresa-vazio">Nenhum pedido carregado.</div>'}</section>`;
}
