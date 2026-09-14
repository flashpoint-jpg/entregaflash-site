// Entrega Flash — despacho progressivo agora é 100% do servidor.
// Mantido apenas por compatibilidade com instalações antigas do PWA.
(() => {
  window.enviarPushPedidoMotoristasProximos = async () => ({ enviados:0, automatico:true, servidor:true });
})();
