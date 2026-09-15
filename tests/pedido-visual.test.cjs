const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function app(){
  const pedido={id:'entrega-1',clienteTelefone:'11999999999',origem:'Retirada',destino:'Entrega 1',paradas:['Entrega 2'],paradasCoords:[{lat:-23.7,lon:-46.6}],origemCoord:{lat:-23.6,lon:-46.5},destinoCoord:{lat:-23.65,lon:-46.55},motoristaCoord:{lat:-23.61,lon:-46.51},motoristaAtualizadoEm:Date.now(),motoristaNome:'Motorista Teste',motoristaTelefone:'11988888888',motoristaPlaca:'ABC1D23',motoristaNotaMedia:4.9,motoristaTotalAvaliacoes:10,veiculo:'moto',status:'indo_coletar',criadoEm:Date.now(),preco:25};
  const c={console,Date,VEICULOS:{moto:{label:'Moto',veloc:30}},estado:{modo:'cliente',cliente:{telefone:'11999999999',logado:true},pedidos:[pedido],parceiro:{aberto:false},pedidoBuscandoId:'entrega-1'},render(){},window:{scrollTo(){}},document:{getElementById:()=>null},podeEditar:p=>p.status==='buscando'&&!p.editado,podeCancelar:p=>['buscando','indo_coletar'].includes(p.status)};
  for(const f of ['pinEntregaClienteHTML','fotosHTML','avaliacaoHTML','favoritoMotoristaHTML','relogioCancelamentoHTML','extrasHTML','seloPrioridadeHTML','prioridadeBoostHTML','acoesPedidoHTML'])c[f]=()=>'';
  vm.createContext(c);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const nome of ['preferenciaFavoritoAtiva','inicioBuscaNormalPedido'])vm.runInContext(html.match(new RegExp('function '+nome+'\\([^]*?\\n}\\n'))[0],c);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/pedido-visual.js'),'utf8'),c);return {c,pedido};
}
test('Acompanhamento mantém o pedido selecionado do aceite até a conclusão',()=>{const {c,pedido}=app();for(const status of ['buscando','indo_coletar','coletado','a_caminho','entregue']){pedido.status=status;assert.equal(c.efPedidoEmFoco(),pedido);}});
test('Detalhes de outra conta não abrem e logout limpa a seleção visível',()=>{const {c,pedido}=app();pedido.clienteTelefone='outro';assert.equal(c.efPedidoEmFoco(),null);c.estado.pedidoBuscandoId=null;c.efAbrirDetalhe(pedido.id);assert.equal(c.estado.pedidoBuscandoId,null);pedido.clienteTelefone=c.estado.cliente.telefone;c.estado.cliente.logado=false;assert.equal(c.efPedidoEmFoco(),null);});
test('GPS antigo, futuro ou pedido encerrado não produzem uma previsão',()=>{const {c,pedido}=app();assert.ok(c.efEstimativaPedido(pedido));pedido.motoristaAtualizadoEm=Date.now()-181000;assert.equal(c.efEstimativaPedido(pedido),null);pedido.motoristaAtualizadoEm=Date.now()+60000;assert.equal(c.efEstimativaPedido(pedido),null);pedido.motoristaAtualizadoEm=Date.now();pedido.status='entregue';assert.equal(c.efEstimativaPedido(pedido),null);});
test('Próxima entrega respeita a ordem real dos destinos e das paradas',()=>{const {c,pedido}=app();assert.equal(c.efAlvoPedido(pedido),pedido.origemCoord);pedido.status='a_caminho';pedido.paradaAtual=1;assert.equal(c.efAlvoPedido(pedido),pedido.paradasCoords[0]);const etapas=c.efEtapasPedido(pedido);assert.deepEqual(Array.from(etapas,e=>e.endereco),['Retirada','Entrega 1','Entrega 2']);assert.equal(etapas[1].feito,true);assert.equal(etapas[2].atual,true);});
test('Nenhuma nota ou foto é inventada quando o cadastro está incompleto',()=>{const {c,pedido}=app();pedido.motoristaTotalAvaliacoes=0;pedido.motoristaFotoUrl='javascript:alert(1)';const html=c.efMotoristaHTML(pedido);assert.doesNotMatch(html,/javascript:|4,9/);assert.match(html,/Sem avaliações/);});
test('Nomes, endereços e identificadores são escapados também nas ações',()=>{const {c,pedido}=app();pedido.id='x\" onclick=\"alert(1)';pedido.motoristaNome='<img src=x onerror=alert(1)>';pedido.origem='<svg onload=alert(1)>';const html=c.efDetalhePedidoHTML(pedido);assert.doesNotMatch(html,/<img src=x|<svg onload|onclick="alert/);assert.match(html,/&lt;img/);assert.match(html,/&lt;svg/);});
test('O menu conserva as regras de edição e cancelamento',()=>{const {c,pedido}=app();assert.doesNotMatch(c.efTrajetoHTML(pedido),/>Editar<\/button>/);pedido.status='buscando';assert.match(c.efTrajetoHTML(pedido),/>Editar<\/button>/);pedido.editado=true;assert.doesNotMatch(c.efTrajetoHTML(pedido),/>Editar<\/button>/);});
test('Voltar exibe o histórico de um pedido encerrado',()=>{const {c,pedido}=app();pedido.status='entregue';c.efFecharDetalhe();assert.equal(c.estado.pedidoBuscandoId,null);assert.equal(c.estado.abaPedidosCliente,'historico');});
test('Aceite pelo fluxo real preserva o foco e a tela usa o novo acompanhamento',()=>{const {c,pedido}=app();const html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const nome of ['detectarMotoristaEncontrado','telaCliente']){const source=html.match(new RegExp('function '+nome+'\\([^]*?\\n}\\n'))?.[0];assert.ok(source);vm.runInContext(source,c);}c.estado.filtroTelefoneCliente=c.estado.cliente.telefone;c.estado.statusAnterior={[pedido.id]:'buscando'};c.estado.form={};c.dispararAlertaMotorista=()=>{};c.notificar=()=>{};c.JANELA_CANCELAMENTO_MS=120000;c.detectarMotoristaEncontrado([pedido]);assert.equal(c.estado.pedidoBuscandoId,pedido.id);assert.match(c.telaCliente(),/class="ef-detalhe"/);assert.doesNotMatch(c.telaCliente(),/ef-form-entrega/);});
test('Raio e próxima ampliação seguem os limites usados na distribuição',()=>{
  const {c,pedido}=app();pedido.status='buscando';const inicio=pedido.criadoEm;
  for(const [ms,raio,etapa] of [[0,10,0],[29999,10,0],[30000,20,1],[89999,20,1],[90000,40,2],[179999,40,2],[180000,Infinity,3],[900000,Infinity,3]]){
    const busca=c.efBuscaPedido(pedido,inicio+ms);assert.equal(busca.raio,raio);assert.equal(busca.etapa,etapa);assert.equal(c.efRaioBuscaPedido(pedido,inicio+ms),raio);
  }
  assert.match(c.efBuscaPedido(pedido,inicio+29000).proxima,/20 km em 1 s/);
  assert.match(c.efBuscaPedido(pedido,inicio+30000).proxima,/40 km em 60 s/);
});
test('Favorito mantém exclusividade e a contagem geral começa ao terminar a preferência',()=>{
  const {c,pedido}=app();pedido.status='buscando';pedido.motoristaPreferidoTelefone='favorito';pedido.preferenciaExclusivaAte=pedido.criadoEm+30000;
  assert.equal(c.efBuscaPedido(pedido,pedido.criadoEm+29999).etapa,-1);
  assert.equal(c.efBuscaPedido(pedido,pedido.criadoEm+30000).raio,10);
  assert.equal(c.efBuscaPedido(pedido,pedido.criadoEm+60000).raio,20);
  assert.equal(c.efBuscaPedido(pedido,pedido.criadoEm+120000).raio,40);
});
test('Busca não depende de GPS do motorista e desaparece assim que o pedido sai da procura',()=>{
  const {c,pedido}=app();pedido.status='buscando';pedido.motoristaAtualizadoEm=0;pedido.motoristaCoord=null;
  assert.match(c.efDetalhePedidoHTML(pedido),/ef-busca-card/);assert.doesNotMatch(c.efDetalhePedidoHTML(pedido),/Aguardando localização recente/);
  for(const status of ['indo_coletar','coletado','entregue','cancelado','aguardando_pagamento']){pedido.status=status;assert.equal(c.efBuscaPedido(pedido),null);assert.doesNotMatch(c.efDetalhePedidoHTML(pedido),/id="ef-busca-card"/);}
});
test('Área geográfica aumenta em metros e radar é removido depois do aceite',()=>{
  const {c,pedido}=app();pedido.status='buscando';const removidos=[];let circulos=0,marcadores=0;
  c.requestAnimationFrame=()=>{};
  c.L={divIcon:x=>x,marker(){marcadores++;return {addTo(){return this},setLatLng(){return this}}},circle(pos,options){circulos++;return {radius:options.radius,addTo(){return this},setLatLng(){return this},setRadius(n){this.radius=n;return this}}}};
  c.mockMapa={id:pedido.id,map:{removeLayer(x){removidos.push(x)}},bounds:[]};vm.runInContext('efMapaDetalhe=mockMapa',c);
  c.efAtualizarMapaBusca(pedido,c.efBuscaPedido(pedido,pedido.criadoEm));assert.equal(c.mockMapa.buscaArea.radius,10000);
  c.efAtualizarMapaBusca(pedido,c.efBuscaPedido(pedido,pedido.criadoEm+30000));assert.equal(c.mockMapa.buscaArea.radius,20000);
  c.efAtualizarMapaBusca(pedido,c.efBuscaPedido(pedido,pedido.criadoEm+90000));assert.equal(c.mockMapa.buscaArea.radius,40000);assert.equal(circulos,1);assert.equal(marcadores,1);
  pedido.status='indo_coletar';c.efAtualizarMapaBusca(pedido,c.efBuscaPedido(pedido));assert.equal(c.mockMapa.buscaArea,null);assert.equal(c.mockMapa.buscaRadar,null);assert.equal(removidos.length,2);
});
