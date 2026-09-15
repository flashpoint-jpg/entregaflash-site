const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
let passed=0;
async function test(name,fn){await fn();passed++;console.log('OK',name);}
function ui(){
  const local=new Map();
  const ctx={console,URL,URLSearchParams,crypto,AbortController,setTimeout,clearTimeout,document:{getElementById:()=>null,querySelector:()=>null},window:{scrollTo(){}},location:{origin:'https://example.test'},navigator:{},estado:{parceiro:{aberto:true,form:{estabelecimento:'Loja de teste',responsavel:'Responsável',whatsapp:'11999999999',cidade:'São Paulo - SP',endereco:'Rua A, 10',tipoNegocio:'loja',entregasDia:'0-5',mensagem:''}},cliente:{nome:'Cliente',telefone:'11999999999',logado:true},form:{destino:''},pedidos:[]},localStorage:{getItem:k=>local.get(k),setItem:(k,v)=>local.set(k,v)},salvarLocal:(k,v)=>local.set(k,v),removerLocal:k=>local.delete(k),render(){},mostrarToast(){},extrasVazios:()=>({}),confirmarAcao:async()=>true};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'assets/empresas.js'),'utf8'),ctx);return ctx;
}
function backend({session=true,admin=false,rows={}}={}){
  let handler;const queries=[];
  const db={rpc:async(name)=>({data:name==='entrega_verificar_senha_admin'?admin:session?{ok:true,telefone:'11999999999',nome:'Teste'}:{ok:false},error:null}),from(table){
    const q={table,filters:[],op:'select',select(fields){q.fields=fields;return q;},eq(k,v){q.filters.push([k,v]);return q;},in(){return q;},order(){return q;},limit(){return q;},insert(v){q.op='insert';q.value=v;return q;},update(v){q.op='update';q.value=v;return q;},single(){return q;},maybeSingle(){return q;},then(resolve){queries.push(q);let data=rows[table]??null;if(Array.isArray(data))data=data.find(r=>q.filters.every(([k,v])=>r[k]===v))||null;return Promise.resolve({data,error:null}).then(resolve);}};return q;}};
  const ctx={createClient:()=>db,Deno:{env:{get:()=>''},serve:h=>handler=h},Response,Request,crypto,TextEncoder,Uint8Array,Date,console};
  let code=fs.readFileSync(path.join(root,'supabase/functions/empresas-portal/index.ts'),'utf8').replace(/^import .*;\n/,'');
  code=stripTypeScriptTypes(code,{mode:'transform',disableExperimentalWarning:true});vm.createContext(ctx);vm.runInContext(code,ctx);
  return {queries,call:async(body)=>{const r=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};}};
}
(async()=>{
  await test('Telefone com DDI brasileiro preserva DDD e não corta números inválidos',()=>{const c=ui();assert.equal(c.normalizarWhatsParceiro('+55 (11) 99999-9999'),'11999999999');assert.equal(c.normalizarWhatsParceiro('123456789012345'),'123456789012345');});
  await test('Dados da empresa são escapados antes de entrar no HTML',()=>{const c=ui();assert.equal(c.parceiroEsc('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');});
  await test('Repetir entrega exige propriedade, zera preço e não repete agendamento passado',async()=>{const c=ui();c.estado.pedidos=[{id:'own',clienteTelefone:'11999999999',status:'entregue'},{id:'other',clienteTelefone:'11888888888',status:'entregue'}];let calls=0;c.carregarPedidoCanceladoNoFormulario=()=>{calls++;c.estado.form={distancia:10,tipoRetirada:'agendado',horarioAgendado:'2020-01-01',origemFotoUrl:'foto'};};await c.repetirPedido('other');assert.equal(calls,0);await c.repetirPedido('own');assert.equal(calls,1);assert.equal(c.estado.form.distancia,null);assert.equal(c.estado.form.horarioAgendado,'');assert.equal(c.estado.form.tipoRetirada,'agora');assert.equal(c.estado.form.origemFotoUrl,null);});
  await test('Nova entrega empresarial preenche retirada e limpa destinos e serviços antigos',async()=>{const c=ui();c.estado.parceiro.empresa={endereco:'Rua A, 10',cidade:'São Paulo - SP'};c.estado.form={destino:'Rua antiga',paradas:['extra'],prioridade:true,prioridadeValor:20};await c.novaEntregaEmpresa();assert.equal(c.estado.form.origem,'Rua A, 10, São Paulo - SP');assert.equal(c.estado.form.destino,'');assert.equal(c.estado.form.paradas.length,0);assert.equal(c.estado.form.prioridadeValor,0);assert.equal(c.estado.form.telefone,'11999999999');});
  await test('Clique duplo no cadastro não envia duas empresas',async()=>{const c=ui();c.estado.cliente.logado=false;let calls=0,release;c.sb={from:()=>({insert:()=>{calls++;return new Promise(r=>release=r);}})};const first=c.enviarCadastroParceiro();await c.enviarCadastroParceiro();assert.equal(calls,1);release({error:null});await first;assert.equal(c.estado.parceiro.enviado,true);});
  await test('Sem sessão não é possível ler uma empresa nem criar rastreio',async()=>{const b=backend();assert.equal((await b.call({acao:'empresa'})).status,401);assert.equal((await b.call({acao:'gerar_rastreio',pedidoId:'p1'})).status,401);assert.equal(b.queries.length,0);});
  await test('Sessão expirada não consulta tabelas de parceiros',async()=>{const b=backend({session:false});assert.equal((await b.call({acao:'empresa',sessao:'11111111-1111-1111-1111-111111111111'})).status,401);assert.equal(b.queries.length,0);});
  await test('Administrador sem senha válida não lê os cadastros',async()=>{const b=backend();assert.equal((await b.call({acao:'admin_listar',senha:'incorreta'})).status,401);assert.equal(b.queries.length,0);});
  await test('Cliente não cria link para entrega de outra conta',async()=>{const b=backend({rows:{entrega_pedidos:[{id:'p1',cliente_telefone:'11888888888'}]}});const r=await b.call({acao:'gerar_rastreio',pedidoId:'p1',sessao:'11111111-1111-1111-1111-111111111111'});assert.equal(r.status,404);assert.equal(b.queries.some(q=>q.op==='insert'),false);});
  await test('Link expirado deixa de acessar o pedido',async()=>{const b=backend({rows:{entrega_rastreios_compartilhados:{pedido_id:'p1',expira_em:'2020-01-01',revogado:false}}});assert.equal((await b.call({acao:'rastrear',chave:'a'.repeat(64)})).status,404);assert.equal(b.queries.length,1);});
  await test('Rastreio não revela PIN, telefone e localização antiga do motorista',async()=>{const b=backend({rows:{entrega_rastreios_compartilhados:{pedido_id:'p1',expira_em:'2099-01-01',revogado:false},entrega_pedidos:{id:'p1',status:'a_caminho',destino:'Rua B',motorista_nome:'João Sobrenome',motorista_lat:-23,motorista_lng:-46,motorista_atualizado_em:1,pin_entrega_hash:'segredo',cliente_telefone:'11999999999'}}});const r=await b.call({acao:'rastrear',chave:'a'.repeat(64)});assert.equal(r.status,200);assert.equal(r.data.pedido.lat,null);assert.equal(r.data.pedido.motorista,'João');assert.equal('pin_entrega_hash' in r.data.pedido,false);assert.equal('cliente_telefone' in r.data.pedido,false);});
  await test('Entrega concluída não continua mostrando localização do motorista',async()=>{const b=backend({rows:{entrega_rastreios_compartilhados:{pedido_id:'p1',expira_em:'2099-01-01'},entrega_pedidos:{id:'p1',status:'entregue',motorista_lat:-23,motorista_lng:-46,motorista_atualizado_em:Date.now()}}});const r=await b.call({acao:'rastrear',chave:'b'.repeat(64)});assert.equal(r.data.pedido.lat,null);assert.equal(r.data.pedido.localizacaoAtualizadaEm,null);});
  console.log(`${passed} verificações concluídas.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
