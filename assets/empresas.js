/* Entrega Flash Empresas: usa a conta e a carteira existentes, sem alterar tarifas. */
const EF_EMPRESA_TIPOS = { farmacia:'Farmácia', mercado:'Mercado / supermercado', restaurante:'Restaurante / lanchonete', loja:'Loja / comércio', petshop:'Pet shop', autopecas:'Autopeças', floricultura:'Floricultura', outro:'Outro negócio' };
const EF_EMPRESA_STATUS = { novo:'Cadastro recebido', em_contato:'Em contato', ativo:'Parceria ativa', sem_interesse:'Cadastro arquivado' };
const EF_EMPRESA_PDF = '/proposta-entrega-flash-empresas.pdf';
function parceiroEsc(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function normalizarWhatsParceiro(v){ let p=String(v||'').replace(/\D/g,''); if(/^55\d{10,11}$/.test(p))p=p.slice(2); return p; }
function empresaSessao(){ try{return localStorage.getItem('ef_cliente_sessao')||'';}catch{return '';} }
function guardarSessaoEmpresa(token){ if(token)salvarLocal('ef_cliente_sessao',token); }
async function empresaAPI(acao, dados={}){
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
  try{
    const r=await fetch(SUPABASE_URL+'/functions/v1/empresas-portal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao,sessao:empresaSessao(),...dados}),signal:controller.signal});
    const data=await r.json();
    if(!r.ok){const error=new Error(data.error||'Não foi possível concluir. Tente novamente.');error.status=r.status;throw error;}
    return data;
  }catch(e){if(e.name==='AbortError')throw new Error('A conexão demorou. Seus dados continuam preenchidos; tente novamente.');throw e;}
  finally{clearTimeout(timer);}
}
function empresaForm(row){return {estabelecimento:row.estabelecimento||'',responsavel:row.responsavel||'',whatsapp:row.whatsapp||'',cidade:row.cidade||'',endereco:row.endereco||'',tipoNegocio:row.tipo_negocio||'farmacia',entregasDia:row.entregas_dia||'0-5',mensagem:row.mensagem||''};}
function parceiroCampo(campo,valor){if(Object.hasOwn(estado.parceiro.form,campo)){estado.parceiro.form[campo]=valor;}}
function empresaDinheiro(n){return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function empresaData(n){const d=new Date(Number(n)||n);return Number.isNaN(d.getTime())?'':d.toLocaleString('pt-BR');}
async function abrirParceiros(){
  const p=estado.parceiro;p.aberto=true;p.erro='';
  if(!p.form.whatsapp && estado.cliente?.logado){p.form.whatsapp=estado.cliente.telefone;p.form.responsavel=estado.cliente.nome;}
  window.scrollTo(0,0);render();
  if(estado.cliente?.logado && empresaSessao())await carregarMinhaEmpresa();
}
function fecharParceiros(){estado.parceiro.aberto=false;estado.parceiro.erro='';window.scrollTo(0,0);render();}
async function carregarMinhaEmpresa(){
  const p=estado.parceiro;if(p.carregando)return;p.carregando=true;render();
  try{
    const r=await empresaAPI('empresa');p.empresa=r.empresa;p.erro='';
    if(r.empresa){p.form=empresaForm(r.empresa);p.enviado=false;await carregarPedidosEmpresa(false);}
  }catch(e){p.erro=e.message;if(e.status===401)removerLocal('ef_cliente_sessao');}
  finally{p.carregando=false;render();}
}
async function carregarPedidosEmpresa(atualizar=true){
  try{const r=await empresaAPI('pedidos_empresa');estado.parceiro.pedidos=(r.pedidos||[]).map(paraCamposApp);estado.parceiro.limitado=!!r.limitado;estado.parceiro.atualizadoEm=Date.now();estado.parceiro.erro='';}
  catch(e){estado.parceiro.erro=e.message;}
  if(atualizar)render();
}
function entrarContaEmpresa(cadastro=false){
  estado.parceiroRetorno=true;estado.parceiro.aberto=false;estado.telaBoasVindas=false;estado.modo='cliente';
  estado.cliente.logado=false;
  estado.painelCliente.tela=cadastro?'cadastro':'entrar';
  estado.painelCliente.loginTelefone=estado.parceiro.form.whatsapp||estado.cliente.telefone||'';
  if(cadastro)estado.painelCliente.cadastro={nome:estado.parceiro.form.responsavel||'',telefone:estado.parceiro.form.whatsapp||'',senha:'',erro:''};
  render();window.scrollTo(0,0);
}
async function retomarEmpresaAposLogin(){
  if(!estado.parceiroRetorno)return;estado.parceiroRetorno=false;clienteBemVindoAnimando=false;
  await abrirParceiros();
}
async function enviarCadastroParceiro(){
  const p=estado.parceiro;if(p.enviando)return;
  const form=document.getElementById('empresa-cadastro-form');if(form&&!form.reportValidity())return;
  const f=p.form,whats=normalizarWhatsParceiro(f.whatsapp);p.erro='';
  if(f.estabelecimento.trim().length<2||f.responsavel.trim().length<2||f.cidade.trim().length<2||!/^\d{10,11}$/.test(whats)){p.erro='Confira o nome da empresa, responsável, cidade e WhatsApp com DDD.';render();return;}
  p.enviando=true;render();
  try{
    if(estado.cliente.logado&&empresaSessao()){
      const r=await empresaAPI('salvar_empresa',{form:{...f,whatsapp:whats},cadastroId:p.cadastroId||null});
      p.empresa=r.empresa;p.form=empresaForm(r.empresa);p.editando=false;p.enviado=false;await carregarPedidosEmpresa(false);
    }else{
      p.cadastroId=p.cadastroId||crypto.randomUUID();
      const payload={id:p.cadastroId,estabelecimento:f.estabelecimento.trim(),responsavel:f.responsavel.trim(),whatsapp:whats,cidade:f.cidade.trim(),endereco:f.endereco.trim()||null,tipo_negocio:f.tipoNegocio,entregas_dia:f.entregasDia,mensagem:f.mensagem.trim()||null};
      const {error}=await sb.from('entrega_parceiros').insert(payload);
      // A mesma chave torna a repeticao segura quando a primeira resposta se perde na rede.
      if(error&&error.code!=='23505')throw new Error('Não foi possível enviar. Confira sua conexão e tente novamente.');
      p.enviado=true;
    }
    window.scrollTo(0,0);
  }catch(e){p.erro=e.message;}
  finally{p.enviando=false;render();}
}
function empresaCabecalhoHTML(){return `<div class="parceiro-top"><button type="button" class="parceiro-back" onclick="fecharParceiros()">← Voltar</button><a href="/empresas" class="parceiro-brand" aria-label="Entrega Flash Empresas"><img src="/icon-192.png" alt="" width="36" height="36"><span>ENTREGA <b>FLASH</b><small>EMPRESAS</small></span></a></div>`;}
function empresaFormHTML(){
  const p=estado.parceiro,f=p.form;
  const field=(id,label,opts='')=>`<label for="empresa-${id}">${label}</label><input id="empresa-${id}" name="${id}" value="${parceiroEsc(f[id])}" oninput="parceiroCampo('${id}',this.value)" ${opts}>`;
  return `<section class="parceiro-form-card" id="cadastro-parceiro"><h2>${p.editando?'Dados da empresa':'Cadastre sua empresa'}</h2><p class="sub">Cadastro gratuito. CNPJ e documentos não são pedidos nesta primeira etapa.</p><form id="empresa-cadastro-form" onsubmit="event.preventDefault();enviarCadastroParceiro()">
  <div class="empresa-form-grid"><div>${field('estabelecimento','Nome da empresa *','required minlength="2" maxlength="160" autocomplete="organization" placeholder="Nome do seu estabelecimento"')}</div><div>${field('responsavel','Responsável *','required minlength="2" maxlength="120" autocomplete="name" placeholder="Seu nome"')}</div>
  <div>${field('whatsapp','WhatsApp com DDD *','required type="tel" maxlength="20" autocomplete="tel-national" placeholder="(11) 99999-9999"')}</div><div>${field('cidade','Cidade e estado *','required minlength="2" maxlength="120" autocomplete="address-level2" placeholder="Ex.: Santo André - SP"')}</div></div>
  ${field('endereco','Endereço de retirada','maxlength="300" autocomplete="street-address" placeholder="Rua, número e bairro"')}
  <div class="empresa-form-grid"><div><label for="empresa-tipo">Tipo de negócio *</label><select id="empresa-tipo" onchange="parceiroCampo('tipoNegocio',this.value)">${Object.entries(EF_EMPRESA_TIPOS).map(([k,v])=>`<option value="${k}" ${f.tipoNegocio===k?'selected':''}>${v}</option>`).join('')}</select></div>
  <div><label for="empresa-volume">Entregas por dia</label><select id="empresa-volume" onchange="parceiroCampo('entregasDia',this.value)">${['0-5','6-10','11-20','20+'].map(v=>`<option ${f.entregasDia===v?'selected':''}>${v}</option>`).join('')}</select></div></div>
  <label for="empresa-mensagem">Sobre sua operação</label><textarea id="empresa-mensagem" maxlength="1500" oninput="parceiroCampo('mensagem',this.value)" placeholder="O que entrega, horários e regiões de atendimento">${parceiroEsc(f.mensagem)}</textarea>
  ${p.erro?`<p class="parceiro-erro" role="alert">${parceiroEsc(p.erro)}</p>`:''}
  <button type="submit" class="btn btn-primario" ${p.enviando?'disabled aria-busy="true"':''}>${p.enviando?'Salvando…':p.editando?'Salvar dados':estado.cliente.logado&&empresaSessao()?'Salvar e abrir minha empresa':'Cadastrar minha empresa'}</button>
  ${p.editando?'<button type="button" class="btn btn-secundario" onclick="estado.parceiro.editando=false;render()">Voltar ao painel</button>':''}
  <p class="parceiro-note">Usaremos os dados para atender sua solicitação de parceria. <a href="/proposta-entrega-flash-empresas.pdf" target="_blank" rel="noopener">Conheça a proposta</a>.</p></form></section>`;
}
function telaParceiros(){
  const p=estado.parceiro;
  const head=empresaCabecalhoHTML();
  if(p.carregando)return `<div class="parceiro-page"><div class="parceiro-shell">${head}<p role="status">Carregando sua empresa…</p></div></div>`;
  if(p.empresa&&!p.editando)return empresaPainelHTML();
  if(p.enviado)return `<div class="parceiro-page"><div class="parceiro-shell">${head}<section class="parceiro-sucesso"><div class="ico">✓</div><h1>Cadastro recebido!</h1><p><strong>${parceiroEsc(p.form.estabelecimento)}</strong> já está na nossa lista de parceiros para contato.</p><p>Para organizar seus pedidos, entre na sua conta ou crie uma conta com o WhatsApp informado. Depois, confirme os dados da empresa.</p><div class="empresa-acoes"><button class="btn btn-primario" onclick="entrarContaEmpresa(true)">Criar minha conta</button><button class="btn btn-secundario" onclick="entrarContaEmpresa(false)">Já tenho conta</button><a class="btn btn-secundario" href="${EF_EMPRESA_PDF}" target="_blank" rel="noopener">Baixar proposta em PDF</a></div></section></div></div>`;
  return `<div class="parceiro-page"><div class="parceiro-shell">${head}${!p.editando?`
  <section class="parceiro-hero"><span class="parceiro-eyebrow">Entregas para o seu negócio</span><h1>Sua loja vende.<br><span>A gente entrega.</span></h1><p>Peça um entregador quando precisar. Consulte o preço antes de confirmar e acompanhe seus pedidos pelo celular.</p>
  <div class="empresa-acoes"><button class="btn btn-primario" onclick="document.getElementById('cadastro-parceiro').scrollIntoView({behavior:'smooth'})">Cadastrar minha empresa</button><button class="btn btn-secundario" onclick="entrarContaEmpresa(false)">Entrar na minha conta</button><a class="empresa-link" href="${EF_EMPRESA_PDF}" target="_blank" rel="noopener">Ver proposta comercial em PDF</a></div>
  <p class="empresa-condicao">Cadastro gratuito • Sem mensalidade para a empresa • Pagamento por corrida</p></section>
  <div class="parceiro-grid"><div class="parceiro-beneficio"><b>Retirada já preenchida</b><span>Salve o endereço da empresa e agilize os próximos pedidos.</span></div><div class="parceiro-beneficio"><b>Entregas organizadas</b><span>Veja pedidos em andamento, concluídos e cancelados em um só lugar.</span></div><div class="parceiro-beneficio"><b>Mais de um destino</b><span>Até 10 endereços de entrega na mesma corrida, com valor calculado antes de confirmar.</span></div><div class="parceiro-beneficio"><b>Cliente informado</b><span>Compartilhe um link de acompanhamento, sem cadastro para quem vai receber.</span></div></div>
  <section class="parceiro-fluxo"><h2>Do balcão até o cliente</h2><div class="parceiro-passos"><div class="parceiro-passo"><strong>1. Prepare o envio</strong>Informe retirada, destinos e o veículo adequado.</div><div class="parceiro-passo"><strong>2. Confira e confirme</strong>Veja o preço e use o saldo da carteira, recarregada via Pix.</div><div class="parceiro-passo"><strong>3. Acompanhe a entrega</strong>Após o aceite, acompanhe o andamento e use o PIN para confirmar o recebimento.</div></div><p class="empresa-condicao">Atendimento conforme disponibilidade de motoristas e veículo na região. Cadastro não garante aceite imediato.</p></section>
  <details class="empresa-faq"><summary>Para quais empresas serve?</summary><p>Farmácias, mercados, restaurantes, lojas, pet shops, autopeças, floriculturas e outros negócios. Escolha um veículo e acondicione a mercadoria de acordo com o tamanho e o tipo de transporte.</p></details>
  <details class="empresa-faq"><summary>Como funciona o pagamento?</summary><p>Adicione saldo via Pix e confirme a corrida pelo valor informado. Paradas extras, serviços adicionais, espera e cancelamento seguem as regras apresentadas no aplicativo. Condições específicas dependem de acordo com a equipe.</p></details>`:''}${empresaFormHTML()}</div></div>`;
}
function empresaPainelHTML(){
  const p=estado.parceiro,e=p.empresa,all=p.pedidos||[],hoje=new Date().toLocaleDateString('pt-BR');
  const ativos=all.filter(x=>!['entregue','cancelado'].includes(x.status));
  const concluidos=all.filter(x=>x.status==='entregue'&&new Date(x.atualizadoEm).toLocaleDateString('pt-BR')===hoje);
  const filtro=p.filtro||'ativos',busca=(p.busca||'').toLocaleLowerCase('pt-BR');
  const lista=all.filter(x=>(filtro==='todos'||(filtro==='ativos'&&!['entregue','cancelado'].includes(x.status))||x.status===filtro)&&(!busca||[x.id,x.destino,x.origem].join(' ').toLocaleLowerCase('pt-BR').includes(busca)));
  return `<div class="parceiro-page"><div class="parceiro-shell">${empresaCabecalhoHTML()}<section class="empresa-painel-topo"><div><span class="parceiro-eyebrow">Minha empresa</span><h1>${parceiroEsc(e.estabelecimento)}</h1><p>${parceiroEsc(e.cidade)} · ${parceiroEsc(EF_EMPRESA_STATUS[e.status]||e.status)}</p></div><button class="btn btn-primario" onclick="novaEntregaEmpresa()">Pedir entrega</button></section>
  <div class="empresa-indicadores"><div><strong>${ativos.length}</strong><span>Em andamento</span></div><div><strong>${concluidos.length}</strong><span>Concluídas hoje</span></div><div><strong>${empresaDinheiro(concluidos.reduce((s,x)=>s+x.preco,0))}</strong><span>Valor das concluídas hoje</span></div></div>
  <div class="empresa-acoes empresa-acoes-sec"><button class="btn btn-secundario" onclick="estado.parceiro.editando=true;render()">Dados da empresa</button><button class="btn btn-secundario" onclick="carregarMinhaEmpresa()">Atualizar pedidos</button><a class="btn btn-secundario" href="${EF_EMPRESA_PDF}" target="_blank" rel="noopener">Proposta em PDF</a></div>
  ${!e.endereco?'<p class="parceiro-erro">Salve o endereço da empresa para preencher a retirada automaticamente.</p>':''}
  ${p.erro?`<p class="parceiro-erro" role="alert">${parceiroEsc(p.erro)}</p>`:''}
  <section class="empresa-pedidos"><h2>Entregas da sua conta</h2><div class="empresa-filtros">${[['ativos','Em andamento'],['entregue','Concluídas'],['cancelado','Canceladas'],['todos','Todas']].map(([k,v])=>`<button class="${filtro===k?'ativo':''}" onclick="estado.parceiro.filtro='${k}';render()">${v}</button>`).join('')}</div>
  <label for="empresa-busca">Buscar por endereço ou pedido</label><input id="empresa-busca" value="${parceiroEsc(p.busca||'')}" oninput="estado.parceiro.busca=this.value;render()" placeholder="Digite um endereço ou número">
  <p class="empresa-condicao">${p.atualizadoEm?'Atualizado em '+empresaData(p.atualizadoEm)+'. ':''}${p.limitado?'Mostrando os 500 pedidos mais recentes.':''}</p>
  ${lista.length?lista.map(x=>`<article class="empresa-pedido"><div class="empresa-pedido-topo"><b>${parceiroEsc(ROTULOS_ESTAGIO[x.status]||x.status)}</b><strong>${empresaDinheiro(x.preco)}</strong></div><p><small>Retirada</small>${parceiroEsc(x.origem)}</p><p><small>Entrega</small>${parceiroEsc(x.destino)}${x.paradas.length?` · mais ${x.paradas.length} endereço(s)`:''}</p><small>${empresaData(x.criadoEm)} · ${parceiroEsc(x.id)}</small><div class="empresa-acoes"><button class="btn btn-secundario" onclick="verPedidoEmpresa('${parceiroEsc(x.id)}')">Ver pedido</button>${['entregue','cancelado'].includes(x.status)?`<button class="btn btn-primario" onclick="repetirPedido('${parceiroEsc(x.id)}')">Pedir novamente</button>`:`<button class="btn btn-secundario" onclick="compartilharPedido('${parceiroEsc(x.id)}')">Compartilhar acompanhamento</button>`}</div></article>`).join(''):'<div class="empresa-vazio"><h3>Nenhuma entrega nesta lista</h3><p>Quando você solicitar uma corrida, poderá acompanhar por aqui.</p><button class="btn btn-primario" onclick="novaEntregaEmpresa()">Pedir a primeira entrega</button></div>'}</section></div></div>`;
}
function empresaResumoClienteHTML(){
  if(estado.cliente.visitante)return '';
  const e=estado.parceiro.empresa;
  return `<div class="cartao empresa-atalho"><div><b>${e?parceiroEsc(e.estabelecimento):'Você pede entregas para uma empresa?'}</b><p>${e?'Acesse seus pedidos e use o endereço de retirada salvo.':'Cadastre seu negócio e organize os pedidos.'}</p></div><button class="btn btn-secundario" onclick="abrirParceiros()">${e?'Minha empresa':'Área de empresas'}</button></div>`;
}
async function novaEntregaEmpresa(){
  const p=estado.parceiro;if(!estado.cliente.logado){entrarContaEmpresa(false);return;}
  if(estado.form.destino&&!(await confirmarAcao('Há um pedido preenchido. Substituir por uma nova entrega da empresa?','Nova entrega')))return;
  const e=p.empresa;p.aberto=false;estado.telaBoasVindas=false;estado.modo='cliente';estado.pedidoBuscandoId=null;
  estado.form={...estado.form,etapaPedido:1,nome:estado.cliente.nome,telefone:estado.cliente.telefone,origem:[e.endereco,e.cidade].filter(Boolean).join(', '),destino:'',origemCoord:null,destinoCoord:null,paradas:[],paradasCoords:[],distancia:null,distanciaGPS:null,duracaoMin:null,horarioAgendado:'',tipoRetirada:'agora',descricao:'',prioridade:false,prioridadeValor:0,origemFotoUrl:null,destinoFotoUrl:null,origemReferencia:'',origemComplemento:'',destinoReferencia:'',destinoComplemento:'',motoristaPreferidoTelefone:'',roca:false,extras:extrasVazios()};
  render();document.querySelector('.ef-form-entrega')?.scrollIntoView({behavior:'smooth'});
}
function pedidoDaContaEmpresa(id){return [...(estado.pedidos||[]),...(estado.parceiro.pedidos||[])].find(x=>x.id===id&&x.clienteTelefone===estado.cliente.telefone);}
function verPedidoEmpresa(id){
  const p=pedidoDaContaEmpresa(id);if(!p)return;
  if(!estado.pedidos.some(x=>x.id===id))estado.pedidos.push(p);
  if(typeof efAbrirDetalhe==='function'){efAbrirDetalhe(id);carregarPedidos();return;}
  estado.parceiro.aberto=false;estado.telaBoasVindas=false;estado.modo='cliente';estado.pedidoBuscandoId=p.status==='buscando'?id:null;estado.abaPedidosCliente=['entregue','cancelado'].includes(p.status)?'historico':'ativos';render();
  document.getElementById('pedido-'+id)?.scrollIntoView({behavior:'smooth'});
}
async function repetirPedido(id){
  const p=pedidoDaContaEmpresa(id);if(!p||!['entregue','cancelado'].includes(p.status))return;
  estado.parceiro.aberto=false;estado.telaBoasVindas=false;estado.modo='cliente';
  carregarPedidoCanceladoNoFormulario(p,1);
  Object.assign(estado.form,{distancia:null,distanciaGPS:null,duracaoMin:null,distanciaDivergente:false,tipoRetirada:'agora',horarioAgendado:'',origemFotoUrl:null,destinoFotoUrl:null});
  render();mostrarToast('Endereços preenchidos. Calcule o preço atualizado e revise antes de confirmar.','sucesso');
}
async function compartilharPedido(id){
  if(!pedidoDaContaEmpresa(id))return;
  if(!empresaSessao()){mostrarToast('Entre novamente com sua senha para criar o link de acompanhamento.','info');return;}
  try{
    const r=await empresaAPI('gerar_rastreio',{pedidoId:id}),url=new URL('/acompanhar.html',location.origin).href+'#'+r.chave;
    const text='Acompanhe sua entrega pelo Entrega Flash: '+url;
    if(navigator.share){try{await navigator.share({title:'Acompanhar entrega',text,url});return;}catch(e){if(e.name==='AbortError')return;}}
    try{await navigator.clipboard.writeText(url);mostrarToast('Link copiado. Envie para quem vai receber.','sucesso');}
    catch{await confirmarAcao('Copie este link de acompanhamento:<br><input readonly value="'+parceiroEsc(url)+'" style="width:100%;user-select:text">','Fechar');}
  }catch(e){mostrarToast(e.message,'erro');}
}
function testeRecebimentoHTML(){return `<section class="cartao empresa-diagnostico"><h2>Recebimento de chamadas</h2><p>Confira som, conexão e localização neste aparelho.</p><button class="btn btn-secundario" onclick="testarRecebimentoMotorista()" ${estado.testeRecebimento?.rodando?'disabled':''}>${estado.testeRecebimento?.rodando?'Verificando…':'Testar recebimento'}</button>${estado.testeRecebimento?`<ul aria-live="polite">${estado.testeRecebimento.itens.map(x=>`<li>${parceiroEsc(x)}</li>`).join('')}</ul><p class="empresa-condicao">Este teste verifica o app aberto. O recebimento com tela bloqueada precisa ser confirmado no Android com uma chamada de teste.</p>`:''}</section>`;}
async function testarRecebimentoMotorista(){
  if(estado.testeRecebimento?.rodando)return;
  const t=estado.testeRecebimento={rodando:true,itens:['Teste de som iniciado. Confira o volume do aparelho.']};tocarSomNovoPedido();render();
  try{await empresaAPI('conexao');t.itens.push('Conexão com o serviço: respondendo.');}catch{t.itens.push('Conexão: não respondeu. Confira sua internet.');}
  const n=typeof Notification!=='undefined'?Notification.permission:'unsupported';
  t.itens.push(entregaFlashNativoAndroidAtivo()?'Aplicativo Android identificado. Confira também as permissões do aplicativo nas configurações do celular.':n==='granted'?'Permissão de notificações do navegador: ativada.':n==='denied'?'Notificações bloqueadas no navegador. Libere nas configurações do site.':'Notificações do navegador: ainda não ativadas neste aparelho.');
  if(n==='granted'&&!entregaFlashNativoAndroidAtivo())notificar('Teste Entrega Flash','Este é um teste de recebimento, sem corrida real.','ef-teste-local');
  if(navigator.geolocation){await new Promise(resolve=>navigator.geolocation.getCurrentPosition(()=>{t.itens.push('Localização: o GPS respondeu agora.');resolve();},()=>{t.itens.push('Localização: não foi possível confirmar. Confira a permissão e o GPS.');resolve();},{enableHighAccuracy:true,timeout:10000,maximumAge:0}));}else t.itens.push('Localização indisponível neste navegador.');
  t.rodando=false;render();
}
function inicializarEmpresas(){
  const ir=new URLSearchParams(location.search).get('ir');
  if(/^\/empresas\/?$/.test(location.pathname)||ir==='empresas'){estado.viaAnuncio=true;abrirParceiros();}
}
